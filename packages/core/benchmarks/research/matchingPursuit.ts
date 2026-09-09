import {
  cascadeMagnitudeDb,
  DEFAULT_AUTOEQ_SETTINGS,
  evaluateV2Solution,
  quantizeV2Filters,
  resolveStandardAutoEqV2Config,
  type Filter,
} from '../../src/index.js'

import {
  evaluateSolverLabCandidate,
  type SolverLabCandidateV1,
  type SolverLabEvaluationV1,
  type SolverLabProblemV1,
} from './labProtocol.js'
import {
  directedReferenceRegret,
  type ReferenceRegretPoint,
} from './referenceRegret.js'
import {
  computeQualityTimeFrontier,
  type QualityTimePoint,
} from './qualityTime.js'
import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'
import type { SolverTrajectoryPointV1 } from './solverRunArtifact.js'

export type MatchingPursuitProblem = Pick<
  SolverLabProblemV1,
  'problemId' | 'inputSha256' | 'frequenciesHz' | 'desiredDb' | 'sampleRateHz' | 'bounds'
>

export interface DictionaryConfig {
  frequenciesPerOctave: number
  pkQValues: readonly number[]
  includeShelves: boolean
}

export interface DictionaryAtom {
  atomId: string
  type: Filter['type']
  frequencyHz: number
  q: number
}

export interface MatchingPursuitRunInput {
  problem: MatchingPursuitProblem
  seed: number
  evaluationBudget: number
  referenceFrontier: readonly ReferenceRegretPoint[]
  referenceSnapshotSha256: string
  dictionary?: DictionaryConfig
  checkpointEveryEvaluations?: number
  replacementOrdering?: MatchingPursuitReplacementOrdering
  traversalPolicy?: MatchingPursuitTraversalPolicy
  evaluate?: (candidate: SolverLabCandidateV1) => SolverLabEvaluationV1
  isExpired?: () => boolean
  isCancelled?: () => boolean
  nowMs?: () => number
  elapsedMs?: () => number
  onPoint?: (point: SolverTrajectoryPointV1, filters: readonly Filter[]) => void
  onTelemetry?: (point: MatchingPursuitTelemetryPointV1, filters: readonly Filter[]) => void
  onWorkUnitStart?: () => void
}

export type MatchingPursuitTraversalPolicy =
  | 'baseline-v1'
  | 'immediate-canonical-rebase-v1'
  | 'selection-beam-width-2-v1'

export type MatchingPursuitReplacementOrdering =
  | 'dictionary-drop-major-v1'
  | 'dictionary-drop-round-robin-v1'
  | 'residual-ranked-drop-round-robin-v1'

export interface MatchingPursuitTelemetryPointV1 {
  candidateId: string
  phase: 'baseline' | 'greedy' | 'replacement'
  evaluationCount: number
  elapsedMs: number
  observedCompletionElapsedMs: number
  admissibleForTrajectory: boolean
  selectionKey: string
  parentSelectionKey: string | null
  parentCandidateId: string | null
  selectionDepth: number
  lineageSelectionKeys: string[]
  selectedAtomIds: string[]
  removedAtomIds: string[]
  addedAtomIds: string[]
  preQuantizationRmseDb: number
  preQuantizationMaxAbsDb: number
  postQuantizationRmseDb: number
  postQuantizationMaxAbsDb: number
  preSolveGainVector: number[]
  boundedGainVector: number[]
  preSolveLinearResidualRmseDb: number
  postSolveLinearResidualRmseDb: number
  /** @deprecated Explicit compatibility alias for continuousRmseImprovementVsBaselineDb. */
  residualReductionRmseDb: number
  continuousRmseImprovementVsBaselineDb: number
  improvementVsParentRmseDb: number
  quantizationDeltaRmseDb: number
  quantizationDeltaMaxAbsDb: number
  paretoNovel: boolean
  dominated: boolean
  equivalentMetrics: boolean
  referenceImproved: boolean
  selectedChange: boolean
  acceptedReplacement: boolean
  equivalentStructuralRevisit: boolean
  evaluationsSinceUsefulImprovement: number | null
  candidateEvaluationsSinceUsefulImprovement: number | null
  elapsedMsSinceUsefulImprovement: number | null
}

export interface MatchingPursuitDiagnosticsV1 {
  evaluatedCandidates: number
  uniqueSelections: number
  paretoNovelCandidates: number
  dominatedCandidates: number
  equivalentMetricCandidates: number
  referenceImprovements: number
  selectedChanges: number
  attemptedReplacements: number
  acceptedReplacements: number
  atomsRemoved: number
  atomsAdded: number
  equivalentStructuralRevisits: number
  usefulImprovementCount: number
  maxSearchDepth: number
  rebaseTransitions: number
  beamTransitions: number
}

export interface MatchingPursuitRunResult {
  algorithmId: 'matching-pursuit-v1'
  variantId: 'matching-pursuit-v1'
  seed: number
  evaluationBudget: number
  trajectory: SolverTrajectoryPointV1[]
  qualityTimeFrontierV1: number
  candidates: SolverLabCandidateV1[]
  evaluations: SolverLabEvaluationV1[]
  telemetry: MatchingPursuitTelemetryPointV1[]
  diagnostics: MatchingPursuitDiagnosticsV1
  selectedAtoms: DictionaryAtom[]
  stopReason: 'deadline' | 'cancelled' | 'evaluation-budget' | 'search-space-exhausted-under-current-mechanism'
  metadata: Record<string, string | number | boolean>
}

export const DEFAULT_DICTIONARY_CONFIG: DictionaryConfig = Object.freeze({
  frequenciesPerOctave: 24,
  pkQValues: Object.freeze([0.35, 0.5, 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8]),
  includeShelves: true,
})

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
}

function frequencyPositions(problem: MatchingPursuitProblem, frequenciesPerOctave: number): number[] {
  const minimum = problem.bounds.minFrequencyHz
  const maximum = problem.bounds.maxFrequencyHz
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum <= minimum) {
    throw new Error('problem frequency bounds must be positive and ordered')
  }
  const positions: number[] = []
  for (let index = 0; ; index += 1) {
    const frequency = minimum * 2 ** (index / frequenciesPerOctave)
    if (frequency > maximum + 1e-12) break
    positions.push(Math.min(maximum, frequency))
  }
  if (positions.length === 0) throw new Error('dictionary has no frequency positions')
  return positions
}

export function buildDictionary(
  problem: MatchingPursuitProblem,
  config: DictionaryConfig = DEFAULT_DICTIONARY_CONFIG,
): DictionaryAtom[] {
  positiveInteger(config.frequenciesPerOctave, 'frequenciesPerOctave')
  if (!config.pkQValues.length || config.pkQValues.some((q) => !Number.isFinite(q) || q <= 0)) {
    throw new Error('pkQValues must contain finite positive values')
  }
  if (typeof config.includeShelves !== 'boolean') throw new Error('includeShelves must be boolean')
  const qValues = [...new Set(config.pkQValues)]
    .filter((q) => q >= problem.bounds.minPkQ && q <= problem.bounds.maxPkQ)
    .sort((left, right) => left - right)
  if (qValues.length === 0) throw new Error('dictionary has no PK Q values inside problem bounds')

  const atoms: DictionaryAtom[] = []
  frequencyPositions(problem, config.frequenciesPerOctave).forEach((frequencyHz, frequencyIndex) => {
    qValues.forEach((q, qIndex) => atoms.push({
      atomId: `dict-pk-${String(frequencyIndex).padStart(4, '0')}-${String(qIndex).padStart(2, '0')}`,
      type: 'PK',
      frequencyHz,
      q,
    }))
    if (config.includeShelves) {
      atoms.push(
        { atomId: `dict-ls-${String(frequencyIndex).padStart(4, '0')}`, type: 'LS', frequencyHz, q: problem.bounds.shelfQ },
        { atomId: `dict-hs-${String(frequencyIndex).padStart(4, '0')}`, type: 'HS', frequencyHz, q: problem.bounds.shelfQ },
      )
    }
  })
  return atoms
}

function filterForAtom(atom: DictionaryAtom, gainDb: number): Filter {
  return {
    id: atom.atomId,
    enabled: true,
    type: atom.type,
    frequencyHz: atom.frequencyHz,
    gainDb,
    q: atom.q,
  }
}

export function buildUnitResponseMatrix(
  problem: MatchingPursuitProblem,
  atoms: readonly DictionaryAtom[],
): number[][] {
  if (atoms.length === 0) throw new Error('unit response matrix requires at least one atom')
  if (problem.frequenciesHz.length === 0 || problem.frequenciesHz.length !== problem.desiredDb.length) {
    throw new Error('problem frequencies and desiredDb must be non-empty and have equal length')
  }
  return atoms.map((atom) => {
    const column = cascadeMagnitudeDb(
      [filterForAtom(atom, 1)],
      problem.frequenciesHz,
      problem.sampleRateHz,
    )
    column.forEach((value) => finite(value, 'unit response'))
    return column
  })
}

export function solveBoundedCoordinateGains(
  columns: readonly (readonly number[])[],
  desiredDb: readonly number[],
  minGainDb: number,
  maxGainDb: number,
): number[] {
  if (columns.length === 0) return []
  if (!Number.isFinite(minGainDb) || !Number.isFinite(maxGainDb) || minGainDb > maxGainDb) {
    throw new Error('gain bounds are invalid')
  }
  if (desiredDb.length === 0 || columns.some((column) => column.length !== desiredDb.length)) {
    throw new Error('gain solve matrix dimensions are inconsistent')
  }
  const gains = columns.map(() => 0)
  for (let sweep = 0; sweep < 32; sweep += 1) {
    let maximumChange = 0
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex]!
      let numerator = 0
      let denominator = 0
      for (let row = 0; row < desiredDb.length; row += 1) {
        let residualWithoutCurrent = desiredDb[row]!
        for (let other = 0; other < columns.length; other += 1) {
          if (other !== columnIndex) residualWithoutCurrent -= columns[other]![row]! * gains[other]!
        }
        numerator += column[row]! * residualWithoutCurrent
        denominator += column[row]! ** 2
      }
      const unconstrained = denominator === 0 ? 0 : numerator / denominator
      const next = Math.min(maxGainDb, Math.max(minGainDb, unconstrained))
      maximumChange = Math.max(maximumChange, Math.abs(next - gains[columnIndex]!))
      gains[columnIndex] = next
    }
    if (maximumChange <= 1e-10) break
  }
  return gains
}

function candidatePoint(
  candidate: SolverLabCandidateV1,
  evaluation: SolverLabEvaluationV1,
  evaluationCount: number,
  elapsedMs: number,
  references: readonly ReferenceRegretPoint[],
): SolverTrajectoryPointV1 {
  if (!evaluation.valid || evaluation.deliverable === null) {
    throw new Error(`matching pursuit candidate was rejected: ${evaluation.rejectionReason}`)
  }
  const delivered = evaluation.deliverable
  const regret = directedReferenceRegret({
    candidateId: candidate.candidateId,
    rmseDb: delivered.rmseDb,
    maxAbsDb: delivered.maxAbsDb,
    filterCount: delivered.filters.length,
  }, references)
  return {
    evaluationCount,
    elapsedMs,
    candidateId: candidate.candidateId,
    actualDeliveredFilterCount: delivered.filters.length,
    canonicalRmseDb: delivered.rmseDb,
    canonicalMaxAbsDb: delivered.maxAbsDb,
    referenceRegret: regret.regret,
    referenceImproved: regret.referenceImproved,
  }
}

function dominates(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  const epsilon = 1e-12
  return left.canonicalRmseDb <= right.canonicalRmseDb + epsilon &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + epsilon &&
    (left.canonicalRmseDb < right.canonicalRmseDb - epsilon || left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - epsilon)
}

function selectorPoint(point: SolverTrajectoryPointV1): SelectorPoint {
  return {
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.actualDeliveredFilterCount,
    cancellationScore: 0,
  }
}

function appendBest(trajectory: SolverTrajectoryPointV1[], point: SolverTrajectoryPointV1): void {
  const previous = trajectory.at(-1)
  if (previous === undefined || dominates(point, previous)) {
    trajectory.push(point)
    return
  }
  if (dominates(previous, point)) return
  if (selectReferencePoint([selectorPoint(previous), selectorPoint(point)]).candidateId === point.candidateId) {
    trajectory.push(point)
  }
}

function sameMetrics(left: SolverTrajectoryPointV1, right: SolverTrajectoryPointV1): boolean {
  return Math.abs(left.canonicalRmseDb - right.canonicalRmseDb) <= 1e-12 &&
    Math.abs(left.canonicalMaxAbsDb - right.canonicalMaxAbsDb) <= 1e-12
}

interface MatchingPursuitParentState {
  selection: number[]
  point: SolverTrajectoryPointV1
}

function retainSelectionBeam(
  entries: readonly MatchingPursuitParentState[],
  width: number,
): MatchingPursuitParentState[] {
  const unique = [...new Map(entries.map((entry) => [
    [...entry.selection].sort((left, right) => left - right).join(','),
    entry,
  ])).values()]
  const nonDominated = unique.filter((entry) =>
    !unique.some((other) => other !== entry && dominates(other.point, entry.point)))
  const preferred = nonDominated
  const selected: MatchingPursuitParentState[] = []
  const remaining = [...preferred]
  while (selected.length < width && remaining.length > 0) {
    const best = selectReferencePoint(remaining.map((entry) => selectorPoint(entry.point)))
    const bestIndex = remaining.findIndex((entry) => entry.point.candidateId === best.candidateId)
    selected.push(remaining.splice(bestIndex, 1)[0]!)
  }
  return selected
}

function structuralKey(filters: readonly Filter[]): string {
  return JSON.stringify(filters.map(({ id: _id, ...filter }) => filter).sort((left, right) =>
    left.type.localeCompare(right.type) || left.frequencyHz - right.frequencyHz ||
    left.gainDb - right.gainDb || left.q - right.q))
}

function linearResidualRmse(
  desiredDb: readonly number[],
  columns: readonly (readonly number[])[],
  gains: readonly number[],
): number {
  const meanSquare = desiredDb.reduce((sum, desired, row) => {
    const residual = desired - columns.reduce((response, column, index) =>
      response + column[row]! * gains[index]!, 0)
    return sum + residual ** 2
  }, 0) / desiredDb.length
  return Math.sqrt(meanSquare)
}

function quantizationConfig(problem: MatchingPursuitProblem) {
  return resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    minFrequencyHz: problem.bounds.minFrequencyHz,
    maxFrequencyHz: problem.bounds.maxFrequencyHz,
    minGainDb: problem.bounds.minGainDb,
    maxGainDb: problem.bounds.maxGainDb,
    minQ: problem.bounds.minPkQ,
    maxQ: problem.bounds.maxPkQ,
    maxFilters: Math.min(10, problem.bounds.maxFilters),
  })
}

function* matchingPursuitGenerator(
  input: MatchingPursuitRunInput,
): Generator<void, MatchingPursuitRunResult, void> {
  nonNegativeInteger(input.seed, 'matching pursuit seed')
  positiveInteger(input.evaluationBudget, 'matching pursuit evaluationBudget')
  positiveInteger(input.checkpointEveryEvaluations ?? 200, 'checkpointEveryEvaluations')
  if (!/^[a-f0-9]{64}$/.test(input.referenceSnapshotSha256)) throw new Error('reference snapshot hash is invalid')
  if (input.referenceFrontier.length === 0) throw new Error('matching pursuit reference frontier is required')

  const nowMs = input.nowMs ?? (() => 0)
  const startedAt = nowMs()
  let dictionary: DictionaryAtom[] = []
  let matrix: number[][] = []
  const config = quantizationConfig(input.problem)
  const checkpointEvery = input.checkpointEveryEvaluations ?? 200
  const replacementOrdering = input.replacementOrdering ?? 'dictionary-drop-major-v1'
  const traversalPolicy = input.traversalPolicy ?? 'baseline-v1'
  const evaluate = input.evaluate ?? ((candidate) => evaluateSolverLabCandidate(input.problem as SolverLabProblemV1, candidate))
  const candidates: SolverLabCandidateV1[] = []
  const evaluations: SolverLabEvaluationV1[] = []
  const trajectory: SolverTrajectoryPointV1[] = []
  const telemetry: MatchingPursuitTelemetryPointV1[] = []
  let paretoFrontier: SolverTrajectoryPointV1[] = []
  const selectionKeys = new Set<string>()
  const structuralKeys = new Set<string>()
  const continuousRmseBySelection = new Map<string, number>()
  const selectionDepthByKey = new Map<string, number>()
  const selectionLineageByKey = new Map<string, string[]>()
  const selectionCandidateByKey = new Map<string, string>()
  const selectionPointByKey = new Map<string, SolverTrajectoryPointV1>()
  let lastUsefulEvaluation = 0
  let lastUsefulCandidateIndex = 0
  let lastUsefulElapsedMs = 0
  const selectedIndices: number[] = []
  let residual = [...input.problem.desiredDb]
  const baselineRmseDb = evaluateV2Solution(
    [], input.problem.desiredDb, input.problem.frequenciesHz, input.problem.sampleRateHz,
  ).metrics.rmseDb
  const record = (
    filters: readonly Filter[],
    unquantizedFilters: readonly Filter[],
    selected: readonly number[],
    label: string,
    work: number,
    phase: MatchingPursuitTelemetryPointV1['phase'],
    removed: readonly number[] = [],
    added: readonly number[] = [],
    gains: readonly number[] = [],
    parentSelection: readonly number[] | null = null,
  ): SolverTrajectoryPointV1 => {
    const candidate: SolverLabCandidateV1 = {
      protocolVersion: 1,
      problemId: input.problem.problemId,
      inputSha256: input.problem.inputSha256,
      candidateId: `matching-pursuit-v1:${input.problem.problemId}:${input.seed}:${label}-${String(candidates.length).padStart(4, '0')}`,
      algorithmId: 'matching-pursuit-v1',
      seed: input.seed,
      filters: filters.map((filter) => ({ ...filter })),
    }
    const evaluation = evaluate(candidate)
    const observedCompletionElapsedMs = Math.max(0, input.elapsedMs?.() ?? nowMs() - startedAt)
    const admissibleForTrajectory = observedCompletionElapsedMs < 60_000
    const point = candidatePoint(
      candidate,
      evaluation,
      Math.min(input.evaluationBudget, work),
      Math.min(60_000, observedCompletionElapsedMs),
      input.referenceFrontier,
    )
    candidates.push(candidate)
    evaluations.push(evaluation)
    const previousTrajectoryLength = trajectory.length
    if (admissibleForTrajectory) appendBest(trajectory, point)
    const selectedChange = trajectory.length > previousTrajectoryLength
    const equivalentMetrics = paretoFrontier.some((previous) => sameMetrics(previous, point))
    const strictlyDominated = paretoFrontier.some((previous) => dominates(previous, point))
    const paretoNovel = !strictlyDominated && !equivalentMetrics
    if (paretoNovel) {
      paretoFrontier = paretoFrontier.filter((previous) => !dominates(point, previous))
      paretoFrontier.push(point)
    }
    const selectionKey = [...selected].sort((left, right) => left - right).join(',')
    const parentKey = parentSelection === null
      ? null
      : [...parentSelection].sort((left, right) => left - right).join(',')
    // Search depth counts replacement edges only. Greedy construction is a root,
    // so depth > 1 proves an actual multi-step reallocation rather than merely
    // the ten greedy additions used to construct the initial selection.
    const parentDepth = parentKey === null ? 0 : selectionDepthByKey.get(parentKey) ?? 0
    const selectionDepth = phase === 'replacement' ? parentDepth + 1 : 0
    const parentLineage = parentKey === null ? [] : selectionLineageByKey.get(parentKey) ?? [parentKey]
    const lineageSelectionKeys = [...parentLineage, selectionKey]
    const parentCandidateId = parentKey === null ? null : selectionCandidateByKey.get(parentKey) ?? null
    selectionKeys.add(selectionKey)
    const deliveredFilters = evaluation.deliverable?.filters ?? []
    const deliveredStructuralKey = structuralKey(deliveredFilters)
    const equivalentStructuralRevisit = structuralKeys.has(deliveredStructuralKey)
    structuralKeys.add(deliveredStructuralKey)
    const continuousMetrics = evaluateV2Solution(
      unquantizedFilters,
      input.problem.desiredDb,
      input.problem.frequenciesHz,
      input.problem.sampleRateHz,
    ).metrics
    continuousRmseBySelection.set(selectionKey, continuousMetrics.rmseDb)
    const selectedColumns = selected.map((index) => matrix[index]!)
    const preSolveGainVector = selected.map(() => 0)
    const preSolveLinearResidualRmseDb = linearResidualRmse(
      input.problem.desiredDb, selectedColumns, preSolveGainVector,
    )
    const postSolveLinearResidualRmseDb = linearResidualRmse(
      input.problem.desiredDb, selectedColumns, gains,
    )
    const parentRmseDb = parentKey === null
      ? baselineRmseDb
      : continuousRmseBySelection.get(parentKey) ?? baselineRmseDb
    const usefulImprovement = selectedChange && telemetry.length > 0
    const telemetryPoint: MatchingPursuitTelemetryPointV1 = {
      candidateId: point.candidateId,
      phase,
      evaluationCount: point.evaluationCount,
      elapsedMs: point.elapsedMs,
      observedCompletionElapsedMs,
      admissibleForTrajectory,
      selectionKey,
      selectedAtomIds: selected.map((index) => dictionary[index]!.atomId),
      removedAtomIds: removed.map((index) => dictionary[index]!.atomId),
      addedAtomIds: added.map((index) => dictionary[index]!.atomId),
      preQuantizationRmseDb: continuousMetrics.rmseDb,
      preQuantizationMaxAbsDb: continuousMetrics.maxAbsDb,
      postQuantizationRmseDb: point.canonicalRmseDb,
      postQuantizationMaxAbsDb: point.canonicalMaxAbsDb,
      preSolveGainVector,
      boundedGainVector: [...gains],
      preSolveLinearResidualRmseDb,
      postSolveLinearResidualRmseDb,
      residualReductionRmseDb: baselineRmseDb - continuousMetrics.rmseDb,
      continuousRmseImprovementVsBaselineDb: baselineRmseDb - continuousMetrics.rmseDb,
      improvementVsParentRmseDb: parentRmseDb - continuousMetrics.rmseDb,
      quantizationDeltaRmseDb: point.canonicalRmseDb - continuousMetrics.rmseDb,
      quantizationDeltaMaxAbsDb: point.canonicalMaxAbsDb - continuousMetrics.maxAbsDb,
      paretoNovel,
      dominated: strictlyDominated,
      equivalentMetrics,
      referenceImproved: point.referenceImproved,
      selectedChange,
      acceptedReplacement: phase === 'replacement' && selectedChange,
      equivalentStructuralRevisit,
      evaluationsSinceUsefulImprovement: usefulImprovement ? point.evaluationCount - lastUsefulEvaluation : null,
      candidateEvaluationsSinceUsefulImprovement: usefulImprovement
        ? telemetry.length - lastUsefulCandidateIndex
        : null,
      elapsedMsSinceUsefulImprovement: usefulImprovement ? point.elapsedMs - lastUsefulElapsedMs : null,
      parentSelectionKey: parentKey,
      parentCandidateId,
      selectionDepth,
      lineageSelectionKeys,
    }
    if (usefulImprovement) {
      lastUsefulEvaluation = point.evaluationCount
      lastUsefulCandidateIndex = telemetry.length
      lastUsefulElapsedMs = point.elapsedMs
    }
    telemetry.push(telemetryPoint)
    selectionDepthByKey.set(selectionKey, selectionDepth)
    selectionLineageByKey.set(selectionKey, lineageSelectionKeys)
    selectionCandidateByKey.set(selectionKey, point.candidateId)
    selectionPointByKey.set(selectionKey, point)
    input.onTelemetry?.(telemetryPoint, deliveredFilters)
    if (admissibleForTrajectory) input.onPoint?.(point, evaluation.deliverable?.filters ?? [])
    return point
  }

  input.onWorkUnitStart?.()
  record([], [], [], 'baseline', 0, 'baseline', [], [], [], null)
  yield
  input.onWorkUnitStart?.()
  dictionary = buildDictionary(input.problem, input.dictionary)
  matrix = buildUnitResponseMatrix(input.problem, dictionary)
  const visitedSelections = new Set<string>([''])
  let stopReason: MatchingPursuitRunResult['stopReason'] = 'search-space-exhausted-under-current-mechanism'
  let replacementCandidates = 0
  let replacementRankingScoreComputations = 0
  let searchPasses = 1
  let rebaseTransitions = 0
  let beamTransitions = 0
  let incrementalBeamPromotions = 0
  let alternateParentsExpanded = 0
  let completedReplacementPasses = 0
  const expandedBeamParentKeys = new Set<string>()
  let maxSearchDepth = Math.max(...selectionDepthByKey.values(), 0)
  let work = 0
  const requestedStopReason = (): 'deadline' | 'cancelled' | null =>
    input.isCancelled?.() ? 'cancelled' : input.isExpired?.() ? 'deadline' : null
  while (selectedIndices.length < Math.min(10, input.problem.bounds.maxFilters, dictionary.length)) {
    const requestedStop = requestedStopReason()
    if (requestedStop !== null) {
      stopReason = requestedStop
      break
    }
    input.onWorkUnitStart?.()
    work += checkpointEvery
    if (work > input.evaluationBudget) {
      stopReason = 'evaluation-budget'
      break
    }
    const selected = new Set(selectedIndices)
    let selectedIndex = -1
    let selectedScore = -Infinity
    for (let atomIndex = 0; atomIndex < dictionary.length; atomIndex += 1) {
      if (selected.has(atomIndex)) continue
      const column = matrix[atomIndex]!
      let numerator = 0
      let denominator = 0
      for (let row = 0; row < residual.length; row += 1) {
        numerator += column[row]! * residual[row]!
        denominator += column[row]! ** 2
      }
      const score = Math.abs(numerator) / Math.max(denominator, 1e-30)
      if (score > selectedScore) {
        selectedScore = score
        selectedIndex = atomIndex
      }
    }
    if (selectedIndex < 0 || !Number.isFinite(selectedScore) || selectedScore <= 1e-12) break
    const parentSelection = [...selectedIndices]
    selectedIndices.push(selectedIndex)
    visitedSelections.add([...selectedIndices].sort((left, right) => left - right).join(','))
    const gains = solveBoundedCoordinateGains(
      selectedIndices.map((index) => matrix[index]!),
      input.problem.desiredDb,
      input.problem.bounds.minGainDb,
      input.problem.bounds.maxGainDb,
    )
    residual = input.problem.desiredDb.map((desired, row) =>
      desired - selectedIndices.reduce((sum, index, position) => sum + matrix[index]![row]! * gains[position]!, 0),
    )
    const continuousFilters = selectedIndices.map((index, position) =>
      filterForAtom(dictionary[index]!, gains[position]!))
    const filters = quantizeV2Filters(continuousFilters, config)
    record(filters, continuousFilters, selectedIndices, 'sparse', work, 'greedy', [], [selectedIndex], gains, parentSelection)
    yield
  }


  let bestSelectedIndices = [...selectedIndices]
  let parentFrontier: MatchingPursuitParentState[] = [{
    selection: [...bestSelectedIndices],
    point: selectionPointByKey.get([...bestSelectedIndices].sort((left, right) => left - right).join(','))!,
  }]
  while (
    stopReason !== 'deadline' &&
    stopReason !== 'cancelled' &&
    stopReason !== 'evaluation-budget' &&
    bestSelectedIndices.length > 0
  ) {
    const requestedStop = requestedStopReason()
    if (requestedStop !== null) {
      stopReason = requestedStop
      break
    }
    searchPasses += 1
    const initialBases = traversalPolicy === 'selection-beam-width-2-v1'
      ? (() => {
          const unexpanded = parentFrontier.filter((entry) =>
            !expandedBeamParentKeys.has([...entry.selection].sort((left, right) => left - right).join(',')))
          return unexpanded.length > 0 ? unexpanded : parentFrontier
        })()
      : [{
          selection: [...bestSelectedIndices],
          point: selectionPointByKey.get([...bestSelectedIndices].sort((left, right) => left - right).join(','))!,
        }]
    let nextBest = [...bestSelectedIndices]
    let generatedThisPass = 0
    const generatedParents: MatchingPursuitParentState[] = [...initialBases]
    let rebaseTriggered = false
    let beamPromotionTriggered = false
    baseLoop: for (const baseState of initialBases) {
      const base = [...baseState.selection]
      if (traversalPolicy === 'selection-beam-width-2-v1') {
        const baseKey = [...base].sort((left, right) => left - right).join(',')
        if (expandedBeamParentKeys.size > 0 && !expandedBeamParentKeys.has(baseKey)) alternateParentsExpanded += 1
        expandedBeamParentKeys.add(baseKey)
      }
      const replacementRankings: number[][] = []
      for (let dropPosition = 0; dropPosition < base.length; dropPosition += 1) {
        input.onWorkUnitStart?.()
        const retained = base.filter((_, position) => position !== dropPosition)
        const retainedSet = new Set(retained)
        let ranked: number[]
        if (replacementOrdering === 'residual-ranked-drop-round-robin-v1') {
          const retainedGains = solveBoundedCoordinateGains(
            retained.map((index) => matrix[index]!),
            input.problem.desiredDb,
            input.problem.bounds.minGainDb,
            input.problem.bounds.maxGainDb,
          )
          const retainedResidual = input.problem.desiredDb.map((desired, row) =>
            desired - retained.reduce((sum, index, position) =>
              sum + matrix[index]![row]! * retainedGains[position]!, 0))
          ranked = dictionary.map((_, replacementIndex) => {
            if (retainedSet.has(replacementIndex)) return { replacementIndex, score: -Infinity }
            replacementRankingScoreComputations += 1
            const column = matrix[replacementIndex]!
            let numerator = 0
            let denominator = 0
            for (let row = 0; row < retainedResidual.length; row += 1) {
              numerator += column[row]! * retainedResidual[row]!
              denominator += column[row]! ** 2
            }
            return {
              replacementIndex,
              score: Math.abs(numerator) / Math.max(denominator, 1e-30),
            }
          }).filter((candidate) => Number.isFinite(candidate.score))
            .sort((left, right) => right.score - left.score || left.replacementIndex - right.replacementIndex)
            .map((candidate) => candidate.replacementIndex)
        } else {
          ranked = dictionary.map((_, replacementIndex) => replacementIndex)
            .filter((replacementIndex) => !retainedSet.has(replacementIndex))
        }
        replacementRankings.push(ranked)
        const rankingStop = requestedStopReason()
        if (rankingStop !== null) {
          stopReason = rankingStop
          break baseLoop
        }
      }
      if (stopReason === 'deadline' || stopReason === 'cancelled') break
      const maximumRank = Math.max(0, ...replacementRankings.map((ranking) => ranking.length))
      const replacementTrials: { dropPosition: number; replacementIndex: number }[] = []
      if (replacementOrdering === 'dictionary-drop-major-v1') {
        replacementRankings.forEach((ranking, dropPosition) => ranking.forEach((replacementIndex) =>
          replacementTrials.push({ dropPosition, replacementIndex })))
      } else {
        for (let candidateRank = 0; candidateRank < maximumRank; candidateRank += 1) {
          for (let dropPosition = 0; dropPosition < base.length; dropPosition += 1) {
            const replacementIndex = replacementRankings[dropPosition]?.[candidateRank]
            if (replacementIndex !== undefined) replacementTrials.push({ dropPosition, replacementIndex })
          }
        }
      }
      outer: for (const { dropPosition, replacementIndex } of replacementTrials) {
        const trialStop = requestedStopReason()
        if (trialStop !== null) {
          stopReason = trialStop
          break outer
        }
        const retained = base.filter((_, position) => position !== dropPosition)
        const trial = [...retained, replacementIndex]
        const key = [...trial].sort((left, right) => left - right).join(',')
        if (visitedSelections.has(key)) continue
        input.onWorkUnitStart?.()
        work += checkpointEvery
        if (work > input.evaluationBudget) {
          stopReason = 'evaluation-budget'
          break outer
        }
        visitedSelections.add(key)
        generatedThisPass += 1
        replacementCandidates += 1
        const gains = solveBoundedCoordinateGains(
          trial.map((index) => matrix[index]!),
          input.problem.desiredDb,
          input.problem.bounds.minGainDb,
          input.problem.bounds.maxGainDb,
        )
        const continuousFilters = trial.map((index, position) =>
          filterForAtom(dictionary[index]!, gains[position]!))
        const filters = quantizeV2Filters(continuousFilters, config)
        const point = record(
          filters,
          continuousFilters,
          trial,
          `replacement-${searchPasses}`,
          work,
          'replacement',
          [base[dropPosition]!],
          [replacementIndex],
          gains,
          base,
        )
        maxSearchDepth = Math.max(maxSearchDepth, selectionDepthByKey.get(key) ?? 0)
        const selectedChange = trajectory.at(-1)?.candidateId === point.candidateId
        if (selectedChange) {
          nextBest = trial
          generatedParents.push({ selection: [...trial], point })
          if (traversalPolicy === 'immediate-canonical-rebase-v1') {
            rebaseTransitions += 1
            rebaseTriggered = true
          }
        }
        if (traversalPolicy === 'selection-beam-width-2-v1') {
          generatedParents.push({ selection: [...trial], point })
          const previousKeys = parentFrontier.map((entry) => [...entry.selection].sort((left, right) => left - right).join(','))
          const retained = retainSelectionBeam(generatedParents, 2)
          const nextKeys = retained.map((entry) => [...entry.selection].sort((left, right) => left - right).join(','))
          if (nextKeys.join('|') !== previousKeys.join('|')) {
            parentFrontier = retained
            beamTransitions += 1
            incrementalBeamPromotions += 1
            if (retained.some((entry) => !expandedBeamParentKeys.has(
              [...entry.selection].sort((left, right) => left - right).join(','),
            ))) {
              beamPromotionTriggered = true
            }
          }
        }
        yield
        if (rebaseTriggered || beamPromotionTriggered) break baseLoop
      }
      if (rebaseTriggered || beamPromotionTriggered) break
    }
    if (stopReason === 'deadline' || stopReason === 'cancelled' || stopReason === 'evaluation-budget') break
    if (generatedThisPass === 0) {
      stopReason = 'search-space-exhausted-under-current-mechanism'
      break
    }
    if (rebaseTriggered) {
      bestSelectedIndices = nextBest
      continue
    }
    if (beamPromotionTriggered) {
      bestSelectedIndices = [...(parentFrontier[0]?.selection ?? bestSelectedIndices)]
      continue
    }
    completedReplacementPasses += 1
    if (traversalPolicy === 'selection-beam-width-2-v1') {
      const previousKeys = parentFrontier.map((entry) => [...entry.selection].sort((left, right) => left - right).join(','))
      parentFrontier = retainSelectionBeam(generatedParents, 2)
      const nextKeys = parentFrontier.map((entry) => [...entry.selection].sort((left, right) => left - right).join(','))
      if (nextKeys.join('|') !== previousKeys.join('|')) beamTransitions += 1
      bestSelectedIndices = [...(parentFrontier[0]?.selection ?? bestSelectedIndices)]
    } else {
      bestSelectedIndices = nextBest
    }
  }

  const points: QualityTimePoint[] = trajectory.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  }))
  const diagnostics: MatchingPursuitDiagnosticsV1 = {
    evaluatedCandidates: telemetry.length,
    uniqueSelections: selectionKeys.size,
    paretoNovelCandidates: telemetry.filter((point) => point.paretoNovel).length,
    dominatedCandidates: telemetry.filter((point) => point.dominated).length,
    equivalentMetricCandidates: telemetry.filter((point) => point.equivalentMetrics).length,
    referenceImprovements: telemetry.filter((point) => point.referenceImproved).length,
    selectedChanges: telemetry.filter((point) => point.selectedChange).length,
    attemptedReplacements: telemetry.filter((point) => point.phase === 'replacement').length,
    acceptedReplacements: telemetry.filter((point) => point.acceptedReplacement).length,
    atomsRemoved: telemetry.reduce((sum, point) => sum + point.removedAtomIds.length, 0),
    atomsAdded: telemetry.reduce((sum, point) => sum + point.addedAtomIds.length, 0),
    equivalentStructuralRevisits: telemetry.filter((point) => point.equivalentStructuralRevisit).length,
    usefulImprovementCount: Math.max(0, trajectory.length - 1),
    maxSearchDepth,
    rebaseTransitions,
    beamTransitions,
  }
  return {
    algorithmId: 'matching-pursuit-v1',
    variantId: 'matching-pursuit-v1',
    seed: input.seed,
    evaluationBudget: input.evaluationBudget,
    trajectory,
    qualityTimeFrontierV1: computeQualityTimeFrontier(points),
    candidates,
    evaluations,
    telemetry,
    diagnostics,
    selectedAtoms: bestSelectedIndices.map((index) => dictionary[index]!),
    stopReason,
    metadata: {
      dictionaryAtoms: dictionary.length,
      selectedAtoms: bestSelectedIndices.length,
      greedySelectedAtoms: selectedIndices.length,
      replacementCandidates,
      replacementOrdering,
      traversalPolicy,
      replacementRankingScoreComputations,
      searchPasses,
      maxSearchDepth,
      rebaseTransitions,
      beamTransitions,
      incrementalBeamPromotions,
      alternateParentsExpanded,
      completedReplacementPasses,
      visitedSelections: visitedSelections.size,
      checkpointEveryEvaluations: checkpointEvery,
      maxFilters: Math.min(10, input.problem.bounds.maxFilters),
      timingBasis: input.nowMs === undefined ? 'synthetic-evaluation-count' : 'injected-clock',
    },
  }
}

export interface MatchingPursuitContinuationV1 {
  readonly version: 1
  done: boolean
  emittedCandidates: number
  result: MatchingPursuitRunResult | null
}

const matchingPursuitGenerators = new WeakMap<
  MatchingPursuitContinuationV1,
  Generator<void, MatchingPursuitRunResult, void>
>()

export function createMatchingPursuitContinuation(
  input: MatchingPursuitRunInput,
): MatchingPursuitContinuationV1 {
  const continuation: MatchingPursuitContinuationV1 = {
    version: 1,
    done: false,
    emittedCandidates: 0,
    result: null,
  }
  matchingPursuitGenerators.set(continuation, matchingPursuitGenerator(input))
  return continuation
}

export function advanceMatchingPursuitContinuation(
  continuation: MatchingPursuitContinuationV1,
  maxCandidateEvaluations: number,
): MatchingPursuitContinuationV1 {
  positiveInteger(maxCandidateEvaluations, 'matching pursuit continuation candidate budget')
  const generator = matchingPursuitGenerators.get(continuation)
  if (generator === undefined) throw new Error('matching pursuit continuation is not owned by this runtime')
  if (continuation.done) return continuation
  for (let count = 0; count < maxCandidateEvaluations && !continuation.done; count += 1) {
    const next = generator.next()
    if (next.done) {
      continuation.done = true
      continuation.result = next.value
    } else {
      continuation.emittedCandidates += 1
    }
  }
  return continuation
}

export function matchingPursuitContinuationResult(
  continuation: MatchingPursuitContinuationV1,
): MatchingPursuitRunResult {
  if (!continuation.done || continuation.result === null) {
    throw new Error('matching pursuit continuation has not completed')
  }
  return continuation.result
}

export function runMatchingPursuit(input: MatchingPursuitRunInput): MatchingPursuitRunResult {
  const continuation = createMatchingPursuitContinuation(input)
  while (!continuation.done) {
    advanceMatchingPursuitContinuation(continuation, Number.MAX_SAFE_INTEGER)
  }
  return matchingPursuitContinuationResult(continuation)
}
