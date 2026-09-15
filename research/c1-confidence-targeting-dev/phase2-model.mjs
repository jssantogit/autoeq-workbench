import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C1B_ALGORITHM_VERSION,
  C1B_ARTIFACT_RELATIVE_DIR,
  C1B_FORM,
  C1B_MIN_CLASS_GROUPS,
  C1B_NORMALIZATION,
  C1B_PRIMARY_BAND_HZ,
  C1B_REQUIRED_DEVELOPMENT_GROUPS,
  C1B_TARGET_SCALE_DB,
  C1B_V2_MAX_HZ,
  C1B_V2_MIN_HZ,
  C1B_V2_POINTS_PER_OCTAVE,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUP_IDS,
  buildConfidenceWeights,
  hashJson,
  medianValue,
  v2EvaluationGrid,
} from './c1b.mjs'

export const MODEL_SCHEMA_VERSION = 1
export const MODEL_ARTIFACT_KIND = 'c1b-confidence-targeting-final-development-model'
export const MODEL_PHASE = 'final-development-trained-confidence-model'
export const MODEL_FILENAME = 'confidence-model.json'

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_ARTIFACT_DIR = resolve(MODULE_ROOT, C1B_ARTIFACT_RELATIVE_DIR)
const EXPECTED_GRID = v2EvaluationGrid()

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertFinite(value, label) {
  assert(Number.isFinite(value), `${label} must be finite`)
}

function assertString(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`)
}

function assertExactArray(actual, expected, label) {
  assert(Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`)
}

function assertGrid(frequenciesHz, label = 'frequency grid') {
  assertExactArray(frequenciesHz, EXPECTED_GRID, `${label} must equal frozen V2 grid`)
}

function assertValues(valuesDb, label, { weights = false, nonnegative = !weights } = {}) {
  assert(Array.isArray(valuesDb) && valuesDb.length === EXPECTED_GRID.length, `${label} length mismatch`)
  valuesDb.forEach((value, index) => {
    assertFinite(value, `${label}[${index}]`)
    if (weights) assert(value > 0 && value <= 1, `${label}[${index}] must satisfy 0 < w <= 1`)
    else if (nonnegative) assert(value >= 0, `${label}[${index}] must be nonnegative`)
  })
}

function hashProfile(profile) {
  return hashJson({ frequenciesHz: profile.frequenciesHz, valuesDb: profile.valuesDb })
}

function hashObservation(observation) {
  return hashJson({
    frequenciesHz: observation.frequenciesHz,
    deltaDb: observation.deltaDb,
    absoluteDeltaDb: observation.absoluteDeltaDb,
  })
}

function profile(valuesDb, metadata = {}) {
  assertValues(valuesDb, metadata.label ?? 'profile')
  const result = {
    ...metadata,
    frequenciesHz: [...EXPECTED_GRID],
    valuesDb: [...valuesDb],
  }
  delete result.label
  result.profileSha256 = hashProfile(result)
  return result
}

function weightProfile(valuesDb, candidate) {
  assertValues(valuesDb, `${candidate} weights`, { weights: true })
  const result = {
    candidate,
    frequenciesHz: [...EXPECTED_GRID],
    valuesDb: [...valuesDb],
  }
  result.profileSha256 = hashProfile(result)
  return result
}

function modelPayload(model) {
  const { modelSha256: _modelSha256, ...payload } = model
  return payload
}

export function confidenceModelSha256(model) {
  return hashJson(modelPayload(model))
}

function assertProfile(profileValue, label, { weights = false, nonnegative = !weights } = {}) {
  assert(profileValue && typeof profileValue === 'object', `${label} is required`)
  assertGrid(profileValue.frequenciesHz, `${label} frequency grid`)
  assertValues(profileValue.valuesDb, `${label} values`, { weights, nonnegative })
  if (profileValue.profileSha256 !== undefined) {
    assert(profileValue.profileSha256 === hashProfile(profileValue), `${label} profile SHA-256 mismatch`)
  }
}

function validateEvidenceProfile(profileValue, label, { requireHash = false, nonnegative = true } = {}) {
  assertProfile(profileValue, label, { nonnegative })
  if (requireHash) assertString(profileValue.sha256, `${label} SHA-256`)
  if (profileValue.sha256 !== undefined) {
    assert(profileValue.sha256 === hashProfile(profileValue), `${label} evidence SHA-256 mismatch`)
  }
}

function assertNoHoldoutOrBatchCString(value, label) {
  const text = String(value)
  assert(!HOLDOUT_GROUP_IDS.includes(text), `${label} contains holdout group ${text}`)
  assert(!/batch\s*c|batch-c|fresh[-_ ]real[-_ ]corpus/i.test(text), `${label} contains sealed Fresh Real Batch C`)
}

function validateEvidenceInputs({ aggregate, groups }) {
  assert(aggregate && typeof aggregate === 'object', 'development aggregate evidence is required')
  assert(aggregate.artifactKind === 'c1b-development-aggregate-evidence', 'wrong development aggregate artifact')
  assertExactArray(aggregate.developmentGroupIds, DEVELOPMENT_GROUP_IDS, 'development group IDs')
  assert(aggregate.developmentGate?.classification === 'CONFIDENCE_TARGETING_DEV_SUPPORTED', 'final model requires supported development gate')
  assert(Array.isArray(groups) && groups.length === C1B_REQUIRED_DEVELOPMENT_GROUPS, 'exactly six development evidence groups are required')
  const byId = new Map()
  for (const group of groups) {
    assert(group && typeof group === 'object', 'group evidence must be an object')
    assertString(group.groupId, 'group evidence ID')
    assertNoHoldoutOrBatchCString(group.groupId, 'group evidence ID')
    assert(DEVELOPMENT_GROUP_IDS.includes(group.groupId), `non-development group evidence is not allowed: ${group.groupId}`)
    assert(!byId.has(group.groupId), `duplicate development group evidence: ${group.groupId}`)
    byId.set(group.groupId, group)
    assert(group.artifactKind === 'c1b-group-confidence-targeting-evidence', `wrong group evidence artifact: ${group.groupId}`)
    assert(group.split === 'development', `final model accepts development evidence only: ${group.groupId}`)
    assert(group.withheldGroupId === group.groupId, `group ${group.groupId} is not self-withheld evidence`)
    assert(group.loo?.withheldGroupId === group.groupId, `group ${group.groupId} LOO withheld ID mismatch`)
    assert(!group.loo?.trainingGroupIds?.includes(group.groupId), `withheld group entered training profiles: ${group.groupId}`)
    assert(!group.loo?.trainingProfileGroupIds?.includes(group.groupId), `withheld group entered training profiles: ${group.groupId}`)
    assertExactArray(group.loo?.trainingGroupIds, DEVELOPMENT_GROUP_IDS.filter((id) => id !== group.groupId), `group ${group.groupId} LOO training IDs`)
    assertExactArray(group.loo?.trainingProfileGroupIds, DEVELOPMENT_GROUP_IDS.filter((id) => id !== group.groupId), `group ${group.groupId} LOO profile IDs`)
    assert(group.loo?.withheldGroupUsedOnlyForEvaluation === true, `group ${group.groupId} withheld-use guard missing`)
    assert(group.loo?.leakageCheck === true, `group ${group.groupId} LOO leakage guard missing`)
    assert(group.flags?.developmentExecuted === true, `group ${group.groupId} was not executed as development evidence`)
    assert(group.flags?.holdoutExecuted === false, `group ${group.groupId} holdout flag is not false`)
    assert(group.flags?.freshRealBatchCExecuted === false, `group ${group.groupId} Batch C flag is not false`)
    assert(group.flags?.autoEqSolverExecuted === false && group.flags?.solverExecuted === false, `group ${group.groupId} solver flag is not false`)
    assert(group.flags?.c4PeakAlignmentUsed === false, `group ${group.groupId} used forbidden C4 alignment`)

    validateEvidenceProfile(group.consensus, `group ${group.groupId} consensus`, { requireHash: true, nonnegative: false })
    validateEvidenceProfile(group.repeatabilitySigma, `group ${group.groupId} repeatability sigma`, { requireHash: true })
    assert(group.consensus.method === 'POINTWISE_MEDIAN_711', `group ${group.groupId} consensus method mismatch`)
    assert(group.repeatabilitySigma.method === 'REPEATABILITY_SIGMA_711', `group ${group.groupId} sigma method mismatch`)
    assert(group.repeatabilitySigma.scale === 1.4826, `group ${group.groupId} sigma scale mismatch`)
    assertExactArray(group.consensus.frequenciesHz, group.repeatabilitySigma.frequenciesHz, `group ${group.groupId} consensus/sigma grid`)
    assert(Array.isArray(group.observations) && group.observations.length > 0, `group ${group.groupId} has no non-711 observations`)
    for (const observation of group.observations) {
      assertString(observation.observationId, `group ${group.groupId} observation ID`)
      assertString(observation.rigClass, `group ${group.groupId} observation rig class`)
      assertGrid(observation.frequenciesHz, `group ${group.groupId} observation grid`)
      assertValues(observation.absoluteDeltaDb, `group ${group.groupId} observation absolute disagreement`)
      assert(Array.isArray(observation.deltaDb) && observation.deltaDb.length === EXPECTED_GRID.length, `group ${group.groupId} observation delta length mismatch`)
      observation.deltaDb.forEach((value, index) => assertFinite(value, `group ${group.groupId} observation delta[${index}]`))
      observation.absoluteDeltaDb.forEach((value, index) => assert(value === Math.abs(observation.deltaDb[index]), `group ${group.groupId} observation absolute disagreement mismatch`))
      if (observation.observationSha256 !== undefined) assert(observation.observationSha256 === hashObservation(observation), `group ${group.groupId} observation SHA-256 mismatch`)
    }
  }
  assert([...byId.keys()].sort().join('|') === [...DEVELOPMENT_GROUP_IDS].sort().join('|'), 'development evidence group set mismatch')
  return DEVELOPMENT_GROUP_IDS.map((groupId) => byId.get(groupId))
}

function classMembership(groups) {
  const memberships = new Map()
  for (const group of groups) {
    for (const observation of group.observations) {
      const entry = memberships.get(observation.rigClass) ?? { observationCount: 0, developmentGroupIds: [] }
      entry.observationCount += 1
      if (!entry.developmentGroupIds.includes(group.groupId)) entry.developmentGroupIds.push(group.groupId)
      memberships.set(observation.rigClass, entry)
    }
  }
  return Object.fromEntries([...memberships.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([rigClass, entry]) => [
    rigClass,
    {
      observationCount: entry.observationCount,
      distinctDevelopmentGroupCount: entry.developmentGroupIds.length,
      developmentGroupIds: [...entry.developmentGroupIds],
    },
  ]))
}

function medianProfileValues(curves) {
  return EXPECTED_GRID.map((_, index) => medianValue(curves.map((curve) => curve[index])))
}

function compactWeightSet(weights, selection) {
  const repeatability = weightProfile(weights.wRepeatability, 'w_repeatability')
  const rig = weightProfile(weights.wRig, 'w_rig')
  const confidence = weightProfile(weights.wConfidence, 'w_conf')
  return {
    algorithmVersion: weights.algorithmVersion,
    scaleDb: weights.scaleDb,
    rigClass: selection.rigClass,
    source: selection.source,
    fallback: selection.fallback,
    distinctDevelopmentGroupCount: selection.distinctDevelopmentGroupCount,
    developmentGroupIds: [...selection.developmentGroupIds],
    observationCount: selection.observationCount,
    frequenciesHz: [...EXPECTED_GRID],
    w_repeatability: repeatability,
    w_rig: rig,
    w_conf: confidence,
    weightHashes: {
      w_repeatability: repeatability.profileSha256,
      w_rig: rig.profileSha256,
      w_conf: confidence.profileSha256,
    },
  }
}

function buildSelection(rigClass, membership, classProfile, globalProfileHash) {
  const hasClassProfile = classProfile !== undefined
  const info = membership[rigClass]
  return {
    rigClass,
    source: hasClassProfile ? 'CLASS_SPECIFIC' : 'GLOBAL_FALLBACK',
    fallback: !hasClassProfile,
    reason: hasClassProfile ? 'CLASS_HAS_AT_LEAST_TWO_DEVELOPMENT_GROUPS' : 'CLASS_HAS_FEWER_THAN_TWO_DEVELOPMENT_GROUPS',
    distinctDevelopmentGroupCount: info.distinctDevelopmentGroupCount,
    developmentGroupIds: [...info.developmentGroupIds],
    observationCount: info.observationCount,
    profileSha256: hasClassProfile ? classProfile.profileSha256 : globalProfileHash,
    globalProfileSha256: globalProfileHash,
  }
}

/**
 * Build the immutable final model from compact C1b development evidence.
 *
 * This deliberately consumes only each withheld group's own consensus, raw
 * repeatability sigma, and cross-rig observations. The LOO training profiles
 * embedded in group evidence are never used to train this final model.
 */
export function buildFinalDevelopmentModel({ aggregate, groups }) {
  const orderedGroups = validateEvidenceInputs({ aggregate, groups })
  const repeatabilityValues = medianProfileValues(orderedGroups.map((group) => group.repeatabilitySigma.valuesDb))
  const observations = orderedGroups.flatMap((group) => group.observations.map((observation) => ({
    ...observation,
    groupId: group.groupId,
  })))
  const globalValues = medianProfileValues(observations.map((observation) => observation.absoluteDeltaDb))
  const memberships = classMembership(orderedGroups)
  const observationsByClass = new Map()
  for (const observation of observations) {
    const values = observationsByClass.get(observation.rigClass) ?? []
    values.push(observation)
    observationsByClass.set(observation.rigClass, values)
  }

  const repeatability = profile(repeatabilityValues, {
    method: 'TRAINING_MEDIAN_REPEATABILITY_SIGMA',
    uncertaintyComponent: 'repeatability',
    trainingGroupCount: orderedGroups.length,
  })
  const globalRig = profile(globalValues, {
    method: 'TRAINING_GLOBAL_MEDIAN_ABSOLUTE_CROSS_RIG_DISAGREEMENT',
    uncertaintyComponent: 'cross-rig',
    trainingGroupCount: orderedGroups.length,
  })

  const rigProfiles = {}
  for (const rigClass of Object.keys(memberships).sort((left, right) => left.localeCompare(right))) {
    const info = memberships[rigClass]
    if (info.distinctDevelopmentGroupCount < C1B_MIN_CLASS_GROUPS) continue
    const classValues = medianProfileValues(observationsByClass.get(rigClass).map((observation) => observation.absoluteDeltaDb))
    rigProfiles[rigClass] = profile(classValues, {
      method: 'TRAINING_CLASS_MEDIAN_ABSOLUTE_CROSS_RIG_DISAGREEMENT',
      uncertaintyComponent: 'cross-rig',
      rigClass,
      trainingGroupCount: info.distinctDevelopmentGroupCount,
      observationCount: info.observationCount,
      developmentGroupIds: [...info.developmentGroupIds],
    })
  }

  const profileSet = {
    repeatability,
    globalRig,
    rigProfiles: Object.fromEntries(Object.entries(rigProfiles).map(([rigClass, classProfile]) => [rigClass, {
      rigClass,
      source: 'CLASS_SPECIFIC',
      fallback: false,
      distinctTrainingGroupCount: memberships[rigClass].distinctDevelopmentGroupCount,
      trainingGroupIds: [...memberships[rigClass].developmentGroupIds],
      observationCount: memberships[rigClass].observationCount,
      profile: classProfile,
      profileSha256: classProfile.profileSha256,
    }])),
  }
  const selections = {}
  const byRigClass = {}
  for (const rigClass of Object.keys(memberships).sort((left, right) => left.localeCompare(right))) {
    const selection = buildSelection(rigClass, memberships, rigProfiles[rigClass], globalRig.profileSha256)
    selections[rigClass] = selection
    byRigClass[rigClass] = compactWeightSet(buildConfidenceWeights(profileSet, rigClass), selection)
  }
  const fallbackSelection = {
    rigClass: null,
    source: 'GLOBAL_FALLBACK',
    fallback: true,
    reason: 'CLASS_NOT_PRESENT_IN_DEVELOPMENT_GROUPS',
    distinctDevelopmentGroupCount: 0,
    developmentGroupIds: [],
    observationCount: 0,
    profileSha256: globalRig.profileSha256,
    globalProfileSha256: globalRig.profileSha256,
  }
  // The frozen helper treats an omitted rigClass as the boolean false from
  // its class lookup expression; pass null explicitly to select its global
  // fallback branch.
  const globalFallback = compactWeightSet(buildConfidenceWeights(profileSet, null), fallbackSelection)

  const model = {
    schemaVersion: MODEL_SCHEMA_VERSION,
    artifactKind: MODEL_ARTIFACT_KIND,
    algorithmVersion: C1B_ALGORITHM_VERSION,
    phase: MODEL_PHASE,
    modelHashDefinition: {
      algorithm: 'SHA-256',
      canonicalization: 'stableJson key-sorted object with modelSha256 omitted',
      field: 'modelSha256',
    },
    source: {
      developmentEvidenceArtifactKind: aggregate.artifactKind,
      developmentEvidenceSha256: aggregate.evidenceSha256 ?? null,
      protocolFreezeCommit: aggregate.protocolFreezeCommit,
      protocolSha256: aggregate.protocolSha256,
      c1aV11: aggregate.c1aV11 ?? null,
      groupEvidenceFiles: [...(aggregate.groupEvidenceFiles ?? [])],
    },
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    rejectedHoldoutGroupIds: [...HOLDOUT_GROUP_IDS],
    rejectedBatchCToken: 'fresh-real-corpus-v1.2:Batch C',
    holdoutUsed: false,
    freshRealBatchCUsed: false,
    autoEqSolverExecuted: false,
    c4PeakAlignmentUsed: false,
    dataPreparation: {
      form: C1B_FORM,
      v2MinHz: C1B_V2_MIN_HZ,
      v2MaxHz: C1B_V2_MAX_HZ,
      pointsPerOctave: C1B_V2_POINTS_PER_OCTAVE,
      grid: [...EXPECTED_GRID],
      normalization: { ...C1B_NORMALIZATION },
      terminalClosure: 'terminal-flat-hold-to-v2-max',
      smoothing: false,
      peakAlignment: false,
    },
    gridFrequenciesHz: [...EXPECTED_GRID],
    primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
    baseWeight: 1,
    transform: {
      name: 'c',
      formula: 'c(u) = 0.75 / (0.75 + u)',
      scaleDb: C1B_TARGET_SCALE_DB,
    },
    classMinimumDistinctDevelopmentGroups: C1B_MIN_CLASS_GROUPS,
    rigClassMembershipCounts: memberships,
    rigClassSelections: selections,
    profiles: {
      repeatability,
      globalRig,
      rigProfiles,
    },
    profileHashes: {
      repeatability: repeatability.profileSha256,
      globalRig: globalRig.profileSha256,
      rigProfiles: Object.fromEntries(Object.entries(rigProfiles).map(([rigClass, classProfile]) => [rigClass, classProfile.profileSha256])),
    },
    weights: {
      globalFallback,
      byRigClass,
    },
    outcome: {
      developmentClassification: aggregate.developmentGate.classification,
      trainingGroupCount: orderedGroups.length,
      noHoldoutResponseData: true,
      noFreshRealBatchCResponseData: true,
    },
  }
  model.modelSha256 = confidenceModelSha256(model)
  validateConfidenceModel(model)
  return model
}

/** Validate model constants, profile/weight hashes, and write-once identity. */
export function validateConfidenceModel(model) {
  assert(model && typeof model === 'object', 'confidence model is required')
  assertString(model.modelSha256, 'model SHA-256')
  assert(model.modelSha256 === confidenceModelSha256(model), 'model SHA-256 mismatch')
  assert(model.schemaVersion === MODEL_SCHEMA_VERSION, 'model schema version mismatch')
  assert(model.artifactKind === MODEL_ARTIFACT_KIND, 'model artifact kind mismatch')
  assert(model.algorithmVersion === C1B_ALGORITHM_VERSION, 'model algorithm version mismatch')
  assert(model.phase === MODEL_PHASE, 'model phase mismatch')
  assert(model.modelHashDefinition?.algorithm === 'SHA-256' && model.modelHashDefinition?.field === 'modelSha256', 'model hash definition mismatch')
  assertExactArray(model.developmentGroupIds, DEVELOPMENT_GROUP_IDS, 'model development IDs')
  assertExactArray(model.rejectedHoldoutGroupIds, HOLDOUT_GROUP_IDS, 'model holdout IDs')
  assert(model.holdoutUsed === false && model.freshRealBatchCUsed === false, 'model contains forbidden holdout or Batch C data')
  assert(model.autoEqSolverExecuted === false && model.c4PeakAlignmentUsed === false, 'model contains forbidden solver/alignment state')
  assertExactArray(model.gridFrequenciesHz, EXPECTED_GRID, 'model grid')
  assertExactArray(model.dataPreparation?.grid, EXPECTED_GRID, 'model preparation grid')
  assert(model.dataPreparation?.form === C1B_FORM, 'model form mismatch')
  assert(model.dataPreparation?.v2MinHz === C1B_V2_MIN_HZ && model.dataPreparation?.v2MaxHz === C1B_V2_MAX_HZ, 'model V2 coverage mismatch')
  assert(model.dataPreparation?.pointsPerOctave === C1B_V2_POINTS_PER_OCTAVE, 'model V2 density mismatch')
  assert(model.dataPreparation?.normalization?.mode === C1B_NORMALIZATION.mode && model.dataPreparation?.normalization?.frequencyHz === C1B_NORMALIZATION.frequencyHz, 'model normalization mismatch')
  assert(model.dataPreparation?.smoothing === false && model.dataPreparation?.peakAlignment === false, 'model preparation transform mismatch')
  assertExactArray(model.primaryBandHz, C1B_PRIMARY_BAND_HZ, 'model primary band')
  assert(model.baseWeight === 1, 'model base weight mismatch')
  assert(model.transform?.scaleDb === C1B_TARGET_SCALE_DB && model.transform?.formula === 'c(u) = 0.75 / (0.75 + u)', 'model transform mismatch')
  assert(model.classMinimumDistinctDevelopmentGroups === C1B_MIN_CLASS_GROUPS, 'model class minimum mismatch')
  assert(model.outcome?.developmentClassification === 'CONFIDENCE_TARGETING_DEV_SUPPORTED', 'model development gate mismatch')

  assertProfile(model.profiles?.repeatability, 'model repeatability profile')
  assertProfile(model.profiles?.globalRig, 'model global rig profile')
  assert(model.profileHashes?.repeatability === model.profiles.repeatability.profileSha256, 'repeatability profile hash record mismatch')
  assert(model.profileHashes?.globalRig === model.profiles.globalRig.profileSha256, 'global rig profile hash record mismatch')
  const classProfiles = model.profiles.rigProfiles ?? {}
  for (const [rigClass, classProfile] of Object.entries(classProfiles)) {
    assertProfile(classProfile, `model class profile ${rigClass}`)
    assert(model.profileHashes?.rigProfiles?.[rigClass] === classProfile.profileSha256, `class profile hash record mismatch: ${rigClass}`)
    assert(model.rigClassMembershipCounts?.[rigClass]?.distinctDevelopmentGroupCount >= C1B_MIN_CLASS_GROUPS, `class profile has insufficient groups: ${rigClass}`)
  }
  const memberships = model.rigClassMembershipCounts ?? {}
  const selections = model.rigClassSelections ?? {}
  const classNames = Object.keys(memberships).sort((left, right) => left.localeCompare(right))
  assert(JSON.stringify(Object.keys(selections).sort((left, right) => left.localeCompare(right))) === JSON.stringify(classNames), 'rig class selection set mismatch')
  for (const rigClass of classNames) {
    const info = memberships[rigClass]
    assert(Number.isInteger(info.observationCount) && info.observationCount > 0, `invalid membership count: ${rigClass}`)
    assert(Number.isInteger(info.distinctDevelopmentGroupCount) && info.distinctDevelopmentGroupCount > 0, `invalid membership group count: ${rigClass}`)
    assert(Array.isArray(info.developmentGroupIds) && info.developmentGroupIds.length === info.distinctDevelopmentGroupCount, `membership IDs missing: ${rigClass}`)
    assert(info.developmentGroupIds.every((groupId) => DEVELOPMENT_GROUP_IDS.includes(groupId)), `membership IDs outside development set: ${rigClass}`)
    assert(new Set(info.developmentGroupIds).size === info.developmentGroupIds.length, `duplicate membership IDs: ${rigClass}`)
    const selection = selections[rigClass]
    const classProfile = classProfiles[rigClass]
    const expectedSource = classProfile ? 'CLASS_SPECIFIC' : 'GLOBAL_FALLBACK'
    assert(selection.source === expectedSource && selection.fallback === !classProfile, `selection source mismatch: ${rigClass}`)
    assert(selection.distinctDevelopmentGroupCount === info.distinctDevelopmentGroupCount, `selection count mismatch: ${rigClass}`)
    assertExactArray(selection.developmentGroupIds, info.developmentGroupIds, `selection IDs: ${rigClass}`)
    assert(selection.observationCount === info.observationCount, `selection observations mismatch: ${rigClass}`)
    assert(selection.profileSha256 === (classProfile?.profileSha256 ?? model.profiles.globalRig.profileSha256), `selection profile hash mismatch: ${rigClass}`)
    assert(selection.globalProfileSha256 === model.profiles.globalRig.profileSha256, `selection global profile hash mismatch: ${rigClass}`)
  }
  const fallback = model.weights?.globalFallback
  const globalRigValues = model.profiles.globalRig.valuesDb
  assert(fallback?.source === 'GLOBAL_FALLBACK' && fallback.fallback === true, 'global fallback weight decision missing')
  assertProfile(fallback.w_rig, 'global fallback rig weights', { weights: true })
  assertProfile(fallback.w_repeatability, 'global fallback repeatability weights', { weights: true })
  assertProfile(fallback.w_conf, 'global fallback confidence weights', { weights: true })
  assert(fallback.w_rig.valuesDb.every((value, index) => value === C1B_TARGET_SCALE_DB / (C1B_TARGET_SCALE_DB + globalRigValues[index])), 'global fallback rig weights do not match transform')
  assert(fallback.w_repeatability.valuesDb.every((value, index) => value === C1B_TARGET_SCALE_DB / (C1B_TARGET_SCALE_DB + model.profiles.repeatability.valuesDb[index])), 'repeatability weights do not match transform')
  assert(fallback.w_conf.valuesDb.every((value, index) => value === fallback.w_repeatability.valuesDb[index] * fallback.w_rig.valuesDb[index]), 'global fallback product weights do not match transform')
  assert(fallback.w_repeatability.profileSha256 === hashProfile(fallback.w_repeatability), 'global fallback repeatability hash mismatch')
  assert(fallback.w_rig.profileSha256 === hashProfile(fallback.w_rig), 'global fallback rig hash mismatch')
  assert(fallback.w_conf.profileSha256 === hashProfile(fallback.w_conf), 'global fallback confidence hash mismatch')
  for (const rigClass of classNames) {
    const weightSet = model.weights.byRigClass?.[rigClass]
    assert(weightSet, `weight set missing: ${rigClass}`)
    const selection = selections[rigClass]
    const rigValues = classProfiles[rigClass]?.valuesDb ?? globalRigValues
    assert(weightSet.source === selection.source && weightSet.fallback === selection.fallback, `weight source mismatch: ${rigClass}`)
    assert(weightSet.w_rig.valuesDb.every((value, index) => value === C1B_TARGET_SCALE_DB / (C1B_TARGET_SCALE_DB + rigValues[index])), `rig weights do not match transform: ${rigClass}`)
    assert(weightSet.w_repeatability.valuesDb.every((value, index) => value === fallback.w_repeatability.valuesDb[index]), `repeatability weights differ: ${rigClass}`)
    assert(weightSet.w_conf.valuesDb.every((value, index) => value === weightSet.w_repeatability.valuesDb[index] * weightSet.w_rig.valuesDb[index]), `product weights do not match transform: ${rigClass}`)
  }
  return { modelSha256: model.modelSha256, valid: true }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((left, right) => left.localeCompare(right)).map((key) => [key, canonicalize(value[key])]))
}

export function serializeConfidenceModel(model) {
  validateConfidenceModel(model)
  return jsonText(canonicalize(model))
}

/** Write once; a pre-existing model may only be re-emitted byte-for-byte. */
export async function writeConfidenceModel(model, outputPath = resolve(DEFAULT_ARTIFACT_DIR, MODEL_FILENAME)) {
  const serialized = serializeConfidenceModel(model)
  await mkdir(dirname(outputPath), { recursive: true })
  try {
    const existing = await readFile(outputPath, 'utf8')
    if (existing !== serialized) throw new Error(`immutable confidence model already exists at ${outputPath}`)
    return { outputPath, modelSha256: model.modelSha256, written: false }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx' })
  return { outputPath, modelSha256: model.modelSha256, written: true }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function loadDevelopmentEvidence({ artifactDir = DEFAULT_ARTIFACT_DIR } = {}) {
  const aggregate = await readJson(resolve(artifactDir, 'aggregate-evidence.json'))
  assertExactArray(aggregate.developmentGroupIds, DEVELOPMENT_GROUP_IDS, 'development aggregate IDs')
  const files = aggregate.groupEvidenceFiles
  assert(Array.isArray(files) && files.length === DEVELOPMENT_GROUP_IDS.length, 'development aggregate group file list mismatch')
  const expectedFiles = new Set(DEVELOPMENT_GROUP_IDS.map((groupId) => `group-${groupId}.json`))
  for (const file of files) {
    assert(typeof file === 'string' && expectedFiles.has(file), `refusing non-development group evidence file: ${file}`)
  }
  const groups = await Promise.all(files.map((file) => readJson(resolve(artifactDir, file))))
  let evidenceSha256 = null
  try {
    evidenceSha256 = (await readFile(resolve(artifactDir, 'evidence-sha256.txt'), 'utf8')).trim()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { aggregate: { ...aggregate, evidenceSha256 }, groups }
}

export async function buildAndWriteConfidenceModel({ artifactDir = DEFAULT_ARTIFACT_DIR, outputPath = resolve(artifactDir, MODEL_FILENAME) } = {}) {
  const evidence = await loadDevelopmentEvidence({ artifactDir })
  const model = buildFinalDevelopmentModel(evidence)
  const writeResult = await writeConfidenceModel(model, outputPath)
  return { model, ...writeResult }
}

export { DEVELOPMENT_GROUP_IDS, HOLDOUT_GROUP_IDS, v2EvaluationGrid }

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  buildAndWriteConfidenceModel()
    .then((result) => process.stdout.write(`${JSON.stringify({ outputPath: result.outputPath, modelSha256: result.model.modelSha256, written: result.written }, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
