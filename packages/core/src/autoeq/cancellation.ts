import { biquadMagnitudeDb, validateResponseInput } from '../dsp/response.js'
import type { Filter } from '../types/filter.js'
import type { CancellationAudit, CancellationPair } from './types.js'

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dotProduct = 0
  let leftSquared = 0
  let rightSquared = 0
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index]! * right[index]!
    leftSquared += left[index]! ** 2
    rightSquared += right[index]! ** 2
  }
  if (leftSquared === 0 || rightSquared === 0) return 0
  return dotProduct / Math.sqrt(leftSquared * rightSquared)
}

export function auditCancellations(
  filters: readonly Filter[],
  frequencies: readonly number[],
  sampleRateHz: number,
): CancellationAudit {
  validateResponseInput(frequencies, sampleRateHz)
  const qualifyingCount = filters.filter((filter) => filter.enabled && filter.gainDb !== 0).length
  if (qualifyingCount < 2) return { pairs: [], totalScore: 0 }
  const hasPotentialPair = filters.some((left, leftIndex) =>
    left.enabled && left.gainDb !== 0 && filters.slice(leftIndex + 1).some((right) =>
      right.enabled &&
      right.gainDb !== 0 &&
      Math.sign(left.gainDb) !== Math.sign(right.gainDb) &&
      Math.abs(Math.log2(left.frequencyHz / right.frequencyHz)) <= 1
    )
  )
  if (!hasPotentialPair) return { pairs: [], totalScore: 0 }

  const responses = filters.map((filter) =>
    filter.enabled && filter.gainDb !== 0
      ? biquadMagnitudeDb(filter, frequencies, sampleRateHz).map(Math.abs)
      : null
  )
  const pairs: CancellationPair[] = []

  for (let leftIndex = 0; leftIndex < filters.length; leftIndex += 1) {
    const left = filters[leftIndex]!
    if (responses[leftIndex] === null) continue
    for (let rightIndex = leftIndex + 1; rightIndex < filters.length; rightIndex += 1) {
      const right = filters[rightIndex]!
      if (responses[rightIndex] === null || Math.sign(left.gainDb) === Math.sign(right.gainDb)) {
        continue
      }

      const octaveDistance = Math.abs(Math.log2(left.frequencyHz / right.frequencyHz))
      if (octaveDistance > 1) continue
      const similarity = cosineSimilarity(responses[leftIndex]!, responses[rightIndex]!)
      const score = similarity *
        (1 - octaveDistance) *
        Math.min(Math.abs(left.gainDb), Math.abs(right.gainDb)) / 15
      if (score < 0.35) continue

      pairs.push({
        filterAId: left.id,
        filterBId: right.id,
        score,
        severity: score >= 0.65 ? 'strong' : 'moderate',
      })
    }
  }

  return {
    pairs,
    totalScore: pairs.reduce((sum, pair) => sum + pair.score, 0),
  }
}
