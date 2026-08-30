import {
  isValidAutoEqSettings,
  type AutoEqResultV2,
  type Curve,
  type StandardAutoEqInputV2,
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
  createAutoEqRunInputSignature,
  getSelectedAutoEqCurves,
} from './autoEqRunInputSignature'
import {
  deriveWorkspace,
  workspaceStore,
  type WorkspaceState,
} from './workspaceStore'

export { createAutoEqRunInputSignature } from './autoEqRunInputSignature'

function cloneCurve(curve: Curve): Curve {
  return {
    ...curve,
    rawPoints: curve.rawPoints.map((point) => ({ ...point })),
    metadata: { ...curve.metadata },
  }
}

function captureRunInput(state: WorkspaceState): StandardAutoEqInputV2 | null {
  const selected = getSelectedAutoEqCurves(state)
  if (selected === null) return null

  return {
    source: cloneCurve(selected.source),
    target: cloneCurve(selected.target),
    normalization: { ...state.normalization },
    settings: { ...state.autoeqSettings },
  }
}

function matchesCapturedProvenance(
  manifest: AutoEqResultV2['manifest'] | undefined,
  input: StandardAutoEqInputV2,
): boolean {
  if (!manifest || typeof manifest !== 'object') return false
  if (manifest.schemaVersion !== 3 || manifest.algorithmVersion !== 'standard-v2') return false
  if (manifest.sourceName !== input.source.name || manifest.targetName !== input.target.name) {
    return false
  }
  const norm = manifest.normalization
  if (
    !norm ||
    norm.mode !== input.normalization.mode ||
    norm.frequencyHz !== input.normalization.frequencyHz ||
    norm.levelDb !== input.normalization.levelDb
  ) {
    return false
  }
  const settings = manifest.autoeqSettings
  if (
    !settings ||
    settings.minFrequencyHz !== input.settings.minFrequencyHz ||
    settings.maxFrequencyHz !== input.settings.maxFrequencyHz ||
    settings.minGainDb !== input.settings.minGainDb ||
    settings.maxGainDb !== input.settings.maxGainDb ||
    settings.minQ !== input.settings.minQ ||
    settings.maxQ !== input.settings.maxQ ||
    settings.maxFilters !== input.settings.maxFilters ||
    settings.timeLimitSeconds !== input.settings.timeLimitSeconds
  ) {
    return false
  }
  return true
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
    let pending: Promise<AutoEqResultV2>
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
        if (
          !matchesCapturedProvenance(result?.manifest, input) ||
          !workspace.getState().applyAutoEqResult(result)
        ) {
          runStore.getState().fail(runId, {
            category: 'optimization',
            message: 'AutoEQ optimization failed.',
          })
          return
        }
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
