import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveCapacityRecoveryPath } from './frozenResearchInputs.js'
import { resolveResearchPath } from './seedAllocationRun.js'
import { generateIndependentPolicyCells } from './stormAdmissionIndependentPolicyValidation.js'
import {
  ANYTIME_ARMS,
  ANYTIME_CHECKPOINTS_MS,
  ANYTIME_PANEL_CELL_IDS,
  compareSelected,
  paretoRelation,
  runAnytimeArm,
} from './stormAdmissionQuotaAnytimeCampaign.js'
import {
  createNoveltySlotOverride,
  type NoveltySlotLedger,
} from './stormBeamEscapeCausalCampaign.js'
import type { OracleReferenceSnapshotV1 } from './referenceSnapshot.js'

export const BEAM_ESCAPE_ANYTIME_DEADLINE_MS = 60_000 as const

type CheckpointSummary = {
  checkpointMs: number
  q31Wins: number
  q04Wins: number
  ties: number
  pareto: {
    q31Dominates: number
    q04Dominates: number
    tradeoffs: number
    equivalent: number
  }
  meanDeltaRmseDb: number
  meanDeltaMaxAbsDb: number
  meanDeltaRegret: number
  work: {
    Q31: { downstreamEvaluations: number; signalCanonicalEvaluations: number }
    Q04: { downstreamEvaluations: number; signalCanonicalEvaluations: number }
  }
}

export function classifyEscapeAnytime(
  summaries: readonly CheckpointSummary[],
): 'Q31-escape-anytime-favorable' | 'Q04-escape-anytime-favorable' | 'escape-anytime-tradeoff' {
  const q31 = summaries.reduce((sum, row) => sum + row.q31Wins, 0)
  const q04 = summaries.reduce((sum, row) => sum + row.q04Wins, 0)
  if (q31 > q04) return 'Q31-escape-anytime-favorable'
  if (q04 > q31) return 'Q04-escape-anytime-favorable'
  return 'escape-anytime-tradeoff'
}

export function runBeamEscapeAnytimeCampaign() {
  const snapshot = JSON.parse(
    readFileSync(resolveCapacityRecoveryPath('OracleReferenceSnapshotV1.json'), 'utf8'),
  ) as OracleReferenceSnapshotV1
  const allCells = generateIndependentPolicyCells(snapshot)
  const cells = ANYTIME_PANEL_CELL_IDS.map((cellId) => {
    const cell = allCells.find((candidate) => candidate.cellId === cellId)
    if (cell === undefined) throw new Error(`missing beam-escape anytime cell: ${cellId}`)
    return cell
  })

  const rows: any[] = []
  for (const cell of cells) {
    const arms: Record<string, any> = {}
    for (const arm of ANYTIME_ARMS) {
      const ledger: NoveltySlotLedger = { activations: 0, layers: [] }
      const run = runAnytimeArm(
        arm,
        cell,
        snapshot,
        undefined,
        createNoveltySlotOverride(ledger),
        BEAM_ESCAPE_ANYTIME_DEADLINE_MS,
      )
      arms[arm.armId] = {
        ...run,
        noveltySlotActivations: ledger.activations,
      }
    }

    const comparisons = ANYTIME_CHECKPOINTS_MS.map((checkpointMs) => {
      const q31 = arms.Q31.checkpoints.find((checkpoint: any) =>
        checkpoint.checkpointMs === checkpointMs)!
      const q04 = arms.Q04.checkpoints.find((checkpoint: any) =>
        checkpoint.checkpointMs === checkpointMs)!
      return {
        checkpointMs,
        selectorWinner: compareSelected(q31.selectedBest, q04.selectedBest),
        paretoRelation: paretoRelation(q31.selectedBest, q04.selectedBest),
        deltaRmseDb: q31.selectedBest.rmseDb - q04.selectedBest.rmseDb,
        deltaMaxAbsDb: q31.selectedBest.maxAbsDb - q04.selectedBest.maxAbsDb,
        deltaRegret: q31.selectedBest.regret - q04.selectedBest.regret,
      }
    })

    rows.push({
      cellId: cell.cellId,
      caseId: cell.caseId,
      initialFilterCount: cell.initialFilterCount,
      arms,
      comparisons,
    })
  }

  const summaries: CheckpointSummary[] = ANYTIME_CHECKPOINTS_MS.map((checkpointMs) => {
    const comparisons = rows.map((row) =>
      row.comparisons.find((comparison: any) => comparison.checkpointMs === checkpointMs))
    const mean = (key: 'deltaRmseDb' | 'deltaMaxAbsDb' | 'deltaRegret') =>
      comparisons.reduce((sum: number, row: any) => sum + row[key], 0) / comparisons.length
    const work = (armId: 'Q31' | 'Q04') => ({
      downstreamEvaluations: rows.reduce((sum, row) =>
        sum + row.arms[armId].checkpoints.find((c: any) =>
          c.checkpointMs === checkpointMs).downstreamEvaluations, 0),
      signalCanonicalEvaluations: rows.reduce((sum, row) =>
        sum + row.arms[armId].checkpoints.find((c: any) =>
          c.checkpointMs === checkpointMs).signalCanonicalEvaluations, 0),
    })
    return {
      checkpointMs,
      q31Wins: comparisons.filter((row: any) => row.selectorWinner === 'Q31').length,
      q04Wins: comparisons.filter((row: any) => row.selectorWinner === 'Q04').length,
      ties: comparisons.filter((row: any) => row.selectorWinner === 'equivalent').length,
      pareto: {
        q31Dominates: comparisons.filter((row: any) => row.paretoRelation === 'Q31-dominates').length,
        q04Dominates: comparisons.filter((row: any) => row.paretoRelation === 'Q04-dominates').length,
        tradeoffs: comparisons.filter((row: any) => row.paretoRelation === 'tradeoff').length,
        equivalent: comparisons.filter((row: any) => row.paretoRelation === 'equivalent').length,
      },
      meanDeltaRmseDb: mean('deltaRmseDb'),
      meanDeltaMaxAbsDb: mean('deltaMaxAbsDb'),
      meanDeltaRegret: mean('deltaRegret'),
      work: { Q31: work('Q31'), Q04: work('Q04') },
    }
  })

  const report = {
    schemaVersion: 1,
    experimentVersion: 'storm-beam-escape-anytime-v1',
    predecessorSha: '0329a542e1b184363d32afa740165a2d0c23da0c',
    objective: 'Compare Q31+novelty-slot versus Q04+novelty-slot under real 5/15/30/60 second wall-clock checkpoints after the retention blocker was causally validated.',
    protocol: {
      panelCellIds: ANYTIME_PANEL_CELL_IDS,
      checkpointsMs: ANYTIME_CHECKPOINTS_MS,
      deadlineMs: BEAM_ESCAPE_ANYTIME_DEADLINE_MS,
      oneRunPerArmCell: true,
      checkpointsExtractedFromSingleTrajectory: true,
      signalOverheadChargedToClock: true,
      noveltySlotRuleFrozenFromPredecessor: true,
      admissionOnlyDifference: 'Q31 versus Q04',
      mutationGeneratorUnchanged: true,
      localPolishUnchanged: true,
      selectorUnchanged: true,
    },
    rows,
    checkpointSummaries: summaries,
    classification: classifyEscapeAnytime(summaries),
    terminal: {
      Q31: {
        deadline: rows.filter((row) => row.arms.Q31.stopReason === 'deadline').length,
        exhausted: rows.filter((row) => row.arms.Q31.stopReason === 'no-admissible-proposals').length,
        totalNoveltySlotActivations: rows.reduce((sum, row) =>
          sum + row.arms.Q31.noveltySlotActivations, 0),
      },
      Q04: {
        deadline: rows.filter((row) => row.arms.Q04.stopReason === 'deadline').length,
        exhausted: rows.filter((row) => row.arms.Q04.stopReason === 'no-admissible-proposals').length,
        totalNoveltySlotActivations: rows.reduce((sum, row) =>
          sum + row.arms.Q04.noveltySlotActivations, 0),
      },
    },
  }

  const artifactPath = resolveResearchPath(
    'packages/core/.research-artifacts/storm-beam-escape-anytime-20260911/campaign-report.json',
  )
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(report, null, 2) + '\n')

  const mdPath = resolveResearchPath(
    'docs/superpowers/specs/2026-09-11-storm-beam-escape-anytime-results.md',
  )
  const lines = [
    '# Storm Beam Escape Anytime Results',
    '',
    'Q31 and Q04 both use the causally validated novelty-slot retention rule.',
    '',
    '| Checkpoint | Q31 wins | Q04 wins | Ties | Pareto Q31/Q04/Trade/Eq | Mean ΔRMSE | Mean ΔmaxAbs | Mean ΔRegret | Q31 work D/S | Q04 work D/S |',
    '|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|',
    ...summaries.map((row) =>
      `| ${row.checkpointMs / 1000}s | ${row.q31Wins} | ${row.q04Wins} | ${row.ties} | ${row.pareto.q31Dominates}/${row.pareto.q04Dominates}/${row.pareto.tradeoffs}/${row.pareto.equivalent} | ${row.meanDeltaRmseDb.toFixed(6)} | ${row.meanDeltaMaxAbsDb.toFixed(6)} | ${row.meanDeltaRegret.toFixed(6)} | ${row.work.Q31.downstreamEvaluations}/${row.work.Q31.signalCanonicalEvaluations} | ${row.work.Q04.downstreamEvaluations}/${row.work.Q04.signalCanonicalEvaluations} |`),
    '',
    `Classification: ${report.classification}`,
    `Terminal Q31 deadline/exhausted: ${report.terminal.Q31.deadline}/${report.terminal.Q31.exhausted}`,
    `Terminal Q04 deadline/exhausted: ${report.terminal.Q04.deadline}/${report.terminal.Q04.exhausted}`,
    '',
  ]
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, lines.join('\n'))

  process.stdout.write(JSON.stringify({
    checkpointSummaries: summaries,
    classification: report.classification,
    terminal: report.terminal,
    perCellTerminal: rows.map((row) => ({
      cellId: row.cellId,
      Q31: {
        stopReason: row.arms.Q31.stopReason,
        downstreamEvaluations: row.arms.Q31.totalDownstreamEvaluations,
        signalCanonicalEvaluations: row.arms.Q31.totalSignalCanonicalEvaluations,
        noveltySlotActivations: row.arms.Q31.noveltySlotActivations,
      },
      Q04: {
        stopReason: row.arms.Q04.stopReason,
        downstreamEvaluations: row.arms.Q04.totalDownstreamEvaluations,
        signalCanonicalEvaluations: row.arms.Q04.totalSignalCanonicalEvaluations,
        noveltySlotActivations: row.arms.Q04.noveltySlotActivations,
      },
    })),
  }, null, 2) + '\n')
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  runBeamEscapeAnytimeCampaign()
}
