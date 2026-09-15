import assert from 'node:assert/strict'
import test from 'node:test'
import {
  C1F_EXPECTED_RESERVE_COUNT,
  C1F_PRIMARY_COUNT,
  C1F_SECONDARY_COUNT,
  C1F_UPSTREAM_COMMIT,
  C1F_UPSTREAM_TREE,
  deriveReserveUniverse,
  canonicalIdentity,
  identitiesOverlap,
  classifyC1fRig,
  canonicalizeEndpointForC1f,
  selectionRank,
  choosePrimaryGroups,
  chooseSecondaryReserve,
  assertNoBatchCPath,
  createArtifactHashIndex,
  verifyArtifactHashIndex,
  confidenceModelHash,
  normalizeMemberOrder,
  assertNoForbiddenOutcomeFields,
  buildIndependenceMatrix,
  classifyC1fReadiness,
  C1B_DEVELOPMENT_GROUP_IDS,
  C1C_HOLDOUT_GROUP_IDS,
  C1D_PRIMARY_GROUP_IDS,
  markDuplicateCandidates,
} from './discover.mjs'

test('frozen upstream identity is pinned', () => {
  assert.equal(C1F_UPSTREAM_COMMIT, '7ae0f56d53074872b028649617a22bbb4232feb7')
  assert.equal(C1F_UPSTREAM_TREE, '671f0a72499ace671e4b0a293bc1948bb8330c96')
})

test('reserve universe is the exact 34 minus 12 difference', () => {
  const eligible = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']
  const selected = ['g2', 'g5']
  assert.deepEqual(deriveReserveUniverse({ eligibleGroupIds: eligible, selectedGroupIds: selected, expectedEligibleCount: null, expectedSelectedCount: null, expectedReserveCount: null }), ['g1', 'g3', 'g4', 'g6', 'g7'])
  assert.throws(() => deriveReserveUniverse({ eligibleGroupIds: eligible, selectedGroupIds: ['not-present'], expectedEligibleCount: null, expectedSelectedCount: null, expectedReserveCount: null }), /selected group is not in eligible universe/)
})

test('canonical identity detects aliases and preserves variants', () => {
  const zero = canonicalIdentity({ manufacturer: '7Hz', model: 'Zero', configurationSignature: '7Hz Zero' })
  const salnotes = canonicalIdentity({ manufacturer: '7Hz', model: 'Salnotes Zero', configurationSignature: '7Hz Salnotes Zero' })
  assert.equal(identitiesOverlap(zero, salnotes), true)
  const black = canonicalIdentity({ manufacturer: 'Simgot', model: 'EA500', configurationSignature: 'Simgot Audio EA500 (black nozzle)' })
  const red = canonicalIdentity({ manufacturer: 'Simgot', model: 'EA500', configurationSignature: 'Simgot Audio EA500 (red nozzle)' })
  assert.equal(identitiesOverlap(black, red), false)
})

test('different models from one manufacturer are not collapsed', () => {
  const a = canonicalIdentity({ manufacturer: 'Moondrop', model: 'Aria', configurationSignature: 'Moondrop Aria' })
  const b = canonicalIdentity({ manufacturer: 'Moondrop', model: 'Quarks', configurationSignature: 'Moondrop Quarks' })
  assert.equal(identitiesOverlap(a, b), false)
})

test('rig taxonomy uses exact strings and never nominal similarity', () => {
  assert.equal(classifyC1fRig('711').rigClass, '711-class')
  assert.equal(classifyC1fRig('GRAS 43AC').rigClass, 'gras-43ac')
  assert.equal(classifyC1fRig('GRAS 43AC', { classSpecificRigClasses: ['gras-43ac'] }).profileCategory, 'CLASS_SPECIFIC')
  assert.equal(classifyC1fRig('GRAS 43AC ').profileCategory, 'UNKNOWN_RIG_CLASS')
})

test('terminal endpoint closes only to 20 kHz with last observed dB', () => {
  const out = canonicalizeEndpointForC1f([[20, 1], [19_900, -3]])
  assert.equal(out.points.at(-1)[0], 20_000)
  assert.equal(out.points.at(-1)[1], -3)
  assert.equal(out.transformation, 'terminal-flat-hold-to-v2-max')
  assert.deepEqual(canonicalizeEndpointForC1f([[20, 1], [20_000, -3]]).transformation, null)
  assert.throws(() => canonicalizeEndpointForC1f([[20, 1], [10_000, -3]]), /terminal/)
})

test('member order is invariant', () => {
  const members = [{ observationId: 'b', collection: 'z' }, { observationId: 'a', collection: 'y' }]
  assert.deepEqual(normalizeMemberOrder(members).map((m) => m.observationId), ['a', 'b'])
})

test('selection is deterministic, structural, and does not read confidence magnitudes', () => {
  const groups = [
    { groupId: 'b', non711RigClasses: ['r2'], exact711IndependentCount: 3, totalIndependentCount: 4, canonicalFamily: 'f2', provenanceSources: ['s2'] },
    { groupId: 'a', non711RigClasses: ['r1'], exact711IndependentCount: 3, totalIndependentCount: 5, canonicalFamily: 'f1', provenanceSources: ['s1'], weights: { w_conf: [999] } },
    { groupId: 'c', non711RigClasses: ['r1', 'r2'], exact711IndependentCount: 4, totalIndependentCount: 6, canonicalFamily: 'f3', provenanceSources: ['s3'] },
  ]
  const selected = choosePrimaryGroups(groups, 2)
  assert.deepEqual(selected.map((g) => g.groupId), ['c', 'a'])
  assert.deepEqual(choosePrimaryGroups([...groups].reverse(), 2).map((g) => g.groupId), ['c', 'a'])
  assert.equal(selectionRank(groups[0], []).hash.length, 64)
})

test('secondary reserve is deterministic and cannot alter primary', () => {
  const groups = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((groupId, index) => ({ groupId, non711RigClasses: [`r${index % 2}`], exact711IndependentCount: 3, totalIndependentCount: 4, canonicalFamily: `f${index}`, provenanceSources: [`s${index}`] }))
  const primary = choosePrimaryGroups(groups, 6)
  const secondary = chooseSecondaryReserve(groups, primary, 6)
  assert.equal(primary.length, 6)
  assert.equal(secondary.length, 1)
  assert.deepEqual(primary.map((g) => g.groupId), choosePrimaryGroups([...groups].reverse(), 6).map((g) => g.groupId))
})

test('Batch C path guard rejects before open', () => {
  assert.throws(() => assertNoBatchCPath('.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'), /Batch C seal/)
  assert.throws(() => assertNoBatchCPath('x/.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'), /Batch C seal/)
  assert.doesNotThrow(() => assertNoBatchCPath('.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/historical-device-exclusions.json'))
})

test('outcome fields are forbidden in corpus-only evidence', () => {
  assert.doesNotThrow(() => assertNoForbiddenOutcomeFields({ solverExecuted: false, confidenceMetricsComputed: false }))
  assert.throws(() => assertNoForbiddenOutcomeFields({ solverExecuted: true }), /forbidden/)
  assert.throws(() => assertNoForbiddenOutcomeFields({ disagreementMagnitude: 1 }), /forbidden/)
})

test('hash index excludes itself and verifies after writing', () => {
  const files = { 'manifest.json': Buffer.from('one'), 'groups.json': Buffer.from('two') }
  const index = createArtifactHashIndex(files)
  assert.match(index, /^artifact-hash-index-v1\n/)
  assert.ok(!index.includes('evidence-sha256.txt'))
  assert.equal(verifyArtifactHashIndex(files, index), true)
  assert.throws(() => verifyArtifactHashIndex({ ...files, 'groups.json': Buffer.from('changed') }, index), /hash mismatch/)
})

test('confidence model hash uses frozen stable-json omission rule', () => {
  const model = { z: 1, modelSha256: 'placeholder', a: { b: 2 } }
  const hash = confidenceModelHash(model)
  assert.equal(hash.length, 64)
  assert.equal(hash, confidenceModelHash({ ...model, modelSha256: 'different' }))
})

test('independence matrix exposes each overlap axis', () => {
  const matrix = buildIndependenceMatrix([{ candidateId: 'c', canonicalIdentity: 'm|f|cfg', canonicalFamily: 'f', provenanceSources: ['s'], non711RigClasses: ['r'], c1bOverlap: [], c1cOverlap: [], c1dOverlap: [], historicalGroupIds: [], batchCOverlap: false }], { batchCOverlapStatus: 'VERIFIED_WITHOUT_BREAKING_SEAL' })
  assert.deepEqual(Object.keys(matrix.candidates[0]).sort(), ['batchCOverlap', 'candidateId', 'candidateToCandidateDuplicateIdentity', 'c1bTrainingIemIdentities', 'c1cHoldoutIemIdentities', 'c1dPrimaryIemIdentities', 'familyIdentity', 'historicalC1GroupIds', 'measurementRigClasses', 'measurementSourceIdentityReuse'].sort())
})

test('readiness requires six groups and two non-711 classes', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ candidateId: `c${i}`, non711RigClasses: [i === 0 ? 'r1' : 'r2'] }))
  assert.equal(classifyC1fReadiness(six), 'C1F_CORPUS_READY')
  assert.equal(classifyC1fReadiness(six.slice(0, 5)), 'C1F_CORPUS_INSUFFICIENT')
  assert.equal(classifyC1fReadiness(six.map((x) => ({ ...x, non711RigClasses: ['r1'] }))), 'C1F_CORPUS_INSUFFICIENT')
})

assert.equal(C1F_EXPECTED_RESERVE_COUNT, 22)
assert.equal(C1F_PRIMARY_COUNT, 6)
assert.equal(C1F_SECONDARY_COUNT, 6)


test('all six C1d primary IDs remain consumed independently of invalidation', () => {
  assert.deepEqual([...C1D_PRIMARY_GROUP_IDS].sort(), [...C1C_HOLDOUT_GROUP_IDS].sort())
  assert.equal(new Set(C1D_PRIMARY_GROUP_IDS).size, 6)
  assert.equal(new Set(C1B_DEVELOPMENT_GROUP_IDS).size, 6)
})

test('C1d invalid outcome fields cannot affect structural ranking', () => {
  const clean = { groupId: 'clean', non711RigClasses: ['r1'], exact711IndependentCount: 3, totalIndependentCount: 4 }
  const invalidated = { groupId: 'invalidated', non711RigClasses: ['r2'], exact711IndependentCount: 99, totalIndependentCount: 99, c1dOutcome: { classification: 'INCONCLUSIVE', gainVsBaseline: 999 } }
  assert.deepEqual(choosePrimaryGroups([clean, invalidated], 1).map((group) => group.groupId), ['invalidated'])
  assert.equal(assertNoForbiddenOutcomeFields({ c1dOutcome: { classification: 'INCONCLUSIVE' } }), true)
})

test('unknown rig is structurally visible but cannot be classified as a known rig', () => {
  const unknown = classifyC1fRig('GRAS 43AC?')
  assert.equal(unknown.known, false)
  assert.equal(unknown.profileCategory, 'UNKNOWN_RIG_CLASS')
  assert.equal(unknown.rigClass, null)
})

test('duplicate candidate identity is collapsed without response inspection', () => {
  const base = { groupId: 'g', canonicalIdentity: 'same', classification: 'ELIGIBLE_RESERVE_GROUP', independence: { candidateToCandidateDuplicateIdentity: false } }
  const duplicates = markDuplicateCandidates([{ ...base }, { ...base, groupId: 'h', independence: { candidateToCandidateDuplicateIdentity: false } }])
  assert.deepEqual(duplicates.map((candidate) => candidate.classification), ['DUPLICATE_CANDIDATE', 'DUPLICATE_CANDIDATE'])
  assert.equal(duplicates.every((candidate) => candidate.independence.candidateToCandidateDuplicateIdentity), true)
})

test('primary selection is invariant to candidate row order and reserve suffix', () => {
  const groups = Array.from({ length: 8 }, (_, index) => ({ groupId: `g${index}`, non711RigClasses: [`r${index % 3}`], exact711IndependentCount: 3 + (index % 2), totalIndependentCount: 4 + (index % 2) }))
  const first = choosePrimaryGroups(groups, 6).map((group) => group.groupId)
  const second = choosePrimaryGroups([...groups.slice(0, 6), ...groups.slice(6).reverse()].reverse(), 6).map((group) => group.groupId)
  assert.deepEqual(first, second)
})

test('corpus runner and selection code do not contain a solver call', () => {
  assert.doesNotMatch(choosePrimaryGroups.toString(), /runStandardAutoEqV2|optimizer|solver/i)
})
