import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createStructuralBeamExhaustionTrace,
  type StructuralBeamExhaustionTrace,
} from './structuralBeam.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import { generateIndependentPolicyCells } from './stormAdmissionIndependentPolicyValidation.js'
import {
  ANYTIME_ARMS,
  ANYTIME_PANEL_CELL_IDS,
  runAnytimeArm,
} from './stormAdmissionQuotaAnytimeCampaign.js'
import type { OracleReferenceSnapshotV1 } from './referenceSnapshot.js'

export type ExhaustionClassification =
  | 'generator-empty'
  | 'admission-empty'
  | 'capacity-filter-limit'
  | 'beam-retention-cycle'
  | 'visited-state-saturation'
  | 'mixed-saturation'
  | 'not-exhausted'

export function classifyExhaustionTrace(trace: StructuralBeamExhaustionTrace): ExhaustionClassification {
  const terminal = trace.layers.at(-1)
  if (terminal === undefined || !terminal.terminalNoGenerated) return 'not-exhausted'

  const ordered = terminal.parents.reduce((sum, parent) => sum + parent.orderedProposalCount, 0)
  const selected = terminal.parents.reduce((sum, parent) => sum + parent.selectedProposalCount, 0)
  const overMax = terminal.parents.reduce((sum, parent) => sum + parent.overMaxFiltersCount, 0)
  const postPolishVisited = terminal.parents.reduce((sum, parent) => sum + parent.postPolishVisitedCount, 0)

  if (ordered === 0) return 'generator-empty'
  if (selected === 0) return 'admission-empty'
  if (overMax === selected) return 'capacity-filter-limit'

  const previous = trace.layers.at(-2)
  if (
    postPolishVisited + overMax === selected &&
    previous !== undefined &&
    previous.generatedCandidateIds.length > 0 &&
    previous.retainedGeneratedCandidateIds.length === 0
  ) return 'beam-retention-cycle'

  if (postPolishVisited + overMax === selected) return 'visited-state-saturation'
  return 'mixed-saturation'
}

function summarizeTrace(trace: StructuralBeamExhaustionTrace) {
  const totals = {
    layers: trace.layers.length,
    parentsExpanded: 0,
    orderedProposals: 0,
    defaultAdmitted: 0,
    selectedProposals: 0,
    prePolishAlreadyVisited: 0,
    overMaxFilters: 0,
    postPolishVisited: 0,
    evaluatedNew: 0,
    generatedStates: 0,
    retainedGeneratedStates: 0,
    droppedGeneratedStates: 0,
  }

  for (const layer of trace.layers) {
    totals.generatedStates += layer.generatedCandidateIds.length
    totals.retainedGeneratedStates += layer.retainedGeneratedCandidateIds.length
    totals.droppedGeneratedStates += layer.droppedGeneratedCandidateIds.length
    for (const parent of layer.parents) {
      totals.parentsExpanded += 1
      totals.orderedProposals += parent.orderedProposalCount
      totals.defaultAdmitted += parent.defaultAdmittedCount
      totals.selectedProposals += parent.selectedProposalCount
      totals.prePolishAlreadyVisited += parent.prePolishAlreadyVisitedCount
      totals.overMaxFilters += parent.overMaxFiltersCount
      totals.postPolishVisited += parent.postPolishVisitedCount
      totals.evaluatedNew += parent.evaluatedNewCount
    }
  }

  const terminalLayer = trace.layers.at(-1) ?? null
  return {
    classification: classifyExhaustionTrace(trace),
    totals,
    terminalLayer,
    previousLayer: trace.layers.length >= 2 ? trace.layers.at(-2) : null,
  }
}

export function runSearchExhaustionCensus() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const allCells = generateIndependentPolicyCells(snapshot)
  const cells = ANYTIME_PANEL_CELL_IDS.map((cellId) => {
    const cell = allCells.find((candidate) => candidate.cellId === cellId)
    if (cell === undefined) throw new Error(`missing exhaustion census cell: ${cellId}`)
    return cell
  })

  const rows: any[] = []
  for (const cell of cells) {
    for (const arm of ANYTIME_ARMS) {
      const trace = createStructuralBeamExhaustionTrace()
      const run = runAnytimeArm(arm, cell, snapshot, trace)
      rows.push({
        cellId: cell.cellId,
        caseId: cell.caseId,
        initialFilterCount: cell.initialFilterCount,
        armId: arm.armId,
        run: {
          stopReason: run.stopReason,
          totalElapsedMs: run.totalElapsedMs,
          downstreamEvaluations: run.totalDownstreamEvaluations,
          signalCanonicalEvaluations: run.totalSignalCanonicalEvaluations,
        },
        exhaustion: summarizeTrace(trace),
      })
    }
  }

  const classifications = [
    'generator-empty',
    'admission-empty',
    'capacity-filter-limit',
    'beam-retention-cycle',
    'visited-state-saturation',
    'mixed-saturation',
    'not-exhausted',
  ] as const
  const aggregate = Object.fromEntries(classifications.map((classification) => [
    classification,
    rows.filter((row) => row.exhaustion.classification === classification).length,
  ]))

  const byArm = Object.fromEntries(ANYTIME_ARMS.map((arm) => [
    arm.armId,
    Object.fromEntries(classifications.map((classification) => [
      classification,
      rows.filter((row) =>
        row.armId === arm.armId && row.exhaustion.classification === classification).length,
    ])),
  ]))

  const totals = rows.reduce((acc, row) => {
    for (const [key, value] of Object.entries(row.exhaustion.totals)) {
      if (key === 'layers') continue
      acc[key] = (acc[key] ?? 0) + Number(value)
    }
    return acc
  }, {} as Record<string, number>)

  const dominant = classifications
    .filter((classification) => classification !== 'not-exhausted')
    .map((classification) => ({ classification, count: aggregate[classification] }))
    .sort((left, right) => right.count - left.count || left.classification.localeCompare(right.classification))[0]

  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-search-exhaustion-census-v1',
    predecessorSha: '3c1f77058e459e58e1bb9ea099f0d42d0155d4af',
    objective: 'Explain why the Q31/Q04 structural search terminates before the 5-second checkpoint without changing search decisions.',
    panelCellIds: ANYTIME_PANEL_CELL_IDS,
    arms: ANYTIME_ARMS,
    observationalOnly: true,
    rows,
    aggregate,
    byArm,
    totals,
    dominantBlocker: dominant ?? null,
    classification: dominant !== undefined && dominant.count > 0
      ? `exhaustion-dominated-by-${dominant.classification}`
      : 'exhaustion-inconclusive',
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-search-exhaustion-census-20260911/census-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-search-exhaustion-census-results.md',
  )
  const lines = [
    '# Storm Search Exhaustion Census Results',
    '',
    'Observational instrumentation only; search policy and downstream decisions are unchanged.',
    '',
    '| Cell | Arm | Stop | Exhaustion blocker | Layers | Ordered | Selected | Pre-polish visited | Post-polish visited | New evaluated | Generated | Retained generated | Dropped generated |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map((row) => {
      const t = row.exhaustion.totals
      return `| ${row.cellId} | ${row.armId} | ${row.run.stopReason} | ${row.exhaustion.classification} | ${t.layers} | ${t.orderedProposals} | ${t.selectedProposals} | ${t.prePolishAlreadyVisited} | ${t.postPolishVisited} | ${t.evaluatedNew} | ${t.generatedStates} | ${t.retainedGeneratedStates} | ${t.droppedGeneratedStates} |`
    }),
    '',
    '## Aggregate blocker counts',
    '',
    ...classifications.map((classification) => `- ${classification}: ${aggregate[classification]}`),
    '',
    `Dominant blocker: ${dominant?.classification ?? 'none'} (${dominant?.count ?? 0}/${rows.length} runs)`,
    `Classification: ${report.classification}`,
    '',
  ]
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, lines.join('\n'))

  process.stdout.write(JSON.stringify({
    aggregate,
    byArm,
    totals,
    dominantBlocker: report.dominantBlocker,
    classification: report.classification,
    rows: rows.map((row) => ({
      cellId: row.cellId,
      armId: row.armId,
      stopReason: row.run.stopReason,
      blocker: row.exhaustion.classification,
      terminalLayer: row.exhaustion.terminalLayer,
      previousLayer: row.exhaustion.previousLayer,
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runSearchExhaustionCensus()
}
