import { createEvaluationGrid, type Curve, type Filter } from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization, deriveWorkspace } from './workspaceStore'

const source: Curve = {
  id: 'source-1',
  name: 'Source A',
  role: 'comparison',
  rawPoints: [
    { frequencyHz: 20, db: -2 },
    { frequencyHz: 500, db: 0 },
    { frequencyHz: 20_000, db: 1 },
  ],
  metadata: {},
}

const target: Curve = {
  id: 'target-1',
  name: 'Target A',
  role: 'comparison',
  rawPoints: [
    { frequencyHz: 20, db: 2 },
    { frequencyHz: 500, db: 8 },
    { frequencyHz: 20_000, db: 3 },
  ],
  metadata: {},
}

const extra: Curve = {
  ...source,
  id: 'extra-1',
  name: 'Extra overlay',
  rawPoints: source.rawPoints.map((point) => ({ ...point, db: point.db + 4 })),
}

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 3,
  q: 1,
}

describe('workspace curve collection', () => {
  let store: ReturnType<typeof createWorkspaceStore>

  beforeEach(() => {
    store = createWorkspaceStore()
  })

  it('starts with one authoritative normalization and no curves', () => {
    expect(store.getState()).toMatchObject({ curves: [], normalization: defaultNormalization })
  })

  it('stores N curves and auto-assigns only the first Source and second Target', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)

    expect(store.getState().curves).toEqual([
      { curve: source, role: 'source' },
      { curve: target, role: 'target' },
      { curve: extra, role: null },
    ])
  })

  it('keeps Source and Target unique while allowing multiple references', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)

    store.getState().setCurveRole(extra.id, 'source')
    store.getState().setCurveRole(target.id, 'reference')
    store.getState().setCurveRole(source.id, 'reference')

    expect(store.getState().curves.map(({ curve, role }) => [curve.id, role])).toEqual([
      [source.id, 'reference'],
      [target.id, 'reference'],
      [extra.id, 'source'],
    ])
  })

  it('renames and removes curves without mutating the imported curve object', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().renameCurve(source.id, '  Renamed source  ')
    store.getState().removeCurve(target.id)

    expect(store.getState().curves).toEqual([
      { curve: { ...source, name: 'Renamed source' }, role: 'source' },
    ])
    expect(source.name).toBe('Source A')
  })

  it('stales preserved AutoEQ filters only when selected input IDs change', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setFilters([filter], 'autoeq')

    store.getState().renameCurve(extra.id, 'Comparison renamed')
    store.getState().setCurveRole(extra.id, 'reference')
    expect(store.getState().solutionState).toBe('clean')

    store.getState().renameCurve(source.id, 'Source renamed')
    store.getState().renameCurve(target.id, 'Target renamed')
    expect(store.getState().solutionState).toBe('clean')

    store.getState().setCurveRole(extra.id, 'source')
    expect(store.getState().solutionState).toBe('stale')
    expect(store.getState().filters).toEqual([filter])
  })

  it('stales AutoEQ filters on selected removal and leaves curve changes outside undo history', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().setFilters([filter], 'autoeq')
    store.getState().setNormalization({ anchorHz: 800, targetDb: 1 })
    store.getState().undo()
    expect(store.getState().canRedo).toBe(true)

    store.getState().renameCurve(source.id, 'Renamed')
    expect(store.getState()).toMatchObject({ canRedo: false, solutionState: 'clean' })
    store.getState().undo()
    expect(store.getState().curves[0]?.curve.name).toBe('Renamed')
    expect(store.getState().filters).toEqual([])

    store.getState().setFilters([filter], 'autoeq')
    store.getState().removeCurve(target.id)
    expect(store.getState().filters).toEqual([filter])
    expect(store.getState().solutionState).toBe('stale')
  })

  it('does not stale wholly manual filters when selected inputs change or are removed', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setFilters([filter], 'manual')

    store.getState().setCurveRole(extra.id, 'source')
    expect(store.getState().solutionState).toBe('clean')
    store.getState().removeCurve(target.id)
    expect(store.getState().solutionState).toBe('clean')
  })

  it('stales modified AutoEQ filters when selected inputs change', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setFilters([filter], 'autoeq')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    expect(store.getState()).toMatchObject({ filterProvenance: 'autoeq', solutionState: 'modified' })

    store.getState().setCurveRole(extra.id, 'source')
    expect(store.getState().solutionState).toBe('stale')
  })
})

describe('workspace history and filters', () => {
  it('keeps normalization and filter undo/redo independent from curve collection', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'autoeq')
    store.getState().setNormalization({ anchorHz: 1_000, targetDb: -2 })
    store.getState().updateFilter(filter.id, { gainDb: 6 })

    store.getState().undo()
    expect(store.getState().filters[0]?.gainDb).toBe(3)
    store.getState().undo()
    expect(store.getState().normalization).toEqual(defaultNormalization)
    store.getState().redo()
    store.getState().redo()
    expect(store.getState().normalization).toEqual({ anchorHz: 1_000, targetDb: -2 })
    expect(store.getState().filters[0]?.gainDb).toBe(6)
  })

  it('preserves manual filter operations and valid selection', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    store.getState().duplicateFilter(filter.id)
    const duplicate = store.getState().filters[1]!
    store.getState().reorderFilter(duplicate.id, 'up')
    store.getState().toggleFilter(duplicate.id)
    store.getState().removeFilter(duplicate.id)

    expect(store.getState().filters).toEqual([filter])
    expect(store.getState().selectedFilterId).toBe(filter.id)
  })

  it('rejects invalid normalization and DSP edits', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    store.getState().setNormalization({ anchorHz: 0, targetDb: 2 })
    store.getState().updateFilter(filter.id, { gainDb: Number.NaN })

    expect(store.getState().normalization).toEqual(defaultNormalization)
    expect(store.getState().filters).toEqual([filter])
  })

  it('keeps restored AutoEQ state stale when selected input IDs changed outside history', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setFilters([filter], 'autoeq')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    store.getState().setCurveRole(extra.id, 'source')

    store.getState().undo()
    expect(store.getState()).toMatchObject({ solutionState: 'stale', filters: [filter] })
  })

  it('validates selected input IDs when undoing normalization-only history', () => {
    const matchingStore = createWorkspaceStore()
    matchingStore.getState().addCurve(source)
    matchingStore.getState().addCurve(target)
    matchingStore.getState().setFilters([filter], 'autoeq')
    matchingStore.getState().setNormalization({ anchorHz: 1_000, targetDb: -2 })
    matchingStore.getState().undo()
    expect(matchingStore.getState()).toMatchObject({
      normalization: defaultNormalization,
      solutionState: 'clean',
    })

    const changedStore = createWorkspaceStore()
    changedStore.getState().addCurve(source)
    changedStore.getState().addCurve(target)
    changedStore.getState().addCurve(extra)
    changedStore.getState().setFilters([filter], 'autoeq')
    changedStore.getState().setNormalization({ anchorHz: 1_000, targetDb: -2 })
    changedStore.getState().setCurveRole(extra.id, 'source')
    changedStore.getState().undo()
    expect(changedStore.getState()).toMatchObject({
      normalization: defaultNormalization,
      solutionState: 'stale',
    })
  })
})

describe('deriveWorkspace', () => {
  it('derives PEQ and preamp independently with no selected curves', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('incomplete')
    expect(derived.peq?.frequencies).toEqual(createEvaluationGrid())
    expect(derived.preamp?.preampDb).toBeLessThanOrEqual(-3)
    expect(derived.sourceEq).toBeNull()
    expect(derived.desired).toBeNull()
    expect(derived.metrics).toBeNull()
  })

  it('normalizes every imported curve globally without mutating raw points', () => {
    const store = createWorkspaceStore()
    const snapshots = [source, target, extra].map(({ rawPoints }) => structuredClone(rawPoints))
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setNormalization({ anchorHz: 500, targetDb: 3 })

    const derived = deriveWorkspace(store.getState())

    expect(derived.measurementCurves).toHaveLength(3)
    expect(derived.measurementCurves.every(({ db }) => Math.abs(db[1]! - 3) < 1e-10)).toBe(true)
    expect([source, target, extra].map(({ rawPoints }) => rawPoints)).toEqual(snapshots)
  })

  it('uses only assigned Source and Target for canonical comparison outputs', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    const before = deriveWorkspace(store.getState()).desired?.db

    store.getState().renameCurve(extra.id, 'Irrelevant overlay')
    const after = deriveWorkspace(store.getState())

    expect(after.status).toBe('ready')
    expect(after.source?.frequencies).toEqual(createEvaluationGrid())
    expect(after.target?.frequencies).toEqual(createEvaluationGrid())
    expect(after.desired?.db).toEqual(before)
    expect(after.metrics).not.toBeNull()
  })

  it('supports partial derivation from Source or Target alone', () => {
    const sourceStore = createWorkspaceStore()
    sourceStore.getState().addCurve(source)
    sourceStore.getState().setFilters([filter], 'manual')
    const sourceOnly = deriveWorkspace(sourceStore.getState())
    expect(sourceOnly.sourceEq).not.toBeNull()
    expect(sourceOnly.desired).toBeNull()

    const targetStore = createWorkspaceStore()
    targetStore.getState().addCurve(target)
    targetStore.getState().setCurveRole(target.id, 'target')
    const targetOnly = deriveWorkspace(targetStore.getState())
    expect(targetOnly.target).not.toBeNull()
    expect(targetOnly.sourceEq).toBeNull()
  })

  it('names the failing role and curve while preserving independent PEQ/preamp', () => {
    const store = createWorkspaceStore()
    const shortTarget = {
      ...target,
      name: 'Short target',
      rawPoints: target.rawPoints.filter(({ frequencyHz }) => frequencyHz !== 20),
    }
    store.getState().addCurve(source)
    store.getState().addCurve(shortTarget)
    store.getState().setFilters([filter], 'manual')

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('coverage-error')
    expect(derived.message).toMatch(/Target.*Short target.*20 Hz.*20 kHz/i)
    expect(derived.sourceEq).not.toBeNull()
    expect(derived.peq).not.toBeNull()
    expect(derived.preamp).not.toBeNull()
    expect(derived.desired).toBeNull()
  })

  it('omits an unnormalizable auxiliary curve without blocking Source/Target metrics', () => {
    const store = createWorkspaceStore()
    const invalidReference: Curve = {
      ...extra,
      id: 'reference-invalid',
      name: 'High-frequency reference',
      rawPoints: extra.rawPoints.filter(({ frequencyHz }) => frequencyHz >= 1_000),
    }
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(invalidReference)
    store.getState().setCurveRole(invalidReference.id, 'reference')

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('ready')
    expect(derived.metrics).not.toBeNull()
    expect(derived.measurementCurves.map(({ id }) => id)).toEqual([source.id, target.id])
    expect(derived.message).toMatch(/Reference Target.*High-frequency reference/i)
  })
})
