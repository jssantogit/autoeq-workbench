import { MVP_NUMERIC_POLICY } from '../config/numericPolicy.js'
import { interpolateLogFrequency } from '../curves/interpolate.js'
import { cascadeMagnitudeDb } from '../dsp/cascade.js'
import type { Filter } from '../types/filter.js'

export interface GraphicEqPoint {
  frequencyHz: number
  gainDb: number
}

function sourceRawFrequencies(): number[] {
  return new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0072)))
    .fill(null)
    .map((_, index) => 20 * Math.pow(1.0072, index))
}

function sourceGraphicFrequencies(): number[] {
  return Array.from(
    new Set(
      new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0563)))
        .fill(null)
        .map((_, index) => Math.floor(20 * Math.pow(1.0563, index))),
    ),
  )
    .filter((frequencyHz) => frequencyHz >= 20 && frequencyHz <= 20_000)
    .sort((left, right) => left - right)
}

export function averageResponseBins(
  rawFrequencies: readonly number[],
  rawGains: readonly number[],
  graphicFrequencies: readonly number[],
): number[] {
  const rawResponse = rawFrequencies.map((frequencyHz, index) => ({
    frequencyHz,
    db: rawGains[index]!,
  }))
  const interpolatedGains = interpolateLogFrequency(rawResponse, graphicFrequencies)
  let rawIndex = 0

  return graphicFrequencies.map((frequencyHz, index) => {
    const nextFrequencyHz = graphicFrequencies[index + 1]
    const upperBoundary =
      nextFrequencyHz === undefined
        ? MVP_NUMERIC_POLICY.maxFrequencyHz
        : Math.sqrt(frequencyHz * nextFrequencyHz)
    let gainSum = 0
    let sampleCount = 0

    while (rawIndex < rawFrequencies.length && rawFrequencies[rawIndex]! < upperBoundary) {
      gainSum += rawGains[rawIndex]!
      sampleCount += 1
      rawIndex += 1
    }

    return sampleCount === 0 ? interpolatedGains[index]! : gainSum / sampleCount
  })
}

export function createGraphicEq(
  filters: readonly Filter[],
  sampleRateHz = MVP_NUMERIC_POLICY.sampleRateHz,
): GraphicEqPoint[] {
  const rawFrequencies = sourceRawFrequencies()
  const rawGains = cascadeMagnitudeDb(filters, rawFrequencies, sampleRateHz)
  const graphicFrequencies = sourceGraphicFrequencies()
  const averagedGains = averageResponseBins(rawFrequencies, rawGains, graphicFrequencies)
  const maximumGain = Math.max(...averagedGains)

  return graphicFrequencies.map((frequencyHz, index) => ({
    frequencyHz,
    gainDb: averagedGains[index]! - maximumGain,
  }))
}

export function formatGraphicEq(
  filters: readonly Filter[],
  sampleRateHz = MVP_NUMERIC_POLICY.sampleRateHz,
): string {
  const pairs = createGraphicEq(filters, sampleRateHz).map(
    ({ frequencyHz, gainDb }) => `${frequencyHz} ${gainDb.toFixed(1)}`,
  )

  return `GraphicEQ: ${pairs.join('; ')}`
}
