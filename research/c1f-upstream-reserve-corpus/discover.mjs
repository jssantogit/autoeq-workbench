import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C1A_FORM,
  C1A_NORMALIZATION,
  C1A_PRIMARY_RIG,
  C1A_V2_MAX_HZ,
  canonicalizeTerminalEndpoint,
  groupC1Measurements,
  inventoryUpstream,
  validateCandidateCurves,
} from '../c1-cross-rig-confidence-corpus/c1a.mjs'

const execFile = promisify(execFileCallback)

export const C1F_BASE_COMMIT = '3eb0329b8eee80eae8de72e268bf0e4fa4be733c'
export const C1F_FROZEN_C1V11_COMMIT = '28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a'
export const C1F_UPSTREAM_REPOSITORY = 'jaakkopasanen/AutoEq'
export const C1F_UPSTREAM_COMMIT = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const C1F_UPSTREAM_TREE = '671f0a72499ace671e4b0a293bc1948bb8330c96'
export const C1F_UPSTREAM_API_ROOT = `https://api.github.com/repos/${C1F_UPSTREAM_REPOSITORY}`
export const C1F_UPSTREAM_RAW_ROOT = `https://raw.githubusercontent.com/${C1F_UPSTREAM_REPOSITORY}/${C1F_UPSTREAM_COMMIT}`
export const C1F_EXPECTED_RESERVE_COUNT = 22
export const C1F_FROZEN_ELIGIBLE_COUNT = 34
export const C1F_FROZEN_SELECTED_COUNT = 12
export const C1F_PRIMARY_COUNT = 6
export const C1F_SECONDARY_COUNT = 6
export const C1F_PRIMARY_SELECTION_SEED = 'autoeq-workbench:c1f-reserve-primary-v1'
export const C1F_SECONDARY_SELECTION_SEED = 'autoeq-workbench:c1f-secondary-reserve-v1'
export const C1F_V11_MANIFEST_PATH = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/manifest.json'
export const C1F_V11_GROUPS_PATH = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/groups.json'
export const C1F_HISTORICAL_EXCLUSIONS_PATH = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/historical-device-exclusions.json'
export const C1F_C1B_MANIFEST_PATH = '.research-artifacts/c1-confidence-targeting-dev/manifest.json'
export const C1F_C1C_MANIFEST_PATH = '.research-artifacts/c1-confidence-targeting-holdout/manifest.json'
export const C1F_C1D_MANIFEST_PATH = '.research-artifacts/c1-confidence-causal-online/manifest.json'
export const C1F_C1D_INVALIDATION_PATH = '.research-artifacts/c1-confidence-causal-online/invalidation-manifest.json'
export const C1F_CONFIDENCE_MODEL_PATH = '.research-artifacts/c1-confidence-targeting-dev/confidence-model.json'
export const C1F_C1D_INVALID_GROUP_PATH = '.research-artifacts/c1-confidence-causal-online/group-c1g-ebdb284a8c7563a12c5f.json'
export const C1F_BATCH_C_CASES_PATH = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'
export const C1F_BATCH_C_IDENTITY_PATH = C1F_HISTORICAL_EXCLUSIONS_PATH
export const C1F_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1f-upstream-reserve-corpus'
export const C1F_CACHE_RELATIVE_DIR = '.research-cache/c1f-upstream-reserve-corpus'
export const C1F_PROTECTED_REMOTE_BRANCH = 'origin/research/storm-diagnosis-20260910'
export const C1F_PROTECTED_REMOTE_EXPECTED_SHA = '31cc11982ebd07e009788d5e2c5c3537e9e6b615'
export const C1F_CONFIDENCE_MODEL_SHA256 = '65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00'

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
export const C1D_PRIMARY_GROUP_IDS = Object.freeze([...C1C_HOLDOUT_GROUP_IDS])

const KNOWN_RIG_CLASSES = Object.freeze({
  'GRAS 43AC': 'gras-43ac',
  'GRAS RA0045': 'gras-ra0045',
  'GRAS 43ACB': 'gras-43acb',
  'KB501x + 711': 'kb501x-711',
})
const CLASSIFICATION_ORDER = Object.freeze([
  'USED_FOR_MODEL_TRAINING',
  'USED_FOR_C1C_HOLDOUT',
  'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL',
  'HISTORICAL_EXCLUSION_OVERLAP',
  'NO_UPSTREAM_GROUP',
  'FROZEN_ELIGIBILITY_FAILURE',
  'IMMUTABLE_REACQUISITION_FAILED',
  'INTEGRITY_VALIDATION_FAILED',
  'IDENTITY_AMBIGUOUS',
  'VARIANT_OR_REVISION_MISMATCH',
  'ELIGIBLE_RESERVE_GROUP',
])
const FORBIDDEN_OUTCOME_KEYS = Object.freeze([
  'solverExecuted',
  'autoEqSolverExecuted',
  'causalOutcomesGenerated',
  'confidenceTargetingMetricsComputed',
  'confidenceCurveComputed',
  'confidenceWeightingApplied',
  'confidenceGain',
  'gainVsBaseline',
  'gainVsConstant',
  'combinedGain',
  'artifactRmse',
  'optimizerRmse',
  'disagreementMagnitude',
  'expectedCausalGain',
])
const BATCH_C_SEALED_PREFIX = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/'

export function stableValue(value) {
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

function text(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function exactText(value) {
  return String(value ?? '').normalize('NFKD').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

const KNOWN_ALIASES = Object.freeze({
  '7hz zero': '7hz salnotes zero',
  '7hz salnotes zero': '7hz salnotes zero',
  '7 herz zero': '7hz salnotes zero',
  '7 herz salnotes zero': '7hz salnotes zero',
})

function alias(value) {
  const normalized = text(value)
  return KNOWN_ALIASES[normalized] ?? normalized
}

function inferManufacturer(record, family) {
  if (record.manufacturer) return text(record.manufacturer)
  const model = text(record.model ?? record.processedName ?? '')
  if (model && family.startsWith(`${model} `)) return family.slice(model.length + 1).trim()
  const first = family.split(' ')[0]
  return first ?? ''
}

function inferModel(record, family) {
  return alias(record.canonicalModelName ?? record.model ?? record.processedName ?? family)
}

/** Canonical family/configuration identity. Configuration qualifiers remain. */
export function canonicalIdentity(record = {}) {
  const suppliedFamily = record.familyIdentity ?? record.deviceFamily
  const rawModel = record.canonicalModelName ?? record.model ?? record.processedName ?? ''
  const explicitManufacturer = record.manufacturer ? text(record.manufacturer) : ''
  const familyInput = suppliedFamily ?? `${explicitManufacturer} ${rawModel}`.trim()
  const family = alias(familyInput)
  const manufacturer = explicitManufacturer || inferManufacturer(record, family)
  const model = inferModel(record, family)
  const configuration = exactText(record.configurationSignature ?? record.processedName ?? record.model ?? familyInput)
  const variantFields = ['variant', 'tuning', 'revision', 'dspMode', 'nozzle', 'filter', 'eartips']
  const explicitVariants = variantFields.filter((key) => record[key] !== undefined && record[key] !== null && String(record[key]) !== '').map((key) => `${key}=${text(record[key])}`)
  const variantSignature = explicitVariants.length > 0 ? explicitVariants.join('|') : `configuration=${configuration}`
  const names = [...new Set([familyInput, record.canonicalModelName, family].filter(Boolean).flatMap((value) => [text(value), alias(value)]))].sort()
  const familyKey = `${manufacturer}|${family}`
  const fullKey = `${familyKey}|${configuration}`
  return {
    manufacturer,
    model,
    family,
    configuration,
    variantSignature,
    aliases: names,
    familyKey,
    fullKey,
    overlapKeys: [fullKey, ...names.map((name) => `name:${name}`)].sort(),
    identityAmbiguous: Boolean(record.identityAmbiguous || record.identityStatus === 'IDENTITY_AMBIGUOUS' || !family),
  }
}

export function identitiesOverlap(left, right) {
  if (!left || !right) return false
  if (left.fullKey && right.fullKey && left.fullKey === right.fullKey) return true
  if (left.familyKey && right.familyKey && left.familyKey === right.familyKey) {
    // Configuration qualifiers are semantic. Only the explicitly audited
    // alias map can bridge a spelling/name change; nozzle/filter/revision
    // differences remain independent identities and are not collapsed.
    return alias(left.configuration) === alias(right.configuration)
  }
  return false
}

export function classifyC1fRig(rawRig, modelMetadata = {}) {
  const exactRig = String(rawRig ?? '')
  if (exactRig === C1A_PRIMARY_RIG) return { exactRig, rigClass: '711-class', profileCategory: 'NOT_APPLICABLE', known: true, primary711: true }
  const rigClass = KNOWN_RIG_CLASSES[exactRig]
  if (!rigClass) return { exactRig, rigClass: null, profileCategory: 'UNKNOWN_RIG_CLASS', known: false, primary711: false }
  const classSpecific = new Set(modelMetadata.classSpecificRigClasses ?? [])
  const globalFallback = modelMetadata.globalProfileAvailable === true
  const profileCategory = classSpecific.has(rigClass) ? 'CLASS_SPECIFIC' : globalFallback ? 'GLOBAL_FALLBACK' : 'UNKNOWN_RIG_CLASS'
  return { exactRig, rigClass, profileCategory, known: profileCategory !== 'UNKNOWN_RIG_CLASS', primary711: false }
}

export function canonicalizeEndpointForC1f(points) {
  const result = canonicalizeTerminalEndpoint(points)
  return { points: result.points, transformation: result.transformation, penultimateV2FrequencyHz: result.penultimateV2FrequencyHz }
}

export function normalizeMemberOrder(members = []) {
  return [...members].sort((left, right) => `${left.observationId ?? left.concreteCurveIdentity ?? ''}|${left.path ?? ''}`.localeCompare(`${right.observationId ?? right.concreteCurveIdentity ?? ''}|${right.path ?? ''}`))
}

export function deriveReserveUniverse({ eligibleGroupIds, selectedGroupIds, expectedEligibleCount = C1F_FROZEN_ELIGIBLE_COUNT, expectedSelectedCount = C1F_FROZEN_SELECTED_COUNT, expectedReserveCount = C1F_EXPECTED_RESERVE_COUNT } = {}) {
  if (!Array.isArray(eligibleGroupIds) || !Array.isArray(selectedGroupIds)) throw new Error('frozen selection arrays are required')
  const eligible = [...new Set(eligibleGroupIds.map(String))].sort()
  const selected = [...new Set(selectedGroupIds.map(String))].sort()
  if (eligible.length !== eligibleGroupIds.length || selected.length !== selectedGroupIds.length) throw new Error('frozen selection contains duplicate IDs')
  if (expectedEligibleCount !== null && eligible.length !== expectedEligibleCount) throw new Error(`frozen eligible group count mismatch: ${eligible.length}`)
  if (expectedSelectedCount !== null && selected.length !== expectedSelectedCount) throw new Error(`frozen selected group count mismatch: ${selected.length}`)
  const eligibleSet = new Set(eligible)
  for (const groupId of selected) if (!eligibleSet.has(groupId)) throw new Error(`selected group is not in eligible universe: ${groupId}`)
  const reserve = eligible.filter((groupId) => !selected.includes(groupId))
  if (expectedReserveCount !== null && reserve.length !== expectedReserveCount) throw new Error(`reserve group count mismatch: ${reserve.length}`)
  return reserve
}

function candidateGroupIdentity(group) {
  return canonicalIdentity({
    manufacturer: group.manufacturer,
    model: group.model ?? group.deviceFamily,
    deviceFamily: group.deviceFamily,
    familyIdentity: group.deviceFamily,
    configurationSignature: group.configurationSignature,
  })
}

export function selectionRank(group, selected = [], seed = C1F_PRIMARY_SELECTION_SEED) {
  const usedRigClasses = new Set(selected.flatMap((candidate) => candidate.non711RigClasses ?? []))
  const newlyIntroducedRigCount = (group.non711RigClasses ?? []).filter((rigClass) => !usedRigClasses.has(rigClass)).length
  const groupRigCount = new Set(group.non711RigClasses ?? []).size
  const exact711Count = Number(group.exact711IndependentCount ?? 0)
  const totalCount = Number(group.totalIndependentCount ?? group.totalIndependentMeasurementCount ?? 0)
  const hash = sha256(`${seed}:${group.groupId}`)
  return { newlyIntroducedRigCount, groupRigCount, exact711Count, totalCount, hash, groupId: String(group.groupId) }
}

function compareRanks(left, right) {
  return right.newlyIntroducedRigCount - left.newlyIntroducedRigCount
    || right.groupRigCount - left.groupRigCount
    || right.exact711Count - left.exact711Count
    || right.totalCount - left.totalCount
    || left.hash.localeCompare(right.hash)
    || left.groupId.localeCompare(right.groupId)
}

export function choosePrimaryGroups(groups, count = C1F_PRIMARY_COUNT) {
  const remaining = [...groups].sort((left, right) => String(left.groupId).localeCompare(String(right.groupId)))
  const selected = []
  while (remaining.length > 0 && selected.length < count) {
    remaining.sort((left, right) => compareRanks(selectionRank(left, selected), selectionRank(right, selected)))
    selected.push(remaining.shift())
  }
  return selected
}

export function chooseSecondaryReserve(groups, primary, count = C1F_SECONDARY_COUNT) {
  const primaryIds = new Set(primary.map((group) => group.groupId))
  const remaining = groups.filter((group) => !primaryIds.has(group.groupId))
  const selected = []
  while (remaining.length > 0 && selected.length < count) {
    const context = [...primary, ...selected]
    remaining.sort((left, right) => compareRanks(selectionRank(left, context, C1F_SECONDARY_SELECTION_SEED), selectionRank(right, context, C1F_SECONDARY_SELECTION_SEED)))
    selected.push(remaining.shift())
  }
  return selected
}

export function classifyC1fReadiness(primaryReadyGroups = [], batchCOverlapStatus = 'VERIFIED_WITHOUT_BREAKING_SEAL') {
  if (primaryReadyGroups.length < C1F_PRIMARY_COUNT) return 'C1F_CORPUS_INSUFFICIENT'
  const rigClasses = new Set(primaryReadyGroups.flatMap((group) => group.non711RigClasses ?? []))
  if (rigClasses.size < 2) return 'C1F_CORPUS_INSUFFICIENT'
  if (batchCOverlapStatus !== 'VERIFIED_WITHOUT_BREAKING_SEAL') return 'INCONCLUSIVE'
  return 'C1F_CORPUS_READY'
}

export function assertNoBatchCPath(path) {
  const normalized = String(path).replaceAll('\\', '/')
  if (normalized === C1F_BATCH_C_CASES_PATH || normalized.startsWith(BATCH_C_SEALED_PREFIX) || normalized.includes(`/${BATCH_C_SEALED_PREFIX}`)) throw new Error(`Batch C seal: path access forbidden: ${normalized}`)
  return true
}

export function assertNoForbiddenOutcomeFields(value) {
  function visit(node, path = '') {
    if (!node || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_OUTCOME_KEYS.includes(key)) {
        if (child !== false && child !== null && child !== undefined && !(key === 'solverExecuted' && child === false)) throw new Error(`forbidden outcome field: ${path}${key}`)
      }
      visit(child, `${path}${key}.`)
    }
  }
  visit(value)
  return true
}

export function confidenceModelHash(model) {
  const { modelSha256: _omitted, ...payload } = model ?? {}
  return sha256(stableJson(payload))
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

export function verifyArtifactHashIndex(files, indexText) {
  const lines = String(indexText).trimEnd().split('\n')
  if (lines.shift() !== 'artifact-hash-index-v1') throw new Error('hash index marker mismatch')
  const expected = createArtifactHashIndex(files).trimEnd().split('\n').slice(1)
  if (JSON.stringify(lines) !== JSON.stringify(expected)) throw new Error('artifact hash mismatch')
  return true
}

export function buildIndependenceMatrix(groups, { batchCOverlapStatus = 'VERIFIED_WITHOUT_BREAKING_SEAL' } = {}) {
  return {
    schemaVersion: 1,
    axes: ['c1bTrainingIemIdentities', 'c1cHoldoutIemIdentities', 'c1dPrimaryIemIdentities', 'historicalC1GroupIds', 'measurementSourceIdentityReuse', 'familyIdentity', 'candidateToCandidateDuplicateIdentity', 'batchCOverlap'],
    batchCOverlapStatus,
    candidates: groups.map((group) => ({
      candidateId: group.groupId,
      c1bTrainingIemIdentities: group.independence?.c1bTrainingIemIdentities ?? [],
      c1cHoldoutIemIdentities: group.independence?.c1cHoldoutIemIdentities ?? [],
      c1dPrimaryIemIdentities: group.independence?.c1dPrimaryIemIdentities ?? [],
      historicalC1GroupIds: group.independence?.historicalC1GroupIds ?? [],
      measurementSourceIdentityReuse: [...new Set(group.provenanceSources ?? [])].sort(),
      measurementRigClasses: [...new Set(group.non711RigClasses ?? [])].sort(),
      familyIdentity: group.canonicalFamily ?? group.deviceFamily ?? null,
      candidateToCandidateDuplicateIdentity: Boolean(group.independence?.candidateToCandidateDuplicateIdentity),
      batchCOverlap: batchCOverlapStatus === 'VERIFIED_WITHOUT_BREAKING_SEAL' ? Boolean(group.independence?.batchCOverlap) : 'UNVERIFIED_DUE_TO_SEAL',
    })),
  }
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n` }

async function readJson(repoRoot, relativePath, ledger) {
  assertNoBatchCPath(relativePath)
  ledger.accessedPaths.add(relativePath)
  return JSON.parse(await readFile(resolve(repoRoot, relativePath), 'utf8'))
}

async function readGitFile(repoRoot, commit, relativePath, ledger) {
  assertNoBatchCPath(relativePath)
  ledger.accessedPaths.add(`git:${commit}:${relativePath}`)
  const { stdout } = await execFile('git', ['show', `${commit}:${relativePath}`], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

function sourceRows(record) {
  return [...(record.sourceRows ?? [])].map((row) => ({
    collection: row.collection,
    rowNumber: row.rowNumber,
    url: row.url,
    sourceName: row.sourceName,
    model: row.model,
    form: row.form,
    rig: row.rig,
    side: row.side,
  })).sort((left, right) => (left.rowNumber ?? 0) - (right.rowNumber ?? 0))
}

function memberArtifact(record) {
  return {
    collection: record.collection,
    form: record.form,
    model: record.model,
    processedName: record.processedName,
    deviceFamily: record.deviceFamily,
    configurationSignature: record.configurationSignature,
    rig: record.rig,
    rigClass: record.rigClass,
    path: record.path,
    upstreamRawUrl: `${C1F_UPSTREAM_RAW_ROOT}/${record.path.split('/').map(encodeURIComponent).join('/')}`,
    blobSha: record.blobSha,
    concreteCurveIdentity: record.concreteCurveIdentity,
    sourceRows: sourceRows(record),
    sourceUrls: sourceRows(record).map((row) => row.url).filter(Boolean),
    integrity: record.integrity,
  }
}

function groupMembers(group) {
  return [...new Map([...group.exact711Members, ...group.eligibleNon711Members].map((record) => [record.upstreamPath ?? record.path, record])).values()]
}

function groupIdentitySummary(group) {
  return {
    groupId: group.groupId,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    canonicalIdentity: canonicalIdentity({ deviceFamily: group.deviceFamily, model: group.deviceFamily, configurationSignature: group.configurationSignature }),
  }
}

function priorGroupIdentity(group, reason) {
  const identity = canonicalIdentity({ deviceFamily: group.deviceFamily, model: group.deviceFamily, configurationSignature: group.configurationSignature })
  return { groupId: group.groupId, reason, canonicalIdentity: identity }
}

function buildPriorIdentities(v11Groups, c1bIds, c1cIds, c1dIds) {
  const byId = new Map(v11Groups.map((group) => [group.groupId, group]))
  const entries = []
  for (const groupId of c1bIds) {
    const group = byId.get(groupId)
    if (!group) throw new Error(`C1b group missing from frozen V1.1 groups: ${groupId}`)
    entries.push(priorGroupIdentity(group, 'USED_FOR_MODEL_TRAINING'))
  }
  for (const groupId of c1cIds) {
    const group = byId.get(groupId)
    if (!group) throw new Error(`C1c group missing from frozen V1.1 groups: ${groupId}`)
    entries.push(priorGroupIdentity(group, 'USED_FOR_C1C_HOLDOUT'))
  }
  for (const groupId of c1dIds) {
    const group = byId.get(groupId)
    if (!group) throw new Error(`C1d group missing from frozen V1.1 groups: ${groupId}`)
    entries.push(priorGroupIdentity(group, 'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL'))
  }
  return entries
}

function candidateFromGroup(group, priorIdentities, historicalFamilies, modelMetadata, batchCFamilies = historicalFamilies) {
  const identity = groupIdentitySummary(group).canonicalIdentity
  const overlap = priorIdentities.filter((prior) => identitiesOverlap(identity, prior.canonicalIdentity))
  const exact711 = group.exact711Members ?? []
  const non711 = group.eligibleNon711Members ?? []
  const non711RigClasses = [...new Set(non711.map((member) => member.rigClass ?? classifyC1fRig(member.rig, modelMetadata).rigClass).filter(Boolean))].sort()
  const provenanceSources = [...new Set(groupMembers(group).map((member) => member.collection).filter(Boolean))].sort()
  const rigInfo = non711.map((member) => classifyC1fRig(member.rig, modelMetadata))
  const identityMismatch = new Set(groupMembers(group).map((member) => `${member.deviceFamily}|${member.configurationSignature}`)).size > 1
  let classification = 'ELIGIBLE_RESERVE_GROUP'
  let exclusionReason = null
  if (overlap.length > 0) { classification = overlap[0].reason; exclusionReason = overlap[0].reason }
  else if (historicalFamilies.has(identity.family)) { classification = 'HISTORICAL_EXCLUSION_OVERLAP'; exclusionReason = classification }
  else if (identity.identityAmbiguous) { classification = 'IDENTITY_AMBIGUOUS'; exclusionReason = classification }
  else if (identityMismatch) { classification = 'VARIANT_OR_REVISION_MISMATCH'; exclusionReason = classification }
  else if (exact711.length < 3 || non711.length < 1) { classification = 'FROZEN_ELIGIBILITY_FAILURE'; exclusionReason = classification }
  else if (rigInfo.some((info) => !info.known || !info.rigClass)) { classification = 'INTEGRITY_VALIDATION_FAILED'; exclusionReason = 'UNKNOWN_RIG_CLASS' }
  const members = normalizeMemberOrder(groupMembers(group)).map(memberArtifact)
  const candidate = {
    groupId: group.groupId,
    classification,
    exclusionReason,
    manufacturer: identity.manufacturer,
    model: identity.model,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    canonicalIdentity: identity.fullKey,
    canonicalFamily: identity.family,
    aliases: identity.aliases,
    exact711IndependentCount: exact711.length,
    exact711Collections: [...new Set(exact711.map((member) => member.collection))].sort(),
    non711IndependentCount: non711.length,
    non711RigClasses,
    totalIndependentCount: exact711.length + non711.length,
    provenanceSources,
    members,
    responsePaths: members.map((member) => member.path).sort(),
    profileCategories: [...new Set(rigInfo.map((info) => info.profileCategory).filter((category) => category !== 'NOT_APPLICABLE'))].sort(),
    exact711Consensus: {
      count: exact711.length,
      measurementSources: [...new Set(exact711.map((member) => member.collection))].sort(),
      repeatAvailable: exact711.length > 1,
      feasibility: exact711.length >= 1 && exact711.every((member) => member.integrity?.status === 'valid') ? 'EXACT711_CONSENSUS_FEASIBLE' : 'EXACT711_CONSENSUS_NOT_FEASIBLE',
    },
    independence: {
      c1bTrainingIemIdentities: overlap.filter((entry) => entry.reason === 'USED_FOR_MODEL_TRAINING').map((entry) => entry.canonicalIdentity.fullKey),
      c1cHoldoutIemIdentities: overlap.filter((entry) => entry.reason === 'USED_FOR_C1C_HOLDOUT').map((entry) => entry.canonicalIdentity.fullKey),
      c1dPrimaryIemIdentities: overlap.filter((entry) => entry.reason === 'CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL').map((entry) => entry.canonicalIdentity.fullKey),
      historicalC1GroupIds: overlap.map((entry) => entry.groupId).sort(),
      measurementSourceIdentityReuse: provenanceSources,
      familyIdentity: identity.family,
      candidateToCandidateDuplicateIdentity: false,
      batchCOverlap: batchCFamilies.has(identity.family),
    },
    exclusionFlags: classification === 'ELIGIBLE_RESERVE_GROUP' ? [] : [classification],
  }
  return candidate
}

export function markDuplicateCandidates(candidates) {
  const byIdentity = new Map()
  for (const candidate of candidates) {
    const list = byIdentity.get(candidate.canonicalIdentity) ?? []
    list.push(candidate)
    byIdentity.set(candidate.canonicalIdentity, list)
  }
  for (const list of byIdentity.values()) {
    if (list.length < 2) continue
    for (const candidate of list) {
      candidate.independence.candidateToCandidateDuplicateIdentity = true
      if (candidate.classification === 'ELIGIBLE_RESERVE_GROUP') {
        candidate.classification = 'DUPLICATE_CANDIDATE'
        candidate.exclusionReason = 'DUPLICATE_CANDIDATE'
        candidate.exclusionFlags = ['DUPLICATE_CANDIDATE']
      }
    }
  }
  return candidates
}

function reasonCounts(candidates) {
  return Object.fromEntries(CLASSIFICATION_ORDER.map((reason) => [reason, candidates.filter((candidate) => candidate.classification === reason).length]))
}

function rigCounts(candidates) {
  const counts = {}
  for (const candidate of candidates) for (const rig of candidate.non711RigClasses ?? []) counts[rig] = (counts[rig] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function profileCounts(candidates) {
  const counts = {}
  for (const candidate of candidates) for (const profile of candidate.profileCategories ?? []) counts[profile] = (counts[profile] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function artifactGroup(candidate, allocation = 'ELIGIBLE_RESERVE') {
  return { ...candidate, allocation }
}

function assertReserveGroupsMatch(groups, reserveIds) {
  const observed = groups.map((group) => group.groupId).sort()
  const expected = [...reserveIds].sort()
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`reserve group reconciliation mismatch: expected ${expected.length}, observed ${observed.length}`)
}

function sourceInventoryRecord(loaded) {
  return {
    upstreamMetadataInventory: 'immutable GitHub API tree/name_index metadata only',
    upstreamRepository: C1F_UPSTREAM_REPOSITORY,
    upstreamCommit: C1F_UPSTREAM_COMMIT,
    upstreamTree: C1F_UPSTREAM_TREE,
    cacheRoot: C1F_CACHE_RELATIVE_DIR,
    metadataRecordCount: loaded.metadataRecordCount,
    reserveGroupMemberCount: loaded.reserveMemberCount,
    pathsAccessed: [...loaded.ledger.accessedPaths].sort(),
    pathsRejected: [...loaded.ledger.rejectedPaths].sort(),
    batchCAccessAttempts: loaded.ledger.batchCAccessAttempts,
    batchCAccessed: false,
    noFullClone: true,
    rawBytesCommitted: false,
  }
}

function makeFinalReport({ classification, reserveIds, reconciledReserveCount = 0, candidates, primary, secondary, failed, confidenceModel, batchCOverlapStatus, upstream, ledger }) {
  const lines = [
    '# C1f — Upstream Reserve Corpus',
    '',
    `- Classification: **${classification}**`,
    `- Base commit: \`${C1F_BASE_COMMIT}\``,
    `- Frozen C1 V1.1 manifest commit: \`${C1F_FROZEN_C1V11_COMMIT}\``,
    `- Upstream: \`${upstream.repository}\` at commit \`${upstream.commit}\`, tree \`${upstream.tree}\``,
    `- Expected reserve groups: ${C1F_EXPECTED_RESERVE_COUNT}`,
    `- Reconciled reserve IDs: ${reconciledReserveCount}`,
    `- Successfully reacquired reserve groups: ${candidates.filter((candidate) => candidate.classification === 'ELIGIBLE_RESERVE_GROUP').length}`,
    `- Frozen confidence model SHA-256 matched: \`${confidenceModel.modelSha256}\``,
    '',
    '## Primary groups',
    '',
    primary.length === C1F_PRIMARY_COUNT ? primary.map((candidate) => `- \`${candidate.groupId}\` — ${candidate.model}; exact-711=${candidate.exact711IndependentCount}; non-711=${candidate.non711IndependentCount}; classes=${candidate.non711RigClasses.join(', ')}`).join('\n') : '- None (primary diversity/integrity gate not met).',
    '',
    '## Secondary reserve',
    '',
    secondary.length > 0 ? secondary.map((candidate) => `- \`${candidate.groupId}\` — ${candidate.model}`).join('\n') : '- None.',
    '',
    '## Rig/profile distribution',
    '',
    `- Primary rig classes: \`${JSON.stringify(rigCounts(primary))}\``,
    `- Primary profile categories: \`${JSON.stringify(profileCounts(primary))}\``,
    '',
    '## Exclusions/failures',
    '',
    `- ${JSON.stringify(reasonCounts(candidates))}`,
    failed.length > 0 ? failed.map((entry) => `- \`${entry.groupId}\`: ${entry.reason}`).join('\n') : '- None.',
    '',
    '## Safety',
    '',
    '- Corpus-only metadata/provenance/integrity acquisition; no confidence evaluation, disagreement, response-shape ranking, target, filter, or causal outcome was computed.',
    '- No AutoEQ solver or benchmark ran.',
    `- Batch C overlap: **${batchCOverlapStatus}**; access attempts: ${ledger.batchCAccessAttempts}.`,
    '- C1d materialized evidence was not reused as valid outcome evidence.',
    '- Third-party raw response bytes remain only in the ignored C1f cache and are not committed.',
    '',
    `**${classification}**`,
    '',
  ]
  return lines.join('\n')
}

function validateFrozenManifest(manifest) {
  const selection = manifest?.selection
  if (!selection) throw new Error('frozen V1.1 manifest has no selection section')
  return deriveReserveUniverse({
    eligibleGroupIds: selection.eligibleGroupIds,
    selectedGroupIds: selection.selectedGroupIds,
    expectedEligibleCount: C1F_FROZEN_ELIGIBLE_COUNT,
    expectedSelectedCount: C1F_FROZEN_SELECTED_COUNT,
    expectedReserveCount: C1F_EXPECTED_RESERVE_COUNT,
  })
}

async function loadConfidenceMetadata(repoRoot, ledger) {
  const model = await readJson(repoRoot, C1F_CONFIDENCE_MODEL_PATH, ledger)
  const computed = confidenceModelHash(model)
  if (model.modelSha256 !== C1F_CONFIDENCE_MODEL_SHA256 || computed !== C1F_CONFIDENCE_MODEL_SHA256) throw new Error('frozen confidence model hash mismatch')
  return {
    path: C1F_CONFIDENCE_MODEL_PATH,
    modelSha256: model.modelSha256,
    hashVerified: true,
    classSpecificRigClasses: Object.keys(model.weights?.byRigClass ?? {}).sort(),
    globalProfileAvailable: Boolean(model.weights?.globalFallback && model.profiles?.globalRig),
  }
}

export async function runC1f({ repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), fetchImpl = globalThis.fetch, cacheRoot = resolve(repoRoot, C1F_CACHE_RELATIVE_DIR), writeArtifacts = true } = {}) {
  const ledger = { accessedPaths: new Set(), rejectedPaths: new Set(), batchCAccessAttempts: 0 }
  const manifestText = await readGitFile(repoRoot, C1F_FROZEN_C1V11_COMMIT, C1F_V11_MANIFEST_PATH, ledger)
  const manifest = JSON.parse(manifestText)
  const frozenManifestSha256 = sha256(Buffer.from(manifestText))
  const reserveIds = validateFrozenManifest(manifest)
  if (reserveIds.length !== C1F_EXPECTED_RESERVE_COUNT) throw new Error(`reserve count must be exactly ${C1F_EXPECTED_RESERVE_COUNT}`)
  const v11Groups = (await readJson(repoRoot, C1F_V11_GROUPS_PATH, ledger)).groups ?? []
  const c1bManifest = await readJson(repoRoot, C1F_C1B_MANIFEST_PATH, ledger)
  const c1cManifest = await readJson(repoRoot, C1F_C1C_MANIFEST_PATH, ledger)
  const c1dManifest = await readJson(repoRoot, C1F_C1D_MANIFEST_PATH, ledger)
  const c1dInvalidation = await readJson(repoRoot, C1F_C1D_INVALIDATION_PATH, ledger)
  if (c1dInvalidation.classification !== 'INCONCLUSIVE') throw new Error('C1d invalidation classification changed')
  if (!Array.isArray(c1dManifest.primaryGroupIds) || JSON.stringify([...c1dManifest.primaryGroupIds].sort()) !== JSON.stringify([...C1D_PRIMARY_GROUP_IDS].sort())) throw new Error('C1d primary set mismatch')
  // Deliberately do not read C1F_C1D_INVALID_GROUP_PATH. It is invalidated evidence, not input data.
  const c1bIds = c1bManifest.developmentGroupIds ?? C1B_DEVELOPMENT_GROUP_IDS
  const c1cIds = c1cManifest.holdoutGroupIds ?? C1C_HOLDOUT_GROUP_IDS
  const priorIdentities = buildPriorIdentities(v11Groups, c1bIds, c1cIds, c1dManifest.primaryGroupIds)
  const historicalLedger = await readJson(repoRoot, C1F_HISTORICAL_EXCLUSIONS_PATH, ledger)
  const batchCFamilies = new Set((historicalLedger.sealedFutureBatchCFamilies ?? []).map(text))
  const historicalFamilies = new Set([...(historicalLedger.historicalObservedFamilies ?? []), ...(historicalLedger.sealedFutureBatchCFamilies ?? [])].map(text))
  const batchCOverlapStatus = batchCFamilies.size > 0 ? 'VERIFIED_WITHOUT_BREAKING_SEAL' : 'UNVERIFIED_DUE_TO_SEAL'
  const confidenceModel = await loadConfidenceMetadata(repoRoot, ledger)
  if (typeof fetchImpl !== 'function') throw new Error('C1f requires immutable upstream fetch implementation')
  let upstreamInventory = { records: [], allMetadataRows: [] }
  let reserveMetadataGroups = []
  let reserveMembers = []
  let missingReserveIds = [...reserveIds]
  let acquisitionFailure = null
  let validatedGroups = []
  try {
    upstreamInventory = await inventoryUpstream({ fetchImpl, cacheRoot })
    const allGroups = groupC1Measurements(upstreamInventory.records)
    reserveMetadataGroups = allGroups.filter((group) => reserveIds.includes(group.groupId))
    missingReserveIds = reserveIds.filter((groupId) => !reserveMetadataGroups.some((group) => group.groupId === groupId))
    if (missingReserveIds.length > 0) throw new Error(`reserve IDs missing from immutable upstream metadata: ${missingReserveIds.join(', ')}`)
    reserveMembers = reserveMetadataGroups.flatMap(groupMembers)
    const validatedRecords = await validateCandidateCurves(reserveMembers, fetchImpl, cacheRoot)
    const validatedByPath = new Map(validatedRecords.map((record) => [record.upstreamPath ?? record.path, record]))
    validatedGroups = groupC1Measurements(reserveMetadataGroups.flatMap((group) => groupMembers(group).map((member) => validatedByPath.get(member.upstreamPath ?? member.path) ?? member)))
    assertReserveGroupsMatch(validatedGroups, reserveIds)
  } catch (error) {
    acquisitionFailure = { reason: 'IMMUTABLE_REACQUISITION_FAILED', detail: String(error?.message ?? error) }
  }
  const candidates = acquisitionFailure
    ? reserveIds.map((groupId) => ({
      groupId,
      classification: 'IMMUTABLE_REACQUISITION_FAILED',
      exclusionReason: 'IMMUTABLE_REACQUISITION_FAILED',
      manufacturer: null,
      model: null,
      deviceFamily: null,
      configurationSignature: null,
      canonicalIdentity: null,
      canonicalFamily: null,
      aliases: [],
      exact711IndependentCount: 0,
      exact711Collections: [],
      non711IndependentCount: 0,
      non711RigClasses: [],
      totalIndependentCount: 0,
      provenanceSources: [],
      members: [],
      responsePaths: [],
      profileCategories: [],
      exact711Consensus: { count: 0, measurementSources: [], repeatAvailable: false, feasibility: 'EXACT711_CONSENSUS_NOT_FEASIBLE' },
      independence: { c1bTrainingIemIdentities: [], c1cHoldoutIemIdentities: [], c1dPrimaryIemIdentities: [], historicalC1GroupIds: [], measurementSourceIdentityReuse: [], familyIdentity: null, candidateToCandidateDuplicateIdentity: false, batchCOverlap: false },
      exclusionFlags: ['IMMUTABLE_REACQUISITION_FAILED'],
    }))
    : markDuplicateCandidates(validatedGroups.map((group) => candidateFromGroup(group, priorIdentities, historicalFamilies, confidenceModel, batchCFamilies)))
  const failed = candidates.filter((candidate) => candidate.classification !== 'ELIGIBLE_RESERVE_GROUP').map((candidate) => ({ groupId: candidate.groupId, reason: candidate.exclusionReason ?? candidate.classification, detail: acquisitionFailure?.detail ?? null }))
  const eligible = candidates.filter((candidate) => candidate.classification === 'ELIGIBLE_RESERVE_GROUP')
  const primary = choosePrimaryGroups(eligible, C1F_PRIMARY_COUNT)
  const secondary = chooseSecondaryReserve(eligible, primary, C1F_SECONDARY_COUNT)
  const primaryRigCount = new Set(primary.flatMap((group) => group.non711RigClasses)).size
  const classification = acquisitionFailure
    ? 'INCONCLUSIVE'
    : eligible.length >= C1F_PRIMARY_COUNT && primary.length === C1F_PRIMARY_COUNT && primaryRigCount >= 2 && batchCOverlapStatus === 'VERIFIED_WITHOUT_BREAKING_SEAL'
      ? 'C1F_CORPUS_READY'
      : eligible.length < C1F_PRIMARY_COUNT || primary.length < C1F_PRIMARY_COUNT || primaryRigCount < 2
        ? 'C1F_CORPUS_INSUFFICIENT'
        : 'INCONCLUSIVE'
  const primaryIds = new Set(primary.map((group) => group.groupId))
  const secondaryIds = new Set(secondary.map((group) => group.groupId))
  const groupsArtifact = {
    schemaVersion: 1,
    corpus: 'c1f-upstream-reserve-corpus',
    outcomeBlind: true,
    groups: candidates.map((candidate) => artifactGroup(candidate, primaryIds.has(candidate.groupId) ? 'PRIMARY' : secondaryIds.has(candidate.groupId) ? 'SECONDARY_RESERVE' : candidate.classification === 'ELIGIBLE_RESERVE_GROUP' ? 'ELIGIBLE_UNSELECTED_RESERVE' : 'EXCLUDED')).sort((left, right) => left.groupId.localeCompare(right.groupId)),
  }
  const provenanceArtifact = {
    schemaVersion: 1,
    upstream: { repository: C1F_UPSTREAM_REPOSITORY, commit: C1F_UPSTREAM_COMMIT, tree: C1F_UPSTREAM_TREE },
    rawDataPolicy: 'raw upstream bytes are ignored cache only; no third-party curve bytes committed',
    records: candidates.flatMap((candidate) => candidate.members.map((member) => ({
      groupId: candidate.groupId,
      concreteCurveIdentity: member.concreteCurveIdentity,
      collection: member.collection,
      path: member.path,
      blobSha: member.blobSha,
      upstreamSha256: member.integrity?.upstreamSha256 ?? null,
      originalParsedPointsSha256: member.integrity?.originalParsedPointsSha256 ?? null,
      canonicalParsedPointsSha256: member.integrity?.canonicalParsedPointsSha256 ?? null,
      normalizedParsedPointsSha256: member.integrity?.normalizedParsedPointsSha256 ?? null,
      endpointTransformation: member.integrity?.transformation ?? null,
      integrityStatus: member.integrity?.status ?? null,
    }))).sort((left, right) => `${left.groupId}|${left.concreteCurveIdentity}`.localeCompare(`${right.groupId}|${right.concreteCurveIdentity}`)),
  }
  const rigInventory = {
    schemaVersion: 1,
    upstream: provenanceArtifact.upstream,
    allReserve: { rigClasses: rigCounts(eligible), profileCategories: profileCounts(eligible) },
    primary: { rigClasses: rigCounts(primary), profileCategories: profileCounts(primary) },
    secondary: { rigClasses: rigCounts(secondary), profileCategories: profileCounts(secondary) },
  }
  const independenceMatrix = buildIndependenceMatrix(candidates, { batchCOverlapStatus })
  const reserveUniverseArtifact = {
    schemaVersion: 1,
    sourceManifest: { commit: C1F_FROZEN_C1V11_COMMIT, path: C1F_V11_MANIFEST_PATH, sha256: frozenManifestSha256 },
    frozenEligibleGroupCount: C1F_FROZEN_ELIGIBLE_COUNT,
    frozenSelectedGroupCount: C1F_FROZEN_SELECTED_COUNT,
    expectedReserveGroupCount: C1F_EXPECTED_RESERVE_COUNT,
    eligibleGroupIds: manifest.selection.eligibleGroupIds,
    selectedGroupIds: manifest.selection.selectedGroupIds,
    reserveEligibleGroupIds: reserveIds,
    reconciledReserveGroupIds: reserveMetadataGroups.map((group) => group.groupId).sort(),
    missingReserveGroupIds: missingReserveIds,
  }
  const selectionProtocol = `# C1f upstream reserve corpus selection\n\nThis protocol is frozen before acquisition outcomes and uses only the authoritative C1 V1.1 reserve difference.\n\n- Frozen manifest commit: \`${C1F_FROZEN_C1V11_COMMIT}\`; eligible count 34; selected count 12; reserve count 22.\n- Upstream pin: \`${C1F_UPSTREAM_REPOSITORY}\` commit \`${C1F_UPSTREAM_COMMIT}\`, tree \`${C1F_UPSTREAM_TREE}\`. Metadata uses immutable GitHub API trees and raw paths at the pinned commit; no full clone or moving branch is used.\n- Primary gate: exactly 6 groups and at least 2 distinct non-711 rig classes.\n- Structural greedy tuple for each step: newly introduced non-711 rig-class count (descending), group distinct non-711 rig-class count (descending), exact-711 independent count (descending), total independent measurement count (descending), SHA-256 of \`autoeq-workbench:c1f-reserve-primary-v1:<groupId>\` (ascending), group ID (ascending).\n- Secondary uses the same tuple with seed \`autoeq-workbench:c1f-secondary-reserve-v1\`, after primary, and is capped at 6.\n- No response amplitudes, disagreement, confidence values/weights, solver output, causal outcomes, or C1d partial outcome participates.\n- Exact literal \`711\` is the primary reference rig. Other rig strings remain distinct; unsupported strings are not mapped by nominal similarity.\n- Every reacquired member records immutable path, Git blob SHA-1, upstream SHA-256, parsed/canonical/normalized integrity hashes, and terminal endpoint transformation. The only endpoint operation is flat closure to 20,000 Hz when the observed terminal is between the V2 penultimate point and 20 kHz; normalization remains 500 Hz only for integrity hashing.\n- Historical and sealed identity exclusions use committed identity-only ledgers. Batch C case content is sealed and never opened; access attempts must remain zero.\n- This is a corpus freeze only. No causal experiment follows automatically.\n`
  const sourceInventory = sourceInventoryRecord({ metadataRecordCount: upstreamInventory.records.length, reserveMemberCount: reserveMembers.length, ledger })
  const manifestArtifact = {
    schemaVersion: 1,
    campaign: 'C1f',
    classification,
    baseCommit: C1F_BASE_COMMIT,
    frozenC1V11ManifestCommit: C1F_FROZEN_C1V11_COMMIT,
    frozenC1V11ManifestPath: C1F_V11_MANIFEST_PATH,
    frozenC1V11ManifestSha256: frozenManifestSha256,
    upstream: { repository: C1F_UPSTREAM_REPOSITORY, commit: C1F_UPSTREAM_COMMIT, tree: C1F_UPSTREAM_TREE },
    expectedReserveCount: C1F_EXPECTED_RESERVE_COUNT,
    successfullyReacquiredReserveCount: acquisitionFailure ? 0 : eligible.length,
    excludedOrFailedReserveGroups: failed,
    acquisitionFailure,
    primaryGroupIds: primary.map((group) => group.groupId),
    secondaryReserveGroupIds: secondary.map((group) => group.groupId),
    primaryRigClasses: [...new Set(primary.flatMap((group) => group.non711RigClasses))].sort(),
    confidenceModel: confidenceModel,
    batchCIdentityArtifact: C1F_BATCH_C_IDENTITY_PATH,
    batchCOverlapStatus,
    batchCAccessAttempts: ledger.batchCAccessAttempts,
    solverExecuted: false,
    causalOutcomesGenerated: false,
    confidenceMetricsComputed: false,
    confidenceTargetingMetricsComputed: false,
    confidenceWeightsUsedForSelection: false,
    responseAmplitudeUsedForSelection: false,
    disagreementMagnitudeUsedForSelection: false,
    modelRetrained: false,
    c1dEvidenceReusedAsValidOutcome: false,
    productionModified: false,
    coreModified: false,
    frontendModified: false,
    rawMeasurementBytesCommitted: false,
    noFullClone: true,
    outcomeBlindSelection: true,
    sourceInventory,
  }
  assertNoForbiddenOutcomeFields(manifestArtifact)
  const finalReport = makeFinalReport({ classification, reserveIds, reconciledReserveCount: reserveMetadataGroups.length, candidates, primary, secondary, failed, confidenceModel, batchCOverlapStatus, upstream: manifestArtifact.upstream, ledger })
  if (writeArtifacts) {
    const outputDir = resolve(repoRoot, C1F_ARTIFACT_RELATIVE_DIR)
    await mkdir(outputDir, { recursive: true })
    const artifacts = {
      'manifest.json': json(manifestArtifact),
      'reserve-universe.json': json(reserveUniverseArtifact),
      'groups.json': json(groupsArtifact),
      'provenance.json': json(provenanceArtifact),
      'rig-inventory.json': json(rigInventory),
      'independence-matrix.json': json(independenceMatrix),
      'selection-protocol.md': selectionProtocol,
      'final-report.md': finalReport,
    }
    for (const [name, contents] of Object.entries(artifacts)) await writeFile(join(outputDir, name), contents)
    const index = createArtifactHashIndex(Object.fromEntries(Object.entries(artifacts).map(([name, contents]) => [name, Buffer.from(contents)])))
    await writeFile(join(outputDir, 'evidence-sha256.txt'), index)
    verifyArtifactHashIndex(Object.fromEntries(Object.entries(artifacts).map(([name, contents]) => [name, Buffer.from(contents)])), index)
  }
  return {
    classification,
    manifest: manifestArtifact,
    reserveUniverse: reserveUniverseArtifact,
    candidates,
    primary,
    secondary,
    failed,
    confidenceModel,
    sourceInventory,
    independenceMatrix,
    ledger: { accessedPaths: [...ledger.accessedPaths].sort(), rejectedPaths: [...ledger.rejectedPaths].sort(), batchCAccessAttempts: ledger.batchCAccessAttempts },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runC1f().then((result) => {
    process.stdout.write(`${JSON.stringify({ classification: result.classification, expectedReserveCount: result.manifest.expectedReserveCount, successfullyReacquiredReserveCount: result.manifest.successfullyReacquiredReserveCount, primaryGroupIds: result.manifest.primaryGroupIds, secondaryReserveGroupIds: result.manifest.secondaryReserveGroupIds, batchCAccessAttempts: result.manifest.batchCAccessAttempts, solverExecuted: result.manifest.solverExecuted }, null, 2)}\n`)
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}
