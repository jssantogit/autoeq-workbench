export interface SeedAllocationSeed {
  seedId: string
  origin: string
  semanticKey: string
  selectionKey: string
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
}

export interface SeedWorkAllocation {
  seedId: string
  observedWorkTarget: number
}

export interface SeedAllocationOutcome {
  seedId: string
  observedStructuralEvaluations: number
  usefulSeedImprovements: number
  paretoNovelDescendants: number
  firstUsefulImprovementEvaluation: number | null
  bestResultEvaluation: number | null
}

export interface SeedAllocationPerSeedResult extends SeedWorkAllocation, SeedAllocationOutcome {}

export interface EqualizedSeedAllocationInput<T extends SeedAllocationSeed> {
  pool: readonly T[]
  targetObservedStructuralEvaluations: number
  distributedSeedCount: number
  runSeed: (input: { seed: T; observedWorkTarget: number }) => SeedAllocationOutcome
}

export interface EqualizedSeedAllocationResult {
  frozenSeedIds: string[]
  concentrated: {
    concentratedSeedId: string
    allocations: SeedWorkAllocation[]
    perSeed: SeedAllocationPerSeedResult[]
    observedStructuralEvaluations: number
  }
  distributed: {
    allocations: SeedWorkAllocation[]
    perSeed: SeedAllocationPerSeedResult[]
    observedStructuralEvaluations: number
  }
  equalization: { status: 'equalized' | 'not-equalized'; causalClaimAllowed: boolean }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
}

function cloneSeed<T extends SeedAllocationSeed>(seed: T): T {
  const copy = { ...seed } as T
  const candidate = seed as T & { filters?: readonly unknown[] }
  if (Array.isArray(candidate.filters)) {
    Object.assign(copy, { filters: candidate.filters.map((filter) =>
      filter !== null && typeof filter === 'object' ? { ...filter } : filter,
    ) })
  }
  return copy
}

export function freezeSeedPool<T extends SeedAllocationSeed>(seeds: readonly T[]): T[] {
  if (seeds.length === 0) throw new Error('seed pool must not be empty')
  const seedIds = new Set<string>()
  const semanticKeys = new Set<string>()
  for (const [index, seed] of seeds.entries()) {
    if (seed.seedId.length === 0 || seed.semanticKey.length === 0 || seed.selectionKey.length === 0) {
      throw new Error(`seed provenance keys are required at index ${index}`)
    }
    if (!Number.isFinite(seed.canonicalRmseDb) || !Number.isFinite(seed.canonicalMaxAbsDb)) {
      throw new Error('seed canonical entry metrics must be finite')
    }
    if (seedIds.has(seed.seedId)) throw new Error('seed ID must be unique')
    seedIds.add(seed.seedId)
    if (semanticKeys.has(seed.semanticKey)) throw new Error('seed semantic key must be unique')
    semanticKeys.add(seed.semanticKey)
  }
  return seeds.map(cloneSeed).sort((left, right) =>
    left.selectionKey.localeCompare(right.selectionKey) || left.semanticKey.localeCompare(right.semanticKey) ||
    left.seedId.localeCompare(right.seedId))
}

export function selectConcentratedSeed<T extends SeedAllocationSeed>(pool: readonly T[]): T {
  if (pool.length === 0) throw new Error('concentrated allocation requires a frozen seed')
  return pool[0]!
}

export function allocateDistributedSeedWork<T extends SeedAllocationSeed>(
  pool: readonly T[],
  targetObservedStructuralEvaluations: number,
  distributedSeedCount: number,
): SeedWorkAllocation[] {
  positiveInteger(targetObservedStructuralEvaluations, 'target observed structural evaluations')
  positiveInteger(distributedSeedCount, 'distributed seed count')
  if (distributedSeedCount > pool.length) throw new Error('distributed seed count exceeds frozen pool')
  if (distributedSeedCount > targetObservedStructuralEvaluations) {
    throw new Error('distributed seed count exceeds observed work target')
  }
  const base = Math.floor(targetObservedStructuralEvaluations / distributedSeedCount)
  const remainder = targetObservedStructuralEvaluations % distributedSeedCount
  return pool.slice(0, distributedSeedCount).map((seed, index) => ({
    seedId: seed.seedId,
    observedWorkTarget: base + (index < remainder ? 1 : 0),
  }))
}

function executeArm<T extends SeedAllocationSeed>(
  pool: readonly T[],
  allocations: readonly SeedWorkAllocation[],
  runSeed: EqualizedSeedAllocationInput<T>['runSeed'],
): { perSeed: SeedAllocationPerSeedResult[]; observedStructuralEvaluations: number } {
  const byId = new Map(pool.map((seed) => [seed.seedId, seed]))
  const seen = new Set<string>()
  const perSeed = allocations.map((allocation) => {
    if (seen.has(allocation.seedId)) throw new Error('seed allocation must not double count a seed')
    seen.add(allocation.seedId)
    const seed = byId.get(allocation.seedId)
    if (seed === undefined) throw new Error('seed allocation refers to a non-frozen seed')
    positiveInteger(allocation.observedWorkTarget, 'seed observed work target')
    const outcome = runSeed({ seed: cloneSeed(seed), observedWorkTarget: allocation.observedWorkTarget })
    if (outcome.seedId !== seed.seedId) throw new Error('seed outcome provenance does not match allocation')
    nonNegativeInteger(outcome.observedStructuralEvaluations, 'observed structural evaluations')
    nonNegativeInteger(outcome.usefulSeedImprovements, 'useful seed improvements')
    nonNegativeInteger(outcome.paretoNovelDescendants, 'Pareto-novel descendants')
    if (outcome.firstUsefulImprovementEvaluation !== null) {
      positiveInteger(outcome.firstUsefulImprovementEvaluation, 'first useful improvement evaluation')
    }
    if (outcome.bestResultEvaluation !== null) positiveInteger(outcome.bestResultEvaluation, 'best result evaluation')
    return { ...allocation, ...outcome }
  })
  return {
    perSeed,
    observedStructuralEvaluations: perSeed.reduce((sum, entry) => sum + entry.observedStructuralEvaluations, 0),
  }
}

export function runEqualizedSeedAllocation<T extends SeedAllocationSeed>(
  input: EqualizedSeedAllocationInput<T>,
): EqualizedSeedAllocationResult {
  positiveInteger(input.targetObservedStructuralEvaluations, 'target observed structural evaluations')
  const pool = freezeSeedPool(input.pool)
  const concentratedSeed = selectConcentratedSeed(pool)
  const concentratedAllocations = [{
    seedId: concentratedSeed.seedId,
    observedWorkTarget: input.targetObservedStructuralEvaluations,
  }]
  const distributedAllocations = allocateDistributedSeedWork(
    pool,
    input.targetObservedStructuralEvaluations,
    input.distributedSeedCount,
  )
  const concentrated = executeArm(pool, concentratedAllocations, input.runSeed)
  const distributed = executeArm(pool, distributedAllocations, input.runSeed)
  const consumesAssignedWork = (arm: typeof concentrated | typeof distributed): boolean =>
    arm.perSeed.every((entry) => entry.observedStructuralEvaluations === entry.observedWorkTarget)
  const equalized = concentrated.observedStructuralEvaluations === input.targetObservedStructuralEvaluations &&
    distributed.observedStructuralEvaluations === input.targetObservedStructuralEvaluations &&
    consumesAssignedWork(concentrated) && consumesAssignedWork(distributed)
  return {
    frozenSeedIds: pool.map((seed) => seed.seedId),
    concentrated: { ...concentrated, concentratedSeedId: concentratedSeed.seedId, allocations: concentratedAllocations },
    distributed: { ...distributed, allocations: distributedAllocations },
    equalization: equalized
      ? { status: 'equalized', causalClaimAllowed: true }
      : { status: 'not-equalized', causalClaimAllowed: false },
  }
}
