import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C1A_NORMALIZATION,
  canonicalizeTerminalEndpoint,
  normalizeCurveForIntegrity,
  parseCurveCsv,
} from '../c1-cross-rig-confidence-corpus/c1a.mjs'

export const C1H_BASE_COMMIT = 'f93adaf41ac4dcf02897d5f390c911014a4fa536'
export const C1H_C1F_TOOLING_COMMIT = 'cafd24db4bb2b2cce3145c2bce5eb0d274713c06'
export const C1H_C1F_BASE_COMMIT = '3eb0329b8eee80eae8de72e268bf0e4fa4be733c'
export const C1H_C1F_EVIDENCE_COMMIT = 'f93adaf41ac4dcf02897d5f390c911014a4fa536'
export const C1H_C1F_HASH_INDEX_SHA256 = '36cc16692dd7a0cc6e45c3c138e4ed2a481ab6c5293aca0a712098f6ecb3f7b7'
export const C1H_C1F_ARTIFACT_DIR = '.research-artifacts/c1f-upstream-reserve-corpus'
export const C1H_C1F_GROUPS_PATH = `${C1H_C1F_ARTIFACT_DIR}/groups.json`
export const C1H_C1F_PROVENANCE_PATH = `${C1H_C1F_ARTIFACT_DIR}/provenance.json`
export const C1H_C1F_HASH_INDEX_PATH = `${C1H_C1F_ARTIFACT_DIR}/evidence-sha256.txt`
export const C1H_UPSTREAM_REPOSITORY = 'jaakkopasanen/AutoEq'
export const C1H_UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const C1H_UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const C1H_UPSTREAM_RAW_ROOT = `https://raw.githubusercontent.com/${C1H_UPSTREAM_REPOSITORY}/${C1H_UPSTREAM_COMMIT}`
export const C1H_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1h-self-contained-corpus'
export const C1H_CACHE_RELATIVE_DIR = '.research-cache/c1f-upstream-reserve-corpus'
export const C1H_PRIMARY_GROUP_IDS = Object.freeze([
  'c1g-251bf90cf23f557cb011',
  'c1g-c45cb51de5231139b2f2',
  'c1g-e9b56c7e332c693b6f82',
  'c1g-41b1767dc01a935198bf',
  'c1g-ba1d3af16db7a116d755',
  'c1g-1be44ee4bdbd73cbf632',
])
export const C1H_SECONDARY_GROUP_IDS = Object.freeze([
  'c1g-6cf5995d049cff49d672',
  'c1g-ccc7fd5250bd1714c73e',
  'c1g-2fd95af2a97278cf88ef',
  'c1g-256c26e3bb37c97b890a',
  'c1g-6398ddcd56119d32eb70',
  'c1g-3b112b59456722f8dabe',
])
export const C1H_SELECTED_GROUP_IDS = Object.freeze([...C1H_PRIMARY_GROUP_IDS, ...C1H_SECONDARY_GROUP_IDS])
export const C1H_PRIMARY_CURVE_COUNT = 31
export const C1H_PARSER_CANONICALIZER_VERSION = 1
export const C1H_NORMALIZATION = Object.freeze({ ...C1A_NORMALIZATION })

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  return value
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')
}

function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function encodedUpstreamUrl(path) {
  return `${C1H_UPSTREAM_RAW_ROOT}/${String(path).split('/').map(encodeURIComponent).join('/')}`
}

function memberKey(record) {
  return `${record.concreteCurveIdentity ?? ''}|${record.path ?? ''}`
}

function sortedMembers(members) {
  return [...members].sort((left, right) => memberKey(left).localeCompare(memberKey(right)))
}

export function assertFrozenSelection(primaryGroupIds, secondaryGroupIds) {
  const primary = JSON.stringify(primaryGroupIds)
  const secondary = JSON.stringify(secondaryGroupIds)
  if (primary !== JSON.stringify(C1H_PRIMARY_GROUP_IDS)) throw new Error('primary selection mismatch')
  if (secondary !== JSON.stringify(C1H_SECONDARY_GROUP_IDS)) throw new Error('secondary selection mismatch')
  if (new Set([...primaryGroupIds, ...secondaryGroupIds]).size !== 12) throw new Error('selected group IDs overlap')
  return true
}

export function assertNoRawUpstreamArtifactPath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (normalized.includes('/raw/') || /\.csv$/i.test(normalized) || /(^|\/)(?:upstream|raw)[^/]*\.(?:txt)$/i.test(normalized) || normalized.includes('.research-cache/')) {
    throw new Error(`raw upstream bytes cannot be written to final artifact path: ${normalized}`)
  }
  return true
}

export function assertNoBatchCPath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (normalized === '.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json' || normalized.startsWith('.research-artifacts/fresh-real-corpus-v1-metadata-repair/') || normalized.includes('/.research-artifacts/fresh-real-corpus-v1-metadata-repair/')) {
    throw new Error(`Batch C seal: path access forbidden: ${normalized}`)
  }
  return true
}

export function createArtifactHashIndex(files) {
  const names = Object.keys(files).filter((name) => name !== 'evidence-sha256.txt').sort()
  const lines = ['artifact-hash-index-v1']
  for (const name of names) {
    if (files[name] === undefined) throw new Error(`missing artifact for hash index: ${name}`)
    lines.push(`${sha256(files[name])}  ${name}`)
  }
  return `${lines.join('\n')}\n`
}

export function verifyC1fEvidenceHashIndex(files, indexText, { requireFrozenHash = true } = {}) {
  const actualIndexHash = sha256(indexText)
  if (requireFrozenHash && actualIndexHash !== C1H_C1F_HASH_INDEX_SHA256) throw new Error(`C1f artifact hash-index SHA-256 mismatch: ${actualIndexHash}`)
  const lines = String(indexText).trimEnd().split('\n')
  if (lines.shift() !== 'artifact-hash-index-v1') throw new Error('C1f artifact hash-index marker mismatch')
  const expected = createArtifactHashIndex(files).trimEnd().split('\n').slice(1)
  if (JSON.stringify(lines) !== JSON.stringify(expected)) throw new Error('C1f artifact hash mismatch')
  return true
}

function c1fIntegrityFrom(member, provenance) {
  const integrity = member.integrity ?? {}
  const expected = {
    upstreamSha256: integrity.upstreamSha256,
    originalParsedPointsSha256: integrity.originalParsedPointsSha256,
    canonicalParsedPointsSha256: integrity.canonicalParsedPointsSha256,
    normalizedParsedPointsSha256: integrity.normalizedParsedPointsSha256,
    endpointTransformation: integrity.transformation ?? null,
    normalization: integrity.normalization ?? C1H_NORMALIZATION,
    parserCanonicalizerVersion: integrity.parserCanonicalizerVersion ?? C1H_PARSER_CANONICALIZER_VERSION,
    byteLength: integrity.byteLength ?? null,
    originalPointCount: integrity.originalPointCount ?? null,
    canonicalPointCount: integrity.canonicalPointCount ?? null,
  }
  for (const key of ['upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256']) {
    if (expected[key] !== provenance[key]) throw new Error(`C1f provenance ${key} mismatch for ${member.concreteCurveIdentity}`)
  }
  if ((provenance.endpointTransformation ?? null) !== expected.endpointTransformation) throw new Error(`C1f provenance endpoint transformation mismatch for ${member.concreteCurveIdentity}`)
  return expected
}

export function verifyCurveIntegrity(curve) {
  if (!curve || !Array.isArray(curve.frequencyHz) || !Array.isArray(curve.normalizedDb)) throw new Error('materialized curve arrays missing')
  if (curve.frequencyHz.length !== curve.normalizedDb.length || curve.frequencyHz.length < 2) throw new Error('materialized curve point count mismatch')
  const normalizedPoints = curve.frequencyHz.map((frequency, index) => [frequency, curve.normalizedDb[index]])
  if (normalizedPoints.some(([frequency, db]) => !Number.isFinite(frequency) || !Number.isFinite(db))) throw new Error(`materialized curve contains non-finite point: ${curve.concreteCurveIdentity}`)
  for (let index = 1; index < normalizedPoints.length; index += 1) {
    if (normalizedPoints[index - 1][0] >= normalizedPoints[index][0]) throw new Error(`materialized curve frequencies are not strictly increasing: ${curve.concreteCurveIdentity}`)
  }
  const actualNormalized = sha256(JSON.stringify(normalizedPoints))
  if (actualNormalized !== curve.normalizedParsedPointsSha256) throw new Error(`normalized parsed hash mismatch for ${curve.concreteCurveIdentity}`)
  const expectedCurveHash = curveMaterialHash(curve)
  if (expectedCurveHash !== curve.curveHash) throw new Error(`materialized curve hash mismatch for ${curve.concreteCurveIdentity}`)
  return true
}

function curveMaterialHashInput(curve) {
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

export function curveMaterialHash(curve) {
  return sha256(stableJson(curveMaterialHashInput(curve)))
}

export function buildMaterializedCurve(member, originalPoints, canonicalPoints, normalizedPoints, anchorDb = null, cacheHit = false) {
  if (!Array.isArray(normalizedPoints)) throw new Error('normalized points required')
  const frequencyHz = normalizedPoints.map(([frequency]) => frequency)
  const normalizedDb = normalizedPoints.map(([, db]) => db)
  const curve = {
    schemaVersion: 1,
    groupId: member.groupId,
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
    blobSha: member.blobSha,
    upstreamSha256: member.upstreamSha256,
    originalParsedPointsSha256: member.originalParsedPointsSha256,
    canonicalParsedPointsSha256: member.canonicalParsedPointsSha256,
    normalizedParsedPointsSha256: member.normalizedParsedPointsSha256,
    endpointTransformation: member.endpointTransformation ?? null,
    normalization: member.normalization ?? C1H_NORMALIZATION,
    parserCanonicalizerVersion: member.parserCanonicalizerVersion ?? C1H_PARSER_CANONICALIZER_VERSION,
    frequencyHz,
    normalizedDb,
    pointCount: normalizedPoints.length,
    originalPointCount: member.originalPointCount ?? originalPoints.length,
    canonicalPointCount: member.canonicalPointCount ?? canonicalPoints.length,
  }
  curve.curveHash = curveMaterialHash(curve)
  verifyCurveIntegrity(curve)
  return curve
}

export function buildGroupArtifact({ group, role, members }) {
  const orderedMembers = sortedMembers(members)
  const exact711 = orderedMembers.filter((member) => member.rig === '711')
  const non711 = orderedMembers.filter((member) => member.rig !== '711')
  const artifact = {
    schemaVersion: 1,
    groupId: group.groupId,
    role,
    manufacturer: group.manufacturer,
    model: group.model,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    canonicalIdentity: group.canonicalIdentity,
    canonicalFamily: group.canonicalFamily,
    aliases: group.aliases ?? [],
    exact711ObservationIdentities: exact711.map((member) => member.concreteCurveIdentity),
    non711ObservationIdentities: non711.map((member) => member.concreteCurveIdentity),
    exact711Count: exact711.length,
    non711Count: non711.length,
    non711RigClasses: [...new Set(non711.map((member) => member.rigClass))].sort(),
    members: orderedMembers,
    c1f: {
      evidenceCommit: C1H_C1F_EVIDENCE_COMMIT,
      groupId: group.groupId,
      sourcePath: C1H_C1F_GROUPS_PATH,
      provenancePath: C1H_C1F_PROVENANCE_PATH,
    },
  }
  artifact.groupHash = sha256(stableJson({ ...artifact, groupHash: undefined }))
  return artifact
}

export function buildCorpusHash({ primaryGroupIds, secondaryGroupIds, groups, c1fEvidenceCommit, c1fHashIndex, upstreamCommit, upstreamTree, parserCanonicalizerVersion }) {
  const groupHashes = [...groups].sort((left, right) => left.groupId.localeCompare(right.groupId)).map((group) => ({ groupId: group.groupId, groupHash: group.groupHash }))
  return sha256(stableJson({
    schemaVersion: 1,
    primaryGroupIds: [...primaryGroupIds].sort(),
    secondaryGroupIds: [...secondaryGroupIds].sort(),
    groupHashes,
    c1fEvidenceCommit,
    c1fHashIndex,
    upstreamCommit,
    upstreamTree,
    parserCanonicalizerVersion,
  }))
}

async function readJson(repoRoot, path) {
  assertNoBatchCPath(path)
  return JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'))
}

async function readBuffer(repoRoot, path) {
  assertNoBatchCPath(path)
  return readFile(resolve(repoRoot, path))
}

export function assertC1fSourceIdentity({ evidenceCommit, hashIndexSha256, upstreamCommit, upstreamTree }) {
  if (evidenceCommit !== C1H_C1F_EVIDENCE_COMMIT) throw new Error('C1f evidence commit mismatch')
  if (hashIndexSha256 !== C1H_C1F_HASH_INDEX_SHA256) throw new Error('C1f hash-index mismatch')
  if (upstreamCommit !== C1H_UPSTREAM_COMMIT || upstreamTree !== C1H_UPSTREAM_TREE) throw new Error('upstream pin mismatch')
  return true
}

export function assertSelectedGroups(groupsById) {
  for (const groupId of C1H_SELECTED_GROUP_IDS) {
    if (!groupsById.has(groupId)) throw new Error(`selected C1f group missing: ${groupId}`)
  }
  return true
}

export function assertPrimaryMaterializationCounts(groups) {
  const primary = groups.filter((group) => group.role === 'PRIMARY')
  const count = primary.reduce((total, group) => total + (group.members?.length ?? 0), 0)
  if (primary.length !== C1H_PRIMARY_GROUP_IDS.length || count !== C1H_PRIMARY_CURVE_COUNT) throw new Error(`primary materialization count mismatch: groups=${primary.length}, curves=${count}`)
  return true
}

async function loadC1fInputs(repoRoot) {
  const names = ['manifest.json', 'groups.json', 'provenance.json', 'reserve-universe.json', 'independence-matrix.json', 'rig-inventory.json', 'selection-protocol.md', 'final-report.md']
  const files = {}
  for (const name of names) files[name] = await readBuffer(repoRoot, `${C1H_C1F_ARTIFACT_DIR}/${name}`)
  const indexText = await readFile(resolve(repoRoot, C1H_C1F_HASH_INDEX_PATH), 'utf8')
  verifyC1fEvidenceHashIndex(files, indexText, { requireFrozenHash: true })
  const manifest = JSON.parse(files['manifest.json'].toString('utf8'))
  if (manifest.classification !== 'C1F_CORPUS_READY') throw new Error(`C1f source classification mismatch: ${manifest.classification}`)
  if (manifest.baseCommit !== C1H_C1F_BASE_COMMIT) throw new Error(`C1f base commit mismatch: ${manifest.baseCommit}`)
  if (manifest.upstream?.commit !== C1H_UPSTREAM_COMMIT || manifest.upstream?.tree !== C1H_UPSTREAM_TREE) throw new Error('C1f upstream pin mismatch')
  const groups = JSON.parse(files['groups.json'].toString('utf8'))
  const provenance = JSON.parse(files['provenance.json'].toString('utf8'))
  assertFrozenSelection(C1H_PRIMARY_GROUP_IDS, C1H_SECONDARY_GROUP_IDS)
  const groupsById = new Map((groups.groups ?? []).map((group) => [group.groupId, group]))
  const provenanceByKey = new Map((provenance.records ?? []).map((record) => [`${record.groupId}|${record.concreteCurveIdentity}`, record]))
  assertC1fSourceIdentity({ evidenceCommit: C1H_C1F_EVIDENCE_COMMIT, hashIndexSha256: sha256(indexText), upstreamCommit: manifest.upstream?.commit, upstreamTree: manifest.upstream?.tree })
  assertSelectedGroups(groupsById)
  return { manifest, groupsById, provenanceByKey, c1fIndexSha256: sha256(indexText), indexText }
}

async function cachedBytes(cacheRoot, path, expected) {
  if (!cacheRoot) return null
  const cachePath = resolve(cacheRoot, sha256(path))
  try {
    const bytes = await readFile(cachePath)
    if (expected.byteLength !== null && bytes.length !== expected.byteLength) return null
    if (expected.blobSha && gitBlobSha1(bytes) !== expected.blobSha) return null
    if (expected.upstreamSha256 && sha256(bytes) !== expected.upstreamSha256) return null
    return { bytes, cacheHit: true }
  } catch {
    return null
  }
}

async function immutableBytes(path, expected, fetchImpl, cacheRoot) {
  const fromCache = await cachedBytes(cacheRoot, path, expected)
  if (fromCache) return fromCache
  if (typeof fetchImpl !== 'function') throw new Error(`immutable source unavailable without fetch implementation: ${path}`)
  const response = await fetchImpl(encodedUpstreamUrl(path), { redirect: 'error', headers: { 'User-Agent': 'autoeq-workbench-c1h' } })
  if (!response?.ok) throw new Error(`immutable upstream fetch failed: ${response?.status ?? 'unknown'}: ${path}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error(`immutable upstream returned empty bytes: ${path}`)
  if (expected.byteLength !== null && bytes.length !== expected.byteLength) throw new Error(`source byte length mismatch: ${path}`)
  if (expected.blobSha && gitBlobSha1(bytes) !== expected.blobSha) throw new Error(`source Git blob SHA-1 mismatch: ${path}`)
  if (expected.upstreamSha256 && sha256(bytes) !== expected.upstreamSha256) throw new Error(`source SHA-256 mismatch: ${path}`)
  if (cacheRoot) {
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(resolve(cacheRoot, sha256(path)), bytes)
  }
  return { bytes, cacheHit: false }
}

export function verifyRawDerivedHashes(member, expected, bytes) {
  if (sha256(bytes) !== expected.upstreamSha256) throw new Error(`upstream SHA-256 mismatch for ${member.concreteCurveIdentity}`)
  const originalPoints = parseCurveCsv(bytes.toString('utf8'))
  if (sha256(JSON.stringify(originalPoints)) !== expected.originalParsedPointsSha256) throw new Error(`original parsed hash mismatch for ${member.concreteCurveIdentity}`)
  const closed = canonicalizeTerminalEndpoint(originalPoints)
  if (sha256(JSON.stringify(closed.points)) !== expected.canonicalParsedPointsSha256) throw new Error(`canonical parsed hash mismatch for ${member.concreteCurveIdentity}`)
  const normalized = normalizeCurveForIntegrity(closed.points, C1H_NORMALIZATION)
  if (sha256(JSON.stringify(normalized.normalizedPoints)) !== expected.normalizedParsedPointsSha256) throw new Error(`normalized parsed hash mismatch for ${member.concreteCurveIdentity}`)
  if (expected.endpointTransformation !== (closed.transformation ?? null)) throw new Error(`endpoint transformation mismatch for ${member.concreteCurveIdentity}`)
  return { originalPoints, canonicalPoints: closed.points, normalizedPoints: normalized.normalizedPoints, anchorDb: normalized.anchorDb }
}

async function writeAtomic(path, contents) {
  assertNoRawUpstreamArtifactPath(relative(process.cwd(), path))
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`
  await writeFile(temporary, contents)
  await rename(temporary, path)
}

function expectedFromMember(member, provenance) {
  return c1fIntegrityFrom(member, provenance)
}

export async function materializeC1h({ repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), cacheRoot = resolve(repoRoot, C1H_CACHE_RELATIVE_DIR), outputRoot = resolve(repoRoot, C1H_ARTIFACT_RELATIVE_DIR), fetchImpl = globalThis.fetch, writeArtifacts = true } = {}) {
  const { manifest: c1fManifest, groupsById, provenanceByKey, c1fIndexSha256 } = await loadC1fInputs(repoRoot)
  const roleFor = (groupId) => C1H_PRIMARY_GROUP_IDS.includes(groupId) ? 'PRIMARY' : C1H_SECONDARY_GROUP_IDS.includes(groupId) ? 'SECONDARY_RESERVE_UNEXECUTED' : null
  const materializedGroups = []
  const provenanceRecords = []
  const cacheStats = { cacheHits: 0, immutableRehydrations: 0, sourceHashMismatches: [] }
  for (const groupId of C1H_SELECTED_GROUP_IDS) {
    const group = groupsById.get(groupId)
    const role = roleFor(groupId)
    const members = []
    for (const member of sortedMembers(group.members ?? [])) {
      const provenance = provenanceByKey.get(`${groupId}|${member.concreteCurveIdentity}`)
      if (!provenance) throw new Error(`C1f provenance record missing: ${groupId}|${member.concreteCurveIdentity}`)
      const expected = expectedFromMember(member, provenance)
      if (member.integrity?.status !== 'valid' || provenance.integrityStatus !== 'valid') throw new Error(`C1f integrity status invalid: ${member.concreteCurveIdentity}`)
      const sourcePath = member.path
      let fetched
      try {
        fetched = await immutableBytes(sourcePath, { ...expected, blobSha: member.blobSha }, fetchImpl, cacheRoot)
      } catch (error) {
        if (/SHA|hash|length/.test(String(error?.message ?? ''))) cacheStats.sourceHashMismatches.push({ path: sourcePath, reason: String(error.message) })
        throw error
      }
      const derived = verifyRawDerivedHashes(member, expected, fetched.bytes)
      if (fetched.cacheHit) cacheStats.cacheHits += 1
      else cacheStats.immutableRehydrations += 1
      const curve = buildMaterializedCurve({
        ...member,
        groupId,
        upstreamSha256: expected.upstreamSha256,
        originalParsedPointsSha256: expected.originalParsedPointsSha256,
        canonicalParsedPointsSha256: expected.canonicalParsedPointsSha256,
        normalizedParsedPointsSha256: expected.normalizedParsedPointsSha256,
        endpointTransformation: expected.endpointTransformation,
        normalization: expected.normalization,
        parserCanonicalizerVersion: expected.parserCanonicalizerVersion,
        originalPointCount: expected.originalPointCount,
        canonicalPointCount: expected.canonicalPointCount,
      }, derived.originalPoints, derived.canonicalPoints, derived.normalizedPoints, derived.anchorDb, fetched.cacheHit)
      curve.upstreamPath = sourcePath
      curve.upstreamRepository = C1H_UPSTREAM_REPOSITORY
      curve.upstreamCommit = C1H_UPSTREAM_COMMIT
      curve.upstreamTree = C1H_UPSTREAM_TREE
      curve.sourceUrls = member.sourceUrls ?? []
      curve.sourceRows = member.sourceRows ?? []
      // Recompute after adding provenance fields is intentionally avoided: these
      // fields are descriptive links, not part of the normalized curve identity.
      members.push(curve)
      provenanceRecords.push({
        groupId,
        concreteCurveIdentity: member.concreteCurveIdentity,
        collection: member.collection,
        path: member.path,
        blobSha: member.blobSha,
        upstreamSha256: expected.upstreamSha256,
        originalParsedPointsSha256: expected.originalParsedPointsSha256,
        canonicalParsedPointsSha256: expected.canonicalParsedPointsSha256,
        normalizedParsedPointsSha256: expected.normalizedParsedPointsSha256,
        endpointTransformation: expected.endpointTransformation,
        normalization: expected.normalization,
        parserCanonicalizerVersion: expected.parserCanonicalizerVersion,
      })
    }
    const artifact = buildGroupArtifact({ group, role, members })
    materializedGroups.push(artifact)
    if (writeArtifacts) await writeAtomic(join(outputRoot, `group-${groupId}.json`), json(artifact))
  }
  const primaryGroups = materializedGroups.filter((group) => group.role === 'PRIMARY')
  const primaryCurveCount = primaryGroups.reduce((count, group) => count + group.members.length, 0)
  assertPrimaryMaterializationCounts(materializedGroups)
  const corpusSha256 = buildCorpusHash({ primaryGroupIds: C1H_PRIMARY_GROUP_IDS, secondaryGroupIds: C1H_SECONDARY_GROUP_IDS, groups: materializedGroups, c1fEvidenceCommit: C1H_C1F_EVIDENCE_COMMIT, c1fHashIndex: c1fIndexSha256, upstreamCommit: C1H_UPSTREAM_COMMIT, upstreamTree: C1H_UPSTREAM_TREE, parserCanonicalizerVersion: C1H_PARSER_CANONICALIZER_VERSION })
  const index = {
    schemaVersion: 1,
    classification: 'C1H_CORPUS_SELF_CONTAINED',
    primaryGroupIds: [...C1H_PRIMARY_GROUP_IDS],
    secondaryGroupIds: [...C1H_SECONDARY_GROUP_IDS],
    groups: materializedGroups.map((group) => ({ groupId: group.groupId, role: group.role, groupHash: group.groupHash, memberCount: group.members.length })).sort((left, right) => left.groupId.localeCompare(right.groupId)),
    primaryCurveCount,
    secondaryCurveCount: materializedGroups.filter((group) => group.role === 'SECONDARY_RESERVE_UNEXECUTED').reduce((count, group) => count + group.members.length, 0),
    materializedCorpusSha256: corpusSha256,
    c1fEvidenceCommit: C1H_C1F_EVIDENCE_COMMIT,
    c1fHashIndexSha256: c1fIndexSha256,
    upstream: { repository: C1H_UPSTREAM_REPOSITORY, commit: C1H_UPSTREAM_COMMIT, tree: C1H_UPSTREAM_TREE },
    parserCanonicalizerVersion: C1H_PARSER_CANONICALIZER_VERSION,
  }
  const outputManifest = {
    schemaVersion: 1,
    campaign: 'C1h',
    classification: 'C1H_CORPUS_SELF_CONTAINED',
    baseCommit: C1H_BASE_COMMIT,
    c1f: {
      classification: c1fManifest.classification,
      evidenceCommit: C1H_C1F_EVIDENCE_COMMIT,
      toolingCommit: C1H_C1F_TOOLING_COMMIT,
      hashIndexSha256: c1fIndexSha256,
      expectedHashIndexSha256: C1H_C1F_HASH_INDEX_SHA256,
    },
    upstream: { repository: C1H_UPSTREAM_REPOSITORY, commit: C1H_UPSTREAM_COMMIT, tree: C1H_UPSTREAM_TREE },
    primaryGroupIds: [...C1H_PRIMARY_GROUP_IDS],
    secondaryGroupIds: [...C1H_SECONDARY_GROUP_IDS],
    primaryCurveCount,
    secondaryCurveCount: index.secondaryCurveCount,
    materializedCorpusSha256: corpusSha256,
    parserCanonicalizerVersion: C1H_PARSER_CANONICALIZER_VERSION,
    normalization: C1H_NORMALIZATION,
    cacheHits: cacheStats.cacheHits,
    immutableRehydrations: cacheStats.immutableRehydrations,
    sourceHashMismatches: cacheStats.sourceHashMismatches,
    sourceC1fClassification: 'C1F_CORPUS_READY',
    primarySelectionChanged: false,
    secondarySelectionChanged: false,
    solverExecuted: false,
    causalOutcomesGenerated: false,
    confidenceMetricsComputed: false,
    disagreementMetricsComputed: false,
    batchCAccessAttempts: 0,
    batchCAccessed: false,
    batchCExecuted: false,
    rawUpstreamBytesCommitted: false,
    normalizedResponsePointsCommitted: true,
    selfContainedVerificationPassed: false,
    selfContainedVerificationNetworkAccess: false,
    selfContainedVerificationCacheAccess: false,
    productionModified: false,
    coreModified: false,
  }
  const provenanceArtifact = {
    schemaVersion: 1,
    upstream: { repository: C1H_UPSTREAM_REPOSITORY, commit: C1H_UPSTREAM_COMMIT, tree: C1H_UPSTREAM_TREE },
    c1f: { evidenceCommit: C1H_C1F_EVIDENCE_COMMIT, hashIndexSha256: c1fIndexSha256, groupsPath: C1H_C1F_GROUPS_PATH, provenancePath: C1H_C1F_PROVENANCE_PATH },
    rawDataPolicy: 'raw upstream bytes are cache-only and never committed; normalized response points are the committed research representation',
    records: provenanceRecords.sort((left, right) => `${left.groupId}|${left.concreteCurveIdentity}`.localeCompare(`${right.groupId}|${right.concreteCurveIdentity}`)),
  }
  const schema = {
    schemaVersion: 1,
    description: 'C1h self-contained normalized individual response corpus; no causal quantities are materialized.',
    groupFiles: 'group-<groupId>.json',
    curveFields: ['frequencyHz', 'normalizedDb', 'normalizedParsedPointsSha256', 'curveHash', 'normalization', 'provenance'],
    pointEncoding: 'parallel frequencyHz and normalizedDb arrays; JSON numeric values preserve C1f parsed representation',
    hashSerialization: 'stable JSON with recursively sorted object keys and array order preserved',
  }
  if (writeArtifacts) {
    await writeAtomic(join(outputRoot, 'schema.json'), json(schema))
    await writeAtomic(join(outputRoot, 'provenance.json'), json(provenanceArtifact))
    await writeAtomic(join(outputRoot, 'materialized-index.json'), json(index))
    await writeAtomic(join(outputRoot, 'manifest.json'), json(outputManifest))
    const pendingVerification = await verifySelfContainedCorpus({ repoRoot, artifactRoot: outputRoot })
    if (pendingVerification.classification !== 'C1H_CORPUS_SELF_CONTAINED') throw new Error('self-contained verification failed after materialization')
    outputManifest.selfContainedVerificationPassed = true
    outputManifest.selfContainedVerificationNetworkAccess = false
    outputManifest.selfContainedVerificationCacheAccess = false
    await writeAtomic(join(outputRoot, 'manifest.json'), json(outputManifest))
    const report = makeFinalReport({ manifest: outputManifest, index, cacheStats, corpusSha256 })
    await writeAtomic(join(outputRoot, 'final-report.md'), report)
    const artifactNames = ['final-report.md', 'group-c1g-1be44ee4bdbd73cbf632.json', 'group-c1g-251bf90cf23f557cb011.json', 'group-c1g-256c26e3bb37c97b890a.json', 'group-c1g-2fd95af2a97278cf88ef.json', 'group-c1g-3b112b59456722f8dabe.json', 'group-c1g-41b1767dc01a935198bf.json', 'group-c1g-6398ddcd56119d32eb70.json', 'group-c1g-6cf5995d049cff49d672.json', 'group-c1g-ba1d3af16db7a116d755.json', 'group-c1g-c45cb51de5231139b2f2.json', 'group-c1g-ccc7fd5250bd1714c73e.json', 'group-c1g-e9b56c7e332c693b6f82.json', 'manifest.json', 'materialized-index.json', 'provenance.json', 'schema.json']
    const files = {}
    for (const name of artifactNames) files[name] = await readFile(join(outputRoot, name))
    await writeAtomic(join(outputRoot, 'evidence-sha256.txt'), createArtifactHashIndex(files))
  }
  return { classification: 'C1H_CORPUS_SELF_CONTAINED', manifest: outputManifest, index, groups: materializedGroups, provenance: provenanceArtifact, cacheStats, corpusSha256 }
}

function makeFinalReport({ manifest, index, cacheStats, corpusSha256 }) {
  const lines = [
    '# C1h — Self-Contained C1f Corpus Materialization',
    '',
    `- Classification: **${manifest.classification}**`,
    `- Base commit: \`${manifest.baseCommit}\``,
    `- C1f evidence commit: \`${manifest.c1f.evidenceCommit}\``,
    `- C1f artifact hash index: \`${manifest.c1f.hashIndexSha256}\``,
    `- Frozen upstream: \`${manifest.upstream.repository}@${manifest.upstream.commit}\` (tree \`${manifest.upstream.tree}\`)`,
    `- Materialized corpus SHA-256: \`${corpusSha256}\``,
    '',
    '## Materialization',
    '',
    `- Groups materialized: ${index.groups.length} (6 primary, 6 secondary reserve).`,
    `- Primary curves: ${index.primaryCurveCount}; secondary curves: ${index.secondaryCurveCount}.`,
    `- Cache hits: ${cacheStats.cacheHits}; immutable upstream rehydrations: ${cacheStats.immutableRehydrations}.`,
    `- Source hash mismatches: ${cacheStats.sourceHashMismatches.length}.`,
    '',
    '## Safety',
    '',
    '- Corpus-only materialization completed; no scientific execution ran.',
    '- No raw upstream response bytes were committed; normalized response points are the only committed numeric representation.',
    '- Batch C was not accessed and remains sealed.',
    '- Primary and secondary membership remained exactly the frozen C1f selection.',
    '- Final verification is performed separately from committed artifacts and does not read cache or network.',
    '',
    `**${manifest.classification}**`,
    '',
  ]
  return lines.join('\n')
}

export async function verifySelfContainedCorpus({ repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), artifactRoot = resolve(repoRoot, C1H_ARTIFACT_RELATIVE_DIR) } = {}) {
  // This function deliberately has no fetch and never reads .research-cache.
  if (String(artifactRoot).replaceAll('\\', '/').includes('.research-cache')) throw new Error('self-contained verifier cannot read cache')
  const readArtifact = async (name) => {
    assertNoBatchCPath(name)
    if (name.includes('.research-cache')) throw new Error('self-contained verifier cannot read cache')
    return readFile(join(artifactRoot, name))
  }
  const manifest = JSON.parse((await readArtifact('manifest.json')).toString('utf8'))
  const index = JSON.parse((await readArtifact('materialized-index.json')).toString('utf8'))
  const provenance = JSON.parse((await readArtifact('provenance.json')).toString('utf8'))
  const schema = JSON.parse((await readArtifact('schema.json')).toString('utf8'))
  if (manifest.classification !== 'C1H_CORPUS_SELF_CONTAINED') throw new Error(`manifest classification mismatch: ${manifest.classification}`)
  assertFrozenSelection(manifest.primaryGroupIds, manifest.secondaryGroupIds)
  if (manifest.c1f?.evidenceCommit !== C1H_C1F_EVIDENCE_COMMIT || manifest.c1f?.hashIndexSha256 !== C1H_C1F_HASH_INDEX_SHA256) throw new Error('C1f linkage mismatch')
  if (manifest.upstream?.commit !== C1H_UPSTREAM_COMMIT || manifest.upstream?.tree !== C1H_UPSTREAM_TREE) throw new Error('upstream linkage mismatch')
  if (manifest.solverExecuted !== false || manifest.causalOutcomesGenerated !== false || manifest.confidenceMetricsComputed !== false || manifest.disagreementMetricsComputed !== false) throw new Error('scientific execution flag invalid')
  if (manifest.batchCAccessAttempts !== 0 || manifest.batchCAccessed !== false || manifest.batchCExecuted !== false) throw new Error('Batch C safety flag invalid')
  if (manifest.rawUpstreamBytesCommitted !== false || manifest.normalizedResponsePointsCommitted !== true) throw new Error('raw/numeric materialization flags invalid')
  if (schema.schemaVersion !== 1 || provenance.c1f?.evidenceCommit !== C1H_C1F_EVIDENCE_COMMIT) throw new Error('artifact schema/provenance mismatch')
  const provenanceByKey = new Map((provenance.records ?? []).map((record) => [`${record.groupId}|${record.concreteCurveIdentity}`, record]))
  const observedProvenanceKeys = new Set()
  const groupMap = new Map()
  for (const entry of index.groups ?? []) {
    if (groupMap.has(entry.groupId)) throw new Error(`duplicate materialized group: ${entry.groupId}`)
    const group = JSON.parse((await readArtifact(`group-${entry.groupId}.json`)).toString('utf8'))
    if (group.groupId !== entry.groupId || group.groupHash !== entry.groupHash) throw new Error(`group index mismatch: ${entry.groupId}`)
    const expectedRole = C1H_PRIMARY_GROUP_IDS.includes(entry.groupId) ? 'PRIMARY' : C1H_SECONDARY_GROUP_IDS.includes(entry.groupId) ? 'SECONDARY_RESERVE_UNEXECUTED' : null
    if (group.role !== expectedRole) throw new Error(`group role mismatch: ${entry.groupId}`)
    if (group.members.length !== entry.memberCount) throw new Error(`group member count mismatch: ${entry.groupId}`)
    for (const member of group.members) {
      verifyCurveIntegrity(member)
      if (!C1H_SELECTED_GROUP_IDS.includes(member.groupId)) throw new Error(`unexpected member group: ${member.groupId}`)
      if (member.upstreamCommit !== C1H_UPSTREAM_COMMIT || member.upstreamTree !== C1H_UPSTREAM_TREE) throw new Error(`member upstream linkage mismatch: ${member.concreteCurveIdentity}`)
      if (member.normalization?.mode !== 'hz' || member.normalization?.frequencyHz !== 500 || member.normalization?.levelDb !== 60) throw new Error(`normalization metadata mismatch: ${member.concreteCurveIdentity}`)
      if (!Number.isInteger(member.pointCount) || member.pointCount !== member.frequencyHz.length) throw new Error(`point count mismatch: ${member.concreteCurveIdentity}`)
      const provenanceRecord = provenanceByKey.get(`${member.groupId}|${member.concreteCurveIdentity}`)
      if (!provenanceRecord) throw new Error(`provenance record missing: ${member.concreteCurveIdentity}`)
      for (const key of ['collection', 'path', 'blobSha', 'upstreamSha256', 'originalParsedPointsSha256', 'canonicalParsedPointsSha256', 'normalizedParsedPointsSha256', 'endpointTransformation']) {
        if ((provenanceRecord[key] ?? null) !== (member[key] ?? null)) throw new Error(`provenance linkage mismatch for ${member.concreteCurveIdentity}: ${key}`)
      }
      if (stableJson(provenanceRecord.normalization) !== stableJson(member.normalization) || provenanceRecord.parserCanonicalizerVersion !== member.parserCanonicalizerVersion) throw new Error(`provenance normalization mismatch: ${member.concreteCurveIdentity}`)
      observedProvenanceKeys.add(`${member.groupId}|${member.concreteCurveIdentity}`)
    }
    const expectedGroupHash = sha256(stableJson({ ...group, groupHash: undefined }))
    if (expectedGroupHash !== group.groupHash) throw new Error(`group hash mismatch: ${entry.groupId}`)
    groupMap.set(entry.groupId, group)
  }
  assertFrozenSelection([...groupMap.values()].filter((group) => group.role === 'PRIMARY').map((group) => group.groupId).sort((a, b) => C1H_PRIMARY_GROUP_IDS.indexOf(a) - C1H_PRIMARY_GROUP_IDS.indexOf(b)), [...groupMap.values()].filter((group) => group.role === 'SECONDARY_RESERVE_UNEXECUTED').map((group) => group.groupId).sort((a, b) => C1H_SECONDARY_GROUP_IDS.indexOf(a) - C1H_SECONDARY_GROUP_IDS.indexOf(b)))
  if (observedProvenanceKeys.size !== (provenance.records ?? []).length) throw new Error('provenance contains missing or unexpected records')
  const primaryGroups = [...groupMap.values()].filter((group) => group.role === 'PRIMARY')
  const secondaryGroups = [...groupMap.values()].filter((group) => group.role === 'SECONDARY_RESERVE_UNEXECUTED')
  const primaryCurveCount = primaryGroups.reduce((count, group) => count + group.members.length, 0)
  if (primaryGroups.length !== 6 || primaryCurveCount !== C1H_PRIMARY_CURVE_COUNT) throw new Error(`primary corpus count mismatch: ${primaryCurveCount}`)
  if (secondaryGroups.length !== 6) throw new Error(`secondary corpus count mismatch: ${secondaryGroups.length}`)
  if (new Set(primaryGroups.flatMap((group) => group.members.filter((member) => member.rig !== '711').map((member) => member.rigClass))).size < 2) throw new Error('primary rig diversity mismatch')
  const expectedCorpusSha = buildCorpusHash({ primaryGroupIds: C1H_PRIMARY_GROUP_IDS, secondaryGroupIds: C1H_SECONDARY_GROUP_IDS, groups: [...groupMap.values()], c1fEvidenceCommit: C1H_C1F_EVIDENCE_COMMIT, c1fHashIndex: C1H_C1F_HASH_INDEX_SHA256, upstreamCommit: C1H_UPSTREAM_COMMIT, upstreamTree: C1H_UPSTREAM_TREE, parserCanonicalizerVersion: C1H_PARSER_CANONICALIZER_VERSION })
  if (expectedCorpusSha !== manifest.materializedCorpusSha256 || expectedCorpusSha !== index.materializedCorpusSha256) throw new Error('materialized corpus hash mismatch')
  if (manifest.selfContainedVerificationNetworkAccess !== false || manifest.selfContainedVerificationCacheAccess !== false) throw new Error('self-contained access flags invalid')
  return { classification: 'C1H_CORPUS_SELF_CONTAINED', primaryGroupCount: primaryGroups.length, secondaryGroupCount: secondaryGroups.length, primaryCurveCount, secondaryCurveCount: secondaryGroups.reduce((count, group) => count + group.members.length, 0), materializedCorpusSha256: expectedCorpusSha, cacheAccessAttempts: 0, networkAccessAttempts: 0 }
}

export async function runVerificationCli() {
  return verifySelfContainedCorpus()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verify')) {
    verifySelfContainedCorpus().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
  } else {
    materializeC1h().then((result) => process.stdout.write(`${JSON.stringify({ classification: result.classification, primaryCurveCount: result.index.primaryCurveCount, secondaryCurveCount: result.index.secondaryCurveCount, corpusSha256: result.corpusSha256 }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
  }
}
