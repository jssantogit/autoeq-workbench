import { createEvaluationGrid } from '../../src/config/numericPolicy.js'
import type { Curve } from '../../src/types/curve.js'

export const SYNTHETIC_RESEARCH_CASE_IDS = [
  'synthetic-narrow-peak',
  'synthetic-strong-shelf',
  'synthetic-resonance-cluster',
  'synthetic-alternating-sign',
  'synthetic-irregular-hf',
  'synthetic-boundary-pressure',
  'synthetic-filter-saturation',
  'synthetic-quantization-sensitive',
] as const

type SyntheticResearchCaseId = typeof SYNTHETIC_RESEARCH_CASE_IDS[number]

interface SyntheticCaseDefinition {
  id: SyntheticResearchCaseId
  tags: readonly string[]
  desiredCorrectionDb: (frequencyHz: number) => number
}

function gaussianLogFeature(
  frequencyHz: number,
  centerHz: number,
  widthOctaves: number,
  gainDb: number,
): number {
  const x = Math.log2(frequencyHz / centerHz) / widthOctaves
  return gainDb * Math.exp(-0.5 * x * x)
}

function highShelf(frequencyHz: number, centerHz: number, widthOctaves: number, gainDb: number): number {
  const x = Math.log2(frequencyHz / centerHz) / widthOctaves
  return gainDb / (1 + Math.exp(-x))
}

const syntheticDefinitions: readonly SyntheticCaseDefinition[] = [
  {
    id: 'synthetic-narrow-peak',
    tags: ['narrow-feature', 'high-q'],
    desiredCorrectionDb: (frequencyHz) => gaussianLogFeature(frequencyHz, 1_000, 0.06, 7),
  },
  {
    id: 'synthetic-strong-shelf',
    tags: ['shelf', 'broadband'],
    desiredCorrectionDb: (frequencyHz) => highShelf(frequencyHz, 1_200, 0.45, 10),
  },
  {
    id: 'synthetic-resonance-cluster',
    tags: ['resonance-cluster', 'overlap'],
    desiredCorrectionDb: (frequencyHz) => (
      gaussianLogFeature(frequencyHz, 1_000, 0.08, 4.5) +
      gaussianLogFeature(frequencyHz, 1_400, 0.1, -4) +
      gaussianLogFeature(frequencyHz, 2_000, 0.1, 3.5)
    ),
  },
  {
    id: 'synthetic-alternating-sign',
    tags: ['alternating-sign', 'opposing-filters'],
    desiredCorrectionDb: (frequencyHz) => [
      [200, 5], [350, -5], [700, 5], [1_400, -5], [2_800, 5],
    ].reduce(
      (sum, [centerHz, gainDb]) => sum + gaussianLogFeature(frequencyHz, centerHz, 0.08, gainDb),
      0,
    ),
  },
  {
    id: 'synthetic-irregular-hf',
    tags: ['irregular-treble', 'high-frequency'],
    desiredCorrectionDb: (frequencyHz) => {
      const x = Math.log2(frequencyHz / 4_000)
      const activation = 1 / (1 + Math.exp(-8 * x))
      return activation * (2.5 * Math.sin(9 * x) + 1.5 * Math.sin(17 * x + 0.7))
    },
  },
  {
    id: 'synthetic-boundary-pressure',
    tags: ['boundary', 'band-edge'],
    desiredCorrectionDb: (frequencyHz) => (
      gaussianLogFeature(frequencyHz, 20, 0.2, 6) +
      gaussianLogFeature(frequencyHz, 20_000, 0.2, -6)
    ),
  },
  {
    id: 'synthetic-filter-saturation',
    tags: ['filter-budget', 'many-features'],
    desiredCorrectionDb: (frequencyHz) => [
      [100, 5], [200, -5], [400, 5], [800, -5],
      [1_600, 5], [3_200, -5], [6_400, 5], [12_800, -5],
    ].reduce(
      (sum, [centerHz, gainDb]) => sum + gaussianLogFeature(frequencyHz, centerHz, 0.07, gainDb),
      0,
    ),
  },
  {
    id: 'synthetic-quantization-sensitive',
    tags: ['quantization', 'small-features'],
    desiredCorrectionDb: (frequencyHz) => (
      gaussianLogFeature(frequencyHz, 1_000, 0.035, 0.6) +
      gaussianLogFeature(frequencyHz, 1_200, 0.035, -0.6)
    ),
  },
]

function createCurve(id: string, name: string, kind: Curve['kind'], values: readonly number[]): Curve {
  const frequenciesHz = createEvaluationGrid()
  return {
    id,
    name,
    kind,
    rawPoints: frequenciesHz.map((frequencyHz, index) => ({ frequencyHz, db: values[index]! })),
    metadata: {},
  }
}

export function loadSyntheticResearchCases(): Array<{
  id: SyntheticResearchCaseId
  source: Curve
  target: Curve
  tags: readonly string[]
}> {
  const frequenciesHz = createEvaluationGrid()
  return syntheticDefinitions.map((definition) => {
    const sourceDb = frequenciesHz.map(() => 0)
    const targetDb = frequenciesHz.map(definition.desiredCorrectionDb)
    return {
      id: definition.id,
      source: createCurve(`${definition.id}-source`, `${definition.id} source`, 'fr', sourceDb),
      target: createCurve(`${definition.id}-target`, `${definition.id} target`, 'target', targetDb),
      tags: [...definition.tags],
    }
  })
}
