import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  C1A_ARTIFACT_RELATIVE_DIR,
  C1A_CACHE_RELATIVE_DIR,
  C1A_FORM,
  C1A_MIN_INDEPENDENT_MEASUREMENTS,
  C1A_NORMALIZATION,
  C1A_PRIMARY_RIG,
  C1A_PROTOCOL_SCHEMA_VERSION,
  C1A_REQUIRED_GROUPS,
  C1A_SELECTION_SEED,
  C1A_SPLIT_SEED,
  C1A_V2_MAX_HZ,
  C1A_V2_MIN_HZ,
  C4C_FINAL_EVIDENCE_SHA256,
  C4_FINAL_INTERPRETATION,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_REPOSITORY,
  UPSTREAM_TREE,
  buildC1SideInventory,
  buildRigInventory,
  canonicalDeviceFamily,
  classifyRig,
  committedMember,
  configurationSignature,
  deriveGroupId,
  groupC1Measurements,
  hashEvidenceFiles,
  inventoryUpstream,
  selectC1Groups,
  sha256,
  splitDevelopmentHoldout,
  validateCandidateCurves,
} from './c1a.mjs'

export { C1A_SELECTION_SEED, C1A_SPLIT_SEED, canonicalDeviceFamily, deriveGroupId }

export const C1V11_CORPUS_VERSION = 'c1-cross-rig-confidence-corpus-v1.1'
export const C1V11_ARTIFACT_RELATIVE_DIR = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1'
export const C1V11_CLASSIFICATION_READY = 'C1_CORPUS_V1_1_READY'
export const C1V11_CLASSIFICATION_INSUFFICIENT = 'C1_CORPUS_V1_1_INSUFFICIENT'

export const PRIOR_OUTCOME_OBSERVED = 'PRIOR_OUTCOME_OBSERVED'
export const SEALED_FUTURE_BATCH_C = 'SEALED_FUTURE_BATCH_C'
export const PRIOR_C4_OUTCOME_OBSERVED = 'PRIOR_C4_OUTCOME_OBSERVED'
export const PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED = 'PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED'

const EXCLUSION_REASON_ORDER = Object.freeze([
  PRIOR_OUTCOME_OBSERVED,
  SEALED_FUTURE_BATCH_C,
  PRIOR_C4_OUTCOME_OBSERVED,
  PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED,
])

const FRESH_CASES_RELATIVE_PATH = '.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json'
const C4_GROUPS_RELATIVE_PATH = '.research-artifacts/c4-peak-aligned-consensus-corpus/groups.json'
const STRUCTURAL_INVENTORY_RELATIVE_PATH = '.research-artifacts/objective-c3-filter-knee-census/corpus-inventory.json'

const EVIDENCE_RELATIVE_PATHS = Object.freeze([
  'groups.json',
  'historical-device-exclusions.json',
  'manifest.json',
  'provenance.json',
  'rig-inventory.json',
  'selection-protocol.md',
])

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function asCases(value, name) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.cases)) return value.cases
  throw new Error(`exclusions: ${name} must be an array or contain a cases array`)
}

function asGroups(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.groups)) return value.groups
  throw new Error('exclusions: C4 groups must be an array or contain a groups array')
}

function familyFrom(value, fallback = '') {
  const candidate = value?.deviceFamily ?? value?.model ?? value?.processedName ?? fallback
  const family = canonicalDeviceFamily(candidate)
  if (!family) throw new Error('exclusions: missing canonical device family')
  return family
}

function stableReasons(reasons) {
  return [...reasons].sort((left, right) => EXCLUSION_REASON_ORDER.indexOf(left) - EXCLUSION_REASON_ORDER.indexOf(right) || left.localeCompare(right))
}

/**
 * Build the pre-outcome device-family exclusion predicate from committed
 * provenance. This function deliberately accepts parsed values so tests can
 * exercise the identity rule without touching the network or raw curves.
 */
export function buildHistoricalDeviceExclusions({ freshCases = [], c4Groups = [], structuralFixtures = [] } = {}) {
  const byFamily = new Map()
  const familiesByReason = new Map(EXCLUSION_REASON_ORDER.map((reason) => [reason, new Set()]))

  function add(familyValue, reason, provenance) {
    const deviceFamily = familyFrom({ deviceFamily: familyValue })
    const entry = byFamily.get(deviceFamily) ?? { deviceFamily, reasons: new Set(), provenance: [] }
    entry.reasons.add(reason)
    entry.provenance.push({ reason, ...provenance })
    byFamily.set(deviceFamily, entry)
    familiesByReason.get(reason)?.add(deviceFamily)
  }

  for (const freshCase of freshCases) {
    if (!freshCase?.id) throw new Error('exclusions: fresh case is missing id')
    const reason = freshCase.batch === 'C' ? SEALED_FUTURE_BATCH_C : PRIOR_OUTCOME_OBSERVED
    if (!['A', 'B', 'C'].includes(freshCase.batch)) throw new Error(`exclusions: unsupported fresh batch ${freshCase.batch}`)
    for (const role of ['source', 'target']) {
      const device = freshCase[role]
      if (!device) throw new Error(`exclusions: ${freshCase.id} is missing ${role}`)
      add(familyFrom(device), reason, {
        sourceArtifact: FRESH_CASES_RELATIVE_PATH,
        caseId: freshCase.id,
        batch: freshCase.batch,
        split: freshCase.split ?? null,
        role,
        collection: device.collection ?? null,
        model: device.model ?? null,
        processedName: device.processedName ?? null,
        rig: device.rig ?? null,
        path: device.path ?? null,
        identity: device.identity ?? null,
      })
    }
  }

  for (const c4Group of c4Groups) {
    if (!c4Group?.groupId) throw new Error('exclusions: C4 group is missing groupId')
    add(familyFrom(c4Group), PRIOR_C4_OUTCOME_OBSERVED, {
      sourceArtifact: C4_GROUPS_RELATIVE_PATH,
      groupId: c4Group.groupId,
      split: c4Group.split ?? null,
      model: c4Group.model ?? null,
      configurationSignature: c4Group.configurationSignature ?? null,
    })
  }

  for (const fixture of structuralFixtures) {
    if (!fixture?.id) throw new Error('exclusions: structural fixture is missing id')
    // Structural corpus inventory IDs are stable canonical slugs (for example
    // `64-audio-u12t`). Converting the slug is preferable to inventing a name
    // from response data; the committed fixture ID is retained as provenance.
    const slugName = String(fixture.id).replace(/-/g, ' ')
    add(familyFrom(fixture, slugName), PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED, {
      sourceArtifact: STRUCTURAL_INVENTORY_RELATIVE_PATH,
      fixtureId: fixture.id,
      role: fixture.role ?? null,
      path: fixture.path ?? null,
      sha256: fixture.sha256 ?? fixture.decompressedSha256 ?? null,
      compressedSha256: fixture.compressedSha256 ?? null,
    })
  }

  const exclusions = [...byFamily.values()]
    .sort((left, right) => left.deviceFamily.localeCompare(right.deviceFamily))
    .map((entry) => ({
      deviceFamily: entry.deviceFamily,
      reason: entry.reasons.size === 1 ? [...entry.reasons][0] : null,
      reasons: stableReasons(entry.reasons),
      provenance: entry.provenance.toSorted((left, right) => (
        String(left.sourceArtifact).localeCompare(String(right.sourceArtifact))
        || String(left.caseId ?? left.groupId ?? left.fixtureId ?? '').localeCompare(String(right.caseId ?? right.groupId ?? right.fixtureId ?? ''))
        || String(left.role ?? '').localeCompare(String(right.role ?? ''))
      )),
    }))
  const observedFamilies = new Set([...familiesByReason.get(PRIOR_OUTCOME_OBSERVED), ...familiesByReason.get(PRIOR_C4_OUTCOME_OBSERVED), ...familiesByReason.get(PRIOR_STRUCTURAL_SEARCH_OUTCOME_OBSERVED)])
  const sealedBatchCFamilies = new Set(familiesByReason.get(SEALED_FUTURE_BATCH_C))
  const allExcludedFamilies = new Set([...observedFamilies, ...sealedBatchCFamilies])
  const reasonCounts = Object.fromEntries(EXCLUSION_REASON_ORDER.map((reason) => [reason, familiesByReason.get(reason).size]))

  return {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1V11_CORPUS_VERSION,
    exclusions,
    observedFamilies,
    sealedBatchCFamilies,
    allExcludedFamilies,
    historicalObservedFamilies: [...observedFamilies].sort(),
    sealedFutureBatchCFamilies: [...sealedBatchCFamilies].sort(),
    allExcludedFamilyCount: allExcludedFamilies.size,
    historicalObservedFamilyCount: observedFamilies.size,
    sealedBatchCFamilyCount: sealedBatchCFamilies.size,
    sealedFutureBatchCFamilyCount: sealedBatchCFamilies.size,
    reasonCounts,
    provenanceRecordCount: exclusions.reduce((count, entry) => count + entry.provenance.length, 0),
  }
}

export function exclusionArtifact(inventory) {
  return {
    schemaVersion: inventory.schemaVersion,
    corpusVersion: inventory.corpusVersion,
    sourceArtifacts: [FRESH_CASES_RELATIVE_PATH, C4_GROUPS_RELATIVE_PATH, STRUCTURAL_INVENTORY_RELATIVE_PATH],
    historicalObservedFamilyCount: inventory.historicalObservedFamilyCount,
    sealedBatchCFamilyCount: inventory.sealedBatchCFamilyCount,
    sealedFutureBatchCFamilyCount: inventory.sealedBatchCFamilyCount,
    allExcludedFamilyCount: inventory.allExcludedFamilyCount,
    reasonCounts: inventory.reasonCounts,
    provenanceRecordCount: inventory.provenanceRecordCount,
    historicalObservedFamilies: inventory.historicalObservedFamilies,
    sealedFutureBatchCFamilies: inventory.sealedFutureBatchCFamilies,
    exclusions: inventory.exclusions,
  }
}

export function filterExcludedRecords(records, exclusions) {
  const observedFamilies = exclusions.observedFamilies instanceof Set
    ? exclusions.observedFamilies
    : new Set(exclusions.historicalObservedFamilies ?? [])
  const sealedBatchCFamilies = exclusions.sealedBatchCFamilies instanceof Set
    ? exclusions.sealedBatchCFamilies
    : new Set(exclusions.sealedFutureBatchCFamilies ?? [])
  return records.filter((record) => {
    const family = familyFrom(record)
    return !observedFamilies.has(family) && !sealedBatchCFamilies.has(family)
  })
}

function assertMemberCollectionUniqueness(members, label, groupId) {
  const keys = new Set()
  const identities = new Set()
  for (const member of members) {
    if (!member?.collection || !member?.concreteCurveIdentity) throw new Error(`independence: incomplete ${label} member in ${groupId}`)
    const rigClass = member.rigClass ?? classifyRig(member.rig).rigClass
    const key = `${rigClass}\u0000${member.collection}`
    if (keys.has(key)) throw new Error(`independence: duplicate collection in ${label} class for ${groupId}`)
    keys.add(key)
    if (identities.has(member.concreteCurveIdentity)) throw new Error(`independence: duplicate member identity in ${groupId}`)
    identities.add(member.concreteCurveIdentity)
    if (member.integrity?.status !== 'valid') throw new Error(`independence: invalid selected member in ${groupId}`)
    if (classifyRig(member.rig).rigClass !== rigClass) throw new Error(`independence: unsupported rig alias merge in ${groupId}`)
  }
}

/** Assert the repaired selected set without observing any response outcome. */
export function assertC1V11Independence({ groups, classification, exclusions }) {
  if (!Array.isArray(groups)) throw new Error('independence: groups must be an array')
  if (![C1V11_CLASSIFICATION_READY, C1V11_CLASSIFICATION_INSUFFICIENT].includes(classification)) throw new Error('independence: invalid v1.1 classification')
  if (groups.length > C1A_REQUIRED_GROUPS) throw new Error('independence: more than twelve groups selected')
  if (classification === C1V11_CLASSIFICATION_READY && groups.length !== C1A_REQUIRED_GROUPS) throw new Error('independence: READY requires twelve groups')
  if (classification === C1V11_CLASSIFICATION_INSUFFICIENT && groups.length === C1A_REQUIRED_GROUPS) throw new Error('independence: twelve groups require READY classification')

  const groupIds = new Set()
  const families = new Set()
  const memberIdentities = new Set()
  const observedFamilies = exclusions?.observedFamilies instanceof Set ? exclusions.observedFamilies : new Set(exclusions?.historicalObservedFamilies ?? [])
  const sealedFamilies = exclusions?.sealedBatchCFamilies instanceof Set ? exclusions.sealedBatchCFamilies : new Set(exclusions?.sealedFutureBatchCFamilies ?? [])
  for (const group of groups) {
    if (!group?.groupId || groupIds.has(group.groupId)) throw new Error(`independence: duplicate group identity ${group?.groupId ?? ''}`)
    groupIds.add(group.groupId)
    const family = familyFrom(group)
    if (observedFamilies.has(family) || sealedFamilies.has(family)) throw new Error(`independence: selected family overlaps historical or sealed exclusion ${family}`)
    if (families.has(family)) throw new Error(`independence: duplicate device family ${family}`)
    families.add(family)
    if (configurationSignature(group.configurationSignature) !== group.configurationSignature) throw new Error(`independence: invalid configuration identity ${group.groupId}`)
    if (deriveGroupId(family, group.configurationSignature) !== group.groupId) throw new Error(`independence: invalid group identity ${group.groupId}`)
    if (group.eligible !== true) throw new Error(`independence: ineligible selected group ${group.groupId}`)
    if (group.exact711IndependentCount < C1A_MIN_INDEPENDENT_MEASUREMENTS) throw new Error(`independence: fewer than three exact 711 collections in ${group.groupId}`)
    if (group.non711IndependentCount < 1) throw new Error(`independence: no non-711 observation in ${group.groupId}`)
    const exact711 = group.exact711Members ?? []
    const non711 = group.eligibleNon711Members ?? []
    if (exact711.length !== group.exact711IndependentCount || non711.length !== group.non711IndependentCount) throw new Error(`independence: member count mismatch in ${group.groupId}`)
    if (exact711.some((member) => member.rig !== C1A_PRIMARY_RIG || (member.rigClass ?? classifyRig(member.rig).rigClass) !== '711-class')) throw new Error(`independence: non-exact 711 member in ${group.groupId}`)
    if (non711.some((member) => member.rig === C1A_PRIMARY_RIG)) throw new Error(`independence: exact 711 member in non-711 set for ${group.groupId}`)
    assertMemberCollectionUniqueness(exact711, 'exact-711', group.groupId)
    assertMemberCollectionUniqueness(non711, 'non-711', group.groupId)
    const members = group.members ?? [...exact711, ...non711]
    if (members.length !== exact711.length + non711.length) throw new Error(`independence: member union mismatch in ${group.groupId}`)
    for (const member of members) {
      if (memberIdentities.has(member.concreteCurveIdentity)) throw new Error(`independence: duplicate member identity ${member.concreteCurveIdentity}`)
      memberIdentities.add(member.concreteCurveIdentity)
    }
  }
  if (classification === C1V11_CLASSIFICATION_READY) {
    const development = groups.filter((group) => group.split === 'development')
    const holdout = groups.filter((group) => group.split === 'holdout')
    if (development.length !== 6 || holdout.length !== 6) throw new Error('independence: development/holdout split is not 6/6')
    if (groups.some((group) => !['development', 'holdout'].includes(group.split))) throw new Error('independence: READY group has no split')
    if (new Set(groups.map((group) => group.deviceFamily)).size !== groups.length) throw new Error('independence: duplicate family across split')
  } else if (groups.some((group) => group.split !== undefined && group.split !== null)) {
    throw new Error('independence: insufficient corpus must not carry a six/six split')
  }
  return true
}

function historicalBoundaryText() {
  return `# C1a V1.1 cross-study independence repair

This milestone replaces the C1a v1 selected set only for subsequent C1
experimental use. The original C1a artifact is immutable. This artifact is
metadata/provenance/integrity evidence only and computes no repeatability,
cross-rig response delta, confidence profile, weighting, loss, filter, or
solver outcome.

## Immutable source and unchanged C1a semantics

- Upstream repository: \`${UPSTREAM_REPOSITORY}\`
- Upstream commit: \`${UPSTREAM_COMMIT}\`
- Upstream tree: \`${UPSTREAM_TREE}\`
- Frozen boundary: \`${FROZEN_BOUNDARY}\`
- Form: exact \`${C1A_FORM}\`
- Primary rig: exact literal \`${C1A_PRIMARY_RIG}\`; every other exact rig string remains distinct.
- Domain: ${C1A_V2_MIN_HZ}–${C1A_V2_MAX_HZ} Hz, terminal flat closure, and 500 Hz normalization (${C1A_NORMALIZATION.levelDb} dB).
- Eligibility: at least ${C1A_MIN_INDEPENDENT_MEASUREMENTS} independent exact-711 collections and at least one independent non-711 observation.
- Ranking: unchanged C1a tier/count/class/count/hash/group-ID tuple; selection seed \`${C1A_SELECTION_SEED}\`.
- Split: unchanged six/six hash split seed \`${C1A_SPLIT_SEED}\`, applied only when twelve groups remain.

## Independence repair

The exclusion predicate is applied to canonical device families before
grouping and deterministic selection. It is derived only from the committed
\`historical-device-exclusions.json\` provenance inventory. No response shape
or outcome value is used. Families in sealed Fresh Real Batch C are excluded
to protect that future corpus even though its outcomes remain unobserved.

The selected set asserts unique families, exact configuration identity,
valid immutable upstream integrity records, at least three exact-711
collections, at least one non-711 observation, and no unsupported rig alias
merge. Raw upstream bytes remain in the ignored cache only.

## Historical C4 boundary

- c4PeakAlignmentStatus: \`${C4_FINAL_INTERPRETATION}\`
- Historical C4 evidence SHA-256: \`${C4C_FINAL_EVIDENCE_SHA256}\`
- Peak alignment is not used by this milestone.
- Fresh Real Batch C response outcomes are not acquired or executed.
`
}

function assertNoOutcomeFlags(manifest, provenance) {
  const names = ['confidenceWeightingApplied', 'confidenceCurveComputed', 'autoEqSolverExecuted', 'solverExecuted', 'responseOutcomeObserved']
  for (const value of [manifest, provenance]) {
    for (const name of names) if (value?.[name] === true) throw new Error(`provenance: forbidden outcome flag ${name}`)
  }
  if (manifest?.peakAlignedDispersionUsed !== false || provenance?.peakAlignedDispersionUsed !== false) throw new Error('provenance: peak alignment is forbidden')
}

export function validateC1V11Artifact({ manifest, groups, provenance, exclusions, artifactFiles }) {
  if (!manifest || !groups || !provenance || !exclusions) throw new Error('provenance: incomplete C1 v1.1 artifact bundle')
  if (manifest.corpusVersion !== C1V11_CORPUS_VERSION || groups.corpusVersion !== C1V11_CORPUS_VERSION || provenance.corpusVersion !== C1V11_CORPUS_VERSION || exclusions.corpusVersion !== C1V11_CORPUS_VERSION) throw new Error('provenance: v1.1 corpus identity mismatch')
  if (manifest.upstream?.repository !== UPSTREAM_REPOSITORY || manifest.upstream?.commit !== UPSTREAM_COMMIT || manifest.upstream?.tree !== UPSTREAM_TREE) throw new Error('provenance: upstream identity mismatch')
  if (manifest.frozenBoundary !== FROZEN_BOUNDARY || provenance.frozenBoundary !== FROZEN_BOUNDARY) throw new Error('provenance: frozen boundary mismatch')
  if (manifest.c4PeakAlignmentStatus !== C4_FINAL_INTERPRETATION || manifest.c4?.finalEvidenceSha256 !== C4C_FINAL_EVIDENCE_SHA256 || manifest.c4?.finalInterpretation !== C4_FINAL_INTERPRETATION) throw new Error('provenance: historical C4 status mismatch')
  if (manifest.peakAlignedDispersionUsed !== false) throw new Error('provenance: peak alignment is forbidden')
  assertNoOutcomeFlags(manifest, provenance)
  assertC1V11Independence({ groups: groups.groups ?? groups, classification: manifest.classification, exclusions: {
    observedFamilies: new Set(exclusions.historicalObservedFamilies),
    sealedBatchCFamilies: new Set(exclusions.sealedFutureBatchCFamilies),
  } })
  const groupValues = groups.groups ?? groups
  const groupIds = groupValues.map((group) => group.groupId)
  if (JSON.stringify(manifest.selection?.selectedGroupIds ?? []) !== JSON.stringify(groupIds)) throw new Error('provenance: manifest selected-group identity mismatch')
  if (JSON.stringify(provenance.selectedGroupIds ?? []) !== JSON.stringify(groupIds)) throw new Error('provenance: provenance selected-group identity mismatch')
  const memberIds = groupValues.flatMap((group) => (group.members ?? []).map((member) => member.concreteCurveIdentity))
  const provenanceIds = (provenance.members ?? []).map((member) => member.concreteCurveIdentity)
  if (new Set(memberIds).size !== memberIds.length) throw new Error('provenance: duplicate selected member identity')
  for (const identity of memberIds) if (!provenanceIds.includes(identity)) throw new Error(`provenance: missing member ${identity}`)
  if (artifactFiles && manifest.artifactFileHashes) {
    for (const [relativePath, expected] of Object.entries(manifest.artifactFileHashes)) {
      const actual = hashEvidenceFiles(artifactFiles, [relativePath])
      if (actual !== expected) throw new Error(`provenance: ${relativePath} hash mismatch`)
    }
  }
  return true
}

async function loadCommittedExclusionSources(root) {
  const freshCases = asCases(await readJson(resolve(root, FRESH_CASES_RELATIVE_PATH)), 'Fresh Real cases')
  const c4Groups = asGroups(await readJson(resolve(root, C4_GROUPS_RELATIVE_PATH)))
  const structuralInventory = await readJson(resolve(root, STRUCTURAL_INVENTORY_RELATIVE_PATH))
  if (!Array.isArray(structuralInventory.realFixtures)) throw new Error('exclusions: structural inventory has no realFixtures array')
  return { freshCases, c4Groups, structuralFixtures: structuralInventory.realFixtures }
}

function groupForArtifact(group) {
  const exact711Members = group.exact711Members.map(committedMember)
  const eligibleNon711Members = group.eligibleNon711Members.map(committedMember)
  const eligibleNon711MembersByRigClass = Object.fromEntries(group.non711RigClasses.map((rigClass) => [
    rigClass,
    eligibleNon711Members.filter((member) => member.rigClass === rigClass),
  ]))
  return {
    groupId: group.groupId,
    groupKey: group.groupKey,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    selectionHash: group.selectionHash,
    strengthTier: group.strengthTier,
    split: group.split ?? null,
    splitHash: group.splitHash ?? null,
    eligible: group.eligible,
    exact711IndependentCount: group.exact711IndependentCount,
    exact711Collections: [...group.exact711Collections].sort(),
    exact711IndependentCollections: [...group.exact711Collections].sort(),
    non711IndependentCount: group.non711IndependentCount,
    distinctNon711RigClassCount: group.distinctNon711RigClassCount,
    non711RigClasses: [...group.non711RigClasses].sort(),
    non711CollectionsByRigClass: group.non711CollectionsByRigClass,
    non711IndependentCollections: group.non711CollectionsByRigClass,
    totalIndependentCollectionCount: group.totalIndependentCollectionCount,
    distinctCollectionCount: group.distinctCollectionCount,
    distinctRigClassCount: group.distinctRigClassCount,
    allRigClasses: [...group.allRigClasses].sort(),
    allExactRigStrings: [...group.allExactRigStrings].sort(),
    rigClasses: [...group.allRigClasses].sort(),
    exactRigStrings: [...group.allExactRigStrings].sort(),
    exact711Members,
    eligibleNon711Members,
    eligibleNon711MembersByRigClass,
    members: [...exact711Members, ...eligibleNon711Members],
  }
}

function eligibleGroupSummary(group) {
  return {
    groupId: group.groupId,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    strengthTier: group.strengthTier,
    exact711IndependentCount: group.exact711IndependentCount,
    non711IndependentCount: group.non711IndependentCount,
    distinctNon711RigClassCount: group.distinctNon711RigClassCount,
    totalIndependentCollectionCount: group.totalIndependentCollectionCount,
    selectionHash: group.selectionHash,
  }
}

/** Acquire the pinned inventory, repair independence, and write metadata-only v1.1 evidence. */
export async function runC1V11(options = {}) {
  const root = options.repositoryRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('C1 v1.1 requires fetch')
  const cacheRoot = options.cacheRoot ?? resolve(root, C1A_CACHE_RELATIVE_DIR)
  const outputDir = options.outputDir ?? resolve(root, C1V11_ARTIFACT_RELATIVE_DIR)
  const sources = options.exclusionSources ?? await loadCommittedExclusionSources(root)
  const exclusionInventory = buildHistoricalDeviceExclusions(sources)
  const exclusions = exclusionArtifact(exclusionInventory)
  const exclusionSha256 = sha256(JSON.stringify(exclusions))

  const inventory = await inventoryUpstream({ fetchImpl, cacheRoot })
  const validatedRecords = await validateCandidateCurves(inventory.records, fetchImpl, cacheRoot)
  const filteredRecords = filterExcludedRecords(validatedRecords, exclusionInventory)
  const groups = groupC1Measurements(filteredRecords)
  const eligibleGroups = groups.filter((group) => group.eligible)
  const selectedUnsplit = selectC1Groups(eligibleGroups)
  const selectedGroups = selectedUnsplit.length === C1A_REQUIRED_GROUPS ? splitDevelopmentHoldout(selectedUnsplit) : selectedUnsplit
  const classification = selectedGroups.length === C1A_REQUIRED_GROUPS ? C1V11_CLASSIFICATION_READY : C1V11_CLASSIFICATION_INSUFFICIENT
  const shortage = Math.max(0, C1A_REQUIRED_GROUPS - eligibleGroups.length)
  const selectedArtifactGroups = selectedGroups.map(groupForArtifact)
  assertC1V11Independence({ groups: selectedArtifactGroups, classification, exclusions: exclusionInventory })
  const sideInventory = buildC1SideInventory(groups)
  const rigInventory = buildRigInventory(inventory.allMetadataRows, validatedRecords)
  const selectedMembers = selectedArtifactGroups.flatMap((group) => group.members)

  const provenance = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1V11_CORPUS_VERSION,
    frozenBoundary: FROZEN_BOUNDARY,
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    c4PeakAlignmentStatus: C4_FINAL_INTERPRETATION,
    peakAlignedDispersionUsed: false,
    rawDataPolicy: 'external immutable raw source plus ignored local cache only; no upstream measurement bytes committed',
    historicalExclusionsArtifact: 'historical-device-exclusions.json',
    historicalExclusionsSha256: exclusionSha256,
    members: selectedMembers,
    selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
    metadataAudit: inventory.audit,
    exclusionAudit: {
      historicalObservedFamilyCount: exclusionInventory.historicalObservedFamilyCount,
      sealedBatchCFamilyCount: exclusionInventory.sealedBatchCFamilyCount,
      allExcludedFamilyCount: exclusionInventory.allExcludedFamilyCount,
      reasonCounts: exclusionInventory.reasonCounts,
      filteredRecordCount: validatedRecords.length - filteredRecords.length,
    },
    objectiveValidationPerformed: true,
    confidenceWeightingApplied: false,
    confidenceCurveComputed: false,
    responseOutcomeObserved: false,
    autoEqSolverExecuted: false,
    solverExecuted: false,
  }
  const groupsArtifact = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1V11_CORPUS_VERSION,
    form: C1A_FORM,
    primaryExactRig: C1A_PRIMARY_RIG,
    selectionSeed: C1A_SELECTION_SEED,
    splitSeed: C1A_SPLIT_SEED,
    requiredGroupCount: C1A_REQUIRED_GROUPS,
    minimumIndependentMeasurements: C1A_MIN_INDEPENDENT_MEASUREMENTS,
    exclusionArtifact: 'historical-device-exclusions.json',
    exclusionArtifactSha256: exclusionSha256,
    eligibleGroupIds: eligibleGroups.map((group) => group.groupId).sort(),
    eligibleGroupSummaries: eligibleGroups.map(eligibleGroupSummary).sort((left, right) => left.groupId.localeCompare(right.groupId)),
    groups: selectedArtifactGroups,
  }
  const protocol = historicalBoundaryText()
  const artifactPayloads = new Map([
    ['groups.json', jsonText(groupsArtifact)],
    ['historical-device-exclusions.json', jsonText(exclusions)],
    ['provenance.json', jsonText(provenance)],
    ['rig-inventory.json', jsonText(rigInventory)],
    ['selection-protocol.md', protocol],
  ])
  const artifactFileHashes = Object.fromEntries([...artifactPayloads.keys()].map((relativePath) => [relativePath, hashEvidenceFiles(artifactPayloads, [relativePath])]))
  const developmentGroupIds = selectedArtifactGroups.filter((group) => group.split === 'development').map((group) => group.groupId)
  const holdoutGroupIds = selectedArtifactGroups.filter((group) => group.split === 'holdout').map((group) => group.groupId)
  const manifest = {
    schemaVersion: C1A_PROTOCOL_SCHEMA_VERSION,
    corpusVersion: C1V11_CORPUS_VERSION,
    milestone: 'C1a-v1.1-cross-study-independence-repair',
    classification,
    shortage,
    frozenBoundary: FROZEN_BOUNDARY,
    c4PeakAlignmentStatus: C4_FINAL_INTERPRETATION,
    c4: { finalEvidenceSha256: C4C_FINAL_EVIDENCE_SHA256, finalInterpretation: C4_FINAL_INTERPRETATION },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    domain: {
      form: C1A_FORM,
      v2MinHz: C1A_V2_MIN_HZ,
      v2MaxHz: C1A_V2_MAX_HZ,
      normalization: C1A_NORMALIZATION,
      terminalClosure: 'terminal-flat-hold-to-v2-max',
    },
    selection: {
      seed: C1A_SELECTION_SEED,
      splitSeed: C1A_SPLIT_SEED,
      primaryExactRig: C1A_PRIMARY_RIG,
      requiredGroupCount: C1A_REQUIRED_GROUPS,
      minimumIndependentMeasurements: C1A_MIN_INDEPENDENT_MEASUREMENTS,
      eligiblePrimaryGroupCount: eligibleGroups.length,
      eligibleGroupIds: eligibleGroups.map((group) => group.groupId).sort(),
      selectedGroupIds: selectedArtifactGroups.map((group) => group.groupId),
      developmentGroupIds,
      holdoutGroupIds,
    },
    exclusions: {
      artifact: 'historical-device-exclusions.json',
      sha256: exclusionSha256,
      historicalObservedFamilyCount: exclusionInventory.historicalObservedFamilyCount,
      sealedBatchCFamilyCount: exclusionInventory.sealedBatchCFamilyCount,
      allExcludedFamilyCount: exclusionInventory.allExcludedFamilyCount,
      reasonCounts: exclusionInventory.reasonCounts,
      filteredRecordCount: validatedRecords.length - filteredRecords.length,
    },
    inventory: {
      processedInEarCurveCount: inventory.audit.eligibleBeforeStrictResolution,
      strictResolvedCurveCount: inventory.audit.eligibleAfterStrictResolution,
      postExclusionStrictResolvedCurveCount: filteredRecords.length,
      primary711CurveCount: validatedRecords.filter((record) => record.rig === C1A_PRIMARY_RIG).length,
      selectedMemberCount: selectedMembers.length,
    },
    metadataAudit: inventory.audit,
    sideInventory,
    flags: {
      confidenceWeightingApplied: false,
      confidenceCurveComputed: false,
      responseOutcomeObserved: false,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      peakAlignedDispersionUsed: false,
      rawMeasurementsCommitted: false,
      freshRealBatchCExecuted: false,
    },
    confidenceWeightingApplied: false,
    confidenceCurveComputed: false,
    responseOutcomeObserved: false,
    solverExecuted: false,
    autoEqSolverExecuted: false,
    rawMeasurementsCommitted: false,
    peakAlignedDispersionUsed: false,
    freshRealBatchCExecuted: false,
    hashes: {
      groupsSha256: sha256(JSON.stringify(groupsArtifact)),
      exclusionsSha256: exclusionSha256,
      provenanceSha256: sha256(JSON.stringify(provenance)),
      rigInventorySha256: sha256(JSON.stringify(rigInventory)),
      selectionProtocolSha256: sha256(protocol),
    },
    artifactFileHashes,
  }

  await mkdir(outputDir, { recursive: true })
  for (const [relativePath, payload] of artifactPayloads) await writeFile(resolve(outputDir, relativePath), payload, 'utf8')
  await writeFile(resolve(outputDir, 'manifest.json'), jsonText(manifest), 'utf8')
  const evidenceSha256 = hashEvidenceFiles(outputDir, EVIDENCE_RELATIVE_PATHS)
  await writeFile(resolve(outputDir, 'evidence-sha256.txt'), `${evidenceSha256}\n`, 'utf8')
  const committedExclusions = JSON.parse(await readFile(resolve(outputDir, 'historical-device-exclusions.json'), 'utf8'))
  validateC1V11Artifact({ manifest, groups: groupsArtifact, provenance, exclusions: committedExclusions, artifactFiles: outputDir })
  return {
    classification,
    shortage,
    evidenceSha256,
    manifest,
    groups: groupsArtifact,
    provenance,
    exclusions: committedExclusions,
    rigInventory,
    sideInventory,
    eligibleGroups,
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runC1V11()
    .then((result) => process.stdout.write(`${JSON.stringify({
      classification: result.classification,
      shortage: result.shortage,
      evidenceSha256: result.evidenceSha256,
      eligiblePrimaryGroups: result.eligibleGroups.length,
      historicalObservedFamilyCount: result.manifest.exclusions.historicalObservedFamilyCount,
      sealedBatchCFamilyCount: result.manifest.exclusions.sealedBatchCFamilyCount,
      allExcludedFamilyCount: result.manifest.exclusions.allExcludedFamilyCount,
      selectedGroupIds: result.groups.groups.map((group) => group.groupId),
    }, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
