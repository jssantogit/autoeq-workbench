import type { V2BenchmarkCase } from './v2Cases.js'
import { createV2BenchmarkCase } from './v2Cases.js'

const pk = (frequencyHz: number, gainDb: number, q: number) => ({
  id: '', enabled: true as const, type: 'PK' as const, frequencyHz, gainDb, q,
})

export const V2_HOLDOUT_CASES: readonly V2BenchmarkCase[] = [
  createV2BenchmarkCase('holdout_solvable_a', [
    { id: '', enabled: true, type: 'LS', frequencyHz: 140, gainDb: 3.5, q: 0.7 },
    pk(1_700, -3, 1.9), pk(6_400, 2.7, 3.4),
    { id: '', enabled: true, type: 'HS', frequencyHz: 14_500, gainDb: -1.5, q: 0.7 },
  ]),
  createV2BenchmarkCase('holdout_solvable_b', [
    pk(350, 2.2, 0.8), pk(2_800, -4.2, 4.8), pk(7_600, 3, 5.2), pk(11_800, -2.4, 3.1),
  ]),
  createV2BenchmarkCase('holdout_stress', [
    pk(2_100, 3.2, 2), pk(2_900, -3.4, 5), pk(3_900, 3.3, 5.5),
    pk(5_200, -3.1, 5), pk(7_300, 2.9, 4.5), pk(10_500, -2.7, 4),
    pk(16_000, 2, 3),
  ], 'stress'),
]
