import {
  DEFAULT_AUTOEQ_SETTINGS,
  DEFAULT_AUTOEQ_SETTINGS_V1,
  STANDARD_V2_CONFIG,
  type AutoEqResultV1,
  type AutoEqResultV2,
  type Filter,
  type Normalization,
  type RunManifestV1,
  type RunManifestV2,
} from '@autoeq-workbench/core'

const normalization: Normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 }

export function createAutoEqResult(
  gainDb = 3,
  manifestOverrides: Partial<RunManifestV1> = {},
): AutoEqResultV1 {
  const filters: Filter[] = [
    { id: 'autoeq-1', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb, q: 1 },
  ]
  const metrics = { maeDb: 0.2, rmseDb: 0.3, maxAbsDb: 0.5, maxAbsFrequencyHz: 1_000 }
  const cancellationAudit = { pairs: [], totalScore: 0 }
  const preampDb = -gainDb
  return {
    filters,
    metrics,
    preampDb,
    cancellationAudit,
    manifest: {
      schemaVersion: 2,
      algorithmVersion: 'standard-v1',
      profile: 'Standard',
      sampleRateHz: 48_000,
      fitPointsPerOctave: 96,
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS_V1 },
      normalization: { ...normalization },
      sourceName: 'Source',
      targetName: 'Target',
      algorithmParameters: {
        deadbandDb: 0.1,
        huberDeltaDb: 1,
        candidateThresholdDb: 0.5,
        minObjectiveImprovement: 0.005,
        pruneTolerance: 0.002,
        filterCountWeight: 0.01,
        highQWeight: 0.002,
        gainWeight: 0.0005,
        cancellationWeight: 0.01,
      },
      finalFilters: filters.map((filter) => ({ ...filter })),
      metrics: { ...metrics },
      preampDb,
      cancellationAudit: { ...cancellationAudit, pairs: [] },
      ...manifestOverrides,
    },
  }
}

export function createAutoEqResultV2(
  gainDb = 3,
  manifestOverrides: Partial<RunManifestV2> = {},
): AutoEqResultV2 {
  const filters: Filter[] = [
    { id: 'autoeq-1', enabled: true, type: 'PK', frequencyHz: 1_000, gainDb, q: 1 },
  ]
  const metrics = manifestOverrides.metrics ?? {
    maeDb: 0.1,
    rmseDb: 0.2,
    maxAbsDb: 0.5,
    maxAbsFrequencyHz: 1_000,
  }
  const cancellationAudit = { pairs: [], totalScore: 0 }
  const preampDb = -gainDb
  const targetAchieved = metrics.rmseDb <= 0.25 && metrics.maxAbsDb <= 0.75
  const manifest: RunManifestV2 = {
    schemaVersion: 3,
    algorithmVersion: 'standard-v2',
    profile: 'Standard',
    sampleRateHz: 48_000,
    fitPointsPerOctave: 96,
    autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
    normalization: { ...normalization },
    sourceName: 'Source',
    targetName: 'Target',
    algorithmParameters: { ...STANDARD_V2_CONFIG.algorithm },
    finalFilters: filters.map((filter) => ({ ...filter })),
    metrics: { ...metrics },
    preampDb,
    cancellationAudit: { ...cancellationAudit, pairs: [] },
    terminationReason: targetAchieved ? 'target-reached' : 'converged',
    targetAchieved,
    ...manifestOverrides,
  }
  return {
    filters,
    metrics: manifest.metrics,
    preampDb: manifest.preampDb,
    cancellationAudit: manifest.cancellationAudit,
    manifest,
  }
}

export function createAutoEqRunRecord(gainDb = 3): { manifest: RunManifestV1 } {
  return { manifest: createAutoEqResult(gainDb).manifest }
}
