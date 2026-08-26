import {
  DEFAULT_AUTOEQ_SETTINGS,
  type AutoEqResult,
  type Curve,
  type Filter,
  type StandardAutoEqInput,
} from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { createAutoEqResult } from '../test/autoEqFixture'
import {
  AutoEqCancelledError,
  AutoEqWorkerError,
  type AutoEqClient,
} from '../workers/autoeqClient'
import { createAutoEqController, createAutoEqRunInputSignature } from './autoeqController'
import { createAutoEqRunStore } from './autoeqRunStore'
import { createUiStore } from './uiStore'
import { createWorkspaceStore, type WorkspaceState } from './workspaceStore'

const priorFilter: Filter = {
  id: 'prior-filter',
  enabled: true,
  type: 'PK',
  frequencyHz: 750,
  gainDb: -2,
  q: 1.2,
}

function syntheticCurve(id: string, kind: Curve['kind'], middleDb: number): Curve {
  return {
    id,
    name: kind === 'fr' ? `Synthetic FR ${id}` : `Synthetic Target ${id}`,
    kind,
    rawPoints: [
      { frequencyHz: 20, db: middleDb / 2 },
      { frequencyHz: 500, db: middleDb },
      { frequencyHz: 20_000, db: -middleDb / 2 },
    ],
    metadata: { synthetic: true },
  }
}

interface ControlledRun {
  runId: string
  input: StandardAutoEqInput
  resolve: (result: AutoEqResult) => void
  reject: (cause: unknown) => void
}

function createControlledClient() {
  const runs: ControlledRun[] = []
  const client: AutoEqClient = {
    run: (runId, input) => new Promise((resolve, reject) => {
      runs.push({ runId, input, resolve, reject })
    }),
    cancel: (runId) => {
      const run = runs.find((candidate) => candidate.runId === runId)
      run?.reject(new AutoEqCancelledError())
    },
  }
  return { client, runs }
}

function createReadyWorkspace() {
  const workspace = createWorkspaceStore()
  workspace.getState().addCurve(syntheticCurve('fr-1', 'fr', 2))
  workspace.getState().addCurve(syntheticCurve('target-1', 'target', 0))
  workspace.getState().setFilters([priorFilter], 'manual')
  return workspace
}

function setup() {
  const workspace = createReadyWorkspace()
  const runStore = createAutoEqRunStore()
  const controlled = createControlledClient()
  let nextRun = 0
  const controller = createAutoEqController({
    workspace,
    runStore,
    client: controlled.client,
    createRunId: () => `run-${++nextRun}`,
  })
  return { workspace, runStore, controller, ...controlled }
}

function numericalState(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    curves: state.curves.map((curve) => ({
      ...curve,
      rawPoints: curve.rawPoints.map((point) => ({ ...point })),
      metadata: { ...curve.metadata },
    })),
    normalization: { ...state.normalization },
    autoeqSettings: { ...state.autoeqSettings },
  }
}

describe('AutoEQ controller', () => {
  it('captures independent active curves, normalization, and settings', () => {
    const { workspace, runStore, controller, runs } = setup()
    void controller.runAutoEq()

    const captured = runs[0]!.input
    const state = workspace.getState()
    expect(captured).toEqual({
      source: state.curves.find(({ id }) => id === 'fr-1'),
      target: state.curves.find(({ id }) => id === 'target-1'),
      normalization: state.normalization,
      settings: state.autoeqSettings,
    })
    expect(captured.source).not.toBe(state.curves.find(({ id }) => id === 'fr-1'))
    expect(captured.source.rawPoints).not.toBe(state.curves[0]!.rawPoints)
    expect(captured.normalization).not.toBe(state.normalization)
    expect(captured.settings).not.toBe(state.autoeqSettings)
    expect(runStore.getState()).toMatchObject({ status: 'running', activeRunId: 'run-1' })
  })

  it('starts transient running state after the client starts the Worker run', async () => {
    const workspace = createReadyWorkspace()
    const runStore = createAutoEqRunStore()
    const controlled = createControlledClient()
    let statusWhenClientStarted: string | null = null
    const client: AutoEqClient = {
      run: (runId, input) => {
        statusWhenClientStarted = runStore.getState().status
        return controlled.client.run(runId, input)
      },
      cancel: controlled.client.cancel,
    }
    const controller = createAutoEqController({
      workspace,
      runStore,
      client,
      createRunId: () => 'run-1',
    })

    const pending = controller.runAutoEq()

    expect(statusWhenClientStarted).toBe('idle')
    expect(runStore.getState().status).toBe('running')
    controlled.runs[0]!.resolve(createAutoEqResult())
    await pending
  })

  it('rejects a workspace that is not ready without starting a Worker', async () => {
    const workspace = createWorkspaceStore()
    workspace.getState().setFilters([priorFilter], 'manual')
    const runStore = createAutoEqRunStore()
    const controlled = createControlledClient()
    const controller = createAutoEqController({
      workspace,
      runStore,
      client: controlled.client,
      createRunId: () => 'unused-run',
    })

    await controller.runAutoEq()

    expect(controlled.runs).toHaveLength(0)
    expect(runStore.getState()).toMatchObject({
      status: 'error',
      activeRunId: null,
      error: { category: 'validation' },
    })
    expect(workspace.getState().filters).toEqual([priorFilter])
  })

  it('applies a valid current result through canonical workspace state', async () => {
    const { workspace, runStore, controller, runs } = setup()
    const pending = controller.runAutoEq()
    const result = createAutoEqResult(4)

    runs[0]!.resolve(result)
    await pending

    expect(workspace.getState()).toMatchObject({
      filters: result.filters,
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: result.manifest },
    })
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('does not mutate the prior solution when canonical workspace validation rejects a result', async () => {
    const { workspace, runStore, controller, runs } = setup()
    const pending = controller.runAutoEq()
    const malformed = createAutoEqResult(4)
    malformed.filters[0]!.gainDb = Number.POSITIVE_INFINITY

    runs[0]!.resolve(malformed)
    await pending

    expect(workspace.getState().filters).toEqual([priorFilter])
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('preserves the prior solution on cancellation', async () => {
    const { workspace, runStore, controller } = setup()
    const pending = controller.runAutoEq()

    controller.cancelAutoEq()
    await pending

    expect(workspace.getState().filters).toEqual([priorFilter])
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('preserves the prior solution and exposes only a structured Worker error', async () => {
    const { workspace, runStore, controller, runs } = setup()
    const pending = controller.runAutoEq()

    runs[0]!.reject(new AutoEqWorkerError({
      category: 'numeric',
      message: 'Synthetic numeric failure.',
    }))
    await pending

    expect(workspace.getState().filters).toEqual([priorFilter])
    expect(runStore.getState()).toMatchObject({
      status: 'error',
      activeRunId: null,
      error: { category: 'numeric', message: 'Synthetic numeric failure.' },
    })
  })
})

describe('AutoEQ run-input signature', () => {
  it('uses selected IDs, numerical raw points, normalization, and settings but not names', () => {
    const workspace = createReadyWorkspace()
    const base = numericalState(workspace.getState())
    const signature = createAutoEqRunInputSignature(base)

    const renamed = numericalState(base)
    renamed.curves[0]!.name = 'Renamed provenance only'
    renamed.curves[1]!.name = 'Also provenance only'
    expect(createAutoEqRunInputSignature(renamed)).toBe(signature)

    const changedFrId = numericalState(base)
    changedFrId.activeFrId = 'replacement-fr'
    changedFrId.curves[0]!.id = 'replacement-fr'
    expect(createAutoEqRunInputSignature(changedFrId)).not.toBe(signature)

    const changedTargetId = numericalState(base)
    changedTargetId.activeTargetId = 'replacement-target'
    changedTargetId.curves[1]!.id = 'replacement-target'
    expect(createAutoEqRunInputSignature(changedTargetId)).not.toBe(signature)

    const changedPoints = numericalState(base)
    changedPoints.curves[0]!.rawPoints[1]!.db += 0.25
    expect(createAutoEqRunInputSignature(changedPoints)).not.toBe(signature)

    const changedNormalization = numericalState(base)
    changedNormalization.normalization.targetDb = 1
    expect(createAutoEqRunInputSignature(changedNormalization)).not.toBe(signature)

    const changedSettings = numericalState(base)
    changedSettings.autoeqSettings.maxFilters -= 1
    expect(createAutoEqRunInputSignature(changedSettings)).not.toBe(signature)

    const removedSelection = numericalState(base)
    removedSelection.curves = removedSelection.curves.filter(({ id }) => id !== base.activeFrId)
    expect(createAutoEqRunInputSignature(removedSelection)).toBeNull()
  })
})

describe('AutoEQ obsolete result rejection', () => {
  it.each([
    ['FR selection', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().addCurve(syntheticCurve('fr-2', 'fr', 1))
      workspace.getState().setActiveFr('fr-2')
    }],
    ['Target selection', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().addCurve(syntheticCurve('target-2', 'target', -1))
      workspace.getState().setActiveTarget('target-2')
    }],
    ['selected curve numerical data', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.setState((state) => ({
        curves: state.curves.map((curve) => curve.id === state.activeFrId
          ? {
              ...curve,
              rawPoints: curve.rawPoints.map((point, index) => index === 1
                ? { ...point, db: point.db + 0.5 }
                : point),
            }
          : curve),
      }))
    }],
    ['normalization', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setNormalization({ anchorHz: 500, targetDb: 1 })
    }],
    ['settings', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setAutoEqSettings({
        ...DEFAULT_AUTOEQ_SETTINGS,
        maxFilters: DEFAULT_AUTOEQ_SETTINGS.maxFilters - 1,
      })
    }],
  ] as const)('discards a result after %s changes', async (_label, changeWorkspace) => {
    const { workspace, runStore, controller, runs } = setup()
    const pending = controller.runAutoEq()

    changeWorkspace(workspace)
    runs[0]!.resolve(createAutoEqResult(8))
    await pending

    expect(workspace.getState().filters).toEqual([priorFilter])
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('applies a result after unrelated tab and theme changes', async () => {
    const { workspace, controller, runs } = setup()
    const uiStore = createUiStore(() => 0)
    const pending = controller.runAutoEq()

    uiStore.getState().setActiveDockTab('tools')
    uiStore.getState().setTheme('dark')
    runs[0]!.resolve(createAutoEqResult(5))
    await pending

    expect(workspace.getState().filters).toEqual(createAutoEqResult(5).filters)
  })
})
