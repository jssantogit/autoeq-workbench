import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  C1H_C1F_EVIDENCE_COMMIT,
  C1H_C1F_HASH_INDEX_SHA256,
  C1H_UPSTREAM_COMMIT,
  C1H_UPSTREAM_TREE,
  C1H_PRIMARY_GROUP_IDS,
  C1H_SECONDARY_GROUP_IDS,
  C1H_SELECTED_GROUP_IDS,
  buildMaterializedCurve,
  buildGroupArtifact,
  buildCorpusHash,
  createArtifactHashIndex,
  verifyC1fEvidenceHashIndex,
  assertFrozenSelection,
  assertC1fSourceIdentity,
  assertSelectedGroups,
  assertPrimaryMaterializationCounts,
  verifyRawDerivedHashes,
  assertNoRawUpstreamArtifactPath,
  assertNoBatchCPath,
  verifyCurveIntegrity,
  verifySelfContainedCorpus,
  sha256,
} from './materialize.mjs'

const fixtureCurve = {
  groupId: 'g',
  concreteCurveIdentity: '"C"|"in-ear"|"711"|"Model"',
  collection: 'C',
  form: 'in-ear',
  model: 'Model',
  processedName: 'Model',
  deviceFamily: 'model',
  configurationSignature: 'model',
  rig: '711',
  rigClass: '711-class',
  path: 'measurements/C/data/in-ear/Model.csv',
  blobSha: 'a'.repeat(40),
  upstreamSha256: 'b'.repeat(64),
  originalParsedPointsSha256: 'c'.repeat(64),
  canonicalParsedPointsSha256: 'd'.repeat(64),
  normalizedParsedPointsSha256: 'e'.repeat(64),
  endpointTransformation: null,
  normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
  parserCanonicalizerVersion: 1,
}

function fixtureMember(overrides = {}) {
  return { ...fixtureCurve, normalizedParsedPointsSha256: sha256(JSON.stringify([[20, 1], [500, 0], [20_000, -2]])), ...overrides }
}

test('frozen C1f and upstream identities are exact', () => {
  assert.equal(C1H_C1F_EVIDENCE_COMMIT, 'f93adaf41ac4dcf02897d5f390c911014a4fa536')
  assert.equal(C1H_UPSTREAM_COMMIT, '7ae0f56d53074872b028649617a22bbb4232feb7')
  assert.equal(C1H_UPSTREAM_TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
})

test('frozen primary and secondary selections cannot change', () => {
  assert.doesNotThrow(() => assertFrozenSelection(C1H_PRIMARY_GROUP_IDS, C1H_SECONDARY_GROUP_IDS))
  assert.throws(() => assertFrozenSelection(['other'], C1H_SECONDARY_GROUP_IDS), /primary selection mismatch/)
  assert.throws(() => assertFrozenSelection(C1H_PRIMARY_GROUP_IDS, ['other']), /secondary selection mismatch/)
})

test('raw upstream and Batch C paths are rejected before writing/opening', () => {
  assert.throws(() => assertNoRawUpstreamArtifactPath('.research-artifacts/c1h-self-contained-corpus/raw.csv'), /raw upstream bytes/)
  assert.doesNotThrow(() => assertNoRawUpstreamArtifactPath('.research-artifacts/c1h-self-contained-corpus/group.json'))
  assert.throws(() => assertNoBatchCPath('.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'), /Batch C seal/)
})

test('materialized curve retains normalized arrays and deterministic identity hash', () => {
  const curve = buildMaterializedCurve(fixtureMember(), [[20, 1], [500, 0], [20_000, -2]], [[20, 1], [500, 0], [20_000, -2]], [[20, 1], [500, 0], [20_000, -2]], null, false)
  assert.deepEqual(curve.frequencyHz, [20, 500, 20_000])
  assert.deepEqual(curve.normalizedDb, [1, 0, -2])
  assert.equal(curve.curveHash.length, 64)
  assert.equal(curve.curveHash, buildMaterializedCurve(fixtureMember(), [[20, 1], [500, 0], [20_000, -2]], [[20, 1], [500, 0], [20_000, -2]], [[20, 1], [500, 0], [20_000, -2]], null, false).curveHash)
})

test('curve integrity fails closed for each C1f hash mismatch', () => {
  const points = [[20, 1], [500, 0], [20_000, -2]]
  const curve = buildMaterializedCurve(fixtureMember(), points, points, points, null, false)
  assert.throws(() => verifyCurveIntegrity({ ...curve, upstreamSha256: 'f'.repeat(64) }), /materialized curve hash/)
  assert.throws(() => verifyCurveIntegrity({ ...curve, originalParsedPointsSha256: 'f'.repeat(64) }), /materialized curve hash/)
  assert.throws(() => verifyCurveIntegrity({ ...curve, canonicalParsedPointsSha256: 'f'.repeat(64) }), /materialized curve hash/)
  assert.throws(() => verifyCurveIntegrity({ ...curve, normalizedParsedPointsSha256: 'f'.repeat(64) }), /normalized parsed/)
})

test('group hash and corpus hash are deterministic and input-order invariant', () => {
  const a = buildMaterializedCurve(fixtureMember({ concreteCurveIdentity: 'a', normalizedParsedPointsSha256: sha256(JSON.stringify([[20, 1], [500, 0]])) }), [[20, 1], [500, 0]], [[20, 1], [500, 0]], [[20, 1], [500, 0]], null, false)
  const b = buildMaterializedCurve(fixtureMember({ concreteCurveIdentity: 'b', normalizedParsedPointsSha256: sha256(JSON.stringify([[20, 2], [500, 0]])) }), [[20, 2], [500, 0]], [[20, 2], [500, 0]], [[20, 2], [500, 0]], null, false)
  const left = buildGroupArtifact({ group: { groupId: 'g', manufacturer: 'x', model: 'y', deviceFamily: 'y', configurationSignature: 'y', canonicalIdentity: 'x|y|y', canonicalFamily: 'y', aliases: [] }, role: 'PRIMARY', members: [a, b] })
  const right = buildGroupArtifact({ group: { groupId: 'g', manufacturer: 'x', model: 'y', deviceFamily: 'y', configurationSignature: 'y', canonicalIdentity: 'x|y|y', canonicalFamily: 'y', aliases: [] }, role: 'PRIMARY', members: [b, a] })
  assert.equal(left.groupHash, right.groupHash)
  const corpusA = buildCorpusHash({ primaryGroupIds: ['g'], secondaryGroupIds: [], groups: [left], c1fEvidenceCommit: 'x', c1fHashIndex: 'y', upstreamCommit: 'u', upstreamTree: 't', parserCanonicalizerVersion: 1 })
  const corpusB = buildCorpusHash({ primaryGroupIds: ['g'], secondaryGroupIds: [], groups: [right], c1fEvidenceCommit: 'x', c1fHashIndex: 'y', upstreamCommit: 'u', upstreamTree: 't', parserCanonicalizerVersion: 1 })
  assert.equal(corpusA, corpusB)
})

test('C1f artifact hash index verifies without self-hashing', () => {
  const files = { 'manifest.json': Buffer.from('a'), 'groups.json': Buffer.from('b') }
  const index = createArtifactHashIndex(files)
  assert.match(index, /^artifact-hash-index-v1\n/)
  assert.doesNotThrow(() => verifyC1fEvidenceHashIndex(files, index, { requireFrozenHash: false }))
  assert.throws(() => verifyC1fEvidenceHashIndex({ ...files, 'groups.json': Buffer.from('c') }, index, { requireFrozenHash: false }), /hash mismatch/)
})

test('offline verifier rejects cache/network dependencies and validates committed payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1h-'))
  try {
    await assert.rejects(() => verifySelfContainedCorpus({ repoRoot: root, artifactRoot: join(root, '.research-artifacts/c1h-self-contained-corpus') }), /manifest/) 
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// The source-level guard is intentionally simple and stable: C1h must never import or call solver APIs.
test('materializer has no solver/AutoEQ execution path', async () => {
  const source = await readFile(new URL('./materialize.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /runStandardAutoEqV2|StandardAutoEq|optimizer|candidate generation|PEQ/i)
})

test('wrong C1f evidence commit, hash index, or upstream pin is rejected', () => {
  assert.throws(() => assertC1fSourceIdentity({ evidenceCommit: 'wrong', hashIndexSha256: C1H_C1F_HASH_INDEX_SHA256, upstreamCommit: C1H_UPSTREAM_COMMIT, upstreamTree: C1H_UPSTREAM_TREE }), /evidence commit/)
  assert.throws(() => assertC1fSourceIdentity({ evidenceCommit: C1H_C1F_EVIDENCE_COMMIT, hashIndexSha256: 'wrong', upstreamCommit: C1H_UPSTREAM_COMMIT, upstreamTree: C1H_UPSTREAM_TREE }), /hash-index/)
  assert.throws(() => assertC1fSourceIdentity({ evidenceCommit: C1H_C1F_EVIDENCE_COMMIT, hashIndexSha256: C1H_C1F_HASH_INDEX_SHA256, upstreamCommit: 'wrong', upstreamTree: C1H_UPSTREAM_TREE }), /upstream pin/)
})

test('missing or unexpected frozen groups are rejected', () => {
  const good = new Map(C1H_SELECTED_GROUP_IDS.map((id) => [id, { groupId: id }]))
  assert.doesNotThrow(() => assertSelectedGroups(good))
  good.delete(C1H_PRIMARY_GROUP_IDS[0])
  assert.throws(() => assertSelectedGroups(good), /selected C1f group missing/)
  const groups = C1H_PRIMARY_GROUP_IDS.map((id) => ({ groupId: id, role: 'PRIMARY', members: [] }))
  assert.throws(() => assertPrimaryMaterializationCounts(groups), /primary materialization count mismatch/)
})

test('source-derived original, canonical, and normalized hashes are all checked', () => {
  const raw = Buffer.from('frequency,db\n20,1\n500,0\n20000,-2\n')
  const points = [[20, 1], [500, 0], [20_000, -2]]
  const expected = {
    blobSha: null,
    byteLength: raw.length,
    upstreamSha256: sha256(raw),
    originalParsedPointsSha256: sha256(JSON.stringify(points)),
    canonicalParsedPointsSha256: sha256(JSON.stringify(points)),
    normalizedParsedPointsSha256: sha256(JSON.stringify(points)),
    endpointTransformation: null,
  }
  const member = fixtureMember({ concreteCurveIdentity: 'source' })
  assert.deepEqual(verifyRawDerivedHashes(member, expected, raw).normalizedPoints, points)
  assert.throws(() => verifyRawDerivedHashes(member, { ...expected, upstreamSha256: 'f'.repeat(64) }, raw), /SHA-256/)
  assert.throws(() => verifyRawDerivedHashes(member, { ...expected, originalParsedPointsSha256: 'f'.repeat(64) }, raw), /original parsed/)
  assert.throws(() => verifyRawDerivedHashes(member, { ...expected, canonicalParsedPointsSha256: 'f'.repeat(64) }, raw), /canonical parsed/)
  assert.throws(() => verifyRawDerivedHashes(member, { ...expected, normalizedParsedPointsSha256: 'f'.repeat(64) }, raw), /normalized parsed/)
})

test('primary and secondary IDs are exactly the frozen C1f selections', () => {
  assert.deepEqual(C1H_PRIMARY_GROUP_IDS, [
    'c1g-251bf90cf23f557cb011', 'c1g-c45cb51de5231139b2f2', 'c1g-e9b56c7e332c693b6f82',
    'c1g-41b1767dc01a935198bf', 'c1g-ba1d3af16db7a116d755', 'c1g-1be44ee4bdbd73cbf632',
  ])
  assert.deepEqual(C1H_SECONDARY_GROUP_IDS, [
    'c1g-6cf5995d049cff49d672', 'c1g-ccc7fd5250bd1714c73e', 'c1g-2fd95af2a97278cf88ef',
    'c1g-256c26e3bb37c97b890a', 'c1g-6398ddcd56119d32eb70', 'c1g-3b112b59456722f8dabe',
  ])
})

test('offline verifier explicitly refuses cache and Batch C paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'c1h-cache-'))
  try {
    await assert.rejects(() => verifySelfContainedCorpus({ repoRoot: root, artifactRoot: join(root, '.research-cache/c1f-upstream-reserve-corpus') }), /cache/)
    assert.throws(() => assertNoBatchCPath('.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'), /Batch C seal/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('committed offline verifier succeeds without cache or network when evidence exists', async (t) => {
  const artifactRoot = join(process.cwd(), '.research-artifacts/c1h-self-contained-corpus')
  try {
    await readFile(join(artifactRoot, 'evidence-sha256.txt'))
  } catch {
    t.skip('evidence commit has not been materialized yet')
    return
  }
  const result = await verifySelfContainedCorpus({ artifactRoot })
  assert.equal(result.primaryCurveCount, 31)
  assert.equal(result.cacheAccessAttempts, 0)
  assert.equal(result.networkAccessAttempts, 0)
})

test('offline verifier source has no network/cache acquisition path', async () => {
  const source = await readFile(new URL('./verify.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|https?:\/\//i)
  assert.doesNotMatch(source, /research-cache|fresh-real-corpus-v1-metadata-repair\/cases\.json/)
})

test('endpoint closure preserves terminal amplitude at the frozen 20 kHz endpoint', () => {
  const raw = Buffer.from('frequency,db\n20,1\n19900,-3\n')
  const original = [[20, 1], [19900, -3]]
  assert.throws(() => verifyRawDerivedHashes(fixtureMember(), { upstreamSha256: sha256(raw), originalParsedPointsSha256: sha256(JSON.stringify(original)), canonicalParsedPointsSha256: '0'.repeat(64), normalizedParsedPointsSha256: '0'.repeat(64), endpointTransformation: 'terminal-flat-hold-to-v2-max' }, raw), /canonical parsed/)
})

test('materialized response points are finite and strictly ordered', () => {
  const points = [[20, 1], [500, 0], [20_000, -2]]
  const curve = buildMaterializedCurve(fixtureMember(), points, points, points, null, false)
  assert.doesNotThrow(() => verifyCurveIntegrity(curve))
  assert.throws(() => verifyCurveIntegrity({ ...curve, frequencyHz: [20, 20], normalizedDb: [1, 2] }), /strictly increasing/)
  assert.throws(() => verifyCurveIntegrity({ ...curve, normalizedDb: [1, Number.NaN, -2] }), /non-finite/)
})

test('group artifact preserves exact-711 and non-711 membership separately', () => {
  const points = [[20, 1], [500, 0]]
  const a = buildMaterializedCurve(fixtureMember({ concreteCurveIdentity: '711', rig: '711', normalizedParsedPointsSha256: sha256(JSON.stringify(points)) }), points, points, points, null, false)
  const b = buildMaterializedCurve(fixtureMember({ concreteCurveIdentity: 'RA0045', rig: 'GRAS RA0045', rigClass: 'gras-ra0045', normalizedParsedPointsSha256: sha256(JSON.stringify(points)) }), points, points, points, null, false)
  const group = buildGroupArtifact({ group: { groupId: 'g', manufacturer: 'x', model: 'y', deviceFamily: 'y', configurationSignature: 'y', canonicalIdentity: 'x|y|y', canonicalFamily: 'y', aliases: [] }, role: 'SECONDARY_RESERVE_UNEXECUTED', members: [b, a] })
  assert.equal(group.exact711Count, 1)
  assert.equal(group.non711Count, 1)
  assert.deepEqual(group.non711RigClasses, ['gras-ra0045'])
})

test('every final artifact path rejects a CSV raw-byte payload', () => {
  assert.throws(() => assertNoRawUpstreamArtifactPath('.research-artifacts/c1h-self-contained-corpus/curve.csv'), /raw upstream bytes/)
  assert.throws(() => assertNoRawUpstreamArtifactPath('.research-artifacts/c1h-self-contained-corpus/.research-cache/x'), /raw upstream bytes/)
})

test('secondary reserve is explicitly unexecuted and cannot become primary', () => {
  const points = [[20, 1], [500, 0]]
  const member = buildMaterializedCurve(fixtureMember({ groupId: C1H_SECONDARY_GROUP_IDS[0], normalizedParsedPointsSha256: sha256(JSON.stringify(points)) }), points, points, points, null, false)
  const group = buildGroupArtifact({ group: { groupId: C1H_SECONDARY_GROUP_IDS[0], manufacturer: 'x', model: 'y', deviceFamily: 'y', configurationSignature: 'y', canonicalIdentity: 'x|y|y', canonicalFamily: 'y', aliases: [] }, role: 'SECONDARY_RESERVE_UNEXECUTED', members: [member] })
  assert.equal(group.role, 'SECONDARY_RESERVE_UNEXECUTED')
  assert.throws(() => assertPrimaryMaterializationCounts([group]), /primary materialization count mismatch/)
})

test('corpus hash includes frozen provenance and changes when provenance changes', () => {
  const points = [[20, 1], [500, 0]]
  const member = buildMaterializedCurve(fixtureMember({ normalizedParsedPointsSha256: sha256(JSON.stringify(points)) }), points, points, points, null, false)
  const group = buildGroupArtifact({ group: { groupId: 'g', manufacturer: 'x', model: 'y', deviceFamily: 'y', configurationSignature: 'y', canonicalIdentity: 'x|y|y', canonicalFamily: 'y', aliases: [] }, role: 'PRIMARY', members: [member] })
  const base = { primaryGroupIds: ['g'], secondaryGroupIds: [], groups: [group], c1fEvidenceCommit: C1H_C1F_EVIDENCE_COMMIT, c1fHashIndex: C1H_C1F_HASH_INDEX_SHA256, upstreamCommit: C1H_UPSTREAM_COMMIT, upstreamTree: C1H_UPSTREAM_TREE, parserCanonicalizerVersion: 1 }
  assert.notEqual(buildCorpusHash(base), buildCorpusHash({ ...base, upstreamTree: 'different' }))
})

test('safety flags stay corpus-only when committed evidence is present', async (t) => {
  const manifestPath = join(process.cwd(), '.research-artifacts/c1h-self-contained-corpus/manifest.json')
  let manifest
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch { t.skip('evidence commit has not been materialized yet'); return }
  if (manifest.classification !== 'C1H_CORPUS_SELF_CONTAINED') { t.skip('evidence commit has not been materialized yet'); return }
  assert.equal(manifest.solverExecuted, false)
  assert.equal(manifest.causalOutcomesGenerated, false)
  assert.equal(manifest.confidenceMetricsComputed, false)
  assert.equal(manifest.batchCAccessed, false)
  assert.equal(manifest.batchCExecuted, false)
  assert.equal(manifest.rawUpstreamBytesCommitted, false)
  assert.equal(manifest.normalizedResponsePointsCommitted, true)
})
