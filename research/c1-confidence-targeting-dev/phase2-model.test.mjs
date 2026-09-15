import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEVELOPMENT_GROUP_IDS,
  MODEL_ARTIFACT_KIND,
  buildFinalDevelopmentModel,
  confidenceModelSha256,
  serializeConfidenceModel,
  validateConfidenceModel,
  writeConfidenceModel,
  v2EvaluationGrid,
} from './phase2-model.mjs'
import { hashJson } from './c1b.mjs'

const GRID = v2EvaluationGrid()
const DEVELOPMENT_IDS = [...DEVELOPMENT_GROUP_IDS]

function profile(values, method = 'fixture') {
  const expanded = values.length === GRID.length ? values : GRID.map((_, index) => values[index % values.length])
  return { method, frequenciesHz: [...GRID], valuesDb: expanded, sha256: hashJson({ frequenciesHz: GRID, valuesDb: expanded }) }
}

function groupEvidence(groupId, index, rigClass, sigmaValues, absoluteDeltaValues) {
  const deltaDb = GRID.map((_, offset) => absoluteDeltaValues[offset % absoluteDeltaValues.length] * (offset % 2 ? -1 : 1))
  const expandedAbsolute = GRID.map((_, offset) => absoluteDeltaValues[offset % absoluteDeltaValues.length])
  return {
    artifactKind: 'c1b-group-confidence-targeting-evidence',
    groupId,
    split: 'development',
    withheldGroupId: groupId,
    loo: {
      withheldGroupId: groupId,
      trainingGroupIds: DEVELOPMENT_IDS.filter((id) => id !== groupId),
      trainingProfileGroupIds: DEVELOPMENT_IDS.filter((id) => id !== groupId),
      withheldGroupUsedOnlyForEvaluation: true,
      leakageCheck: true,
    },
    consensus: profile([index, index, index, index], 'POINTWISE_MEDIAN_711'),
    repeatabilitySigma: { ...profile(sigmaValues, 'REPEATABILITY_SIGMA_711'), scale: 1.4826 },
    observations: [{
      observationId: `${groupId}-observation`,
      groupId,
      rigClass,
      frequenciesHz: [...GRID],
      deltaDb,
      absoluteDeltaDb: expandedAbsolute,
    }],
    flags: {
      developmentExecuted: true,
      holdoutExecuted: false,
      freshRealBatchCExecuted: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      c4PeakAlignmentUsed: false,
    },
  }
}

function fixtureEvidence() {
  const groups = [
    groupEvidence(DEVELOPMENT_IDS[0], 0, 'class-a', [0, 1, 2, 3], [1, 2, 3, 4]),
    groupEvidence(DEVELOPMENT_IDS[1], 1, 'class-a', [2, 3, 4, 5], [3, 4, 5, 6]),
    groupEvidence(DEVELOPMENT_IDS[2], 2, 'class-b', [4, 5, 6, 7], [5, 6, 7, 8]),
    groupEvidence(DEVELOPMENT_IDS[3], 3, 'class-c', [6, 7, 8, 9], [7, 8, 9, 10]),
    groupEvidence(DEVELOPMENT_IDS[4], 4, 'class-c', [8, 9, 10, 11], [9, 10, 11, 12]),
    groupEvidence(DEVELOPMENT_IDS[5], 5, 'class-c', [10, 11, 12, 13], [11, 12, 13, 14]),
  ]
  return {
    aggregate: {
      artifactKind: 'c1b-development-aggregate-evidence',
      developmentGroupIds: DEVELOPMENT_IDS,
      developmentGate: { classification: 'CONFIDENCE_TARGETING_DEV_SUPPORTED' },
    },
    groups,
  }
}

test('buildFinalDevelopmentModel uses all six development evidence groups and freezes class fallback decisions', () => {
  const model = buildFinalDevelopmentModel(fixtureEvidence())

  assert.equal(model.artifactKind, MODEL_ARTIFACT_KIND)
  assert.deepEqual(model.developmentGroupIds, DEVELOPMENT_IDS)
  assert.deepEqual(model.gridFrequenciesHz, GRID)
  assert.deepEqual(model.profiles.repeatability.valuesDb.slice(0, 4), [5, 6, 7, 8])
  assert.deepEqual(model.profiles.globalRig.valuesDb.slice(0, 4), [6, 7, 8, 9])
  assert.deepEqual(Object.keys(model.profiles.rigProfiles), ['class-a', 'class-c'])
  assert.deepEqual(model.rigClassMembershipCounts['class-a'], {
    observationCount: 2,
    distinctDevelopmentGroupCount: 2,
    developmentGroupIds: [DEVELOPMENT_IDS[0], DEVELOPMENT_IDS[1]],
  })
  assert.equal(model.rigClassSelections['class-a'].source, 'CLASS_SPECIFIC')
  assert.equal(model.rigClassSelections['class-b'].source, 'GLOBAL_FALLBACK')
  assert.equal(model.rigClassSelections['class-b'].profileSha256, model.profileHashes.globalRig)
  assert.deepEqual(model.weights.byRigClass['class-b'].w_rig.valuesDb, model.weights.globalFallback.w_rig.valuesDb)
  assert.deepEqual(model.weights.byRigClass['class-b'].w_conf.valuesDb, model.weights.globalFallback.w_conf.valuesDb)
  assert.equal(model.modelSha256, validateConfidenceModel(model).modelSha256)
})

test('confidence model serialization is deterministic and validation detects mutation', () => {
  const model = buildFinalDevelopmentModel(fixtureEvidence())
  const serialized = serializeConfidenceModel(model)
  assert.equal(serialized.endsWith('\n'), true)
  assert.deepEqual(JSON.parse(serialized), JSON.parse(serializeConfidenceModel(JSON.parse(serialized))))
  const parsed = JSON.parse(serialized)
  parsed.profiles.globalRig.valuesDb[1] += 1
  assert.throws(() => validateConfidenceModel(parsed), /model SHA-256 mismatch/)
})

test('writeConfidenceModel refuses to replace an immutable model with different content', async () => {
  const model = buildFinalDevelopmentModel(fixtureEvidence())
  const outputDir = await mkdtemp(join(tmpdir(), 'c1-phase2-model-'))
  const outputPath = join(outputDir, 'confidence-model.json')
  await writeConfidenceModel(model, outputPath)
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), JSON.parse(serializeConfidenceModel(model)))

  const changed = JSON.parse(serializeConfidenceModel(model))
  changed.source.developmentEvidenceSha256 = 'changed-after-freeze'
  changed.modelSha256 = confidenceModelSha256(changed)
  await assert.rejects(writeConfidenceModel(changed, outputPath), /immutable confidence model already exists/)
})

test('final model rejects holdout evidence and response-derived LOO profiles', () => {
  const fixture = fixtureEvidence()
  fixture.groups[0].split = 'holdout'
  assert.throws(() => buildFinalDevelopmentModel(fixture), /development evidence only/)

  const clean = fixtureEvidence()
  clean.groups[0].loo.trainingProfileGroupIds.push(DEVELOPMENT_IDS[0])
  assert.throws(() => buildFinalDevelopmentModel(clean), /withheld group entered training profiles/)
})
