export const RESEARCH_ARTIFACT_SCHEMA_VERSION = 2 as const

export interface ResearchProvenanceV2 {
  schemaVersion: 2
  repositorySha: string
  algorithmId: string
  algorithmVersion: string
  configurationId: string
  seed: number | null
  corpusVersion: string
  caseInputSha256: string
  nodeVersion: string
  pythonVersion: string | null
  runnerLabel: string | null
  timeBudgetSeconds: number
  maxFilters: number
}

export interface ResearchTrajectoryPointV2 {
  elapsedMs: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  sourceSolutionKey: string | null
}

export function assertResearchProvenanceV2(value: ResearchProvenanceV2): void {
  const textFields = [
    'repositorySha',
    'algorithmId',
    'algorithmVersion',
    'configurationId',
    'corpusVersion',
    'caseInputSha256',
    'nodeVersion',
  ] as const
  if (value.schemaVersion !== RESEARCH_ARTIFACT_SCHEMA_VERSION) {
    throw new Error('Research provenance must use schema version 2')
  }
  for (const field of textFields) {
    if (value[field].trim().length === 0) throw new Error(`Research provenance ${field} is required`)
  }
  if (value.seed !== null && !Number.isSafeInteger(value.seed)) {
    throw new Error('Research provenance seed must be an integer or null')
  }
  if (!Number.isFinite(value.timeBudgetSeconds) || value.timeBudgetSeconds <= 0) {
    throw new Error('Research provenance timeBudgetSeconds must be positive')
  }
  if (!Number.isSafeInteger(value.maxFilters) || value.maxFilters <= 0) {
    throw new Error('Research provenance maxFilters must be a positive integer')
  }
}

export function normalizeBestSoFarTrajectory(
  points: readonly ResearchTrajectoryPointV2[],
): ResearchTrajectoryPointV2[] {
  const ordered = points.map((point) => ({ ...point })).sort((left, right) => left.elapsedMs - right.elapsedMs)
  const normalized: ResearchTrajectoryPointV2[] = []
  for (const point of ordered) {
    if (normalized.at(-1)?.elapsedMs === point.elapsedMs) {
      normalized[normalized.length - 1] = point
    } else {
      normalized.push(point)
    }
  }
  return normalized
}
