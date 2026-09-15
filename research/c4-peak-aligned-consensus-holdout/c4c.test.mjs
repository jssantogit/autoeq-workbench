import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import {
  C4A_CORPUS_COMMIT,
  C4A_EVIDENCE_SHA256,
  C4B_ALGORITHM_SOURCE_SHA256,
  C4B_EVIDENCE_COMMIT,
  C4B_EVIDENCE_SHA256,
  C4B_PROTOCOL_COMMIT,
  C4C_FROZEN_BOUNDARY,
  C4C_ALGORITHM_VERSION,
  C4C_EXPECTED_HOLDOUT_FOLDS,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUP_IDS,
  assertHoldoutGroupId,
  buildCombinedC4Interpretation,
  buildHoldoutGate,
  classifyHoldoutGate,
  createProtocolManifest,
  hashEvidencePayloads,
  verifyFrozenC4bProvenance,
  runC4c,
} from './c4c.mjs'

test('C4c pins the audited C4a/C4b commits, evidence, and algorithm hash', () => {
  assert.equal(C4A_CORPUS_COMMIT, '64f1fa7f8780cf14f87ce6427aaa71edbf686e2d')
  assert.equal(C4A_EVIDENCE_SHA256, '03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea')
  assert.equal(C4B_PROTOCOL_COMMIT, '95d853db76bd456dd66a1b8a60a65039ca095b8b')
  assert.equal(C4B_EVIDENCE_COMMIT, '01ec92e8c3276b6cb42360e114d71f2ce5bc0d8e')
  assert.equal(C4B_EVIDENCE_SHA256, 'c2232862df04d0e90fa86fe7805f2032d2722e381c7d6e08118fcb7c29028d04')
  assert.equal(C4B_ALGORITHM_SOURCE_SHA256, '61002d0552c3c8bdc8045355378a1dd40dbfe56845a790d0ccd6f3caef67a2ec')
  assert.equal(C4C_FROZEN_BOUNDARY, '01ec92e8c3276b6cb42360e114d71f2ce5bc0d8e')
  assert.equal(C4C_ALGORITHM_VERSION, 'c4-peak-aligned-consensus-dev-v1')
})

test('C4c admits exactly holdout IDs and rejects development/Batch C', () => {
  for (const groupId of HOLDOUT_GROUP_IDS) assert.equal(assertHoldoutGroupId(groupId), true)
  for (const groupId of DEVELOPMENT_GROUP_IDS) assert.throws(() => assertHoldoutGroupId(groupId), /development|holdout|reject/i)
  assert.throws(() => assertHoldoutGroupId('fresh-real-corpus-v1.2:Batch C'), /Batch C|sealed|reject/i)
  assert.throws(() => assertHoldoutGroupId('c4g-unknown'), /holdout|reject/i)
})

test('holdout inventory predeclares exactly three groups and 27 LOO folds', () => {
  const manifest = createProtocolManifest()
  assert.equal(C4C_EXPECTED_HOLDOUT_FOLDS, 27)
  assert.deepEqual(manifest.holdoutCoverage, {
    groupCount: 3,
    memberCount: 27,
    expectedFoldCount: 27,
    protocol: 'leave-one-measurement-out',
  })
  assert.deepEqual(manifest.holdoutGate, {
    requiredGroups: 3,
    minimumSignalGroups: 2,
    signalClassification: 'PEAK_ALIGNMENT_SIGNAL',
    pass: 'PEAK_ALIGNMENT_GENERALIZES',
    validFailure: 'PEAK_ALIGNMENT_NOT_CONFIRMED',
    invalid: 'INCONCLUSIVE',
  })
})

test('holdout gate covers 0/3, 1/3, 2/3, and 3/3 without reinterpretation', () => {
  assert.equal(classifyHoldoutGate(['NO_PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_NOT_CONFIRMED')
  assert.equal(classifyHoldoutGate(['PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_NOT_CONFIRMED')
  assert.equal(classifyHoldoutGate(['PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_GENERALIZES')
  assert.equal(classifyHoldoutGate(['PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL']), 'PEAK_ALIGNMENT_GENERALIZES')
  assert.equal(classifyHoldoutGate(['INCONCLUSIVE', 'PEAK_ALIGNMENT_SIGNAL', 'PEAK_ALIGNMENT_SIGNAL']), 'INCONCLUSIVE')
  assert.deepEqual(buildHoldoutGate([
    { groupId: HOLDOUT_GROUP_IDS[0], classification: 'PEAK_ALIGNMENT_SIGNAL' },
    { groupId: HOLDOUT_GROUP_IDS[1], classification: 'NO_PEAK_ALIGNMENT_SIGNAL' },
    { groupId: HOLDOUT_GROUP_IDS[2], classification: 'NO_PEAK_ALIGNMENT_SIGNAL' },
  ]), { classification: 'PEAK_ALIGNMENT_NOT_CONFIRMED', signalGroupCount: 1, groupCount: 3 })
})

test('combined C4 interpretation requires development support and holdout generalization', () => {
  assert.equal(buildCombinedC4Interpretation({ developmentClassification: 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED', holdoutClassification: 'PEAK_ALIGNMENT_GENERALIZES' }), 'C4_PEAK_ALIGNMENT_GENERALIZED')
  assert.equal(buildCombinedC4Interpretation({ developmentClassification: 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED', holdoutClassification: 'PEAK_ALIGNMENT_NOT_CONFIRMED' }), 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED')
  assert.equal(buildCombinedC4Interpretation({ developmentClassification: 'PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED', holdoutClassification: 'PEAK_ALIGNMENT_GENERALIZES' }), 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED')
  assert.equal(buildCombinedC4Interpretation({ developmentClassification: 'INCONCLUSIVE', holdoutClassification: 'PEAK_ALIGNMENT_GENERALIZES' }), 'INCONCLUSIVE')
})

test('C4b provenance, algorithm version, and source hash verify read-only', async () => {
  const verified = await verifyFrozenC4bProvenance()
  assert.equal(verified.manifest.protocolFreezeCommit, C4B_PROTOCOL_COMMIT)
  assert.equal(verified.manifest.outcomeClassification, 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED')
  assert.equal(verified.algorithmSourceSha256, C4B_ALGORITHM_SOURCE_SHA256)
  assert.equal(verified.evidenceSha256, C4B_EVIDENCE_SHA256)
})

test('protocol manifest rejects execution and development rerun', () => {
  const manifest = createProtocolManifest()
  assert.equal(manifest.phase, 'protocol-freeze')
  assert.equal(manifest.protocolFreezeCommit, null)
  assert.deepEqual(manifest.holdoutGroupIds, HOLDOUT_GROUP_IDS)
  assert.deepEqual(manifest.rejectedDevelopmentGroupIds, DEVELOPMENT_GROUP_IDS)
  assert.equal(manifest.developmentRerunForDecision, false)
  assert.equal(manifest.holdoutExecuted, false)
  assert.equal(manifest.freshRealCorpusBatchCExecuted, false)
  assert.equal(manifest.autoEqSolverExecuted, false)
  assert.equal(manifest.outcomesGenerated, false)
})

test('default C4c runner is protocol-only and raw cache is untracked', async () => {
  const result = await runC4c()
  assert.equal(result.phase, 'protocol-freeze')
  assert.equal(result.outcomesGenerated, false)
  assert.equal(execFileSync('git', ['ls-files', '--', '.research-cache'], { encoding: 'utf8' }), '')
})

test('evidence hashing uses deterministic framed payloads', () => {
  const a = new Map([['b.json', Buffer.from('b\n')], ['a.json', Buffer.from('a\n')]])
  const b = new Map([['a.json', Buffer.from('a\n')], ['b.json', Buffer.from('b\n')]])
  assert.equal(hashEvidencePayloads(a), hashEvidencePayloads(b))
  assert.notEqual(hashEvidencePayloads(a), hashEvidencePayloads(new Map([['a.json', Buffer.from('changed\n')], ['b.json', Buffer.from('b\n')]])))
})
