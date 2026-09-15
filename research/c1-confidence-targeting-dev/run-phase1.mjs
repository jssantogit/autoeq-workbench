import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C1A_FORM,
  C1A_PRIMARY_RIG,
  C1A_V2_MAX_HZ,
  C1A_V2_MIN_HZ,
  C1A_V2_POINTS_PER_OCTAVE,
  C1A_NORMALIZATION,
  C1A_SELECTION_SEED,
  C1A_SPLIT_SEED,
  FROZEN_BOUNDARY,
  UPSTREAM_COMMIT,
  UPSTREAM_REPOSITORY,
  UPSTREAM_TREE,
  C4C_FINAL_EVIDENCE_SHA256,
  C4_FINAL_INTERPRETATION,
  classifyRig,
  hashEvidenceFiles,
  rawUrl,
} from '../c1-cross-rig-confidence-corpus/c1a.mjs'
import {
  validateC1V11Artifact,
} from '../c1-cross-rig-confidence-corpus/c1a-v1.1.mjs'
import {
  C1B_ALGORITHM_VERSION,
  C1B_ARTIFACT_RELATIVE_DIR,
  C1B_CACHE_RELATIVE_DIR,
  C1B_FORM,
  C1B_MIN_CLASS_GROUPS,
  C1B_NORMALIZATION,
  C1B_PRIMARY_BAND_HZ,
  C1B_PROTOCOL_SCHEMA_VERSION,
  C1B_REQUIRED_DEVELOPMENT_GROUPS,
  C1B_TARGET_SCALE_DB,
  C1B_TARGETING_THRESHOLD,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUP_IDS,
  FRESH_REAL_BATCH_C_REJECTED,
  PHASE0_CORPUS_COMMIT,
  PHASE0_EVIDENCE_SHA256,
  BATCH_C_REJECTION_TOKEN,
  assertC1bGroupSplit,
  assertNoHoldoutOrBatchC,
  buildConfidenceProfiles,
  buildConfidenceWeights,
  buildDevelopmentGate,
  buildLeaveOneGroupOut,
  calculateCrossRigDisagreement,
  calculateRepeatabilitySigma,
  classifyGroupTargeting,
  evaluateTargetingObservation,
  hashJson,
  pointwiseMedian,
  parseCurve,
  prepareCurve,
  verifyRawProvenance,
  validateProtocolManifest,
} from './c1b.mjs'

/** The exact commit at which the C1b protocol became immutable. */
export const PROTOCOL_FREEZE_COMMIT = '6e8dba547bc9f12a072e0660ce35c89a3d502455'
export const PROTOCOL_SHA256 = 'f5d273820e95871ebf6f22bbeffffe000add5a395fb0da6f8825dab185ff48e8'
export const OUTCOME_ARTIFACT_KIND = 'c1b-confidence-targeting-development-outcome'
export const MAX_NETWORK_ATTEMPTS = 3
export const NETWORK_RETRY_DELAY_MS = 250

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CORPUS_DIR_RELATIVE = '.research-artifacts/c1-cross-rig-confidence-corpus-v1.1'
const CORPUS_EVIDENCE_PATHS = [
  'groups.json',
  'historical-device-exclusions.json',
  'manifest.json',
  'provenance.json',
  'rig-inventory.json',
  'selection-protocol.md',
]
const OUTCOME_EVIDENCE_STATIC = ['aggregate-evidence.json', 'manifest.json', 'schema.json', 'final-report.md']
const RAW_FETCH_HEADERS = Object.freeze({ 'User-Agent': 'autoeq-workbench-c1b-development' })

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`

function currentCommit(repositoryRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

function assertArrayEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function profileHash(profile) {
  return hashJson({ frequenciesHz: profile.frequenciesHz, valuesDb: profile.valuesDb })
}

function curveHash(curve) {
  return profileHash(curve)
}

function observationHash(observation) {
  return hashJson({
    frequenciesHz: observation.frequenciesHz,
    deltaDb: observation.deltaDb,
    absoluteDeltaDb: observation.absoluteDeltaDb,
  })
}

function compactMember(member, prepared = null) {
  const integrity = member.integrity ?? {}
  const preparedHash = prepared
    ? hashJson({ frequenciesHz: prepared.frequenciesHz, valuesDb: prepared.valuesDb })
    : null
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
    upstreamSha256: member.upstreamSha256 ?? integrity.upstreamSha256,
    sourceRows: member.sourceRows,
    sourceUrls: member.sourceUrls,
    originalParsedPointsSha256: prepared?.originalPointsSha256 ?? integrity.originalParsedPointsSha256,
    canonicalParsedPointsSha256: prepared?.canonicalPointsSha256 ?? integrity.canonicalParsedPointsSha256,
    normalizedParsedPointsSha256: prepared?.normalizedPointsSha256 ?? integrity.normalizedParsedPointsSha256,
    integrity: {
      ...integrity,
      status: integrity.status,
    },
    preparedCurveSha256: preparedHash,
    rawBytesCommitted: false,
  }
}

function compactProfile(profile, metadata = {}) {
  const values = {
    frequenciesHz: [...profile.frequenciesHz],
    valuesDb: [...profile.valuesDb],
  }
  return {
    ...metadata,
    method: profile.method ?? null,
    scale: profile.scale ?? null,
    uncertaintyComponent: profile.uncertaintyComponent ?? null,
    rigClass: profile.rigClass ?? null,
    trainingGroupCount: profile.trainingGroupCount ?? null,
    frequenciesHz: values.frequenciesHz,
    valuesDb: values.valuesDb,
    profileSha256: profileHash(values),
  }
}

function compactReference(reference) {
  return {
    groupId: reference.groupId,
    deviceFamily: reference.deviceFamily,
    exact711MemberIdentities: [...reference.exact711MemberIdentities],
    consensusSha256: curveHash(reference.consensus),
    repeatabilitySigmaSha256: curveHash(reference.sigma),
    observationIds: reference.observations.map((observation) => observation.observationId),
    observationHashes: Object.fromEntries(reference.observations.map((observation) => [
      observation.observationId,
      observationHash(observation),
    ])),
  }
}

function compactTrainingProfiles(profiles) {
  const rigProfiles = Object.fromEntries(Object.entries(profiles.rigProfiles).map(([rigClass, entry]) => [
    rigClass,
    {
      rigClass,
      source: entry.source,
      fallback: entry.fallback,
      distinctTrainingGroupCount: entry.distinctTrainingGroupCount,
      trainingGroupIds: [...entry.trainingGroupIds],
      observationCount: entry.observationCount,
      profile: compactProfile(entry.profile, { rigClass }),
      profileSha256: entry.profileSha256,
    },
  ]))
  return {
    trainingGroupIds: [...profiles.trainingGroupIds],
    frequenciesHz: [...profiles.frequenciesHz],
    trainingGroupReferences: profiles.groupReferences.map(compactReference),
    repeatability: compactProfile(profiles.repeatability),
    globalRig: compactProfile(profiles.globalRig),
    rigProfiles,
    profileHashes: {
      repeatability: profiles.profileHashes.repeatability,
      globalRig: profiles.profileHashes.globalRig,
      rigProfiles: { ...profiles.profileHashes.rigProfiles },
    },
  }
}

function fallbackDecision(profiles, rigClass) {
  const entry = profiles.rigProfiles[rigClass]
  if (entry) {
    return {
      rigClass,
      source: entry.source,
      fallback: entry.fallback,
      reason: entry.fallback ? 'CLASS_HAS_FEWER_THAN_TWO_TRAINING_GROUPS' : 'CLASS_HAS_AT_LEAST_TWO_TRAINING_GROUPS',
      distinctTrainingGroupCount: entry.distinctTrainingGroupCount,
      trainingGroupIds: [...entry.trainingGroupIds],
      observationCount: entry.observationCount,
      profileSha256: entry.profileSha256,
      globalProfileSha256: profiles.profileHashes.globalRig,
    }
  }
  return {
    rigClass,
    source: 'GLOBAL_FALLBACK',
    fallback: true,
    reason: 'CLASS_NOT_PRESENT_IN_TRAINING_GROUPS',
    distinctTrainingGroupCount: 0,
    trainingGroupIds: [],
    observationCount: 0,
    profileSha256: profiles.profileHashes.globalRig,
    globalProfileSha256: profiles.profileHashes.globalRig,
  }
}

function assertSelectedGroupBoundary(groupsEnvelope, exclusions) {
  const groups = groupsEnvelope.groups ?? groupsEnvelope
  if (!Array.isArray(groups)) throw new Error('C1 v1.1 groups artifact is not an array')
  const developmentIds = groups.filter((group) => group.split === 'development').map((group) => group.groupId)
  const holdoutIds = groups.filter((group) => group.split === 'holdout').map((group) => group.groupId)
  assertC1bGroupSplit({ developmentGroupIds: developmentIds, holdoutGroupIds: holdoutIds })
  assertArrayEqual(developmentIds, [...DEVELOPMENT_GROUP_IDS], 'development IDs')
  assertArrayEqual(holdoutIds, [...HOLDOUT_GROUP_IDS], 'holdout IDs')
  assertNoHoldoutOrBatchC(developmentIds)

  const historical = new Set(exclusions.historicalObservedFamilies ?? [])
  const sealed = new Set(exclusions.sealedFutureBatchCFamilies ?? [])
  const families = new Set()
  for (const group of groups.filter((candidate) => candidate.split === 'development')) {
    if (families.has(group.deviceFamily)) throw new Error(`selected development families overlap: ${group.deviceFamily}`)
    families.add(group.deviceFamily)
    if (historical.has(group.deviceFamily)) throw new Error(`selected development family is historically observed: ${group.deviceFamily}`)
    if (sealed.has(group.deviceFamily)) throw new Error(`selected development family is sealed Batch C: ${group.deviceFamily}`)
    if (group.eligible !== true) throw new Error(`selected development group is not eligible: ${group.groupId}`)
    if (group.exact711IndependentCount < 3 || group.non711IndependentCount < 1) {
      throw new Error(`selected development group fails C1a eligibility: ${group.groupId}`)
    }
    if (group.exact711Members.length !== group.exact711IndependentCount) throw new Error(`711 count mismatch: ${group.groupId}`)
    if (group.eligibleNon711Members.length !== group.non711IndependentCount) throw new Error(`non-711 count mismatch: ${group.groupId}`)
    const memberIdentities = new Set()
    for (const member of [...group.exact711Members, ...group.eligibleNon711Members]) {
      if (memberIdentities.has(member.concreteCurveIdentity)) throw new Error(`duplicate member identity: ${member.concreteCurveIdentity}`)
      memberIdentities.add(member.concreteCurveIdentity)
      if (member.form !== C1A_FORM || member.form !== C1B_FORM) throw new Error(`member form mismatch: ${member.concreteCurveIdentity}`)
      if (member.deviceFamily !== group.deviceFamily || member.configurationSignature !== group.configurationSignature) {
        throw new Error(`member configuration identity mismatch: ${member.concreteCurveIdentity}`)
      }
      if (member.upstreamRawUrl !== rawUrl(member.path) || !member.upstreamRawUrl.includes(`/${UPSTREAM_COMMIT}/`)) {
        throw new Error(`member raw URL is not pinned: ${member.path}`)
      }
      if (member.integrity?.status !== 'valid') throw new Error(`member integrity is not valid: ${member.path}`)
      if (classifyRig(member.rig).rigClass !== member.rigClass) throw new Error(`unsupported rig alias merge: ${member.rig}`)
    }
    for (const member of group.exact711Members) {
      if (member.rig !== C1A_PRIMARY_RIG || member.rigClass !== '711-class') throw new Error(`non-exact member in 711 set: ${member.concreteCurveIdentity}`)
    }
    for (const member of group.eligibleNon711Members) {
      if (member.rig === C1A_PRIMARY_RIG || member.rigClass === '711-class') throw new Error(`exact 711 member in non-711 set: ${member.concreteCurveIdentity}`)
    }
  }
  return groups
}

/** Verify the frozen C1 v1.1 metadata bundle without reading any raw curve. */
export async function verifyFrozenC1V11Provenance({ repositoryRoot = MODULE_ROOT } = {}) {
  const artifactDir = resolve(repositoryRoot, CORPUS_DIR_RELATIVE)
  const [manifest, groups, provenance, exclusions] = await Promise.all([
    readJson(resolve(artifactDir, 'manifest.json')),
    readJson(resolve(artifactDir, 'groups.json')),
    readJson(resolve(artifactDir, 'provenance.json')),
    readJson(resolve(artifactDir, 'historical-device-exclusions.json')),
  ])
  if (manifest.corpusVersion !== 'c1-cross-rig-confidence-corpus-v1.1') throw new Error('C1 v1.1 corpus version mismatch')
  if (manifest.classification !== 'C1_CORPUS_V1_1_READY') throw new Error('C1 v1.1 corpus is not READY')
  assertEqual(manifest.upstream?.repository, UPSTREAM_REPOSITORY, 'C1 v1.1 upstream repository')
  assertEqual(manifest.upstream?.commit, UPSTREAM_COMMIT, 'C1 v1.1 upstream commit')
  assertEqual(manifest.upstream?.tree, UPSTREAM_TREE, 'C1 v1.1 upstream tree')
  assertEqual(manifest.frozenBoundary, FROZEN_BOUNDARY, 'C1 v1.1 frozen boundary')
  assertEqual(provenance.frozenBoundary, FROZEN_BOUNDARY, 'C1 v1.1 provenance boundary')
  if (manifest.c4PeakAlignmentStatus !== C4_FINAL_INTERPRETATION || manifest.c4?.finalEvidenceSha256 !== C4C_FINAL_EVIDENCE_SHA256) {
    throw new Error('C1 v1.1 historical C4 status mismatch')
  }
  if (manifest.peakAlignedDispersionUsed !== false || provenance.peakAlignedDispersionUsed !== false) throw new Error('C1 v1.1 uses forbidden peak alignment')
  const selectedGroups = assertSelectedGroupBoundary(groups, exclusions)
  validateC1V11Artifact({ manifest, groups, provenance, exclusions, artifactFiles: artifactDir })
  const evidenceSha256 = hashEvidenceFiles(artifactDir, CORPUS_EVIDENCE_PATHS)
  const recordedEvidenceSha256 = (await readFile(resolve(artifactDir, 'evidence-sha256.txt'), 'utf8')).trim()
  assertEqual(recordedEvidenceSha256, PHASE0_EVIDENCE_SHA256, 'C1 v1.1 recorded evidence SHA-256')
  assertEqual(evidenceSha256, PHASE0_EVIDENCE_SHA256, 'C1 v1.1 computed evidence SHA-256')
  return {
    artifactDir,
    manifest,
    groups: selectedGroups,
    provenance,
    exclusions,
    evidenceSha256,
  }
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

/** Reacquire one selected member, validating both immutable hashes before parse. */
export async function reacquirePinnedMember(member, {
  fetchImpl = globalThis.fetch,
  cacheRoot,
  maxAttempts = MAX_NETWORK_ATTEMPTS,
  retryDelayMs = NETWORK_RETRY_DELAY_MS,
} = {}) {
  if (!member?.path || !member.upstreamRawUrl) throw new Error('selected member lacks immutable raw provenance')
  if (member.form !== C1B_FORM || member.upstreamRawUrl !== rawUrl(member.path) || !member.upstreamRawUrl.includes(`/${UPSTREAM_COMMIT}/`)) {
    throw new Error(`selected member raw URL is not pinned to frozen commit: ${member.path}`)
  }
  if (member.integrity?.status !== 'valid') throw new Error(`selected member lacks valid integrity: ${member.path}`)
  if (typeof fetchImpl !== 'function') throw new Error('C1b requires fetch')
  const targetCacheRoot = cacheRoot ?? resolve(MODULE_ROOT, C1B_CACHE_RELATIVE_DIR)
  const cacheKey = (await import('node:crypto')).createHash('sha256').update(member.path).digest('hex')
  const cachePath = resolve(targetCacheRoot, cacheKey)
  const expectedSha256 = member.integrity.upstreamSha256 ?? member.upstreamSha256
  const expectedBlobSha = member.blobSha

  try {
    const cachedBytes = await readFile(cachePath)
    const provenance = verifyRawProvenance(cachedBytes, { expectedSha256, expectedBlobSha })
    return { member, bytes: cachedBytes, cachePath, acquisition: 'CACHE_VALIDATED', provenance }
  } catch (cacheError) {
    // A missing or stale cache is not evidence of an upstream failure; fetch a
    // fresh pinned object. Hash mismatches from a fetched response are fatal,
    // not transient, and are never retried or written to the cache.
  }

  let lastError = null
  const attempts = Math.max(1, Number(maxAttempts) || MAX_NETWORK_ATTEMPTS)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response
    try {
      response = await fetchImpl(member.upstreamRawUrl, { redirect: 'error', headers: RAW_FETCH_HEADERS })
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      await sleep(retryDelayMs * attempt)
      continue
    }
    if (!response?.ok) {
      const status = Number(response?.status)
      const error = new Error(`upstream raw ${status || 'unknown'}: ${member.path}`)
      lastError = error
      if (!isTransientStatus(status) || attempt >= attempts) break
      await sleep(retryDelayMs * attempt)
      continue
    }
    let bytes
    try {
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      await sleep(retryDelayMs * attempt)
      continue
    }
    // A successful HTTP response with wrong immutable identity is a semantic
    // provenance failure. Do not retry it as if it were network flakiness.
    const provenance = verifyRawProvenance(bytes, { expectedSha256, expectedBlobSha })
    await mkdir(targetCacheRoot, { recursive: true })
    await writeFile(cachePath, bytes)
    return { member, bytes, cachePath, acquisition: 'FETCHED_AND_VALIDATED', provenance }
  }
  throw new Error(`bounded upstream acquisition failed for ${member.path} after ${attempts} attempts: ${lastError?.message ?? lastError}`)
}

function verifyPreparedIntegrity(member, originalPoints, prepared) {
  const integrity = member.integrity ?? {}
  const checks = [
    ['originalParsedPointsSha256', prepared.originalPointsSha256],
    ['canonicalParsedPointsSha256', prepared.canonicalPointsSha256],
    ['normalizedParsedPointsSha256', prepared.normalizedPointsSha256],
  ]
  for (const [name, actual] of checks) {
    if (integrity[name] && integrity[name] !== actual) throw new Error(`${name} mismatch: ${member.path}`)
  }
  if (prepared.frequenciesHz[0] !== C1A_V2_MIN_HZ || prepared.frequenciesHz.at(-1) !== C1A_V2_MAX_HZ) {
    throw new Error(`prepared curve is outside V2 coverage: ${member.path}`)
  }
  if (prepared.frequenciesHz.length !== Math.ceil(Math.log2(C1A_V2_MAX_HZ / C1A_V2_MIN_HZ) * C1A_V2_POINTS_PER_OCTAVE) + 1) {
    throw new Error(`prepared curve is not on normal V2 grid: ${member.path}`)
  }
  if (prepared.normalization?.mode !== C1B_NORMALIZATION.mode || prepared.normalization?.frequencyHz !== C1B_NORMALIZATION.frequencyHz) {
    throw new Error(`prepared curve normalization mismatch: ${member.path}`)
  }
  if (prepared.smoothing !== false || prepared.peakAlignment !== false) throw new Error(`forbidden preparation transform: ${member.path}`)
  if (!originalPoints.length) throw new Error(`empty parsed curve: ${member.path}`)
}

function compactAcquisition(acquired, prepared) {
  return {
    concreteCurveIdentity: acquired.member.concreteCurveIdentity,
    path: acquired.member.path,
    cacheKey: relative(MODULE_ROOT, acquired.cachePath),
    acquisition: acquired.acquisition,
    byteLength: acquired.provenance.byteLength,
    blobSha: acquired.provenance.blobSha,
    upstreamSha256: acquired.provenance.sha256,
    preparedCurveSha256: hashJson({ frequenciesHz: prepared.frequenciesHz, valuesDb: prepared.valuesDb }),
    rawBytesCommitted: false,
  }
}

function buildGroupEvidence(group, fold, preparedByIdentity, acquisitionByIdentity) {
  const exactMembers = group.exact711Members
  const withheldConsensus = pointwiseMedian(exactMembers.map((member) => member.preparedCurve))
  const withheldSigma = calculateRepeatabilitySigma(exactMembers.map((member) => member.preparedCurve))
  const observations = []
  const decisions = []
  for (const member of group.eligibleNon711Members) {
    const identity = member.concreteCurveIdentity
    const disagreement = calculateCrossRigDisagreement(member.preparedCurve, withheldConsensus, {
      groupId: group.groupId,
      observationId: identity,
      deviceFamily: group.deviceFamily,
      rigClass: member.rigClass,
      memberIdentity: identity,
    })
    const weights = buildConfidenceWeights(fold.profiles, member.rigClass)
    const metrics = evaluateTargetingObservation({
      frequenciesHz: disagreement.frequenciesHz,
      deltaDb: disagreement.deltaDb,
    }, weights)
    const decision = fallbackDecision(fold.profiles, member.rigClass)
    decisions.push(decision)
    observations.push({
      observationId: identity,
      memberIdentity: identity,
      deviceFamily: group.deviceFamily,
      collection: member.collection,
      form: member.form,
      rig: member.rig,
      rigClass: member.rigClass,
      provenance: compactMember(member, preparedByIdentity.get(identity)),
      frequenciesHz: [...disagreement.frequenciesHz],
      deltaDb: [...disagreement.deltaDb],
      absoluteDeltaDb: [...disagreement.absoluteDeltaDb],
      observationSha256: observationHash(disagreement),
      profileSelection: decision,
      metrics,
    })
  }
  const classification = classifyGroupTargeting(observations.map((observation) => observation.metrics))
  const trainingProfiles = compactTrainingProfiles(fold.profiles)
  const uniqueDecisions = Object.fromEntries([...new Map(decisions.map((decision) => [decision.rigClass, decision])).entries()])
  return {
    schemaVersion: C1B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1b-group-confidence-targeting-evidence',
    algorithmVersion: C1B_ALGORITHM_VERSION,
    groupId: group.groupId,
    deviceFamily: group.deviceFamily,
    configurationSignature: group.configurationSignature,
    split: 'development',
    withheldGroupId: fold.withheldGroupId,
    memberCount: group.members.length,
    exact711MemberCount: group.exact711Members.length,
    non711ObservationCount: group.eligibleNon711Members.length,
    members: group.members.map((member) => compactMember(member, preparedByIdentity.get(member.concreteCurveIdentity))),
    acquisition: group.members.map((member) => acquisitionByIdentity.get(member.concreteCurveIdentity)),
    loo: {
      withheldGroupId: fold.withheldGroupId,
      trainingGroupIds: [...fold.trainingGroupIds],
      withheldGroupUsedOnlyForEvaluation: true,
      trainingProfileGroupIds: [...fold.profiles.trainingGroupIds],
      leakageCheck: !fold.profiles.trainingGroupIds.includes(fold.withheldGroupId),
    },
    consensus: {
      method: withheldConsensus.method,
      frequenciesHz: [...withheldConsensus.frequenciesHz],
      valuesDb: [...withheldConsensus.valuesDb],
      sha256: curveHash(withheldConsensus),
      smoothing: false,
      peakAlignment: false,
    },
    repeatabilitySigma: {
      method: withheldSigma.method,
      scale: withheldSigma.scale,
      frequenciesHz: [...withheldSigma.frequenciesHz],
      valuesDb: [...withheldSigma.valuesDb],
      sha256: curveHash(withheldSigma),
    },
    trainingProfiles,
    classProfileDecisions: uniqueDecisions,
    observations,
    classification,
    criteria: {
      threshold: C1B_TARGETING_THRESHOLD,
      primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
      strictMajority: 'informative wins > informative observations / 2',
      medianGain: 'median informative gain >= 0.05',
      informative: 'E_const > 0',
    },
    flags: {
      developmentExecuted: true,
      holdoutExecuted: false,
      responseOutcomeObserved: true,
      confidenceCurveComputed: true,
      confidenceWeightingApplied: true,
      consensusAlgorithmExecuted: true,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      c4PeakAlignmentUsed: false,
      freshRealBatchCExecuted: false,
      rawMeasurementsCommitted: false,
    },
  }
}

function groupSummary(groupEvidence) {
  const result = groupEvidence.classification
  const informative = groupEvidence.observations.filter((observation) => observation.metrics.informative)
  return {
    groupId: groupEvidence.groupId,
    deviceFamily: groupEvidence.deviceFamily,
    configurationSignature: groupEvidence.configurationSignature,
    exact711MemberCount: groupEvidence.exact711MemberCount,
    non711ObservationCount: groupEvidence.non711ObservationCount,
    informativeObservationCount: result.informativeObservationCount,
    nonInformativeObservationCount: result.nonInformativeObservationCount,
    winCount: result.winCount,
    lossCount: result.lossCount,
    medianTargetingGain: result.medianGain,
    medianRelativeTargetingGain: result.medianRelativeTargetingGain,
    classification: result.classification,
    consensusSha256: groupEvidence.consensus.sha256,
    repeatabilitySigmaSha256: groupEvidence.repeatabilitySigma.sha256,
    observationIds: groupEvidence.observations.map((observation) => observation.observationId),
    rawCrossRigMae: informative.length ? informative.map((observation) => observation.metrics.rawCrossRigMae) : [],
    rawCrossRigRmse: informative.length ? informative.map((observation) => observation.metrics.rawCrossRigRmse) : [],
  }
}

function reportText({ summaries, gate, evidenceFiles, frozen, groupEvidence }) {
  const lines = [
    '# C1b confidence-targeting — development outcome',
    '',
    `- Protocol freeze commit: \`${PROTOCOL_FREEZE_COMMIT}\``,
    `- Protocol SHA-256: \`${PROTOCOL_SHA256}\``,
    `- Repaired C1 V1.1 corpus commit: \`${PHASE0_CORPUS_COMMIT}\``,
    `- Repaired C1 V1.1 evidence SHA-256: \`${frozen.evidenceSha256}\``,
    `- Algorithm: \`${C1B_ALGORITHM_VERSION}\`; transform scale: ${C1B_TARGET_SCALE_DB} dB.`,
    `- Development protocol: six-group leave-one-device-group-out; primary band ${C1B_PRIMARY_BAND_HZ[0]}–${C1B_PRIMARY_BAND_HZ[1]} Hz.`,
    '- Equal-authority control uses the exact primary-band mean confidence per observation.',
    '- Raw bytes were validated by both pinned Git blob SHA-1 and SHA-256 and remain only in the ignored cache.',
    '',
    '## Per-group evidence',
    '',
  ]
  for (const summary of summaries) {
    lines.push(`### ${summary.groupId} — ${summary.deviceFamily}`)
    lines.push(`- Exact-711 members: ${summary.exact711MemberCount}; non-711 observations: ${summary.non711ObservationCount}; informative: ${summary.informativeObservationCount}.`)
    lines.push(`- Wins/losses: ${summary.winCount}/${summary.lossCount}; median targeting gain: ${summary.medianTargetingGain ?? 'null'}.`)
    lines.push(`- 711 consensus SHA-256: \`${summary.consensusSha256}\`; repeatability sigma SHA-256: \`${summary.repeatabilitySigmaSha256}\`.`)
    lines.push(`- Classification: **${summary.classification}**.`)
    lines.push('')
  }
  lines.push('## Development gate', '')
  lines.push(`- Signal groups: ${gate.signalGroupCount}/${gate.requiredGroups}; required: ${gate.minimumSignals}; classification: **${gate.classification}**.`)
  lines.push('', '## Frozen guardrails', '')
  lines.push('- Holdout groups were rejected before response acquisition; no holdout response was inspected.', '')
  lines.push('- Fresh Real Corpus Batch C remained sealed and unexecuted.', '')
  lines.push('- No C4 peak alignment, smoothing, Huber, solver, structural search, C2/C3/C4 rerun, or production code ran.', '')
  lines.push(`- Evidence files: ${evidenceFiles.join(', ')}`)
  return `${lines.join('\n')}\n`
}

function assertFinalFlags(manifest) {
  if (manifest.holdoutExecuted !== false || manifest.batchCExecuted !== false || manifest.freshRealBatchCExecuted !== false) {
    throw new Error('C1b final flags permit holdout or Batch C execution')
  }
  if (manifest.c4PeakAlignmentUsed !== false || manifest.autoEqSolverExecuted !== false || manifest.solverExecuted !== false) {
    throw new Error('C1b final flags permit forbidden processing')
  }
  if (manifest.rawMeasurementsCommitted !== false) throw new Error('raw measurements must remain uncommitted')
}

/** Execute exactly the six development groups after the protocol freeze. */
export async function runDevelopmentAfterProtocolFreeze({
  repositoryRoot = MODULE_ROOT,
  protocolFreezeCommit = PROTOCOL_FREEZE_COMMIT,
  currentCommit: suppliedCurrentCommit = null,
  fetchImpl = globalThis.fetch,
  cacheRoot = resolve(repositoryRoot, C1B_CACHE_RELATIVE_DIR),
  outputDir = resolve(repositoryRoot, C1B_ARTIFACT_RELATIVE_DIR),
  maxAttempts = MAX_NETWORK_ATTEMPTS,
  retryDelayMs = NETWORK_RETRY_DELAY_MS,
} = {}) {
  const observedCommit = suppliedCurrentCommit ?? currentCommit(repositoryRoot)
  if (protocolFreezeCommit !== PROTOCOL_FREEZE_COMMIT || observedCommit !== PROTOCOL_FREEZE_COMMIT) {
    throw new Error(`C1b development requires exact protocol-freeze commit ${PROTOCOL_FREEZE_COMMIT}; got protocol=${protocolFreezeCommit}, current=${observedCommit}`)
  }
  if (typeof fetchImpl !== 'function') throw new Error('C1b development requires fetch')

  const protocolManifest = await readJson(resolve(outputDir, 'manifest.json'))
  validateProtocolManifest(protocolManifest)
  const recordedProtocolSha = (await readFile(resolve(outputDir, 'protocol-sha256.txt'), 'utf8')).trim()
  assertEqual(recordedProtocolSha, PROTOCOL_SHA256, 'C1b protocol SHA-256')
  if (protocolManifest.protocolFreezeCommit !== null) throw new Error('C1b protocol artifact was already outcome-mutated')
  if (protocolManifest.freshRealBatchCRejected !== FRESH_REAL_BATCH_C_REJECTED || protocolManifest.rejectedBatchCToken !== BATCH_C_REJECTION_TOKEN) {
    throw new Error('C1b Batch C rejection guard mismatch')
  }
  const frozen = await verifyFrozenC1V11Provenance({ repositoryRoot })
  const allFrozenGroups = frozen.groups
  const developmentGroups = DEVELOPMENT_GROUP_IDS.map((groupId) => allFrozenGroups.find((group) => group.groupId === groupId))
  if (developmentGroups.some((group) => !group || group.split !== 'development')) throw new Error('C1b development split mismatch')
  if (developmentGroups.length !== C1B_REQUIRED_DEVELOPMENT_GROUPS) throw new Error('C1b development group count mismatch')
  assertNoHoldoutOrBatchC(DEVELOPMENT_GROUP_IDS)

  await mkdir(cacheRoot, { recursive: true })
  const preparedByIdentity = new Map()
  const acquisitionByIdentity = new Map()
  const preparedGroups = []
  for (const group of developmentGroups) {
    const preparedExact = []
    const preparedNon711 = []
    for (const member of [...group.exact711Members, ...group.eligibleNon711Members]) {
      const acquired = await reacquirePinnedMember(member, { fetchImpl, cacheRoot, maxAttempts, retryDelayMs })
      const originalPoints = parseCurve(acquired.bytes.toString('utf8'))
      const prepared = prepareCurve(originalPoints, {
        concreteCurveIdentity: member.concreteCurveIdentity,
        collection: member.collection,
        path: member.path,
        rig: member.rig,
      })
      verifyPreparedIntegrity(member, originalPoints, prepared)
      const enriched = { ...member, preparedCurve: prepared }
      preparedByIdentity.set(member.concreteCurveIdentity, prepared)
      acquisitionByIdentity.set(member.concreteCurveIdentity, compactAcquisition(acquired, prepared))
      if (member.rig === C1A_PRIMARY_RIG && member.rigClass === '711-class') preparedExact.push(enriched)
      else preparedNon711.push(enriched)
    }
    preparedGroups.push({
      ...group,
      exact711Members: preparedExact,
      eligibleNon711Members: preparedNon711,
      members: [...preparedExact, ...preparedNon711],
    })
  }

  // The pure LOO builder computes all training profiles before any withheld
  // observation is evaluated. It also performs an explicit leakage assertion.
  const folds = buildLeaveOneGroupOut(preparedGroups)
  const groupEvidences = folds.map((fold) => {
    const group = fold.withheldGroup
    return buildGroupEvidence(group, fold, preparedByIdentity, acquisitionByIdentity)
  })
  if (groupEvidences.length !== C1B_REQUIRED_DEVELOPMENT_GROUPS) throw new Error('C1b did not produce exactly six group evidences')
  const gate = buildDevelopmentGate(groupEvidences.map((group) => group.classification))
  if (gate.classification === 'INCONCLUSIVE') throw new Error('C1b development evidence is inconclusive')

  const groupFiles = groupEvidences.map((group) => `group-${group.groupId}.json`).sort()
  const evidenceFiles = [...OUTCOME_EVIDENCE_STATIC, ...groupFiles].sort()
  const summaries = groupEvidences.map(groupSummary)
  const aggregate = {
    schemaVersion: C1B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c1b-development-aggregate-evidence',
    algorithmVersion: C1B_ALGORITHM_VERSION,
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    protocolSha256: PROTOCOL_SHA256,
    c1aV11: {
      corpusVersion: 'c1-cross-rig-confidence-corpus-v1.1',
      commit: PHASE0_CORPUS_COMMIT,
      evidenceSha256: frozen.evidenceSha256,
      classification: 'C1_CORPUS_V1_1_READY',
    },
    upstream: { repository: UPSTREAM_REPOSITORY, commit: UPSTREAM_COMMIT, tree: UPSTREAM_TREE },
    frozenBoundary: FROZEN_BOUNDARY,
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    rejectedHoldoutGroupIds: [...HOLDOUT_GROUP_IDS],
    rejectedBatchCToken: BATCH_C_REJECTION_TOKEN,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    groups: summaries,
    developmentGate: gate,
    developmentCoverage: {
      groupCount: groupEvidences.length,
      exact711MemberCount: groupEvidences.reduce((sum, group) => sum + group.exact711MemberCount, 0),
      non711ObservationCount: groupEvidences.reduce((sum, group) => sum + group.non711ObservationCount, 0),
      informativeObservationCount: groupEvidences.reduce((sum, group) => sum + group.classification.informativeObservationCount, 0),
      verifiedRawMemberCount: acquisitionByIdentity.size,
      looFoldCount: folds.length,
      primaryBandHz: [...C1B_PRIMARY_BAND_HZ],
    },
    exclusionAssertions: {
      selectedFamiliesUnique: true,
      historicalObservedOverlap: false,
      sealedBatchCOverlap: false,
      noHoldoutResponseAcquisition: true,
    },
    protocolConstants: {
      form: C1B_FORM,
      primaryRigLiteral: C1A_PRIMARY_RIG,
      normalization: { ...C1B_NORMALIZATION },
      targetScaleDb: C1B_TARGET_SCALE_DB,
      targetingThreshold: C1B_TARGETING_THRESHOLD,
      minimumClassTrainingGroups: C1B_MIN_CLASS_GROUPS,
      baseWeight: 1,
      c1aSelectionSeed: C1A_SELECTION_SEED,
      c1aSplitSeed: C1A_SPLIT_SEED,
      c1aNormalization: { ...C1A_NORMALIZATION },
      noSmoothing: true,
      noPeakAlignment: true,
    },
    flags: {
      developmentExecuted: true,
      holdoutExecuted: false,
      outcomesGenerated: true,
      responseOutcomeObserved: true,
      confidenceCurveComputed: true,
      confidenceWeightingApplied: true,
      consensusAlgorithmExecuted: true,
      autoEqSolverExecuted: false,
      solverExecuted: false,
      freshRealBatchCExecuted: false,
      c4PeakAlignmentUsed: false,
      rawMeasurementsCommitted: false,
    },
  }

  const finalManifest = {
    ...protocolManifest,
    phase: 'development-outcome',
    milestone: 'C1b-confidence-targeting-development-outcome',
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    outcomeClassification: gate.classification,
    developmentExecuted: true,
    holdoutExecuted: false,
    outcomesGenerated: true,
    responseOutcomeObserved: true,
    confidenceCurveComputed: true,
    confidenceWeightingApplied: true,
    consensusAlgorithmExecuted: true,
    autoEqSolverExecuted: false,
    solverExecuted: false,
    batchCExecuted: false,
    freshRealBatchCExecuted: false,
    c4PeakAlignmentUsed: false,
    rawMeasurementsCommitted: false,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    c1aV11EvidenceSha256: frozen.evidenceSha256,
    developmentCoverage: aggregate.developmentCoverage,
  }
  assertFinalFlags(finalManifest)
  const report = reportText({ summaries, gate, evidenceFiles, frozen, groupEvidence: groupEvidences })
  const payloads = new Map([
    ['aggregate-evidence.json', jsonText(aggregate)],
    ['manifest.json', jsonText(finalManifest)],
    ['schema.json', await readFile(resolve(outputDir, 'schema.json'))],
    ...groupEvidences.map((group) => [`group-${group.groupId}.json`, jsonText(group)]),
    ['final-report.md', report],
  ])
  const payloadEvidenceSha256 = hashEvidenceFiles(payloads, evidenceFiles)
  await mkdir(outputDir, { recursive: true })
  for (const [path, payload] of payloads) await writeFile(resolve(outputDir, path), payload)
  await writeFile(resolve(outputDir, 'evidence-sha256.txt'), `${payloadEvidenceSha256}\n`)
  const recomputedEvidenceSha256 = hashEvidenceFiles(outputDir, evidenceFiles)
  assertEqual(recomputedEvidenceSha256, payloadEvidenceSha256, 'C1b evidence SHA-256 recomputation')
  return {
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    protocolSha256: PROTOCOL_SHA256,
    evidenceSha256: payloadEvidenceSha256,
    classification: gate.classification,
    summaries,
    developmentGate: gate,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    holdoutExecuted: false,
    freshRealBatchCExecuted: false,
    autoEqSolverExecuted: false,
    outputDir,
  }
}

export const runC1bDevelopment = runDevelopmentAfterProtocolFreeze

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runDevelopmentAfterProtocolFreeze()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`)
      process.exitCode = 1
    })
}
