import {
  cascadeMagnitudeDb,
  DEFAULT_AUTOEQ_SETTINGS,
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
  evaluate?: (candidate: SolverLabCandidateV1) => SolverLabEvaluationV1
  isExpired?: () => boolean
  nowMs?: () => number
  onPoint?: (point: SolverTrajectoryPointV1, filters: readonly Filter[]) => void
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
  selectedAtoms: DictionaryAtom[]
  stopReason: 'deadline' | 'evaluation-budget' | 'search-space-exhausted-under-current-mechanism'
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

export function runMatchingPursuit(input: MatchingPursuitRunInput): MatchingPursuitRunResult {
  nonNegativeInteger(input.seed, 'matching pursuit seed')
  positiveInteger(input.evaluationBudget, 'matching pursuit evaluationBudget')
  positiveInteger(input.checkpointEveryEvaluations ?? 200, 'checkpointEveryEvaluations')
  if (!/^[a-f0-9]{64}$/.test(input.referenceSnapshotSha256)) throw new Error('reference snapshot hash is invalid')
  if (input.referenceFrontier.length === 0) throw new Error('matching pursuit reference frontier is required')

  const dictionary = buildDictionary(input.problem, input.dictionary)
  const matrix = buildUnitResponseMatrix(input.problem, dictionary)
  const config = quantizationConfig(input.problem)
  const checkpointEvery = input.checkpointEveryEvaluations ?? 200
  const evaluate = input.evaluate ?? ((candidate) => evaluateSolverLabCandidate(input.problem as SolverLabProblemV1, candidate))
  const nowMs = input.nowMs ?? (() => 0)
  const startedAt = nowMs()
  const candidates: SolverLabCandidateV1[] = []
  const evaluations: SolverLabEvaluationV1[] = []
  const trajectory: SolverTrajectoryPointV1[] = []
  const selectedIndices: number[] = []
  let residual = [...input.problem.desiredDb]
  const record = (filters: readonly Filter[], label: string, work: number): SolverTrajectoryPointV1 => {
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
    const point = candidatePoint(
      candidate,
      evaluation,
      Math.min(input.evaluationBudget, work),
      Math.min(60_000, Math.max(0, nowMs() - startedAt)),
      input.referenceFrontier,
    )
    candidates.push(candidate)
    evaluations.push(evaluation)
    appendBest(trajectory, point)
    input.onPoint?.(point, evaluation.deliverable?.filters ?? [])
    return point
  }

  record([], 'baseline', 0)
  const visitedSelections = new Set<string>([''])
  let stopReason: MatchingPursuitRunResult['stopReason'] = 'search-space-exhausted-under-current-mechanism'
  let replacementCandidates = 0
  let searchPasses = 1
  let work = 0
  while (selectedIndices.length < Math.min(10, input.problem.bounds.maxFilters, dictionary.length)) {
    if (input.isExpired?.()) {
      stopReason = 'deadline'
      break
    }
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
    const filters = quantizeV2Filters(
      selectedIndices.map((index, position) => filterForAtom(dictionary[index]!, gains[position]!)),
      config,
    )
    record(filters, 'sparse', work)
  }


  let bestSelectedIndices = [...selectedIndices]
  while (
    stopReason !== 'deadline' &&
    stopReason !== 'evaluation-budget' &&
    bestSelectedIndices.length > 0
  ) {
    if (input.isExpired?.()) {
      stopReason = 'deadline'
      break
    }
    searchPasses += 1
    const base = [...bestSelectedIndices]
    let nextBest = [...base]
    let generatedThisPass = 0
    outer: for (let dropPosition = 0; dropPosition < base.length; dropPosition += 1) {
      const retained = base.filter((_, position) => position !== dropPosition)
      const retainedSet = new Set(retained)
      for (let replacementIndex = 0; replacementIndex < dictionary.length; replacementIndex += 1) {
        if (input.isExpired?.()) {
          stopReason = 'deadline'
          break outer
        }
        if (retainedSet.has(replacementIndex)) continue
        const trial = [...retained, replacementIndex]
        const key = [...trial].sort((left, right) => left - right).join(',')
        if (visitedSelections.has(key)) continue
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
        const filters = quantizeV2Filters(
          trial.map((index, position) => filterForAtom(dictionary[index]!, gains[position]!)),
          config,
        )
        const point = record(filters, `replacement-${searchPasses}`, work)
        if (trajectory.at(-1)?.candidateId === point.candidateId) nextBest = trial
      }
    }
    if (stopReason === 'deadline' || stopReason === 'evaluation-budget') break
    if (generatedThisPass === 0) {
      stopReason = 'search-space-exhausted-under-current-mechanism'
      break
    }
    bestSelectedIndices = nextBest
  }

  const points: QualityTimePoint[] = trajectory.map((point) => ({
    elapsedSeconds: point.elapsedMs / 1_000,
    regret: point.referenceRegret,
  }))
  return {
    algorithmId: 'matching-pursuit-v1',
    variantId: 'matching-pursuit-v1',
    seed: input.seed,
    evaluationBudget: input.evaluationBudget,
    trajectory,
    qualityTimeFrontierV1: computeQualityTimeFrontier(points),
    candidates,
    evaluations,
    selectedAtoms: bestSelectedIndices.map((index) => dictionary[index]!),
    stopReason,
    metadata: {
      dictionaryAtoms: dictionary.length,
      selectedAtoms: bestSelectedIndices.length,
      greedySelectedAtoms: selectedIndices.length,
      replacementCandidates,
      searchPasses,
      visitedSelections: visitedSelections.size,
      checkpointEveryEvaluations: checkpointEvery,
      maxFilters: Math.min(10, input.problem.bounds.maxFilters),
      timingBasis: input.nowMs === undefined ? 'synthetic-evaluation-count' : 'injected-clock',
    },
  }
}
