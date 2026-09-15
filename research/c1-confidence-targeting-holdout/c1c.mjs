import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * C1c is deliberately a protocol-boundary module.  It contains constants,
 * admission checks, and the future outcome schema only; it has no response
 * acquisition, parser invocation, consensus calculation, or metric runner.
 */

export const C1C_ALGORITHM_VERSION = 'c1-confidence-targeting-v1'
export const C1C_PROTOCOL_SCHEMA_VERSION = 1
export const C1C_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1-confidence-targeting-holdout'
export const C1C_PROTOCOL_RELATIVE_PATH = 'research/c1-confidence-targeting-holdout/protocol.md'

export const C1C_FORM = 'in-ear'
export const C1C_V2_MIN_HZ = 20
export const C1C_V2_MAX_HZ = 20_000
export const C1C_V2_POINTS_PER_OCTAVE = 96
export const C1C_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const C1C_PRIMARY_BAND_HZ = Object.freeze([4_000, 14_000])
export const C1C_TARGET_SCALE_DB = 0.75
export const C1C_TARGETING_THRESHOLD = 0.05
export const C1C_MIN_CLASS_GROUPS = 2
export const C1C_REQUIRED_HOLDOUT_GROUPS = 6
export const C1C_MIN_SIGNAL_GROUPS = 4

export const C1C_CORPUS_COMMIT = '28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a'
export const C1C_CORPUS_EVIDENCE_SHA256 = 'a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43'
export const C1C_C1B_PROTOCOL_FREEZE_COMMIT = '6e8dba547bc9f12a072e0660ce35c89a3d502455'
export const C1C_C1B_EVIDENCE_COMMIT = '458f95642b6a0880311d48afdfc54409c1e8b34a'
export const C1C_C1B_EVIDENCE_SHA256 = 'a962156d1203a243740c909e464399e0fd84d4fc92ffeaa23fa514d8129b4004'
export const C1C_CONFIDENCE_MODEL_SHA256 = '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'
export const C1C_BATCH_C_REJECTION_TOKEN = 'fresh-real-corpus-v1.2:Batch C'

export const C1C_UPSTREAM = Object.freeze({
  repository: 'jaakkopasanen/AutoEq',
  commit: '7ae0f56d53074872b028649617a22bbb4232feb7',
  tree: '671f0a72499ace671e4b0a293bc1948bb8330c96',
})
export const C1C_FROZEN_BOUNDARY = 'be4280512d36ad406fbebb63e49d5df51ce57a46'

export const C1C_DEVELOPMENT_GROUP_IDS = Object.freeze([
  'c1g-c4cd2c0381c89a1e9911',
  'c1g-106abf02ed8b580831bd',
  'c1g-5fe954a9babbe4c5cda0',
  'c1g-0a8d256822943d659136',
  'c1g-20fa430247872858b84b',
  'c1g-3579b4e7c8f794efd07a',
])

export const C1C_HOLDOUT_GROUP_IDS = Object.freeze([
  'c1g-ebdb284a8c7563a12c5f',
  'c1g-3f4de360d87a28aea240',
  'c1g-f2a43144c5936389d89d',
  'c1g-8bd11cb5d7772ff2165b',
  'c1g-6c369c990dd73512951b',
  'c1g-dc1ade324d0c4b3192d6',
])

export const CONFIDENCE_TARGETING_WIN = 'CONFIDENCE_TARGETING_WIN'
export const CONFIDENCE_TARGETING_LOSS = 'CONFIDENCE_TARGETING_LOSS'
export const CONFIDENCE_TARGETING_SIGNAL = 'CONFIDENCE_TARGETING_SIGNAL'
export const NO_CONFIDENCE_TARGETING_SIGNAL = 'NO_CONFIDENCE_TARGETING_SIGNAL'
export const CONFIDENCE_TARGETING_GENERALIZES = 'CONFIDENCE_TARGETING_GENERALIZES'
export const CONFIDENCE_TARGETING_NOT_CONFIRMED = 'CONFIDENCE_TARGETING_NOT_CONFIRMED'
export const INCONCLUSIVE = 'INCONCLUSIVE'

export const C1C_DIAGNOSTIC_BANDS_HZ = Object.freeze([
  Object.freeze({ id: '20-500Hz', minHz: 20, maxHz: 500 }),
  Object.freeze({ id: '500-1kHz', minHz: 500, maxHz: 1_000 }),
  Object.freeze({ id: '1-2kHz', minHz: 1_000, maxHz: 2_000 }),
  Object.freeze({ id: '2-4kHz', minHz: 2_000, maxHz: 4_000 }),
  Object.freeze({ id: '4-6kHz', minHz: 4_000, maxHz: 6_000 }),
  Object.freeze({ id: '6-8kHz', minHz: 6_000, maxHz: 8_000 }),
  Object.freeze({ id: '8-10kHz', minHz: 8_000, maxHz: 10_000 }),
  Object.freeze({ id: '10-14kHz', minHz: 10_000, maxHz: 14_000 }),
  Object.freeze({ id: '14-20kHz', minHz: 14_000, maxHz: 20_000 }),
])

const HOLDOUT_GROUP_METADATA = Object.freeze([
  Object.freeze({
    groupId: 'c1g-ebdb284a8c7563a12c5f',
    deviceFamily: 'moondrop aria',
    configurationSignature: 'moondrop aria',
    strengthTier: 'B',
    memberCount: 6,
    exact711IndependentCount: 5,
    non711IndependentCount: 1,
    non711RigClasses: ['gras-43ac'],
  }),
  Object.freeze({
    groupId: 'c1g-3f4de360d87a28aea240',
    deviceFamily: 'truthear hexa',
    configurationSignature: 'truthear hexa',
    strengthTier: 'B',
    memberCount: 9,
    exact711IndependentCount: 7,
    non711IndependentCount: 2,
    non711RigClasses: ['gras-43ac', 'gras-ra0045'],
  }),
  Object.freeze({
    groupId: 'c1g-f2a43144c5936389d89d',
    deviceFamily: '7hz salnotes zero',
    configurationSignature: '7hz salnotes zero',
    strengthTier: 'B',
    memberCount: 9,
    exact711IndependentCount: 7,
    non711IndependentCount: 2,
    non711RigClasses: ['gras-43ac', 'gras-ra0045'],
  }),
  Object.freeze({
    groupId: 'c1g-8bd11cb5d7772ff2165b',
    deviceFamily: 'moondrop quarks',
    configurationSignature: 'moondrop quarks',
    strengthTier: 'B',
    memberCount: 6,
    exact711IndependentCount: 5,
    non711IndependentCount: 1,
    non711RigClasses: ['gras-43ac'],
  }),
  Object.freeze({
    groupId: 'c1g-6c369c990dd73512951b',
    deviceFamily: 'epz q5',
    configurationSignature: 'epz q5',
    strengthTier: 'B',
    memberCount: 7,
    exact711IndependentCount: 6,
    non711IndependentCount: 1,
    non711RigClasses: ['kb501x-711'],
  }),
  Object.freeze({
    groupId: 'c1g-dc1ade324d0c4b3192d6',
    deviceFamily: '7hz timeless',
    configurationSignature: '7hz timeless',
    strengthTier: 'B',
    memberCount: 7,
    exact711IndependentCount: 6,
    non711IndependentCount: 1,
    non711RigClasses: ['gras-43ac'],
  }),
])

export { HOLDOUT_GROUP_METADATA }

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON number must be finite')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

/** Deterministic JSON used for the protocol bundle hash. */
export function stableJson(value) {
  return JSON.stringify(canonicalize(value))
}

export function hashJson(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sameIds(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((id, index) => id === expected[index])
}

function assertHex(value, length, label) {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) throw new Error(`${label} must be a ${length}-character lowercase hex string`)
}

function assertFalse(manifest, field) {
  if (manifest[field] !== false) throw new Error(`C1c protocol manifest contains ${field}`)
}

/**
 * Future outcome shape.  The current file is a declaration only: all
 * response-derived fields are prohibited until the post-freeze runner writes
 * a separate outcome artifact.
 */
export function createHoldoutOutcomeSchema() {
  return {
    schemaVersion: C1C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1c-confidence-targeting-holdout-outcome-schema',
    algorithmVersion: C1C_ALGORITHM_VERSION,
    outcomeValuesAllowed: false,
    responseDerivedValuesAllowed: false,
    requiredTopLevel: [
      'schemaVersion', 'artifactKind', 'algorithmVersion', 'protocolFreezeCommit',
      'protocolSha256', 'confidenceModelSha256', 'holdoutGroupEvidence',
      'holdoutGate', 'combinedInterpretation', 'flags', 'evidenceSha256',
    ],
    holdoutGroupEvidence: {
      required: ['groupId', 'deviceFamily', 'memberCount', 'members', 'consensus', 'repeatabilitySigma', 'observations', 'classification'],
      memberProvenanceRequired: [
        'concreteCurveIdentity', 'collection', 'form', 'rig', 'rigClass', 'path',
        'upstreamRawUrl', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256',
        'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256',
      ],
      observationRequired: ['observationId', 'rigClass', 'frequenciesHz', 'deltaDb', 'absoluteDeltaDb', 'metrics'],
      metricsRequired: [
        'rawCrossRigMae', 'rawCrossRigRmse', 'E_conf', 'E_const', 'gain',
        'meanConfidence', 'minimumConfidence', 'maximumConfidence',
        'w_repeatability', 'w_rig', 'w_conf', 'spearmanUncertaintyArtifact',
        'highestConfidenceQuartile', 'lowestConfidenceQuartile', 'bandDiagnostics',
      ],
      consensusRequired: ['method', 'frequenciesHz', 'valuesDb', 'hashSha256'],
      sigmaRequired: ['method', 'frequenciesHz', 'valuesDb', 'hashSha256'],
    },
    evaluation: {
      primaryBandHz: [...C1C_PRIMARY_BAND_HZ],
      targetingThreshold: C1C_TARGETING_THRESHOLD,
      equalAuthorityControl: 'w_const(f) = mean_primary(w_conf(f))',
      errorProxy: 'mean_primary(abs(weight(f) * D(f)))',
      informativeRule: 'E_const == 0',
      winRule: 'informative AND gain >= 0.05',
      groupSignalRule: 'strict majority of informative observations AND median gain >= 0.05',
      weightSource: 'immutable development-trained confidence-model.json only',
      holdoutReference: 'same-group exact-711 pointwise median; holdout responses enter only reference/metrics after frozen model selection',
    },
    diagnostics: {
      bandsHz: C1C_DIAGNOSTIC_BANDS_HZ.map(({ id, minHz, maxHz }) => ({ id, minHz, maxHz })),
      spearman: 'average ranks for exact ties; null when either rank vector is constant',
      quartiles: 'ceil(n/4) primary points; confidence desc/asc and original grid index tie order',
    },
    groupGate: {
      signal: 'strict majority of informative observations AND median gain >= 0.05',
      informativeExclusion: 'E_const == 0 observations do not enter win/loss or median gain',
      allowed: [CONFIDENCE_TARGETING_SIGNAL, NO_CONFIDENCE_TARGETING_SIGNAL, INCONCLUSIVE],
    },
    holdoutGate: {
      totalGroups: C1C_REQUIRED_HOLDOUT_GROUPS,
      minimumSignalGroups: C1C_MIN_SIGNAL_GROUPS,
      allowed: [CONFIDENCE_TARGETING_GENERALIZES, CONFIDENCE_TARGETING_NOT_CONFIRMED, INCONCLUSIVE],
      supported: CONFIDENCE_TARGETING_GENERALIZES,
      notConfirmed: CONFIDENCE_TARGETING_NOT_CONFIRMED,
      invalid: INCONCLUSIVE,
    },
    combinedInterpretation: [
      'C1_CONFIDENCE_MODEL_GENERALIZED',
      'C1_CLOSED_HOLDOUT_NOT_CONFIRMED',
      INCONCLUSIVE,
    ],
    defectPolicy: {
      semanticHoldoutDefect: INCONCLUSIVE,
      semanticHoldoutDefectRerunAllowed: false,
      outcomeNeutralPackagingCorrectionAllowed: true,
      outcomeNeutralCorrectionMustProve: 'computed outcomes, algorithm, inputs, hashes, and classifications are unchanged',
    },
    flags: {
      developmentGroupsAccepted: false,
      developmentDecisionInputAccepted: false,
      developmentRerunForHoldoutDecision: false,
      holdoutExecuted: false,
      outcomesGenerated: false,
      responseOutcomeObserved: false,
      confidenceCurveComputed: false,
      confidenceWeightingApplied: false,
      consensusAlgorithmExecuted: false,
      retrainingAfterFreeze: false,
      batchCExecuted: false,
      freshRealBatchCExecuted: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      c4PeakAlignmentUsed: false,
      rawMeasurementsCommitted: false,
    },
  }
}

/** Build the immutable C1c pre-outcome protocol manifest. */
export function createHoldoutProtocolManifest({ protocolFreezeCommit = null } = {}) {
  return {
    schemaVersion: C1C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1c-confidence-targeting-holdout-protocol',
    algorithmVersion: C1C_ALGORITHM_VERSION,
    phase: 'protocol-freeze',
    milestone: 'C1c-confidence-targeting-holdout',
    frozenBoundary: C1C_FROZEN_BOUNDARY,
    c1aV11: {
      corpusVersion: 'c1-cross-rig-confidence-corpus-v1.1',
      commit: C1C_CORPUS_COMMIT,
      evidenceSha256: C1C_CORPUS_EVIDENCE_SHA256,
      classification: 'C1_CORPUS_V1_1_READY',
    },
    c1b: {
      algorithmVersion: C1C_ALGORITHM_VERSION,
      protocolFreezeCommit: C1C_C1B_PROTOCOL_FREEZE_COMMIT,
      evidenceCommit: C1C_C1B_EVIDENCE_COMMIT,
      evidenceSha256: C1C_C1B_EVIDENCE_SHA256,
      developmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
      responseOutcomesUsedForModel: true,
    },
    confidenceModel: {
      path: '.research-artifacts/c1-confidence-targeting-dev/confidence-model.json',
      sha256: C1C_CONFIDENCE_MODEL_SHA256,
      source: 'C1b final model trained on all six development groups',
      developmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
      holdoutUsed: false,
      immutable: true,
      retrainingAllowed: false,
      classProfileRule: 'use frozen class-specific profile when serialized; otherwise frozen global profile fallback',
    },
    upstream: { ...C1C_UPSTREAM },
    holdoutGroupIds: [...C1C_HOLDOUT_GROUP_IDS],
    holdoutGroups: HOLDOUT_GROUP_METADATA.map((group) => ({ ...group, non711RigClasses: [...group.non711RigClasses] })),
    rejectedDevelopmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
    developmentDecisionInputAccepted: false,
    developmentGroupsAccepted: false,
    rejectedBatchCToken: C1C_BATCH_C_REJECTION_TOKEN,
    freshRealBatchCRejected: true,
    primaryBandHz: [...C1C_PRIMARY_BAND_HZ],
    dataPreparation: {
      form: C1C_FORM,
      v2MinHz: C1C_V2_MIN_HZ,
      v2MaxHz: C1C_V2_MAX_HZ,
      pointsPerOctave: C1C_V2_POINTS_PER_OCTAVE,
      grid: 'frozen normal V2 log grid, terminal endpoint included at 20,000 Hz',
      normalization: { ...C1C_NORMALIZATION },
      terminalClosure: 'terminal-flat-hold-to-v2-max',
      smoothing: false,
      peakAlignment: false,
      c4Preprocessing: false,
      responseDerivedFiltering: false,
      rawBytes: 'reacquire immutable pinned upstream bytes; verify Git blob SHA-1 and SHA-256; cache only in ignored holdout cache',
    },
    consensus: {
      primaryRigLiteral: '711',
      method: 'pointwise median of exact-711 normalized curves within the withheld group',
      repeatability: '1.4826 * median_i(abs(x_i(f) - C_g(f)))',
      holdoutDataUse: 'withheld responses enter only their own consensus/disagreement metrics after frozen model selection',
    },
    evaluation: {
      protocol: 'evaluate exactly six untouched holdout groups using frozen development-trained weights',
      primaryBandHz: [...C1C_PRIMARY_BAND_HZ],
      targetingThreshold: C1C_TARGETING_THRESHOLD,
      gridInclusion: 'use only normal V2 grid points with 4,000 <= f <= 14,000; no synthetic boundary interpolation',
      equalAuthorityControl: 'w_const(f) = mean_primary(w_conf(f))',
      E_conf: 'mean_primary(abs(w_conf(f) * D(f)))',
      E_const: 'mean_primary(abs(w_bar * D(f)))',
      gain: '(E_const - E_conf) / E_const when E_const > 0',
      noninformative: 'E_const == 0; omit from win/loss count and median gain',
      win: 'gain >= 0.05 (exact)',
      holdoutGate: 'at least four of six groups are CONFIDENCE_TARGETING_SIGNAL',
      developmentGateInput: 'not accepted by holdout evaluator; combined interpretation is formed only after independent holdout acceptance',
    },
    diagnostics: {
      rawMetrics: 'raw cross-rig MAE and RMSE on the primary band; full-grid values retained as secondary diagnostics',
      bandsHz: C1C_DIAGNOSTIC_BANDS_HZ.map(({ id, minHz, maxHz }) => ({ id, minHz, maxHz })),
      spearman: 'Spearman rho between 1 - w_conf and abs(D), average ranks for exact ties, null for constant ranks',
      quartiles: 'ceil(n/4) primary points, ordered by confidence then original grid index for deterministic ties',
    },
    groupGate: {
      signal: 'strict majority of informative observations AND median gain >= 0.05',
      informativeObservationRule: 'E_const > 0',
      allowed: [CONFIDENCE_TARGETING_SIGNAL, NO_CONFIDENCE_TARGETING_SIGNAL, INCONCLUSIVE],
    },
    holdoutGate: {
      requiredGroups: C1C_REQUIRED_HOLDOUT_GROUPS,
      minimumSignals: C1C_MIN_SIGNAL_GROUPS,
      supported: CONFIDENCE_TARGETING_GENERALIZES,
      notConfirmed: CONFIDENCE_TARGETING_NOT_CONFIRMED,
      invalid: INCONCLUSIVE,
    },
    combinedInterpretation: {
      generalized: 'C1_CONFIDENCE_MODEL_GENERALIZED only when independently audited C1b development gate passed and holdout gate generalizes',
      holdoutFailure: 'C1_CLOSED_HOLDOUT_NOT_CONFIRMED',
      semanticDefect: INCONCLUSIVE,
    },
    defectPolicy: {
      semanticHoldoutDefect: INCONCLUSIVE,
      semanticHoldoutDefectRerunAllowed: false,
      outcomeNeutralPackagingCorrectionAllowed: true,
      outcomeNeutralCorrectionMustProve: 'computed outcomes, algorithm, inputs, hashes, and classifications are unchanged',
    },
    protocolFreezeCommit,
    holdoutExecuted: false,
    outcomesGenerated: false,
    responseOutcomeObserved: false,
    confidenceCurveComputed: false,
    confidenceWeightingApplied: false,
    consensusAlgorithmExecuted: false,
    retrainingAllowed: false,
    retrainingAfterFreeze: false,
    developmentRerunForHoldoutDecision: false,
    batchCExecuted: false,
    freshRealBatchCExecuted: false,
    autoEqSolverExecuted: false,
    solverExecuted: false,
    c4PeakAlignmentUsed: false,
    rawMeasurementsCommitted: false,
    artifactSchema: 'schema.json',
    protocolPath: C1C_PROTOCOL_RELATIVE_PATH,
  }
}

/**
 * Validate the pre-outcome manifest.  This fails closed on any execution
 * state or boundary mutation rather than inferring intent from missing data.
 */
export function validateHoldoutProtocolManifest(manifest) {
  if (!manifest || manifest.artifactKind !== 'c1c-confidence-targeting-holdout-protocol') throw new Error('invalid C1c protocol manifest')
  if (manifest.schemaVersion !== C1C_PROTOCOL_SCHEMA_VERSION || manifest.algorithmVersion !== C1C_ALGORITHM_VERSION || manifest.phase !== 'protocol-freeze') throw new Error('C1c protocol identity mismatch')
  if (manifest.protocolFreezeCommit !== null) assertHex(manifest.protocolFreezeCommit, 40, 'protocolFreezeCommit')
  if (manifest.frozenBoundary !== C1C_FROZEN_BOUNDARY) throw new Error('C1c frozen boundary mismatch')
  if (stableJson(manifest.upstream) !== stableJson(C1C_UPSTREAM)) throw new Error('upstream provenance pin mismatch')
  if (manifest.c1aV11?.commit !== C1C_CORPUS_COMMIT || manifest.c1aV11?.evidenceSha256 !== C1C_CORPUS_EVIDENCE_SHA256 || manifest.c1aV11?.classification !== 'C1_CORPUS_V1_1_READY') throw new Error('C1 V1.1 provenance pin mismatch')
  if (manifest.c1b?.protocolFreezeCommit !== C1C_C1B_PROTOCOL_FREEZE_COMMIT || manifest.c1b?.evidenceCommit !== C1C_C1B_EVIDENCE_COMMIT || manifest.c1b?.evidenceSha256 !== C1C_C1B_EVIDENCE_SHA256) throw new Error('C1b provenance pin mismatch')
  if (!sameIds(manifest.c1b?.developmentGroupIds, C1C_DEVELOPMENT_GROUP_IDS) || !sameIds(manifest.confidenceModel?.developmentGroupIds, C1C_DEVELOPMENT_GROUP_IDS)) throw new Error('development group provenance pin mismatch')
  if (manifest.confidenceModel?.sha256 !== C1C_CONFIDENCE_MODEL_SHA256 || manifest.confidenceModel?.holdoutUsed !== false || manifest.confidenceModel?.immutable !== true || manifest.confidenceModel?.retrainingAllowed !== false) throw new Error('confidence model pin or immutability mismatch')
  if (!sameIds(manifest.holdoutGroupIds, C1C_HOLDOUT_GROUP_IDS)) throw new Error('holdout group IDs do not match repaired C1 V1.1 selection')
  const expectedGroups = HOLDOUT_GROUP_METADATA.map((group) => ({ ...group, non711RigClasses: [...group.non711RigClasses] }))
  if (stableJson(manifest.holdoutGroups) !== stableJson(expectedGroups)) throw new Error('holdout group metadata does not match repaired C1 V1.1 selection')
  if (!sameIds(manifest.rejectedDevelopmentGroupIds, C1C_DEVELOPMENT_GROUP_IDS) || manifest.developmentDecisionInputAccepted !== false || manifest.developmentGroupsAccepted !== false) throw new Error('development groups or decision input are not rejected')
  for (const field of ['holdoutExecuted', 'outcomesGenerated', 'responseOutcomeObserved', 'confidenceCurveComputed', 'confidenceWeightingApplied', 'consensusAlgorithmExecuted', 'retrainingAllowed', 'retrainingAfterFreeze', 'developmentRerunForHoldoutDecision', 'batchCExecuted', 'freshRealBatchCExecuted', 'autoEqSolverExecuted', 'solverExecuted', 'c4PeakAlignmentUsed', 'rawMeasurementsCommitted']) assertFalse(manifest, field)
  if (manifest.rejectedBatchCToken !== C1C_BATCH_C_REJECTION_TOKEN || manifest.freshRealBatchCRejected !== true || manifest.freshRealBatchCExecuted !== false) throw new Error('Fresh Real Batch C must remain sealed')
  if (manifest.primaryBandHz?.[0] !== C1C_PRIMARY_BAND_HZ[0] || manifest.primaryBandHz?.[1] !== C1C_PRIMARY_BAND_HZ[1] || manifest.evaluation?.primaryBandHz?.[0] !== C1C_PRIMARY_BAND_HZ[0] || manifest.evaluation?.primaryBandHz?.[1] !== C1C_PRIMARY_BAND_HZ[1]) throw new Error('C1c primary band mismatch')
  if (manifest.evaluation?.targetingThreshold !== C1C_TARGETING_THRESHOLD) throw new Error('C1c targeting threshold mismatch')
  if (manifest.dataPreparation?.form !== C1C_FORM || manifest.dataPreparation?.v2MinHz !== C1C_V2_MIN_HZ || manifest.dataPreparation?.v2MaxHz !== C1C_V2_MAX_HZ || manifest.dataPreparation?.pointsPerOctave !== C1C_V2_POINTS_PER_OCTAVE || stableJson(manifest.dataPreparation?.normalization) !== stableJson(C1C_NORMALIZATION) || manifest.dataPreparation?.terminalClosure !== 'terminal-flat-hold-to-v2-max' || manifest.dataPreparation?.smoothing !== false || manifest.dataPreparation?.peakAlignment !== false || manifest.dataPreparation?.c4Preprocessing !== false || manifest.dataPreparation?.responseDerivedFiltering !== false) throw new Error('C1c data preparation must use frozen no-smoothing/no peak alignment semantics')
  if (manifest.consensus?.primaryRigLiteral !== '711' || manifest.consensus?.method !== 'pointwise median of exact-711 normalized curves within the withheld group') throw new Error('C1c consensus reference mismatch')
  if (manifest.evaluation?.equalAuthorityControl !== 'w_const(f) = mean_primary(w_conf(f))' || manifest.evaluation?.E_conf !== 'mean_primary(abs(w_conf(f) * D(f)))' || manifest.evaluation?.E_const !== 'mean_primary(abs(w_bar * D(f)))' || manifest.evaluation?.win !== 'gain >= 0.05 (exact)') throw new Error('C1c evaluation formula mismatch')
  return true
}

/**
 * Runner admission guard.  Development decisions/groups and Batch C are
 * rejected as inputs, while only the exact holdout split and model hash are
 * accepted.  This function does not touch the filesystem or response data.
 */
export function validateHoldoutExecutionRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('holdout execution request is required')
  if (!sameIds(request.holdoutGroupIds, C1C_HOLDOUT_GROUP_IDS)) throw new Error('holdout group IDs do not match the frozen six-group holdout')
  if (request.confidenceModelSha256 !== C1C_CONFIDENCE_MODEL_SHA256) throw new Error('confidence model SHA-256 does not match the frozen development model')
  if ('developmentGroupIds' in request || 'developmentClassification' in request || 'developmentGate' in request) throw new Error('development inputs are rejected for C1c holdout execution')
  if ('batchCToken' in request || request.freshRealBatchCUsed === true || request.freshRealBatchCExecuted === true) throw new Error('Fresh Real Batch C is rejected for C1c holdout execution')
  if (request.retrain === true || request.retraining === true || request.retrainModel === true) throw new Error('retraining is forbidden after C1b model freeze')
  return true
}

/** Write only the protocol bundle; no response or raw-byte path is accepted. */
export async function writeProtocolArtifacts({ outputDir = C1C_ARTIFACT_RELATIVE_DIR, protocolFreezeCommit = null } = {}) {
  const manifest = createHoldoutProtocolManifest({ protocolFreezeCommit })
  validateHoldoutProtocolManifest(manifest)
  const schema = createHoldoutOutcomeSchema()
  const manifestText = jsonText(manifest)
  const schemaText = jsonText(schema)
  const protocolSha256 = createHash('sha256').update(manifestText + schemaText).digest('hex')
  await mkdir(outputDir, { recursive: true })
  await writeFile(resolve(outputDir, 'manifest.json'), manifestText, 'utf8')
  await writeFile(resolve(outputDir, 'schema.json'), schemaText, 'utf8')
  await writeFile(resolve(outputDir, 'protocol-sha256.txt'), `${protocolSha256}\n`, 'utf8')
  return { outputDir, manifest, schema, protocolSha256 }
}
