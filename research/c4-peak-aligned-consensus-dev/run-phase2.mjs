import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALIGNMENT_BAND_HZ,
  C4B_ALGORITHM_VERSION,
  C4B_ARTIFACT_RELATIVE_DIR,
  C4B_CACHE_RELATIVE_DIR,
  C4B_FROZEN_BOUNDARY,
  C4B_PROTOCOL_SCHEMA_VERSION,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUP_IDS,
  assertNoHoldoutOrBatchC,
  buildDevelopmentGate,
  evaluateDevelopmentGroup,
  hashBytes,
  reacquirePinnedMember,
  verifyFrozenC4aProvenance,
} from './c4b.mjs'

const PROTOCOL_FREEZE_COMMIT = '95d853db76bd456dd66a1b8a60a65039ca095b8b'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_DIR = resolve(ROOT, C4B_ARTIFACT_RELATIVE_DIR)
const CACHE_ROOT = resolve(ROOT, C4B_CACHE_RELATIVE_DIR)

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
}

function evidenceHash(payloads) {
  const hash = createHashCompat()
  for (const relativePath of [...payloads.keys()].sort()) {
    hash.update(`${relativePath}\n`)
    hash.update(payloads.get(relativePath))
    hash.update('\n')
  }
  return hash.digest('hex')
}

function createHashCompat() {
  // Use the same SHA-256 implementation as the frozen protocol without
  // importing another mutable dependency.
  const chunks = []
  return {
    update(value) {
      chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value))
      return this
    },
    digest(encoding) {
      if (encoding !== 'hex') throw new Error('C4b evidence hash requires hexadecimal SHA-256')
      return hashBytes(Buffer.concat(chunks))
    },
  }
}

function compactMember(member) {
  const integrity = member.integrity ?? {}
  return {
    collection: member.collection,
    form: member.form,
    model: member.model,
    processedName: member.processedName,
    deviceFamily: member.deviceFamily,
    configurationSignature: member.configurationSignature,
    rig: member.rig,
    rigClass: member.rigClass,
    concreteCurveIdentity: member.concreteCurveIdentity,
    path: member.path,
    upstreamRawUrl: member.upstreamRawUrl,
    blobSha: member.blobSha,
    sourceRows: member.sourceRows,
    integrity: {
      status: integrity.status,
      upstreamSha256: integrity.upstreamSha256,
      byteLength: integrity.byteLength,
      originalPointCount: integrity.originalPointCount,
      canonicalPointCount: integrity.canonicalPointCount,
      originalFirstFrequencyHz: integrity.originalFirstFrequencyHz,
      originalTerminalFrequencyHz: integrity.originalTerminalFrequencyHz,
      originalTerminalDb: integrity.originalTerminalDb,
      canonicalTerminalFrequencyHz: integrity.canonicalTerminalFrequencyHz,
      canonicalTerminalDb: integrity.canonicalTerminalDb,
      transformation: integrity.transformation,
      originalParsedPointsSha256: integrity.originalParsedPointsSha256,
      canonicalParsedPointsSha256: integrity.canonicalParsedPointsSha256,
      normalizedParsedPointsSha256: integrity.normalizedParsedPointsSha256,
      normalization: integrity.normalization,
      parserCanonicalizerVersion: integrity.parserCanonicalizerVersion,
    },
  }
}

const METRIC_FIELDS = [
  'registeredTrebleMAE',
  'registeredTrebleRMSE',
  'registeredTrebleMaxAbs',
  'rawTrebleMAE',
  'rawTrebleRMSE',
  'candidateDominantPeakFrequencyHz',
  'withheldDominantPeakFrequencyHz',
  'rawPeakFrequencyErrorOctaves',
  'candidatePeakDb',
  'withheldPeakDb',
  'absolutePeakLevelErrorAfterRegistration',
]

function compactMetrics(metrics) {
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, metrics[field]]))
}

function compactFold(fold, membersByIdentity) {
  const withheld = membersByIdentity.get(fold.withheldMemberIdentity)
  return {
    withheldMemberIdentity: fold.withheldMemberIdentity,
    withheldMember: withheld ? {
      collection: withheld.collection,
      path: withheld.path,
      upstreamRawUrl: withheld.upstreamRawUrl,
      blobSha: withheld.blobSha,
      upstreamSha256: withheld.integrity?.upstreamSha256,
    } : null,
    trainingMemberIdentities: [...fold.trainingMemberIdentities],
    canonicalPeakFrequencyHz: fold.canonicalPeakFrequencyHz,
    individualPeakFrequenciesHz: [...fold.individualPeakFrequenciesHz],
    warpAnchors: fold.warpAnchors.map((anchors) => anchors.map((anchor) => [...anchor])),
    pointwise: compactMetrics(fold.pointwise),
    aligned: compactMetrics(fold.aligned),
    peakAlignmentFoldWin: fold.peakAlignmentFoldWin,
    peakShiftDiagnostics: fold.peakShiftDiagnostics,
    dispersion: {
      medianByBandBefore: fold.dispersion.medianByBandBefore,
      medianByBandAfter: fold.dispersion.medianByBandAfter,
      medianFullBandBefore: fold.dispersion.medianFullBandBefore,
      medianFullBandAfter: fold.dispersion.medianFullBandAfter,
      beforeProfileSha256: hashBytes(JSON.stringify(fold.dispersion.beforeProfile)),
      afterProfileSha256: hashBytes(JSON.stringify(fold.dispersion.afterProfile)),
    },
  }
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function groupSummary(groupEvidence) {
  const folds = groupEvidence.folds
  const shiftOctaves = folds.flatMap((fold) => fold.peakShiftDiagnostics.shifts.map((shift) => shift.absoluteOctaves))
  const shiftCents = folds.flatMap((fold) => fold.peakShiftDiagnostics.shifts.map((shift) => shift.cents))
  const rawPointwise = folds.map((fold) => fold.pointwise.rawTrebleMAE)
  const rawAligned = folds.map((fold) => fold.aligned.rawTrebleMAE)
  const sigmaBefore = folds.map((fold) => fold.dispersion.medianFullBandBefore)
  const sigmaAfter = folds.map((fold) => fold.dispersion.medianFullBandAfter)
  return {
    groupId: groupEvidence.groupId,
    deviceFamily: groupEvidence.deviceFamily,
    configurationSignature: groupEvidence.configurationSignature,
    memberCount: groupEvidence.memberCount,
    collections: groupEvidence.members.map((member) => member.collection).sort(),
    rigClasses: [...new Set(groupEvidence.members.map((member) => member.rigClass))].sort(),
    foldCount: folds.length,
    foldWinCount: groupEvidence.foldWinCount,
    foldLossCount: groupEvidence.foldLossCount,
    medianRegisteredTrebleMAE: groupEvidence.medianRegisteredMAE,
    medianRawMAE: { pointwise: median(rawPointwise), aligned: median(rawAligned) },
    medianRobustSigma: { before: median(sigmaBefore), after: median(sigmaAfter) },
    dominantPeakShiftDistribution: {
      observations: shiftOctaves.length,
      minimumAbsoluteOctaves: Math.min(...shiftOctaves),
      medianAbsoluteOctaves: median(shiftOctaves),
      maximumAbsoluteOctaves: Math.max(...shiftOctaves),
      minimumCents: Math.min(...shiftCents),
      medianCents: median(shiftCents),
      maximumCents: Math.max(...shiftCents),
    },
    classification: groupEvidence.classification,
  }
}

function reportText({ summaries, gate, evidenceFiles }) {
  const lines = [
    '# C4b peak-aligned consensus — development outcome',
    '',
    `- Protocol freeze commit: \`${PROTOCOL_FREEZE_COMMIT}\``,
    `- C4b boundary: \`${C4B_FROZEN_BOUNDARY}\``,
    `- Algorithm: \`${C4B_ALGORITHM_VERSION}\``,
    '- Corpus: the three frozen C4 development groups only (24 members, 24 LOO folds).',
    '- Peak-search band: 6,000–10,000 Hz; alignment/evaluation band: 6,000–14,000 Hz.',
    '- Normalization: frozen 500 Hz / 60 dB; no smoothing or weighting.',
    '',
    '## Per-group evidence',
    '',
  ]
  for (const summary of summaries) {
    lines.push(`### ${summary.groupId} — ${summary.deviceFamily}`)
    lines.push(`- Members: ${summary.memberCount}; collections: ${summary.collections.join(', ')}; rig classes: ${summary.rigClasses.join(', ')}`)
    lines.push(`- LOO wins/losses: ${summary.foldWinCount}/${summary.foldLossCount}`)
    lines.push(`- Median registeredTrebleMAE (pointwise/aligned): ${summary.medianRegisteredTrebleMAE.pointwise} / ${summary.medianRegisteredTrebleMAE.aligned}`)
    lines.push(`- Median raw MAE (pointwise/aligned): ${summary.medianRawMAE.pointwise} / ${summary.medianRawMAE.aligned}`)
    lines.push(`- Median robust sigma (before/after): ${summary.medianRobustSigma.before} / ${summary.medianRobustSigma.after}`)
    lines.push(`- Absolute dominant-peak shift octaves (min/median/max): ${summary.dominantPeakShiftDistribution.minimumAbsoluteOctaves} / ${summary.dominantPeakShiftDistribution.medianAbsoluteOctaves} / ${summary.dominantPeakShiftDistribution.maximumAbsoluteOctaves}`)
    lines.push(`- Classification: **${summary.classification}**`)
    lines.push('')
  }
  lines.push('## Development gate', '')
  lines.push(`- Signal groups: ${gate.signalGroupCount}/3; final classification: **${gate.classification}**.`)
  lines.push('- Registered error, raw/unregistered error, and dispersion are reported as separate quantities; registered improvement is not claimed as ordinary raw pointwise improvement.')
  lines.push('')
  lines.push('## Execution guardrails', '')
  lines.push('- C4a provenance was reacquired from immutable raw URLs and each raw object was verified by Git blob SHA-1 and upstream SHA-256.', '')
  lines.push('- C4 holdout groups remained unexecuted and no holdout curves entered any fold.', '')
  lines.push('- Fresh Real Corpus Batch C remained sealed and unexecuted.', '')
  lines.push('- No AutoEQ solver, confidence weighting, Standard V2, Max10, structural search, C2, or C3 execution ran.', '')
  lines.push(`- Evidence files: ${evidenceFiles.join(', ')}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const observedCommit = currentCommit()
  if (observedCommit !== PROTOCOL_FREEZE_COMMIT) throw new Error(`protocol freeze commit mismatch: expected ${PROTOCOL_FREEZE_COMMIT}, got ${observedCommit}`)
  const frozen = await verifyFrozenC4aProvenance({ repositoryRoot: ROOT })
  assertNoHoldoutOrBatchC(DEVELOPMENT_GROUP_IDS)
  if (HOLDOUT_GROUP_IDS.some((groupId) => frozen.groups.find((group) => group.groupId === groupId)?.split !== 'holdout')) {
    throw new Error('frozen C4a holdout identity/split mismatch')
  }
  const developmentGroups = DEVELOPMENT_GROUP_IDS.map((groupId) => frozen.groups.find((group) => group.groupId === groupId))
  if (developmentGroups.some((group) => !group || group.split !== 'development' || group.members.length !== 8)) {
    throw new Error('frozen C4 development group inventory mismatch')
  }
  await mkdir(CACHE_ROOT, { recursive: true })

  const groupEvidences = []
  for (const group of developmentGroups) {
    const reacquired = []
    for (const member of group.members) reacquired.push(await reacquirePinnedMember(member, { cacheRoot: CACHE_ROOT }))
    const preparedMembers = reacquired.map((item) => ({
      ...item.member,
      preparedCurve: item.prepared,
    }))
    const result = evaluateDevelopmentGroup(preparedMembers, { groupId: group.groupId })
    const members = group.members.map(compactMember)
    const membersByIdentity = new Map(members.map((member) => [member.concreteCurveIdentity, member]))
    const folds = result.folds.map((fold) => compactFold(fold, membersByIdentity))
    groupEvidences.push({
      schemaVersion: C4B_PROTOCOL_SCHEMA_VERSION,
      artifactKind: 'c4b-group-fold-evidence',
      algorithmVersion: C4B_ALGORITHM_VERSION,
      groupId: group.groupId,
      deviceFamily: group.deviceFamily,
      configurationSignature: group.configurationSignature,
      memberCount: group.members.length,
      members,
      folds,
      dispersion: result.dispersion,
      classification: result.classification,
      foldWinCount: result.foldWinCount,
      foldLossCount: result.foldLossCount,
      strictMajority: result.strictMajority,
      medianRegisteredMAE: result.medianRegisteredMAE,
      medianRobustSigma: result.medianRobustSigma,
      criteria: result.criteria,
    })
  }

  const gate = buildDevelopmentGate(groupEvidences.map((group) => ({ groupId: group.groupId, classification: group.classification })))
  const groupFiles = groupEvidences.map((group) => `group-${group.groupId}.json`).sort()
  const evidenceFiles = ['aggregate-evidence.json', 'manifest.json', 'schema.json', ...groupFiles, 'final-report.md'].sort()
  const summaries = groupEvidences.map(groupSummary)
  const aggregate = {
    schemaVersion: C4B_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c4b-development-aggregate-evidence',
    algorithmVersion: C4B_ALGORITHM_VERSION,
    frozenBoundary: C4B_FROZEN_BOUNDARY,
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    c4aEvidenceSha256: frozen.evidenceSha256,
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    groupEvidenceFiles: groupFiles,
    groups: summaries,
    developmentGate: gate,
    developmentCoverage: {
      groupCount: groupEvidences.length,
      memberCount: groupEvidences.reduce((sum, group) => sum + group.memberCount, 0),
      foldCount: groupEvidences.reduce((sum, group) => sum + group.folds.length, 0),
      alignmentBandHz: [...ALIGNMENT_BAND_HZ],
    },
    flags: {
      developmentExecuted: true,
      holdoutExecuted: false,
      batchCExecuted: false,
      freshRealCorpusBatchCExecuted: false,
      outcomesGenerated: true,
      consensusAlgorithmExecuted: true,
      autoEqSolverExecuted: false,
      rawMeasurementsCommitted: false,
    },
  }
  const manifestPath = resolve(OUTPUT_DIR, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const finalManifest = {
    ...manifest,
    phase: 'development-outcome',
    milestone: 'C4b-development-outcome',
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    outcomeClassification: gate.classification,
    developmentGroupIds: [...DEVELOPMENT_GROUP_IDS],
    developmentExecuted: true,
    holdoutExecuted: false,
    batchCExecuted: false,
    freshRealCorpusBatchCExecuted: false,
    outcomesGenerated: true,
    consensusAlgorithmExecuted: true,
    autoEqSolverExecuted: false,
    rawMeasurementsCommitted: false,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    c4aEvidenceSha256: frozen.evidenceSha256,
    developmentCoverage: aggregate.developmentCoverage,
  }
  const report = reportText({ summaries, gate, evidenceFiles })
  const payloads = new Map([
    ['aggregate-evidence.json', jsonText(aggregate)],
    ['manifest.json', jsonText(finalManifest)],
    ['schema.json', await readFile(resolve(OUTPUT_DIR, 'schema.json'))],
    ...groupEvidences.map((group) => [`group-${group.groupId}.json`, jsonText(group)]),
    ['final-report.md', report],
  ])
  const evidenceSha256 = evidenceHash(payloads)
  await mkdir(OUTPUT_DIR, { recursive: true })
  for (const [relativePath, payload] of payloads) await writeFile(resolve(OUTPUT_DIR, relativePath), payload)
  await writeFile(resolve(OUTPUT_DIR, 'evidence-sha256.txt'), `${evidenceSha256}\n`)
  const actualPayloads = new Map()
  for (const relativePath of evidenceFiles) actualPayloads.set(relativePath, await readFile(resolve(OUTPUT_DIR, relativePath)))
  const recomputedEvidenceSha256 = evidenceHash(actualPayloads)
  if (recomputedEvidenceSha256 !== evidenceSha256) throw new Error('C4b evidence SHA-256 recomputation mismatch')
  process.stdout.write(`${JSON.stringify({
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    evidenceSha256,
    classification: gate.classification,
    groups: summaries,
    developmentCoverage: aggregate.developmentCoverage,
    holdoutExecuted: false,
    batchCExecuted: false,
    autoEqSolverExecuted: false,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
