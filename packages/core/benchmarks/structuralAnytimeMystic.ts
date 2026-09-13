import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  calculateErrorMetrics,
  cascadeMagnitudeDb,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type Filter,
} from '../src/index.js'
import { prepareManualRegressionDesired } from './research/manualRegression.js'

const CASE_ID = 'titan-to-mystic-8' as const
const CHECKPOINTS_MS = [5_000, 15_000, 60_000] as const
const MAX_FILTERS = 10
const QUANTUM_MS = 5_000

function violationOf(value: { rmseDb: number; maxAbsDb: number }): number {
  return Math.max(value.rmseDb / 0.25, value.maxAbsDb / 0.75)
}

const prepared = prepareManualRegressionDesired(CASE_ID)
const startedAt = performance.now()
const finalDeadlineAt = startedAt + CHECKPOINTS_MS.at(-1)!
const base = resolveStructuralSearchConfig({
  preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  timeLimitSeconds: 60,
})

let incumbentFilters: Filter[] = []
let incumbent = {
  rmseDb: Number.POSITIVE_INFINITY,
  maxAbsDb: Number.POSITIVE_INFINITY,
}
let stageIndex = 0
let checkpointIndex = 0
let consecutiveNoImprovement = 0
let reseedCursor = 0
const stages = []
const checkpoints = []

function removalSeed(filters: readonly Filter[], cursor: number): {
  seed: Filter[]
  removedIndex: number | null
  removedFilterId: string | null
} {
  if (filters.length === 0) {
    return { seed: [], removedIndex: null, removedFilterId: null }
  }

  const ranked = filters.map((filter, index) => {
    const seed = filters.filter((_, candidateIndex) => candidateIndex !== index)
    const responseDb = cascadeMagnitudeDb(
      seed,
      prepared.frequenciesHz,
      MVP_NUMERIC_POLICY.sampleRateHz,
    )
    const residualDb = prepared.desiredDb.map(
      (desired, pointIndex) => desired - responseDb[pointIndex]!,
    )
    const metrics = calculateErrorMetrics(residualDb, prepared.frequenciesHz)
    return {
      index,
      filter,
      seed,
      violation: violationOf(metrics),
    }
  }).sort((left, right) =>
    left.violation - right.violation ||
    left.index - right.index
  )

  const selected = ranked[cursor % ranked.length]!
  return {
    seed: selected.seed.map((filter) => ({ ...filter })),
    removedIndex: selected.index,
    removedFilterId: selected.filter.id,
  }
}

while (performance.now() < finalDeadlineAt && checkpointIndex < CHECKPOINTS_MS.length) {
  const now = performance.now()
  const checkpointAt = startedAt + CHECKPOINTS_MS[checkpointIndex]!
  const stageDeadlineAt = Math.min(
    finalDeadlineAt,
    checkpointAt,
    now + QUANTUM_MS,
  )
  const effort = Math.min(stageIndex, 6)
  const config = {
    ...base,
    maxFilters: MAX_FILTERS,
    beamWidth: Math.min(16, base.beamWidth + effort * 2),
    proposalsPerParent: Math.min(32, base.proposalsPerParent + effort * 4),
    localPolishEvaluations: Math.min(128, base.localPolishEvaluations + effort * 16),
    workProfile: 'full' as const,
  }

  const useRemovalReseed =
    effort >= 6 &&
    consecutiveNoImprovement >= 2 &&
    incumbentFilters.length > 0
  const reseed = useRemovalReseed
    ? removalSeed(incumbentFilters, reseedCursor++)
    : {
        seed: incumbentFilters.map((filter) => ({ ...filter })),
        removedIndex: null,
        removedFilterId: null,
      }

  const stageStartedAt = performance.now()
  const candidate = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config,
    deadline: {
      isExpired: () =>
        performance.now() >= stageDeadlineAt ||
        performance.now() >= finalDeadlineAt,
    },
    seedFilters: reseed.seed,
  })
  const candidateViolation = violationOf(candidate)
  const incumbentViolationBefore = violationOf(incumbent)
  const improved = candidateViolation < incumbentViolationBefore - 1e-12

  if (improved) {
    incumbentFilters = candidate.filters.map((filter) => ({ ...filter }))
    incumbent = {
      rmseDb: candidate.rmseDb,
      maxAbsDb: candidate.maxAbsDb,
    }
    consecutiveNoImprovement = 0
  } else {
    consecutiveNoImprovement += 1
  }

  const totalElapsedMs = performance.now() - startedAt
  stages.push({
    seedStrategy: useRemovalReseed ? 'remove-one-reseed' : 'incumbent',
    removedIndex: reseed.removedIndex,
    removedFilterId: reseed.removedFilterId,
    stageIndex,
    effort,
    beamWidth: config.beamWidth,
    proposalsPerParent: config.proposalsPerParent,
    localPolishEvaluations: config.localPolishEvaluations,
    stageElapsedMs: performance.now() - stageStartedAt,
    totalElapsedMs,
    candidateFilterCount: candidate.filters.length,
    candidateViolation,
    improved,
    incumbentFilterCount: incumbentFilters.length,
    incumbentViolation: violationOf(incumbent),
  })

  while (
    checkpointIndex < CHECKPOINTS_MS.length &&
    totalElapsedMs >= CHECKPOINTS_MS[checkpointIndex]! - 5
  ) {
    checkpoints.push({
      budgetSeconds: CHECKPOINTS_MS[checkpointIndex]! / 1_000,
      observedAtMs: totalElapsedMs,
      filterCount: incumbentFilters.length,
      rmseDb: incumbent.rmseDb,
      maxAbsDb: incumbent.maxAbsDb,
      violation: violationOf(incumbent),
      completedStages: stageIndex + 1,
    })
    checkpointIndex += 1
  }

  stageIndex += 1
}

console.log(JSON.stringify({
  caseId: CASE_ID,
  maxFilters: MAX_FILTERS,
  checkpoints,
  strictImprovementAcrossCheckpoints: checkpoints.every(
    (cell, index) => index === 0 ||
      cell.violation < checkpoints[index - 1]!.violation - 1e-9,
  ),
  nonWorseningAcrossCheckpoints: checkpoints.every(
    (cell, index) => index === 0 ||
      cell.violation <= checkpoints[index - 1]!.violation + 1e-9,
  ),
  stages,
}, null, 2))
