import { performance } from 'node:perf_hooks'

import {
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  MVP_NUMERIC_POLICY,
  resolveStructuralSearchConfig,
  runStructuralSearch,
  type StructuralSearchTraceEvent,
} from '../src/index.js'
import {
  loadManualRegressionCases,
  prepareManualRegressionDesired,
} from './research/manualRegression.js'

const BUDGET_MS = 60_000
const MAX_FILTERS = 10

const rows = []

for (const regressionCase of loadManualRegressionCases()) {
  const prepared = prepareManualRegressionDesired(regressionCase.id)
  const startedAt = performance.now()
  const deadlineAt = startedAt + BUDGET_MS
  const timeline: Array<StructuralSearchTraceEvent & { elapsedMs: number }> = []

  const result = runStructuralSearch({
    desiredDb: prepared.desiredDb,
    frequencies: prepared.frequenciesHz,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    config: {
      ...resolveStructuralSearchConfig({
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        timeLimitSeconds: 60,
      }),
      maxFilters: MAX_FILTERS,
    },
    deadline: { isExpired: () => performance.now() >= deadlineAt },
    seedFilters: [],
    onTrace: (event) => {
      timeline.push({
        ...event,
        elapsedMs: performance.now() - startedAt,
      })
    },
  })

  const elapsedMs = performance.now() - startedAt
  const beamGenerations = timeline.filter((event) => event.type === 'beam-generation')
  const beamStop = timeline.findLast((event) => event.type === 'beam-stop')
  const rescueEnd = timeline.findLast(
    (event) => event.type === 'phase' && event.phase === 'rescue' && event.status === 'end',
  )
  const capSwapEnd = timeline.findLast(
    (event) => event.type === 'phase' && event.phase === 'cap-swap' && event.status === 'end',
  )

  rows.push({
    caseId: regressionCase.id,
    elapsedMs,
    budgetUtilization: elapsedMs / BUDGET_MS,
    final: {
      filterCount: result.filters.length,
      rmseDb: result.rmseDb,
      maxAbsDb: result.maxAbsDb,
      violation: Math.max(result.rmseDb / 0.25, result.maxAbsDb / 0.75),
    },
    beam: {
      generations: beamGenerations.length,
      stopReason: beamStop?.reason ?? null,
      totalGeneratedProposals: beamGenerations.reduce(
        (sum, event) => sum + (event.generatedProposals ?? 0),
        0,
      ),
      totalAdmittedProposals: beamGenerations.reduce(
        (sum, event) => sum + (event.admittedProposals ?? 0),
        0,
      ),
      totalPolishedProposals: beamGenerations.reduce(
        (sum, event) => sum + (event.polishedProposals ?? 0),
        0,
      ),
      duplicateStates: beamGenerations.reduce(
        (sum, event) => sum + (event.duplicateStates ?? 0),
        0,
      ),
      lastGeneration: beamGenerations.at(-1) ?? null,
    },
    rescue: {
      acceptedSteps: rescueEnd?.acceptedSteps ?? 0,
      endElapsedMs: rescueEnd?.elapsedMs ?? null,
      filterCount: rescueEnd?.filterCount ?? null,
      violation: rescueEnd?.violation ?? null,
    },
    capSwap: {
      acceptedSteps: capSwapEnd?.acceptedSteps ?? 0,
      endElapsedMs: capSwapEnd?.elapsedMs ?? null,
      filterCount: capSwapEnd?.filterCount ?? null,
      violation: capSwapEnd?.violation ?? null,
    },
    timeline,
  })
}

console.log(JSON.stringify({
  configuration: {
    maxFilters: MAX_FILTERS,
    budgetSeconds: BUDGET_MS / 1000,
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  },
  rows,
}, null, 2))
