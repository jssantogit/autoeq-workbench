import { performance } from 'node:perf_hooks'

import { compareV2PrimaryMetrics } from '../../src/autoeq/v2/ranking.js'
import type {
  StandardV2ResearchTrace,
  StandardV2StagedContinuationBatchTrace,
} from '../../src/autoeq/v2/researchTrace.js'
import type { MetricBand } from '../../src/metrics/bandMetrics.js'

import type {
  ResearchCheckpoint,
  ResearchTelemetrySnapshot,
  StandardV2ResearchCounters,
  StandardV2ResearchPhaseTimingMs,
} from './types.js'

export const RESEARCH_BANDS: readonly MetricBand[] = [
  { id: 'bass', minHz: 20, maxHz: 200 },
  { id: 'low-mid', minHz: 200, maxHz: 1_000 },
  { id: 'mid', minHz: 1_000, maxHz: 4_000 },
  { id: 'presence', minHz: 4_000, maxHz: 8_000 },
  { id: 'treble', minHz: 8_000, maxHz: 20_000 },
] as const

const PHASES = [
  'prepare',
  'candidateScoring',
  'jointRefine',
  'deliverable',
  'discreteRefine',
  'compression',
] as const

function createCounters(): StandardV2ResearchCounters {
  return {
    boundaryModeAttempts: 0,
    candidatesGenerated: 0,
    candidatesShortlisted: 0,
    workingCheckpoints: 0,
    deliverablesBuilt: 0,
    peakWorkingFilterCount: 0,
    jointRefinementCount: 0,
    jointCoordinateTrials: 0,
    discreteTrials: 0,
    discreteAcceptedMoves: 0,
    compressionRemovalTrials: 0,
  }
}

function createPhaseTiming(): StandardV2ResearchPhaseTimingMs {
  return {
    prepare: 0,
    candidateScoring: 0,
    jointRefine: 0,
    deliverable: 0,
    discreteRefine: 0,
    compression: 0,
    other: 0,
  }
}

function cloneCheckpoint(checkpoint: ResearchCheckpoint): ResearchCheckpoint {
  return {
    ...checkpoint,
    metrics: { ...checkpoint.metrics },
  }
}

function cloneStagedContinuationBatch(
  batch: StandardV2StagedContinuationBatchTrace,
): StandardV2StagedContinuationBatchTrace {
  return {
    boundaryMode: batch.boundaryMode,
    parentFilterCount: batch.parentFilterCount,
    parentMetrics: { ...batch.parentMetrics },
    candidates: batch.candidates.map((candidate) => ({
      fastRank: candidate.fastRank,
      fastMetrics: { ...candidate.fastMetrics },
      continuedMetrics: { ...candidate.continuedMetrics },
    })),
  }
}

export function createResearchTelemetry(options: {
  mode: 'light' | 'deep'
  nowMs?: () => number
}): {
  trace: StandardV2ResearchTrace
  snapshot(): ResearchTelemetrySnapshot
} {
  const nowMs = options.nowMs ?? (() => performance.now())
  const startedAtMs = nowMs()
  const counters = createCounters()
  const checkpoints: ResearchCheckpoint[] = []
  const stagedContinuationBatches: StandardV2StagedContinuationBatchTrace[] = []
  const phaseTimingMs = createPhaseTiming()
  const phaseStarts = new Map<string, number[]>()
  const phasesObserved = new Set<(typeof PHASES)[number]>()

  const trace: StandardV2ResearchTrace = {
    onBoundaryModeAttempt: () => {
      counters.boundaryModeAttempts += 1
    },
    onCandidatesGenerated: (count) => {
      counters.candidatesGenerated += count
    },
    onCandidatesShortlisted: (count) => {
      counters.candidatesShortlisted += count
    },
    onJointRefineCompleted: (coordinateTrials) => {
      counters.jointRefinementCount += 1
      counters.jointCoordinateTrials += coordinateTrials
    },
    onWorkingCheckpoint: () => {
      counters.workingCheckpoints += 1
    },
    onDeliverableBuilt: () => {
      counters.deliverablesBuilt += 1
    },
    onBestDeliverableUpdated: (checkpoint) => {
      const candidate: ResearchCheckpoint = {
        elapsedMs: Math.max(0, nowMs() - startedAtMs),
        metrics: { ...checkpoint.metrics },
        filterCount: checkpoint.filters.length,
      }
      const previous = checkpoints.at(-1)
      if (
        previous === undefined ||
        compareV2PrimaryMetrics(candidate.metrics, previous.metrics) < 0
      ) {
        checkpoints.push(candidate)
      }
    },
    onDiscreteTrial: () => {
      counters.discreteTrials += 1
    },
    onDiscreteAcceptedMove: () => {
      counters.discreteAcceptedMoves += 1
    },
    onCompressionRemovalTrial: () => {
      counters.compressionRemovalTrials += 1
    },
    onPeakWorkingFilterCount: (count) => {
      counters.peakWorkingFilterCount = Math.max(counters.peakWorkingFilterCount, count)
    },
  }

  if (options.mode === 'deep') {
    trace.onStagedContinuationBatch = (batch) => {
      stagedContinuationBatches.push(cloneStagedContinuationBatch(batch))
    }
    trace.onPhaseStart = (phase) => {
      phasesObserved.add(phase)
      const starts = phaseStarts.get(phase) ?? []
      starts.push(nowMs())
      phaseStarts.set(phase, starts)
    }
    trace.onPhaseEnd = (phase) => {
      const starts = phaseStarts.get(phase)
      const started = starts?.pop()
      if (started === undefined) return
      phaseTimingMs[phase] += Math.max(0, nowMs() - started)
    }
  }

  return {
    trace,
    snapshot: () => {
      const snapshotCheckpoints = checkpoints.map(cloneCheckpoint)
      const last = snapshotCheckpoints.at(-1)
      if (last !== undefined) {
        const terminalElapsedMs = Math.max(last.elapsedMs, nowMs() - startedAtMs)
        if (terminalElapsedMs > last.elapsedMs) {
          snapshotCheckpoints.push({
            ...cloneCheckpoint(last),
            elapsedMs: terminalElapsedMs,
          })
        }
      }
      return {
        mode: options.mode,
        counters: {
          ...counters,
          stagedContinuationBatches: stagedContinuationBatches.map(
            cloneStagedContinuationBatch,
          ),
        },
        checkpoints: snapshotCheckpoints,
        phaseTimingMs: { ...phaseTimingMs },
        phasesObserved: [...phasesObserved],
      }
    },
  }
}
