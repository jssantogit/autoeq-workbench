import { performance } from 'node:perf_hooks'

import {
  DEFAULT_AUTOEQ_SETTINGS,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  evaluateV2Solution,
  generateV2Candidates,
  rankV2CandidateShortlist,
  resolveStandardAutoEqV2Config,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type Filter,
} from '../src/index.js'
import { polishFilters } from '../src/autoeq/v2/structuralSearch.js'
import { prepareManualRegressionDesired } from './research/manualRegression.js'

const CASE_ID = 'titan-to-mystic-8'
const MAX_FILTERS = 10
const SHORTLIST_SIZE = 16
const ORACLE_BUDGET_MS = 45_000

const prepared = prepareManualRegressionDesired(CASE_ID)
const config = {
  ...resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: 60,
  }),
  maxFilters: MAX_FILTERS,
}
const bounds = resolveStandardAutoEqV2Config({
  ...DEFAULT_AUTOEQ_SETTINGS,
  maxFilters: MAX_FILTERS,
})

const baselineDeadlineAt = performance.now() + 20_000
const baseline = runStructuralSearch({
  desiredDb: prepared.desiredDb,
  frequencies: prepared.frequenciesHz,
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  config,
  deadline: { isExpired: () => performance.now() >= baselineDeadlineAt },
  seedFilters: [],
})

const incumbent = evaluateV2Solution(
  baseline.filters,
  prepared.desiredDb,
  prepared.frequenciesHz,
  MVP_NUMERIC_POLICY.sampleRateHz,
)
const incumbentViolation = Math.max(
  incumbent.metrics.rmseDb / 0.25,
  incumbent.metrics.maxAbsDb / 0.75,
)

const shortlist = rankV2CandidateShortlist(
  generateV2Candidates({
    frequencies: prepared.frequenciesHz,
    residualDb: incumbent.residualDb,
    config: bounds,
    boundaryMode: 'mixed',
  }).filter((candidate) => candidate.type === 'PK'),
).slice(0, SHORTLIST_SIZE)

const deadlineAt = performance.now() + ORACLE_BUDGET_MS
let evaluatedPairs = 0
let bestPareto: null | {
  violation: number
  rmseDb: number
  maxAbsDb: number
  leftRank: number
  rightRank: number
  filters: Filter[]
} = null
let bestViolationOnly: typeof bestPareto = null

for (let leftRank = 0; leftRank < shortlist.length; leftRank += 1) {
  const left = shortlist[leftRank]!
  for (let rightRank = leftRank + 1; rightRank < shortlist.length; rightRank += 1) {
    if (performance.now() >= deadlineAt) break
    const right = shortlist[rightRank]!
    const seeded: Filter[] = [
      ...baseline.filters.map((filter) => ({ ...filter })),
      {
        id: `oracle-pair-${leftRank}-a`,
        enabled: true,
        type: 'PK',
        frequencyHz: left.frequencyHz,
        gainDb: left.gainDb,
        q: left.q,
      },
      {
        id: `oracle-pair-${rightRank}-b`,
        enabled: true,
        type: 'PK',
        frequencyHz: right.frequencyHz,
        gainDb: right.gainDb,
        q: right.q,
      },
    ]
    if (seeded.length > MAX_FILTERS) continue

    const polished = polishFilters(
      seeded,
      Math.max(config.localPolishEvaluations, seeded.length * 24),
      bounds,
      prepared.desiredDb,
      prepared.frequenciesHz,
      { isExpired: () => performance.now() >= deadlineAt },
      MVP_NUMERIC_POLICY.sampleRateHz,
    )
    evaluatedPairs += 1

    const violation = Math.max(polished.rmseDb / 0.25, polished.maxAbsDb / 0.75)
    const improvesViolation = violation < incumbentViolation - 1e-12
    const paretoImproves =
      polished.rmseDb <= incumbent.metrics.rmseDb + 1e-12 &&
      polished.maxAbsDb <= incumbent.metrics.maxAbsDb + 1e-12 &&
      (
        polished.rmseDb < incumbent.metrics.rmseDb - 1e-12 ||
        polished.maxAbsDb < incumbent.metrics.maxAbsDb - 1e-12
      )

    if (improvesViolation && (
      bestViolationOnly === null ||
      violation < bestViolationOnly.violation
    )) {
      bestViolationOnly = {
        violation,
        rmseDb: polished.rmseDb,
        maxAbsDb: polished.maxAbsDb,
        leftRank,
        rightRank,
        filters: polished.filters,
      }
    }

    if (paretoImproves && (
      bestPareto === null ||
      violation < bestPareto.violation
    )) {
      bestPareto = {
        violation,
        rmseDb: polished.rmseDb,
        maxAbsDb: polished.maxAbsDb,
        leftRank,
        rightRank,
        filters: polished.filters,
      }
    }
  }
  if (performance.now() >= deadlineAt) break
}

console.log(JSON.stringify({
  caseId: CASE_ID,
  incumbent: {
    filterCount: baseline.filters.length,
    rmseDb: incumbent.metrics.rmseDb,
    maxAbsDb: incumbent.metrics.maxAbsDb,
    violation: incumbentViolation,
  },
  shortlistSize: shortlist.length,
  evaluatedPairs,
  oracleDeadlineExpired: performance.now() >= deadlineAt,
  bestPareto,
  bestViolationOnly,
}, null, 2))
