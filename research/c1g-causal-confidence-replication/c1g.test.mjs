import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  C1G_C1H_EVIDENCE_COMMIT,
  C1G_C1H_EVIDENCE_INDEX_SHA256,
  C1G_MATERIALIZED_CORPUS_SHA256,
  C1G_MODEL_SHA256,
  C1G_PRIMARY_GROUP_IDS,
  C1G_SECONDARY_GROUP_IDS,
  C1G_UPSTREAM_COMMIT,
  C1G_UPSTREAM_TREE,
  acquirePrimaryExecutionRight,
  assertBatchCPath,
  assertCachePath,
  assertNetworkPath,
  buildArmCorrections,
  buildExact711Consensus,
  classifyCampaign,
  classifyGroup,
  classifyObservation,
  createMockSolverInvocation,
  desiredCorrectionFromDisagreement,
  loadC1hCorpus,
  loadFrozenConfidenceModel,
  materializedCascadeMetrics,
  resolveFrozenConfidenceProfile,
  assertResearchWritePath,
  verifyC1hEvidenceIndex,
  verifyPrimaryStructure,
  writeAtomicJson,
} from './c1g.mjs'

test('C1h evidence index mismatch is rejected', async () => {
  await assert.rejects(verifyC1hEvidenceIndex({ indexSha256: '0'.repeat(64) }), /C1h evidence index/i)
})

test('materialized corpus SHA mismatch is rejected', async () => {
  await assert.rejects(loadC1hCorpus({ expectedCorpusSha256: '0'.repeat(64) }), /materialized corpus SHA/i)
})

test('missing selected group is rejected', async () => {
  await assert.rejects(loadC1hCorpus({ groupIds: C1G_PRIMARY_GROUP_IDS.slice(1) }), /missing|required|primary/i)
})

test('wrong primary ID is rejected', async () => {
  await assert.rejects(loadC1hCorpus({ primaryGroupIds: ['not-c1g'] }), /primary|selection|group/i)
})

test('all six groups and 31 primary curves are structurally verified', async () => {
  const corpus = await loadC1hCorpus()
  assert.equal(verifyPrimaryStructure(corpus), true)
  assert.equal(corpus.primaryGroups.length, 6)
  assert.equal(corpus.primaryCurveCount, 31)
})

test('secondary reserve groups cannot enter the primary set', () => {
  assert.throws(() => verifyPrimaryStructure({ primaryGroupIds: [...C1G_SECONDARY_GROUP_IDS], primaryGroups: [], primaryCurveCount: 0 }), /primary|reserve/i)
})

test('network paths are rejected before any read', () => {
  assert.throws(() => assertNetworkPath('https://raw.githubusercontent.com/example.csv'), /network|offline/i)
})

test('cache paths are rejected before any read', () => {
  assert.throws(() => assertCachePath('.research-cache/c1f-upstream-reserve-corpus/curve.csv'), /cache|offline/i)
})

test('Batch C paths are rejected before any read', () => {
  assert.throws(() => assertBatchCPath('.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'), /Batch C|sealed/i)
})

test('frozen model hash mismatch is rejected', async () => {
  await assert.rejects(loadFrozenConfidenceModel({ expectedModelSha256: '0'.repeat(64) }), /model.*hash|confidence model/i)
})

test('each primary group requires four exact-711 curves', () => {
  const group = { groupId: 'fixture', members: [{ rig: '711' }, { rig: '711' }, { rig: '711' }] }
  assert.throws(() => buildExact711Consensus(group), /four|exact.*711|4/i)
})

test('exact-711 consensus excludes non-711 members', () => {
  const group = { groupId: 'fixture', members: [
    { concreteCurveIdentity: 'a', rig: '711', frequencyHz: [20, 500, 20_000], normalizedDb: [1, 2, 3] },
    { concreteCurveIdentity: 'b', rig: '711', frequencyHz: [20, 500, 20_000], normalizedDb: [3, 4, 5] },
    { concreteCurveIdentity: 'c', rig: '711', frequencyHz: [20, 500, 20_000], normalizedDb: [5, 6, 7] },
    { concreteCurveIdentity: 'd', rig: '711', frequencyHz: [20, 500, 20_000], normalizedDb: [7, 8, 9] },
    { concreteCurveIdentity: 'non', rig: 'GRAS 43AC', frequencyHz: [20, 500, 20_000], normalizedDb: [99, 99, 99] },
  ] }
  assert.deepEqual(buildExact711Consensus(group).valuesDb, [4, 5, 6])
})

test('D is R minus C', () => {
  assert.deepEqual(desiredCorrectionFromDisagreement([10, 2], [7, 5]).disagreement, [3, -3])
})

test('baseline desired correction is negative D', () => {
  assert.deepEqual(desiredCorrectionFromDisagreement([10, 2], [7, 5]).desiredBase, [-3, 3])
})

test('constant-authority arm uses w_bar inside the primary band', () => {
  const result = buildArmCorrections([3_000, 4_000, 8_000, 14_000, 15_000], [1, 2, 3, 4, 5], [0.2, 0.4, 0.6, 0.8, 0.9])
  assert.equal(result.wBar, 0.6)
  result.constant.forEach((value, index) => assert.ok(Math.abs(value - [ -1, -1.2, -1.8, -2.4, -5 ][index]) < 1e-12))
})

test('confidence-shaped arm uses pointwise frozen weights', () => {
  const result = buildArmCorrections([4_000, 8_000, 14_000], [1, 2, 3], [0.2, 0.6, 0.8])
  result.confidence.forEach((value, index) => assert.ok(Math.abs(value - [-0.2, -1.2, -2.4][index]) < 1e-12))
})

test('both authority multipliers are one outside 4–14 kHz', () => {
  const result = buildArmCorrections([20, 4_000, 14_000, 20_000], [1, 1, 1, 1], [0.2, 0.4, 0.8, 0.9])
  assert.equal(result.constant[0], -1)
  assert.equal(result.confidence[0], -1)
  assert.equal(result.constant[3], -1)
  assert.equal(result.confidence[3], -1)
})

test('equal mean authority invariant holds without rounding', () => {
  const result = buildArmCorrections([4_000, 8_000, 14_000], [1, 2, 3], [0.2, 0.6, 0.8])
  assert.equal(result.wBar, result.meanConfidence)
})

test('truth metric evaluates delivered cascade against zero', () => {
  const result = materializedCascadeMetrics([0, 1, -1, 2], [20, 4_000, 8_000, 14_000])
  assert.equal(result.artifactRmse4_14k, Math.sqrt((1 + 1 + 4) / 3))
})

test('five-percent baseline threshold is inclusive', () => {
  assert.equal(classifyObservation({ baseline: 1, constant: 1, confidence: 0.95 }).classification, 'CAUSAL_CONFIDENCE_WIN')
})

test('five-percent constant threshold is inclusive', () => {
  assert.ok(Math.abs(classifyObservation({ baseline: 1, constant: 1, confidence: 0.95 }).gainVsConstant - 0.05) < 1e-12)
})

test('beating baseline alone is not a causal confidence win', () => {
  assert.equal(classifyObservation({ baseline: 1, constant: 0.8, confidence: 0.77 }).classification, 'NO_CAUSAL_CONFIDENCE_WIN')
})

test('beating constant alone is not a causal confidence win', () => {
  assert.equal(classifyObservation({ baseline: 1, constant: 1.2, confidence: 1.14 }).classification, 'NO_CAUSAL_CONFIDENCE_WIN')
})

test('BLON-like one of two wins fails strict majority', () => {
  assert.equal(classifyGroup([{ classification: 'CAUSAL_CONFIDENCE_WIN', combinedGain: 0.2 }, { classification: 'NO_CAUSAL_CONFIDENCE_WIN', combinedGain: 0 }]).classification, 'NO_CAUSAL_CONFIDENCE_SIGNAL')
})

test('BLON-like two of two wins plus median threshold passes', () => {
  assert.equal(classifyGroup([{ classification: 'CAUSAL_CONFIDENCE_WIN', combinedGain: 0.1 }, { classification: 'CAUSAL_CONFIDENCE_WIN', combinedGain: 0.2 }]).classification, 'CAUSAL_CONFIDENCE_SIGNAL')
})

test('four of six group signals pass the campaign gate', () => {
  const groups = Array.from({ length: 4 }, () => ({ classification: 'CAUSAL_CONFIDENCE_SIGNAL' }))
    .concat(Array.from({ length: 2 }, () => ({ classification: 'NO_CAUSAL_CONFIDENCE_SIGNAL' })))
  assert.equal(classifyCampaign(groups).classification, 'C1G_CAUSAL_INTEGRATION_REPLICATED')
})

test('three of six group signals fail the campaign gate', () => {
  assert.equal(classifyCampaign(Array.from({ length: 3 }, () => ({ classification: 'CAUSAL_CONFIDENCE_SIGNAL' })).concat(Array.from({ length: 3 }, () => ({ classification: 'NO_CAUSAL_CONFIDENCE_SIGNAL' })))).classification, 'C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED')
})

test('secondary reserve does not affect the primary campaign gate', () => {
  const primary = Array.from({ length: 3 }, () => ({ classification: 'CAUSAL_CONFIDENCE_SIGNAL' })).concat(Array.from({ length: 3 }, () => ({ classification: 'NO_CAUSAL_CONFIDENCE_SIGNAL' })))
  const withReserve = primary.concat(Array.from({ length: 6 }, () => ({ classification: 'CAUSAL_CONFIDENCE_SIGNAL' })))
  assert.equal(classifyCampaign(primary).classification, classifyCampaign(withReserve.slice(0, 6)).classification)
})

test('permanent execution marker rejects a second invocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1g-marker-'))
  try {
    await acquirePrimaryExecutionRight({ artifactRoot: root, freezeCommit: 'f'.repeat(40), corpusSha256: C1G_MATERIALIZED_CORPUS_SHA256, executionUuid: 'first' })
    await assert.rejects(acquirePrimaryExecutionRight({ artifactRoot: root, freezeCommit: 'f'.repeat(40), corpusSha256: C1G_MATERIALIZED_CORPUS_SHA256, executionUuid: 'second' }), /attempt|lock|started/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('runtime lock rejects a concurrent invocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1g-lock-'))
  try {
    await acquirePrimaryExecutionRight({ artifactRoot: root, freezeCommit: 'f'.repeat(40), corpusSha256: C1G_MATERIALIZED_CORPUS_SHA256, executionUuid: 'first' })
    await assert.rejects(acquirePrimaryExecutionRight({ artifactRoot: root, freezeCommit: 'f'.repeat(40), corpusSha256: C1G_MATERIALIZED_CORPUS_SHA256, executionUuid: 'second' }), /attempt|lock|started/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('two simultaneous mock invocations yield at most one execution right', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1g-concurrency-'))
  try {
    const results = await Promise.all([createMockSolverInvocation(root, 'a'), createMockSolverInvocation(root, 'b')])
    assert.equal(results.filter((result) => result.acquired).length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('the losing simultaneous invocation performs zero solver calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1g-loser-'))
  try {
    const results = await Promise.all([createMockSolverInvocation(root, 'a'), createMockSolverInvocation(root, 'b')])
    const loser = results.find((result) => !result.acquired)
    assert.equal(loser.solverCalls, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('atomic group artifact is absent when atomic writer fails before rename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1g-atomic-'))
  const path = join(root, 'group-fixture.json')
  try {
    await assert.rejects(writeAtomicJson(path, { complete: true }, { beforeRename: () => { throw new Error('simulated failure') } }), /simulated failure/)
    await assert.rejects(stat(path), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('research scope excludes production and core paths', () => {
  assert.throws(() => assertResearchWritePath('packages/core/src/autoeq/v2/runStandardAutoEqV2.ts'), /scope|forbidden/i)
})
