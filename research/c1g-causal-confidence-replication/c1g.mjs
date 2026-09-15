import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'

/**
 * C1g is intentionally a research harness.  It does not alter the core
 * package, and it does not import the solver until after the one-shot primary
 * execution rights have been acquired.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const C1G_C1H_PROTOCOL_COMMIT = '723307d5ba5db3afd6ade3489cbed2bd8b25058b'
export const C1G_C1H_EVIDENCE_COMMIT = 'b2d13ba799067738dee523b22e8930e97e71c5b4'
export const C1G_C1H_EVIDENCE_INDEX_SHA256 = '73e5ae8f9bd11ecb63d5b0da7d273655bc023da15d6674a765b125915bcb66c7'
export const C1G_MATERIALIZED_CORPUS_SHA256 = 'db81c5c329128eef6769fa7da210e5580c2eb6bf5c4bc690c2f1104e9b8092d4'
export const C1G_C1F_HASH_INDEX_SHA256 = '36cc16692dd7a0cc6e45c3c138e4ed2a481ab6c5293aca0a712098f6ecb3f7b7'
export const C1G_C1F_CLASSIFICATION = 'C1F_CORPUS_READY'
export const C1G_C1H_CLASSIFICATION = 'C1H_CORPUS_SELF_CONTAINED'
export const C1G_UPSTREAM_REPOSITORY = 'jaakkopasanen/AutoEq'
export const C1G_UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const C1G_UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const C1G_MODEL_SHA256 = '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'
export const C1G_STANDARD_V2_IDENTITY = '7c9ebbbe6eefeb131c6c698055c737b429f5b0c6'
export const C1G_HISTORICAL_PRODUCT_BOUNDARY = '31cc11982ebd07e009788d5e2c5c3537e9e6b615'

export const C1G_C1H_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1h-self-contained-corpus'
export const C1G_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1g-causal-confidence-replication'
export const C1G_MODEL_RELATIVE_PATH = '.research-artifacts/c1-confidence-targeting-dev/confidence-model.json'
export const C1G_CACHE_RELATIVE_DIR = '.research-cache'
export const C1G_BATCH_C_RELATIVE_PATH = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'

export const C1G_PRIMARY_GROUP_IDS = Object.freeze([
  'c1g-251bf90cf23f557cb011',
  'c1g-c45cb51de5231139b2f2',
  'c1g-e9b56c7e332c693b6f82',
  'c1g-41b1767dc01a935198bf',
  'c1g-ba1d3af16db7a116d755',
  'c1g-1be44ee4bdbd73cbf632',
])
export const C1G_SECONDARY_GROUP_IDS = Object.freeze([
  'c1g-6cf5995d049cff49d672',
  'c1g-ccc7fd5250bd1714c73e',
  'c1g-2fd95af2a97278cf88ef',
  'c1g-256c26e3bb37c97b890a',
  'c1g-6398ddcd56119d32eb70',
  'c1g-3b112b59456722f8dabe',
])
export const C1G_SELECTED_GROUP_IDS = Object.freeze([
  ...C1G_PRIMARY_GROUP_IDS,
  ...C1G_SECONDARY_GROUP_IDS,
])
export const C1G_PRIMARY_CURVE_COUNT = 31
export const C1G_PRIMARY_EXACT711_COUNT = 24
export const C1G_PRIMARY_NON711_COUNT = 7
export const C1G_PRIMARY_BAND_HZ = Object.freeze([4_000, 14_000])
export const C1G_TARGETING_THRESHOLD = 0.05
export const C1G_EQUAL_AUTHORITY_TOLERANCE = 1e-12
export const C1G_NORMALIZATION = Object.freeze({ mode: 'hz', frequencyHz: 500, levelDb: 60 })
export const C1G_SAMPLE_RATE_HZ = 48_000
export const C1G_POINTS_PER_OCTAVE = 96
export const C1G_EXECUTION_LOCK_FILENAME = 'primary-execution.lock'
export const C1G_EXECUTION_ATTEMPT_FILENAME = 'primary-execution-attempt.json'
export const C1G_EXECUTION_STATE_FILENAME = 'execution-state.json'
export const C1G_EXECUTION_STATE_PRE_OUTCOME = 'PRE_OUTCOME'
export const C1G_EXECUTION_STATE_PRIMARY_STARTED = 'PRIMARY_STARTED'
export const C1G_EXECUTION_STATE_PRIMARY_COMPLETE = 'PRIMARY_COMPLETE'
export const C1G_EXECUTION_STATE_INVALIDATED = 'INVALIDATED'

// This is the complete C1d-compatible resolved Standard V2 setting.  It is
// copied as a frozen research constant; resolving it never changes core.
export const C1G_SOLVER_SETTINGS = Object.freeze({
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  minGainDb: -15,
  maxGainDb: 15,
  minQ: 0.1,
  maxQ: 12,
  maxFilters: 10,
  timeLimitSeconds: 60,
})
export const C1G_RESOLVED_SOLVER_CONFIG = Object.freeze({
  algorithmVersion: 'standard-v2',
  sampleRateHz: C1G_SAMPLE_RATE_HZ,
  fitPointsPerOctave: C1G_POINTS_PER_OCTAVE,
  shelfQ: 0.7,
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  minGainDb: -15,
  maxGainDb: 15,
  minPkQ: 0.1,
  maxPkQ: 12,
  maxFilters: 10,
  workingMaxFilters: 15,
  algorithm: Object.freeze({
    targetRmseDb: 0.25,
    targetMaxAbsDb: 0.75,
    candidateResidualFloorDb: 0.15,
    pkQScaleMultipliers: Object.freeze([0.5, 1, 2]),
    maxExactCandidatesPerIteration: 8,
    maxActiveSearchPaths: 3,
    alternateRetentionRatio: 1.02,
    maxJointRefinementCycles: 6,
  }),
})

const PRIMARY_ARM_ORDER = Object.freeze([
  'FROZEN_BASELINE',
  'CONSTANT_AUTHORITY_CONTROL',
  'CONFIDENCE_SHAPED',
])
const NINE_DIAGNOSTIC_BANDS = Object.freeze([
  Object.freeze([20, 500]),
  Object.freeze([500, 1_000]),
  Object.freeze([1_000, 2_000]),
  Object.freeze([2_000, 4_000]),
  Object.freeze([4_000, 6_000]),
  Object.freeze([6_000, 8_000]),
  Object.freeze([8_000, 10_000]),
  Object.freeze([10_000, 14_000]),
  Object.freeze([14_000, 20_000]),
])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')
}

export function hashJson(value) {
  return sha256(stableJson(value))
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && JSON.stringify(left) === JSON.stringify(right)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function finiteArray(values, label) {
  assert(Array.isArray(values), `${label} must be an array`)
  assert(values.every((value) => Number.isFinite(value)), `${label} contains non-finite values`)
}

function mean(values) {
  assert(values.length > 0, 'mean requires at least one value')
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  assert(values.length > 0, 'median requires at least one value')
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
}

function rms(values) {
  return Math.sqrt(mean(values.map((value) => value * value)))
}

function isWithin(path, root) {
  const absolute = resolve(path)
  const base = resolve(root)
  return absolute === base || absolute.startsWith(`${base}${sep}`)
}

export function assertBatchCPath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (
    normalized === C1G_BATCH_C_RELATIVE_PATH ||
    normalized.includes('/fresh-real-corpus-v1-metadata-repair/') ||
    normalized.includes('fresh-real-corpus-v1.2:Batch C') ||
    /batch[-_ ]?c/i.test(normalized)
  ) {
    throw new Error(`Batch C is sealed: ${normalized}`)
  }
  return true
}

export function assertCachePath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (normalized.includes('.research-cache')) throw new Error(`offline C1g forbids cache access: ${normalized}`)
  return true
}

export function assertNetworkPath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (/^(?:https?|git\+ssh):\/\//i.test(normalized) || /github\.com|raw\.githubusercontent\.com|squiglink/i.test(normalized)) {
    throw new Error(`offline C1g forbids network access: ${normalized}`)
  }
  return true
}

export function assertResearchWritePath(path) {
  const absolute = resolve(ROOT, String(path))
  assertBatchCPath(path)
  assertCachePath(path)
  if (!isWithin(absolute, resolve(ROOT, 'research/c1g-causal-confidence-replication')) && !isWithin(absolute, resolve(ROOT, C1G_ARTIFACT_RELATIVE_DIR))) {
    throw new Error(`C1g write outside research scope: ${path}`)
  }
  if (/\.csv$/i.test(String(path)) || /(?:^|\/)raw(?:\/|[-_])/i.test(String(path))) {
    throw new Error(`raw upstream response cannot be written by C1g: ${path}`)
  }
  return absolute
}

export function assertC1hArtifactPath(path) {
  assertBatchCPath(path)
  assertCachePath(path)
  assertNetworkPath(path)
  const absolute = resolve(ROOT, String(path))
  if (!isWithin(absolute, resolve(ROOT, C1G_C1H_ARTIFACT_RELATIVE_DIR))) {
    throw new Error(`C1g input must be a committed C1h artifact: ${path}`)
  }
  return absolute
}

function c1hPath(name) {
  const relativePath = `${C1G_C1H_ARTIFACT_RELATIVE_DIR}/${name}`
  return assertC1hArtifactPath(relativePath)
}

function campaignPath(name) {
  return assertResearchWritePath(`${C1G_ARTIFACT_RELATIVE_DIR}/${name}`)
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readC1hArtifact(name, artifactRoot = resolve(ROOT, C1G_C1H_ARTIFACT_RELATIVE_DIR)) {
  const root = resolve(artifactRoot)
  const expectedRoot = resolve(ROOT, C1G_C1H_ARTIFACT_RELATIVE_DIR)
  if (root === expectedRoot) assertC1hArtifactPath(`${C1G_C1H_ARTIFACT_RELATIVE_DIR}/${name}`)
  else {
    assertBatchCPath(name)
    assertCachePath(name)
    assertNetworkPath(name)
  }
  return readFile(join(root, name))
}

function parseHashIndex(indexText) {
  const lines = String(indexText).trimEnd().split('\n')
  assert(lines.shift() === 'artifact-hash-index-v1', 'C1h evidence hash-index marker mismatch')
  return lines.map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/)
    assert(match, `malformed C1h evidence hash-index line: ${line}`)
    return { hash: match[1], name: match[2] }
  })
}

/** Verify C1h's completed, self-excluding artifact hash index. */
export async function verifyC1hEvidenceIndex({
  repoRoot = ROOT,
  artifactRoot = resolve(repoRoot, C1G_C1H_ARTIFACT_RELATIVE_DIR),
  indexSha256 = C1G_C1H_EVIDENCE_INDEX_SHA256,
} = {}) {
  const root = resolve(artifactRoot)
  const indexText = await readC1hArtifact('evidence-sha256.txt', root)
  const actualIndexSha256 = sha256(indexText)
  if (indexSha256 && actualIndexSha256 !== indexSha256) {
    throw new Error(`C1h evidence index SHA-256 mismatch: ${actualIndexSha256}`)
  }
  const entries = parseHashIndex(indexText)
  assert(!entries.some((entry) => entry.name === 'evidence-sha256.txt'), 'C1h hash index must exclude itself')
  for (const entry of entries) {
    assertBatchCPath(entry.name)
    assertCachePath(entry.name)
    const bytes = await readC1hArtifact(entry.name, root)
    const actual = sha256(bytes)
    if (actual !== entry.hash) throw new Error(`C1h evidence artifact hash mismatch: ${entry.name}`)
  }
  return { indexSha256: actualIndexSha256, entries }
}

function expectedCurveHashInput(curve) {
  return {
    concreteCurveIdentity: curve.concreteCurveIdentity,
    groupId: curve.groupId,
    collection: curve.collection,
    path: curve.path,
    rig: curve.rig,
    rigClass: curve.rigClass,
    blobSha: curve.blobSha,
    upstreamSha256: curve.upstreamSha256,
    originalParsedPointsSha256: curve.originalParsedPointsSha256,
    canonicalParsedPointsSha256: curve.canonicalParsedPointsSha256,
    normalizedParsedPointsSha256: curve.normalizedParsedPointsSha256,
    endpointTransformation: curve.endpointTransformation ?? null,
    normalization: curve.normalization,
    parserCanonicalizerVersion: curve.parserCanonicalizerVersion,
    frequencyHz: curve.frequencyHz,
    normalizedDb: curve.normalizedDb,
  }
}

function curveHash(curve) {
  return sha256(stableJson(expectedCurveHashInput(curve)))
}

function verifyMaterializedCurve(curve) {
  assert(curve && typeof curve === 'object', 'materialized curve is required')
  assert(Array.isArray(curve.frequencyHz) && Array.isArray(curve.normalizedDb), `materialized arrays missing: ${curve?.concreteCurveIdentity ?? 'unknown'}`)
  assert(curve.frequencyHz.length === curve.normalizedDb.length && curve.frequencyHz.length >= 2, `materialized point count mismatch: ${curve.concreteCurveIdentity}`)
  finiteArray(curve.frequencyHz, `frequencies for ${curve.concreteCurveIdentity}`)
  finiteArray(curve.normalizedDb, `amplitudes for ${curve.concreteCurveIdentity}`)
  for (let index = 1; index < curve.frequencyHz.length; index += 1) {
    assert(curve.frequencyHz[index - 1] < curve.frequencyHz[index], `frequency order invalid: ${curve.concreteCurveIdentity}`)
  }
  const points = curve.frequencyHz.map((frequency, index) => [frequency, curve.normalizedDb[index]])
  assert(sha256(JSON.stringify(points)) === curve.normalizedParsedPointsSha256, `normalized point hash mismatch: ${curve.concreteCurveIdentity}`)
  assert(curve.curveHash === curveHash(curve), `materialized curve hash mismatch: ${curve.concreteCurveIdentity}`)
  assert(curve.normalization?.mode === 'hz' && curve.normalization.frequencyHz === 500 && curve.normalization.levelDb === 60, `normalization mismatch: ${curve.concreteCurveIdentity}`)
  assert(curve.parserCanonicalizerVersion === 1, `parser/canonicalizer version mismatch: ${curve.concreteCurveIdentity}`)
  assert(curve.frequencyHz[0] === 20 && curve.frequencyHz.at(-1) === 20_000, `C1h coverage mismatch: ${curve.concreteCurveIdentity}`)
  return true
}

function groupHash(group) {
  return sha256(stableJson({ ...group, groupHash: undefined }))
}

function corpusHash(groups, primaryGroupIds, secondaryGroupIds, c1fEvidenceCommit, c1fHashIndexSha256) {
  const groupHashes = [...groups]
    .sort((left, right) => left.groupId.localeCompare(right.groupId))
    .map((group) => ({ groupId: group.groupId, groupHash: group.groupHash }))
  return sha256(stableJson({
    schemaVersion: 1,
    primaryGroupIds: [...primaryGroupIds].sort(),
    secondaryGroupIds: [...secondaryGroupIds].sort(),
    groupHashes,
    c1fEvidenceCommit,
    c1fHashIndex: c1fHashIndexSha256,
    upstreamCommit: C1G_UPSTREAM_COMMIT,
    upstreamTree: C1G_UPSTREAM_TREE,
    parserCanonicalizerVersion: 1,
  }))
}

function verifyPrimaryIdSet(ids, label = 'primary group IDs') {
  assert(Array.isArray(ids) && sameArray(ids, C1G_PRIMARY_GROUP_IDS), `${label} mismatch`)
  return true
}

function verifySecondaryIdSet(ids, label = 'secondary group IDs') {
  assert(Array.isArray(ids) && sameArray(ids, C1G_SECONDARY_GROUP_IDS), `${label} mismatch`)
  return true
}

/** Load only the committed C1h artifacts and verify their complete identity. */
export async function loadC1hCorpus({
  repoRoot = ROOT,
  artifactRoot = resolve(repoRoot, C1G_C1H_ARTIFACT_RELATIVE_DIR),
  expectedCorpusSha256 = C1G_MATERIALIZED_CORPUS_SHA256,
  expectedIndexSha256 = C1G_C1H_EVIDENCE_INDEX_SHA256,
  primaryGroupIds = C1G_PRIMARY_GROUP_IDS,
  secondaryGroupIds = C1G_SECONDARY_GROUP_IDS,
  groupIds,
  requireTracked = false,
} = {}) {
  const selectedIds = groupIds ?? C1G_SELECTED_GROUP_IDS
  if (groupIds !== undefined && !sameArray(selectedIds, C1G_SELECTED_GROUP_IDS)) {
    throw new Error('missing|required frozen selected group IDs')
  }
  assert(sameArray(primaryGroupIds, C1G_PRIMARY_GROUP_IDS), 'frozen C1g primary selection mismatch')
  assert(sameArray(secondaryGroupIds, C1G_SECONDARY_GROUP_IDS), 'frozen C1g secondary selection mismatch')
  assert(sameArray(selectedIds, C1G_SELECTED_GROUP_IDS), 'frozen C1h selected group set mismatch')

  const root = resolve(artifactRoot)
  const indexVerification = await verifyC1hEvidenceIndex({ repoRoot, artifactRoot: root, indexSha256: expectedIndexSha256 })
  const manifest = JSON.parse((await readC1hArtifact('manifest.json', root)).toString('utf8'))
  const index = JSON.parse((await readC1hArtifact('materialized-index.json', root)).toString('utf8'))
  const provenance = JSON.parse((await readC1hArtifact('provenance.json', root)).toString('utf8'))
  const schema = JSON.parse((await readC1hArtifact('schema.json', root)).toString('utf8'))

  assert(manifest.classification === C1G_C1H_CLASSIFICATION, `C1h classification mismatch: ${manifest.classification}`)
  assert(manifest.sourceC1fClassification === C1G_C1F_CLASSIFICATION, `C1f classification mismatch: ${manifest.sourceC1fClassification}`)
  assert(manifest.baseCommit === 'f93adaf41ac4dcf02897d5f390c911014a4fa536', 'C1h base commit mismatch')
  assert(manifest.c1f?.hashIndexSha256 === C1G_C1F_HASH_INDEX_SHA256, 'C1f hash-index linkage mismatch')
  assert(manifest.c1f?.evidenceCommit === 'f93adaf41ac4dcf02897d5f390c911014a4fa536', 'C1f evidence linkage mismatch')
  assert(manifest.upstream?.commit === C1G_UPSTREAM_COMMIT && manifest.upstream?.tree === C1G_UPSTREAM_TREE, 'frozen upstream linkage mismatch')
  assert(manifest.primaryCurveCount === C1G_PRIMARY_CURVE_COUNT, 'C1h primary curve count metadata mismatch')
  assert(manifest.solverExecuted === false && manifest.causalOutcomesGenerated === false, 'C1h scientific execution flags invalid')
  assert(manifest.confidenceMetricsComputed === false && manifest.disagreementMetricsComputed === false, 'C1h metric flags invalid')
  assert(manifest.batchCAccessAttempts === 0 && manifest.batchCAccessed === false && manifest.batchCExecuted === false, 'C1h Batch C flags invalid')
  assert(manifest.rawUpstreamBytesCommitted === false && manifest.normalizedResponsePointsCommitted === true, 'C1h raw/numeric materialization flags invalid')
  assert(schema.schemaVersion === 1, 'C1h schema version mismatch')
  assert(sameArray(index.primaryGroupIds, C1G_PRIMARY_GROUP_IDS), 'C1h index primary IDs mismatch')
  assert(sameArray(index.secondaryGroupIds, C1G_SECONDARY_GROUP_IDS), 'C1h index secondary IDs mismatch')
  assert(index.materializedCorpusSha256 === C1G_MATERIALIZED_CORPUS_SHA256, 'C1h index corpus SHA mismatch')
  assert(provenance.c1f?.hashIndexSha256 === C1G_C1F_HASH_INDEX_SHA256, 'C1h provenance C1f hash mismatch')
  assert(sameArray(manifest.primaryGroupIds, C1G_PRIMARY_GROUP_IDS), 'C1h manifest primary IDs mismatch')
  assert(sameArray(manifest.secondaryGroupIds, C1G_SECONDARY_GROUP_IDS), 'C1h manifest secondary IDs mismatch')

  const provenanceByKey = new Map((provenance.records ?? []).map((record) => [`${record.groupId}|${record.concreteCurveIdentity}`, record]))
  const indexById = new Map()
  const groups = []
  for (const entry of index.groups ?? []) {
    assert(!indexById.has(entry.groupId), `duplicate C1h index group: ${entry.groupId}`)
    assert(C1G_SELECTED_GROUP_IDS.includes(entry.groupId), `unexpected C1h selected group: ${entry.groupId}`)
    indexById.set(entry.groupId, entry)
    const group = JSON.parse((await readC1hArtifact(`group-${entry.groupId}.json`, root)).toString('utf8'))
    assert(group.groupId === entry.groupId && group.groupHash === entry.groupHash, `C1h group index mismatch: ${entry.groupId}`)
    const expectedRole = C1G_PRIMARY_GROUP_IDS.includes(entry.groupId) ? 'PRIMARY' : 'SECONDARY_RESERVE_UNEXECUTED'
    assert(group.role === expectedRole, `C1h group role mismatch: ${entry.groupId}`)
    assert(Array.isArray(group.members) && group.members.length === entry.memberCount, `C1h group member count mismatch: ${entry.groupId}`)
    for (const member of group.members) {
      assert(member.groupId === entry.groupId, `member group linkage mismatch: ${member.concreteCurveIdentity}`)
      verifyMaterializedCurve(member)
      const provenanceRecord = provenanceByKey.get(`${member.groupId}|${member.concreteCurveIdentity}`)
      assert(provenanceRecord, `C1h provenance record missing: ${member.concreteCurveIdentity}`)
      for (const key of ['collection', 'path', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256', 'endpointTransformation']) {
        assert((provenanceRecord[key] ?? null) === (member[key] ?? null), `C1h provenance mismatch ${key}: ${member.concreteCurveIdentity}`)
      }
      assert(stableJson(provenanceRecord.normalization) === stableJson(member.normalization), `C1h normalization provenance mismatch: ${member.concreteCurveIdentity}`)
    }
    assert(groupHash(group) === entry.groupHash, `C1h group hash mismatch: ${entry.groupId}`)
    groups.push(group)
  }
  assert(groups.length === 12 && indexById.size === 12, 'C1h selected group count mismatch')
  verifyPrimaryIdSet(groups.filter((group) => group.role === 'PRIMARY').map((group) => group.groupId).sort((left, right) => C1G_PRIMARY_GROUP_IDS.indexOf(left) - C1G_PRIMARY_GROUP_IDS.indexOf(right)))
  verifySecondaryIdSet(groups.filter((group) => group.role === 'SECONDARY_RESERVE_UNEXECUTED').map((group) => group.groupId).sort((left, right) => C1G_SECONDARY_GROUP_IDS.indexOf(left) - C1G_SECONDARY_GROUP_IDS.indexOf(right)))

  const observedProvenance = new Set(groups.flatMap((group) => group.members.map((member) => `${member.groupId}|${member.concreteCurveIdentity}`)))
  assert(observedProvenance.size === (provenance.records ?? []).length, 'C1h provenance record set mismatch')
  const calculatedCorpusSha256 = corpusHash(groups, C1G_PRIMARY_GROUP_IDS, C1G_SECONDARY_GROUP_IDS, index.c1fEvidenceCommit, index.c1fHashIndexSha256)
  assert(calculatedCorpusSha256 === expectedCorpusSha256, `materialized corpus SHA mismatch: ${calculatedCorpusSha256}`)
  assert(index.materializedCorpusSha256 === calculatedCorpusSha256 && manifest.materializedCorpusSha256 === calculatedCorpusSha256, 'C1h materialized corpus identity mismatch')
  if (requireTracked) verifyCommittedC1hFiles(repoRoot, indexVerification.entries)

  const groupsById = new Map(groups.map((group) => [group.groupId, group]))
  const corpus = {
    manifest,
    index,
    provenance,
    schema,
    groups,
    primaryGroups: C1G_PRIMARY_GROUP_IDS.map((groupId) => groupsById.get(groupId)),
    secondaryGroups: C1G_SECONDARY_GROUP_IDS.map((groupId) => groupsById.get(groupId)),
    primaryGroupIds: [...C1G_PRIMARY_GROUP_IDS],
    secondaryGroupIds: [...C1G_SECONDARY_GROUP_IDS],
    primaryCurveCount: 0,
    primaryExact711Count: 0,
    primaryNon711Count: 0,
    c1hEvidenceIndexSha256: indexVerification.indexSha256,
    materializedCorpusSha256: calculatedCorpusSha256,
  }
  verifyPrimaryStructure(corpus)
  return corpus
}

function verifyCommittedC1hFiles(repoRoot, entries) {
  for (const entry of entries) {
    const relativePath = `${C1G_C1H_ARTIFACT_RELATIVE_DIR}/${entry.name}`
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    } catch (error) {
      throw new Error(`C1h artifact is not committed: ${relativePath}: ${error?.status ?? 'unknown'}`)
    }
  }
}

export function verifyPrimaryStructure(corpus) {
  assert(corpus && Array.isArray(corpus.primaryGroups), 'primary corpus is required')
  const ids = corpus.primaryGroups.map((group) => group.groupId)
  assert(sameArray(ids, C1G_PRIMARY_GROUP_IDS), 'primary groups are not the frozen C1f selection')
  const expectedMemberCounts = [6, 5, 5, 5, 5, 5]
  let total = 0
  let exactCount = 0
  let non711Count = 0
  const rigClasses = new Set()
  for (let groupIndex = 0; groupIndex < corpus.primaryGroups.length; groupIndex += 1) {
    const group = corpus.primaryGroups[groupIndex]
    assert(group.members.length === expectedMemberCounts[groupIndex], `primary member count mismatch: ${group.groupId}`)
    const exact = group.members.filter((member) => member.rig === '711')
    const non711 = group.members.filter((member) => member.rig !== '711')
    assert(exact.length === 4, `primary exact-711 count mismatch: ${group.groupId}`)
    assert(non711.length >= 1, `primary non-711 observation missing: ${group.groupId}`)
    total += group.members.length
    exactCount += exact.length
    non711Count += non711.length
    for (const member of non711) rigClasses.add(member.rigClass)
  }
  assert(total === C1G_PRIMARY_CURVE_COUNT, `primary curve count mismatch: ${total}`)
  assert(exactCount === C1G_PRIMARY_EXACT711_COUNT, `primary exact-711 curve count mismatch: ${exactCount}`)
  assert(non711Count === C1G_PRIMARY_NON711_COUNT, `primary non-711 observation count mismatch: ${non711Count}`)
  assert(rigClasses.size >= 2, `primary rig-class diversity mismatch: ${[...rigClasses].join(',')}`)
  corpus.primaryCurveCount = total
  corpus.primaryExact711Count = exactCount
  corpus.primaryNon711Count = non711Count
  return true
}

function createEvaluationGrid() {
  const count = Math.ceil(Math.log2(20_000 / 20) * C1G_POINTS_PER_OCTAVE)
  const values = Array.from({ length: count + 1 }, (_, index) => 20 * 2 ** (index / C1G_POINTS_PER_OCTAVE))
  values[0] = 20
  values[count] = 20_000
  return values
}

export const C1G_EVALUATION_GRID = Object.freeze(createEvaluationGrid())

function interpolateLogValue(points, frequencyHz) {
  assert(frequencyHz >= points[0][0] && frequencyHz <= points.at(-1)[0], `frequency outside curve coverage: ${frequencyHz}`)
  if (frequencyHz === points[0][0]) return points[0][1]
  if (frequencyHz === points.at(-1)[0]) return points.at(-1)[1]
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle][0] <= frequencyHz) low = middle
    else high = middle
  }
  const left = points[low]
  const right = points[high]
  const ratio = Math.log2(frequencyHz / left[0]) / Math.log2(right[0] / left[0])
  return left[1] + ratio * (right[1] - left[1])
}

function normalizedPoints(member) {
  assert(Array.isArray(member.frequencyHz) && Array.isArray(member.normalizedDb), `normalized member arrays missing: ${member.concreteCurveIdentity}`)
  const points = member.frequencyHz.map((frequency, index) => [frequency, member.normalizedDb[index]])
  finiteArray(points.flat(), `normalized points for ${member.concreteCurveIdentity}`)
  return points
}

function sampleNormalizedCurve(member, evaluationGrid = C1G_EVALUATION_GRID) {
  const points = normalizedPoints(member)
  assert(points[0][0] <= evaluationGrid[0] && points.at(-1)[0] >= evaluationGrid.at(-1), `C1h curve does not cover V2 grid: ${member.concreteCurveIdentity}`)
  const valuesDb = evaluationGrid.map((frequency) => interpolateLogValue(points, frequency))
  finiteArray(valuesDb, `sampled response for ${member.concreteCurveIdentity}`)
  return { frequenciesHz: [...evaluationGrid], valuesDb }
}

/** Build the four-member pointwise median; non-711 members are never read. */
export function buildExact711Consensus(group, { evaluationGrid = null } = {}) {
  assert(group && Array.isArray(group.members), 'group with members is required')
  const exact711 = group.members.filter((member) => member.rig === '711')
  assert(exact711.length === 4, `exact-711 consensus requires four curves for ${group.groupId}`)
  const grid = evaluationGrid ?? exact711[0].frequencyHz
  const prepared = exact711.map((member) => evaluationGrid ? sampleNormalizedCurve(member, evaluationGrid) : { frequenciesHz: [...member.frequencyHz], valuesDb: [...member.normalizedDb] })
  for (const member of prepared) assert(sameArray(member.frequenciesHz, grid), `exact-711 grids differ for ${group.groupId}`)
  const valuesDb = grid.map((_, index) => median(prepared.map((curve) => curve.valuesDb[index])))
  return {
    frequenciesHz: [...grid],
    valuesDb,
    exact711ObservationIdentities: exact711.map((member) => member.concreteCurveIdentity),
    exact711Count: exact711.length,
  }
}

/** D = R - C and desired_base = -D. */
export function desiredCorrectionFromDisagreement(responseDb, consensusDb) {
  assert(Array.isArray(responseDb) && Array.isArray(consensusDb) && responseDb.length === consensusDb.length, 'response and consensus grids must match')
  finiteArray(responseDb, 'response')
  finiteArray(consensusDb, 'consensus')
  const disagreement = responseDb.map((response, index) => response - consensusDb[index])
  const desiredBase = disagreement.map((value) => -value)
  return { disagreement, D: [...disagreement], desiredBase }
}

/** Construct all three frozen desired-correction arms without invoking core. */
export function buildArmCorrections(frequenciesHz, disagreement, confidence) {
  assert(Array.isArray(frequenciesHz) && Array.isArray(disagreement) && Array.isArray(confidence), 'arm arrays are required')
  assert(frequenciesHz.length === disagreement.length && frequenciesHz.length === confidence.length, 'arm arrays must have equal length')
  finiteArray(frequenciesHz, 'arm frequencies')
  finiteArray(disagreement, 'disagreement')
  finiteArray(confidence, 'confidence')
  const primaryIndices = frequenciesHz.map((frequency, index) => frequency >= C1G_PRIMARY_BAND_HZ[0] && frequency <= C1G_PRIMARY_BAND_HZ[1] ? index : -1).filter((index) => index >= 0)
  assert(primaryIndices.length > 0, 'primary band has no evaluation points')
  const wBar = mean(primaryIndices.map((index) => confidence[index]))
  const desiredBase = disagreement.map((value) => -value)
  const constant = desiredBase.map((value, index) => primaryIndices.includes(index) ? wBar * value : value)
  const shaped = desiredBase.map((value, index) => primaryIndices.includes(index) ? confidence[index] * value : value)
  const mConst = frequenciesHz.map((_, index) => primaryIndices.includes(index) ? wBar : 1)
  const mConf = frequenciesHz.map((_, index) => primaryIndices.includes(index) ? confidence[index] : 1)
  return {
    primaryIndices,
    wBar,
    meanConfidence: mean(primaryIndices.map((index) => confidence[index])),
    desiredBase,
    baseline: [...desiredBase],
    constant,
    confidence: shaped,
    mConst,
    mConf,
  }
}

export function assertEqualAuthority(arms, tolerance = C1G_EQUAL_AUTHORITY_TOLERANCE) {
  assert(Number.isFinite(arms.wBar) && Number.isFinite(arms.meanConfidence), 'authority means must be finite')
  assert(Math.abs(arms.wBar - arms.meanConfidence) <= tolerance, `equal-authority invariant failed: ${arms.wBar} vs ${arms.meanConfidence}`)
  return true
}

function modelPayload(model) {
  const { modelSha256: _modelSha256, ...payload } = model
  return payload
}

export function confidenceModelHash(model) {
  return hashJson(modelPayload(model))
}

export async function loadFrozenConfidenceModel({
  repoRoot = ROOT,
  modelPath = resolve(repoRoot, C1G_MODEL_RELATIVE_PATH),
  expectedModelSha256 = C1G_MODEL_SHA256,
} = {}) {
  assertBatchCPath(modelPath)
  assertCachePath(modelPath)
  const model = JSON.parse((await readFile(modelPath, 'utf8')))
  assert(model.modelSha256 === expectedModelSha256, `frozen confidence model hash mismatch: ${model.modelSha256}`)
  assert(confidenceModelHash(model) === expectedModelSha256, 'frozen confidence model serialized hash mismatch')
  assert(model.autoEqSolverExecuted === false && model.c4PeakAlignmentUsed === false, 'frozen model contains forbidden execution state')
  assert(model.holdoutUsed === false && model.freshRealBatchCUsed === false, 'frozen model contains forbidden holdout/Batch C state')
  assert(sameArray(model.primaryBandHz, [4_000, 14_000]), 'frozen model primary band mismatch')
  assert(model.transform?.scaleDb === 0.75, 'frozen model target scale mismatch')
  const grids = [model.gridFrequenciesHz, model.dataPreparation?.grid, model.weights?.globalFallback?.w_conf?.frequenciesHz]
  for (const grid of grids) assert(sameArray(grid, C1G_EVALUATION_GRID), 'frozen model grid mismatch')
  return { model, modelSha256: expectedModelSha256, serializedSha256: sha256(JSON.stringify(model)) }
}

export function resolveFrozenConfidenceProfile(modelOrLoaded, rigClass) {
  const model = modelOrLoaded?.model ?? modelOrLoaded
  assert(model && typeof model === 'object', 'frozen confidence model is required')
  const classProfile = model.profiles?.rigProfiles?.[rigClass]
  const weightSet = model.weights?.byRigClass?.[rigClass] ?? model.weights?.globalFallback
  assert(weightSet, `frozen model has no rig profile for ${rigClass}`)
  const source = classProfile ? 'CLASS_SPECIFIC' : 'GLOBAL_FALLBACK'
  assert(weightSet.source === source && weightSet.fallback === (source === 'GLOBAL_FALLBACK'), `frozen profile category mismatch: ${rigClass}`)
  const frequenciesHz = weightSet.w_conf?.frequenciesHz ?? weightSet.frequenciesHz
  const valuesDb = weightSet.w_conf?.valuesDb
  assert(sameArray(frequenciesHz, C1G_EVALUATION_GRID), `frozen profile grid mismatch: ${rigClass}`)
  finiteArray(valuesDb, `frozen confidence values for ${rigClass}`)
  assert(valuesDb.every((value) => value > 0 && value <= 1), `frozen confidence range invalid: ${rigClass}`)
  assert(weightSet.w_conf.profileSha256 === hashJson({ frequenciesHz, valuesDb }), `frozen profile hash mismatch: ${rigClass}`)
  return {
    rigClass,
    source,
    profileCategory: source,
    frequenciesHz: [...frequenciesHz],
    valuesDb: [...valuesDb],
    w_conf: [...valuesDb],
    profileHash: weightSet.w_conf.profileSha256,
    profileSelection: model.rigClassSelections?.[rigClass] ?? {
      rigClass,
      source,
      fallback: source === 'GLOBAL_FALLBACK',
      profileSha256: weightSet.w_conf.profileSha256,
    },
  }
}

function buildObservationInput(group, member, model) {
  const consensus = buildExact711Consensus(group, { evaluationGrid: C1G_EVALUATION_GRID })
  const response = sampleNormalizedCurve(member, C1G_EVALUATION_GRID)
  const { disagreement, desiredBase } = desiredCorrectionFromDisagreement(response.valuesDb, consensus.valuesDb)
  const profile = resolveFrozenConfidenceProfile(model, member.rigClass)
  const arms = buildArmCorrections(C1G_EVALUATION_GRID, disagreement, profile.valuesDb)
  assertEqualAuthority(arms)
  assert(sameArray(arms.desiredBase, desiredBase), `baseline correction construction mismatch: ${member.concreteCurveIdentity}`)
  return {
    groupId: group.groupId,
    observationId: member.concreteCurveIdentity,
    model: group.model,
    manufacturer: group.manufacturer,
    rig: member.rig,
    rigClass: member.rigClass,
    profile,
    frequenciesHz: [...C1G_EVALUATION_GRID],
    responseDb: response.valuesDb,
    consensusDb: consensus.valuesDb,
    disagreementDb: disagreement,
    D: [...disagreement],
    desiredBase,
    arms,
  }
}

export function materializedCascadeMetrics(responseDb, frequenciesHz) {
  assert(Array.isArray(responseDb) && Array.isArray(frequenciesHz) && responseDb.length === frequenciesHz.length, 'cascade response and frequency grid must match')
  finiteArray(responseDb, 'delivered cascade response')
  finiteArray(frequenciesHz, 'delivered cascade frequencies')
  const select = (lo, hi) => responseDb.filter((_, index) => frequenciesHz[index] >= lo && frequenciesHz[index] <= hi)
  const primary = select(C1G_PRIMARY_BAND_HZ[0], C1G_PRIMARY_BAND_HZ[1])
  assert(primary.length > 0, 'primary metric grid is empty')
  const absPrimary = primary.map((value) => Math.abs(value))
  const fullAbs = responseDb.map((value) => Math.abs(value))
  const maxPrimary = Math.max(...absPrimary)
  let maxIndex = -1
  for (let index = 0; index < responseDb.length; index += 1) {
    if (frequenciesHz[index] >= C1G_PRIMARY_BAND_HZ[0] && frequenciesHz[index] <= C1G_PRIMARY_BAND_HZ[1] && Math.abs(responseDb[index]) === maxPrimary) {
      maxIndex = index
      break
    }
  }
  const nineBands = NINE_DIAGNOSTIC_BANDS.map(([lo, hi]) => {
    const values = select(lo, hi)
    return {
      bandHz: [lo, hi],
      rmse: values.length ? rms(values) : null,
      mae: values.length ? mean(values.map((value) => Math.abs(value))) : null,
      pointCount: values.length,
    }
  })
  return {
    artifactRmse4_14k: rms(primary),
    artifactMae4_14k: mean(absPrimary),
    artifactMaxAbs4_14k: maxPrimary,
    artifactMaxAbsFrequencyHz: maxIndex >= 0 ? frequenciesHz[maxIndex] : null,
    artifactRmseFullGrid: rms(responseDb),
    artifactMaeFullGrid: mean(fullAbs),
    nineBands,
    deliveredResponseDb: [...responseDb],
    evaluationFrequenciesHz: [...frequenciesHz],
  }
}

export function classifyObservation({ baseline, constant, confidence }) {
  for (const [name, value] of Object.entries({ baseline, constant, confidence })) {
    assert(Number.isFinite(value) && value >= 0, `${name} endpoint must be finite and non-negative`)
  }
  if (baseline === 0 || constant === 0) {
    return {
      informative: false,
      classification: 'NON_INFORMATIVE_ZERO_DENOMINATOR',
      reason: baseline === 0 ? 'E_base == 0 makes gain_vs_baseline undefined' : 'E_const == 0 makes gain_vs_constant undefined',
    }
  }
  const gainVsBaseline = (baseline - confidence) / baseline
  const gainVsConstant = (constant - confidence) / constant
  const combinedGain = Math.min(gainVsBaseline, gainVsConstant)
  return {
    informative: true,
    gainVsBaseline,
    gainVsConstant,
    combinedGain,
    classification: gainVsBaseline >= C1G_TARGETING_THRESHOLD && gainVsConstant >= C1G_TARGETING_THRESHOLD
      ? 'CAUSAL_CONFIDENCE_WIN'
      : 'NO_CAUSAL_CONFIDENCE_WIN',
  }
}

export function classifyGroup(observations) {
  assert(Array.isArray(observations), 'group observations are required')
  const informative = observations.filter((observation) => observation.informative !== false && Number.isFinite(observation.combinedGain))
  const wins = informative.filter((observation) => observation.classification === 'CAUSAL_CONFIDENCE_WIN').length
  const losses = informative.length - wins
  const medianCombinedGain = informative.length ? median(informative.map((observation) => observation.combinedGain)) : null
  return {
    informativeObservationCount: informative.length,
    informativeCount: informative.length,
    wins,
    losses,
    medianCombinedGain,
    classification: informative.length > 0 && wins > informative.length / 2 && medianCombinedGain >= C1G_TARGETING_THRESHOLD
      ? 'CAUSAL_CONFIDENCE_SIGNAL'
      : 'NO_CAUSAL_CONFIDENCE_SIGNAL',
  }
}

export function classifyCampaign(groups) {
  assert(Array.isArray(groups) && groups.length === 6, 'C1g campaign gate requires exactly six primary groups')
  if (groups.some((group) => group.classification === 'INCONCLUSIVE')) return { signalGroups: null, classification: 'INCONCLUSIVE' }
  const signalGroups = groups.filter((group) => group.classification === 'CAUSAL_CONFIDENCE_SIGNAL').length
  return {
    signalGroups,
    classification: signalGroups >= 4 ? 'C1G_CAUSAL_INTEGRATION_REPLICATED' : 'C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED',
  }
}

function currentCommit(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    throw new Error(`unable to determine current protocol commit: ${error?.status ?? error?.message ?? error}`)
  }
}

function assertCleanWorktree(repoRoot) {
  try {
    const status = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    assert(status === '', `worktree must be clean before primary execution: ${status}`)
  } catch (error) {
    if (error?.message?.startsWith('worktree must be clean')) throw error
    throw new Error(`unable to determine worktree status: ${error?.status ?? error?.message ?? error}`)
  }
}

function assertSolverAncestry(repoRoot) {
  for (const commit of [C1G_STANDARD_V2_IDENTITY, C1G_HISTORICAL_PRODUCT_BOUNDARY]) {
    try {
      const kind = execFileSync('git', ['cat-file', '-t', `${commit}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      assert(kind === 'commit', `frozen solver identity is not a commit: ${commit}`)
      execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] })
    } catch (error) {
      throw new Error(`frozen Standard V2 ancestry/integrity check failed for ${commit}: ${error?.status ?? error?.message ?? error}`)
    }
  }
  return true
}

async function verifyProtocolArtifacts({ repoRoot = ROOT, outputRoot = resolve(repoRoot, C1G_ARTIFACT_RELATIVE_DIR) } = {}) {
  const manifestPath = resolve(outputRoot, 'manifest.json')
  const schemaPath = resolve(outputRoot, 'schema.json')
  const protocolPath = resolve(repoRoot, 'research/c1g-causal-confidence-replication/protocol.md')
  const hashPath = resolve(outputRoot, 'protocol-sha256.txt')
  const [manifestText, schemaText, protocolText, hashText] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
    readFile(protocolPath, 'utf8'),
    readFile(hashPath, 'utf8'),
  ])
  const expected = sha256(`${protocolText}${manifestText}${schemaText}`)
  assert(hashText.trim() === expected, `protocol hash mismatch: ${hashText.trim()}`)
  const manifest = JSON.parse(manifestText)
  const schema = JSON.parse(schemaText)
  assert(manifest.artifactKind === 'c1g-causal-confidence-replication-protocol-freeze', 'C1g protocol manifest kind mismatch')
  assert(manifest.phase === 'protocol-freeze' && manifest.state === C1G_EXECUTION_STATE_PRE_OUTCOME, 'C1g protocol is not pre-outcome')
  assert(sameArray(manifest.primaryGroupIds, C1G_PRIMARY_GROUP_IDS), 'C1g protocol primary IDs mismatch')
  assert(sameArray(manifest.secondaryGroupIds, C1G_SECONDARY_GROUP_IDS), 'C1g protocol secondary IDs mismatch')
  assert(manifest.c1h?.materializedCorpusSha256 === C1G_MATERIALIZED_CORPUS_SHA256, 'C1g protocol corpus pin mismatch')
  assert(manifest.confidenceModel?.sha256 === C1G_MODEL_SHA256, 'C1g protocol model pin mismatch')
  assert(manifest.safety?.solverExecuted === false && manifest.safety?.primaryExecutionAttempted === false, 'C1g protocol execution flags invalid')
  assert(manifest.safety?.batchCAccessed === false && manifest.safety?.batchCExecuted === false, 'C1g protocol Batch C flags invalid')
  assert(schema.schemaVersion === 1 && Array.isArray(schema.required), 'C1g protocol schema invalid')
  return { manifest, schema, protocolSha256: expected }
}

/** All non-outcome checks required before one-shot rights are consumed. */
export async function preflight({
  repoRoot = ROOT,
  artifactRoot = resolve(repoRoot, C1G_C1H_ARTIFACT_RELATIVE_DIR),
  outputRoot = resolve(repoRoot, C1G_ARTIFACT_RELATIVE_DIR),
  freezeCommit,
} = {}) {
  assertCurrentFreeze(repoRoot, freezeCommit)
  assertSolverAncestry(repoRoot)
  const protocol = await verifyProtocolArtifacts({ repoRoot, outputRoot })
  const corpus = await loadC1hCorpus({ repoRoot, artifactRoot, requireTracked: true })
  assert(corpus.materializedCorpusSha256 === C1G_MATERIALIZED_CORPUS_SHA256, 'C1h corpus pin mismatch')
  const loadedModel = await loadFrozenConfidenceModel({ repoRoot })
  const model = loadedModel.model
  verifyPrimaryStructure(corpus)
  const observations = []
  for (const group of corpus.primaryGroups) {
    for (const member of group.members.filter((candidate) => candidate.rig !== '711')) {
      const input = buildObservationInput(group, member, model)
      assert(input.frequenciesHz.length === C1G_EVALUATION_GRID.length, `observation grid mismatch: ${input.observationId}`)
      observations.push(input)
    }
  }
  assert(observations.length === C1G_PRIMARY_NON711_COUNT, `primary observation count mismatch: ${observations.length}`)
  assert(await pathExists(resolve(outputRoot)), 'C1g output artifact directory is missing')
  await access(resolve(outputRoot), fsConstants.W_OK)
  for (const name of [C1G_EXECUTION_ATTEMPT_FILENAME, C1G_EXECUTION_LOCK_FILENAME]) {
    assert(!(await pathExists(resolve(outputRoot, name))), `C1g one-shot file already exists: ${name}`)
  }
  return {
    protocol,
    corpus,
    model,
    loadedModel,
    observations,
    networkAccessAttempts: 0,
    cacheAccessAttempts: 0,
    batchCAccessAttempts: 0,
    solverCalls: 0,
  }
}

function assertCurrentFreeze(repoRoot, freezeCommit) {
  assert(typeof freezeCommit === 'string' && /^[0-9a-f]{40}$/.test(freezeCommit), 'protocol freeze commit argument is required')
  const head = currentCommit(repoRoot)
  assert(head === freezeCommit, `HEAD is not the requested protocol freeze commit: ${head}`)
  assertCleanWorktree(repoRoot)
  return true
}

async function writeHandleContents(handle, contents) {
  await handle.writeFile(contents, 'utf8')
  try { await handle.sync() } catch { /* fsync is best effort on some filesystems */ }
  await handle.close()
}

/**
 * Atomically claim the primary execution.  The lock is acquired first; the
 * permanent marker is then exclusive-created while the lock is held.  A
 * second process therefore fails before it can import or call Standard V2.
 */
export async function acquirePrimaryExecutionRight({
  artifactRoot,
  freezeCommit,
  corpusSha256,
  executionUuid = randomUUID(),
  command = '--execute-primary',
  primaryGroupIds = C1G_PRIMARY_GROUP_IDS,
  processId = process.pid,
  host = hostname(),
  timestamp = new Date().toISOString(),
} = {}) {
  assert(artifactRoot, 'primary execution artifact root is required')
  assert(typeof freezeCommit === 'string' && /^[0-9a-f]{40}$/.test(freezeCommit), 'primary execution freeze commit is required')
  assert(corpusSha256 === C1G_MATERIALIZED_CORPUS_SHA256, 'primary execution corpus pin mismatch')
  assert(sameArray(primaryGroupIds, C1G_PRIMARY_GROUP_IDS), 'primary execution group set mismatch')
  const root = resolve(artifactRoot)
  await mkdir(root, { recursive: true })
  const lockPath = join(root, C1G_EXECUTION_LOCK_FILENAME)
  const markerPath = join(root, C1G_EXECUTION_ATTEMPT_FILENAME)
  const provenance = {
    protocolFreezeCommit: freezeCommit,
    materializedCorpusSha256: corpusSha256,
    executionUuid,
    pid: processId,
    hostname: host,
    startTimestamp: timestamp,
    command,
    primaryGroupIds: [...primaryGroupIds],
  }
  let lockHandle
  try {
    lockHandle = await open(lockPath, 'wx')
    await writeHandleContents(lockHandle, jsonText({ ...provenance, lock: true }))
  } catch (error) {
    if (lockHandle) try { await lockHandle.close() } catch { /* noop */ }
    throw new Error(`PRIMARY_EXECUTION_ALREADY_STARTED: runtime lock unavailable (${error?.code ?? error?.message ?? error})`)
  }
  let markerHandle
  try {
    markerHandle = await open(markerPath, 'wx')
    await writeHandleContents(markerHandle, jsonText({ ...provenance, permanentAttemptMarker: true }))
  } catch (error) {
    if (markerHandle) try { await markerHandle.close() } catch { /* noop */ }
    // No other process can own this lock in this branch.  Remove only the
    // lock created by this failed claim; an existing marker remains intact.
    await rm(lockPath, { force: true })
    throw new Error(`PRIMARY_EXECUTION_ATTEMPT_ALREADY_EXISTS: permanent marker unavailable (${error?.code ?? error?.message ?? error})`)
  }
  return { root, lockPath, markerPath, executionUuid, provenance }
}

export async function writeAtomicJson(path, value, { beforeRename } = {}) {
  const absolute = resolve(path)
  if (isWithin(absolute, ROOT)) assertResearchWritePath(relative(ROOT, absolute))
  await mkdir(dirname(absolute), { recursive: true })
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`
  try {
    const handle = await open(temporary, 'wx')
    await writeHandleContents(handle, jsonText(value))
    if (beforeRename) await beforeRename()
    await rename(temporary, absolute)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return absolute
}

async function persistState({ outputRoot, state, freezeCommit, executionUuid }) {
  return writeAtomicJson(join(outputRoot, C1G_EXECUTION_STATE_FILENAME), {
    schemaVersion: 1,
    state,
    protocolFreezeCommit: freezeCommit,
    executionUuid,
    updatedAt: new Date().toISOString(),
  })
}

function curveForSolver(id, kind, frequenciesHz, valuesDb) {
  return {
    id,
    name: id,
    kind,
    rawPoints: frequenciesHz.map((frequencyHz, index) => ({ frequencyHz, db: valuesDb[index] })),
    metadata: { c1g: true, corpus: 'C1h-committed', normalizedInput: true },
  }
}

async function defaultSolver({ id, frequenciesHz, sourceDb, targetDb }) {
  // This dynamic import is deliberately unreachable until after the lock and
  // permanent marker are acquired by executePrimary.
  const { cascadeMagnitudeDb, runStandardAutoEqV2 } = await import('../../packages/core/src/index.ts')
  const result = runStandardAutoEqV2({
    source: curveForSolver(`${id}:source`, 'fr', frequenciesHz, sourceDb),
    target: curveForSolver(`${id}:target`, 'target', frequenciesHz, targetDb),
    normalization: C1G_NORMALIZATION,
    settings: C1G_SOLVER_SETTINGS,
  })
  const deliveredResponseDb = cascadeMagnitudeDb(result.filters, frequenciesHz, C1G_SAMPLE_RATE_HZ)
  return { result, deliveredResponseDb }
}

async function executeArm({ observation, armName, desiredDb, solver }) {
  const started = performance.now()
  const solved = await solver({
    id: `${observation.groupId}:${observation.observationId}:${armName}`,
    arm: armName,
    frequenciesHz: observation.frequenciesHz,
    sourceDb: observation.responseDb,
    targetDb: observation.responseDb.map((value, index) => value + desiredDb[index]),
    settings: C1G_SOLVER_SETTINGS,
    normalization: C1G_NORMALIZATION,
  })
  assert(solved && solved.result && Array.isArray(solved.result.filters), `solver returned no filters for ${armName}`)
  const responseDb = solved.deliveredResponseDb
  const metrics = materializedCascadeMetrics(responseDb, observation.frequenciesHz)
  const result = solved.result
  const filters = result.filters
  const solverMetrics = result.metrics ?? {}
  return {
    arm: armName,
    ...metrics,
    deliveredFilterCount: filters.length,
    peakWorkingFilterCount: null,
    sumAbsGainDb: filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb), 0),
    maxAbsGainDb: Math.max(0, ...filters.map((filter) => Math.abs(filter.gainDb))),
    maxQ: Math.max(0, ...filters.map((filter) => Math.abs(filter.q))),
    preampDb: result.preampDb,
    cancellationScore: result.cancellationAudit?.totalScore ?? null,
    solverInternalMetrics: solverMetrics,
    solverInternalRmse: solverMetrics.rmseDb ?? null,
    solverInternalMaxAbs: solverMetrics.maxAbsDb ?? null,
    terminationReason: result.manifest?.terminationReason ?? null,
    elapsedMs: performance.now() - started,
    filters,
  }
}

function observationEvidence(input, arms, comparison) {
  const byName = Object.fromEntries(arms.map((arm) => [arm.arm, arm]))
  return {
    observationId: input.observationId,
    model: input.model,
    manufacturer: input.manufacturer,
    rig: input.rig,
    rigClass: input.rigClass,
    profileCategory: input.profile.source,
    profileSource: input.profile.source,
    profileHash: input.profile.profileHash,
    confidence: {
      min: Math.min(...input.profile.valuesDb),
      max: Math.max(...input.profile.valuesDb),
      mean: mean(input.profile.valuesDb),
      wBar: input.arms.wBar,
    },
    frequenciesHz: input.frequenciesHz,
    responseDb: input.responseDb,
    consensusDb: input.consensusDb,
    disagreementDb: input.disagreementDb,
    D: input.D,
    desiredBase: input.desiredBase,
    arms,
    endpoint: {
      E_base: byName.FROZEN_BASELINE.artifactRmse4_14k,
      E_const: byName.CONSTANT_AUTHORITY_CONTROL.artifactRmse4_14k,
      E_conf: byName.CONFIDENCE_SHAPED.artifactRmse4_14k,
      artifactRmse4_14k: {
        base: byName.FROZEN_BASELINE.artifactRmse4_14k,
        constant: byName.CONSTANT_AUTHORITY_CONTROL.artifactRmse4_14k,
        confidence: byName.CONFIDENCE_SHAPED.artifactRmse4_14k,
      },
    },
    comparison,
  }
}

async function executeGroup({ group, model, solver }) {
  const observations = []
  for (const member of group.members.filter((candidate) => candidate.rig !== '711')) {
    const input = buildObservationInput(group, member, model)
    const armInputs = [
      ['FROZEN_BASELINE', input.arms.baseline],
      ['CONSTANT_AUTHORITY_CONTROL', input.arms.constant],
      ['CONFIDENCE_SHAPED', input.arms.confidence],
    ]
    const arms = []
    for (const [armName, desiredDb] of armInputs) {
      arms.push(await executeArm({ observation: input, armName, desiredDb, solver }))
    }
    const byName = Object.fromEntries(arms.map((arm) => [arm.arm, arm]))
    const comparison = classifyObservation({
      baseline: byName.FROZEN_BASELINE.artifactRmse4_14k,
      constant: byName.CONSTANT_AUTHORITY_CONTROL.artifactRmse4_14k,
      confidence: byName.CONFIDENCE_SHAPED.artifactRmse4_14k,
    })
    observations.push(observationEvidence(input, arms, comparison))
  }
  const gate = classifyGroup(observations.map((observation) => observation.comparison))
  return {
    schemaVersion: 1,
    artifactKind: 'c1g-group-causal-confidence-replication-evidence',
    groupId: group.groupId,
    role: 'PRIMARY',
    manufacturer: group.manufacturer,
    model: group.model,
    canonicalIdentity: group.canonicalIdentity,
    exact711Count: group.exact711Count,
    non711Count: group.non711Count,
    non711RigClasses: group.non711RigClasses,
    armOrder: [...PRIMARY_ARM_ORDER],
    primaryBandHz: [...C1G_PRIMARY_BAND_HZ],
    groundTruthDb: 0,
    observations,
    gate,
  }
}

function campaignInterpretation(campaign) {
  if (campaign.classification === 'C1G_CAUSAL_INTEGRATION_REPLICATED') return 'C1_CONFIDENCE_MODEL_AND_CAUSAL_INTEGRATION_SUPPORTED'
  if (campaign.classification === 'C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED') return 'C1_SIGNAL_MODEL_GENERALIZED_CAUSAL_INTEGRATION_NOT_SUPPORTED'
  return 'INCONCLUSIVE'
}

function outcomeManifest({ freezeCommit, executionUuid, groups, campaign, state }) {
  return {
    schemaVersion: 1,
    artifactKind: 'c1g-causal-confidence-replication-outcome-manifest',
    classification: campaign.classification,
    combinedScientificStatus: campaignInterpretation(campaign),
    protocolFreezeCommit: freezeCommit,
    baseC1hEvidenceCommit: C1G_C1H_EVIDENCE_COMMIT,
    materializedCorpusSha256: C1G_MATERIALIZED_CORPUS_SHA256,
    c1hEvidenceIndexSha256: C1G_C1H_EVIDENCE_INDEX_SHA256,
    confidenceModelSha256: C1G_MODEL_SHA256,
    standardV2: {
      publishedIdentity: C1G_STANDARD_V2_IDENTITY,
      historicalProductBoundary: C1G_HISTORICAL_PRODUCT_BOUNDARY,
      semanticCompatibility: 'C1d-audited Standard V2 path: optional research tracing is inactive; no experimental structural module is called',
    },
    primaryGroupIds: [...C1G_PRIMARY_GROUP_IDS],
    secondaryReserveGroupIds: [...C1G_SECONDARY_GROUP_IDS],
    primaryGroupCount: groups.length,
    signalGroups: campaign.signalGroups,
    gate: 'at least 4 of exactly 6 primary groups classified CAUSAL_CONFIDENCE_SIGNAL',
    state,
    executionUuid,
    solverExecuted: true,
    primaryExecutionAttempted: true,
    primaryExecutionComplete: state === C1G_EXECUTION_STATE_PRIMARY_COMPLETE,
    concurrentPrimaryDetected: false,
    networkAccessAttempts: 0,
    cacheAccessAttempts: 0,
    batchCAccessed: false,
    batchCExecuted: false,
    secondaryReserveExecuted: false,
    modelRetrained: false,
    productionModified: false,
    coreModified: false,
    c1dOutcomeReused: false,
    upstreamNetworkAccessedDuringC1g: false,
  }
}

function artifactHashIndex(files) {
  const names = Object.keys(files).filter((name) => name !== 'evidence-sha256.txt').sort()
  const lines = ['artifact-hash-index-v1']
  for (const name of names) lines.push(`${sha256(files[name])}  ${name}`)
  return `${lines.join('\n')}\n`
}

async function writeFinalEvidence({ outputRoot, freezeCommit, executionUuid, groupEvidence, campaign }) {
  const aggregate = {
    schemaVersion: 1,
    artifactKind: 'c1g-causal-confidence-replication-aggregate-evidence',
    protocolFreezeCommit: freezeCommit,
    baseC1hEvidenceCommit: C1G_C1H_EVIDENCE_COMMIT,
    materializedCorpusSha256: C1G_MATERIALIZED_CORPUS_SHA256,
    primaryGroupIds: [...C1G_PRIMARY_GROUP_IDS],
    secondaryReserveGroupIds: [...C1G_SECONDARY_GROUP_IDS],
    groupClassifications: groupEvidence.map((group) => ({ groupId: group.groupId, gate: group.gate })),
    campaignGate: campaign,
    combinedScientificStatus: campaignInterpretation(campaign),
    executionUuid,
  }
  await writeAtomicJson(join(outputRoot, 'aggregate-evidence.json'), aggregate)
  await writeAtomicJson(join(outputRoot, 'outcome-manifest.json'), outcomeManifest({ freezeCommit, executionUuid, groups: groupEvidence.map((group) => group.gate), campaign, state: C1G_EXECUTION_STATE_PRIMARY_COMPLETE }))
  const report = makeFinalReport({ freezeCommit, groupEvidence, campaign, executionUuid })
  const reportPath = resolve(outputRoot, 'final-report.md')
  if (isWithin(reportPath, ROOT)) assertResearchWritePath(relative(ROOT, reportPath))
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, report, 'utf8')
  const names = (await readdir(outputRoot)).filter((name) => name !== 'evidence-sha256.txt' && !name.endsWith('.lock') && !name.includes('.tmp-')).sort()
  const files = {}
  for (const name of names) files[name] = await readFile(join(outputRoot, name))
  const indexText = artifactHashIndex(files)
  const indexPath = resolve(outputRoot, 'evidence-sha256.txt')
  if (isWithin(indexPath, ROOT)) assertResearchWritePath(relative(ROOT, indexPath))
  await writeAtomicText(indexPath, indexText)
  return { aggregate, outcomeManifest: JSON.parse((await readFile(join(outputRoot, 'outcome-manifest.json'), 'utf8'))), evidenceIndexSha256: sha256(indexText) }
}

async function writeAtomicText(path, contents) {
  const absolute = resolve(path)
  if (isWithin(absolute, ROOT)) assertResearchWritePath(relative(ROOT, absolute))
  await mkdir(dirname(absolute), { recursive: true })
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`
  try {
    const handle = await open(temporary, 'wx')
    await writeHandleContents(handle, contents)
    await rename(temporary, absolute)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function makeFinalReport({ freezeCommit, groupEvidence, campaign, executionUuid }) {
  const lines = [
    '# C1g — Causal Confidence Integration Replication',
    '',
    `- Classification: **${campaign.classification}**`,
    `- Combined scientific status: **${campaignInterpretation(campaign)}**`,
    `- Protocol freeze commit: \`${freezeCommit}\``,
    `- C1h evidence commit: \`${C1G_C1H_EVIDENCE_COMMIT}\``,
    `- Materialized corpus SHA-256: \`${C1G_MATERIALIZED_CORPUS_SHA256}\``,
    `- C1h evidence-index SHA-256: \`${C1G_C1H_EVIDENCE_INDEX_SHA256}\``,
    `- Frozen confidence model SHA-256: \`${C1G_MODEL_SHA256}\``,
    `- Standard V2 published identity: \`${C1G_STANDARD_V2_IDENTITY}\``,
    `- One-shot execution UUID: \`${executionUuid}\``,
    '',
    '## Observation endpoints',
    '',
    '| Group | Model | Rig class | Profile | E_base | E_const | E_conf | gain vs baseline | gain vs constant | combined gain | Classification |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  ]
  for (const group of groupEvidence) {
    for (const observation of group.observations) {
      const endpoint = observation.endpoint
      const comparison = observation.comparison
      lines.push(`| ${group.groupId} | ${observation.model} | ${observation.rigClass} | ${observation.profileCategory} | ${endpoint.E_base} | ${endpoint.E_const} | ${endpoint.E_conf} | ${comparison.gainVsBaseline ?? 'n/a'} | ${comparison.gainVsConstant ?? 'n/a'} | ${comparison.combinedGain ?? 'n/a'} | ${comparison.classification} |`)
    }
  }
  lines.push('', '## Group gate', '', '| Group | Informative | Wins | Losses | Median combined gain | Classification |', '|---|---:|---:|---:|---:|---|')
  for (const group of groupEvidence) {
    lines.push(`| ${group.groupId} | ${group.gate.informativeObservationCount} | ${group.gate.wins} | ${group.gate.losses} | ${group.gate.medianCombinedGain ?? 'n/a'} | ${group.gate.classification} |`)
  }
  lines.push('', `Campaign gate: **${campaign.signalGroups} / 6** signal groups.`, '', `**${campaign.classification}**`, '')
  return `${lines.join('\n')}\n`
}

/** Execute the frozen six-group primary exactly once, sequentially. */
export async function executePrimary({
  repoRoot = ROOT,
  artifactRoot = resolve(repoRoot, C1G_C1H_ARTIFACT_RELATIVE_DIR),
  outputRoot = resolve(repoRoot, C1G_ARTIFACT_RELATIVE_DIR),
  freezeCommit,
  solver = defaultSolver,
  executionUuid = randomUUID(),
} = {}) {
  const context = await preflight({ repoRoot, artifactRoot, outputRoot, freezeCommit })
  const right = await acquirePrimaryExecutionRight({
    artifactRoot: outputRoot,
    freezeCommit,
    corpusSha256: context.corpus.materializedCorpusSha256,
    executionUuid,
    command: '--execute-primary',
  })
  let primaryStarted = false
  try {
    await persistState({ outputRoot, state: C1G_EXECUTION_STATE_PRIMARY_STARTED, freezeCommit, executionUuid })
    primaryStarted = true
    const groupEvidence = []
    for (const groupId of C1G_PRIMARY_GROUP_IDS) {
      const group = context.corpus.primaryGroups.find((candidate) => candidate.groupId === groupId)
      assert(group, `frozen primary group missing during execution: ${groupId}`)
      const evidence = await executeGroup({ group, model: context.model, solver })
      await writeAtomicJson(join(outputRoot, `group-${groupId}.json`), evidence)
      groupEvidence.push(evidence)
    }
    const campaign = classifyCampaign(groupEvidence.map((group) => group.gate))
    await persistState({ outputRoot, state: C1G_EXECUTION_STATE_PRIMARY_COMPLETE, freezeCommit, executionUuid })
    const finalEvidence = await writeFinalEvidence({ outputRoot, freezeCommit, executionUuid, groupEvidence, campaign })
    // The permanent marker remains.  The runtime lock is removable only after
    // all six groups and the complete aggregate have been written.
    await rm(right.lockPath, { force: true })
    return { classification: campaign.classification, campaign, groupEvidence, finalEvidence, executionUuid, state: C1G_EXECUTION_STATE_PRIMARY_COMPLETE }
  } catch (error) {
    if (primaryStarted) {
      try { await persistState({ outputRoot, state: C1G_EXECUTION_STATE_INVALIDATED, freezeCommit, executionUuid }) } catch { /* preserve original failure */ }
      // Keep the runtime lock on failure.  The permanent marker and lock make
      // any attempted retry fail closed and preserve the invalidated state.
    }
    throw error
  }
}

/** Harmless mocked invocation used only by concurrency regression tests. */
export async function createMockSolverInvocation(artifactRoot, executionUuid) {
  try {
    const right = await acquirePrimaryExecutionRight({
      artifactRoot,
      freezeCommit: 'f'.repeat(40),
      corpusSha256: C1G_MATERIALIZED_CORPUS_SHA256,
      executionUuid,
      command: '--mock-primary',
    })
    return { acquired: true, solverCalls: 0, right }
  } catch (error) {
    return { acquired: false, solverCalls: 0, error: String(error?.message ?? error) }
  }
}

function protocolManifest() {
  return {
    schemaVersion: 1,
    artifactKind: 'c1g-causal-confidence-replication-protocol-freeze',
    campaign: 'C1g',
    phase: 'protocol-freeze',
    state: C1G_EXECUTION_STATE_PRE_OUTCOME,
    baseC1hEvidenceCommit: C1G_C1H_EVIDENCE_COMMIT,
    c1h: {
      protocolCommit: C1G_C1H_PROTOCOL_COMMIT,
      evidenceCommit: C1G_C1H_EVIDENCE_COMMIT,
      evidenceIndexSha256: C1G_C1H_EVIDENCE_INDEX_SHA256,
      materializedCorpusSha256: C1G_MATERIALIZED_CORPUS_SHA256,
      classification: C1G_C1H_CLASSIFICATION,
      inputRoot: C1G_C1H_ARTIFACT_RELATIVE_DIR,
    },
    c1f: {
      classification: C1G_C1F_CLASSIFICATION,
      hashIndexSha256: C1G_C1F_HASH_INDEX_SHA256,
    },
    upstream: { repository: C1G_UPSTREAM_REPOSITORY, commit: C1G_UPSTREAM_COMMIT, tree: C1G_UPSTREAM_TREE },
    confidenceModel: { path: C1G_MODEL_RELATIVE_PATH, sha256: C1G_MODEL_SHA256, immutable: true, retrainingAllowed: false },
    standardV2: {
      publishedIdentity: C1G_STANDARD_V2_IDENTITY,
      historicalProductBoundary: C1G_HISTORICAL_PRODUCT_BOUNDARY,
      semanticCompatibility: 'C1d-audited Standard V2 path: optional research tracing is inactive; no experimental structural module is called',
      source: 'precondition desired correction only; confidence is not integrated in solver internals',
    },
    primaryGroupIds: [...C1G_PRIMARY_GROUP_IDS],
    secondaryGroupIds: [...C1G_SECONDARY_GROUP_IDS],
    primaryCurveCount: C1G_PRIMARY_CURVE_COUNT,
    primaryExact711Count: C1G_PRIMARY_EXACT711_COUNT,
    primaryNon711Count: C1G_PRIMARY_NON711_COUNT,
    armOrder: [...PRIMARY_ARM_ORDER],
    primaryBandHz: [...C1G_PRIMARY_BAND_HZ],
    groundTruthDb: 0,
    normalization: C1G_NORMALIZATION,
    solverSettings: C1G_SOLVER_SETTINGS,
    resolvedSolverConfig: C1G_RESOLVED_SOLVER_CONFIG,
    primaryEndpoint: 'RMS(delivered cascade response against zero) for 4000 <= f <= 14000 Hz',
    thresholds: { observationGain: C1G_TARGETING_THRESHOLD, campaignSignals: 4, campaignGroups: 6 },
    zeroDenominatorPolicy: 'E_base == 0 or E_const == 0 is NON_INFORMATIVE_ZERO_DENOMINATOR; no epsilon is introduced',
    primaryExecution: {
      groupOrder: [...C1G_PRIMARY_GROUP_IDS],
      armOrder: [...PRIMARY_ARM_ORDER],
      sequentialSingleProcess: true,
      noBackgroundExecution: true,
      lock: C1G_EXECUTION_LOCK_FILENAME,
      permanentMarker: C1G_EXECUTION_ATTEMPT_FILENAME,
      stateFile: C1G_EXECUTION_STATE_FILENAME,
      lockSemantics: 'exclusive-create (open(path, wx)); lock first, marker second, then PRIMARY_STARTED before first solver call',
      atomicGroupEvidence: true,
    },
    safety: {
      solverExecuted: false,
      primaryExecutionAttempted: false,
      primaryExecutionComplete: false,
      concurrentPrimaryDetected: false,
      networkAccessAttempts: 0,
      cacheAccessAttempts: 0,
      batchCAccessed: false,
      batchCExecuted: false,
      secondaryReserveExecuted: false,
      modelRetrained: false,
      productionModified: false,
      coreModified: false,
      c1dOutcomeReused: false,
      upstreamNetworkAccessedDuringC1g: false,
    },
  }
}

function protocolSchema() {
  return {
    schemaVersion: 1,
    required: [
      'artifactKind', 'campaign', 'phase', 'state', 'c1h', 'confidenceModel',
      'standardV2', 'primaryGroupIds', 'secondaryGroupIds', 'solverSettings',
      'primaryEndpoint', 'primaryExecution', 'safety',
    ],
    scientificArms: ['FROZEN_BASELINE', 'CONSTANT_AUTHORITY_CONTROL', 'CONFIDENCE_SHAPED'],
    outcomeFields: ['E_base', 'E_const', 'E_conf', 'gain_vs_baseline', 'gain_vs_constant', 'combined_gain'],
    forbiddenInputs: ['.research-cache/**', 'Batch C cases.json', 'C1d outcome artifacts', 'secondary reserve outcomes'],
  }
}

/** Write the protocol bundle; this command never imports or calls the solver. */
export async function writeProtocolArtifacts({ repoRoot = ROOT, outputRoot = resolve(repoRoot, C1G_ARTIFACT_RELATIVE_DIR) } = {}) {
  const protocolPath = resolve(repoRoot, 'research/c1g-causal-confidence-replication/protocol.md')
  const manifest = protocolManifest()
  const schema = protocolSchema()
  await mkdir(dirname(protocolPath), { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(protocolPath, protocolText(), 'utf8')
  await writeFile(resolve(outputRoot, 'manifest.json'), jsonText(manifest), 'utf8')
  await writeFile(resolve(outputRoot, 'schema.json'), jsonText(schema), 'utf8')
  await writeFile(resolve(outputRoot, 'protocol-sha256.txt'), `${sha256(`${protocolText()}${jsonText(manifest)}${jsonText(schema)}`)}\n`, 'utf8')
  return manifest
}

/*
function protocolText() {
  return `# C1g — Causal Confidence Integration Replication\n\nThis is the frozen, one-shot causal replication of the C1d hypothesis on the six primary groups materialized by C1h. C1d remains INCONCLUSIVE because CONCURRENT_PRIMARY_EXECUTION invalidated its execution; no C1d outcome is reused. The only response input is the committed C1h normalized corpus.\n\n## Frozen provenance\n\n- C1h protocol: \\`723307d5ba5db3afd6ade3489cbed2bd8b25058b\\`; evidence: \\`b2d13ba799067738dee523b22e8930e97e71c5b4\\`.\n- C1h evidence-index SHA-256: \\`73e5ae8f9bd11ecb63d5b0da7d273655bc023da15d6674a765b125915bcb66c7\\`.\n- Materialized corpus SHA-256: \\`db81c5c329128eef6769fa7da210e5580c2eb6bf5c4bc690c2f1104e9b8092d4\\`.\n- Confidence model: \\`65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00\\`; it is loaded read-only.\n- Standard V2 published identity: \\`7c9ebbbe6eefeb131c6c698055c737b429f5b0c6\\`; historical product boundary: \\`31cc11982ebd07e009788d5e2c5c3537e9e6b615\\`.\n\n## Inputs and frozen groups\n\nResponses are read only from \\`.research-artifacts/c1h-self-contained-corpus/**\\`. Cache, network, upstream, raw paths, Batch C, C1d outcome artifacts, and secondary reserve outcomes are forbidden. The six primary IDs and the exact order are: \\`${C1G_PRIMARY_GROUP_IDS.join('`, `')}\\`. The six secondary IDs remain \\`SECONDARY_RESERVE_UNEXECUTED\\` and never enter the gate.\n\nEach primary group has four literal-rig \\`711\\` responses. Its reference is the pointwise median on the frozen V2 grid, with no smoothing, alignment, source weighting, or non-711 input. For every non-711 response R and consensus C, \\`D = R - C\\`, truth is zero, and \\`desired_base = C - R = -D\\`.\n\n## Frozen arms\n\n- **FROZEN_BASELINE:** source R, target C, desired correction \\`-D\\`.\n- **CONSTANT_AUTHORITY_CONTROL:** inside 4–14 kHz, \\`w_bar = mean(w_conf)\\` and \\`desired_const = w_bar * desired_base\\`; outside, multiplier one.\n- **CONFIDENCE_SHAPED:** inside 4–14 kHz, \\`desired_conf = w_conf * desired_base\\`; outside, multiplier one.\n\nThe equal-authority invariant is checked before the first solver call with tolerance \\`1e-12\\`. Confidence only preconditions desired correction; it is not placed in loss, ranking, candidate generation, refinement, compression, or any solver internals. Every arm uses the same resolved Standard V2 settings.\n\n## Endpoint and gates\n\nAfter each unchanged Standard V2 run, calculate the delivered filter cascade independently against zero. The primary endpoint is \\`E_arm = RMS(H_arm)\\` over 4,000–14,000 Hz. Observation gains are \\`(E_base-E_conf)/E_base\\` and \\`(E_const-E_conf)/E_const\\`; both must be at least 0.05 without rounding. A zero denominator is \\`NON_INFORMATIVE_ZERO_DENOMINATOR\\` and no epsilon is introduced.\n\nA group requires a strict majority of informative wins and median combined gain at least 0.05. The campaign passes only at least 4 of exactly 6 group signals. Results are \\`C1G_CAUSAL_INTEGRATION_REPLICATED\\`, \\`C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED\\`, or \\`INCONCLUSIVE\\` for an execution-integrity failure after primary start.\n\n## One-shot execution integrity\n\nAll preflight checks run before rights are consumed. Immediately before the first solver call, one foreground process exclusively creates \\`primary-execution.lock\\`, then the permanent exclusive-create \\`primary-execution-attempt.json\\`, then persists \\`PRIMARY_STARTED\\`. A second invocation fails closed before any solver call. All six groups run sequentially in the frozen order and arms run BASELINE, CONSTANT_AUTHORITY, CONFIDENCE_SHAPED. Each complete group is written through a temporary file and atomic rename. The permanent marker is never deleted. The runtime lock is removed only after \\`PRIMARY_COMPLETE\\` and complete evidence writing; it remains on invalidation.\n\n## Safety\n\nThe secondary reserve and Fresh Real Batch C remain untouched. The harness never changes core, production, frontend, solver code, C1f, C1h, or any prior campaign. Protocol and evidence commits are separate, and no executor/protocol patch is permitted after \\`PRIMARY_STARTED\\`.\n`
}
*/

function protocolText() {
  return [
    "# C1g — Causal Confidence Integration Replication",
    "",
    "This is the frozen, one-shot causal replication of the C1d hypothesis on the six primary groups materialized by C1h. C1d remains INCONCLUSIVE because CONCURRENT_PRIMARY_EXECUTION invalidated its execution; no C1d outcome is reused. The only response input is the committed C1h normalized corpus.",
    "",
    "## Frozen provenance",
    "",
    "- C1h protocol: `723307d5ba5db3afd6ade3489cbed2bd8b25058b`; evidence: `b2d13ba799067738dee523b22e8930e97e71c5b4`.",
    "- C1h evidence-index SHA-256: `73e5ae8f9bd11ecb63d5b0da7d273655bc023da15d6674a765b125915bcb66c7`.",
    "- Materialized corpus SHA-256: `db81c5c329128eef6769fa7da210e5580c2eb6bf5c4bc690c2f1104e9b8092d4`.",
    "- Confidence model: `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`; it is loaded read-only.",
    "- Standard V2 published identity: `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`; historical product boundary: `31cc11982ebd07e009788d5e2c5c3537e9e6b615`.",
    "",
    "## Inputs and frozen groups",
    "",
    "Responses are read only from `.research-artifacts/c1h-self-contained-corpus/**`. Cache, network, upstream, raw paths, Batch C, C1d outcome artifacts, and secondary reserve outcomes are forbidden.",
    `The six primary IDs and the exact order are: ${C1G_PRIMARY_GROUP_IDS.join(', ')}.`,
    "The six secondary IDs remain `SECONDARY_RESERVE_UNEXECUTED` and never enter the gate.",
    "",
    "Each primary group has four literal-rig `711` responses. Its reference is the pointwise median on the frozen V2 grid, with no smoothing, alignment, source weighting, or non-711 input. For every non-711 response R and consensus C, `D = R - C`, truth is zero, and `desired_base = C - R = -D`.",
    "",
    "## Frozen arms",
    "",
    "- **FROZEN_BASELINE:** source R, target C, desired correction `-D`.",
    "- **CONSTANT_AUTHORITY_CONTROL:** inside 4–14 kHz, `w_bar = mean(w_conf)` and `desired_const = w_bar * desired_base`; outside, multiplier one.",
    "- **CONFIDENCE_SHAPED:** inside 4–14 kHz, `desired_conf = w_conf * desired_base`; outside, multiplier one.",
    "",
    "The equal-authority invariant is checked before the first solver call with tolerance `1e-12`. Confidence only preconditions desired correction; it is not placed in loss, ranking, candidate generation, refinement, compression, or any solver internals. Every arm uses the same resolved Standard V2 settings.",
    "",
    "## Endpoint and gates",
    "",
    "After each unchanged Standard V2 run, calculate the delivered filter cascade independently against zero. The primary endpoint is `E_arm = RMS(H_arm)` over 4,000–14,000 Hz. Observation gains are `(E_base-E_conf)/E_base` and `(E_const-E_conf)/E_const`; both must be at least 0.05 without rounding. A zero denominator is `NON_INFORMATIVE_ZERO_DENOMINATOR` and no epsilon is introduced.",
    "",
    "A group requires a strict majority of informative wins and median combined gain at least 0.05. The campaign passes only at least 4 of exactly 6 group signals. Results are `C1G_CAUSAL_INTEGRATION_REPLICATED`, `C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED`, or `INCONCLUSIVE` for an execution-integrity failure after primary start.",
    "",
    "## One-shot execution integrity",
    "",
    "All preflight checks run before rights are consumed. Immediately before the first solver call, one foreground process exclusively creates `primary-execution.lock`, then the permanent exclusive-create `primary-execution-attempt.json`, then persists `PRIMARY_STARTED`. A second invocation fails closed before any solver call. All six groups run sequentially in the frozen order and arms run BASELINE, CONSTANT_AUTHORITY, CONFIDENCE_SHAPED. Each complete group is written through a temporary file and atomic rename. The permanent marker is never deleted. The runtime lock is removed only after `PRIMARY_COMPLETE` and complete evidence writing; it remains on invalidation.",
    "",
    "## Safety",
    "",
    "The secondary reserve and Fresh Real Batch C remain untouched. The harness never changes core, production, frontend, solver code, C1f, C1h, or any prior campaign. Protocol and evidence commits are separate, and no executor/protocol patch is permitted after `PRIMARY_STARTED`.",
    "",
  ].join('\n')
}

async function runCli() {
  const mode = process.argv[2]
  if (mode === '--freeze') {
    const manifest = await writeProtocolArtifacts()
    process.stdout.write(`${JSON.stringify({ phase: manifest.phase, solverExecuted: false, primaryExecutionAttempted: false }, null, 2)}\n`)
    return
  }
  if (mode === '--preflight') {
    const freezeIndex = process.argv.indexOf('--freeze-commit')
    const freezeCommit = freezeIndex >= 0 ? process.argv[freezeIndex + 1] : undefined
    const result = await preflight({ freezeCommit })
    process.stdout.write(`${JSON.stringify({
      protocolFreezeCommit: freezeCommit,
      corpusSha256: result.corpus.materializedCorpusSha256,
      primaryCurveCount: result.corpus.primaryCurveCount,
      primaryObservationCount: result.observations.length,
      modelSha256: result.loadedModel.modelSha256,
      solverCalls: result.solverCalls,
      networkAccessAttempts: result.networkAccessAttempts,
      cacheAccessAttempts: result.cacheAccessAttempts,
    }, null, 2)}\n`)
    return
  }
  if (mode === '--execute-primary') {
    const freezeIndex = process.argv.indexOf('--freeze-commit')
    const freezeCommit = freezeIndex >= 0 ? process.argv[freezeIndex + 1] : undefined
    const result = await executePrimary({ freezeCommit })
    process.stdout.write(`${JSON.stringify({ classification: result.classification, executionUuid: result.executionUuid, state: result.state }, null, 2)}\n`)
    return
  }
  throw new Error('use --freeze, --preflight --freeze-commit <sha>, or --execute-primary --freeze-commit <sha>')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}
