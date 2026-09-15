import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  C4C_ALIGNMENT_BAND_HZ,
  C4C_PROTOCOL_SCHEMA_VERSION,
  aggregateRobustDispersion,
  assertNoDevelopmentOrBatchC,
  buildCombinedC4Interpretation,
  buildHoldoutGate,
  c1HandoffDescription,
  classifyGroupEvidence,
  evaluateFold,
  hashBytes,
  hashEvidencePayloads,
  leaveOneOutMembers,
  verifyFrozenC4bProvenance,
  C4A_EVIDENCE_SHA256,
  C4A_CORPUS_COMMIT,
  C4B_ALGORITHM_SOURCE_SHA256,
  C4B_EVIDENCE_COMMIT,
  C4B_EVIDENCE_SHA256,
  C4B_PROTOCOL_COMMIT,
  C4C_ALGORITHM_VERSION,
  C4C_ARTIFACT_RELATIVE_DIR,
  C4C_CACHE_RELATIVE_DIR,
  C4C_EXPECTED_HOLDOUT_FOLDS,
  C4C_FROZEN_BOUNDARY,
  C4C_NORMALIZATION,
  DEVELOPMENT_GROUP_IDS,
  HOLDOUT_GROUPS,
  HOLDOUT_GROUP_IDS,
  createOutcomeArtifactSchema,
} from './c4c.mjs'

import {
  C4B_FORM,
  reacquirePinnedMember,
  verifyFrozenC4aProvenance,
} from '../c4-peak-aligned-consensus-dev/c4b.mjs'

const PROTOCOL_FREEZE_COMMIT = 'f1f6900c91da4434d2a09085277b8622d7b039a6'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_DIR = resolve(ROOT, C4C_ARTIFACT_RELATIVE_DIR)
const CACHE_ROOT = resolve(ROOT, C4C_CACHE_RELATIVE_DIR)

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('median requires values')
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
}

function assertEqualJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`)
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
    upstreamSha256: integrity.upstreamSha256,
    originalParsedPointsSha256: integrity.originalParsedPointsSha256,
    canonicalParsedPointsSha256: integrity.canonicalParsedPointsSha256,
    normalizedParsedPointsSha256: integrity.normalizedParsedPointsSha256,
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
      concreteCurveIdentity: withheld.concreteCurveIdentity,
      path: withheld.path,
      upstreamRawUrl: withheld.upstreamRawUrl,
      blobSha: withheld.blobSha,
      upstreamSha256: withheld.upstreamSha256,
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

function groupSummary(groupEvidence) {
  const folds = groupEvidence.folds
  const shiftOctaves = folds.flatMap((fold) => fold.peakShiftDiagnostics.shifts.map((shift) => shift.absoluteOctaves))
  const shiftCents = folds.flatMap((fold) => fold.peakShiftDiagnostics.shifts.map((shift) => shift.cents))
  const rawPointwise = folds.map((fold) => fold.pointwise.rawTrebleMAE)
  const rawAligned = folds.map((fold) => fold.aligned.rawTrebleMAE)
  const sigmaBefore = folds.map((fold) => fold.dispersion.medianFullBandBefore)
  const sigmaAfter = folds.map((fold) => fold.dispersion.medianFullBandAfter)
  const medianSigmaBefore = median(sigmaBefore)
  const medianSigmaAfter = median(sigmaAfter)
  return {
    groupId: groupEvidence.groupId,
    deviceFamily: groupEvidence.deviceFamily,
    configurationSignature: groupEvidence.configurationSignature,
    memberCount: groupEvidence.memberCount,
    independentCollectionCount: groupEvidence.independentCollectionCount,
    collections: groupEvidence.members.map((member) => member.collection).sort(),
    rigClasses: [...new Set(groupEvidence.members.map((member) => member.rigClass))].sort(),
    foldCount: folds.length,
    foldWinCount: groupEvidence.foldWinCount,
    foldLossCount: groupEvidence.foldLossCount,
    medianRegisteredTrebleMAE: groupEvidence.medianRegisteredMAE,
    medianRawMAE: { pointwise: median(rawPointwise), aligned: median(rawAligned) },
    medianRobustSigma: { before: medianSigmaBefore, after: medianSigmaAfter },
    relativeFullBandSigmaReduction: medianSigmaBefore === 0 ? null : (medianSigmaBefore - medianSigmaAfter) / medianSigmaBefore,
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

function evaluateHoldoutGroup(members, groupId) {
  if (!Array.isArray(members) || members.length < 3) throw new Error(`holdout group ${groupId} requires at least three members`)
  const folds = members.map((_, withheldIndex) => {
    const { training, withheld } = leaveOneOutMembers(members, withheldIndex)
    const evidence = evaluateFold(
      training.map((member) => member.preparedCurve),
      withheld.preparedCurve,
    )
    return {
      ...evidence,
      withheldMemberIdentity: withheld.concreteCurveIdentity,
      trainingMemberIdentities: training.map((member) => member.concreteCurveIdentity),
    }
  })
  const dispersion = aggregateRobustDispersion(folds.map((fold) => fold.dispersion))
  const decision = classifyGroupEvidence(folds, dispersion)
  return {
    groupId,
    memberCount: members.length,
    folds,
    dispersion,
    ...decision,
  }
}

function assertPreparedMember(item, member) {
  const integrity = member.integrity ?? {}
  const prepared = item.prepared
  if (member.form !== C4B_FORM || member.rigClass !== '711-class') throw new Error(`holdout member is outside the frozen in-ear 711-class gate: ${member.path}`)
  if (prepared.normalization?.mode !== C4C_NORMALIZATION.mode || prepared.normalization?.frequencyHz !== C4C_NORMALIZATION.frequencyHz || prepared.normalization?.levelDb !== C4C_NORMALIZATION.levelDb) {
    throw new Error(`holdout normalization mismatch: ${member.path}`)
  }
  if (prepared.frequenciesHz?.[0] !== 20 || prepared.frequenciesHz?.at(-1) !== 20_000) throw new Error(`holdout V2 grid coverage mismatch: ${member.path}`)
  if (prepared.sourceCoverage?.transformation !== integrity.transformation) throw new Error(`holdout terminal closure mismatch: ${member.path}`)
  if (prepared.originalPointsSha256 !== integrity.originalParsedPointsSha256) throw new Error(`holdout original parsed-point hash mismatch: ${member.path}`)
  if (prepared.canonicalPointsSha256 !== integrity.canonicalParsedPointsSha256) throw new Error(`holdout canonical parsed-point hash mismatch: ${member.path}`)
  if (item.provenance.sha256 !== integrity.upstreamSha256 || item.provenance.blobSha !== member.blobSha) throw new Error(`holdout raw provenance mismatch: ${member.path}`)
}

function validateProtocolArtifacts(manifest, schema, protocolSha) {
  if (manifest.phase !== 'protocol-freeze' || manifest.milestone !== 'C4c-holdout-protocol-only') throw new Error('C4c protocol artifact is not the frozen Phase 1 manifest')
  if (manifest.protocolFreezeCommit !== null) throw new Error('C4c protocol manifest was changed before execution')
  assertEqualJson(manifest.holdoutGroupIds, HOLDOUT_GROUP_IDS, 'holdout group IDs')
  assertEqualJson(manifest.rejectedDevelopmentGroupIds, DEVELOPMENT_GROUP_IDS, 'rejected development group IDs')
  if (manifest.holdoutCoverage?.expectedFoldCount !== C4C_EXPECTED_HOLDOUT_FOLDS) throw new Error('holdout fold inventory mismatch')
  if (manifest.developmentRerunForDecision || manifest.holdoutExecuted || manifest.freshRealCorpusBatchCExecuted || manifest.autoEqSolverExecuted || manifest.outcomesGenerated) throw new Error('C4c protocol manifest is not outcome-free')
  if (schema.outcomeValuesAllowed !== false) throw new Error('C4c outcome schema is not the frozen no-value schema')
  const actualProtocolSha = hashEvidencePayloads(new Map([
    ['manifest.json', Buffer.from(jsonText(manifest))],
    ['schema.json', Buffer.from(jsonText(schema))],
  ]))
  if (actualProtocolSha !== protocolSha) throw new Error(`C4c protocol SHA mismatch: ${actualProtocolSha}`)
  return actualProtocolSha
}

function validateHoldoutInventory(frozenGroups) {
  assertNoDevelopmentOrBatchC(HOLDOUT_GROUP_IDS)
  const byId = new Map(frozenGroups.map((group) => [group.groupId, group]))
  const selected = HOLDOUT_GROUPS.map((expected) => {
    const group = byId.get(expected.groupId)
    if (!group || group.split !== 'holdout') throw new Error(`frozen C4a holdout group missing or split mismatch: ${expected.groupId}`)
    if (group.deviceFamily !== expected.deviceFamily || group.members.length !== expected.memberCount || group.independentMeasurementCount !== expected.memberCount) throw new Error(`frozen C4a holdout inventory mismatch: ${expected.groupId}`)
    const collections = new Set(group.members.map((member) => member.collection))
    if (collections.size !== expected.memberCount) throw new Error(`holdout group has non-independent collection members: ${expected.groupId}`)
    if (group.members.some((member) => member.form !== C4B_FORM || member.rigClass !== '711-class')) throw new Error(`holdout group has non-711 member: ${expected.groupId}`)
    return group
  })
  if (selected.reduce((sum, group) => sum + group.members.length, 0) !== C4C_EXPECTED_HOLDOUT_FOLDS) throw new Error('holdout fold inventory total mismatch')
  return selected
}

function combinedDiagnostics(developmentAggregate, holdoutSummaries) {
  const developmentSummaries = developmentAggregate.groups
  const groups = [...developmentSummaries, ...holdoutSummaries]
  const alignedWins = groups.reduce((sum, group) => sum + group.foldWinCount, 0)
  const foldCount = groups.reduce((sum, group) => sum + group.foldCount, 0)
  const signalGroupCount = groups.filter((group) => group.classification === 'PEAK_ALIGNMENT_SIGNAL').length
  return {
    signalGroups: { count: signalGroupCount, total: groups.length },
    folds: { alignedWins, total: foldCount },
    perGroup: groups.map((group) => ({
      groupId: group.groupId,
      medianAbsolutePeakShiftOctaves: group.dominantPeakShiftDistribution.medianAbsoluteOctaves,
      registeredTrebleMAEDeltaPointwiseMinusAligned: group.medianRegisteredTrebleMAE.pointwise - group.medianRegisteredTrebleMAE.aligned,
      relativeFullBandSigmaReduction: group.relativeFullBandSigmaReduction ?? (
        group.medianRobustSigma.before === 0 ? null : (group.medianRobustSigma.before - group.medianRobustSigma.after) / group.medianRobustSigma.before
      ),
      classification: group.classification,
    })),
    relationship: 'descriptive-only; no threshold, fit, or shift-trigger rule was introduced',
  }
}

function reportText({ summaries, gate, combinedInterpretation, combined, protocolSha, evidenceFiles, handoff }) {
  const lines = [
    '# C4c peak-aligned consensus — holdout confirmation outcome',
    '',
    `- C4c protocol-freeze commit: \`${PROTOCOL_FREEZE_COMMIT}\``,
    `- Frozen protocol SHA-256: \`${protocolSha}\``,
    `- C4c boundary: \`${C4C_FROZEN_BOUNDARY}\``,
    `- Algorithm: \`${C4C_ALGORITHM_VERSION}\` (imported from the frozen C4b implementation)`,
    `- Holdout corpus: exactly three groups, ${C4C_EXPECTED_HOLDOUT_FOLDS} members, ${C4C_EXPECTED_HOLDOUT_FOLDS} leave-one-measurement-out folds.`,
    '- Peak search: 6,000–10,000 Hz; alignment/evaluation: 6,000–14,000 Hz.',
    '- Normalization: frozen 500 Hz / 60 dB; no smoothing, weighting, or additional nuisance alignment.',
    '',
    '## Per-group evidence',
    '',
  ]
  for (const summary of summaries) {
    lines.push(`### ${summary.groupId} — ${summary.deviceFamily}`)
    lines.push(`- Members/folds: ${summary.memberCount}/${summary.foldCount}; independent collections: ${summary.independentCollectionCount}; collections: ${summary.collections.join(', ')}; rig classes: ${summary.rigClasses.join(', ')}`)
    lines.push(`- LOO wins/losses: ${summary.foldWinCount}/${summary.foldLossCount}`)
    lines.push(`- Median registeredTrebleMAE (pointwise/aligned): ${summary.medianRegisteredTrebleMAE.pointwise} / ${summary.medianRegisteredTrebleMAE.aligned}`)
    lines.push(`- Median raw MAE (pointwise/aligned): ${summary.medianRawMAE.pointwise} / ${summary.medianRawMAE.aligned}`)
    lines.push(`- Median robust sigma (before/after): ${summary.medianRobustSigma.before} / ${summary.medianRobustSigma.after}`)
    lines.push(`- Absolute dominant-peak shift octaves (min/median/max): ${summary.dominantPeakShiftDistribution.minimumAbsoluteOctaves} / ${summary.dominantPeakShiftDistribution.medianAbsoluteOctaves} / ${summary.dominantPeakShiftDistribution.maximumAbsoluteOctaves}`)
    lines.push(`- Median absolute peak shift: ${summary.dominantPeakShiftDistribution.medianCents} cents`)
    lines.push(`- Classification: **${summary.classification}**`)
    lines.push('')
  }
  lines.push('## Holdout gate', '')
  lines.push(`- Signal groups: ${gate.signalGroupCount}/3; final classification: **${gate.classification}**.`)
  lines.push('- A signal requires strict-majority registeredTrebleMAE wins, lower median registeredTrebleMAE, and lower median full-band robust sigma.  Raw/unregistered error remains secondary.', '')
  lines.push('## Combined development + holdout diagnostics', '')
  lines.push(`- Signal groups: ${combined.signalGroups.count}/${combined.signalGroups.total}; aligned registered-MAE wins: ${combined.folds.alignedWins}/${combined.folds.total}.`)
  lines.push('- Per-group peak-shift/registered-benefit/sigma observations are descriptive only; no threshold or shift-trigger rule was fit.', '')
  for (const observation of combined.perGroup) {
    lines.push(`- ${observation.groupId}: median shift ${observation.medianAbsolutePeakShiftOctaves} octaves; registered MAE delta (P−A) ${observation.registeredTrebleMAEDeltaPointwiseMinusAligned}; relative sigma reduction ${observation.relativeFullBandSigmaReduction}`)
  }
  lines.push('', '## Combined C4 interpretation', '')
  lines.push(`- **${combinedInterpretation}**`)
  if (handoff) {
    lines.push('- C4 therefore supplies a measurement-model primitive for later C1 repeatability/uncertainty research.', '')
    lines.push('- The handoff remains conceptual: raw pointwise, peak-aligned, and raw peak-position dispersion stay distinct; no confidence-weight function or lambda-U was selected.', '')
  } else {
    lines.push('- No C1 handoff is authorized because the frozen holdout gate did not generalize.', '')
  }
  lines.push('## Execution guardrails', '')
  lines.push('- C4a provenance was reacquired from immutable raw URLs and every raw object was verified by Git blob SHA-1, upstream SHA-256, parsed-point hashes, terminal closure, and normalization.', '')
  lines.push('- C4b source/helpers, thresholds, gates, and development evidence were not modified; development was not rerun for this decision.', '')
  lines.push('- Fresh Real Corpus Batch C remained sealed and unexecuted.', '')
  lines.push('- No C1 confidence weighting, C5, AutoEQ solver, Standard V2, Max10, structural search, C2, or C3 execution ran.', '')
  lines.push(`- Evidence files: ${evidenceFiles.join(', ')}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const observedCommit = currentCommit()
  if (observedCommit !== PROTOCOL_FREEZE_COMMIT) throw new Error(`C4c protocol-freeze commit mismatch: expected ${PROTOCOL_FREEZE_COMMIT}, got ${observedCommit}`)

  const manifestPath = resolve(OUTPUT_DIR, 'manifest.json')
  const schemaPath = resolve(OUTPUT_DIR, 'schema.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const protocolSha = (await readFile(resolve(OUTPUT_DIR, 'protocol-sha256.txt'), 'utf8')).trim()
  validateProtocolArtifacts(manifest, schema, protocolSha)

  const frozenC4b = await verifyFrozenC4bProvenance({ repositoryRoot: ROOT })
  const frozenC4a = await verifyFrozenC4aProvenance({ repositoryRoot: ROOT })
  const holdoutGroups = validateHoldoutInventory(frozenC4a.groups)
  if (frozenC4b.manifest.outcomeClassification !== 'PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED') throw new Error('frozen C4b development gate is not supported')

  await mkdir(CACHE_ROOT, { recursive: true })
  const groupEvidences = []
  for (const group of holdoutGroups) {
    const reacquired = []
    for (const member of group.members) {
      const item = await reacquirePinnedMember(member, { cacheRoot: CACHE_ROOT })
      assertPreparedMember(item, member)
      reacquired.push(item)
    }
    const preparedMembers = reacquired.map((item) => ({ ...item.member, preparedCurve: item.prepared }))
    const result = evaluateHoldoutGroup(preparedMembers, group.groupId)
    if (result.folds.length !== group.members.length || result.memberCount !== group.members.length) throw new Error(`holdout fold count mismatch: ${group.groupId}`)
    const members = group.members.map(compactMember)
    const membersByIdentity = new Map(members.map((member) => [member.concreteCurveIdentity, member]))
    const folds = result.folds.map((fold) => compactFold(fold, membersByIdentity))
    groupEvidences.push({
      schemaVersion: C4C_PROTOCOL_SCHEMA_VERSION,
      artifactKind: 'c4c-holdout-group-fold-evidence',
      algorithmVersion: C4C_ALGORITHM_VERSION,
      frozenBoundary: C4C_FROZEN_BOUNDARY,
      protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
      groupId: group.groupId,
      deviceFamily: group.deviceFamily,
      configurationSignature: group.configurationSignature,
      memberCount: group.members.length,
      independentCollectionCount: new Set(group.members.map((member) => member.collection)).size,
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

  const gate = buildHoldoutGate(groupEvidences.map((group) => ({ groupId: group.groupId, classification: group.classification })))
  if (gate.groupCount !== HOLDOUT_GROUP_IDS.length || gate.classification === 'INCONCLUSIVE') throw new Error('C4c holdout evidence is inconclusive')
  const holdoutSummaries = groupEvidences.map(groupSummary)
  const combinedInterpretation = buildCombinedC4Interpretation({
    developmentClassification: frozenC4b.manifest.outcomeClassification,
    holdoutClassification: gate.classification,
  })
  const handoff = c1HandoffDescription(combinedInterpretation)
  const combined = combinedDiagnostics(frozenC4b.aggregate, holdoutSummaries)
  const groupFiles = groupEvidences.map((group) => `group-${group.groupId}.json`).sort()
  const evidenceFiles = ['aggregate-evidence.json', 'final-report.md', ...groupFiles, 'manifest.json', 'schema.json'].sort()
  const aggregate = {
    schemaVersion: C4C_PROTOCOL_SCHEMA_VERSION,
    artifactKind: 'c4c-holdout-aggregate-evidence',
    algorithmVersion: C4C_ALGORITHM_VERSION,
    frozenBoundary: C4C_FROZEN_BOUNDARY,
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    protocolSha256: protocolSha,
    c4aCorpusCommit: C4A_CORPUS_COMMIT,
    c4aEvidenceSha256: frozenC4a.evidenceSha256,
    c4bProtocolFreezeCommit: C4B_PROTOCOL_COMMIT,
    c4bEvidenceCommit: C4B_EVIDENCE_COMMIT,
    c4bEvidenceSha256: C4B_EVIDENCE_SHA256,
    c4bAlgorithmSourceSha256: C4B_ALGORITHM_SOURCE_SHA256,
    holdoutGroupIds: [...HOLDOUT_GROUP_IDS],
    groupEvidenceFiles: groupFiles,
    groups: holdoutSummaries,
    holdoutGate: gate,
    combinedInterpretation,
    combinedDiagnostics: combined,
    holdoutCoverage: {
      groupCount: groupEvidences.length,
      memberCount: groupEvidences.reduce((sum, group) => sum + group.memberCount, 0),
      foldCount: groupEvidences.reduce((sum, group) => sum + group.folds.length, 0),
      alignmentBandHz: [...C4C_ALIGNMENT_BAND_HZ],
    },
    flags: {
      developmentRerunForDecision: false,
      holdoutExecuted: true,
      freshRealCorpusBatchCExecuted: false,
      outcomesGenerated: true,
      consensusAlgorithmExecuted: true,
      autoEqSolverExecuted: false,
      confidenceWeightingExecuted: false,
      rawMeasurementsCommitted: false,
    },
  }
  const finalManifest = {
    ...manifest,
    phase: 'holdout-outcome',
    milestone: 'C4c-holdout-confirmation-outcome',
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    protocolSha256: protocolSha,
    outcomeClassification: gate.classification,
    combinedInterpretation,
    holdoutGroupIds: [...HOLDOUT_GROUP_IDS],
    holdoutExecuted: true,
    freshRealCorpusBatchCExecuted: false,
    developmentRerunForDecision: false,
    outcomesGenerated: true,
    consensusAlgorithmExecuted: true,
    autoEqSolverExecuted: false,
    confidenceWeightingExecuted: false,
    rawMeasurementsCommitted: false,
    groupEvidenceFiles: groupFiles,
    evidenceFiles,
    c4aEvidenceSha256: frozenC4a.evidenceSha256,
    holdoutCoverage: aggregate.holdoutCoverage,
    holdoutGate: gate,
    combinedDiagnostics: combined,
    c1Handoff: handoff,
  }
  const report = reportText({
    summaries: holdoutSummaries,
    gate,
    combinedInterpretation,
    combined,
    protocolSha,
    evidenceFiles,
    handoff,
  })
  const payloads = new Map([
    ['aggregate-evidence.json', Buffer.from(jsonText(aggregate))],
    ['manifest.json', Buffer.from(jsonText(finalManifest))],
    ['schema.json', Buffer.from(jsonText(schema))],
    ...groupEvidences.map((group) => [`group-${group.groupId}.json`, Buffer.from(jsonText(group))]),
    ['final-report.md', Buffer.from(report)],
  ])
  const evidenceSha256 = hashEvidencePayloads(payloads)
  await mkdir(OUTPUT_DIR, { recursive: true })
  for (const [relativePath, payload] of payloads) await writeFile(resolve(OUTPUT_DIR, relativePath), payload)
  await writeFile(resolve(OUTPUT_DIR, 'evidence-sha256.txt'), `${evidenceSha256}\n`)
  const actualPayloads = new Map()
  for (const relativePath of evidenceFiles) actualPayloads.set(relativePath, await readFile(resolve(OUTPUT_DIR, relativePath)))
  const recomputedEvidenceSha256 = hashEvidencePayloads(actualPayloads)
  if (recomputedEvidenceSha256 !== evidenceSha256) throw new Error(`C4c evidence SHA-256 recomputation mismatch: ${recomputedEvidenceSha256}`)
  process.stdout.write(`${JSON.stringify({
    branch: execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    protocolFreezeCommit: PROTOCOL_FREEZE_COMMIT,
    protocolSha256: protocolSha,
    evidenceSha256,
    holdoutGroupIds: [...HOLDOUT_GROUP_IDS],
    groups: holdoutSummaries,
    holdoutGate: gate,
    combinedInterpretation,
    holdoutCoverage: aggregate.holdoutCoverage,
    developmentRerunForDecision: false,
    freshRealCorpusBatchCExecuted: false,
    autoEqSolverExecuted: false,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
