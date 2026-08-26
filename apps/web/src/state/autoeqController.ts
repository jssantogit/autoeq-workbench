import {
  isValidAutoEqSettings,
  type AutoEqResult,
  type AutoEqSettings,
  type Curve,
  type StandardAutoEqInput,
} from '@autoeq-workbench/core'
import type { StoreApi } from 'zustand/vanilla'

import {
  AutoEqCancelledError,
  AutoEqWorkerError,
  autoEqClient,
  type AutoEqClient,
} from '../workers/autoeqClient'
import { autoEqRunStore, type AutoEqRunState } from './autoeqRunStore'
import {
  deriveWorkspace,
  workspaceStore,
  type WorkspaceState,
} from './workspaceStore'

type RunSignatureState = Pick<
  WorkspaceState,
  'curves' | 'activeFrId' | 'activeTargetId' | 'normalization' | 'autoeqSettings'
>

function selectedCurves(state: RunSignatureState): { source: Curve; target: Curve } | null {
  const source = state.curves.find(
    (curve) => curve.id === state.activeFrId && curve.kind === 'fr',
  )
  const target = state.curves.find(
    (curve) => curve.id === state.activeTargetId && curve.kind === 'target',
  )
  return source === undefined || target === undefined ? null : { source, target }
}

function settingsSignature(settings: AutoEqSettings): number[] {
  return [
    settings.minFrequencyHz,
    settings.maxFrequencyHz,
    settings.minGainDb,
    settings.maxGainDb,
    settings.minQ,
    settings.maxQ,
    settings.maxFilters,
  ]
}

export function createAutoEqRunInputSignature(state: RunSignatureState): string | null {
  const selected = selectedCurves(state)
  if (selected === null) return null

  return JSON.stringify({
    activeFrId: selected.source.id,
    activeTargetId: selected.target.id,
    sourcePoints: selected.source.rawPoints.map(({ frequencyHz, db }) => [frequencyHz, db]),
    targetPoints: selected.target.rawPoints.map(({ frequencyHz, db }) => [frequencyHz, db]),
    normalization: [state.normalization.anchorHz, state.normalization.targetDb],
    settings: settingsSignature(state.autoeqSettings),
  })
}

function cloneCurve(curve: Curve): Curve {
  return {
    ...curve,
    rawPoints: curve.rawPoints.map((point) => ({ ...point })),
    metadata: { ...curve.metadata },
  }
}

function captureRunInput(state: WorkspaceState): StandardAutoEqInput | null {
  const selected = selectedCurves(state)
  if (selected === null) return null

  return {
    source: cloneCurve(selected.source),
    target: cloneCurve(selected.target),
    normalization: { ...state.normalization },
    settings: { ...state.autoeqSettings },
  }
}

interface AutoEqControllerDependencies {
  workspace: StoreApi<WorkspaceState>
  runStore: StoreApi<AutoEqRunState>
  client: AutoEqClient
  createRunId: () => string
}

export interface AutoEqController {
  runAutoEq(): Promise<void>
  cancelAutoEq(): void
}

export function createAutoEqController({
  workspace,
  runStore,
  client,
  createRunId,
}: AutoEqControllerDependencies): AutoEqController {
  const cancelAutoEq = (): void => {
    const runId = runStore.getState().activeRunId
    if (runId === null) return
    client.cancel(runId)
    runStore.getState().cancel(runId)
  }

  const runAutoEq = async (): Promise<void> => {
    const state = workspace.getState()
    const input = captureRunInput(state)
    const signature = createAutoEqRunInputSignature(state)
    if (
      input === null ||
      signature === null ||
      !isValidAutoEqSettings(state.autoeqSettings) ||
      deriveWorkspace(state).status !== 'ready'
    ) {
      runStore.getState().reject({
        category: 'validation',
        message: 'Select a valid active FR and Target before running AutoEQ.',
      })
      return
    }

    const priorRunId = runStore.getState().activeRunId
    if (priorRunId !== null) cancelAutoEq()

    const runId = createRunId()
    let pending: Promise<AutoEqResult>
    try {
      pending = client.run(runId, input)
    } catch {
      runStore.getState().reject({
        category: 'optimization',
        message: 'AutoEQ optimization failed.',
      })
      return
    }
    runStore.getState().start(runId)

    try {
      const result = await pending
      if (runStore.getState().activeRunId !== runId) return

      if (createAutoEqRunInputSignature(workspace.getState()) === signature) {
        workspace.getState().applyAutoEqResult(result)
      }
      runStore.getState().finish(runId)
    } catch (cause) {
      if (cause instanceof AutoEqCancelledError) {
        runStore.getState().cancel(runId)
        return
      }
      const error = cause instanceof AutoEqWorkerError
        ? { category: cause.category, message: cause.message }
        : { category: 'optimization' as const, message: 'AutoEQ optimization failed.' }
      runStore.getState().fail(runId, error)
    }
  }

  return { runAutoEq, cancelAutoEq }
}

const defaultController = createAutoEqController({
  workspace: workspaceStore,
  runStore: autoEqRunStore,
  client: autoEqClient,
  createRunId: () => crypto.randomUUID(),
})

export function runAutoEq(): Promise<void> {
  return defaultController.runAutoEq()
}

export function cancelAutoEq(): void {
  defaultController.cancelAutoEq()
}
