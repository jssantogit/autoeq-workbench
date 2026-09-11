import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createStructuralBeamExhaustionTrace,
  retainParetoBeam,
  type StructuralBeamRetentionOverride,
  type StructuralBeamState,
} from './structuralBeam.js'
import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import { generateIndependentPolicyCells } from './stormAdmissionIndependentPolicyValidation.js'
import {
  ANYTIME_ARMS,
  ANYTIME_PANEL_CELL_IDS,
  compareSelected,
  paretoRelation,
  runAnytimeArm,
} from './stormAdmissionQuotaAnytimeCampaign.js'
import {
  classifyExhaustionTrace,
} from './stormSearchExhaustionCensus.js'
import type { OracleReferenceSnapshotV1 } from './referenceSnapshot.js'

export const ESCAPE_DEADLINE_MS = 5_000 as const

export interface NoveltySlotLedger {
  activations: number
  layers: Array<{
    layerIndex: number
    incumbentCandidateId: string
    noveltyCandidateId: string
    defaultRetainedCandidateIds: string[]
  }>
}

export function buildNoveltySlotRetention(
  previousBeam: readonly StructuralBeamState[],
  generatedStates: readonly StructuralBeamState[],
  defaultRetained: readonly StructuralBeamState[],
  beamWidth: number,
): StructuralBeamState[] | null {
  if (beamWidth < 2 || previousBeam.length === 0 || generatedStates.length === 0) return null
  const generatedIds = new Set(generatedStates.map((state) => state.candidate.candidateId))
  if (defaultRetained.some((state) => generatedIds.has(state.candidate.candidateId))) return null

  const incumbent = retainParetoBeam(previousBeam, 1)[0]
  const novelty = retainParetoBeam(generatedStates, 1)[0]
  if (incumbent === undefined || novelty === undefined) return null
  return [incumbent, novelty]
}

export function createNoveltySlotOverride(ledger: NoveltySlotLedger): StructuralBeamRetentionOverride {
  return {
    apply(context) {
      const states = buildNoveltySlotRetention(
        context.previousBeam,
        context.generatedStates,
        context.defaultRetained,
        context.beamWidth,
      )
      if (states === null) return null
      ledger.activations += 1
      ledger.layers.push({
        layerIndex: context.layerIndex,
        incumbentCandidateId: states[0]!.candidate.candidateId,
        noveltyCandidateId: states[1]!.candidate.candidateId,
        defaultRetainedCandidateIds: context.defaultRetained.map((state) => state.candidate.candidateId),
      })
      return { states, intervention: 'custom' }
    },
  }
}

function selectedAtFiveSeconds(run: ReturnType<typeof runAnytimeArm>) {
  return run.checkpoints.find((checkpoint) => checkpoint.checkpointMs === ESCAPE_DEADLINE_MS)?.selectedBest ?? null
}

export function runBeamEscapeCausalCampaign() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const allCells = generateIndependentPolicyCells(snapshot)
  const cells = ANYTIME_PANEL_CELL_IDS.map((cellId) => {
    const cell = allCells.find((candidate) => candidate.cellId === cellId)
    if (cell === undefined) throw new Error(`missing beam escape cell: ${cellId}`)
    return cell
  })

  const rows: any[] = []
  for (const cell of cells) {
    for (const arm of ANYTIME_ARMS) {
      const controlTrace = createStructuralBeamExhaustionTrace()
      const control = runAnytimeArm(
        arm,
        cell,
        snapshot,
        controlTrace,
        undefined,
        ESCAPE_DEADLINE_MS,
      )

      const escapeTrace = createStructuralBeamExhaustionTrace()
      const ledger: NoveltySlotLedger = { activations: 0, layers: [] }
      const escape = runAnytimeArm(
        arm,
        cell,
        snapshot,
        escapeTrace,
        createNoveltySlotOverride(ledger),
        ESCAPE_DEADLINE_MS,
      )

      const controlBest = selectedAtFiveSeconds(control)
      const escapeBest = selectedAtFiveSeconds(escape)
      const winner = compareSelected(escapeBest, controlBest)
      const qualityRelation = winner === 'Q31' ? 'escape'
        : winner === 'Q04' ? 'control'
        : 'equivalent'

      rows.push({
        cellId: cell.cellId,
        caseId: cell.caseId,
        initialFilterCount: cell.initialFilterCount,
        armId: arm.armId,
        control: {
          stopReason: control.stopReason,
          elapsedMs: control.totalElapsedMs,
          downstreamEvaluations: control.totalDownstreamEvaluations,
          signalCanonicalEvaluations: control.totalSignalCanonicalEvaluations,
          selectedBest: controlBest,
          exhaustionBlocker: classifyExhaustionTrace(controlTrace),
        },
        escape: {
          stopReason: escape.stopReason,
          elapsedMs: escape.totalElapsedMs,
          downstreamEvaluations: escape.totalDownstreamEvaluations,
          signalCanonicalEvaluations: escape.totalSignalCanonicalEvaluations,
          selectedBest: escapeBest,
          exhaustionBlocker: classifyExhaustionTrace(escapeTrace),
          noveltySlotActivations: ledger.activations,
          noveltySlotLayers: ledger.layers,
        },
        relation: {
          selector: qualityRelation,
          pareto: paretoRelation(escapeBest, controlBest),
          deltaRmseDb: escapeBest !== null && controlBest !== null
            ? escapeBest.rmseDb - controlBest.rmseDb
            : null,
          deltaMaxAbsDb: escapeBest !== null && controlBest !== null
            ? escapeBest.maxAbsDb - controlBest.maxAbsDb
            : null,
          deltaRegret: escapeBest !== null && controlBest !== null
            ? escapeBest.regret - controlBest.regret
            : null,
          downstreamEvaluationDelta: escape.totalDownstreamEvaluations - control.totalDownstreamEvaluations,
          elapsedMsDelta: escape.totalElapsedMs - control.totalElapsedMs,
        },
      })
    }
  }

  const wins = rows.filter((row) => row.relation.selector === 'escape').length
  const losses = rows.filter((row) => row.relation.selector === 'control').length
  const ties = rows.filter((row) => row.relation.selector === 'equivalent').length
  const extended = rows.filter((row) => row.relation.downstreamEvaluationDelta > 0).length
  const reachedDeadline = rows.filter((row) => row.escape.stopReason === 'deadline').length
  const totalActivations = rows.reduce((sum, row) => sum + row.escape.noveltySlotActivations, 0)

  const extensionClassification = extended === rows.length
    ? 'retention-escape-extends-all-runs'
    : extended > 0
      ? 'retention-escape-extends-some-runs'
      : 'retention-escape-does-not-extend-search'
  const qualityClassification = wins > losses
    ? 'retention-escape-quality-favorable'
    : losses > wins
      ? 'retention-escape-quality-unfavorable'
      : 'retention-escape-quality-mixed'

  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-beam-escape-causal-v1',
    predecessorSha: '5ca908b7db83a4b946861c1df8fe28d0cf341466',
    objective: 'Test whether one deterministic novelty slot, activated only when default beam retention would discard every newly generated state, causally unlocks the unused 5-second budget and improves selected-best quality.',
    protocol: {
      panelCellIds: ANYTIME_PANEL_CELL_IDS,
      arms: ANYTIME_ARMS,
      deadlineMs: ESCAPE_DEADLINE_MS,
      intervention: 'preserve best incumbent + best generated state only when default retention contains zero generated states',
      generatedStateSelection: 'existing retainParetoBeam on generated states with width 1',
      incumbentSelection: 'existing retainParetoBeam on previous beam with width 1',
      admissionUnchanged: true,
      mutationGeneratorUnchanged: true,
      localPolishUnchanged: true,
      selectorUnchanged: true,
      signalOverheadChargedToClock: true,
    },
    rows,
    aggregate: {
      wins,
      losses,
      ties,
      extendedRuns: extended,
      totalRuns: rows.length,
      escapeRunsReachingDeadline: reachedDeadline,
      totalNoveltySlotActivations: totalActivations,
      meanDownstreamEvaluationDelta: rows.reduce((sum, row) =>
        sum + row.relation.downstreamEvaluationDelta, 0) / rows.length,
      meanDeltaRmseDb: rows.reduce((sum, row) => sum + row.relation.deltaRmseDb, 0) / rows.length,
      meanDeltaMaxAbsDb: rows.reduce((sum, row) => sum + row.relation.deltaMaxAbsDb, 0) / rows.length,
      meanDeltaRegret: rows.reduce((sum, row) => sum + row.relation.deltaRegret, 0) / rows.length,
    },
    extensionClassification,
    qualityClassification,
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-beam-escape-causal-20260911/campaign-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-beam-escape-causal-results.md',
  )
  const lines = [
    '# Storm Beam Escape Causal Results',
    '',
    'Single intervention: one novelty slot only when default beam retention would keep zero newly generated states.',
    '',
    '| Cell | Arm | Winner | Pareto | Control stop/evals | Escape stop/evals | Slot activations | ΔRMSE | ΔmaxAbs | ΔRegret |',
    '|---|---|---|---|---|---|---:|---:|---:|---:|',
    ...rows.map((row) =>
      `| ${row.cellId} | ${row.armId} | ${row.relation.selector} | ${row.relation.pareto} | ${row.control.stopReason}/${row.control.downstreamEvaluations} | ${row.escape.stopReason}/${row.escape.downstreamEvaluations} | ${row.escape.noveltySlotActivations} | ${row.relation.deltaRmseDb.toFixed(6)} | ${row.relation.deltaMaxAbsDb.toFixed(6)} | ${row.relation.deltaRegret.toFixed(6)} |`),
    '',
    `Extension classification: ${extensionClassification}`,
    `Quality classification: ${qualityClassification}`,
    '',
  ]
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, lines.join('\n'))

  process.stdout.write(JSON.stringify({
    aggregate: report.aggregate,
    extensionClassification,
    qualityClassification,
    rows: rows.map((row) => ({
      cellId: row.cellId,
      armId: row.armId,
      control: {
        stopReason: row.control.stopReason,
        downstreamEvaluations: row.control.downstreamEvaluations,
        blocker: row.control.exhaustionBlocker,
      },
      escape: {
        stopReason: row.escape.stopReason,
        downstreamEvaluations: row.escape.downstreamEvaluations,
        blocker: row.escape.exhaustionBlocker,
        noveltySlotActivations: row.escape.noveltySlotActivations,
      },
      relation: row.relation,
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runBeamEscapeCausalCampaign()
}
