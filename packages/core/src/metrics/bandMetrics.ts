import { calculateErrorMetrics, type ErrorMetrics } from './errorMetrics.js'
import { CoreError } from '../types/error.js'

export interface MetricBand {
  id: string
  minHz: number
  maxHz: number
}

export interface BandMetric extends ErrorMetrics, MetricBand {}

export function calculateBandMetrics(
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bands: readonly MetricBand[],
): BandMetric[] {
  calculateErrorMetrics(residualDb, frequenciesHz)
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new CoreError('validation', 'Metric bands must be a non-empty array')
  }

  return bands.map((band) => {
    if (
      !Number.isFinite(band.minHz) ||
      !Number.isFinite(band.maxHz) ||
      band.minHz > band.maxHz
    ) {
      throw new CoreError('validation', 'Metric band bounds must be finite and non-inverted')
    }

    const selectedIndices = frequenciesHz.flatMap((frequencyHz, index) =>
      frequencyHz >= band.minHz && frequencyHz <= band.maxHz ? [index] : [],
    )
    if (selectedIndices.length === 0) {
      throw new CoreError('validation', `Metric band ${band.id} contains no frequency samples`)
    }

    return {
      ...band,
      ...calculateErrorMetrics(
        selectedIndices.map((index) => residualDb[index]!),
        selectedIndices.map((index) => frequenciesHz[index]!),
      ),
    }
  })
}
