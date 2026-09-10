import {
  selectReferencePoint,
  type SelectorPoint,
} from './referenceSelector.js'

/** A frozen candidate that can seed an independent structural run. */
export interface SeedAllocationSeed {
  seedId: string
  origin: string
  semanticKey: string
  selectionKey: string
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  canonicalFilterCount?: number
  canonicalCandidateId?: string
  filters?: readonly unknown[]
}

export interface SeedWorkAllocation {
  seedId: string
  descendantWorkTarget: number
}

export type SeedAllocationPointPhase = 'seed-validation' | 'descendant'

/** Canonical metrics emitted by one seed initialization or descendant evaluation. */
export interface SeedAllocationPoint {
  candidateId: string
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
  filterCount: number
  directedReferenceRegretV1: number
  referenceImproved: boolean
  phase: SeedAllocationPointPhase
}

export interface SeedAllocationOutcome {
  seedId: string
  seedValidationEvaluations: number
  descendantProposalEvaluations: number
  totalStructuralCandidateEvaluations: number
  descendantsProduced: number
  seedValidationPoints?: readonly SeedAllocationPoint[]
  descendantPoints?: readonly SeedAllocationPoint[]
}

export interface SeedAllocationPerSeedResult extends SeedWorkAllocation, SeedAllocationOutcome {}

export interface GlobalSeedAllocationMetrics {
  initialSelectedBest: SeedAllocationPoint | null
  selectedBest: SeedAllocationPoint | null
  globalParetoFrontier: SeedAllocationPoint[]
  /** Descendant progress admitted against the arm's validated seed baseline. */
  paretoNovelDescendants: number
  paretoNovelAgainstSeedBaselines: number
  /** Legacy descendant-only accounting retained under an explicit name. */
  paretoNovelDescendantsOnly: number
  selectedBestChanges: number
  referenceImprovements: number
  firstUsefulDescendantEvaluation: number | null
  descendantEvaluationsToBestResult: number | null
  improvementPerDescendantEvaluation: { rmseDb: number; maxAbsDb: number } | null
}

export interface SeedAllocationArmResult {
  allocations: SeedWorkAllocation[]
  perSeed: SeedAllocationPerSeedResult[]
  seedValidationEvaluations: number
  descendantProposalEvaluations: number
  totalStructuralCandidateEvaluations: number
  global: GlobalSeedAllocationMetrics
  /** Aliases kept at arm level so JSON consumers need not know the nested shape. */
  globalParetoNovelDescendants: number
  globalParetoNovelAgainstSeedBaselines: number
  globalParetoNovelDescendantsOnly: number
  globalSelectedBestChanges: number
  globalReferenceImprovements: number
}

export interface EqualizedSeedAllocationInput<T extends SeedAllocationSeed> {
  pool: readonly T[]
  targetDescendantEvaluations: number
  distributedSeedCount: number
  runSeed: (input: { seed: T; descendantWorkTarget: number }) => SeedAllocationOutcome
}

export interface EqualizedSeedAllocationResult<T extends SeedAllocationSeed = SeedAllocationSeed> {
  frozenSeedPool: T[]
  frozenSeedIds: string[]
  primarySeedId: string
  alternateSeedIds: string[]
  targetDescendantEvaluations: number
  concentrated: SeedAllocationArmResult & { concentratedSeedId: string }
  distributed: SeedAllocationArmResult
  equalization: {
    status: 'equalized' | 'not-equalized'
    causalClaimAllowed: boolean
    reason: string
  }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function cloneSeed<T extends SeedAllocationSeed>(seed: T): T {
  const copy = { ...seed } as T
  if (Array.isArray(seed.filters)) {
    Object.assign(copy, {
      filters: seed.filters.map((filter) =>
        filter !== null && typeof filter === 'object' ? { ...(filter as object) } : filter),
    })
  }
  return copy
}

function compareFrozenSeeds(left: SeedAllocationSeed, right: SeedAllocationSeed): number {
  return left.selectionKey.localeCompare(right.selectionKey) ||
    left.semanticKey.localeCompare(right.semanticKey) ||
    left.seedId.localeCompare(right.seedId)
}

export function freezeSeedPool<T extends SeedAllocationSeed>(seeds: readonly T[]): T[] {
  if (seeds.length === 0) throw new Error('seed pool must not be empty')
  const seedIds = new Set<string>()
  const semanticKeys = new Set<string>()
  for (const [index, seed] of seeds.entries()) {
    if (typeof seed.seedId !== 'string' || seed.seedId.length === 0 ||
      typeof seed.origin !== 'string' || seed.origin.length === 0 ||
      typeof seed.semanticKey !== 'string' || seed.semanticKey.length === 0 ||
      typeof seed.selectionKey !== 'string' || seed.selectionKey.length === 0) {
      throw new Error(`seed provenance keys are required at index ${index}`)
    }
    finite(seed.canonicalRmseDb, 'seed canonical entry RMSE')
    finite(seed.canonicalMaxAbsDb, 'seed canonical entry maxAbs')
    if (seed.canonicalFilterCount !== undefined) {
      nonNegativeInteger(seed.canonicalFilterCount, 'seed canonical filter count')
    }
    if (seedIds.has(seed.seedId)) throw new Error('seed ID must be unique')
    if (semanticKeys.has(seed.semanticKey)) throw new Error('seed semantic key must be unique')
    seedIds.add(seed.seedId)
    semanticKeys.add(seed.semanticKey)
  }
  return seeds.map(cloneSeed).sort(compareFrozenSeeds)
}

function selectorPoint(seed: SeedAllocationSeed): SelectorPoint {
  return {
    candidateId: seed.canonicalCandidateId ?? seed.seedId,
    rmseDb: seed.canonicalRmseDb,
    maxAbsDb: seed.canonicalMaxAbsDb,
    filterCount: seed.canonicalFilterCount ?? 0,
    cancellationScore: 0,
  }
}

/** Selects the primary from frozen entry metrics using the approved selector. */
export function selectPrimarySeed<T extends SeedAllocationSeed>(pool: readonly T[]): T {
  if (pool.length === 0) throw new Error('primary allocation requires a frozen seed')
  const selected = selectReferencePoint(pool.map(selectorPoint))
  const seed = pool.find((candidate) => (candidate.canonicalCandidateId ?? candidate.seedId) === selected.candidateId)
  if (seed === undefined) throw new Error('canonical primary selector chose an unknown seed')
  return seed
}

/** Backward-compatible name for callers that describe the primary as concentrated. */
export const selectConcentratedSeed = selectPrimarySeed

function semanticTokens(seed: SeedAllocationSeed): Set<string> {
  try {
    const parsed: unknown = JSON.parse(seed.semanticKey)
    if (Array.isArray(parsed)) return new Set(parsed.map((value) => JSON.stringify(value)))
  } catch {
    // Opaque semantic keys still have a deterministic string distance below.
  }
  return new Set([seed.semanticKey])
}

function diversityDistance(left: SeedAllocationSeed, right: SeedAllocationSeed): number {
  const leftTokens = semanticTokens(left)
  const rightTokens = semanticTokens(right)
  let intersection = 0
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union === 0 ? 0 : 1 - intersection / union
}

function diversityTieBreak(left: SeedAllocationSeed, right: SeedAllocationSeed): number {
  return left.selectionKey.localeCompare(right.selectionKey) ||
    left.semanticKey.localeCompare(right.semanticKey) ||
    left.seedId.localeCompare(right.seedId)
}

/**
 * Selects alternates before structural execution with greedy max-min Jaccard
 * distance over frozen semantic keys. Metrics from structural descendants are
 * deliberately not available to this function.
 */
export function selectDiverseAlternateSeeds<T extends SeedAllocationSeed>(
  pool: readonly T[],
  primary: T,
  alternateCount: number,
): T[] {
  if (!Number.isSafeInteger(alternateCount) || alternateCount < 0) {
    throw new Error('alternate seed count must be a non-negative integer')
  }
  if (!pool.some((seed) => seed.seedId === primary.seedId)) {
    throw new Error('primary seed must belong to the frozen pool')
  }
  if (alternateCount > pool.length - 1) throw new Error('alternate seed count exceeds frozen pool')
  const selected: T[] = []
  const remaining = pool.filter((seed) => seed.seedId !== primary.seedId)
  while (selected.length < alternateCount) {
    const reference = [primary, ...selected]
    const candidate = remaining
      .filter((seed) => !selected.some((chosen) => chosen.seedId === seed.seedId))
      .map((seed) => ({
        seed,
        distance: Math.min(...reference.map((chosen) => diversityDistance(seed, chosen))),
      }))
      .sort((left, right) => right.distance - left.distance || diversityTieBreak(left.seed, right.seed))[0]
    if (candidate === undefined) throw new Error('unable to select deterministic alternate seed')
    selected.push(candidate.seed)
  }
  return selected
}

export function allocateDistributedSeedWork<T extends SeedAllocationSeed>(
  pool: readonly T[],
  targetDescendantEvaluations: number,
  distributedSeedCount: number,
  primarySeedId = selectPrimarySeed(pool).seedId,
): SeedWorkAllocation[] {
  positiveInteger(targetDescendantEvaluations, 'target descendant evaluations')
  positiveInteger(distributedSeedCount, 'distributed seed count')
  if (distributedSeedCount > pool.length) throw new Error('distributed seed count exceeds frozen pool')
  if (distributedSeedCount > targetDescendantEvaluations) {
    throw new Error('distributed seed count exceeds descendant work target')
  }
  if (!pool.some((seed) => seed.seedId === primarySeedId)) throw new Error('primary seed is not frozen')
  const primary = pool.find((seed) => seed.seedId === primarySeedId)!
  const alternates = selectDiverseAlternateSeeds(pool, primary, distributedSeedCount - 1)
  const selected = [primary, ...alternates]
  const base = Math.floor(targetDescendantEvaluations / selected.length)
  const remainder = targetDescendantEvaluations % selected.length
  return selected.map((seed, index) => ({
    seedId: seed.seedId,
    descendantWorkTarget: base + (index < remainder ? 1 : 0),
  }))
}

function clonePoint(point: SeedAllocationPoint): SeedAllocationPoint {
  return { ...point }
}

function validatePoint(point: SeedAllocationPoint, label: string, expectedPhase: SeedAllocationPointPhase): void {
  if (typeof point.candidateId !== 'string' || point.candidateId.length === 0) {
    throw new Error(`${label}.candidateId is required`)
  }
  finite(point.canonicalRmseDb, `${label}.canonicalRmseDb`)
  finite(point.canonicalMaxAbsDb, `${label}.canonicalMaxAbsDb`)
  nonNegativeInteger(point.filterCount, `${label}.filterCount`)
  finite(point.directedReferenceRegretV1, `${label}.directedReferenceRegretV1`)
  if (point.directedReferenceRegretV1 < 0) throw new Error(`${label}.directedReferenceRegretV1 must be non-negative`)
  if (typeof point.referenceImproved !== 'boolean') throw new Error(`${label}.referenceImproved must be boolean`)
  if (point.phase !== expectedPhase) throw new Error(`${label}.phase does not match its counter`)
}

function validateOutcome<T extends SeedAllocationSeed>(
  outcome: SeedAllocationOutcome,
  seed: T,
  allocation: SeedWorkAllocation,
): SeedAllocationPerSeedResult {
  if (outcome.seedId !== seed.seedId) throw new Error('seed outcome provenance does not match allocation')
  positiveInteger(allocation.descendantWorkTarget, 'seed descendant work target')
  positiveInteger(outcome.seedValidationEvaluations, 'seed validation evaluations')
  nonNegativeInteger(outcome.descendantProposalEvaluations, 'descendant proposal evaluations')
  nonNegativeInteger(outcome.totalStructuralCandidateEvaluations, 'total structural candidate evaluations')
  nonNegativeInteger(outcome.descendantsProduced, 'descendants produced')
  if (outcome.totalStructuralCandidateEvaluations !==
    outcome.seedValidationEvaluations + outcome.descendantProposalEvaluations) {
    throw new Error('total structural candidate evaluations must equal validation plus descendants')
  }
  if (outcome.descendantsProduced > outcome.descendantProposalEvaluations) {
    throw new Error('descendants produced cannot exceed descendant evaluations')
  }
  const seedValidationPoints = (outcome.seedValidationPoints ?? []).map(clonePoint)
  const descendantPoints = (outcome.descendantPoints ?? []).map(clonePoint)
  seedValidationPoints.forEach((point, index) => validatePoint(point, `seedValidationPoints[${index}]`, 'seed-validation'))
  descendantPoints.forEach((point, index) => validatePoint(point, `descendantPoints[${index}]`, 'descendant'))
  if (seedValidationPoints.length > outcome.seedValidationEvaluations) {
    throw new Error('seed validation points exceed validation evaluations')
  }
  if (descendantPoints.length > outcome.descendantProposalEvaluations) {
    throw new Error('descendant points exceed descendant evaluations')
  }
  return {
    ...allocation,
    ...outcome,
    seedValidationPoints,
    descendantPoints,
  }
}

function equivalentMetrics(left: SeedAllocationPoint, right: SeedAllocationPoint): boolean {
  return Math.abs(left.canonicalRmseDb - right.canonicalRmseDb) <= 1e-12 &&
    Math.abs(left.canonicalMaxAbsDb - right.canonicalMaxAbsDb) <= 1e-12
}

function dominatesMetrics(left: SeedAllocationPoint, right: SeedAllocationPoint): boolean {
  return left.canonicalRmseDb <= right.canonicalRmseDb + 1e-12 &&
    left.canonicalMaxAbsDb <= right.canonicalMaxAbsDb + 1e-12 &&
    (left.canonicalRmseDb < right.canonicalRmseDb - 1e-12 ||
      left.canonicalMaxAbsDb < right.canonicalMaxAbsDb - 1e-12)
}

function selectorPrefers(candidate: SeedAllocationPoint, current: SeedAllocationPoint): boolean {
  if (equivalentMetrics(candidate, current) || dominatesMetrics(current, candidate)) return false
  return selectReferencePoint([
    {
      candidateId: current.candidateId,
      rmseDb: current.canonicalRmseDb,
      maxAbsDb: current.canonicalMaxAbsDb,
      filterCount: current.filterCount,
      cancellationScore: 0,
    },
    {
      candidateId: candidate.candidateId,
      rmseDb: candidate.canonicalRmseDb,
      maxAbsDb: candidate.canonicalMaxAbsDb,
      filterCount: candidate.filterCount,
      cancellationScore: 0,
    },
  ]).candidateId === candidate.candidateId
}

function selectBestPoint(points: readonly SeedAllocationPoint[]): SeedAllocationPoint {
  const selected = selectReferencePoint(points.map((point) => ({
    candidateId: point.candidateId,
    rmseDb: point.canonicalRmseDb,
    maxAbsDb: point.canonicalMaxAbsDb,
    filterCount: point.filterCount,
    cancellationScore: 0,
  })))
  const point = points.find((candidate) => candidate.candidateId === selected.candidateId)
  if (point === undefined) throw new Error('canonical selector chose an unknown point')
  return clonePoint(point)
}

function addToParetoFrontier(
  frontier: SeedAllocationPoint[],
  point: SeedAllocationPoint,
): boolean {
  if (frontier.some((previous) => equivalentMetrics(previous, point))) return false
  if (frontier.some((previous) => dominatesMetrics(previous, point))) return false
  const next = frontier.filter((previous) => !dominatesMetrics(point, previous))
  next.push(clonePoint(point))
  frontier.splice(0, frontier.length, ...next)
  return true
}

function seedValidationFrontier(points: readonly SeedAllocationPoint[]): SeedAllocationPoint[] {
  const frontier: SeedAllocationPoint[] = []
  points.forEach((point) => addToParetoFrontier(frontier, point))
  return frontier
}

/** Aggregate all points in one arm; descendant novelty is explicitly arm-global. */
export function aggregateGlobalSeedAllocationMetrics(
  seedValidationPointsOrInput: readonly SeedAllocationPoint[] | {
    seedValidationPoints: readonly SeedAllocationPoint[]
    descendantPoints: readonly SeedAllocationPoint[]
  },
  descendantPointsArgument?: readonly SeedAllocationPoint[],
): GlobalSeedAllocationMetrics {
  const objectInput = !Array.isArray(seedValidationPointsOrInput) &&
    'seedValidationPoints' in seedValidationPointsOrInput
  const seedValidationPoints: readonly SeedAllocationPoint[] = objectInput
    ? seedValidationPointsOrInput.seedValidationPoints
    : seedValidationPointsOrInput as readonly SeedAllocationPoint[]
  const descendantPoints: readonly SeedAllocationPoint[] = objectInput
    ? seedValidationPointsOrInput.descendantPoints
    : (descendantPointsArgument ?? [])
  seedValidationPoints.forEach((point, index) => validatePoint(point, `seedValidationPoints[${index}]`, 'seed-validation'))
  descendantPoints.forEach((point, index) => validatePoint(point, `descendantPoints[${index}]`, 'descendant'))

  const initialSelectedBest = seedValidationPoints.length === 0
    ? null
    : selectBestPoint(seedValidationPoints)
  let selectedBest = initialSelectedBest
  let selectedBestChanges = 0
  let firstUsefulDescendantEvaluation: number | null = null
  let globalParetoFrontier = seedValidationFrontier(seedValidationPoints)
  const descendantOnlyFrontier: SeedAllocationPoint[] = []
  let paretoNovelAgainstSeedBaselines = 0
  let paretoNovelDescendantsOnly = 0
  let referenceImprovements = 0
  let descendantEvaluationsToBestResult: number | null = null

  descendantPoints.forEach((point, index) => {
    const candidate = clonePoint(point)
    if (addToParetoFrontier(descendantOnlyFrontier, candidate)) paretoNovelDescendantsOnly += 1
    if (addToParetoFrontier(globalParetoFrontier, candidate)) paretoNovelAgainstSeedBaselines += 1
    if (candidate.referenceImproved) referenceImprovements += 1
    if (selectedBest === null || selectorPrefers(candidate, selectedBest)) {
      selectedBest = candidate
      selectedBestChanges += 1
      if (firstUsefulDescendantEvaluation === null) firstUsefulDescendantEvaluation = index + 1
      descendantEvaluationsToBestResult = index + 1
    }
  })

  const improvementPerDescendantEvaluation = selectedBest !== null &&
    initialSelectedBest !== null && descendantPoints.length > 0
    ? {
        rmseDb: (initialSelectedBest.canonicalRmseDb - selectedBest.canonicalRmseDb) / descendantPoints.length,
        maxAbsDb: (initialSelectedBest.canonicalMaxAbsDb - selectedBest.canonicalMaxAbsDb) / descendantPoints.length,
      }
    : null
  return {
    initialSelectedBest,
    selectedBest,
    globalParetoFrontier,
    paretoNovelDescendants: paretoNovelAgainstSeedBaselines,
    paretoNovelAgainstSeedBaselines,
    paretoNovelDescendantsOnly,
    selectedBestChanges,
    referenceImprovements,
    firstUsefulDescendantEvaluation,
    descendantEvaluationsToBestResult,
    improvementPerDescendantEvaluation,
  }
}

function executeArm<T extends SeedAllocationSeed>(
  pool: readonly T[],
  allocations: readonly SeedWorkAllocation[],
  runSeed: EqualizedSeedAllocationInput<T>['runSeed'],
): SeedAllocationArmResult {
  const byId = new Map(pool.map((seed) => [seed.seedId, seed]))
  const seen = new Set<string>()
  const perSeed = allocations.map((allocation) => {
    if (seen.has(allocation.seedId)) throw new Error('seed allocation must not double count a seed')
    seen.add(allocation.seedId)
    const seed = byId.get(allocation.seedId)
    if (seed === undefined) throw new Error('seed allocation refers to a non-frozen seed')
    return validateOutcome(runSeed({ seed: cloneSeed(seed), descendantWorkTarget: allocation.descendantWorkTarget }), seed, allocation)
  })
  const seedValidationEvaluations = perSeed.reduce((sum, entry) => sum + entry.seedValidationEvaluations, 0)
  const descendantProposalEvaluations = perSeed.reduce((sum, entry) => sum + entry.descendantProposalEvaluations, 0)
  const totalStructuralCandidateEvaluations = perSeed.reduce((sum, entry) => sum + entry.totalStructuralCandidateEvaluations, 0)
  const global = aggregateGlobalSeedAllocationMetrics({
    seedValidationPoints: perSeed.flatMap((entry) => entry.seedValidationPoints ?? []),
    descendantPoints: perSeed.flatMap((entry) => entry.descendantPoints ?? []),
  })
  return {
    allocations: allocations.map((allocation) => ({ ...allocation })),
    perSeed,
    seedValidationEvaluations,
    descendantProposalEvaluations,
    totalStructuralCandidateEvaluations,
    global,
    globalParetoNovelDescendants: global.paretoNovelDescendants,
    globalParetoNovelAgainstSeedBaselines: global.paretoNovelAgainstSeedBaselines,
    globalParetoNovelDescendantsOnly: global.paretoNovelDescendantsOnly,
    globalSelectedBestChanges: global.selectedBestChanges,
    globalReferenceImprovements: global.referenceImprovements,
  }
}

export function runEqualizedSeedAllocation<T extends SeedAllocationSeed>(
  input: EqualizedSeedAllocationInput<T>,
): EqualizedSeedAllocationResult<T> {
  positiveInteger(input.targetDescendantEvaluations, 'target descendant evaluations')
  positiveInteger(input.distributedSeedCount, 'distributed seed count')
  const pool = freezeSeedPool(input.pool)
  const primary = selectPrimarySeed(pool)
  const distributedAllocations = allocateDistributedSeedWork(
    pool,
    input.targetDescendantEvaluations,
    input.distributedSeedCount,
    primary.seedId,
  )
  const concentratedAllocations = [{
    seedId: primary.seedId,
    descendantWorkTarget: input.targetDescendantEvaluations,
  }]
  const concentrated = executeArm(pool, concentratedAllocations, input.runSeed)
  const distributed = executeArm(pool, distributedAllocations, input.runSeed)
  const consumesAssignedWork = (arm: SeedAllocationArmResult): boolean =>
    arm.perSeed.every((entry) => entry.descendantProposalEvaluations === entry.descendantWorkTarget)
  const equalized = concentrated.descendantProposalEvaluations === input.targetDescendantEvaluations &&
    distributed.descendantProposalEvaluations === input.targetDescendantEvaluations &&
    consumesAssignedWork(concentrated) && consumesAssignedWork(distributed)
  const diversityExercised = distributed.perSeed.every((entry) =>
    entry.descendantWorkTarget >= 1 && entry.descendantsProduced >= 1)
  const reason = !equalized
    ? 'descendant work was not exactly equalized'
    : !diversityExercised
      ? 'distributed seed has zero descendants; diversity was not exercised'
      : 'exact descendant work equalized and every distributed seed exercised'
  return {
    frozenSeedPool: pool.map(cloneSeed),
    frozenSeedIds: pool.map((seed) => seed.seedId),
    primarySeedId: primary.seedId,
    alternateSeedIds: distributedAllocations
      .map((allocation) => allocation.seedId)
      .filter((seedId) => seedId !== primary.seedId),
    targetDescendantEvaluations: input.targetDescendantEvaluations,
    concentrated: { ...concentrated, concentratedSeedId: primary.seedId },
    distributed,
    equalization: {
      status: equalized ? 'equalized' : 'not-equalized',
      causalClaimAllowed: equalized && diversityExercised,
      reason,
    },
  }
}
