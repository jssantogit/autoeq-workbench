import { cascadeMagnitudeDb } from '../../src/dsp/cascade.js'
import { createEvaluationGrid, MVP_NUMERIC_POLICY } from '../../src/config/numericPolicy.js'
import { calculateErrorMetrics } from '../../src/metrics/errorMetrics.js'
import { MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET, resolveStructuralSearchConfig } from '../../src/autoeq/v2/structuralSearch.js'
import type { Filter } from '../../src/types/filter.js'
import type { SchedulerDecisionSearchRunner, SchedulerDecisionSnapshot } from '../../src/autoeq/v2/decisionOracle.js'
import {
  runFixedCapacityTrajectory,
  type FixedCapacityTrajectoryOptions,
  type FixedCapacityTrajectoryResult,
} from './fixedCapacity.js'

export type SyntheticGroundTruthFamily =
  | 'easy-broadband'
  | 'sparse-structural'
  | 'mixed-shelf-peaks'
  | 'dense-known-structure'
  | 'high-q-valid'
  | 'upper-frequency-structure'
  | 'broad-deep-dip'
  | 'alternating-structure'

export interface SyntheticGroundTruthCase {
  id: string
  family: SyntheticGroundTruthFamily
  seed: number
  sampleRateHz: number
  frequenciesHz: number[]
  desiredDb: number[]
  truthFilters: Filter[]
  knownStructuralComplexity: number
}

function filter(
  id: string,
  type: Filter['type'],
  frequencyHz: number,
  gainDb: number,
  q = 1,
): Filter {
  return { id, enabled: true, type, frequencyHz, gainDb, q: type === 'PK' ? q : 0.7 }
}

interface SyntheticDefinition {
  id: string
  family: SyntheticGroundTruthFamily
  seed: number
  truthFilters: Filter[]
}

/** Explicit definitions are the seed/provenance; no random generator is involved. */
const SYNTHETIC_DEFINITIONS: readonly SyntheticDefinition[] = Object.freeze([
  {
    id: 'synthetic-a-easy-broadband',
    family: 'easy-broadband',
    seed: 1101,
    truthFilters: [
      filter('a-ls', 'LS', 180, 4),
      filter('a-hs', 'HS', 8_000, -3),
    ],
  },
  {
    id: 'synthetic-b-sparse-structural',
    family: 'sparse-structural',
    seed: 1201,
    truthFilters: [
      filter('b-pk-low', 'PK', 250, 3, 1.1),
      filter('b-pk-mid', 'PK', 1_000, -4, 1.3),
      filter('b-pk-high', 'PK', 4_000, 3.5, 1.2),
    ],
  },
  {
    id: 'synthetic-c-mixed-shelf-peaks',
    family: 'mixed-shelf-peaks',
    seed: 1301,
    truthFilters: [
      filter('c-ls', 'LS', 160, -5),
      filter('c-pk-low', 'PK', 700, 3, 1),
      filter('c-pk-mid', 'PK', 2_500, -2.5, 1.5),
      filter('c-hs', 'HS', 9_500, 4),
    ],
  },
  {
    id: 'synthetic-d-dense-known-structure',
    family: 'dense-known-structure',
    seed: 1401,
    truthFilters: [
      filter('d-1', 'PK', 180, 2.5, 1.2),
      filter('d-2', 'PK', 350, -3, 1.1),
      filter('d-3', 'PK', 700, 3, 1.3),
      filter('d-4', 'PK', 1_400, -2.5, 1.2),
      filter('d-5', 'PK', 2_800, 3.5, 1.1),
      filter('d-6', 'PK', 5_600, -3.5, 1.4),
      filter('d-7', 'PK', 10_000, 3, 1.2),
      filter('d-8', 'PK', 15_500, -2.5, 1.3),
      filter('d-9', 'PK', 1_100, 1.5, 0.8),
      filter('d-10', 'PK', 3_700, -1.8, 0.9),
      filter('d-11', 'PK', 7_400, 2, 1),
      filter('d-12', 'PK', 12_800, -1.5, 0.9),
    ],
  },
  {
    id: 'synthetic-e-high-q-valid',
    family: 'high-q-valid',
    seed: 1501,
    truthFilters: [
      filter('e-low', 'PK', 420, 3, 8),
      filter('e-mid', 'PK', 2_200, -3.5, 10),
      filter('e-high', 'PK', 7_800, 2.5, 6),
    ],
  },
  {
    id: 'synthetic-f-upper-frequency-structure',
    family: 'upper-frequency-structure',
    seed: 1601,
    truthFilters: [
      filter('f-8k', 'PK', 8_000, 3, 1.2),
      filter('f-12k', 'PK', 12_000, -4, 1.1),
      filter('f-16k', 'PK', 16_000, 3.5, 1.2),
    ],
  },
  {
    id: 'synthetic-g-broad-deep-dip',
    family: 'broad-deep-dip',
    seed: 1701,
    truthFilters: [
      filter('g-ls', 'LS', 160, -10),
      filter('g-pk', 'PK', 1_500, -7, 0.35),
      filter('g-hs', 'HS', 10_000, -6),
    ],
  },
  {
    id: 'synthetic-h-alternating-structure',
    family: 'alternating-structure',
    seed: 1801,
    truthFilters: [
      filter('h-1', 'PK', 200, 3, 1),
      filter('h-2', 'PK', 500, -3, 1),
      filter('h-3', 'PK', 1_200, 3, 1),
      filter('h-4', 'PK', 3_000, -3, 1),
      filter('h-5', 'PK', 7_500, 3, 1),
      filter('h-6', 'PK', 15_000, -3, 1),
    ],
  },
])

function createCase(definition: SyntheticDefinition): SyntheticGroundTruthCase {
  const frequenciesHz = createEvaluationGrid()
  const truthFilters = definition.truthFilters.map((value) => ({ ...value }))
  const desiredDb = cascadeMagnitudeDb(truthFilters, frequenciesHz, MVP_NUMERIC_POLICY.sampleRateHz)
  return {
    id: definition.id,
    family: definition.family,
    seed: definition.seed,
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    frequenciesHz,
    desiredDb,
    truthFilters,
    knownStructuralComplexity: truthFilters.length,
  }
}

const SYNTHETIC_CORPUS = SYNTHETIC_DEFINITIONS.map(createCase)

function cloneCase(value: SyntheticGroundTruthCase): SyntheticGroundTruthCase {
  return {
    ...value,
    frequenciesHz: [...value.frequenciesHz],
    desiredDb: [...value.desiredDb],
    truthFilters: value.truthFilters.map((filterValue) => ({ ...filterValue })),
  }
}

export function loadSyntheticGroundTruthCorpus(): SyntheticGroundTruthCase[] {
  return SYNTHETIC_CORPUS.map(cloneCase)
}

/** Resource probes around the known representation requirement, not modes. */
export function createSyntheticCapacityProbeSequence(
  value: Pick<SyntheticGroundTruthCase, 'knownStructuralComplexity'>,
): number[] {
  const complexity = value.knownStructuralComplexity
  if (!Number.isSafeInteger(complexity) || complexity <= 1) {
    throw new Error('Synthetic cases require structural complexity greater than one for below/at/above probes')
  }
  return [complexity - 1, complexity, complexity + 1]
}

export interface SyntheticCapacityThresholdProbeOptions extends Omit<FixedCapacityTrajectoryOptions, 'capacity'> {
  run?: SchedulerDecisionSearchRunner
}

export interface SyntheticCapacityThresholdProbeResult {
  caseId: string
  knownStructuralComplexity: number
  ceilings: number[]
  trajectories: FixedCapacityTrajectoryResult[]
}

function syntheticSnapshot(value: SyntheticGroundTruthCase, maximumCapacity: number): SchedulerDecisionSnapshot {
  const baseConfig = resolveStructuralSearchConfig({
    preset: MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET,
    timeLimitSeconds: 5,
  })
  const initial = calculateErrorMetrics(value.desiredDb, value.frequenciesHz)
  return {
    desiredDb: [...value.desiredDb],
    frequencies: [...value.frequenciesHz],
    sampleRateHz: value.sampleRateHz,
    baseConfig,
    incumbent: { filters: [], rmseDb: initial.rmseDb, maxAbsDb: initial.maxAbsDb },
    currentCapacity: Math.min(...createSyntheticCapacityProbeSequence(value)),
    maximumCapacity,
    effortLevel: 0,
  }
}

/** Run below/at/above known-complexity probes as matched fixed trajectories. */
export function runSyntheticCapacityThresholdProbe(
  value: SyntheticGroundTruthCase,
  options: SyntheticCapacityThresholdProbeOptions = {},
): SyntheticCapacityThresholdProbeResult {
  const ceilings = createSyntheticCapacityProbeSequence(value)
  const snapshot = syntheticSnapshot(value, ceilings.at(-1)!)
  const trajectories = ceilings.map((capacity) => runFixedCapacityTrajectory(snapshot, {
    ...options,
    capacity,
  }))
  return {
    caseId: value.id,
    knownStructuralComplexity: value.knownStructuralComplexity,
    ceilings,
    trajectories,
  }
}
