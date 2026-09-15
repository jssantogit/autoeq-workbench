import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as C4b from '../c4-peak-aligned-consensus-dev/c4b.mjs'

export const C4A_CORPUS_COMMIT = '64f1fa7f8780cf14f87ce6427aaa71edbf686e2d'
export const C4A_EVIDENCE_SHA256 = '03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea'
export const C4B_PROTOCOL_COMMIT = '95d853db76bd456dd66a1b8a60a65039ca095b8b'
export const C4B_EVIDENCE_COMMIT = '01ec92e8c3276b6cb42360e114d71f2ce5bc0d8e'
export const C4B_EVIDENCE_SHA256 = 'c2232862df04d0e90fa86fe7805f2032d2722e381c7d6e08118fcb7c29028d04'
export const C4B_ALGORITHM_SOURCE_SHA256 = '61002d0552c3c8bdc8045355378a1dd40dbfe56845a790d0ccd6f3caef67a2ec'
export const C4C_FROZEN_BOUNDARY = C4B_EVIDENCE_COMMIT
export const C4C_ALGORITHM_VERSION = C4b.C4B_ALGORITHM_VERSION
export const C4C_PROTOCOL_SCHEMA_VERSION = 1
export const C4C_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c4-peak-aligned-consensus-holdout'
export const C4C_CACHE_RELATIVE_DIR = '.research-cache/c4-peak-aligned-consensus-holdout'
export const C4C_FORM = 'in-ear'
export const C4C_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const C4C_PEAK_SEARCH_BAND_HZ = Object.freeze([6000, 10_000])
export const C4C_ALIGNMENT_BAND_HZ = Object.freeze([6000, 14_000])
export const DEVELOPMENT_GROUP_IDS = Object.freeze([
  'c4g-95ca9d64e706e94c51e7',
  'c4g-9c1d23845eb5a1d7beef',
  'c4g-35f72baf0cca66570d01',
])
export const HOLDOUT_GROUP_IDS = Object.freeze([
  'c4g-c5a0b86e1ea4436ca9ce',
  'c4g-043aeb45a50adf964f89',
  'c4g-9f35923d2fa109244435',
])
export const HOLDOUT_GROUPS = Object.freeze([
  Object.freeze({ groupId: HOLDOUT_GROUP_IDS[0], deviceFamily: 'simgot audio em6l', memberCount: 9 }),
  Object.freeze({ groupId: HOLDOUT_GROUP_IDS[1], deviceFamily: 'simgot audio ew200', memberCount: 8 }),
  Object.freeze({ groupId: HOLDOUT_GROUP_IDS[2], deviceFamily: 'truthear x crinacle zero red', memberCount: 10 }),
])
export const C4C_EXPECTED_HOLDOUT_FOLDS = HOLDOUT_GROUPS.reduce((sum, group) => sum + group.memberCount, 0)
export const BATCH_C_REJECTION_TOKEN = 'fresh-real-corpus-v1.2:Batch C'

// C4c re-exports only the frozen C4b algorithm. No implementation is copied or
// modified here, so a source hash and function-level protocol identity can be
// checked before any holdout acquisition.
export const dominantPeakFrequency = C4b.dominantPeakFrequency
export const canonicalTrainingPeak = C4b.canonicalTrainingPeak
export const createPeakWarp = C4b.createPeakWarp
export const warpCurve = C4b.warpCurve
export const pointwiseMedian = C4b.pointwiseMedian
export const peakAlignedMedian = C4b.peakAlignedMedian
export const leaveOneOutMembers = C4b.leaveOneOutMembers
export const evaluateFold = C4b.evaluateFold
export const evaluateDevelopmentGroup = C4b.evaluateDevelopmentGroup
export const robustDispersion = C4b.robustDispersion
export const aggregateRobustDispersion = C4b.aggregateRobustDispersion
export const classifyGroupEvidence = C4b.classifyGroupEvidence
export const hashBytes = C4b.hashBytes
export const sha256 = C4b.sha256

function repositoryRootFromModule() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isBatchCIdentifier(value) {
  return /batch\s*c|batch-c|fresh[-_ ]real[-_ ]corpus/i.test(String(value))
}

export function hashEvidencePayloads(payloads) {
  const hash = createHash('sha256')
  const entries = payloads instanceof Map ? payloads : new Map(Object.entries(payloads))
  for (const relativePath of [...entries.keys()].sort()) {
    const bytes = entries.get(relativePath)
    if (bytes === undefined) throw new Error(`evidence: missing ${relativePath}`)
    hash.update(`${relativePath}\n`)
    hash.update(bytes)
    hash.update('\n')
  }
  return hash.digest('hex')
}

export function assertHoldoutGroupId(groupId) {
  if (HOLDOUT_GROUP_IDS.includes(groupId)) return true
  if (DEVELOPMENT_GROUP_IDS.includes(groupId)) throw new Error(`development group ${groupId} is rejected from C4c holdout decision-making`)
  if (isBatchCIdentifier(groupId)) throw new Error('Fresh Real Corpus Batch C is sealed and rejected from C4c')
  throw new Error(`group ${groupId} is not an approved C4c holdout group`)
}

export const assertC4cHoldoutGroup = assertHoldoutGroupId

export function assertNoDevelopmentOrBatchC(groupIds) {
  if (!Array.isArray(groupIds)) throw new Error('C4c group IDs must be an array')
  for (const groupId of groupIds) assertHoldoutGroupId(groupId)
  return true
}

export function classifyHoldoutGate(classifications) {
  if (!Array.isArray(classifications) || classifications.length !== 3) return 'INCONCLUSIVE'
  const allowed = new Set(['PEAK_ALIGNMENT_SIGNAL', 'NO_PEAK_ALIGNMENT_SIGNAL', 'INCONCLUSIVE'])
  if (classifications.some((classification) => !allowed.has(classification) || classification === 'INCONCLUSIVE')) return 'INCONCLUSIVE'
  const signals = classifications.filter((classification) => classification === 'PEAK_ALIGNMENT_SIGNAL').length
  return signals >= 2 ? 'PEAK_ALIGNMENT_GENERALIZES' : 'PEAK_ALIGNMENT_NOT_CONFIRMED'
}

export function buildHoldoutGate(groups) {
  if (!Array.isArray(groups) || groups.length !== 3) return { classification: 'INCONCLUSIVE', signalGroupCount: 0, groupCount: groups?.length ?? 0 }
  const classifications = groups.map((group) => group.classification)
  return {
    classification: classifyHoldoutGate(classifications),
    signalGroupCount: classifications.filter((classification) => classification === 'PEAK_ALIGNMENT_SIGNAL').length,
    groupCount: groups.length,
  }
}

export const decideHoldoutGate = buildHoldoutGate

export function buildCombinedC4Interpretation({ developmentClassification, holdoutClassification } = {}) {
  if (developmentClassification === 'INCONCLUSIVE' || holdoutClassification === 'INCONCLUSIVE') return 'INCONCLUSIVE'
  if (developmentClassification === 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED' && holdoutClassification === 'PEAK_ALIGNMENT_GENERALIZES') {
    return 'C4_PEAK_ALIGNMENT_GENERALIZED'
  }
  return 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED'
}

export const classifyCombinedC4 = buildCombinedC4Interpretation

export function c1HandoffDescription(combinedInterpretation) {
  if (combinedInterpretation !== 'C4_PEAK_ALIGNMENT_GENERALIZED') return null
  return {
    purpose: 'future C1 repeatability/uncertainty estimation in 6–14 kHz',
    rawPointwiseDispersion: 'retain as amplitude-plus-horizontal variation',
    peakAlignedDispersion: 'estimate amplitude/shape disagreement after the frozen dominant-peak nuisance removal',
    rawPeakPositionDispersion: 'retain separately as horizontal uncertainty',
    confidenceWeightFunction: null,
    lambdaU: null,
    executesC1: false,
  }
}

/**
 * Verify the immutable C4b development evidence and implementation before a
 * C4c runner is allowed to acquire any holdout bytes.
 */
export async function verifyFrozenC4bProvenance({ repositoryRoot = repositoryRootFromModule(), artifactDir } = {}) {
  const sourcePath = resolve(repositoryRoot, 'research/c4-peak-aligned-consensus-dev/c4b.mjs')
  const sourceBytes = await readFile(sourcePath)
  const algorithmSourceSha256 = hashBytes(sourceBytes)
  if (algorithmSourceSha256 !== C4B_ALGORITHM_SOURCE_SHA256) throw new Error('C4b algorithm source hash mismatch')
  if (C4C_ALGORITHM_VERSION !== C4b.C4B_ALGORITHM_VERSION) throw new Error('C4b algorithm version mismatch')
  try {
    execFileSync('git', ['cat-file', '-e', `${C4B_PROTOCOL_COMMIT}^{commit}`], { cwd: repositoryRoot, stdio: 'ignore' })
    execFileSync('git', ['cat-file', '-e', `${C4B_EVIDENCE_COMMIT}^{commit}`], { cwd: repositoryRoot, stdio: 'ignore' })
  } catch {
    throw new Error('C4b protocol/evidence commit is unavailable in the repository')
  }
  const root = artifactDir ?? resolve(repositoryRoot, '.research-artifacts/c4-peak-aligned-consensus-dev')
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
  const aggregate = JSON.parse(await readFile(resolve(root, 'aggregate-evidence.json'), 'utf8'))
  const expectedFiles = manifest.evidenceFiles
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) throw new Error('C4b evidence file list is missing')
  const payloads = new Map()
  for (const relativePath of expectedFiles) payloads.set(relativePath, await readFile(resolve(root, relativePath)))
  const evidenceSha256 = hashEvidencePayloads(payloads)
  const recordedEvidenceSha256 = (await readFile(resolve(root, 'evidence-sha256.txt'), 'utf8')).trim()
  if (evidenceSha256 !== C4B_EVIDENCE_SHA256 || recordedEvidenceSha256 !== C4B_EVIDENCE_SHA256) throw new Error('C4b evidence SHA-256 mismatch')
  if (manifest.protocolFreezeCommit !== C4B_PROTOCOL_COMMIT) throw new Error('C4b protocol-freeze commit mismatch')
  if (manifest.outcomeClassification !== 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED') throw new Error('C4b development classification mismatch')
  if (manifest.algorithmVersion !== C4C_ALGORITHM_VERSION || aggregate.algorithmVersion !== C4C_ALGORITHM_VERSION) throw new Error('C4b algorithm version evidence mismatch')
  if (manifest.c4aEvidenceSha256 !== C4A_EVIDENCE_SHA256 || aggregate.c4aEvidenceSha256 !== C4A_EVIDENCE_SHA256) throw new Error('C4a evidence reference mismatch')
  if (JSON.stringify(manifest.developmentGroupIds) !== JSON.stringify(DEVELOPMENT_GROUP_IDS)) throw new Error('C4b development group identity mismatch')
  if (manifest.holdoutExecuted || manifest.batchCExecuted || manifest.freshRealCorpusBatchCExecuted || manifest.autoEqSolverExecuted) throw new Error('C4b contains forbidden holdout, Batch C, or solver execution')
  return { manifest, aggregate, algorithmSourceSha256, evidenceSha256, artifactDir: root }
}

export function createOutcomeArtifactSchema() {
  return {
    schemaVersion: C4C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c4c-holdout-confirmation-outcome-schema',
    outcomeValuesAllowed: false,
    requiredTopLevel: ['schemaVersion', 'algorithmVersion', 'protocolFreezeCommit', 'holdoutGroupEvidence', 'holdoutGate', 'combinedInterpretation', 'flags', 'evidenceSha256'],
    holdoutGroupEvidence: {
      required: ['groupId', 'deviceFamily', 'memberCount', 'members', 'folds', 'dispersion', 'classification'],
      memberProvenanceRequired: ['concreteCurveIdentity', 'collection', 'form', 'rig', 'rigClass', 'path', 'upstreamRawUrl', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256'],
      foldRequired: ['withheldMemberIdentity', 'trainingMemberIdentities', 'canonicalPeakFrequencyHz', 'individualPeakFrequenciesHz', 'warpAnchors', 'pointwise', 'aligned', 'peakAlignmentFoldWin', 'peakShiftDiagnostics', 'dispersion'],
      metricFields: ['registeredTrebleMAE', 'registeredTrebleRMSE', 'registeredTrebleMaxAbs', 'rawTrebleMAE', 'rawTrebleRMSE', 'candidateDominantPeakFrequencyHz', 'withheldDominantPeakFrequencyHz', 'rawPeakFrequencyErrorOctaves', 'candidatePeakDb', 'withheldPeakDb', 'absolutePeakLevelErrorAfterRegistration'],
    },
    holdoutGate: {
      allowed: ['PEAK_ALIGNMENT_GENERALIZES', 'PEAK_ALIGNMENT_NOT_CONFIRMED', 'INCONCLUSIVE'],
      minimumSignalGroups: 2,
      totalGroups: 3,
    },
    combinedInterpretation: ['C4_PEAK_ALIGNMENT_GENERALIZED', 'C4_CLOSED_HOLDOUT_NOT_CONFIRMED', 'INCONCLUSIVE'],
    flags: {
      developmentRerunForDecision: false,
      holdoutExecuted: false,
      freshRealCorpusBatchCExecuted: false,
      autoEqSolverExecuted: false,
    },
  }
}

export function createProtocolManifest({ protocolFreezeCommit = null } = {}) {
  return {
    schemaVersion: C4C_PROTOCOL_SCHEMA_VERSION,
    algorithmVersion: C4C_ALGORITHM_VERSION,
    phase: 'protocol-freeze',
    milestone: 'C4c-holdout-protocol-only',
    frozenBoundary: C4C_FROZEN_BOUNDARY,
    c4a: { corpusCommit: C4A_CORPUS_COMMIT, evidenceSha256: C4A_EVIDENCE_SHA256, classification: 'C4_CORPUS_READY' },
    c4b: {
      protocolFreezeCommit: C4B_PROTOCOL_COMMIT,
      evidenceCommit: C4B_EVIDENCE_COMMIT,
      evidenceSha256: C4B_EVIDENCE_SHA256,
      algorithmVersion: C4C_ALGORITHM_VERSION,
      algorithmSourceSha256: C4B_ALGORITHM_SOURCE_SHA256,
      developmentClassification: 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED',
      developmentCoverage: '2/3',
    },
    upstream: {
      repository: C4b.UPSTREAM_REPOSITORY,
      commit: C4b.UPSTREAM_COMMIT,
      tree: C4b.UPSTREAM_TREE,
      rawPolicy: 'immutable raw URLs only; ignored cache; no raw bytes committed',
    },
    domain: {
      form: C4C_FORM,
      v2MinHz: C4b.C4B_V2_MIN_HZ,
      v2MaxHz: C4b.C4B_V2_MAX_HZ,
      pointsPerOctave: C4b.C4B_V2_POINTS_PER_OCTAVE,
      normalization: { ...C4C_NORMALIZATION },
      terminalClosure: 'terminal-flat-hold-to-v2-max',
    },
    frozenAlgorithm: {
      peakSearchHz: [...C4C_PEAK_SEARCH_BAND_HZ],
      alignmentEvaluationHz: [...C4C_ALIGNMENT_BAND_HZ],
      dominantPeakRule: 'maximum-normalized-db-ties-lower-frequency',
      canonicalPeak: 'median-log2-frequency-even-central-arithmetic-mean',
      warp: 'three-anchor-log2-identity-outside-band',
      baseline: 'POINTWISE_MEDIAN',
      candidate: 'PEAK_ALIGNED_MEDIAN',
      evaluationRegistration: 'candidate-separately-to-withheld-frame-no-scan',
      robustSigma: '1.4826*median_i(abs(x_i-median_j(x_j)))',
      groupGate: 'reuse-C4b-exactly',
    },
    holdoutGroups: HOLDOUT_GROUPS.map((group) => ({ ...group })),
    holdoutGroupIds: [...HOLDOUT_GROUP_IDS],
    holdoutCoverage: {
      groupCount: HOLDOUT_GROUP_IDS.length,
      memberCount: C4C_EXPECTED_HOLDOUT_FOLDS,
      expectedFoldCount: C4C_EXPECTED_HOLDOUT_FOLDS,
      protocol: 'leave-one-measurement-out',
    },
    holdoutGate: {
      requiredGroups: HOLDOUT_GROUP_IDS.length,
      minimumSignalGroups: 2,
      signalClassification: 'PEAK_ALIGNMENT_SIGNAL',
      pass: 'PEAK_ALIGNMENT_GENERALIZES',
      validFailure: 'PEAK_ALIGNMENT_NOT_CONFIRMED',
      invalid: 'INCONCLUSIVE',
    },
    rejectedDevelopmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    rejectedBatchCToken: BATCH_C_REJECTION_TOKEN,
    protocolFreezeCommit,
    developmentRerunForDecision: false,
    holdoutExecuted: false,
    freshRealCorpusBatchCExecuted: false,
    autoEqSolverExecuted: false,
    confidenceWeightingExecuted: false,
    outcomesGenerated: false,
    rawMeasurementsCommitted: false,
    artifactSchema: 'schema.json',
    protocolPath: 'research/c4-peak-aligned-consensus-holdout/protocol.md',
  }
}

export const createProtocolArtifact = createProtocolManifest

export async function writeProtocolArtifacts({ repositoryRoot = repositoryRootFromModule(), outputDir, protocolFreezeCommit } = {}) {
  const target = outputDir ?? resolve(repositoryRoot, C4C_ARTIFACT_RELATIVE_DIR)
  await mkdir(target, { recursive: true })
  const manifest = createProtocolManifest({ protocolFreezeCommit: protocolFreezeCommit ?? null })
  const schema = createOutcomeArtifactSchema()
  await writeFile(resolve(target, 'manifest.json'), jsonText(manifest), 'utf8')
  await writeFile(resolve(target, 'schema.json'), jsonText(schema), 'utf8')
  await writeFile(resolve(target, 'protocol-sha256.txt'), `${hashEvidencePayloads(new Map([['manifest.json', jsonText(manifest)], ['schema.json', jsonText(schema)]]))}\n`, 'utf8')
  return { outputDir: target, manifest }
}

/** C4c Phase 1 runner: it never acquires or evaluates holdout responses. */
export async function runC4c(options = {}) {
  if (options.executeHoldout === true || options.groupIds) {
    throw new Error('C4c holdout execution requires the post-freeze Phase 2 handoff')
  }
  if (options.writeArtifacts === true) return writeProtocolArtifacts(options)
  return createProtocolManifest()
}

export async function runHoldoutAfterProtocolFreeze({ protocolFreezeCommit, currentCommit, groupIds } = {}) {
  if (groupIds) assertNoDevelopmentOrBatchC(groupIds)
  if (!protocolFreezeCommit || !currentCommit || protocolFreezeCommit !== currentCommit) throw new Error('C4c holdout execution requires the exact protocol-freeze commit')
  throw new Error('C4c holdout execution is unavailable during protocol-freeze Phase 1')
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC4c({ writeArtifacts: process.argv.includes('--write-artifacts') })
    .then((result) => process.stdout.write(jsonText(result)))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
