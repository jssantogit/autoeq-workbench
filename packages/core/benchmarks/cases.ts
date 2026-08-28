import {
  cascadeMagnitudeDb,
  createEvaluationGrid,
  DEFAULT_AUTOEQ_SETTINGS,
  MVP_NUMERIC_POLICY,
  type AutoEqSettings,
  type Curve,
  type Filter,
  type Normalization,
  type StandardAutoEqInput,
} from '../src/index.js'

export interface BenchmarkCase extends StandardAutoEqInput {
  id: string
}

const normalization: Normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 }
const frequenciesHz = createEvaluationGrid()

function filter(
  id: string,
  type: Filter['type'],
  frequencyHz: number,
  gainDb: number,
  q: number,
): Filter {
  return { id, enabled: true, type, frequencyHz, gainDb, q }
}

function benchmarkCase(
  id: string,
  desiredFilters: readonly Filter[],
  settings: AutoEqSettings = { ...DEFAULT_AUTOEQ_SETTINGS },
): BenchmarkCase {
  const desiredDb = cascadeMagnitudeDb(
    desiredFilters,
    frequenciesHz,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const curve = (kind: Curve['kind'], db: readonly number[]): Curve => ({
    id: `${id}-${kind}`,
    name: `${id} ${kind}`,
    kind,
    rawPoints: frequenciesHz.map((frequencyHz, index) => ({ frequencyHz, db: db[index]! })),
    metadata: { synthetic: true, benchmarkCase: id },
  })

  return {
    id,
    source: curve('fr', desiredDb.map((value) => -value)),
    target: curve('target', frequenciesHz.map(() => 0)),
    normalization: { ...normalization },
    settings: { ...settings },
  }
}

export const BENCHMARK_CASES: readonly BenchmarkCase[] = [
  benchmarkCase('flat_identity', []),
  benchmarkCase('broad_bass_shelf', [filter('bass', 'LS', 120, 6, 0.7)]),
  benchmarkCase('single_mid_peak', [filter('mid', 'PK', 1000, 6, 2)]),
  benchmarkCase('vocal_multi_feature', [
    filter('low-mid-cut', 'PK', 300, -3, 1.2),
    filter('presence', 'PK', 1500, 5, 2),
    filter('upper-mid-cut', 'PK', 3500, -4, 2.5),
  ]),
  benchmarkCase('irregular_treble', [
    filter('lower-treble', 'PK', 6000, 4, 3),
    filter('treble-notch', 'PK', 9000, -5, 4),
    filter('air', 'PK', 13_000, 3, 2),
  ]),
  benchmarkCase('narrow_feature', [filter('narrow', 'PK', 2500, 8, 10)]),
  benchmarkCase(
    'filter_budget',
    [
      filter('budget-1', 'PK', 80, 4, 1.5),
      filter('budget-2', 'PK', 250, -4, 2),
      filter('budget-3', 'PK', 800, 5, 2),
      filter('budget-4', 'PK', 2500, -5, 2),
      filter('budget-5', 'PK', 7000, 4, 2),
    ],
    { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 3 },
  ),
  benchmarkCase('quantization_sensitive', [filter('off-grid', 'PK', 1234.56, 4.37, 1.37)]),
  benchmarkCase('preamp_overlap', [
    filter('overlap-low', 'LS', 120, 5, 0.7),
    filter('overlap-mid-1', 'PK', 500, 4, 1),
    filter('overlap-mid-2', 'PK', 1500, 3, 1.5),
  ]),
  benchmarkCase('opposing_filters_pressure', [
    filter('pressure-boost', 'PK', 1000, 8, 2),
    filter('pressure-cut', 'PK', 1300, -6, 2),
    filter('pressure-presence', 'PK', 3500, 4, 1.2),
  ]),
]
