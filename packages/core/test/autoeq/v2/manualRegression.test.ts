import { describe, expect, it } from 'vitest'

import {
  loadManualRegressionCases,
  MANUAL_REGRESSION_FIXTURE_SHA256,
  prepareManualRegressionDesired,
  type ManualRegressionCaseId,
} from '../../../benchmarks/research/manualRegression.js'

const EXPECTED_CASE_IDS: ManualRegressionCaseId[] = [
  'titan-to-mystic-8',
  'titan-to-rsv',
  'titan-to-s12-ultra',
]

describe('manual real-FR regression corpus', () => {
  it('loads the three exact uploaded fixtures', () => {
    const cases = loadManualRegressionCases()

    expect(cases.map((candidate) => candidate.id)).toEqual(EXPECTED_CASE_IDS)
    expect(Object.keys(MANUAL_REGRESSION_FIXTURE_SHA256)).toHaveLength(3)

    for (const regressionCase of cases) {
      expect(regressionCase.target.rawPoints).toHaveLength(480)
      expect(regressionCase.target.rawPoints.every(
        (point) => Number.isFinite(point.frequencyHz) && Number.isFinite(point.db),
      )).toBe(true)

      for (let index = 1; index < regressionCase.target.rawPoints.length; index += 1) {
        expect(
          regressionCase.target.rawPoints[index]!.frequencyHz,
        ).toBeGreaterThan(
          regressionCase.target.rawPoints[index - 1]!.frequencyHz,
        )
      }
    }
  })

  it.each(EXPECTED_CASE_IDS)('prepares a finite desired correction for %s', (caseId) => {
    const prepared = prepareManualRegressionDesired(caseId)

    expect(prepared.frequenciesHz.length).toBeGreaterThan(0)
    expect(prepared.desiredDb).toHaveLength(prepared.frequenciesHz.length)
    expect(prepared.frequenciesHz.every(Number.isFinite)).toBe(true)
    expect(prepared.desiredDb.every(Number.isFinite)).toBe(true)
  })
})
