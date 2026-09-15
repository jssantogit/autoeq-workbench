import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C1A_FORM,
  C1A_NORMALIZATION,
  C1A_PRIMARY_RIG,
  C1A_V2_MAX_HZ,
  C1A_V2_MIN_HZ,
  C1A_V2_POINTS_PER_OCTAVE,
  C4C_FINAL_EVIDENCE_SHA256,
  C4_FINAL_INTERPRETATION,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_REPOSITORY,
  UPSTREAM_TREE,
  canonicalizeTerminalEndpoint,
  classifyRig,
  hashEvidenceFiles,
  parseCurveCsv,
  rawUrl,
  sha256,
  v2EvaluationGrid,
} from '../c1-cross-rig-confidence-corpus/c1a.mjs'
import { validateC1V11Artifact } from '../c1-cross-rig-confidence-corpus/c1a-v1.1.mjs'
import {
  buildConfidenceWeights,
  calculateCrossRigDisagreement,
  calculateRepeatabilitySigma,
  classifyGroupTargeting,
  evaluateTargetingObservation,
  pointwiseMedian,
  prepareCurve,
  verifyRawProvenance,
} from '../c1-confidence-targeting-dev/c1b.mjs'
import { validateConfidenceModel } from '../c1-confidence-targeting-dev/phase2-model.mjs'

/**
 * C1c contains the frozen protocol declaration and the post-freeze holdout
 * runner.  The runner is intentionally isolated from production code and
 * consumes only the repaired metadata corpus plus the immutable C1b model.
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

// This is the commit that froze this C1c protocol bundle.  The post-freeze
// runner is admitted only while HEAD is exactly this commit; once the
// outcome evidence is committed, a second execution fails closed.
export const C1C_PROTOCOL_FREEZE_COMMIT = '16491dbb517f6059e6d379e136019737b59f81c9'
export const C1C_PROTOCOL_SHA256 = '0a4e20c50879f2d7aaa5765debd2dca55348b2c34158a3fd8eb2dc79354422a0'
export const C1C_CACHE_RELATIVE_DIR = '.research-cache/c1-confidence-targeting-holdout'
export const C1C_CORPUS_RELATIVE_DIR = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1'
export const C1C_MODEL_RELATIVE_PATH = '.research-artifacts/c1-confidence-targeting-dev/confidence-model.json'
export const C1C_OUTCOME_MANIFEST_FILENAME = 'outcome-manifest.json'
export const C1C_OUTCOME_ARTIFACT_KIND = 'c1c-confidence-targeting-holdout-outcome'
export const C1C_GROUP_ARTIFACT_KIND = 'c1c-group-confidence-targeting-holdout-evidence'
export const C1C_MAX_NETWORK_ATTEMPTS = 3
export const C1C_NETWORK_RETRY_DELAY_MS = 250

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

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const C1C_CORPUS_EVIDENCE_PATHS = Object.freeze([
  'groups.json',
  'historical-device-exclusions.json',
  'manifest.json',
  'provenance.json',
  'rig-inventory.json',
  'selection-protocol.md',
])
const C1C_OUTCOME_STATIC_EVIDENCE = Object.freeze(['schema.json'])
const RAW_FETCH_HEADERS = Object.freeze({ 'User-Agent': 'autoeq-workbench-c1c-holdout' })
const EXPECTED_V2_GRID = v2EvaluationGrid()

const jsonRead = async (path) => JSON.parse(await readFile(path, 'utf8'))
const hashCurve = (curve) => hashJson({ frequenciesHz: curve.frequenciesHz, valuesDb: curve.valuesDb })
const hashObservation = (observation) => hashJson({
  frequenciesHz: observation.frequenciesHz,
  deltaDb: observation.deltaDb,
  absoluteDeltaDb: observation.absoluteDeltaDb,
})

function observedRepositoryCommit(repositoryRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

function assertArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

/**
 * Verify every frozen input before a single holdout byte is acquired.  This
 * is intentionally separate from the outcome runner so tests can exercise
 * the execution boundary without network access.
 */
export async function verifyFrozenC1cProvenance({
  repositoryRoot = MODULE_ROOT,
  artifactDir = resolve(repositoryRoot, C1C_ARTIFACT_RELATIVE_DIR),
  corpusDir = resolve(repositoryRoot, C1C_CORPUS_RELATIVE_DIR),
  modelPath = resolve(repositoryRoot, C1C_MODEL_RELATIVE_PATH),
} = {}) {
  const manifestPath = resolve(artifactDir, 'manifest.json')
  const schemaPath = resolve(artifactDir, 'schema.json')
  const protocolHashPath = resolve(artifactDir, 'protocol-sha256.txt')
  const [manifestText, schemaText, protocolShaText] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
    readFile(protocolHashPath, 'utf8'),
  ])
  const manifest = JSON.parse(manifestText)
  const schema = JSON.parse(schemaText)
  validateHoldoutProtocolManifest(manifest)
  if (manifest.protocolFreezeCommit !== null) throw new Error('C1c protocol manifest has already been outcome-mutated')
  const protocolSha256 = createHash('sha256').update(manifestText + schemaText).digest('hex')
  assertEqual(protocolSha256, C1C_PROTOCOL_SHA256, 'C1c protocol SHA-256')
  assertEqual(protocolShaText.trim(), C1C_PROTOCOL_SHA256, 'recorded C1c protocol SHA-256')
  if (stableJson(schema) !== stableJson(createHoldoutOutcomeSchema())) throw new Error('C1c schema has been mutated')

  const [corpusManifest, corpusGroups, corpusProvenance, exclusions] = await Promise.all([
    jsonRead(resolve(corpusDir, 'manifest.json')),
    jsonRead(resolve(corpusDir, 'groups.json')),
    jsonRead(resolve(corpusDir, 'provenance.json')),
    jsonRead(resolve(corpusDir, 'historical-device-exclusions.json')),
  ])
  validateC1V11Artifact({
    manifest: corpusManifest,
    groups: corpusGroups,
    provenance: corpusProvenance,
    exclusions,
    artifactFiles: corpusDir,
  })
  const corpusEvidenceSha256 = hashEvidenceFiles(corpusDir, C1C_CORPUS_EVIDENCE_PATHS)
  const recordedCorpusEvidenceSha256 = (await readFile(resolve(corpusDir, 'evidence-sha256.txt'), 'utf8')).trim()
  assertEqual(corpusEvidenceSha256, C1C_CORPUS_EVIDENCE_SHA256, 'C1 V1.1 evidence SHA-256')
  assertEqual(recordedCorpusEvidenceSha256, C1C_CORPUS_EVIDENCE_SHA256, 'recorded C1 V1.1 evidence SHA-256')

  const modelText = await readFile(modelPath, 'utf8')
  const model = JSON.parse(modelText)
  validateConfidenceModel(model)
  assertEqual(model.modelSha256, C1C_CONFIDENCE_MODEL_SHA256, 'immutable confidence model SHA-256')
  assertArrayEqual(model.developmentGroupIds, C1C_DEVELOPMENT_GROUP_IDS, 'model development group IDs')
  assertArrayEqual(model.rejectedHoldoutGroupIds, C1C_HOLDOUT_GROUP_IDS, 'model rejected holdout group IDs')
  assertEqual(model.holdoutUsed, false, 'model holdoutUsed')
  assertEqual(model.freshRealBatchCUsed, false, 'model freshRealBatchCUsed')
  assertEqual(model.autoEqSolverExecuted, false, 'model autoEqSolverExecuted')
  assertEqual(model.c4PeakAlignmentUsed, false, 'model c4PeakAlignmentUsed')
  if (model.rejectedBatchCToken !== C1C_BATCH_C_REJECTION_TOKEN) throw new Error('confidence model Batch C rejection token mismatch')
  if (stableJson(model.dataPreparation?.normalization) !== stableJson(C1C_NORMALIZATION)) throw new Error('confidence model normalization mismatch')
  if (model.dataPreparation?.terminalClosure !== 'terminal-flat-hold-to-v2-max' || model.dataPreparation?.smoothing !== false || model.dataPreparation?.peakAlignment !== false) {
    throw new Error('confidence model preparation semantics mismatch')
  }
  return {
    artifactDir,
    manifest,
    schema,
    protocolSha256,
    corpusDir,
    corpusManifest,
    corpusGroups,
    corpusProvenance,
    exclusions,
    corpusEvidenceSha256,
    modelPath,
    model,
    modelSerializedSha256: sha256(modelText),
  }
}

async function assertNoPriorOutcome(outputDir) {
  let entries
  try {
    entries = await readdir(outputDir)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('C1c protocol artifact directory is missing')
    throw error
  }
  const outcomeNames = new Set([
    C1C_OUTCOME_MANIFEST_FILENAME,
    'aggregate-evidence.json',
    'final-report.md',
    'evidence-sha256.txt',
  ])
  const prior = entries.filter((entry) => outcomeNames.has(entry) || /^group-c1g-[0-9a-f]+\.json$/.test(entry))
  if (prior.length > 0) throw new Error(`C1c holdout execution is one-shot; prior outcome artifacts exist: ${prior.sort().join(', ')}`)
}

function assertHoldoutGroupBoundary(group, exclusions) {
  if (!group || group.split !== 'holdout') throw new Error(`C1c group is not an untouched holdout: ${group?.groupId ?? 'unknown'}`)
  if (!C1C_HOLDOUT_GROUP_IDS.includes(group.groupId)) throw new Error(`C1c group is not an approved holdout: ${group.groupId}`)
  if (C1C_DEVELOPMENT_GROUP_IDS.includes(group.groupId)) throw new Error(`C1c development group is rejected: ${group.groupId}`)
  if (!group.eligible || group.exact711IndependentCount < 3 || group.non711IndependentCount < 1) throw new Error(`C1c holdout group fails frozen eligibility: ${group.groupId}`)
  const expected = HOLDOUT_GROUP_METADATA.find((candidate) => candidate.groupId === group.groupId)
  if (!expected) throw new Error(`C1c holdout metadata missing: ${group.groupId}`)
  for (const field of ['deviceFamily', 'configurationSignature', 'strengthTier', 'exact711IndependentCount', 'non711IndependentCount']) {
    if (group[field] !== expected[field]) throw new Error(`C1c ${field} mismatch for ${group.groupId}`)
  }
  assertArrayEqual(group.non711RigClasses, expected.non711RigClasses, `C1c non-711 rig classes for ${group.groupId}`)
  if (!Array.isArray(group.exact711Members) || group.exact711Members.length !== group.exact711IndependentCount) throw new Error(`C1c exact-711 member count mismatch: ${group.groupId}`)
  if (!Array.isArray(group.eligibleNon711Members) || group.eligibleNon711Members.length !== group.non711IndependentCount) throw new Error(`C1c non-711 member count mismatch: ${group.groupId}`)
  const members = [...group.exact711Members, ...group.eligibleNon711Members]
  if (new Set(members.map((member) => member.concreteCurveIdentity)).size !== members.length) throw new Error(`C1c duplicate member identity: ${group.groupId}`)
  const historical = new Set(exclusions.historicalObservedFamilies ?? [])
  const sealed = new Set(exclusions.sealedFutureBatchCFamilies ?? [])
  if (historical.has(group.deviceFamily)) throw new Error(`C1c selected family is historically observed: ${group.deviceFamily}`)
  if (sealed.has(group.deviceFamily)) throw new Error(`C1c selected family is sealed Batch C: ${group.deviceFamily}`)
  for (const member of members) {
    if (member.form !== C1C_FORM || member.deviceFamily !== group.deviceFamily || member.configurationSignature !== group.configurationSignature) throw new Error(`C1c member identity mismatch: ${member.concreteCurveIdentity}`)
    if (member.upstreamRawUrl !== rawUrl(member.path) || !member.upstreamRawUrl.includes(`/${UPSTREAM_COMMIT}/`)) throw new Error(`C1c member raw URL is not pinned: ${member.path}`)
    if (member.integrity?.status !== 'valid') throw new Error(`C1c member integrity is not valid: ${member.path}`)
    if (classifyRig(member.rig).rigClass !== member.rigClass) throw new Error(`C1c unsupported rig alias merge: ${member.rig}`)
  }
  for (const member of group.exact711Members) {
    if (member.rig !== C1A_PRIMARY_RIG || member.rigClass !== '711-class') throw new Error(`C1c non-exact member in 711 set: ${member.concreteCurveIdentity}`)
  }
  for (const member of group.eligibleNon711Members) {
    if (member.rig === C1A_PRIMARY_RIG || member.rigClass === '711-class') throw new Error(`C1c exact member in non-711 set: ${member.concreteCurveIdentity}`)
  }
  return true
}

/** Reacquire a member from its immutable raw URL and verify both hashes. */
export async function reacquireC1cPinnedMember(member, {
  fetchImpl = globalThis.fetch,
  cacheRoot,
  maxAttempts = C1C_MAX_NETWORK_ATTEMPTS,
  retryDelayMs = C1C_NETWORK_RETRY_DELAY_MS,
} = {}) {
  if (!member?.path || !member.upstreamRawUrl) throw new Error('C1c member lacks immutable raw provenance')
  if (member.form !== C1C_FORM || member.upstreamRawUrl !== rawUrl(member.path) || !member.upstreamRawUrl.includes(`/${UPSTREAM_COMMIT}/`)) throw new Error(`C1c member raw URL is not pinned: ${member.path}`)
  if (member.integrity?.status !== 'valid') throw new Error(`C1c member lacks valid corpus integrity: ${member.path}`)
  if (typeof fetchImpl !== 'function') throw new Error('C1c requires fetch')
  const targetCacheRoot = cacheRoot ?? resolve(MODULE_ROOT, C1C_CACHE_RELATIVE_DIR)
  const cacheKey = createHash('sha256').update(member.path).digest('hex')
  const cachePath = resolve(targetCacheRoot, cacheKey)
  const expectedSha256 = member.integrity.upstreamSha256 ?? member.upstreamSha256
  const expectedBlobSha = member.blobSha
  try {
    const cachedBytes = await readFile(cachePath)
    const provenance = verifyRawProvenance(cachedBytes, { expectedSha256, expectedBlobSha })
    return { member, bytes: cachedBytes, cachePath, acquisition: 'CACHE_VALIDATED', provenance }
  } catch {
    // A missing/stale cache is not evidence of an upstream failure.  Fetch a
    // fresh immutable object below; only a successful hash check is cached.
  }
  let lastError = null
  const attempts = Math.max(1, Number(maxAttempts) || C1C_MAX_NETWORK_ATTEMPTS)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response
    try {
      response = await fetchImpl(member.upstreamRawUrl, { redirect: 'error', headers: RAW_FETCH_HEADERS })
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(retryDelayMs * attempt)
      continue
    }
    const status = Number(response?.status)
    if (!response?.ok) {
      lastError = new Error(`upstream raw ${status || 'unknown'}: ${member.path}`)
      if (!isTransientStatus(status) || attempt >= attempts) break
      await sleep(retryDelayMs * attempt)
      continue
    }
    let bytes
    try {
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(retryDelayMs * attempt)
      continue
    }
    // A successful response with a wrong immutable identity is semantic
    // provenance failure, never transient network failure.
    const provenance = verifyRawProvenance(bytes, { expectedSha256, expectedBlobSha })
    await mkdir(targetCacheRoot, { recursive: true })
    await writeFile(cachePath, bytes)
    return { member, bytes, cachePath, acquisition: 'FETCHED_AND_VALIDATED', provenance }
  }
  throw new Error(`bounded C1c upstream acquisition failed for ${member.path} after ${attempts} attempts: ${lastError?.message ?? lastError}`)
}

function verifyPreparedIntegrity(member, originalPoints, prepared) {
  const integrity = member.integrity ?? {}
  const expected = [
    ['originalParsedPointsSha256', prepared.originalPointsSha256],
    ['canonicalParsedPointsSha256', prepared.canonicalPointsSha256],
    ['normalizedParsedPointsSha256', prepared.normalizedPointsSha256],
  ]
  for (const [name, actual] of expected) if (integrity[name] && integrity[name] !== actual) throw new Error(`C1c ${name} mismatch: ${member.path}`)
  assertArrayEqual(prepared.frequenciesHz, EXPECTED_V2_GRID, `C1c V2 grid for ${member.path}`)
  if (prepared.normalization?.mode !== C1C_NORMALIZATION.mode || prepared.normalization?.frequencyHz !== C1C_NORMALIZATION.frequencyHz || prepared.normalization?.levelDb !== C1C_NORMALIZATION.levelDb) throw new Error(`C1c normalization mismatch: ${member.path}`)
  if (prepared.smoothing !== false || prepared.peakAlignment !== false || prepared.method !== 'V2_PREPARED_NO_SMOOTHING_NO_ALIGNMENT') throw new Error(`C1c forbidden preparation transform: ${member.path}`)
  const closed = canonicalizeTerminalEndpoint(originalPoints)
  if (prepared.sourceCoverage?.canonicalTerminalFrequencyHz !== closed.points.at(-1)[0] || prepared.sourceCoverage?.canonicalTerminalDb !== closed.points.at(-1)[1]) throw new Error(`C1c terminal closure mismatch: ${member.path}`)
  if (prepared.frequenciesHz[0] !== C1C_V2_MIN_HZ || prepared.frequenciesHz.at(-1) !== C1C_V2_MAX_HZ) throw new Error(`C1c prepared curve coverage mismatch: ${member.path}`)
}

function compactAcquisition(acquired, prepared, repositoryRoot) {
  return {
    concreteCurveIdentity: acquired.member.concreteCurveIdentity,
    path: acquired.member.path,
    cacheKey: relative(repositoryRoot, acquired.cachePath),
    acquisition: acquired.acquisition,
    byteLength: acquired.provenance.byteLength,
    blobSha: acquired.provenance.blobSha,
    upstreamSha256: acquired.provenance.sha256,
    expectedBlobSha: acquired.member.blobSha,
    expectedUpstreamSha256: acquired.member.integrity?.upstreamSha256 ?? acquired.member.upstreamSha256,
    preparedCurveSha256: hashCurve(prepared),
    rawBytesCommitted: false,
  }
}

function compactMember(member, prepared, acquired, repositoryRoot) {
  const integrity = member.integrity ?? {}
  return {
    concreteCurveIdentity: member.concreteCurveIdentity,
    collection: member.collection,
    form: member.form,
    model: member.model,
    processedName: member.processedName,
    deviceFamily: member.deviceFamily,
    configurationSignature: member.configurationSignature,
    rig: member.rig,
    rigClass: member.rigClass,
    path: member.path,
    upstreamRawUrl: member.upstreamRawUrl,
    blobSha: member.blobSha,
    upstreamSha256: acquired.provenance.sha256,
    sourceRows: member.sourceRows,
    sourceUrls: member.sourceUrls,
    originalParsedPointsSha256: prepared.originalPointsSha256,
    canonicalParsedPointsSha256: prepared.canonicalPointsSha256,
    normalizedParsedPointsSha256: prepared.normalizedPointsSha256,
    preparedCurveSha256: hashCurve(prepared),
    preparation: {
      sourceCoverage: prepared.sourceCoverage,
      normalization: prepared.normalization,
      normalizationAnchorDb: prepared.normalizationAnchorDb,
      method: prepared.method,
      smoothing: prepared.smoothing,
      peakAlignment: prepared.peakAlignment,
    },
    integrity: { ...integrity, status: integrity.status },
    rawBytesCommitted: false,
    acquisition: compactAcquisition(acquired, prepared, repositoryRoot),
  }
}

function resolveFrozenWeights(model, rigClass) {
  const classProfile = model.profiles?.rigProfiles?.[rigClass]
  const selection = model.rigClassSelections?.[rigClass]
  const weightSet = model.weights?.byRigClass?.[rigClass] ?? model.weights?.globalFallback
  if (!weightSet) throw new Error(`C1c frozen model has no weights for rig class ${rigClass}`)
  const expectedSource = classProfile ? 'CLASS_SPECIFIC' : 'GLOBAL_FALLBACK'
  if (weightSet.source !== expectedSource || weightSet.fallback !== (expectedSource === 'GLOBAL_FALLBACK')) throw new Error(`C1c frozen model profile selection mismatch: ${rigClass}`)
  if (selection && (selection.source !== weightSet.source || selection.fallback !== weightSet.fallback)) throw new Error(`C1c frozen model selection mismatch: ${rigClass}`)
  const frequenciesHz = weightSet.frequenciesHz ?? weightSet.w_conf?.frequenciesHz
  const wConfidence = weightSet.w_conf?.valuesDb
  const wRepeatability = weightSet.w_repeatability?.valuesDb
  const wRig = weightSet.w_rig?.valuesDb
  assertArrayEqual(frequenciesHz, EXPECTED_V2_GRID, `C1c frozen weights grid for ${rigClass}`)
  if (!Array.isArray(wConfidence) || !Array.isArray(wRepeatability) || !Array.isArray(wRig)) throw new Error(`C1c frozen weight set is incomplete: ${rigClass}`)
  return {
    frequenciesHz: [...frequenciesHz],
    valuesDb: [...wConfidence],
    wConfidence: [...wConfidence],
    wRepeatability: [...wRepeatability],
    wRig: [...wRig],
    w_conf: weightSet.w_conf,
    w_repeatability: weightSet.w_repeatability,
    w_rig: weightSet.w_rig,
    source: weightSet.source,
    fallback: weightSet.fallback,
    rigClass,
    profileSelection: selection ?? {
      rigClass,
      source: 'GLOBAL_FALLBACK',
      fallback: true,
      reason: 'CLASS_NOT_PRESENT_IN_FROZEN_DEVELOPMENT_MODEL',
      distinctDevelopmentGroupCount: 0,
      developmentGroupIds: [],
      observationCount: 0,
      profileSha256: model.profiles.globalRig.profileSha256,
      globalProfileSha256: model.profiles.globalRig.profileSha256,
    },
    weightHashes: weightSet.weightHashes,
  }
}

function buildHoldoutGroupEvidence(group, preparedByIdentity, acquisitionsByIdentity, model, repositoryRoot) {
  const exactMembers = group.exact711Members.map((member) => ({ ...member, preparedCurve: preparedByIdentity.get(member.concreteCurveIdentity) }))
  const non711Members = group.eligibleNon711Members.map((member) => ({ ...member, preparedCurve: preparedByIdentity.get(member.concreteCurveIdentity) }))
  if ([...exactMembers, ...non711Members].some((member) => !member.preparedCurve)) throw new Error(`C1c prepared member missing: ${group.groupId}`)
  const consensus = pointwiseMedian(exactMembers.map((member) => member.preparedCurve))
  const sigma = calculateRepeatabilitySigma(exactMembers.map((member) => member.preparedCurve))
  const observations = non711Members.map((member) => {
    const disagreement = calculateCrossRigDisagreement(member.preparedCurve, consensus, {
      groupId: group.groupId,
      observationId: member.concreteCurveIdentity,
      deviceFamily: group.deviceFamily,
      rigClass: member.rigClass,
      memberIdentity: member.concreteCurveIdentity,
    })
    const weights = resolveFrozenWeights(model, member.rigClass)
    const metrics = evaluateTargetingObservation({ frequenciesHz: disagreement.frequenciesHz, deltaDb: disagreement.deltaDb }, weights)
    return {
      observationId: member.concreteCurveIdentity,
      memberIdentity: member.concreteCurveIdentity,
      deviceFamily: group.deviceFamily,
      collection: member.collection,
      form: member.form,
      rig: member.rig,
      rigClass: member.rigClass,
      provenance: compactMember(member, member.preparedCurve, acquisitionsByIdentity.get(member.concreteCurveIdentity), repositoryRoot),
      frequenciesHz: [...disagreement.frequenciesHz],
      deltaDb: [...disagreement.deltaDb],
      absoluteDeltaDb: [...disagreement.absoluteDeltaDb],
      observationSha256: hashObservation(disagreement),
      profileSelection: weights.profileSelection,
      weightHashes: weights.weightHashes,
      metrics,
    }
  })
  const gate = classifyGroupTargeting(observations.map((observation) => observation.metrics))
  const compactMembers = [...group.exact711Members, ...group.eligibleNon711Members].map((member) => compactMember(member, preparedByIdentity.get(member.concreteCurveIdentity), acquisitionsByIdentity.get(member.concreteCurveIdentity), repositoryRoot))
  return {
    schemaVersion: C1C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: C1C_GROUP_ARTIFACT_KIND,
    algorithmVersion: C1C_ALGORITHM_VERSION,
    groupId: group.groupId,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    split: 'holdout',
    memberCount: compactMembers.length,
    exact711MemberCount: exactMembers.length,
    non711ObservationCount: non711Members.length,
    members: compactMembers,
    acquisition: compactMembers.map((member) => member.acquisition),
    consensus: {
      method: consensus.method,
      frequenciesHz: [...consensus.frequenciesHz],
      valuesDb: [...consensus.valuesDb],
      hashSha256: hashCurve(consensus),
      sha256: hashCurve(consensus),
      smoothing: false,
      peakAlignment: false,
    },
    repeatabilitySigma: {
      method: sigma.method,
      scale: sigma.scale,
      frequenciesHz: [...sigma.frequenciesHz],
      valuesDb: [...sigma.valuesDb],
      hashSha256: hashCurve(sigma),
      sha256: hashCurve(sigma),
    },
    observations,
    classification: gate.classification,
    gate,
    criteria: {
      threshold: C1C_TARGETING_THRESHOLD,
      primaryBandHz: [...C1C_PRIMARY_BAND_HZ],
      strictMajority: 'informative wins > informative observations / 2',
      medianGain: 'median informative gain >= 0.05',
      informative: 'E_const > 0',
    },
    flags: {
      developmentGroupsAccepted: false,
      developmentDecisionInputAccepted: false,
      developmentRerunForHoldoutDecision: false,
      developmentExecuted: false,
      holdoutExecuted: true,
      outcomesGenerated: true,
      responseOutcomeObserved: true,
      confidenceCurveComputed: true,
      confidenceWeightingApplied: true,
      consensusAlgorithmExecuted: true,
      retrainingAllowed: false,
      retrainingAfterFreeze: false,
      freshRealBatchCExecuted: false,
      batchCExecuted: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      c4PeakAlignmentUsed: false,
      rawMeasurementsCommitted: false,
    },
  }
}

function groupSummary(groupEvidence) {
  const informative = groupEvidence.observations.filter((observation) => observation.metrics.informative)
  return {
    groupId: groupEvidence.groupId,
    deviceFamily: groupEvidence.deviceFamily,
    configurationSignature: groupEvidence.configurationSignature,
    memberCount: groupEvidence.memberCount,
    exact711MemberCount: groupEvidence.exact711MemberCount,
    non711ObservationCount: groupEvidence.non711ObservationCount,
    informativeObservationCount: groupEvidence.gate.informativeObservationCount,
    nonInformativeObservationCount: groupEvidence.gate.nonInformativeObservationCount ?? 0,
    winCount: groupEvidence.gate.winCount,
    lossCount: groupEvidence.gate.lossCount,
    medianTargetingGain: groupEvidence.gate.medianGain,
    medianRelativeTargetingGain: groupEvidence.gate.medianRelativeTargetingGain,
    classification: groupEvidence.classification,
    consensusSha256: groupEvidence.consensus.hashSha256,
    repeatabilitySigmaSha256: groupEvidence.repeatabilitySigma.hashSha256,
    observationIds: groupEvidence.observations.map((observation) => observation.observationId),
    targetingGains: informative.map((observation) => observation.metrics.gain),
  }
}

export function classifyHoldoutGate(groupResults) {
  if (!Array.isArray(groupResults) || groupResults.length !== C1C_REQUIRED_HOLDOUT_GROUPS) return INCONCLUSIVE
  const classifications = groupResults.map((result) => typeof result === 'string' ? result : result?.classification)
  const allowed = new Set([CONFIDENCE_TARGETING_SIGNAL, NO_CONFIDENCE_TARGETING_SIGNAL, INCONCLUSIVE])
  if (classifications.some((classification) => !allowed.has(classification) || classification === INCONCLUSIVE)) return INCONCLUSIVE
  return classifications.filter((classification) => classification === CONFIDENCE_TARGETING_SIGNAL).length >= C1C_MIN_SIGNAL_GROUPS
    ? CONFIDENCE_TARGETING_GENERALIZES
    : CONFIDENCE_TARGETING_NOT_CONFIRMED
}

export function buildHoldoutGate(groupResults) {
  const normalized = Array.isArray(groupResults) ? groupResults.map((result) => typeof result === 'string' ? { classification: result } : result) : []
  const classification = classifyHoldoutGate(normalized)
  return {
    classification,
    groupCount: normalized.length,
    signalGroupCount: normalized.filter((result) => result?.classification === CONFIDENCE_TARGETING_SIGNAL).length,
    noSignalGroupCount: normalized.filter((result) => result?.classification === NO_CONFIDENCE_TARGETING_SIGNAL).length,
    inconclusiveGroupCount: normalized.filter((result) => result?.classification === INCONCLUSIVE).length,
    requiredGroups: C1C_REQUIRED_HOLDOUT_GROUPS,
    minimumSignals: C1C_MIN_SIGNAL_GROUPS,
  }
}

export function buildCombinedC1Interpretation({ developmentClassification, holdoutClassification } = {}) {
  if (developmentClassification === INCONCLUSIVE || holdoutClassification === INCONCLUSIVE) return INCONCLUSIVE
  if (developmentClassification === 'CONFIDENCE_TARGETING_DEV_SUPPORTED' && holdoutClassification === CONFIDENCE_TARGETING_GENERALIZES) return 'C1_CONFIDENCE_MODEL_GENERALIZED'
  return 'C1_CLOSED_HOLDOUT_NOT_CONFIRMED'
}

function outcomeReport({ frozen, model, groupEvidence, gate, combinedInterpretation, evidenceFiles }) {
  const lines = [
    '# C1c confidence-targeting — holdout confirmation outcome',
    '',
    `- C1c protocol-freeze commit: \`${C1C_PROTOCOL_FREEZE_COMMIT}\``,
    `- C1c protocol SHA-256: \`${C1C_PROTOCOL_SHA256}\``,
    `- Repaired C1 V1.1 corpus commit: \`${C1C_CORPUS_COMMIT}\``,
    `- Repaired C1 V1.1 evidence SHA-256: \`${frozen.corpusEvidenceSha256}\``,
    `- Immutable C1b development model SHA-256: \`${model.modelSha256}\``,
    '- Model profiles were loaded from the serialized development model only; no holdout response entered model selection or retraining.',
    '- Raw bytes were reacquired from the pinned upstream commit and verified by Git blob SHA-1 and SHA-256; bytes remain only in the ignored cache.',
    '',
    '## Per-group holdout evidence',
    '',
  ]
  for (const group of groupEvidence) {
    const summary = groupSummary(group)
    lines.push(`### ${summary.groupId} — ${summary.deviceFamily}`)
    lines.push(`- Members: ${summary.memberCount}; exact-711: ${summary.exact711MemberCount}; non-711 observations: ${summary.non711ObservationCount}; informative: ${summary.informativeObservationCount}.`)
    lines.push(`- Wins/losses: ${summary.winCount}/${summary.lossCount}; median targeting gain: ${summary.medianTargetingGain ?? 'null'}.`)
    lines.push(`- 711 consensus SHA-256: \`${summary.consensusSha256}\`; repeatability sigma SHA-256: \`${summary.repeatabilitySigmaSha256}\`.`)
    lines.push(`- Classification: **${summary.classification}**.`)
    lines.push('')
  }
  lines.push('## Holdout gate', '')
  lines.push(`- Signal groups: ${gate.signalGroupCount}/${gate.requiredGroups}; required: ${gate.minimumSignals}; classification: **${gate.classification}**.`)
  lines.push('', '## Combined C1 interpretation', '')
  lines.push(`- **${combinedInterpretation}**.`)
  lines.push('', '## Frozen guardrails', '')
  lines.push('- Development groups were rejected from holdout decision-making; Fresh Real Corpus Batch C remained sealed and unexecuted.', '')
  lines.push('- No C4 peak alignment, smoothing, Huber, solver, structural search, C2/C3/C4 rerun, or production code ran.', '')
  lines.push(`- Evidence files: ${evidenceFiles.join(', ')}`)
  return `${lines.join('\n')}\n`
}

/**
 * Execute exactly the six frozen C1 V1.1 holdout groups.  This is the only
 * function in this module that reads response bytes; all profile values come
 * from the immutable model loaded before acquisition.
 */
export async function runHoldoutAfterProtocolFreeze({
  repositoryRoot = MODULE_ROOT,
  protocolFreezeCommit = C1C_PROTOCOL_FREEZE_COMMIT,
  currentCommit: suppliedCurrentCommit = null,
  protocolSha256 = C1C_PROTOCOL_SHA256,
  confidenceModelSha256 = C1C_CONFIDENCE_MODEL_SHA256,
  groupIds = C1C_HOLDOUT_GROUP_IDS,
  fetchImpl = globalThis.fetch,
  cacheRoot = resolve(repositoryRoot, C1C_CACHE_RELATIVE_DIR),
  outputDir = resolve(repositoryRoot, C1C_ARTIFACT_RELATIVE_DIR),
  maxAttempts = C1C_MAX_NETWORK_ATTEMPTS,
  retryDelayMs = C1C_NETWORK_RETRY_DELAY_MS,
} = {}) {
  const observedCommit = suppliedCurrentCommit ?? observedRepositoryCommit(repositoryRoot)
  if (protocolFreezeCommit !== C1C_PROTOCOL_FREEZE_COMMIT || observedCommit !== C1C_PROTOCOL_FREEZE_COMMIT) {
    throw new Error(`C1c holdout requires exact protocol-freeze commit ${C1C_PROTOCOL_FREEZE_COMMIT}; got protocol=${protocolFreezeCommit}, current=${observedCommit}`)
  }
  if (protocolSha256 !== C1C_PROTOCOL_SHA256) throw new Error('C1c protocol SHA-256 argument mismatch')
  validateHoldoutExecutionRequest({ holdoutGroupIds: groupIds, confidenceModelSha256 })
  if (typeof fetchImpl !== 'function') throw new Error('C1c holdout requires fetch')

  // Verify every pin and reject a second run before acquiring any bytes.
  const frozen = await verifyFrozenC1cProvenance({ repositoryRoot, artifactDir: outputDir })
  await assertNoPriorOutcome(outputDir)
  if (frozen.protocolSha256 !== C1C_PROTOCOL_SHA256) throw new Error('C1c protocol pin mismatch')
  if (frozen.model.modelSha256 !== C1C_CONFIDENCE_MODEL_SHA256) throw new Error('C1c confidence model pin mismatch')

  const allGroups = frozen.corpusGroups.groups ?? frozen.corpusGroups
  const holdoutGroups = C1C_HOLDOUT_GROUP_IDS.map((groupId) => allGroups.find((group) => group.groupId === groupId))
  if (holdoutGroups.some((group) => !group)) throw new Error('C1c repaired corpus is missing an approved holdout group')
  if (holdoutGroups.length !== C1C_REQUIRED_HOLDOUT_GROUPS) throw new Error('C1c holdout group count mismatch')
  const selectedFamilies = new Set()
  for (const group of holdoutGroups) {
    assertHoldoutGroupBoundary(group, frozen.exclusions)
    if (selectedFamilies.has(group.deviceFamily)) throw new Error(`C1c duplicate selected holdout family: ${group.deviceFamily}`)
    selectedFamilies.add(group.deviceFamily)
  }
  if (selectedFamilies.size !== C1C_REQUIRED_HOLDOUT_GROUPS) throw new Error('C1c holdout device-family independence failed')

  await mkdir(cacheRoot, { recursive: true })
  const preparedByIdentity = new Map()
  const acquisitionsByIdentity = new Map()
  for (const group of holdoutGroups) {
    for (const member of [...group.exact711Members, ...group.eligibleNon711Members]) {
      const acquired = await reacquireC1cPinnedMember(member, { fetchImpl, cacheRoot, maxAttempts, retryDelayMs })
      const originalPoints = parseCurveCsv(acquired.bytes.toString('utf8'))
      const prepared = prepareCurve(originalPoints, {
        concreteCurveIdentity: member.concreteCurveIdentity,
        collection: member.collection,
        path: member.path,
        rig: member.rig,
      })
      verifyPreparedIntegrity(member, originalPoints, prepared)
      preparedByIdentity.set(member.concreteCurveIdentity, prepared)
      acquisitionsByIdentity.set(member.concreteCurveIdentity, acquired)
    }
  }

  // Build all references and metrics only after the immutable model has been
  // validated.  No operation below can modify model profiles.
  const groupEvidence = holdoutGroups.map((group) => buildHoldoutGroupEvidence(group, preparedByIdentity, acquisitionsByIdentity, frozen.model, repositoryRoot))
  if (groupEvidence.length !== C1C_REQUIRED_HOLDOUT_GROUPS) throw new Error('C1c did not produce exactly six holdout group evidences')
  const gate = buildHoldoutGate(groupEvidence)
  const combinedInterpretation = buildCombinedC1Interpretation({
    developmentClassification: frozen.model.outcome?.developmentClassification,
    holdoutClassification: gate.classification,
  })
  const groupFiles = groupEvidence.map((group) => `group-${group.groupId}.json`)
  const evidenceFiles = [...C1C_OUTCOME_STATIC_EVIDENCE, 'aggregate-evidence.json', ...groupFiles, 'final-report.md'].sort()
  const summaries = groupEvidence.map(groupSummary)
  const aggregate = {
    schemaVersion: C1C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1c-confidence-targeting-holdout-aggregate-evidence',
    algorithmVersion: C1C_ALGORITHM_VERSION,
    protocolFreezeCommit: C1C_PROTOCOL_FREEZE_COMMIT,
    protocolSha256: C1C_PROTOCOL_SHA256,
    confidenceModelSha256: frozen.model.modelSha256,
    confidenceModelSerializedSha256: frozen.modelSerializedSha256,
    c1aV11: {
      corpusVersion: 'c1-cross-rig-confidence-corpus-v1.1',
      commit: C1C_CORPUS_COMMIT,
      evidenceSha256: frozen.corpusEvidenceSha256,
      classification: 'C1_CORPUS_V1_1_READY',
    },
    c1b: {
      protocolFreezeCommit: C1C_C1B_PROTOCOL_FREEZE_COMMIT,
      evidenceCommit: C1C_C1B_EVIDENCE_COMMIT,
      evidenceSha256: C1C_C1B_EVIDENCE_SHA256,
      developmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
      developmentClassification: frozen.model.outcome?.developmentClassification ?? INCONCLUSIVE,
    },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    frozenBoundary: FROZEN_BOUNDARY,
    holdoutGroupIds: [...C1C_HOLDOUT_GROUP_IDS],
    rejectedDevelopmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
    rejectedBatchCToken: C1C_BATCH_C_REJECTION_TOKEN,
    freshRealBatchCRejected: true,
    groupEvidenceFiles: groupFiles,
    groups: summaries,
    holdoutGroupEvidence: summaries,
    holdoutGate: gate,
    combinedInterpretation,
    modelSelection: {
      source: 'immutable development-trained confidence-model.json',
      modelSha256: frozen.model.modelSha256,
      holdoutUsed: false,
      retrainingAfterFreeze: false,
      developmentDecisionInputAccepted: false,
    },
    protocolConstants: {
      form: C1C_FORM,
      primaryRigLiteral: C1A_PRIMARY_RIG,
      normalization: { ...C1C_NORMALIZATION },
      v2MinHz: C1C_V2_MIN_HZ,
      v2MaxHz: C1C_V2_MAX_HZ,
      pointsPerOctave: C1C_V2_POINTS_PER_OCTAVE,
      targetScaleDb: C1C_TARGET_SCALE_DB,
      targetingThreshold: C1C_TARGETING_THRESHOLD,
      minimumClassTrainingGroups: C1C_MIN_CLASS_GROUPS,
      primaryBandHz: [...C1C_PRIMARY_BAND_HZ],
      noSmoothing: true,
      noPeakAlignment: true,
      c4Preprocessing: false,
    },
    flags: {
      developmentGroupsAccepted: false,
      developmentDecisionInputAccepted: false,
      developmentRerunForHoldoutDecision: false,
      holdoutExecuted: true,
      outcomesGenerated: true,
      responseOutcomeObserved: true,
      confidenceCurveComputed: true,
      confidenceWeightingApplied: true,
      consensusAlgorithmExecuted: true,
      retrainingAllowed: false,
      retrainingAfterFreeze: false,
      freshRealBatchCExecuted: false,
      batchCExecuted: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      c4PeakAlignmentUsed: false,
      rawMeasurementsCommitted: false,
    },
  }
  const report = outcomeReport({ frozen, model: frozen.model, groupEvidence, gate, combinedInterpretation, evidenceFiles })
  const outcomeManifest = {
    schemaVersion: C1C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: C1C_OUTCOME_ARTIFACT_KIND,
    algorithmVersion: C1C_ALGORITHM_VERSION,
    phase: 'holdout-outcome',
    milestone: 'C1c-confidence-targeting-holdout-confirmation',
    frozenBoundary: C1C_FROZEN_BOUNDARY,
    protocolFreezeCommit: C1C_PROTOCOL_FREEZE_COMMIT,
    protocolSha256: C1C_PROTOCOL_SHA256,
    protocolManifestSha256: C1C_PROTOCOL_SHA256,
    confidenceModelSha256: frozen.model.modelSha256,
    c1aV11: aggregate.c1aV11,
    c1b: aggregate.c1b,
    upstream: aggregate.upstream,
    holdoutGroupIds: [...C1C_HOLDOUT_GROUP_IDS],
    rejectedDevelopmentGroupIds: [...C1C_DEVELOPMENT_GROUP_IDS],
    rejectedBatchCToken: C1C_BATCH_C_REJECTION_TOKEN,
    holdoutGroupEvidence: summaries,
    groupEvidenceFiles: groupFiles,
    holdoutGate: gate,
    combinedInterpretation,
    evidenceFiles,
    evidenceSha256: null,
    flags: aggregate.flags,
    freshRealBatchCExecuted: false,
    retrainingAfterFreeze: false,
    autoEqSolverExecuted: false,
    c4PeakAlignmentUsed: false,
  }

  const payloads = new Map([
    ['aggregate-evidence.json', jsonText(aggregate)],
    ['schema.json', await readFile(resolve(outputDir, 'schema.json'))],
    ...groupEvidence.map((group) => [`group-${group.groupId}.json`, jsonText(group)]),
    ['final-report.md', report],
  ])
  // The outcome manifest carries the resulting evidence hash, so it is kept
  // outside its own framed hash input to avoid a self-referential digest.
  const evidenceSha256 = hashEvidenceFiles(payloads, evidenceFiles)
  outcomeManifest.evidenceSha256 = evidenceSha256
  const outcomeManifestText = jsonText(outcomeManifest)
  await mkdir(outputDir, { recursive: true })
  for (const [path, payload] of payloads) await writeFile(resolve(outputDir, path), payload)
  await writeFile(resolve(outputDir, C1C_OUTCOME_MANIFEST_FILENAME), outcomeManifestText)
  await writeFile(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`)
  const recomputedEvidenceSha256 = hashEvidenceFiles(outputDir, evidenceFiles)
  assertEqual(recomputedEvidenceSha256, evidenceSha256, 'C1c evidence SHA-256 recomputation')
  return {
    protocolFreezeCommit: C1C_PROTOCOL_FREEZE_COMMIT,
    protocolSha256: C1C_PROTOCOL_SHA256,
    confidenceModelSha256: frozen.model.modelSha256,
    evidenceSha256,
    holdoutGroupIds: [...C1C_HOLDOUT_GROUP_IDS],
    summaries,
    holdoutGate: gate,
    combinedInterpretation,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    holdoutExecuted: true,
    freshRealBatchCExecuted: false,
    autoEqSolverExecuted: false,
    outputDir,
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runHoldoutAfterProtocolFreeze()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
