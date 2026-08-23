import { createLogGrid } from '../curves/grid.js'

export const MVP_NUMERIC_POLICY = Object.freeze({
  sampleRateHz: 48_000,
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  evaluationPointsPerOctave: 96,
})

export function createEvaluationGrid(): number[] {
  return createLogGrid(
    MVP_NUMERIC_POLICY.minFrequencyHz,
    MVP_NUMERIC_POLICY.maxFrequencyHz,
    MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  )
}
