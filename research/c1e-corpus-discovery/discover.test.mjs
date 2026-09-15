import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BATCH_C_CASES_PATH,
  C1B_DEVELOPMENT_GROUP_IDS,
  C1C_HOLDOUT_GROUP_IDS,
  C1D_PRIMARY_GROUP_IDS,
  canonicalIemIdentity,
  classifyRigForDiscovery,
  buildPriorC1ExclusionLedger,
  buildCandidateInventory,
  candidateIdFor,
  chooseProposedPrimary,
  classifyReadiness,
  discoverFromRecords,
  guardReadPath,
  hasSolverToken,
} from './discover.mjs'

const pointGrid = Array.from({ length: 3 }, (_, index) => [20 * (index + 1), index])

function observation({
  id,
  manufacturer = 'Example Audio',
  model = 'Example One',
  canonicalModelName,
  aliases,
  familyIdentity,
  rig,
  sourceId = `${id}-source`,
  responsePath = `fixtures/${id}.csv`,
  responseData = pointGrid,
  configurationSignature,
  variant,
}) {
  return {
    observationId: id,
    manufacturer,
    model,
    canonicalModelName,
    aliases,
    familyIdentity,
    configurationSignature,
    variant,
    rig,
    sourceId,
    responsePath,
    responseData,
    provenance: { measurementSourceId: sourceId, sourceId, path: responsePath },
  }
}

function validGroup(id, model = `Model ${id}`, rig = 'GRAS 43AC') {
  return [
    observation({ id: `${id}-711`, model, rig: '711', sourceId: `${id}-711-source` }),
    observation({ id: `${id}-non711`, model, rig, sourceId: `${id}-non711-source` }),
  ]
}

test('C1b development identity is excluded', () => {
  const ledger = buildPriorC1ExclusionLedger({
    developmentGroups: [{ groupId: C1B_DEVELOPMENT_GROUP_IDS[0], deviceFamily: 'Example One' }],
    holdoutGroups: [],
    c1dManifest: { primaryGroupIds: [] },
  })
  assert.equal(ledger.groups.find((entry) => entry.groupId === C1B_DEVELOPMENT_GROUP_IDS[0]).reason, 'USED_FOR_MODEL_TRAINING')
})

test('C1c identity is excluded', () => {
  const ledger = buildPriorC1ExclusionLedger({
    developmentGroups: [],
    holdoutGroups: [{ groupId: C1C_HOLDOUT_GROUP_IDS[0], deviceFamily: 'Example Two' }],
    c1dManifest: { primaryGroupIds: [] },
  })
  assert.equal(ledger.groups.find((entry) => entry.groupId === C1C_HOLDOUT_GROUP_IDS[0]).reason, 'USED_FOR_C1C_HOLDOUT')
})

test('all six C1d primary IDs are excluded', () => {
  const ledger = buildPriorC1ExclusionLedger({
    developmentGroups: [],
    holdoutGroups: [],
    c1dManifest: { primaryGroupIds: C1D_PRIMARY_GROUP_IDS },
  })
  assert.deepEqual(ledger.groupIdsByReason.CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL, C1D_PRIMARY_GROUP_IDS.toSorted())
})

test('new group ID cannot bypass identity overlap', () => {
  const prior = buildPriorC1ExclusionLedger({
    developmentGroups: [{ groupId: 'old-id', deviceFamily: 'Example Audio Example One' }],
    holdoutGroups: [],
    c1dManifest: { primaryGroupIds: [] },
  })
  const inventory = buildCandidateInventory([ ...validGroup('new-id', 'Example One') ], { priorLedger: prior })
  assert.equal(inventory.candidates[0].classification, 'USED_FOR_MODEL_TRAINING')
})

test('aliases for the same model are detected', () => {
  const left = canonicalIemIdentity(observation({ id: 'a', manufacturer: '7Hz', model: 'Zero' }))
  const right = canonicalIemIdentity(observation({ id: 'b', manufacturer: '7Hz', model: 'Salnotes Zero' }))
  assert.equal(left.overlapKeys.some((key) => right.overlapKeys.includes(key)), true)
})

test('different models from one manufacturer remain distinct', () => {
  const left = canonicalIemIdentity(observation({ id: 'a', manufacturer: 'Example', model: 'One' }))
  const right = canonicalIemIdentity(observation({ id: 'b', manufacturer: 'Example', model: 'Two' }))
  assert.equal(left.overlapKeys.some((key) => right.overlapKeys.includes(key)), false)
})

test('variant and tuning mismatch is excluded', () => {
  const records = [
    observation({ id: 'v1-711', model: 'Example One', rig: '711', variant: 'red filter' }),
    observation({ id: 'v1-non', model: 'Example One', rig: 'GRAS 43AC', variant: 'blue filter' }),
  ]
  const inventory = buildCandidateInventory(records)
  assert.equal(inventory.candidates[0].classification, 'VARIANT_OR_REVISION_MISMATCH')
})

test('group without exact 711 is excluded', () => {
  const inventory = buildCandidateInventory([observation({ id: 'only-non', rig: 'GRAS 43AC' })])
  assert.equal(inventory.candidates[0].classification, 'NO_EXACT711_REFERENCE')
})

test('group without non-711 is excluded', () => {
  const inventory = buildCandidateInventory([observation({ id: 'only-711', rig: '711' })])
  assert.equal(inventory.candidates[0].classification, 'NO_NON711_OBSERVATION')
})

test('unknown rig is not primary-ready', () => {
  const inventory = buildCandidateInventory([
    observation({ id: 'unknown-711', rig: '711' }),
    observation({ id: 'unknown-non', rig: 'mystery rig' }),
  ])
  assert.equal(inventory.candidates[0].classification, 'UNKNOWN_RIG_CLASS')
})

test('duplicate candidate observations collapse', () => {
  const records = [...validGroup('dup'), ...validGroup('dup')]
  const inventory = buildCandidateInventory(records)
  assert.equal(inventory.candidates.length, 1)
  assert.equal(inventory.candidates[0].exact711ObservationCount, 1)
})

test('candidate IDs are deterministic', () => {
  const first = candidateIdFor({ canonicalIemIdentity: 'example|one', exact711ObservationIds: ['a'], non711ObservationIds: ['b'], rigClasses: ['gras-43ac'], sourceProvenanceIds: ['s'] })
  const second = candidateIdFor({ canonicalIemIdentity: 'example|one', exact711ObservationIds: ['a'], non711ObservationIds: ['b'], rigClasses: ['gras-43ac'], sourceProvenanceIds: ['s'] })
  assert.equal(first, second)
})

test('input order does not change candidate IDs', () => {
  const a = buildCandidateInventory([...validGroup('order')]).candidates[0].candidateId
  const b = buildCandidateInventory([...validGroup('order')].reverse()).candidates[0].candidateId
  assert.equal(a, b)
})

test('selection does not read confidence magnitudes', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    candidateId: `c1e-${index}`,
    canonicalFamily: `family-${index}`,
    non711RigClasses: [index % 2 ? 'gras-ra0045' : 'gras-43ac'],
    provenanceSources: [`source-${index}`],
    exact711ObservationCount: 2,
    profileCategories: ['CLASS_SPECIFIC'],
    confidenceWeights: { forbidden: 999 },
  }))
  assert.doesNotThrow(() => chooseProposedPrimary(candidates))
})

test('selection does not read disagreement magnitude', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    candidateId: `c1e-${index}`,
    canonicalFamily: `family-${index}`,
    non711RigClasses: ['gras-43ac'],
    provenanceSources: [`source-${index}`],
    exact711ObservationCount: 2,
    disagreementMagnitude: Number.NaN,
  }))
  assert.equal(chooseProposedPrimary(candidates).length, 6)
})

test('selection never calls a solver', () => {
  assert.equal(hasSolverToken(String(chooseProposedPrimary)), false)
})

test('fewer than six groups is insufficient', () => {
  assert.equal(classifyReadiness({ primaryReadyCandidates: Array(5).fill({}), batchCOverlapStatus: 'VERIFIED_WITHOUT_BREAKING_SEAL' }), 'C1E_CORPUS_INSUFFICIENT')
})

test('six groups across two rig classes are structurally ready', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({ non711RigClasses: [index % 2 ? 'gras-ra0045' : 'gras-43ac'] }))
  assert.equal(classifyReadiness({ primaryReadyCandidates: candidates, batchCOverlapStatus: 'VERIFIED_WITHOUT_BREAKING_SEAL' }), 'C1E_CORPUS_READY')
})

test('secondary reserve cannot change deterministic primary selection', () => {
  const candidates = Array.from({ length: 7 }, (_, index) => ({
    candidateId: `c1e-${index}`,
    canonicalFamily: `family-${index}`,
    non711RigClasses: [index % 2 ? 'gras-ra0045' : 'gras-43ac'],
    provenanceSources: [`source-${index}`],
    exact711ObservationCount: 2,
  }))
  assert.deepEqual(chooseProposedPrimary(candidates), chooseProposedPrimary(candidates.slice(0, 6)).filter((id) => candidates.slice(0, 6).some((item) => item.candidateId === id)))
})

test('Batch C cases path is denied before filesystem access', () => {
  const ledger = { accessedPaths: [], rejectedPaths: [], batchCAccessAttempts: 0 }
  assert.throws(() => guardReadPath(BATCH_C_CASES_PATH, ledger), /SEALED_BATCH_C_ACCESS_FORBIDDEN/)
  assert.equal(ledger.batchCAccessAttempts, 0)
  assert.deepEqual(ledger.accessedPaths, [])
})

test('discoverFromRecords emits no causal or solver fields', () => {
  const result = discoverFromRecords(validGroup('safe'))
  assert.equal(result.solverExecuted, false)
  assert.equal(result.causalOutcomesGenerated, false)
  assert.equal(Object.hasOwn(result.candidates[0], 'disagreementMagnitude'), false)
})
