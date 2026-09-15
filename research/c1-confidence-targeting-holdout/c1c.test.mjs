import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  C1C_ALGORITHM_VERSION,
  C1C_BATCH_C_REJECTION_TOKEN,
  C1C_CONFIDENCE_MODEL_SHA256,
  C1C_DEVELOPMENT_GROUP_IDS,
  C1C_HOLDOUT_GROUP_IDS,
  C1C_PRIMARY_BAND_HZ,
  C1C_TARGETING_THRESHOLD,
  CONFIDENCE_TARGETING_GENERALIZES,
  CONFIDENCE_TARGETING_NOT_CONFIRMED,
  INCONCLUSIVE,
  createHoldoutOutcomeSchema,
  createHoldoutProtocolManifest,
  hashJson,
  stableJson,
  validateHoldoutExecutionRequest,
  validateHoldoutProtocolManifest,
} from './c1c.mjs'

test('C1c protocol pins the repaired split and immutable development model without outcome state', () => {
  const manifest = createHoldoutProtocolManifest()

  assert.equal(manifest.algorithmVersion, C1C_ALGORITHM_VERSION)
  assert.equal(manifest.c1aV11.commit, '28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a')
  assert.equal(manifest.c1aV11.evidenceSha256, 'a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43')
  assert.equal(manifest.c1b.protocolFreezeCommit, '6e8dba547bc9f12a072e0660ce35c89a3d502455')
  assert.equal(manifest.c1b.evidenceCommit, '458f95642b6a0880311d48afdfc54409c1e8b34a')
  assert.equal(manifest.c1b.evidenceSha256, 'a962156d1203a243740c909e464399e0fd84d4fc92ffeaa23fa514d8129b4004')
  assert.equal(manifest.confidenceModel.sha256, C1C_CONFIDENCE_MODEL_SHA256)
  assert.deepEqual(manifest.holdoutGroupIds, C1C_HOLDOUT_GROUP_IDS)
  assert.deepEqual(manifest.rejectedDevelopmentGroupIds, C1C_DEVELOPMENT_GROUP_IDS)
  assert.deepEqual(manifest.primaryBandHz, C1C_PRIMARY_BAND_HZ)
  assert.equal(manifest.rejectedBatchCToken, C1C_BATCH_C_REJECTION_TOKEN)
  assert.equal(manifest.developmentDecisionInputAccepted, false)
  assert.equal(manifest.freshRealBatchCRejected, true)
  assert.equal(manifest.holdoutExecuted, false)
  assert.equal(manifest.outcomesGenerated, false)
  assert.equal(manifest.responseOutcomeObserved, false)
  assert.equal(manifest.retrainingAllowed, false)
  assert.doesNotThrow(() => validateHoldoutProtocolManifest(manifest))
  assert.equal(typeof hashJson(manifest), 'string')
  assert.equal(stableJson(manifest), stableJson(JSON.parse(stableJson(manifest))))
})

test('holdout admission accepts only exact untouched IDs and the frozen model', () => {
  assert.equal(validateHoldoutExecutionRequest({
    holdoutGroupIds: C1C_HOLDOUT_GROUP_IDS,
    confidenceModelSha256: C1C_CONFIDENCE_MODEL_SHA256,
  }), true)

  assert.throws(() => validateHoldoutExecutionRequest({
    holdoutGroupIds: C1C_HOLDOUT_GROUP_IDS,
    confidenceModelSha256: '0'.repeat(64),
  }), /confidence model SHA-256/i)
  assert.throws(() => validateHoldoutExecutionRequest({
    holdoutGroupIds: [...C1C_HOLDOUT_GROUP_IDS.slice(0, -1), C1C_DEVELOPMENT_GROUP_IDS[0]],
    confidenceModelSha256: C1C_CONFIDENCE_MODEL_SHA256,
  }), /holdout group IDs/i)
  assert.throws(() => validateHoldoutExecutionRequest({
    holdoutGroupIds: C1C_HOLDOUT_GROUP_IDS,
    confidenceModelSha256: C1C_CONFIDENCE_MODEL_SHA256,
    developmentGroupIds: C1C_DEVELOPMENT_GROUP_IDS,
  }), /development/i)
  assert.throws(() => validateHoldoutExecutionRequest({
    holdoutGroupIds: C1C_HOLDOUT_GROUP_IDS,
    confidenceModelSha256: C1C_CONFIDENCE_MODEL_SHA256,
    developmentClassification: 'CONFIDENCE_TARGETING_DEV_SUPPORTED',
  }), /development/i)
  assert.throws(() => validateHoldoutExecutionRequest({
    holdoutGroupIds: C1C_HOLDOUT_GROUP_IDS,
    confidenceModelSha256: C1C_CONFIDENCE_MODEL_SHA256,
    batchCToken: C1C_BATCH_C_REJECTION_TOKEN,
  }), /Batch C/i)
})

test('C1c schema freezes the same targeting gates and semantic defect stop policy', () => {
  const schema = createHoldoutOutcomeSchema()

  assert.equal(schema.outcomeValuesAllowed, false)
  assert.equal(schema.responseDerivedValuesAllowed, false)
  assert.equal(schema.holdoutGate.minimumSignalGroups, 4)
  assert.equal(schema.holdoutGate.totalGroups, 6)
  assert.deepEqual(schema.holdoutGate.allowed, [CONFIDENCE_TARGETING_GENERALIZES, CONFIDENCE_TARGETING_NOT_CONFIRMED, INCONCLUSIVE])
  assert.equal(schema.evaluation.primaryBandHz.join(','), '4000,14000')
  assert.equal(schema.evaluation.targetingThreshold, C1C_TARGETING_THRESHOLD)
  assert.equal(schema.evaluation.equalAuthorityControl, 'w_const(f) = mean_primary(w_conf(f))')
  assert.equal(schema.evaluation.informativeRule, 'E_const == 0')
  assert.equal(schema.groupGate.signal, 'strict majority of informative observations AND median gain >= 0.05')
  assert.equal(schema.defectPolicy.semanticHoldoutDefect, INCONCLUSIVE)
  assert.equal(schema.defectPolicy.semanticHoldoutDefectRerunAllowed, false)
  assert.equal(schema.defectPolicy.outcomeNeutralPackagingCorrectionAllowed, true)
  assert.equal(schema.flags.holdoutExecuted, false)
  assert.equal(schema.flags.responseOutcomeObserved, false)
  assert.equal(schema.flags.freshRealBatchCExecuted, false)
  assert.equal(schema.flags.retrainingAfterFreeze, false)
})

test('manifest validation fails closed on execution or scientific-boundary mutations', () => {
  const manifest = createHoldoutProtocolManifest()
  for (const field of ['holdoutExecuted', 'outcomesGenerated', 'responseOutcomeObserved', 'confidenceWeightingApplied', 'consensusAlgorithmExecuted', 'freshRealBatchCExecuted']) {
    assert.throws(() => validateHoldoutProtocolManifest({ ...manifest, [field]: true }), new RegExp(field))
  }
  assert.throws(() => validateHoldoutProtocolManifest({
    ...manifest,
    confidenceModel: { ...manifest.confidenceModel, sha256: '0'.repeat(64) },
  }), /confidence model/i)
  assert.throws(() => validateHoldoutProtocolManifest({
    ...manifest,
    evaluation: { ...manifest.evaluation, primaryBandHz: [2000, 14000] },
  }), /primary band/i)
  assert.throws(() => validateHoldoutProtocolManifest({
    ...manifest,
    holdoutGroups: manifest.holdoutGroups.slice(1),
  }), /holdout group metadata/i)
  assert.throws(() => validateHoldoutProtocolManifest({
    ...manifest,
    upstream: { ...manifest.upstream, commit: '0'.repeat(40) },
  }), /upstream/i)
  assert.throws(() => validateHoldoutProtocolManifest({
    ...manifest,
    dataPreparation: { ...manifest.dataPreparation, peakAlignment: true },
  }), /peak alignment/i)
})

test('checked-in C1c bundle is the pre-outcome manifest/schema pair', () => {
  const manifestText = readFileSync(new URL('../../.research-artifacts/c1-confidence-targeting-holdout/manifest.json', import.meta.url), 'utf8')
  const schemaText = readFileSync(new URL('../../.research-artifacts/c1-confidence-targeting-holdout/schema.json', import.meta.url), 'utf8')
  const manifest = JSON.parse(manifestText)
  const schema = JSON.parse(schemaText)
  assert.doesNotThrow(() => validateHoldoutProtocolManifest(manifest))
  assert.deepEqual(schema, createHoldoutOutcomeSchema())
  assert.equal(readFileSync(new URL('../../.research-artifacts/c1-confidence-targeting-holdout/protocol-sha256.txt', import.meta.url), 'utf8').trim(), createHash('sha256').update(manifestText + schemaText).digest('hex'))
  assert.equal(schema.outcomeValuesAllowed, false)
  assert.equal(schema.responseDerivedValuesAllowed, false)
})
