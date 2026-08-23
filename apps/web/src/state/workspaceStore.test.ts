import { createEvaluationGrid, type Curve, type Filter } from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization, deriveWorkspace } from './workspaceStore'

const source: Curve = {
  id: 'source-1',
  name: 'Source A',
  kind: 'fr',
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
  kind: 'target',
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

  it('starts with one authoritative normalization, no curves, and no active pair', () => {
    expect(store.getState()).toMatchObject({
      curves: [],
      activeFrId: null,
      activeTargetId: null,
      normalization: defaultNormalization,
    })
  })

  it('stores core Curves and activates only the first curve of each kind', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)

    expect(store.getState()).toMatchObject({
      curves: [source, target, extra],
      activeFrId: source.id,
      activeTargetId: target.id,
    })
  })

  it('rejects a duplicate curve ID without changing active selection', () => {
    expect(store.getState().addCurve(source)).toBe(true)
    expect(store.getState().addCurve({ ...source, name: 'Duplicate' })).toBe(false)
    expect(store.getState()).toMatchObject({ curves: [source], activeFrId: source.id })
  })

  it('accepts null or existing matching-kind active IDs and ignores invalid requests', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)

    store.getState().setActiveFr(extra.id)
    store.getState().setActiveTarget(source.id)
    store.getState().setActiveFr(target.id)
    store.getState().setActiveTarget('missing')
    expect(store.getState()).toMatchObject({ activeFrId: extra.id, activeTargetId: target.id })

    store.getState().setActiveFr(null)
    store.getState().setActiveTarget(null)
    expect(store.getState()).toMatchObject({ activeFrId: null, activeTargetId: null })
  })

  it('renames and removes curves without mutating the imported curve object', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().renameCurve(source.id, '  Renamed source  ')
    store.getState().removeCurve(target.id)

    expect(store.getState().curves).toEqual([{ ...source, name: 'Renamed source' }])
    expect(store.getState()).toMatchObject({ activeFrId: source.id, activeTargetId: null })
    expect(source.name).toBe('Source A')
  })

  it('falls back to the first remaining same-kind curve only when removing an active curve', () => {
    const otherTarget = { ...target, id: 'target-2' }
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().addCurve(otherTarget)

    store.getState().removeCurve(otherTarget.id)
    expect(store.getState()).toMatchObject({ activeFrId: source.id, activeTargetId: target.id })
    store.getState().removeCurve(source.id)
    expect(store.getState()).toMatchObject({ activeFrId: extra.id, activeTargetId: target.id })
    store.getState().removeCurve(target.id)
    expect(store.getState()).toMatchObject({ activeFrId: extra.id, activeTargetId: null })
  })

  it('stales preserved AutoEQ filters only when selected input IDs change', () => {
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    store.getState().setFilters([filter], 'autoeq')

    store.getState().renameCurve(extra.id, 'FR renamed')
    expect(store.getState().solutionState).toBe('clean')

    store.getState().renameCurve(source.id, 'Source renamed')
    store.getState().renameCurve(target.id, 'Target renamed')
    expect(store.getState().solutionState).toBe('clean')

    store.getState().setActiveFr(extra.id)
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
    expect(store.getState().curves[0]?.name).toBe('Renamed')
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

    store.getState().setActiveFr(extra.id)
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

    store.getState().setActiveFr(extra.id)
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
    store.getState().setActiveFr(extra.id)

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
    changedStore.getState().setActiveFr(extra.id)
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
    expect(derived.frEq).toBeNull()
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

  it('uses only active FR and Target for canonical comparison outputs', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(extra)
    const before = deriveWorkspace(store.getState()).desired?.db

    store.getState().renameCurve(extra.id, 'Irrelevant overlay')
    const after = deriveWorkspace(store.getState())

    expect(after.status).toBe('ready')
    expect(after.fr?.frequencies).toEqual(createEvaluationGrid())
    expect(after.target?.frequencies).toEqual(createEvaluationGrid())
    expect(after.desired?.db).toEqual(before)
    expect(after.metrics).not.toBeNull()
  })

  it('supports partial derivation from FR or Target alone', () => {
    const sourceStore = createWorkspaceStore()
    sourceStore.getState().addCurve(source)
    sourceStore.getState().setFilters([filter], 'manual')
    const sourceOnly = deriveWorkspace(sourceStore.getState())
    expect(sourceOnly.frEq).not.toBeNull()
    expect(sourceOnly.desired).toBeNull()

    const targetStore = createWorkspaceStore()
    targetStore.getState().addCurve(target)
    const targetOnly = deriveWorkspace(targetStore.getState())
    expect(targetOnly.target).not.toBeNull()
    expect(targetOnly.frEq).toBeNull()
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
    expect(derived.frEq).not.toBeNull()
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
    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('ready')
    expect(derived.metrics).not.toBeNull()
    expect(derived.measurementCurves.map(({ id }) => id)).toEqual([source.id, target.id])
    expect(derived.message).toMatch(/FR.*High-frequency reference/i)
  })

  it('warns for an invalid inactive Target while deriving only the active pair', () => {
    const store = createWorkspaceStore()
    const invalidTarget: Curve = {
      ...target,
      id: 'target-invalid',
      name: 'Narrow target',
      rawPoints: target.rawPoints.filter(({ frequencyHz }) => frequencyHz >= 1_000),
    }
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().addCurve(invalidTarget)

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('ready')
    expect(derived.measurementCurves.map(({ id, kind }) => [id, kind])).toEqual([
      [source.id, 'fr'],
      [target.id, 'target'],
    ])
    expect(derived.message).toMatch(/Target.*Narrow target/i)
  })
})
