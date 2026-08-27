import {
  AUTOEQ_PRODUCT_LIMITS,
  isValidAutoEqSettings,
  MVP_NUMERIC_POLICY,
  type AutoEqSettings,
  type Curve,
  type CurvePoint,
  type Filter,
  type Normalization,
  type RunManifest,
} from '@autoeq-workbench/core'
import type { StoreApi } from 'zustand/vanilla'

import { cloneAutoEqRunRecord, type AutoEqRunRecord } from '../state/autoEqRun'
import { cancelAutoEq } from '../state/autoeqController'
import { autoEqRunStore, type AutoEqRunState } from '../state/autoeqRunStore'
import { eqCompareStore, type EqCompareState } from '../state/eqCompareStore'
import {
  workspaceStore,
  type FilterProvenance,
  type SolutionState,
  type WorkspaceState,
} from '../state/workspaceStore'

export const WORKBENCH_SESSION_SCHEMA_VERSION = 1 as const

declare const ValidatedSessionBrand: unique symbol

export type DeepReadonly<T> = T extends (...args: readonly unknown[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

export interface WorkbenchSessionV1 {
  schemaVersion: 1
  curves: Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
  autoEqRun: AutoEqRunRecord | null
}

export type ValidatedWorkbenchSessionV1 = DeepReadonly<WorkbenchSessionV1> & {
  readonly [ValidatedSessionBrand]: true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Object.isFrozen(obj)) {
    return obj
  }
  Object.freeze(obj)
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key]
    if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
      deepFreeze(value)
    }
  }
  return obj
}

function hasFiniteFields(value: unknown, fields: readonly string[]): boolean {
  return isRecord(value) && fields.every((field) => Number.isFinite((value as Record<string, unknown>)[field]))
}

export function cloneCurvePoint(point: DeepReadonly<CurvePoint> | CurvePoint): CurvePoint {
  return {
    frequencyHz: point.frequencyHz,
    db: point.db,
  }
}

export function cloneCurveMetadata(
  metadata:
    | DeepReadonly<Record<string, string | number | boolean>>
    | Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const cloned: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(metadata)) {
    cloned[key] = value
  }
  return cloned
}

export function cloneCurve(curve: DeepReadonly<Curve> | Curve): Curve {
  return {
    id: curve.id,
    name: curve.name,
    kind: curve.kind,
    rawPoints: curve.rawPoints.map(cloneCurvePoint),
    metadata: cloneCurveMetadata(curve.metadata),
  }
}

export function cloneFilter(filter: DeepReadonly<Filter> | Filter): Filter {
  return {
    id: filter.id,
    enabled: filter.enabled,
    type: filter.type,
    frequencyHz: filter.frequencyHz,
    gainDb: filter.gainDb,
    q: filter.q,
  }
}

function isValidPoint(point: unknown): point is CurvePoint {
  if (!isRecord(point)) return false
  return (
    Number.isFinite(point.frequencyHz) &&
    (point.frequencyHz as number) > 0 &&
    Number.isFinite(point.db)
  )
}

function isValidCurveMetadata(
  metadata: unknown,
): metadata is Record<string, string | number | boolean> {
  if (!isPlainObject(metadata)) return false
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof key !== 'string') return false
    if (typeof value === 'string' || typeof value === 'boolean') {
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      continue
    }
    return false
  }
  return true
}

function isValidCurve(curve: unknown): curve is Curve {
  if (!isRecord(curve)) return false
  if (typeof curve.id !== 'string' || curve.id.trim().length === 0) return false
  if (typeof curve.name !== 'string' || curve.name.trim().length === 0) return false
  if (curve.kind !== 'fr' && curve.kind !== 'target') return false
  if (!Array.isArray(curve.rawPoints) || curve.rawPoints.length < 2) return false

  let lastFreq = 0
  for (const point of curve.rawPoints) {
    if (!isValidPoint(point)) return false
    if (point.frequencyHz <= lastFreq) return false
    lastFreq = point.frequencyHz
  }

  if (!isValidCurveMetadata(curve.metadata)) return false
  return true
}

function isValidNormalization(normalization: unknown): normalization is Normalization {
  if (!isRecord(normalization)) return false
  return (
    (normalization.mode === 'hz' || normalization.mode === 'db') &&
    Number.isFinite(normalization.frequencyHz) &&
    (normalization.frequencyHz as number) >= MVP_NUMERIC_POLICY.minFrequencyHz &&
    (normalization.frequencyHz as number) <= MVP_NUMERIC_POLICY.maxFrequencyHz &&
    Number.isFinite(normalization.levelDb) &&
    (normalization.levelDb as number) >= 0 &&
    (normalization.levelDb as number) <= 100
  )
}

function isValidFilter(filter: unknown): filter is Filter {
  if (!isRecord(filter)) return false
  return (
    typeof filter.id === 'string' &&
    filter.id.trim().length > 0 &&
    typeof filter.enabled === 'boolean' &&
    (filter.type === 'PK' || filter.type === 'LS' || filter.type === 'HS') &&
    Number.isFinite(filter.frequencyHz) &&
    (filter.frequencyHz as number) >= MVP_NUMERIC_POLICY.minFrequencyHz &&
    (filter.frequencyHz as number) <= MVP_NUMERIC_POLICY.maxFrequencyHz &&
    Number.isFinite(filter.gainDb) &&
    (filter.gainDb as number) >= AUTOEQ_PRODUCT_LIMITS.minGainDb &&
    (filter.gainDb as number) <= AUTOEQ_PRODUCT_LIMITS.maxGainDb &&
    Number.isFinite(filter.q) &&
    (filter.q as number) >= AUTOEQ_PRODUCT_LIMITS.minQ &&
    (filter.q as number) <= AUTOEQ_PRODUCT_LIMITS.maxQ
  )
}

function isValidSettings(settings: unknown): settings is AutoEqSettings {
  return isRecord(settings) && isValidAutoEqSettings(settings as unknown as AutoEqSettings)
}

function isValidRunManifest(manifest: unknown): manifest is RunManifest {
  if (!isRecord(manifest)) return false
  const algorithmParametersAreFinite = hasFiniteFields(manifest.algorithmParameters, [
    'deadbandDb',
    'huberDeltaDb',
    'candidateThresholdDb',
    'minObjectiveImprovement',
    'pruneTolerance',
    'filterCountWeight',
    'highQWeight',
    'gainWeight',
    'cancellationWeight',
  ])

  const auditIsValid =
    isRecord(manifest.cancellationAudit) &&
    Number.isFinite(manifest.cancellationAudit.totalScore) &&
    Array.isArray(manifest.cancellationAudit.pairs) &&
    manifest.cancellationAudit.pairs.every(
      (pair: unknown) =>
        isRecord(pair) &&
        typeof pair.filterAId === 'string' &&
        typeof pair.filterBId === 'string' &&
        Number.isFinite(pair.score) &&
        (pair.severity === 'moderate' || pair.severity === 'strong'),
    )

  return (
    manifest.schemaVersion === 2 &&
    manifest.algorithmVersion === 'standard-v1' &&
    manifest.profile === 'Standard' &&
    Number.isFinite(manifest.sampleRateHz) &&
    (manifest.sampleRateHz as number) > 0 &&
    Number.isInteger(manifest.fitPointsPerOctave) &&
    (manifest.fitPointsPerOctave as number) > 0 &&
    isValidSettings(manifest.autoeqSettings) &&
    isValidNormalization(manifest.normalization) &&
    typeof manifest.sourceName === 'string' &&
    typeof manifest.targetName === 'string' &&
    algorithmParametersAreFinite &&
    Array.isArray(manifest.finalFilters) &&
    manifest.finalFilters.length <= AUTOEQ_PRODUCT_LIMITS.hardMaxFilters &&
    manifest.finalFilters.every(isValidFilter) &&
    new Set(manifest.finalFilters.map(({ id }) => id)).size === manifest.finalFilters.length &&
    hasFiniteFields(manifest.metrics, [
      'maeDb',
      'rmseDb',
      'maxAbsDb',
      'maxAbsFrequencyHz',
    ]) &&
    Number.isFinite(manifest.preampDb) &&
    auditIsValid
  )
}

function canonicalizeRunManifest(
  manifest: DeepReadonly<RunManifest> | RunManifest,
): RunManifest {
  return {
    schemaVersion: 2,
    algorithmVersion: 'standard-v1',
    profile: 'Standard',
    sampleRateHz: manifest.sampleRateHz,
    fitPointsPerOctave: manifest.fitPointsPerOctave,
    autoeqSettings: {
      minFrequencyHz: manifest.autoeqSettings.minFrequencyHz,
      maxFrequencyHz: manifest.autoeqSettings.maxFrequencyHz,
      minGainDb: manifest.autoeqSettings.minGainDb,
      maxGainDb: manifest.autoeqSettings.maxGainDb,
      minQ: manifest.autoeqSettings.minQ,
      maxQ: manifest.autoeqSettings.maxQ,
      maxFilters: manifest.autoeqSettings.maxFilters,
    },
    normalization: {
      mode: manifest.normalization.mode,
      frequencyHz: manifest.normalization.frequencyHz,
      levelDb: manifest.normalization.levelDb,
    },
    sourceName: manifest.sourceName,
    targetName: manifest.targetName,
    algorithmParameters: {
      deadbandDb: manifest.algorithmParameters.deadbandDb,
      huberDeltaDb: manifest.algorithmParameters.huberDeltaDb,
      candidateThresholdDb: manifest.algorithmParameters.candidateThresholdDb,
      minObjectiveImprovement: manifest.algorithmParameters.minObjectiveImprovement,
      pruneTolerance: manifest.algorithmParameters.pruneTolerance,
      filterCountWeight: manifest.algorithmParameters.filterCountWeight,
      highQWeight: manifest.algorithmParameters.highQWeight,
      gainWeight: manifest.algorithmParameters.gainWeight,
      cancellationWeight: manifest.algorithmParameters.cancellationWeight,
    },
    finalFilters: manifest.finalFilters.map(cloneFilter),
    metrics: {
      maeDb: manifest.metrics.maeDb,
      rmseDb: manifest.metrics.rmseDb,
      maxAbsDb: manifest.metrics.maxAbsDb,
      maxAbsFrequencyHz: manifest.metrics.maxAbsFrequencyHz,
    },
    preampDb: manifest.preampDb,
    cancellationAudit: {
      pairs: manifest.cancellationAudit.pairs.map((pair) => ({
        filterAId: pair.filterAId,
        filterBId: pair.filterBId,
        score: pair.score,
        severity: pair.severity,
      })),
      totalScore: manifest.cancellationAudit.totalScore,
    },
  }
}

function areNormalizationsEqual(left: Normalization, right: Normalization): boolean {
  return (
    left.mode === right.mode &&
    left.frequencyHz === right.frequencyHz &&
    left.levelDb === right.levelDb
  )
}

function areAutoEqSettingsEqual(left: AutoEqSettings, right: AutoEqSettings): boolean {
  return (
    left.minFrequencyHz === right.minFrequencyHz &&
    left.maxFrequencyHz === right.maxFrequencyHz &&
    left.minGainDb === right.minGainDb &&
    left.maxGainDb === right.maxGainDb &&
    left.minQ === right.minQ &&
    left.maxQ === right.maxQ &&
    left.maxFilters === right.maxFilters
  )
}

function areFiltersEqual(
  left: readonly (DeepReadonly<Filter> | Filter)[],
  right: readonly (DeepReadonly<Filter> | Filter)[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((filter, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      filter.id === other.id &&
      filter.enabled === other.enabled &&
      filter.type === other.type &&
      filter.frequencyHz === other.frequencyHz &&
      filter.gainDb === other.gainDb &&
      filter.q === other.q
    )
  })
}

export function validateWorkbenchSession(input: unknown): ValidatedWorkbenchSessionV1 {
  if (!isRecord(input)) {
    throw new Error('Invalid Workbench session: expected JSON object.')
  }

  if (input.schemaVersion !== WORKBENCH_SESSION_SCHEMA_VERSION) {
    throw new Error('Invalid Workbench session: unsupported schema version.')
  }

  if (!Array.isArray(input.curves)) {
    throw new Error('Invalid Workbench session: curves must be an array.')
  }

  for (const curve of input.curves) {
    if (!isValidCurve(curve)) {
      throw new Error('Invalid Workbench session: malformed curve definition.')
    }
  }

  const curveIds = new Set(input.curves.map((c: Curve) => c.id))
  if (curveIds.size !== input.curves.length) {
    throw new Error('Invalid Workbench session: duplicate curve IDs found.')
  }

  let activeFr: Curve | null = null
  if (input.activeFrId !== null) {
    if (typeof input.activeFrId !== 'string') {
      throw new Error('Invalid Workbench session: activeFrId must be string or null.')
    }
    const matchingFr = input.curves.find((c: Curve) => c.id === input.activeFrId)
    if (!matchingFr || matchingFr.kind !== 'fr') {
      throw new Error('Invalid Workbench session: activeFrId must reference an FR curve.')
    }
    activeFr = matchingFr
  }

  let activeTarget: Curve | null = null
  if (input.activeTargetId !== null) {
    if (typeof input.activeTargetId !== 'string') {
      throw new Error('Invalid Workbench session: activeTargetId must be string or null.')
    }
    const matchingTarget = input.curves.find((c: Curve) => c.id === input.activeTargetId)
    if (!matchingTarget || matchingTarget.kind !== 'target') {
      throw new Error('Invalid Workbench session: activeTargetId must reference a Target curve.')
    }
    activeTarget = matchingTarget
  }

  if (!isValidNormalization(input.normalization)) {
    throw new Error('Invalid Workbench session: invalid normalization parameters.')
  }

  if (!isValidSettings(input.autoeqSettings)) {
    throw new Error('Invalid Workbench session: invalid AutoEQ settings.')
  }

  if (!Array.isArray(input.filters)) {
    throw new Error('Invalid Workbench session: filters must be an array.')
  }

  if (input.filters.length > AUTOEQ_PRODUCT_LIMITS.hardMaxFilters) {
    throw new Error('Invalid Workbench session: filter count exceeds maximum limit.')
  }

  for (const filter of input.filters) {
    if (!isValidFilter(filter)) {
      throw new Error('Invalid Workbench session: malformed filter definition.')
    }
  }

  const filterIds = new Set(input.filters.map((f: Filter) => f.id))
  if (filterIds.size !== input.filters.length) {
    throw new Error('Invalid Workbench session: duplicate filter IDs found.')
  }

  const provenance = input.filterProvenance
  if (provenance !== null && provenance !== 'manual' && provenance !== 'autoeq') {
    throw new Error('Invalid Workbench session: invalid filter provenance.')
  }

  const solutionState = input.solutionState
  if (solutionState !== 'clean' && solutionState !== 'modified' && solutionState !== 'stale') {
    throw new Error('Invalid Workbench session: invalid solution state.')
  }

  let autoEqRun: AutoEqRunRecord | null = null
  if (input.autoEqRun !== null) {
    if (!isRecord(input.autoEqRun) || !isValidRunManifest(input.autoEqRun.manifest)) {
      throw new Error('Invalid Workbench session: invalid AutoEQ run record or manifest.')
    }
    autoEqRun = { manifest: canonicalizeRunManifest(input.autoEqRun.manifest) }
  }

  if (provenance === null) {
    if (input.filters.length > 0) {
      throw new Error('Invalid Workbench session: null provenance cannot contain filters.')
    }
    if (autoEqRun !== null) {
      throw new Error('Invalid Workbench session: null provenance cannot have an AutoEQ run.')
    }
    if (solutionState !== 'clean') {
      throw new Error('Invalid Workbench session: null provenance must have clean solution state.')
    }
  } else if (provenance === 'manual') {
    if (autoEqRun !== null) {
      throw new Error('Invalid Workbench session: manual provenance cannot have an AutoEQ run.')
    }
    if (solutionState !== 'clean') {
      throw new Error('Invalid Workbench session: manual provenance must have clean solution state.')
    }
  } else if (provenance === 'autoeq') {
    if (autoEqRun === null) {
      throw new Error('Invalid Workbench session: AutoEQ provenance requires an AutoEQ run record.')
    }
    if (solutionState === 'clean') {
      if (activeFr === null || activeTarget === null) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ solution requires active FR and Target curves.',
        )
      }
      if (activeFr.name !== autoEqRun.manifest.sourceName) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ active FR name does not match manifest source name.',
        )
      }
      if (activeTarget.name !== autoEqRun.manifest.targetName) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ active Target name does not match manifest target name.',
        )
      }
      if (!areNormalizationsEqual(input.normalization as Normalization, autoEqRun.manifest.normalization)) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ normalization does not match manifest normalization.',
        )
      }
      if (!areAutoEqSettingsEqual(input.autoeqSettings as AutoEqSettings, autoEqRun.manifest.autoeqSettings)) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ settings do not match manifest settings.',
        )
      }
      if (!areFiltersEqual(input.filters as Filter[], autoEqRun.manifest.finalFilters)) {
        throw new Error(
          'Invalid Workbench session: clean AutoEQ solution filters do not match manifest final filters.',
        )
      }
    }
  }

  const session = {
    schemaVersion: WORKBENCH_SESSION_SCHEMA_VERSION,
    curves: input.curves.map(cloneCurve),
    activeFrId: input.activeFrId,
    activeTargetId: input.activeTargetId,
    normalization: {
      mode: input.normalization.mode,
      frequencyHz: input.normalization.frequencyHz,
      levelDb: input.normalization.levelDb,
    },
    autoeqSettings: {
      minFrequencyHz: input.autoeqSettings.minFrequencyHz,
      maxFrequencyHz: input.autoeqSettings.maxFrequencyHz,
      minGainDb: input.autoeqSettings.minGainDb,
      maxGainDb: input.autoeqSettings.maxGainDb,
      minQ: input.autoeqSettings.minQ,
      maxQ: input.autoeqSettings.maxQ,
      maxFilters: input.autoeqSettings.maxFilters,
    },
    filters: input.filters.map(cloneFilter),
    filterProvenance: provenance,
    solutionState,
    autoEqRun,
  }

  return deepFreeze(session) as unknown as ValidatedWorkbenchSessionV1
}

export function serializeWorkbenchSession(
  input: WorkbenchSessionV1 | ValidatedWorkbenchSessionV1,
): string {
  const validated = validateWorkbenchSession(input)
  const stableObject: WorkbenchSessionV1 = {
    schemaVersion: WORKBENCH_SESSION_SCHEMA_VERSION,
    curves: validated.curves.map(cloneCurve),
    activeFrId: validated.activeFrId,
    activeTargetId: validated.activeTargetId,
    normalization: { ...validated.normalization },
    autoeqSettings: { ...validated.autoeqSettings },
    filters: validated.filters.map(cloneFilter),
    filterProvenance: validated.filterProvenance,
    solutionState: validated.solutionState,
    autoEqRun: validated.autoEqRun
      ? { manifest: canonicalizeRunManifest(validated.autoEqRun.manifest) }
      : null,
  }
  return JSON.stringify(stableObject, null, 2) + '\n'
}

export function deserializeWorkbenchSession(text: string): ValidatedWorkbenchSessionV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid Workbench session JSON.')
  }
  return validateWorkbenchSession(parsed)
}

export function createWorkbenchSessionFromWorkspace(state: WorkspaceState): ValidatedWorkbenchSessionV1 {
  return validateWorkbenchSession({
    schemaVersion: WORKBENCH_SESSION_SCHEMA_VERSION,
    curves: state.curves.map(cloneCurve),
    activeFrId: state.activeFrId,
    activeTargetId: state.activeTargetId,
    normalization: { ...state.normalization },
    autoeqSettings: { ...state.autoeqSettings },
    filters: state.filters.map(cloneFilter),
    filterProvenance: state.filterProvenance,
    solutionState: state.solutionState,
    autoEqRun: cloneAutoEqRunRecord(state.autoEqRun),
  })
}

export interface ImportSessionDependencies {
  workspaceStore?: StoreApi<WorkspaceState>
  compareStore?: StoreApi<EqCompareState>
  runStore?: StoreApi<AutoEqRunState>
  cancelAutoEq?: () => void
}

export function importWorkbenchSession(
  input: string | WorkbenchSessionV1 | ValidatedWorkbenchSessionV1,
  deps: ImportSessionDependencies = {},
): ValidatedWorkbenchSessionV1 {
  const session = typeof input === 'string'
    ? deserializeWorkbenchSession(input)
    : validateWorkbenchSession(input)

  const runStore = deps.runStore ?? autoEqRunStore
  if (runStore.getState().activeRunId !== null) {
    if (deps.cancelAutoEq) {
      deps.cancelAutoEq()
    } else {
      cancelAutoEq()
    }
  }

  const ws = deps.workspaceStore ?? workspaceStore
  ws.getState().applySession(session)

  const comp = deps.compareStore ?? eqCompareStore
  comp.getState().clear()

  runStore.getState().reset()

  return session
}
