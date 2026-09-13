import {
  cascadeMagnitudeDb,
  createEvaluationGrid,
  DEFAULT_AUTOEQ_SETTINGS,
  MVP_NUMERIC_POLICY,
  type AutoEqSettings,
  type Curve,
  type Filter,
  type Normalization,
  type StandardAutoEqInputV2,
} from '../src/index.js'

export interface V2BenchmarkCase extends StandardAutoEqInputV2 {
  id: string
  category: 'solvable' | 'stress'
}

const frequencies = createEvaluationGrid()
const normalization: Normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 }

const filter = (
  type: Filter['type'], frequencyHz: number, gainDb: number, q: number,
): Filter => ({ id: '', enabled: true, type, frequencyHz, gainDb, q })

export function createV2BenchmarkCase(
  id: string,
  desiredFilters: readonly Filter[],
  category: V2BenchmarkCase['category'] = 'solvable',
  settings: AutoEqSettings = { ...DEFAULT_AUTOEQ_SETTINGS },
): V2BenchmarkCase {
  const desiredDb = cascadeMagnitudeDb(
    desiredFilters,
    frequencies,
    MVP_NUMERIC_POLICY.sampleRateHz,
  )
  const curve = (kind: Curve['kind'], db: readonly number[]): Curve => ({
    id: `${id}-${kind}`,
    name: `${id} ${kind}`,
    kind,
    rawPoints: frequencies.map((frequencyHz, index) => ({ frequencyHz, db: db[index]! })),
    metadata: { synthetic: true, benchmarkCase: id },
  })
  return {
    id,
    category,
    source: curve('fr', desiredDb.map((value) => -value)),
    target: curve('target', frequencies.map(() => 0)),
    normalization: { ...normalization },
    settings: { ...settings },
  }
}

export const V2_BENCHMARK_CASES: readonly V2BenchmarkCase[] = [
  createV2BenchmarkCase('bass_mid_mix', [
    filter('LS', 120, 5, 0.7), filter('PK', 700, -2.8, 1.4), filter('PK', 2_400, 3.2, 2.2),
  ]),
  createV2BenchmarkCase('alternating_2_8k', [
    filter('PK', 2_200, 3, 2.4), filter('PK', 3_300, -3.8, 3),
    filter('PK', 4_800, 3.4, 3.8), filter('PK', 7_100, -2.8, 3.2),
  ]),
  createV2BenchmarkCase('dense_treble', [
    filter('PK', 6_200, 2.6, 4), filter('PK', 8_100, -3.2, 5),
    filter('PK', 10_400, 2.5, 4.2), filter('PK', 13_600, -2.2, 3.5),
    filter('PK', 17_000, 1.6, 2.5),
  ]),
  createV2BenchmarkCase('mixed_widths', [
    filter('LS', 95, 3, 0.7), filter('PK', 450, -2, 0.8),
    filter('PK', 1_800, 4.5, 2), filter('PK', 3_900, -5, 7),
    filter('HS', 11_500, 2, 0.7),
  ]),
  createV2BenchmarkCase('overlap', [
    filter('PK', 900, 2.5, 0.9), filter('PK', 1_400, -3, 1.2),
    filter('PK', 2_100, 3.5, 1.6), filter('PK', 3_100, -2.5, 2),
  ]),
  createV2BenchmarkCase('near_budget', [
    filter('PK', 90, 2, 1.2), filter('PK', 220, -2.4, 1.5),
    filter('PK', 520, 2.8, 1.8), filter('PK', 1_200, -3, 2),
    filter('PK', 2_600, 3.2, 2.4), filter('PK', 5_200, -3, 2.8),
    filter('PK', 9_000, 2.5, 3), filter('PK', 15_000, -2, 2.5),
  ], 'solvable', { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 }),
  createV2BenchmarkCase('quantization_sensitive', [
    filter('PK', 1_235, 4, 1.76), filter('PK', 4_567, -2.3, 2.37),
  ]),
  createV2BenchmarkCase('overcomplete_compress', [
    filter('LS', 110, 2.5, 0.7), filter('PK', 500, -2.2, 0.9),
    filter('PK', 1_300, 3.5, 1.7), filter('PK', 2_600, -3.8, 2.5),
    filter('PK', 5_200, 3, 3.2), filter('HS', 12_000, -2, 0.7),
  ], 'solvable', { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 6 }),
  createV2BenchmarkCase('stress_mid_treble', [
    filter('PK', 1_800, 3.5, 1.4), filter('PK', 2_400, -4, 4.5),
    filter('PK', 3_200, 3.8, 5.5), filter('PK', 4_100, -3.6, 6),
    filter('PK', 5_400, 3.2, 5), filter('PK', 7_000, -3, 4.5),
    filter('PK', 9_000, 2.8, 4), filter('PK', 12_000, -2.6, 3.5),
    filter('PK', 16_500, 2, 3),
  ], 'stress'),
  createV2BenchmarkCase('stress_mixed_edges', [
    filter('LS', 85, 4, 0.7), filter('PK', 180, -2.5, 2),
    filter('PK', 900, 3, 1), filter('PK', 2_800, -4, 5),
    filter('PK', 6_200, 3.5, 6), filter('PK', 8_500, -3.5, 6),
    filter('PK', 13_000, 2.5, 4), filter('HS', 15_500, -2, 0.7),
  ], 'stress'),
]
