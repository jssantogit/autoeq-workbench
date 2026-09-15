import assert from 'node:assert/strict'
import test from 'node:test'

import {
  C1A_SELECTION_SEED,
  C1A_SPLIT_SEED,
  C1V11_CORPUS_VERSION,
  SEALED_FUTURE_BATCH_C,
  PRIOR_OUTCOME_OBSERVED,
  PRIOR_C4_OUTCOME_OBSERVED,
  PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED,
  canonicalDeviceFamily,
  buildHistoricalDeviceExclusions,
  deriveGroupId,
  filterExcludedRecords,
  assertC1V11Independence,
} from './c1a-v1.1.mjs'

test('v1.1 keeps the frozen C1a seeds and uses a versioned corpus', () => {
  assert.equal(C1V11_CORPUS_VERSION, 'c1-cross-rig-confidence-corpus-v1.1')
  assert.equal(C1A_SELECTION_SEED, 'autoeq-workbench:c1-cross-rig-corpus-v1')
  assert.equal(C1A_SPLIT_SEED, 'autoeq-workbench:c1-cross-rig-split-v1')
})

test('exclusion inventory canonicalizes families and preserves every source provenance', () => {
  const inventory = buildHistoricalDeviceExclusions({
    freshCases: [{
      id: 'fresh-a', batch: 'A', split: 'development',
      source: { model: 'Simgot Audio EM6L (stock)', deviceFamily: 'simgot audio em6l', collection: 'A' },
      target: { model: 'Simgot Audio EM6L', deviceFamily: 'simgot audio em6l', collection: 'B' },
    }, {
      id: 'fresh-c', batch: 'C', split: 'holdout',
      source: { model: 'Sealed IEM', collection: 'C' },
      target: { model: 'Sealed IEM', collection: 'D' },
    }],
    c4Groups: [{ groupId: 'c4g-one', deviceFamily: 'Moondrop Chu', split: 'development' }],
    structuralFixtures: [{ id: 'letshuoer-mystic-8', role: 'target', path: 'raw/mystic.txt' }],
  })

  const em6l = inventory.exclusions.find((entry) => entry.deviceFamily === 'simgot audio em6l')
  assert.deepEqual(em6l.reasons, [PRIOR_OUTCOME_OBSERVED])
  assert.equal(em6l.provenance.length, 2)
  assert.deepEqual(em6l.provenance.map((entry) => entry.caseId), ['fresh-a', 'fresh-a'])

  const sealed = inventory.exclusions.filter((entry) => entry.reasons.includes(SEALED_FUTURE_BATCH_C))
  assert.equal(sealed.length, 1)
  assert.equal(sealed[0].deviceFamily, 'sealed iem')
  assert.equal(sealed[0].provenance[0].batch, 'C')
  assert.equal(inventory.reasonCounts[PRIOR_C4_OUTCOME_OBSERVED], 1)
  assert.equal(inventory.reasonCounts[PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED], 1)
})

test('filter excludes every configuration of a canonical family before grouping', () => {
  const exclusions = {
    observedFamilies: new Set(['known iem']),
    sealedBatchCFamilies: new Set(['sealed iem']),
  }
  const records = [
    { deviceFamily: 'known iem', model: 'Known IEM (red filter)' },
    { deviceFamily: canonicalDeviceFamily('Unknown IEM (blue filter)'), model: 'Unknown IEM (blue filter)' },
    { deviceFamily: 'sealed iem', model: 'Sealed IEM (alternate tips)' },
  ]
  assert.deepEqual(filterExcludedRecords(records, exclusions).map((record) => record.model), ['Unknown IEM (blue filter)'])
})

test('independence assertion rejects selected overlap, duplicate families, and invalid gate counts', () => {
  const base = {
    groupId: deriveGroupId('new iem', 'new iem'), deviceFamily: 'new iem', configurationSignature: 'new iem', eligible: true,
    exact711IndependentCount: 3, non711IndependentCount: 1,
    exact711Members: [{ collection: 'a', rig: '711', rigClass: '711-class', integrity: { status: 'valid' }, concreteCurveIdentity: 'a' }, { collection: 'b', rig: '711', rigClass: '711-class', integrity: { status: 'valid' }, concreteCurveIdentity: 'b' }, { collection: 'c', rig: '711', rigClass: '711-class', integrity: { status: 'valid' }, concreteCurveIdentity: 'c' }],
    eligibleNon711Members: [{ collection: 'd', rig: 'GRAS RA0045', rigClass: 'gras-ra0045', integrity: { status: 'valid' }, concreteCurveIdentity: 'd' }],
    members: [],
  }
  base.members = [...base.exact711Members, ...base.eligibleNon711Members]
  const exclusions = { observedFamilies: new Set(['observed iem']), sealedBatchCFamilies: new Set(['sealed iem']) }
  assert.doesNotThrow(() => assertC1V11Independence({ groups: [base], classification: 'C1_CORPUS_V1_1_INSUFFICIENT', exclusions }))
  assert.throws(() => assertC1V11Independence({ groups: [{ ...base, deviceFamily: 'observed iem' }], classification: 'C1_CORPUS_V1_1_INSUFFICIENT', exclusions }), /historical|sealed|overlap/i)
  assert.throws(() => assertC1V11Independence({ groups: [{ ...base, groupId: deriveGroupId('new iem', 'new iem alternate'), configurationSignature: 'new iem alternate' }, base], classification: 'C1_CORPUS_V1_1_INSUFFICIENT', exclusions }), /duplicate.*family/i)
  assert.throws(() => assertC1V11Independence({ groups: [{ ...base, exact711IndependentCount: 2 }], classification: 'C1_CORPUS_V1_1_INSUFFICIENT', exclusions }), /711/i)
})
