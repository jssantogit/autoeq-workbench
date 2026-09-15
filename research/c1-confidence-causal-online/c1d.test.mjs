import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIMARY_GROUP_IDS, BATCH_C_TOKEN, buildArmCorrections, classifyObservation,
  classifyGroup, classifyCampaign, validateModel, assertWritablePath,
} from './c1d.mjs'

const grid = [3000, 4000, 6000, 14000, 15000]
const weights = [0.2, 0.4, 0.8, 0.6, 0.3]

test('frozen model validation fails closed on a hash mismatch', () => {
  assert.throws(() => validateModel({ modelSha256: 'bad' }, '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'))
})
test('Batch C is explicitly rejected', () => assert.throws(() => assertWritablePath(BATCH_C_TOKEN)))
test('primary IDs are exactly the six C1c holdouts and C1b cannot enter', () => {
  assert.equal(PRIMARY_GROUP_IDS.length, 6)
  assert.equal(new Set(PRIMARY_GROUP_IDS).size, 6)
  assert.equal(PRIMARY_GROUP_IDS.includes('c1g-0a8d256822943d659136'), false)
})
test('arms implement minus disagreement, pointwise confidence, constant authority and unity outside band', () => {
  const arms = buildArmCorrections(grid, [1, -2, 3, -4, 5], weights)
  assert.deepEqual(arms.baseline, [-1, 2, -3, 4, -5])
  assert.equal(arms.constant[0], -1); assert.equal(arms.confidence[0], -1)
  assert.equal(arms.constant[4], -5); assert.equal(arms.confidence[4], -5)
  assert.equal(arms.confidence[1], 0.8); assert.ok(Math.abs(arms.confidence[2] + 2.4) < 1e-12)
  assert.ok(Math.abs(arms.wBar - 0.6) < 1e-12)
  assert.ok(Math.abs((arms.constant[1] / arms.baseline[1] + arms.constant[2] / arms.baseline[2] + arms.constant[3] / arms.baseline[3]) / 3 - (weights[1] + weights[2] + weights[3]) / 3) < 1e-12)
})
test('zero disagreement produces zero desired correction', () => assert.deepEqual(buildArmCorrections(grid, [0,0,0,0,0], weights).confidence, [0,0,0,0,0]))
test('an observation needs both five-percent gains', () => {
  assert.equal(classifyObservation({ baseline: 1, constant: 1, confidence: .95 }).classification, 'CAUSAL_CONFIDENCE_WIN')
  assert.equal(classifyObservation({ baseline: 1, constant: 1, confidence: .96 }).classification, 'CAUSAL_CONFIDENCE_LOSS')
  assert.equal(classifyObservation({ baseline: 1, constant: .9, confidence: .9 }).classification, 'CAUSAL_CONFIDENCE_LOSS')
})
test('strict majority rejects Salnotes-like one of two and inconclusive does not signal', () => {
  assert.equal(classifyGroup([{classification:'CAUSAL_CONFIDENCE_WIN', combinedGain:.1},{classification:'CAUSAL_CONFIDENCE_LOSS',combinedGain:0}]).classification, 'NO_CAUSAL_CONFIDENCE_SIGNAL')
  assert.equal(classifyGroup([{classification:'INCONCLUSIVE'}]).classification, 'INCONCLUSIVE')
})
test('campaign gate passes four of six and fails three of six; secondary is irrelevant', () => {
  const yes = {classification:'CAUSAL_CONFIDENCE_SIGNAL'}, no = {classification:'NO_CAUSAL_CONFIDENCE_SIGNAL'}
  assert.equal(classifyCampaign([yes,yes,yes,yes,no,no]).classification, 'C1D_CAUSAL_INTEGRATION_SUPPORTED')
  assert.equal(classifyCampaign([yes,yes,yes,no,no,no]).classification, 'C1D_CAUSAL_INTEGRATION_NOT_SUPPORTED')
})
