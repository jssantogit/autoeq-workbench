import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE_COMMIT = '4e86e95ce09e0c8d149be3307d0fcfc2d3b40ff8'
export const C1D_FROZEN_PROTOCOL_COMMIT = 'b5606dc7b3aa2dd3917af2be817ca98d24649907'
export const C1D_SUPERSEDED_FREEZE = 'd371defd11dc7ce274b0a9d8daa3f3439757fd4f'
export const CONFIDENCE_MODEL_SHA256 = '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'
export const C1B_DEVELOPMENT_GROUP_IDS = Object.freeze([
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
// Keep the literal list independently visible: it is the frozen C1d primary
// protocol set, not a list inferred from the one materialised outcome file.
export const C1D_PRIMARY_GROUP_IDS = Object.freeze([
  'c1g-ebdb284a8c7563a12c5f',
  'c1g-3f4de360d87a28aea240',
  'c1g-f2a43144c5936389d89d',
  'c1g-8bd11cb5d7772ff2165b',
  'c1g-6c369c990dd73512951b',
  'c1g-dc1ade324d0c4b3192d6',
])

export const BATCH_C_CASES_PATH = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'
export const BATCH_C_IDENTITY_ARTIFACT = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/historical-device-exclusions.json'
export const DISCOVERY_RELATIVE_DIR = 'research/c1e-corpus-discovery'
export const DISCOVERY_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1e-corpus-discovery'
export const C1A_GROUPS_PATH = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/groups.json'
export const C1B_MANIFEST_PATH = '.research-artifacts/c1-confidence-targeting-dev/manifest.json'
export const C1B_PROTOCOL_PATH = 'research/c1-confidence-targeting-dev/protocol.md'
export const C1C_MANIFEST_PATH = '.research-artifacts/c1-confidence-targeting-holdout/manifest.json'
export const C1C_PROTOCOL_PATH = 'research/c1-confidence-targeting-holdout/protocol.md'
export const C1D_MANIFEST_PATH = '.research-artifacts/c1-confidence-causal-online/manifest.json'
export const C1D_INVALIDATION_PATH = '.research-artifacts/c1-confidence-causal-online/invalidation-manifest.json'
export const C1D_PROTOCOL_PATH = 'research/c1-confidence-causal-online/protocol.md'
export const CONFIDENCE_MODEL_PATH = '.research-artifacts/c1-confidence-targeting-dev/confidence-model.json'

const KNOWN_RIG_CLASSES = Object.freeze({
  'GRAS RA0045': 'gras-ra0045',
  'GRAS 43AC': 'gras-43ac',
  'GRAS 43ACB': 'gras-43acb',
  'KB501x + 711': 'kb501x-711',
})
const DISCOVERY_CLASSIFICATION_ORDER = Object.freeze([
  'IDENTITY_AMBIGUOUS',
  'VARIANT_OR_REVISION_MISMATCH',
  'USED_FOR_MODEL_TRAINING',
  'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL',
  'USED_FOR_C1C_HOLDOUT',
  'DUPLICATE_PRIOR_C1_IDENTITY',
  'NO_EXACT711_REFERENCE',
  'NO_NON711_OBSERVATION',
  'UNKNOWN_RIG_CLASS',
  'INSUFFICIENT_LOCAL_RESPONSE_DATA',
  'PROVENANCE_INSUFFICIENT',
  'ELIGIBLE_STRUCTURAL_CANDIDATE',
  'DUPLICATE_CANDIDATE',
  'OTHER_INELIGIBLE',
])
const REPO_SOURCE_ROOTS = Object.freeze([
  'research',
  '.research-artifacts',
  'packages/core/benchmarks',
  'packages/core/.research-artifacts',
])
const SEALED_PREFIX = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/'

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function c1aCanonicalName(value) {
  return String(value ?? '').normalize('NFKD').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value) !== '').map(String))]
    .sort((left, right) => left.localeCompare(right))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  return value
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function basenameModel(value) {
  return normalizeText(value).replace(/\b(?:red|blue|black|silver|green)\s+(?:filter|nozzle)\b/g, '').replace(/\s+/g, ' ').trim()
}

const KNOWN_MODEL_ALIAS_CANONICAL = Object.freeze({
  '7hz zero': '7hz salnotes zero',
  '7hz salnotes zero': '7hz salnotes zero',
  '7 herz zero': '7hz salnotes zero',
  '7 herz salnotes zero': '7hz salnotes zero',
})

function canonicalModelAlias(value) {
  const normalized = normalizeText(value)
  return KNOWN_MODEL_ALIAS_CANONICAL[normalized] ?? normalized
}

function identityManufacturer(record) {
  if (record.manufacturer) return normalizeText(record.manufacturer)
  const family = normalizeText(record.familyIdentity ?? record.deviceFamily)
  const model = normalizeText(record.model ?? record.processedName ?? record.canonicalModelName)
  if (family && model && family.endsWith(model)) return family.slice(0, -model.length).trim()
  return ''
}

function identityModel(record) {
  return canonicalModelAlias(record.canonicalModelName ?? record.model ?? record.processedName ?? record.deviceFamily)
}

function identityFamily(record) {
  const supplied = record.familyIdentity ?? record.deviceFamily
  return canonicalModelAlias(supplied || `${identityManufacturer(record)} ${identityModel(record)}`)
}

function variantSignature(record) {
  const fields = [
    ['configurationSignature', record.configurationSignature],
    ['variant', record.variant],
    ['tuning', record.tuning],
    ['revision', record.revision],
    ['dspMode', record.dspMode],
    ['nozzle', record.nozzle],
    ['filter', record.filter],
    ['eartips', record.eartips],
  ].filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
  return fields.map(([key, value]) => `${key}=${normalizeText(value)}`).join('|') || `model=${identityFamily(record)}`
}

/**
 * Canonical identity follows C1a's family/configuration split, while adding
 * explicit aliases and configuration state so a new group cannot bypass an
 * earlier identity merely by changing punctuation or spelling.
 */
export function canonicalIemIdentity(record = {}) {
  const manufacturer = identityManufacturer(record)
  const model = identityModel(record)
  const family = identityFamily(record)
  const explicitConfiguration = record.configurationSignature ?? record.processedName
  const configuration = c1aCanonicalName(explicitConfiguration ?? family)
  const aliases = [
    record.canonicalModelName,
    record.model,
    record.processedName,
    record.deviceFamily,
    record.familyIdentity,
    ...(Array.isArray(record.aliases) ? record.aliases : []),
  ].filter(Boolean).flatMap((value) => [normalizeText(value), canonicalModelAlias(value)])
  const fullNames = sortedUnique([`${manufacturer} ${model}`, `${manufacturer} ${family}`, ...aliases])
  const overlapKeys = sortedUnique([
    manufacturer && family ? `family:${manufacturer}|${family}` : '',
    manufacturer && model ? `model:${manufacturer}|${model}` : '',
    ...fullNames.map((name) => `name:${name}`),
    ...fullNames.map((name) => `name:${canonicalModelAlias(name)}`),
  ])
  const suppliedFamily = record.familyIdentity ?? record.deviceFamily
  const combinedName = normalizeText(`${manufacturer} ${model}`)
  const knownAlias = Object.hasOwn(KNOWN_MODEL_ALIAS_CANONICAL, combinedName)
  const baseName = canonicalModelAlias(suppliedFamily ?? (knownAlias ? family : basenameModel(record.model ?? record.processedName ?? model)))
  const baseKey = `${manufacturer}|${baseName}`
  return {
    manufacturer,
    model,
    family,
    configuration,
    variantSignature: variantSignature(record),
    aliases: fullNames,
    overlapKeys,
    fullKey: `${manufacturer}|${family}|${configuration}`,
    baseKey,
    identityAmbiguous: Boolean(record.identityAmbiguous || record.identityStatus === 'IDENTITY_AMBIGUOUS' || (!manufacturer && !family)),
  }
}

function canonicalRecordId(record, index) {
  return String(record.observationId ?? record.measurementId ?? record.id ?? record.identity ?? `observation-${index}`)
}

function sourceProvenanceId(record) {
  return String(record.provenance?.measurementSourceId ?? record.provenance?.sourceId ?? record.measurementSourceId ?? record.sourceId ?? record.collection ?? record.source ?? '')
}

function responsePoints(record) {
  const points = record.responseData ?? record.responsePoints ?? record.points ?? record.curve
  if (!Array.isArray(points)) return null
  const normalized = points.map((point) => {
    if (Array.isArray(point)) return [Number(point[0]), Number(point[1])]
    return [Number(point?.frequencyHz ?? point?.frequency ?? point?.hz), Number(point?.db ?? point?.amplitudeDb ?? point?.levelDb ?? point?.value)]
  }).filter(([frequency, amplitude]) => Number.isFinite(frequency) && Number.isFinite(amplitude))
  return normalized.length > 0 ? normalized : null
}

function responseStructure(record, repoRoot) {
  const points = responsePoints(record)
  if (points) {
    const frequencies = points.map(([frequency]) => frequency)
    return {
      available: true,
      sufficientGrid: points.length >= 2 && Math.min(...frequencies) <= 20 && Math.max(...frequencies) >= 20_000,
      pointCount: points.length,
      minFrequencyHz: Math.min(...frequencies),
      maxFrequencyHz: Math.max(...frequencies),
      path: record.responsePath ?? record.path ?? null,
    }
  }
  const coverage = record.frequencyCoverage ?? record.coverage
  const responsePath = record.responsePath ?? record.path
  const localPath = typeof responsePath === 'string' ? resolve(repoRoot, responsePath) : null
  if (record.localResponseAvailable === true && (!localPath || existsSync(localPath))) {
    const minFrequencyHz = Number(coverage?.minFrequencyHz ?? coverage?.minHz)
    const maxFrequencyHz = Number(coverage?.maxFrequencyHz ?? coverage?.maxHz)
    const pointCount = Number(coverage?.pointCount ?? coverage?.count)
    return {
      available: true,
      sufficientGrid: Boolean(coverage?.sufficientGrid) || (Number.isFinite(pointCount) && pointCount >= 2 && minFrequencyHz <= 20 && maxFrequencyHz >= 20_000),
      pointCount: Number.isFinite(pointCount) ? pointCount : null,
      minFrequencyHz: Number.isFinite(minFrequencyHz) ? minFrequencyHz : null,
      maxFrequencyHz: Number.isFinite(maxFrequencyHz) ? maxFrequencyHz : null,
      path: responsePath,
    }
  }
  if (localPath && existsSync(localPath)) {
    // Discovery validates presence only. It does not parse or transform a
    // curve here; a future causal protocol owns all response preparation.
    const bytes = statSync(localPath).size
    return { available: bytes > 0, sufficientGrid: false, pointCount: null, minFrequencyHz: null, maxFrequencyHz: null, path: responsePath, byteLength: bytes }
  }
  return { available: false, sufficientGrid: false, pointCount: null, minFrequencyHz: null, maxFrequencyHz: null, path: responsePath ?? null }
}

export function classifyRigForDiscovery(rawRig, modelMetadata = {}) {
  const exactRig = String(rawRig ?? '')
  if (exactRig === '711') {
    return { exactRig, rigClass: '711-class', profileCategory: 'NOT_APPLICABLE', known: true, primary711: true }
  }
  const rigClass = KNOWN_RIG_CLASSES[exactRig]
  if (!rigClass) return { exactRig, rigClass: null, profileCategory: 'UNKNOWN_RIG_CLASS', known: false, primary711: false }
  const classSpecific = new Set(modelMetadata.classSpecificRigClasses ?? Object.keys(modelMetadata.rigProfiles ?? {}))
  const globalAvailable = modelMetadata.globalProfileAvailable !== false
  return {
    exactRig,
    rigClass,
    profileCategory: classSpecific.has(rigClass) ? 'CLASS_SPECIFIC' : globalAvailable ? 'GLOBAL_FALLBACK' : 'UNKNOWN_RIG_CLASS',
    known: classSpecific.has(rigClass) || globalAvailable,
    primary711: false,
  }
}

function normalizedObservation(record, index, options = {}) {
  const identity = canonicalIemIdentity(record)
  const id = canonicalRecordId(record, index)
  const sourceId = sourceProvenanceId(record)
  const rigInfo = classifyRigForDiscovery(record.rig ?? record.rawRig ?? record.device, options.modelMetadata)
  const response = responseStructure(record, options.repoRoot ?? process.cwd())
  return {
    observationId: id,
    manufacturer: identity.manufacturer,
    model: identity.model,
    canonicalIdentity: identity,
    rig: record.rig ?? record.rawRig ?? record.device ?? null,
    rigInfo,
    sourceId,
    provenance: {
      sourceId,
      measurementSourceId: sourceId,
      collection: record.collection ?? record.provenance?.collection ?? null,
      path: record.responsePath ?? record.path ?? record.provenance?.path ?? null,
      sourceUrl: record.sourceUrl ?? record.provenance?.sourceUrl ?? null,
    },
    response,
    original: record,
  }
}

function identitiesOverlap(left, right) {
  if (!left || !right) return false
  if (left.fullKey && right.fullKey && left.fullKey === right.fullKey) return true
  // Historical C1a manifests predate an explicit manufacturer field. In that
  // case the frozen device-family identity is the strongest available key;
  // do not require a newly-added manufacturer string to bypass it.
  if (left.family && right.family && left.family === right.family && (!left.manufacturer || !right.manufacturer)) return true
  const rightKeys = new Set(right.overlapKeys ?? [])
  return (left.overlapKeys ?? []).some((key) => rightKeys.has(key))
}

function groupIdentity(records) {
  const identities = records.map((record) => record.canonicalIdentity)
  const first = identities[0] ?? canonicalIemIdentity({})
  const fullKeys = new Set(identities.map((identity) => identity.fullKey))
  const variants = new Set(identities.map((identity) => identity.variantSignature))
  const overlapConflict = identities.some((identity) => !identitiesOverlap(first, identity))
  return {
    ...first,
    fullKeys: [...fullKeys].sort(),
    variantSignatures: [...variants].sort(),
    variantMismatch: variants.size > 1,
    overlapConflict,
  }
}

function pickClassification(group, priorLedger, batchCFamilies) {
  const identity = group.identity
  if (identity.identityAmbiguous || identity.overlapConflict) return 'IDENTITY_AMBIGUOUS'
  if (identity.variantMismatch) return 'VARIANT_OR_REVISION_MISMATCH'
  const priorReasons = new Set()
  for (const prior of priorLedger?.groups ?? []) {
    if (identitiesOverlap(identity, prior.identity)) priorReasons.add(prior.reason)
  }
  for (const reason of DISCOVERY_CLASSIFICATION_ORDER) if (priorReasons.has(reason)) return reason
  if (batchCFamilies?.has(identity.family)) return 'OTHER_INELIGIBLE'
  if (group.exact711.length === 0) return 'NO_EXACT711_REFERENCE'
  if (group.non711.length === 0) return 'NO_NON711_OBSERVATION'
  if (group.non711.some((record) => !record.rigInfo.known || !record.rigInfo.rigClass)) return 'UNKNOWN_RIG_CLASS'
  if ([...group.records].some((record) => !record.response.available || !record.response.sufficientGrid)) return 'INSUFFICIENT_LOCAL_RESPONSE_DATA'
  if ([...group.records].some((record) => !record.sourceId || !record.provenance.path)) return 'PROVENANCE_INSUFFICIENT'
  return 'ELIGIBLE_STRUCTURAL_CANDIDATE'
}

export function candidateIdFor({ canonicalIemIdentity: identity, exact711ObservationIds = [], non711ObservationIds = [], rigClasses = [], sourceProvenanceIds = [] }) {
  const serialization = stableJson({
    canonicalIemIdentity: identity,
    exact711ObservationIdentities: sortedUnique(exact711ObservationIds),
    non711ObservationIdentities: sortedUnique(non711ObservationIds),
    rigClasses: sortedUnique(rigClasses),
    sourceProvenanceIdentifiers: sortedUnique(sourceProvenanceIds),
  })
  return `c1e-${sha256(serialization).slice(0, 20)}`
}

function candidateFromGroup(group, classification) {
  const exact711 = group.exact711.toSorted((left, right) => left.observationId.localeCompare(right.observationId))
  const non711 = group.non711.toSorted((left, right) => left.observationId.localeCompare(right.observationId))
  const rigClasses = sortedUnique(non711.map((record) => record.rigInfo.rigClass).filter(Boolean))
  const sources = sortedUnique(group.records.map((record) => record.sourceId).filter(Boolean))
  const candidateId = candidateIdFor({
    canonicalIemIdentity: group.identity.fullKey,
    exact711ObservationIds: exact711.map((record) => record.observationId),
    non711ObservationIds: non711.map((record) => record.observationId),
    rigClasses,
    sourceProvenanceIds: sources,
  })
  const profileCategories = sortedUnique(non711.map((record) => record.rigInfo.profileCategory).filter((value) => value && value !== 'UNKNOWN_RIG_CLASS'))
  const candidate = {
    candidateId,
    classification,
    canonicalIdentity: group.identity.fullKey,
    canonicalFamily: group.identity.family,
    manufacturer: group.identity.manufacturer,
    model: group.identity.model,
    aliases: group.identity.aliases,
    exact711ObservationCount: exact711.length,
    non711ObservationCount: non711.length,
    non711RigClasses: rigClasses,
    profileCategories,
    exact711ObservationIds: exact711.map((record) => record.observationId),
    non711ObservationIds: non711.map((record) => record.observationId),
    responsePaths: sortedUnique(group.records.map((record) => record.response.path).filter(Boolean)),
    provenanceSources: sources,
    provenance: group.records.map((record) => ({
      observationId: record.observationId,
      sourceId: record.sourceId || null,
      collection: record.provenance.collection,
      path: record.provenance.path,
      sourceUrl: record.provenance.sourceUrl,
      rawRig: record.rig,
      rigClass: record.rigInfo.rigClass,
    })).sort((left, right) => left.observationId.localeCompare(right.observationId)),
    exact711Consensus: {
      count: exact711.length,
      measurementSources: sortedUnique(exact711.map((record) => record.sourceId).filter(Boolean)),
      repeatAvailable: exact711.length > 1,
      feasibility: exact711.length > 0 && exact711.every((record) => record.response.available && record.response.sufficientGrid)
        ? 'EXACT711_CONSENSUS_FEASIBLE'
        : 'EXACT711_CONSENSUS_NOT_FEASIBLE',
    },
    independence: {
      status: classification === 'ELIGIBLE_STRUCTURAL_CANDIDATE' ? 'STRUCTURALLY_INDEPENDENT_PENDING_BATCH_C_AUDIT' : 'NOT_PRIMARY_READY',
      c1bTrainingOverlap: classification === 'USED_FOR_MODEL_TRAINING',
      c1cHoldoutOverlap: classification === 'USED_FOR_C1C_HOLDOUT',
      c1dPrimaryOverlap: classification === 'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL',
      historicalGroupIds: [],
      sourceIdentityReuse: sources,
      familyIdentity: group.identity.family,
      candidateDuplicateIdentity: false,
    },
    exclusionFlags: classification === 'ELIGIBLE_STRUCTURAL_CANDIDATE' ? [] : [classification],
  }
  return candidate
}

export function buildCandidateInventory(records, { repoRoot = process.cwd(), priorLedger = emptyPriorLedger(), batchCFamilies = new Set(), modelMetadata = {} } = {}) {
  const normalized = records.map((record, index) => normalizedObservation(record, index, { repoRoot, modelMetadata }))
  const byBase = new Map()
  for (const record of normalized) {
    const key = record.canonicalIdentity.baseKey || `ambiguous:${record.observationId}`
    const current = byBase.get(key) ?? []
    current.push(record)
    byBase.set(key, current)
  }
  const candidates = []
  for (const groupRecords of byBase.values()) {
    const recordsById = new Map()
    for (const record of groupRecords) if (!recordsById.has(record.observationId)) recordsById.set(record.observationId, record)
    const uniqueRecords = [...recordsById.values()].sort((left, right) => left.observationId.localeCompare(right.observationId))
    const identity = groupIdentity(uniqueRecords)
    const group = {
      identity,
      records: uniqueRecords,
      exact711: uniqueRecords.filter((record) => record.rigInfo.primary711),
      non711: uniqueRecords.filter((record) => !record.rigInfo.primary711),
    }
    const classification = pickClassification(group, priorLedger, batchCFamilies)
    candidates.push(candidateFromGroup(group, classification))
  }
  candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId))
  const duplicateIds = new Map()
  for (const candidate of candidates) {
    const prior = duplicateIds.get(candidate.canonicalIdentity)
    if (prior) {
      candidate.classification = 'DUPLICATE_CANDIDATE'
      candidate.exclusionFlags = ['DUPLICATE_CANDIDATE']
      candidate.independence.candidateDuplicateIdentity = true
    } else duplicateIds.set(candidate.canonicalIdentity, candidate.candidateId)
  }
  return {
    totalPotentialGroups: candidates.length,
    candidates,
    primaryReadyCandidates: candidates.filter((candidate) => candidate.classification === 'ELIGIBLE_STRUCTURAL_CANDIDATE'),
    measurementRecords: normalized.length,
  }
}

function emptyPriorLedger() {
  return { schemaVersion: 1, groups: [], groupIdsByReason: {}, identityCount: 0 }
}

function groupIdentityRecord(group) {
  const members = Array.isArray(group?.members) ? group.members : []
  const source = members[0] ?? group
  return canonicalIemIdentity({
    manufacturer: group?.manufacturer ?? source?.manufacturer,
    model: group?.model ?? source?.model ?? group?.deviceFamily,
    processedName: group?.configurationSignature ?? source?.processedName,
    familyIdentity: group?.deviceFamily ?? source?.deviceFamily,
    deviceFamily: group?.deviceFamily ?? source?.deviceFamily,
    configurationSignature: group?.configurationSignature ?? source?.configurationSignature,
    aliases: group?.aliases,
  })
}

export function buildPriorC1ExclusionLedger({ developmentGroups = [], holdoutGroups = [], c1dManifest = {} } = {}) {
  const groups = []
  const byReason = new Map()
  const add = (group, reason) => {
    const groupId = String(group?.groupId ?? group?.id ?? '')
    const identity = groupIdentityRecord(group ?? {})
    const entry = { groupId, reason, identity, canonicalIdentity: identity.fullKey }
    groups.push(entry)
    const ids = byReason.get(reason) ?? []
    ids.push(groupId)
    byReason.set(reason, ids)
  }
  for (const group of developmentGroups) add(group, 'USED_FOR_MODEL_TRAINING')
  for (const group of holdoutGroups) add(group, 'USED_FOR_C1C_HOLDOUT')
  const c1dIds = Array.isArray(c1dManifest.primaryGroupIds) ? c1dManifest.primaryGroupIds : C1D_PRIMARY_GROUP_IDS
  for (const groupId of c1dIds) {
    const matching = [...developmentGroups, ...holdoutGroups].find((group) => group?.groupId === groupId)
    add(matching ?? { groupId }, 'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL')
  }
  const groupIdsByReason = Object.fromEntries([...byReason.entries()].map(([reason, ids]) => [reason, sortedUnique(ids)]))
  return {
    schemaVersion: 1,
    groups: groups.sort((left, right) => left.groupId.localeCompare(right.groupId) || left.reason.localeCompare(right.reason)),
    groupIdsByReason,
    identityCount: groups.length,
  }
}

function readJsonSync(repoRoot, path, ledger) {
  guardReadPath(path, ledger)
  ledger.accessedPaths.push(path)
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'))
}

export function guardReadPath(relativePath, ledger = { accessedPaths: [], rejectedPaths: [], batchCAccessAttempts: 0 }) {
  const normalized = String(relativePath).replaceAll('\\', '/')
  if (normalized === BATCH_C_CASES_PATH || normalized.startsWith(SEALED_PREFIX)) {
    if (!ledger.rejectedPaths.includes(normalized)) ledger.rejectedPaths.push(normalized)
    // Deliberately do not increment an access-attempt counter: the forbidden
    // path is rejected before open/read/stat, so an access attempt is zero.
    throw new Error('SEALED_BATCH_C_ACCESS_FORBIDDEN')
  }
  return normalized
}

function loadModelMetadata(repoRoot, ledger) {
  const model = readJsonSync(repoRoot, CONFIDENCE_MODEL_PATH, ledger)
  const { modelSha256: _modelSha256, ...modelPayload } = model
  const computedSha256 = sha256(modelPayload)
  if (model.modelSha256 !== CONFIDENCE_MODEL_SHA256 || computedSha256 !== CONFIDENCE_MODEL_SHA256) {
    throw new Error(`C1E frozen confidence model hash mismatch: expected ${CONFIDENCE_MODEL_SHA256}`)
  }
  const classSpecificRigClasses = Object.keys(model.profiles?.rigProfiles ?? {})
  return {
    modelSha256: model.modelSha256 ?? null,
    hashVerified: true,
    classSpecificRigClasses,
    rigProfiles: Object.fromEntries(classSpecificRigClasses.map((key) => [key, true])),
    globalProfileAvailable: Boolean(model.profiles?.globalRig),
  }
}

function groupsForIds(groups, ids) {
  const wanted = new Set(ids)
  return groups.filter((group) => wanted.has(group.groupId))
}

function recordsFromC1aGroups(groups) {
  return groups.flatMap((group) => (Array.isArray(group.members) ? group.members : []).map((member, index) => ({
    observationId: member.concreteCurveIdentity ?? member.identity ?? `${group.groupId}-${index}`,
    manufacturer: member.manufacturer,
    model: member.model ?? member.processedName ?? group.configurationSignature,
    processedName: member.processedName,
    deviceFamily: member.deviceFamily ?? group.deviceFamily,
    familyIdentity: group.deviceFamily,
    configurationSignature: member.configurationSignature ?? group.configurationSignature,
    aliases: member.aliases,
    rig: member.rig,
    sourceId: member.collection,
    collection: member.collection,
    path: member.path,
    responsePath: member.path,
    localResponseAvailable: false,
    provenance: { sourceId: member.collection, measurementSourceId: member.collection, collection: member.collection, path: member.path },
  })))
}

function parseIdsFromText(text, prefix = 'c1g-') {
  return sortedUnique([...String(text).matchAll(new RegExp(`${prefix}[a-z0-9]+`, 'g'))].map((match) => match[0]))
}

function walkSourceInventorySync(repoRoot, ledger) {
  const files = []
  const rejected = new Set(ledger.rejectedPaths)
  function visit(relativeDir) {
    const absoluteDir = resolve(repoRoot, relativeDir)
    if (!existsSync(absoluteDir)) return
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(relativeDir, entry.name).replaceAll('\\', '/')
      // Generated C1e evidence is an output, never an input corpus source;
      // excluding it also keeps reruns byte-for-byte deterministic.
      if (path === DISCOVERY_ARTIFACT_RELATIVE_DIR || path.startsWith(`${DISCOVERY_ARTIFACT_RELATIVE_DIR}/`)) continue
      if (path === BATCH_C_CASES_PATH || path.startsWith(SEALED_PREFIX)) {
        rejected.add(path)
        continue
      }
      if (path === 'vendor/squiglink' || path.startsWith('vendor/squiglink/')) continue
      if (entry.isDirectory()) visit(path)
      else files.push({ path, extension: path.includes('.') ? `.${path.split('.').at(-1)}` : null, sizeBytes: statSync(resolve(repoRoot, path)).size })
    }
  }
  for (const root of REPO_SOURCE_ROOTS) visit(root)
  ledger.rejectedPaths = [...new Set([...ledger.rejectedPaths, ...rejected])].sort()
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function loadRepoRecords(repoRoot, ledger) {
  const c1a = readJsonSync(repoRoot, C1A_GROUPS_PATH, ledger)
  const groups = Array.isArray(c1a.groups) ? c1a.groups : []
  const c1bManifest = readJsonSync(repoRoot, C1B_MANIFEST_PATH, ledger)
  guardReadPath(C1B_PROTOCOL_PATH, ledger)
  readFileSync(resolve(repoRoot, C1B_PROTOCOL_PATH), 'utf8')
  ledger.accessedPaths.push(C1B_PROTOCOL_PATH)
  const c1cManifest = readJsonSync(repoRoot, C1C_MANIFEST_PATH, ledger)
  guardReadPath(C1C_PROTOCOL_PATH, ledger)
  readFileSync(resolve(repoRoot, C1C_PROTOCOL_PATH), 'utf8')
  ledger.accessedPaths.push(C1C_PROTOCOL_PATH)
  const c1dManifest = readJsonSync(repoRoot, C1D_MANIFEST_PATH, ledger)
  const c1dInvalidation = readJsonSync(repoRoot, C1D_INVALIDATION_PATH, ledger)
  guardReadPath(C1D_PROTOCOL_PATH, ledger)
  const c1dProtocol = readFileSync(resolve(repoRoot, C1D_PROTOCOL_PATH), 'utf8')
  ledger.accessedPaths.push(C1D_PROTOCOL_PATH)
  const modelMetadata = loadModelMetadata(repoRoot, ledger)
  let batchCFamilies = new Set()
  let batchCOverlapStatus = 'UNVERIFIED_DUE_TO_SEAL'
  if (existsSync(resolve(repoRoot, BATCH_C_IDENTITY_ARTIFACT))) {
    const identityArtifact = readJsonSync(repoRoot, BATCH_C_IDENTITY_ARTIFACT, ledger)
    batchCFamilies = new Set((identityArtifact.sealedFutureBatchCFamilies ?? identityArtifact.sealedBatchCFamilies ?? []).map(normalizeText))
    batchCOverlapStatus = batchCFamilies.size > 0 ? 'VERIFIED_WITHOUT_BREAKING_SEAL' : 'UNVERIFIED_DUE_TO_SEAL'
  }
  const sourceInventory = walkSourceInventorySync(repoRoot, ledger)
  const priorLedger = buildPriorC1ExclusionLedger({
    developmentGroups: groupsForIds(groups, c1bManifest.developmentGroupIds ?? C1B_DEVELOPMENT_GROUP_IDS),
    holdoutGroups: groupsForIds(groups, c1cManifest.holdoutGroupIds ?? C1C_HOLDOUT_GROUP_IDS),
    c1dManifest: { primaryGroupIds: c1dManifest.primaryGroupIds ?? C1D_PRIMARY_GROUP_IDS },
  })
  const c1dPrimaryGroupIds = c1dManifest.primaryGroupIds ?? C1D_PRIMARY_GROUP_IDS
  if (new Set(c1dPrimaryGroupIds).size !== C1D_PRIMARY_GROUP_IDS.length || C1D_PRIMARY_GROUP_IDS.some((groupId) => !c1dPrimaryGroupIds.includes(groupId))) {
    throw new Error('C1d frozen primary set must contain all six pinned group IDs')
  }
  return {
    records: recordsFromC1aGroups(groups),
    groups,
    priorLedger,
    modelMetadata,
    sourceInventory,
    batchCFamilies,
    batchCOverlapStatus,
    batchCIdentityArtifact: batchCFamilies.size > 0 ? BATCH_C_IDENTITY_ARTIFACT : null,
    c1dProtocolIds: sortedUnique([...parseIdsFromText(c1dProtocol), ...C1D_PRIMARY_GROUP_IDS]),
    c1dInvalidationClassification: c1dInvalidation.classification ?? 'INCONCLUSIVE',
    c1bDevelopmentGroupIds: c1bManifest.developmentGroupIds ?? C1B_DEVELOPMENT_GROUP_IDS,
    c1cHoldoutGroupIds: c1cManifest.holdoutGroupIds ?? C1C_HOLDOUT_GROUP_IDS,
  }
}

function candidateSelectionScore(candidate, chosen) {
  const usedRigs = new Set(chosen.flatMap((item) => item.non711RigClasses ?? []))
  const usedFamilies = new Set(chosen.map((item) => item.canonicalFamily))
  const usedSources = new Set(chosen.flatMap((item) => item.provenanceSources ?? []))
  return [
    (candidate.non711RigClasses ?? []).filter((rigClass) => !usedRigs.has(rigClass)).length,
    usedFamilies.has(candidate.canonicalFamily) ? 0 : 1,
    (candidate.provenanceSources ?? []).filter((source) => !usedSources.has(source)).length,
    Number(candidate.exact711ObservationCount ?? 0),
  ]
}

/** Outcome-blind greedy set selection; no response values are read. */
export function chooseProposedPrimary(candidates, count = 6) {
  const remaining = [...candidates].sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)))
  const chosen = []
  while (remaining.length > 0 && chosen.length < count) {
    remaining.sort((left, right) => {
      const leftScore = candidateSelectionScore(left, chosen)
      const rightScore = candidateSelectionScore(right, chosen)
      for (let index = 0; index < leftScore.length; index += 1) {
        if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index]
      }
      return String(left.candidateId).localeCompare(String(right.candidateId))
    })
    chosen.push(remaining.shift())
  }
  return chosen.map((candidate) => candidate.candidateId)
}

export function classifyReadiness({ primaryReadyCandidates = [], batchCOverlapStatus = 'UNVERIFIED_DUE_TO_SEAL' } = {}) {
  if (primaryReadyCandidates.length < 6) return 'C1E_CORPUS_INSUFFICIENT'
  const rigs = new Set(primaryReadyCandidates.flatMap((candidate) => candidate.non711RigClasses ?? []))
  if (rigs.size < 2) return 'C1E_CORPUS_LIMITED'
  return batchCOverlapStatus === 'VERIFIED_WITHOUT_BREAKING_SEAL'
    ? 'C1E_CORPUS_READY'
    : 'C1E_CORPUS_READY_BATCHC_INDEPENDENCE_UNVERIFIED'
}

export function discoverFromRecords(records, options = {}) {
  const inventory = buildCandidateInventory(records, options)
  return {
    solverExecuted: false,
    causalOutcomesGenerated: false,
    confidenceTargetingMetricsComputed: false,
    confidenceWeightsUsedForSelection: false,
    responseAmplitudeUsedForSelection: false,
    modelRetrained: false,
    candidates: inventory.candidates,
    primaryReadyCandidates: inventory.primaryReadyCandidates,
    readiness: classifyReadiness({ primaryReadyCandidates: inventory.primaryReadyCandidates, batchCOverlapStatus: options.batchCOverlapStatus }),
  }
}

export function hasSolverToken(value) {
  return /runStandardAutoEqV2|optimizer|candidate generation|joint refinement|discrete refinement|peq generation|solver benchmark|c1d primary runner/i.test(String(value))
}

function reasonCounts(candidates) {
  return Object.fromEntries(DISCOVERY_CLASSIFICATION_ORDER.map((reason) => [reason, candidates.filter((candidate) => candidate.classification === reason).length]))
}

function priorReasonCounts(priorLedger) {
  return Object.fromEntries(DISCOVERY_CLASSIFICATION_ORDER
    .filter((reason) => Array.isArray(priorLedger?.groupIdsByReason?.[reason]))
    .map((reason) => [reason, priorLedger.groupIdsByReason[reason].length]))
}

function profileCategoryCounts(candidates) {
  const counts = {}
  for (const candidate of candidates) for (const category of candidate.profileCategories ?? []) counts[category] = (counts[category] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function rigClassCounts(candidates) {
  const counts = {}
  for (const candidate of candidates) for (const rigClass of candidate.non711RigClasses ?? []) counts[rigClass] = (counts[rigClass] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function formatReport({ result, sourceInventory, priorLedger, batchCOverlapStatus, proposedPrimary, reserve, modelMetadata, repoRoot }) {
  const candidateCounts = reasonCounts(result.candidates)
  const priorCounts = priorReasonCounts(priorLedger)
  const lines = [
    '# C1e — Corpus Discovery and Independence Audit',
    '',
    `- Base commit: \`${BASE_COMMIT}\``,
    `- Frozen confidence model SHA-256 verified: \`${modelMetadata.modelSha256}\` (expected \`${CONFIDENCE_MODEL_SHA256}\`)`,
    `- Total measurement records inventoried: ${result.measurementRecords}`,
    `- Potential same-IEM groups: ${result.totalPotentialGroups}`,
    `- Primary-ready groups: ${result.primaryReadyCandidates.length}`,
    `- Readiness classification: **${result.readiness}**`,
    '',
    '## Safety and independence boundary',
    '',
    '- This phase performed structural/provenance discovery only; it did not execute AutoEQ, calculate disagreement, calculate confidence metrics, generate targets, or produce causal outcomes.',
    `- Batch C access: ${sourceInventory.batchCAccessed ? 'forbidden violation' : 'not accessed'}; overlap status: **${batchCOverlapStatus}**.`,
    `- Prior C1 exclusion groups: ${priorLedger.groups.length}; C1d classification preserved as INCONCLUSIVE (${sourceInventory.c1dInvalidationClassification}).`,
    '',
    '## Exclusion counts',
    '',
    '- Candidate primary classifications:',
    ...Object.entries(candidateCounts).filter(([, count]) => count > 0).map(([reason, count]) => `  - ${reason}: ${count}`),
    '- Prior C1 identity memberships (overlaps are intentionally retained):',
    ...Object.entries(priorCounts).filter(([, count]) => count > 0).map(([reason, count]) => `  - ${reason}: ${count}`),
    '',
    '## Rig and profile distribution',
    '',
    `- Rig classes: \`${JSON.stringify(rigClassCounts(result.primaryReadyCandidates))}\``,
    `- Profile categories: \`${JSON.stringify(profileCategoryCounts(result.primaryReadyCandidates))}\``,
    '',
    '## Proposed primary set',
    '',
    proposedPrimary.length === 6 ? proposedPrimary.map((id) => `- \`${id}\``).join('\n') : '- None (fewer than six primary-ready candidates).',
    '',
    '## Secondary reserve',
    '',
    reserve.length > 0 ? reserve.map((id) => `- \`${id}\``).join('\n') : '- None.',
    '',
    '## Audit ledger',
    '',
    `- Paths accessed: ${sourceInventory.accessedPaths.length}`,
    `- Paths rejected: ${sourceInventory.rejectedPaths.length}`,
    `- Batch C access attempts: ${sourceInventory.batchCAccessAttempts}`,
    `- Repository root: \`${repoRoot}\``,
    '',
    `**${result.readiness}**`,
    '',
  ]
  return `${lines.join('\n')}`
}

async function walkSourceInventory(repoRoot, ledger) {
  // The synchronous implementation makes the no-open Batch C guard easy to
  // audit and is sufficient for this small committed corpus. Keep the async
  // wrapper as the runner's single inventory API.
  return walkSourceInventorySync(repoRoot, ledger)
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeEvidence(repoRoot, context) {
  const outputDir = resolve(repoRoot, DISCOVERY_ARTIFACT_RELATIVE_DIR)
  await mkdir(outputDir, { recursive: true })
  const { result, sourceInventory, priorLedger, inventory, independenceMatrix, modelMetadata, proposedPrimary, reserve, batchCOverlapStatus } = context
  const manifest = {
    schemaVersion: 1,
    campaign: 'C1e',
    baseCommit: BASE_COMMIT,
    c1dFrozenProtocolCommit: C1D_FROZEN_PROTOCOL_COMMIT,
    c1dSupersededFreeze: C1D_SUPERSEDED_FREEZE,
    confidenceModel: { path: CONFIDENCE_MODEL_PATH, sha256: modelMetadata.modelSha256, expectedSha256: CONFIDENCE_MODEL_SHA256, hashVerified: modelMetadata.hashVerified === true },
    solverExecuted: false,
    causalOutcomesGenerated: false,
    confidenceTargetingMetricsComputed: false,
    confidenceWeightsUsedForSelection: false,
    responseAmplitudeUsedForSelection: false,
    batchCAccessed: false,
    batchCExecuted: false,
    modelRetrained: false,
    productionModified: false,
    c1dEvidenceReusedAsValidOutcome: false,
    batchCOverlapStatus,
    batchCIdentityArtifact: context.batchCIdentityArtifact,
    readiness: result.readiness,
    measurementRecordCount: result.measurementRecords,
    potentialSameIemGroupCount: result.totalPotentialGroups,
    primaryReadyCount: result.primaryReadyCandidates.length,
    proposedPrimaryCount: proposedPrimary.length,
    candidateClassificationCounts: reasonCounts(inventory.candidates),
    priorC1MembershipCounts: priorReasonCounts(priorLedger),
    evidenceMode: 'STRUCTURAL_PROVENANCE_ONLY',
  }
  const sourceInventoryArtifact = {
    schemaVersion: 1,
    roots: REPO_SOURCE_ROOTS,
    files: sourceInventory.files,
    accessedPaths: sourceInventory.accessedPaths.toSorted(),
    rejectedPaths: sourceInventory.rejectedPaths.toSorted(),
    batchCAccessAttempts: sourceInventory.batchCAccessAttempts,
    batchCAccessed: false,
    c1dInvalidationClassification: sourceInventory.c1dInvalidationClassification,
  }
  const exclusionLedger = {
    schemaVersion: 1,
    classificationOrder: DISCOVERY_CLASSIFICATION_ORDER,
    reasonCounts: reasonCounts(inventory.candidates),
    priorMembershipReasonCounts: priorReasonCounts(priorLedger),
    entries: inventory.candidates.map((candidate) => ({ candidateId: candidate.candidateId, canonicalIdentity: candidate.canonicalIdentity, classification: candidate.classification, exclusionFlags: candidate.exclusionFlags })),
  }
  const pool = {
    schemaVersion: 1,
    primaryReadyCandidates: result.primaryReadyCandidates,
    proposedPrimary,
    secondaryReserve: reserve,
    selection: {
      algorithm: 'greedy lexicographically-maximal marginal diversity tuple: new rig classes, new canonical families, new measurement sources, exact-711 repeat count; candidate ID ascending tie-break',
      outcomeBlind: true,
      confidenceWeightsUsed: false,
      disagreementMagnitudeUsed: false,
      responseAmplitudeUsed: false,
    },
  }
  const readinessReport = {
    classification: result.readiness,
    primaryReadyCount: result.primaryReadyCandidates.length,
    requiredPrimaryCount: 6,
    distinctNon711RigClasses: sortedUnique(result.primaryReadyCandidates.flatMap((candidate) => candidate.non711RigClasses ?? [])),
    batchCOverlapStatus,
    reasonCounts: reasonCounts(inventory.candidates),
    priorC1MembershipReasonCounts: priorReasonCounts(priorLedger),
    rigClassDistribution: rigClassCounts(result.primaryReadyCandidates),
    profileCategoryDistribution: profileCategoryCounts(result.primaryReadyCandidates),
    proposedPrimary,
    secondaryReserve: reserve,
    selectionOutcomeBlind: true,
    noCausalGateStarted: true,
  }
  const finalReport = formatReport({ result, sourceInventory: sourceInventoryArtifact, priorLedger, batchCOverlapStatus, proposedPrimary, reserve, modelMetadata, repoRoot })
  const artifacts = {
    'manifest.json': manifest,
    'source-inventory.json': sourceInventoryArtifact,
    'prior-c1-exclusion-ledger.json': priorLedger,
    'candidate-inventory.json': inventory,
    'exclusion-ledger.json': exclusionLedger,
    'independence-matrix.json': independenceMatrix,
    'primary-ready-pool.json': pool,
    'readiness-report.json': readinessReport,
    'final-report.md': finalReport,
  }
  for (const [name, value] of Object.entries(artifacts)) await writeFile(join(outputDir, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  const evidenceNames = Object.keys(artifacts).toSorted()
  const hashLines = []
  for (const name of evidenceNames) {
    const bytes = await readFile(join(outputDir, name))
    hashLines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)
  }
  hashLines.push(`${createHash('sha256').update(Buffer.from(hashLines.join('\n') + '\n')).digest('hex')}  evidence-sha256.txt`)
  await writeFile(join(outputDir, 'evidence-sha256.txt'), `${hashLines.join('\n')}\n`, 'utf8')
}

function independenceMatrixForCandidates(candidates, priorLedger, batchCFamilies, batchCOverlapStatus) {
  return {
    schemaVersion: 1,
    batchCOverlapStatus,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      canonicalIdentity: candidate.canonicalIdentity,
      c1bTrainingIemIdentities: priorLedger.groups.filter((group) => group.reason === 'USED_FOR_MODEL_TRAINING' && identitiesOverlap(canonicalIemIdentity({ familyIdentity: candidate.canonicalFamily, configurationSignature: candidate.canonicalIdentity }), group.identity)).map((group) => group.canonicalIdentity),
      c1cHoldoutIemIdentities: priorLedger.groups.filter((group) => group.reason === 'USED_FOR_C1C_HOLDOUT' && identitiesOverlap(canonicalIemIdentity({ familyIdentity: candidate.canonicalFamily, configurationSignature: candidate.canonicalIdentity }), group.identity)).map((group) => group.canonicalIdentity),
      c1dPrimaryIemIdentities: priorLedger.groups.filter((group) => group.reason === 'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL' && identitiesOverlap(canonicalIemIdentity({ familyIdentity: candidate.canonicalFamily, configurationSignature: candidate.canonicalIdentity }), group.identity)).map((group) => group.canonicalIdentity),
      historicalC1GroupIds: priorLedger.groups.filter((group) => identitiesOverlap(canonicalIemIdentity({ familyIdentity: candidate.canonicalFamily, configurationSignature: candidate.canonicalIdentity }), group.identity)).map((group) => group.groupId).toSorted(),
      measurementSourceIdentityReuse: candidate.provenanceSources,
      measurementRigClasses: candidate.non711RigClasses,
      familyIdentity: candidate.canonicalFamily,
      candidateToCandidateDuplicateIdentity: candidate.independence.candidateDuplicateIdentity,
      batchCIdentityOverlap: batchCOverlapStatus === 'VERIFIED_WITHOUT_BREAKING_SEAL' && batchCFamilies.has(normalizeText(candidate.canonicalFamily)),
    })),
  }
}

export async function runDiscovery({ repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..') } = {}) {
  const ledger = { accessedPaths: [], rejectedPaths: [], batchCAccessAttempts: 0 }
  const loaded = loadRepoRecords(repoRoot, ledger)
  const inventory = buildCandidateInventory(loaded.records, {
    repoRoot,
    priorLedger: loaded.priorLedger,
    batchCFamilies: loaded.batchCFamilies,
    modelMetadata: loaded.modelMetadata,
  })
  const proposedPrimary = chooseProposedPrimary(inventory.primaryReadyCandidates)
  const reserve = inventory.primaryReadyCandidates.map((candidate) => candidate.candidateId).filter((candidateId) => !proposedPrimary.includes(candidateId)).sort()
  const result = {
    ...inventory,
    readiness: classifyReadiness({ primaryReadyCandidates: inventory.primaryReadyCandidates, batchCOverlapStatus: loaded.batchCOverlapStatus }),
    proposedPrimary,
    secondaryReserve: reserve,
    solverExecuted: false,
    causalOutcomesGenerated: false,
    confidenceTargetingMetricsComputed: false,
    confidenceWeightsUsedForSelection: false,
    responseAmplitudeUsedForSelection: false,
    modelRetrained: false,
  }
  const sourceInventory = {
    ...loaded,
    files: loaded.sourceInventory,
    accessedPaths: [...new Set(ledger.accessedPaths)].sort(),
    rejectedPaths: [...new Set(ledger.rejectedPaths)].sort(),
    batchCAccessAttempts: ledger.batchCAccessAttempts,
    batchCAccessed: false,
  }
  const independenceMatrix = independenceMatrixForCandidates(inventory.candidates, loaded.priorLedger, loaded.batchCFamilies, loaded.batchCOverlapStatus)
  await writeEvidence(repoRoot, {
    result,
    inventory,
    sourceInventory,
    priorLedger: loaded.priorLedger,
    independenceMatrix,
    modelMetadata: loaded.modelMetadata,
    proposedPrimary,
    reserve,
    batchCOverlapStatus: loaded.batchCOverlapStatus,
    batchCIdentityArtifact: loaded.batchCIdentityArtifact,
  })
  return { ...result, sourceInventory, priorLedger: loaded.priorLedger, modelMetadata: loaded.modelMetadata, batchCOverlapStatus: loaded.batchCOverlapStatus }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const result = await runDiscovery({ repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../..') })
    process.stdout.write(`${JSON.stringify({
      readiness: result.readiness,
      measurementRecordCount: result.measurementRecords,
      potentialSameIemGroupCount: result.totalPotentialGroups,
      primaryReadyCount: result.primaryReadyCandidates.length,
      proposedPrimary: result.proposedPrimary,
      secondaryReserve: result.secondaryReserve,
      solverExecuted: result.solverExecuted,
      causalOutcomesGenerated: result.causalOutcomesGenerated,
      batchCAccessed: result.sourceInventory.batchCAccessed,
      batchCAccessAttempts: result.sourceInventory.batchCAccessAttempts,
    }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`)
    process.exitCode = 1
  }
}
