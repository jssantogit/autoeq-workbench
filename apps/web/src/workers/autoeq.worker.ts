import {
  CoreError,
  MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
  auditCancellations,
  calculateErrorMetrics,
  calculatePreampDb,
  cascadeMagnitudeDb,
  createEvaluationGrid,
  createStandardV2Deadline,
  desiredCorrection,
  isV2TargetAchieved,
  prepareCurve,
  resolveStandardAutoEqV2Config,
  resolveStructuralSearchConfig,
  runStandardAutoEqV2,
  runStructuralSearch,
  type AutoEqResultV2,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'

import {
  EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE,
  isExperimentalStructuralAutoEqEligible,
  type AutoEqExecutionMode,
  type AutoEqPublicError,
  type AutoEqWorkerMessage,
  type AutoEqWorkerRequest,
} from './autoeqClient'

interface WorkerScope {
  onmessage: ((event: MessageEvent<AutoEqWorkerRequest>) => void) | null
  postMessage(message: AutoEqWorkerMessage): void
}

const workerScope = self as unknown as WorkerScope

export function sanitizeAutoEqError(cause: unknown): AutoEqPublicError {
  if (
    cause instanceof CoreError &&
    (cause.category === 'validation' ||
      cause.category === 'optimization' ||
      cause.category === 'numeric')
  ) {
    return { category: cause.category, message: cause.message }
  }
  return { category: 'optimization', message: 'AutoEQ optimization failed.' }
}

interface ExperimentalStructuralManifestMarker {
  preset: typeof MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET
  seedMode: 'zero-start'
}

type ExperimentalAutoEqResultV2 = AutoEqResultV2 & {
  manifest: AutoEqResultV2['manifest'] & {
    experimentalStructuralSearch: ExperimentalStructuralManifestMarker
  }
}

export function runExperimentalStructuralAutoEqWorkerInput(
  input: StandardAutoEqInputV2,
): ExperimentalAutoEqResultV2 {
  if (
    input === null || typeof input !== 'object' ||
    input.source === null || typeof input.source !== 'object' ||
    input.target === null || typeof input.target !== 'object'
  ) {
    throw new CoreError('validation', 'AutoEQ run input is incomplete')
  }
  if (input.source.kind !== 'fr' || input.target.kind !== 'target') {
    throw new CoreError('validation', 'AutoEQ requires an FR source and Target curve')
  }

  const standardConfig = resolveStandardAutoEqV2Config(input.settings)
  if (!isExperimentalStructuralAutoEqEligible(input.settings)) {
    throw new CoreError(
      'validation',
      'Experimental Max10 structural search requires default frequency/gain/Q bounds and maxFilters=10.',
    )
  }

  const canonicalFrequencies = createEvaluationGrid()
  const source = prepareCurve(input.source, input.normalization, canonicalFrequencies)
  const target = prepareCurve(input.target, input.normalization, canonicalFrequencies)
  const canonicalDesiredDb = desiredCorrection(source.db, target.db)
  const frequencies: number[] = []
  const desiredDb: number[] = []
  for (let index = 0; index < canonicalFrequencies.length; index += 1) {
    const frequencyHz = canonicalFrequencies[index]!
    if (
      frequencyHz >= standardConfig.minFrequencyHz &&
      frequencyHz <= standardConfig.maxFrequencyHz
    ) {
      frequencies.push(frequencyHz)
      desiredDb.push(canonicalDesiredDb[index]!)
    }
  }

  const deadline = createStandardV2Deadline(
    { nowMs: () => performance.now() },
    input.settings.timeLimitSeconds,
  )
  const structuralResult = runStructuralSearch({
    desiredDb,
    frequencies,
    sampleRateHz: standardConfig.sampleRateHz,
    config: resolveStructuralSearchConfig({
      preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    }),
    deadline,
    seedFilters: [],
  })
  const expiredAtSearchEnd = deadline.isExpired()

  const cascadeDb = cascadeMagnitudeDb(
    structuralResult.filters,
    frequencies,
    standardConfig.sampleRateHz,
  )
  const residualDb = desiredDb.map((desired, index) => desired - cascadeDb[index]!)
  const metrics = calculateErrorMetrics(residualDb, frequencies)
  const cancellationAudit = auditCancellations(
    structuralResult.filters,
    frequencies,
    standardConfig.sampleRateHz,
  )
  const preampDb = calculatePreampDb(
    structuralResult.filters,
    standardConfig.sampleRateHz,
  ).preampDb
  const targetAchieved = isV2TargetAchieved(metrics)
  const terminationReason = targetAchieved
    ? 'target-reached'
    : expiredAtSearchEnd
      ? 'time-limit'
      : 'converged'

  const finalFilters = structuralResult.filters.map((filter) => ({ ...filter }))
  return {
    filters: finalFilters,
    metrics,
    preampDb,
    cancellationAudit,
    manifest: {
      schemaVersion: 3,
      algorithmVersion: 'standard-v2',
      profile: 'Standard',
      sampleRateHz: standardConfig.sampleRateHz,
      fitPointsPerOctave: standardConfig.fitPointsPerOctave,
      autoeqSettings: { ...input.settings },
      normalization: { ...input.normalization },
      sourceName: input.source.name,
      targetName: input.target.name,
      algorithmParameters: { ...standardConfig.algorithm },
      finalFilters: finalFilters.map((filter) => ({ ...filter })),
      metrics: { ...metrics },
      preampDb,
      cancellationAudit: {
        pairs: cancellationAudit.pairs.map((pair) => ({ ...pair })),
        totalScore: cancellationAudit.totalScore,
      },
      terminationReason,
      targetAchieved,
      experimentalStructuralSearch: {
        preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
        seedMode: 'zero-start',
      },
    },
  }
}

export function runAutoEqWorkerInput(
  input: StandardAutoEqInputV2,
  mode: AutoEqExecutionMode = 'standard',
): AutoEqResultV2 {
  return mode === EXPERIMENTAL_STRUCTURAL_AUTOEQ_MODE
    ? runExperimentalStructuralAutoEqWorkerInput(input)
    : runStandardAutoEqV2(input)
}

workerScope.onmessage = ({ data }) => {
  if (data.type !== 'run') return

  try {
    workerScope.postMessage({
      type: 'result',
      runId: data.runId,
      result: runAutoEqWorkerInput(data.input, data.mode ?? 'standard'),
    })
  } catch (cause) {
    workerScope.postMessage({ type: 'error', runId: data.runId, error: sanitizeAutoEqError(cause) })
  }
}
