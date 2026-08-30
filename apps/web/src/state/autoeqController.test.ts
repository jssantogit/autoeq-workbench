import {
  DEFAULT_AUTOEQ_SETTINGS,
  type AutoEqResultV2,
  type AutoEqSettings,
  type Curve,
  type Filter,
  type StandardAutoEqInputV2,
} from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'

import { createAutoEqResultV2 } from '../test/autoEqFixture'
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
  id: 'autoeq-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 2,
  q: 1,
}

function syntheticCurve(id: string, kind: Curve['kind'], middleDb: number): Curve {
  return {
    id,
    name: kind === 'fr' ? 'Source' : 'Target',
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
  input: StandardAutoEqInputV2
  resolve: (result: AutoEqResultV2) => void
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
  workspace.getState().applyAutoEqResult(createAutoEqResultV2(2))
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

function solutionSnapshot(state: WorkspaceState) {
  return {
    filters: state.filters.map((filter) => ({ ...filter })),
    filterProvenance: state.filterProvenance,
    solutionState: state.solutionState,
    autoEqRun: state.autoEqRun === null ? null : structuredClone(state.autoEqRun),
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
    controlled.runs[0]!.resolve(createAutoEqResultV2())
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
    const result = createAutoEqResultV2(4)

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
    const before = solutionSnapshot(workspace.getState())
    const pending = controller.runAutoEq()
    const malformed = createAutoEqResultV2(4)
    malformed.filters[0]!.gainDb = Number.POSITIVE_INFINITY

    runs[0]!.resolve(malformed)
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(before)
    expect(runStore.getState()).toMatchObject({
      status: 'error',
      activeRunId: null,
      error: { category: 'optimization', message: 'AutoEQ optimization failed.' },
    })
  })

  it.each([
    ['normalization mode', (result: AutoEqResultV2) => {
      result.manifest.normalization.mode = 'db'
    }],
    ['normalization frequency', (result: AutoEqResultV2) => {
      result.manifest.normalization.frequencyHz = 1_000
    }],
    ['normalization level', (result: AutoEqResultV2) => {
      result.manifest.normalization.levelDb = 65
    }],
    ['settings', (result: AutoEqResultV2) => {
      result.manifest.autoeqSettings.maxFilters = 8
    }],
    ['time limit', (result: AutoEqResultV2) => {
      result.manifest.autoeqSettings.timeLimitSeconds = 30
    }],
    ['algorithm version', (result: AutoEqResultV2) => {
      result.manifest.algorithmVersion = 'standard-v3' as 'standard-v2'
    }],
    ['sourceName', (result: AutoEqResultV2) => {
      result.manifest.sourceName = 'Mismatched Source'
    }],
    ['targetName', (result: AutoEqResultV2) => {
      result.manifest.targetName = 'Mismatched Target'
    }],
  ] as const)('rejects Worker result with mismatched %s when workspace signature is unchanged', async (_label, mutateResult) => {
    const { workspace, runStore, controller, runs } = setup()
    const before = solutionSnapshot(workspace.getState())
    const pending = controller.runAutoEq()
    const result = createAutoEqResultV2(4)
    mutateResult(result)

    runs[0]!.resolve(result)
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(before)
    expect(runStore.getState()).toMatchObject({
      status: 'error',
      activeRunId: null,
      error: { category: 'optimization', message: 'AutoEQ optimization failed.' },
    })
  })

  it('preserves the prior solution on cancellation', async () => {
    const { workspace, runStore, controller } = setup()
    const before = solutionSnapshot(workspace.getState())
    expect(before.autoEqRun).not.toBeNull()
    const pending = controller.runAutoEq()

    controller.cancelAutoEq()
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(before)
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('rejects a Worker result above the captured Max Filters', async () => {
    const { workspace, runStore, controller, runs } = setup()
    workspace.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 1 })
    const before = solutionSnapshot(workspace.getState())
    const pending = controller.runAutoEq()
    const result = createAutoEqResultV2(4, {
      autoeqSettings: { ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 1 },
    })
    const second = { ...result.filters[0]!, id: 'autoeq-2', frequencyHz: 2_000 }
    result.filters.push(second)
    result.manifest.finalFilters.push({ ...second })

    runs[0]!.resolve(result)
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(before)
    expect(runStore.getState()).toMatchObject({
      status: 'error',
      error: { category: 'optimization', message: 'AutoEQ optimization failed.' },
    })
  })

  it('applies a matching Standard-v2 time-limit result as a normal completion', async () => {
    const { workspace, runStore, controller, runs } = setup()
    const pending = controller.runAutoEq()
    const result = createAutoEqResultV2(4, {
      metrics: { maeDb: 0.25, rmseDb: 0.3, maxAbsDb: 0.8, maxAbsFrequencyHz: 1_000 },
      terminationReason: 'time-limit',
      targetAchieved: false,
    })

    runs[0]!.resolve(result)
    await pending

    expect(workspace.getState().autoEqRun?.manifest).toMatchObject({
      algorithmVersion: 'standard-v2',
      terminationReason: 'time-limit',
      targetAchieved: false,
    })
    expect(workspace.getState().filters).toEqual(result.filters)
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('preserves the prior solution and exposes only a structured Worker error', async () => {
    const { workspace, runStore, controller, runs } = setup()
    const before = solutionSnapshot(workspace.getState())
    expect(before.autoEqRun).not.toBeNull()
    const pending = controller.runAutoEq()

    runs[0]!.reject(new AutoEqWorkerError({
      category: 'numeric',
      message: 'Synthetic numeric failure.',
    }))
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(before)
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

    const changedMode = numericalState(base)
    changedMode.normalization.mode = 'db'
    expect(createAutoEqRunInputSignature(changedMode)).not.toBe(signature)

    const changedFrequency = numericalState(base)
    changedFrequency.normalization.frequencyHz = 1_000
    expect(createAutoEqRunInputSignature(changedFrequency)).not.toBe(signature)

    const changedLevel = numericalState(base)
    changedLevel.normalization.levelDb = 65
    expect(createAutoEqRunInputSignature(changedLevel)).not.toBe(signature)

    const changedSettings = numericalState(base)
    changedSettings.autoeqSettings.maxFilters -= 1
    expect(createAutoEqRunInputSignature(changedSettings)).not.toBe(signature)

    const removedSelection = numericalState(base)
    removedSelection.curves = removedSelection.curves.filter(({ id }) => id !== base.activeFrId)
    expect(createAutoEqRunInputSignature(removedSelection)).toBeNull()
  })

  it.each([
    ['minFrequencyHz', DEFAULT_AUTOEQ_SETTINGS.minFrequencyHz + 1],
    ['maxFrequencyHz', DEFAULT_AUTOEQ_SETTINGS.maxFrequencyHz - 1],
    ['minGainDb', DEFAULT_AUTOEQ_SETTINGS.minGainDb + 1],
    ['maxGainDb', DEFAULT_AUTOEQ_SETTINGS.maxGainDb - 1],
    ['minQ', DEFAULT_AUTOEQ_SETTINGS.minQ + 0.1],
    ['maxQ', DEFAULT_AUTOEQ_SETTINGS.maxQ - 1],
    ['maxFilters', DEFAULT_AUTOEQ_SETTINGS.maxFilters - 1],
    ['timeLimitSeconds', 30],
  ] satisfies [keyof AutoEqSettings, number][])(
    'changes when AutoEqSettings.%s changes',
    (field, value) => {
      const base = numericalState(createReadyWorkspace().getState())
      const changed = numericalState(base)
      changed.autoeqSettings = {
        ...changed.autoeqSettings,
        [field]: value,
      } as AutoEqSettings

      expect(createAutoEqRunInputSignature(changed)).not.toBe(
        createAutoEqRunInputSignature(base),
      )
    },
  )
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
    ['normalization mode', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setNormalization({ mode: 'db', frequencyHz: 500, levelDb: 60 })
    }],
    ['normalization frequency', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setNormalization({ mode: 'hz', frequencyHz: 1_000, levelDb: 60 })
    }],
    ['normalization level', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setNormalization({ mode: 'hz', frequencyHz: 500, levelDb: 65 })
    }],
    ['settings', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setAutoEqSettings({
        ...DEFAULT_AUTOEQ_SETTINGS,
        maxFilters: DEFAULT_AUTOEQ_SETTINGS.maxFilters - 1,
      })
    }],
    ['time limit', (workspace: ReturnType<typeof createWorkspaceStore>) => {
      workspace.getState().setAutoEqSettings({
        ...DEFAULT_AUTOEQ_SETTINGS,
        timeLimitSeconds: 30,
      })
    }],
  ] as const)('discards a result after %s changes', async (_label, changeWorkspace) => {
    const { workspace, runStore, controller, runs } = setup()
    expect(workspace.getState().autoEqRun).not.toBeNull()
    const pending = controller.runAutoEq()

    changeWorkspace(workspace)
    const beforeResolution = solutionSnapshot(workspace.getState())
    runs[0]!.resolve(createAutoEqResultV2(8))
    await pending

    expect(solutionSnapshot(workspace.getState())).toEqual(beforeResolution)
    expect(runStore.getState()).toMatchObject({ status: 'idle', activeRunId: null, error: null })
  })

  it('applies a result after unrelated tab and theme changes', async () => {
    const { workspace, controller, runs } = setup()
    const uiStore = createUiStore(() => 0)
    const pending = controller.runAutoEq()

    uiStore.getState().setActiveDockTab('tools')
    uiStore.getState().setTheme('dark')
    runs[0]!.resolve(createAutoEqResultV2(5))
    await pending

    expect(workspace.getState().filters).toEqual(createAutoEqResultV2(5).filters)
  })
})
