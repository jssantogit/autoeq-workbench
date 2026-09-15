import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import {
  ALIGNMENT_BAND_HZ,
  C4A_EVIDENCE_SHA256,
  C4A_CORPUS_BOUNDARY,
  C4B_FROZEN_BOUNDARY,
  C4B_ALGORITHM_VERSION,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUP_IDS,
  PEAK_SEARCH_BAND_HZ,
  assertDevelopmentGroupId,
  buildDevelopmentGate,
  classifyDevelopmentGate,
  buildGroupDecision,
  canonicalTrainingPeak,
  createPeakWarp,
  createProtocolManifest,
  dominantPeakFrequency,
  hashBytes,
  hasStrictMajority,
  leaveOneOutMembers,
  pointwiseMedian,
  evaluationGrid,
  prepareCurve,
  verifyFrozenC4aProvenance,
  registerCandidatesForEvaluation,
  verifyRawProvenance,
  runC4b,
  runDevelopmentAfterProtocolFreeze,
  warpCurve,
} from './c4b.mjs'

const frequencies = [20, 500, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 20000]

function curve(values, id = 'curve') {
  return {
    id,
    frequenciesHz: frequencies,
    valuesDb: values,
  }
}

function preparedCurve(peakFrequency, id = 'curve', offset = 0) {
  const values = frequencies.map((frequency) => {
    if (frequency === peakFrequency) return 10 + offset
    if (frequency >= 6000 && frequency <= 10000) return 0 + offset
    return offset
  })
  return curve(values, id)
}

test('protocol pins C4a boundary, immutable upstream, and exact regions', () => {
  assert.equal(C4B_FROZEN_BOUNDARY, '64f1fa7f8780cf14f87ce6427aaa71edbf686e2d')
  assert.equal(C4A_EVIDENCE_SHA256, '03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea')
  assert.equal(C4B_ALGORITHM_VERSION, 'c4-peak-aligned-consensus-dev-v1')
  assert.deepEqual(PEAK_SEARCH_BAND_HZ, [6000, 10000])
  assert.deepEqual(ALIGNMENT_BAND_HZ, [6000, 14000])
})

test('dominant peak chooses the maximum in 6–10 kHz and lower-frequency ties', () => {
  const selected = dominantPeakFrequency(curve([0, 0, 1, 8, 12, 12, 2, 0, 0, 0]))
  assert.equal(selected, 8000)
  assert.equal(dominantPeakFrequency(curve([0, 0, 1, 9, 9, 9, 2, 0, 0, 0])), 7000)
  assert.equal(dominantPeakFrequency(curve([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 6000)
})

test('canonical training peak is the median of log2 frequencies for odd K', () => {
  const expected = 8000
  assert.equal(canonicalTrainingPeak([6000, 8000, 10000]), expected)
})

test('canonical training peak averages central log2 values for even K', () => {
  const expected = 2 ** ((Math.log2(8000) + Math.log2(9000)) / 2)
  assert.equal(canonicalTrainingPeak([6000, 10000, 8000, 9000]), expected)
})

test('peak warp is identity when member and canonical peaks match', () => {
  const warp = createPeakWarp(8000, 8000)
  assert.equal(warp.mapFrequencyHz(20), 20)
  assert.equal(warp.mapFrequencyHz(8000), 8000)
  assert.equal(warp.mapFrequencyHz(14000), 14000)
})

test('peak warp has exactly three anchors and log-frequency interpolation', () => {
  const warp = createPeakWarp(8000, 9000)
  assert.deepEqual(warp.anchors, [
    [6000, 6000],
    [8000, 9000],
    [14000, 14000],
  ])
  assert.equal(warp.mapFrequencyHz(6000), 6000)
  assert.equal(warp.mapFrequencyHz(8000), 9000)
  assert.equal(warp.mapFrequencyHz(14000), 14000)
  const midpoint = 2 ** ((Math.log2(8000) + Math.log2(14000)) / 2)
  const mappedMidpoint = warp.mapFrequencyHz(midpoint)
  assert.ok(Math.abs(mappedMidpoint - 2 ** ((Math.log2(9000) + Math.log2(14000)) / 2)) < 1e-9)
})

test('peak warp is continuous at both alignment boundaries', () => {
  const warp = createPeakWarp(8500, 9200)
  assert.equal(warp.mapFrequencyHz(6000 * (1 - 1e-12)), 6000 * (1 - 1e-12))
  assert.equal(warp.mapFrequencyHz(6000), 6000)
  assert.equal(warp.mapFrequencyHz(6000 * (1 + 1e-12)) > 6000, true)
  assert.equal(warp.mapFrequencyHz(14000 * (1 - 1e-12)) < 14000, true)
  assert.equal(warp.mapFrequencyHz(14000), 14000)
  assert.equal(warp.mapFrequencyHz(14000 * (1 + 1e-12)), 14000 * (1 + 1e-12))
})

test('peak warp rejects non-monotone mappings and preserves monotonicity at extremes', () => {
  assert.throws(() => createPeakWarp(8000, 5000), /monotone|anchor|band/i)
  for (const inputPeak of [6000, 6001, 9999, 10000]) {
    const warp = createPeakWarp(8000, inputPeak)
    const points = [6000, 6500, 8000, 10000, 14000].map((frequency) => warp.mapFrequencyHz(frequency))
    assert.equal(points.every((value, index) => index === 0 || value >= points[index - 1]), true)
  }
})

test('warp uses identity outside the alignment band', () => {
  const warp = createPeakWarp(8000, 9000)
  assert.equal(warp.mapFrequencyHz(5999), 5999)
  assert.equal(warp.mapFrequencyHz(14001), 14001)
})

test('warp rejects source coverage failure rather than extrapolating', () => {
  const warp = createPeakWarp(8000, 9000)
  assert.throws(() => warpCurve({ frequenciesHz: [6000, 7000, 8000], valuesDb: [0, 0, 0] }, warp), /coverage|extrapolat/i)
})

test('pointwise median supports odd and even training counts', () => {
  const odd = [curve([0, 0, 1, 2, 3, 4, 5, 6, 7, 8], 'a'), curve([0, 0, 3, 4, 5, 6, 7, 8, 9, 10], 'b'), curve([0, 0, 2, 3, 4, 5, 6, 7, 8, 9], 'c')]
  assert.deepEqual(pointwiseMedian(odd).valuesDb, [0, 0, 2, 3, 4, 5, 6, 7, 8, 9])
  const even = [curve([0, 0, 1, 2, 3, 4, 5, 6, 7, 8], 'a'), curve([0, 0, 3, 4, 5, 6, 7, 8, 9, 10])]
  assert.deepEqual(pointwiseMedian(even).valuesDb, [0, 0, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('leave-one-out training excludes exactly the withheld member', () => {
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const fold = leaveOneOutMembers(members, 2)
  assert.equal(fold.withheld.id, 'c')
  assert.deepEqual(fold.training.map((member) => member.id), ['a', 'b', 'd'])
  assert.equal(fold.training.some((member) => member.id === fold.withheld.id), false)
})

test('evaluation registration applies the same withheld frame to both candidates', () => {
  const withheld = preparedCurve(9000, 'withheld')
  const candidates = {
    pointwise: preparedCurve(8000, 'pointwise'),
    aligned: preparedCurve(9000, 'aligned'),
  }
  const registered = registerCandidatesForEvaluation(candidates, withheld)
  assert.equal(registered.withheldPeakFrequencyHz, 9000)
  assert.equal(registered.pointwise.warp.anchors[0][0], registered.aligned.warp.anchors[0][0])
  assert.deepEqual(registered.pointwise.warp.anchors.map((anchor) => anchor[1]), [6000, 8000, 14000])
  assert.deepEqual(registered.aligned.warp.anchors.map((anchor) => anchor[1]), [6000, 9000, 14000])
})

test('strict-majority fold gate has no epsilon', () => {
  assert.equal(hasStrictMajority(5, 8), true)
  assert.equal(hasStrictMajority(4, 8), false)
  assert.equal(hasStrictMajority(5, 9), true)
  assert.equal(hasStrictMajority(4, 9), false)
})

test('group decision requires strict majority, lower median MAE, and lower sigma', () => {
  const folds = [
    { peakAlignmentFoldWin: true, pointwise: { registeredTrebleMAE: 2 }, aligned: { registeredTrebleMAE: 0.5 } },
    { peakAlignmentFoldWin: true, pointwise: { registeredTrebleMAE: 3 }, aligned: { registeredTrebleMAE: 1 } },
    { peakAlignmentFoldWin: false, pointwise: { registeredTrebleMAE: 1 }, aligned: { registeredTrebleMAE: 2 } },
  ]
  assert.equal(buildGroupDecision(folds, { medianFullBandBefore: 2, medianFullBandAfter: 1 }), 'PEAK_ALIGNMENT_SIGNAL')
  assert.equal(buildGroupDecision(folds, { medianFullBandBefore: 1, medianFullBandAfter: 1 }), 'NO_PEAK_ALIGNMENT_SIGNAL')
})

test('development gate requires at least two of three positive groups', () => {
  assert.equal(classifyDevelopmentGate(['PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED')
  assert.equal(classifyDevelopmentGate(['PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED')
  assert.equal(classifyDevelopmentGate(['INCONCLUSIVE', 'PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL']), 'INCONCLUSIVE')
  assert.deepEqual(buildDevelopmentGate([
    { groupId: 'a', classification: 'PEAK_ALIGNMENT_SIGNAL' },
    { groupId: 'b', classification: 'NO_PEAK_ALIGNMENT_SIGNAL' },
    { groupId: 'c', classification: 'NO_PEAK_ALIGNMENT_SIGNAL' },
  ]), { classification: 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED', signalGroupCount: 1, groupCount: 3 })
})

test('runner accepts only the three frozen development groups', () => {
  for (const groupId of DEVELOPMENT_GROUP_IDS) assert.equal(assertDevelopmentGroupId(groupId), true)
  for (const groupId of HOLDOUT_GROUP_IDS) assert.throws(() => assertDevelopmentGroupId(groupId), /holdout|development|reject/i)
  assert.throws(() => assertDevelopmentGroupId('fresh-real-corpus-v1.2:Batch C'), /Batch C|sealed|reject/i)
  assert.throws(() => assertDevelopmentGroupId('c4g-unknown'), /development|reject/i)
})


test('C4a terminal closure is reused exactly before normal-grid preparation', () => {
  const grid = evaluationGrid()
  const penultimate = grid.at(-2)
  const prepared = prepareCurve([[20, 1], [500, 2], [penultimate, 3]])
  assert.equal(prepared.frequenciesHz.at(-1), 20000)
  assert.equal(prepared.valuesDb.at(-1), prepared.valuesDb.at(-2) + (0 - 0))
  assert.equal(prepared.sourceCoverage.transformation, 'terminal-flat-hold-to-v2-max')
})

test('frozen C4a artifact provenance and evidence hash verify read-only', async () => {
  const verified = await verifyFrozenC4aProvenance()
  assert.equal(verified.manifest.frozenBoundary, C4A_CORPUS_BOUNDARY)
  assert.equal(verified.evidenceSha256, C4A_EVIDENCE_SHA256)
  assert.deepEqual(verified.groups.map((group) => group.groupId), [...DEVELOPMENT_GROUP_IDS, ...HOLDOUT_GROUP_IDS])
})

test('raw provenance verification checks both SHA-256 and Git blob SHA-1', () => {
  const bytes = Buffer.from('20,0\n20000,0\n', 'utf8')
  const verified = verifyRawProvenance(bytes, {
    expectedSha256: hashBytes(bytes),
    expectedBlobSha: '49a41461bf089f34330343e7caee7d86483c1a73',
  })
  assert.equal(verified.sha256, hashBytes(bytes))
  assert.throws(() => verifyRawProvenance(bytes, { expectedSha256: '0'.repeat(64) }), /SHA-256/i)
})



test('raw cache remains ignored and untracked', () => {
  const trackedCache = execFileSync('git', ['ls-files', '--', '.research-cache'], { encoding: 'utf8' })
  assert.equal(trackedCache, '')
})

test('default C4b runner is protocol-only and post-freeze gate rejects holdout before execution', async () => {
  const result = await runC4b()
  assert.equal(result.phase, 'protocol-freeze')
  assert.equal(result.outcomesGenerated, false)
  await assert.rejects(
    () => runDevelopmentAfterProtocolFreeze({ groupIds: [HOLDOUT_GROUP_IDS[0]] }),
    /holdout|reject/i,
  )
})

test('protocol manifest is explicitly outcome-free', () => {
  const manifest = createProtocolManifest()
  assert.equal(manifest.phase, 'protocol-freeze')
  assert.equal(manifest.developmentExecuted, false)
  assert.equal(manifest.holdoutExecuted, false)
  assert.equal(manifest.batchCExecuted, false)
  assert.equal(manifest.consensusAlgorithmExecuted, false)
  assert.equal(manifest.autoEqSolverExecuted, false)
  assert.equal(manifest.outcomesGenerated, false)
  assert.equal(manifest.protocolPath, 'research/c4-peak-aligned-consensus-dev/protocol.md')
  assert.deepEqual(manifest.developmentGroupIds, DEVELOPMENT_GROUP_IDS)
})
