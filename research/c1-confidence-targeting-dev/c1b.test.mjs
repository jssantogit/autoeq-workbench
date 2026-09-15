import assert from 'node:assert/strict'
import test from 'node:test'

import {
  C1B_ALGORITHM_VERSION,
  C1B_PRIMARY_BAND_HZ,
  C1B_TARGET_SCALE_DB,
  CONFIDENCE_TARGETING_WIN,
  CONFIDENCE_TARGETING_SIGNAL,
  CONFIDENCE_TARGETING_DEV_SUPPORTED,
  CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED,
  INCONCLUSIVE,
  prepareCurve,
  v2EvaluationGrid,
  pointwiseMedian,
  verifyRawProvenance,
  calculateRepeatabilitySigma,
  calculateCrossRigDisagreement,
  buildConfidenceProfiles,
  buildConfidenceWeights,
  buildLeaveOneGroupOut,
  evaluateTargetingObservation,
  classifyGroupTargeting,
  classifyDevelopmentGate,
  createOutcomeArtifactSchema,
  createProtocolManifest,
  stableJson,
  hashJson,
} from './c1b.mjs'

const GRID = [20, 500, 4000, 8000, 14000, 20000]
const prepared = (values, metadata = {}) => ({
  ...metadata,
  frequenciesHz: [...GRID],
  valuesDb: [...values],
})
const member = (id, groupId, rigClass, values, rig = rigClass === '711-class' ? '711' : rigClass) => ({
  concreteCurveIdentity: id,
  groupId,
  rig,
  rigClass,
  preparedCurve: prepared(values),
})
const group = (groupId, offset, classes = ['rig-a']) => ({
  groupId,
  deviceFamily: `${groupId}-family`,
  exact711Members: [
    member(`${groupId}-711-a`, groupId, '711-class', [0, 0, offset, offset + 1, offset + 2, offset + 3]),
    member(`${groupId}-711-b`, groupId, '711-class', [0, 0, offset + 1, offset + 1, offset + 3, offset + 4]),
    member(`${groupId}-711-c`, groupId, '711-class', [0, 0, offset - 1, offset, offset + 1, offset + 2]),
  ],
  eligibleNon711Members: classes.map((rigClass, index) => member(
    `${groupId}-${rigClass}`,
    groupId,
    rigClass,
    [0, 0, offset + index + 1, offset + index + 3, offset + index + 5, offset + index + 6],
    `rig-${rigClass}`,
  )),
})

function flattenMembers(g) {
  return [...g.exact711Members, ...g.eligibleNon711Members]
}

test('prepareCurve closes terminal endpoint, samples the frozen V2 grid, and only normalizes at 500 Hz', () => {
  const curve = prepareCurve([
    [20, 50],
    [500, 60],
    [19_900, 70],
  ])
  assert.deepEqual(curve.frequenciesHz, v2EvaluationGrid())
  assert.equal(curve.normalization.frequencyHz, 500)
  assert.equal(curve.normalizationAnchorDb, 60)
  assert.equal(curve.sourceCoverage.transformation, 'terminal-flat-hold-to-v2-max')
  assert.equal(curve.smoothing, false)
  assert.equal(curve.peakAlignment, false)
})

test('raw provenance verification checks both SHA-256 and Git blob SHA-1 before preparation', () => {
  const bytes = Buffer.from('20,50\n500,60\n20000,70\n')
  const actual = verifyRawProvenance(bytes)
  assert.equal(actual.byteLength, bytes.length)
  assert.equal(verifyRawProvenance(bytes, { expectedSha256: actual.sha256, expectedBlobSha: actual.blobSha }).sha256, actual.sha256)
  assert.throws(() => verifyRawProvenance(bytes, { expectedSha256: '0'.repeat(64) }), /SHA-256 mismatch/)
  assert.throws(() => verifyRawProvenance(bytes, { expectedBlobSha: '0'.repeat(40) }), /blob SHA-1 mismatch/)
})

test('pointwise median and frozen repeatability sigma use raw values without alignment', () => {
  const curves = [prepared([0, 1, 2, 3, 4, 5]), prepared([0, 3, 4, 5, 8, 9]), prepared([0, 2, 3, 7, 6, 8])]
  const consensus = pointwiseMedian(curves)
  assert.deepEqual(consensus.valuesDb, [0, 2, 3, 5, 6, 8])
  const sigma = calculateRepeatabilitySigma(curves)
  assert.deepEqual(sigma.valuesDb, [0, 1.4826, 1.4826, 2.9652, 2.9652, 1.4826])
  assert.equal(consensus.method, 'POINTWISE_MEDIAN_711')
  assert.equal(sigma.method, 'REPEATABILITY_SIGMA_711')
})

test('cross-rig disagreement returns signed D and absolute A against 711 consensus', () => {
  const consensus = prepared([0, 0, 1, 2, 3, 4])
  const rig = prepared([0, 1, -1, 5, 1, 8])
  const result = calculateCrossRigDisagreement(rig, consensus, { groupId: 'g', observationId: 'r' })
  assert.deepEqual(result.deltaDb, [0, 1, -2, 3, -2, 4])
  assert.deepEqual(result.absoluteDeltaDb, [0, 1, 2, 3, 2, 4])
  assert.equal(result.groupId, 'g')
  assert.equal(result.observationId, 'r')
})

test('training class profiles require two distinct training groups and otherwise fall back globally', () => {
  const groups = [group('g-a', 0), group('g-b', 10), group('g-c', 20, ['rig-a', 'rig-b'])]
  const profiles = buildConfidenceProfiles(groups)
  assert.deepEqual(profiles.trainingGroupIds, ['g-a', 'g-b', 'g-c'])
  assert.equal(profiles.rigProfiles['rig-a'].distinctTrainingGroupCount, 3)
  assert.equal(profiles.rigProfiles['rig-a'].source, 'CLASS_SPECIFIC')
  assert.equal(profiles.rigProfiles['rig-b'].distinctTrainingGroupCount, 1)
  assert.equal(profiles.rigProfiles['rig-b'].source, 'GLOBAL_FALLBACK')
  assert.deepEqual(profiles.rigProfiles['rig-b'].valuesDb, profiles.globalRig.valuesDb)
  assert.equal(profiles.groupReferences.find((entry) => entry.groupId === 'g-a').consensus.method, 'POINTWISE_MEDIAN_711')
})

test('leave-one-group-out training excludes every withheld device response from profiles', () => {
  const groups = [group('g-a', 0), group('g-b', 10), group('g-c', 20)]
  const folds = buildLeaveOneGroupOut(groups)
  assert.equal(folds.length, 3)
  const fold = folds.find((entry) => entry.withheldGroupId === 'g-b')
  assert.deepEqual(fold.trainingGroupIds, ['g-a', 'g-c'])
  assert.equal(fold.profiles.trainingGroupIds.includes('g-b'), false)
  assert.equal(fold.profiles.groupReferences.some((entry) => entry.groupId === 'g-b'), false)
  assert.equal(fold.profiles.observations.some((entry) => entry.groupId === 'g-b'), false)
})

test('confidence transform is the exact finite product and keeps every weight in (0,1]', () => {
  const profiles = buildConfidenceProfiles([group('g-a', 0), group('g-b', 1)])
  const weights = buildConfidenceWeights(profiles, 'rig-a')
  assert.equal(weights.scaleDb, C1B_TARGET_SCALE_DB)
  assert.equal(weights.frequenciesHz.length, GRID.length)
  for (const [index, value] of weights.valuesDb.entries()) {
    const repeat = profiles.repeatability.valuesDb[index]
    const rig = profiles.rigProfiles['rig-a'].valuesDb[index]
    assert.equal(value, (0.75 / (0.75 + repeat)) * (0.75 / (0.75 + rig)))
    assert.ok(value > 0 && value <= 1)
  }
  assert.deepEqual(buildConfidenceWeights(profiles, 'missing').source, 'GLOBAL_FALLBACK')
})

test('equal-authority targeting uses inclusive 4–14 kHz grid, exact 5% win threshold, and zero-control noninformative handling', () => {
  const weights = { frequenciesHz: [...GRID], valuesDb: [1, 1, 1, 0.8, 0.4, 1] }
  const deltaDb = [0, 0, 1, 2, 4, 0]
  const metrics = evaluateTargetingObservation({ frequenciesHz: [...GRID], deltaDb }, weights)
  assert.deepEqual(metrics.primaryFrequenciesHz, [4000, 8000, 14000])
  assert.equal(metrics.meanWeight, (0.8 + 0.4 + 1) / 3)
  assert.equal(metrics.informative, true)
  assert.equal(metrics.classification, CONFIDENCE_TARGETING_WIN)
  assert.ok(metrics.gain >= 0.05)

  const zero = evaluateTargetingObservation({ frequenciesHz: [...GRID], deltaDb: [0, 0, 0, 0, 0, 0] }, weights)
  assert.equal(zero.informative, false)
  assert.equal(zero.classification, INCONCLUSIVE)
  assert.equal(zero.gain, null)
})

test('diagnostics include component candidates, deterministic tied Spearman, quartiles, and all frozen bands', () => {
  const weights = { frequenciesHz: [...GRID], valuesDb: [1, 1, 1, 0.5, 0.25, 1] }
  const metrics = evaluateTargetingObservation({ frequenciesHz: [...GRID], deltaDb: [0, 0, 0, 1, 2, 0] }, weights)
  assert.ok(Number.isFinite(metrics.rawCrossRigMae))
  assert.ok(Number.isFinite(metrics.rawCrossRigRmse))
  assert.ok(Number.isFinite(metrics.spearmanUncertaintyArtifact))
  assert.ok(metrics.highestConfidenceQuartile.count >= 1)
  assert.ok(metrics.lowestConfidenceQuartile.count >= 1)
  for (const band of ['20-500Hz', '500-1kHz', '1-2kHz', '2-4kHz', '4-6kHz', '6-8kHz', '8-10kHz', '10-14kHz', '14-20kHz']) {
    assert.ok(Object.hasOwn(metrics.bandDiagnostics, band), band)
  }
  assert.ok(metrics.candidates.repeatability.valuesDb.every((value) => value <= 1 && value > 0))
  assert.ok(metrics.candidates.rig.valuesDb.every((value) => value <= 1 && value > 0))
  assert.ok(metrics.candidates.confidence.valuesDb.every((value) => value <= 1 && value > 0))
})

test('group gate counts only informative observations and requires strict majority plus median gain', () => {
  const signal = classifyGroupTargeting([
    { informative: true, classification: CONFIDENCE_TARGETING_WIN, gain: 0.06 },
    { informative: true, classification: CONFIDENCE_TARGETING_WIN, gain: 0.08 },
    { informative: true, classification: 'CONFIDENCE_TARGETING_LOSS', gain: -0.01 },
    { informative: false, classification: INCONCLUSIVE, gain: null },
  ])
  assert.equal(signal.classification, CONFIDENCE_TARGETING_SIGNAL)
  assert.equal(signal.informativeObservationCount, 3)
  assert.equal(signal.winCount, 2)
  assert.equal(signal.medianGain, 0.06)

  const noSignal = classifyGroupTargeting([
    { informative: true, classification: CONFIDENCE_TARGETING_WIN, gain: 0.05 },
    { informative: true, classification: 'CONFIDENCE_TARGETING_LOSS', gain: 0.04 },
  ])
  assert.equal(noSignal.classification, 'NO_CONFIDENCE_TARGETING_SIGNAL')
})

test('development gate is exactly four of six signals and treats valid no-information as no support', () => {
  const six = [
    CONFIDENCE_TARGETING_SIGNAL,
    CONFIDENCE_TARGETING_SIGNAL,
    CONFIDENCE_TARGETING_SIGNAL,
    CONFIDENCE_TARGETING_SIGNAL,
    'NO_CONFIDENCE_TARGETING_SIGNAL',
    INCONCLUSIVE,
  ]
  assert.equal(classifyDevelopmentGate(six), CONFIDENCE_TARGETING_DEV_SUPPORTED)
  assert.equal(classifyDevelopmentGate([...six.slice(0, 3), 'NO_CONFIDENCE_TARGETING_SIGNAL', 'NO_CONFIDENCE_TARGETING_SIGNAL', INCONCLUSIVE]), CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED)
  assert.equal(classifyDevelopmentGate(six.slice(0, 5)), INCONCLUSIVE)
})

test('pre-outcome schema and manifest are hashable and forbid response outcomes', () => {
  const schema = createOutcomeArtifactSchema()
  assert.equal(schema.outcomeValuesAllowed, false)
  assert.equal(schema.flags.outcomesGenerated, false)
  assert.equal(schema.flags.responseOutcomeObserved, false)
  const manifest = createProtocolManifest()
  assert.equal(manifest.algorithmVersion, C1B_ALGORITHM_VERSION)
  assert.deepEqual(manifest.primaryBandHz, C1B_PRIMARY_BAND_HZ)
  assert.equal(manifest.c1aV11.commit, '28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a')
  assert.equal(manifest.c1aV11.evidenceSha256, 'a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43')
  assert.equal(manifest.developmentExecuted, false)
  assert.equal(manifest.holdoutExecuted, false)
  assert.equal(manifest.freshRealBatchCExecuted, false)
  assert.equal(manifest.outcomesGenerated, false)
  assert.equal(typeof hashJson(manifest), 'string')
  assert.equal(stableJson(manifest), stableJson(JSON.parse(stableJson(manifest))))
})

// Keep this helper used in at least one test so the synthetic fixture visibly
// follows the selected group member boundary and cannot accidentally include
// a holdout member when expanded by future tests.
test('synthetic fixture member expansion is explicit', () => {
  assert.equal(flattenMembers(group('g-check', 0)).length, 4)
})
