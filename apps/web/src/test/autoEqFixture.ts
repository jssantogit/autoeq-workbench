import {
  DEFAULT_AUTOEQ_SETTINGS,
  type AutoEqResult,
  type Filter,
  type Normalization,
  type RunManifest,
} from '@autoeq-workbench/core'

const normalization: Normalization = { anchorHz: 500, targetDb: 0 }

export function createAutoEqResult(gainDb = 3): AutoEqResult {
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
      schemaVersion: 1,
      algorithmVersion: 'standard-v1',
      profile: 'Standard',
      sampleRateHz: 48_000,
      fitPointsPerOctave: 96,
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS },
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
    },
  }
}

export function createAutoEqRunRecord(gainDb = 3): { manifest: RunManifest } {
  return { manifest: createAutoEqResult(gainDb).manifest }
}
