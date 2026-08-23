import { createEvaluationGrid, type Curve, type Filter, type FilterType } from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization, deriveWorkspace } from './workspaceStore'

const source: Curve = {
  id: 'source-1',
  name: 'Source A',
  role: 'source',
  rawPoints: [
    { frequencyHz: 20, db: -2 },
    { frequencyHz: 20_000, db: 1 },
  ],
  metadata: {},
}

const target: Curve = {
  id: 'target-1',
  name: 'Target A',
  role: 'target',
  rawPoints: [
    { frequencyHz: 20, db: 0 },
    { frequencyHz: 20_000, db: 0 },
  ],
  metadata: {},
}

const filter: Filter = {
  id: 'filter-1',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 3,
  q: 1,
}

function makeFlatCurve(role: 'source' | 'target'): Curve {
  return {
    id: `${role}-flat`,
    name: `${role} flat`,
    role,
    rawPoints: [
      { frequencyHz: 20, db: 0 },
      { frequencyHz: 20_000, db: 0 },
    ],
    metadata: {},
  }
}

describe('workspace store', () => {
  let store: ReturnType<typeof createWorkspaceStore>

  beforeEach(() => {
    store = createWorkspaceStore()
  })

  it('starts with one authoritative 500 Hz / 0 dB workspace normalization', () => {
    expect(store.getState().normalization).toEqual(defaultNormalization)
  })

  it('sets Source without replacing Target and vice versa', () => {
    store.getState().setTarget(target)
    store.getState().setSource(source)
    expect(store.getState().target).toBe(target)

    const replacementTarget = { ...target, id: 'target-2', name: 'Target B' }
    store.getState().setTarget(replacementTarget)
    expect(store.getState().source).toBe(source)
    expect(store.getState().target).toBe(replacementTarget)
  })

  it('marks existing filters stale when a curve is replaced without deleting them', () => {
    store.getState().setSource(source)
    store.getState().setFilters([filter], 'autoeq')
    expect(store.getState().solutionState).toBe('clean')

    store.getState().setSource({ ...source, id: 'source-2', name: 'Source B' })

    expect(store.getState().solutionState).toBe('stale')
    expect(store.getState().filters).toEqual([filter])
  })

  it.each(['Source', 'Target'] as const)(
    'clears redo and keeps the replacement %s curve outside history snapshots',
    (role) => {
      const setter = role === 'Source' ? store.getState().setSource : store.getState().setTarget
      const curve = role === 'Source' ? source : target
      setter(curve)
      store.getState().setFilters([filter], 'autoeq')
      store.getState().updateFilter(filter.id, { gainDb: 4 })
      store.getState().undo()
      expect(store.getState().solutionState).toBe('clean')
      expect(store.getState().canRedo).toBe(true)

      const replacement = { ...curve, id: `${curve.id}-replacement` }
      setter(replacement)

      expect(role === 'Source' ? store.getState().source : store.getState().target).toBe(replacement)
      expect(store.getState().solutionState).toBe('stale')
      expect(store.getState().canRedo).toBe(false)
      store.getState().redo()
      expect(store.getState().solutionState).toBe('stale')
      expect(role === 'Source' ? store.getState().source : store.getState().target).toBe(replacement)

      store.getState().undo()
      expect(role === 'Source' ? store.getState().source : store.getState().target).toBe(replacement)
    },
  )

  it('commits one global normalization and rejects invalid or unchanged edits', () => {
    store.getState().setNormalization({ anchorHz: 800, targetDb: 0.5 })
    expect(store.getState().normalization).toEqual({ anchorHz: 800, targetDb: 0.5 })

    store.getState().setNormalization({ anchorHz: 0, targetDb: 2 })
    store.getState().setNormalization({ anchorHz: 800, targetDb: 0.5 })
    expect(store.getState().normalization).toEqual({ anchorHz: 800, targetDb: 0.5 })
  })

  it('marks AutoEQ filters stale after normalization and restores state on undo', () => {
    store.getState().setFilters([filter], 'autoeq')

    store.getState().setNormalization({ anchorHz: 800, targetDb: 1 })
    expect(store.getState().solutionState).toBe('stale')
    expect(store.getState().filterProvenance).toBe('autoeq')

    store.getState().undo()
    expect(store.getState().normalization).toEqual(defaultNormalization)
    expect(store.getState().solutionState).toBe('clean')
    expect(store.getState().filterProvenance).toBe('autoeq')
  })

  it('treats an initial manual filter set as a clean manual workspace', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter(filter.id)

    expect(store.getState().filterProvenance).toBe('manual')
    expect(store.getState().solutionState).toBe('clean')
    expect(store.getState().selectedFilterId).toBe(filter.id)
  })

  it('preserves AutoEQ provenance and solution state across manual filter replacements', () => {
    const replacement = [{ ...filter, gainDb: 4 }]

    store.getState().setFilters([filter], 'autoeq')
    store.getState().setFilters(replacement, 'manual')
    expect(store.getState().filters).toEqual(replacement)
    expect(store.getState().filterProvenance).toBe('autoeq')
    expect(store.getState().solutionState).toBe('modified')

    store.getState().setSource(source)
    store.getState().setSource({ ...source, id: 'source-2' })
    expect(store.getState().solutionState).toBe('stale')
    store.getState().setFilters([filter], 'manual')
    expect(store.getState().filterProvenance).toBe('autoeq')
    expect(store.getState().solutionState).toBe('stale')

    store.getState().setFilters(replacement, 'autoeq')
    expect(store.getState().filterProvenance).toBe('autoeq')
    expect(store.getState().solutionState).toBe('clean')
  })

  it.each([
    ['PK', 1_000, 1],
    ['LS', 105, 0.7],
    ['HS', 10_000, 0.7],
  ] satisfies [FilterType, number, number][])('adds a default %s filter', (type, frequencyHz, q) => {
    store.getState().addFilter(type)

    expect(store.getState().filters).toEqual([
      expect.objectContaining({ enabled: true, type, frequencyHz, gainDb: 0, q }),
    ])
    expect(store.getState().selectedFilterId).toBe(store.getState().filters[0]?.id)
    expect(store.getState().filterProvenance).toBe('manual')
  })

  it('duplicates with a unique ID, reorders, toggles, removes, and keeps selection valid', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().duplicateFilter(filter.id)
    const [original, duplicate] = store.getState().filters

    expect(duplicate).toMatchObject({ ...filter, id: expect.any(String) })
    expect(duplicate?.id).not.toBe(original?.id)
    expect(store.getState().selectedFilterId).toBe(duplicate?.id)

    store.getState().reorderFilter(duplicate!.id, 'up')
    expect(store.getState().filters.map(({ id }) => id)).toEqual([duplicate?.id, filter.id])
    store.getState().toggleFilter(duplicate!.id)
    expect(store.getState().filters[0]?.enabled).toBe(false)
    store.getState().removeFilter(duplicate!.id)
    expect(store.getState().filters).toEqual([filter])
    expect(store.getState().selectedFilterId).toBe(filter.id)
    store.getState().removeFilter(filter.id)
    expect(store.getState().selectedFilterId).toBeNull()
  })

  it('accepts bounded edits atomically and rejects invalid DSP values without changing state', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().updateFilter(filter.id, {
      frequencyHz: 20,
      gainDb: -15,
      q: 12,
    })
    expect(store.getState().filters[0]).toMatchObject({ frequencyHz: 20, gainDb: -15, q: 12 })

    const valid = store.getState().filters[0]
    for (const invalid of [
      { frequencyHz: 0 },
      { frequencyHz: 20_001 },
      { gainDb: 15.1 },
      { gainDb: Number.NaN },
      { q: 0 },
      { q: 12.1 },
      { q: Number.POSITIVE_INFINITY },
    ]) {
      store.getState().updateFilter(filter.id, invalid)
      expect(store.getState().filters[0]).toEqual(valid)
    }
  })

  it('limits filters to 64', () => {
    for (let index = 0; index < 65; index += 1) store.getState().addFilter('PK')
    expect(store.getState().filters).toHaveLength(64)
    store.getState().duplicateFilter(store.getState().filters[0]!.id)
    expect(store.getState().filters).toHaveLength(64)
  })

  it('marks AutoEQ filters modified after manual edits but never relabels stale filters', () => {
    store.getState().setFilters([filter], 'autoeq')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    expect(store.getState().solutionState).toBe('modified')

    store.getState().setSource(source)
    store.getState().setSource({ ...source, id: 'source-2' })
    expect(store.getState().solutionState).toBe('stale')
    store.getState().toggleFilter(filter.id)
    expect(store.getState().solutionState).toBe('stale')
  })

  it('undoes and redoes normalization and filter snapshots', () => {
    store.getState().setFilters([filter], 'autoeq')
    store.getState().selectFilter(filter.id)
    store.getState().setNormalization({ anchorHz: 1_000, targetDb: -2 })
    store.getState().updateFilter(filter.id, { gainDb: 6 })

    expect(store.getState().canUndo).toBe(true)
    store.getState().undo()
    expect(store.getState().filters[0]?.gainDb).toBe(3)
    expect(store.getState().solutionState).toBe('stale')
    expect(store.getState().filterProvenance).toBe('autoeq')
    expect(store.getState().selectedFilterId).toBe(filter.id)

    store.getState().undo()
    expect(store.getState().normalization).toEqual(defaultNormalization)
    expect(store.getState().canRedo).toBe(true)
    store.getState().redo()
    store.getState().redo()
    expect(store.getState().normalization).toEqual({ anchorHz: 1_000, targetDb: -2 })
    expect(store.getState().filters[0]?.gainDb).toBe(6)
    expect(store.getState().solutionState).toBe('stale')
    expect(store.getState().canRedo).toBe(false)
  })

  it('restores a valid selection after removing, undoing, and redoing a filter', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().addFilter('LS')
    const selected = store.getState().selectedFilterId
    store.getState().removeFilter(selected!)
    expect(store.getState().selectedFilterId).toBe(filter.id)
    store.getState().undo()
    expect(store.getState().selectedFilterId).toBe(selected)
    store.getState().redo()
    expect(store.getState().selectedFilterId).toBe(filter.id)
  })

  it('does not record rejected edits and clears redo after a new edit', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    store.getState().undo()
    expect(store.getState().canRedo).toBe(true)

    store.getState().updateFilter(filter.id, { gainDb: Number.NaN })
    expect(store.getState().canRedo).toBe(true)
    store.getState().toggleFilter(filter.id)
    expect(store.getState().canRedo).toBe(false)
  })

  it('records a global normalization commit as one meaningful history item', () => {
    store.getState().setNormalization({ anchorHz: 800, targetDb: 1 })
    store.getState().undo()
    expect(store.getState().normalization).toEqual(defaultNormalization)
    expect(store.getState().canUndo).toBe(false)
  })

  it('preserves normalization redo branching and source replacement semantics', () => {
    store.getState().setSource(source)
    store.getState().setNormalization({ anchorHz: 800, targetDb: 1 })
    store.getState().undo()
    expect(store.getState().canRedo).toBe(true)

    const replacement = { ...source, id: 'source-replacement' }
    store.getState().setSource(replacement)

    expect(store.getState().source).toBe(replacement)
    expect(store.getState().canRedo).toBe(false)
    store.getState().redo()
    expect(store.getState().normalization).toEqual(defaultNormalization)
    expect(store.getState().source).toBe(replacement)
  })

  it('derives PEQ and preamp without Source or Target', () => {
    store.getState().addFilter('PK')
    const addedFilter = store.getState().filters[0]!
    store.getState().updateFilter(addedFilter.id, { gainDb: 6 })

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('incomplete')
    expect(derived.peq?.frequencies).toEqual(createEvaluationGrid())
    expect(derived.preamp?.preampDb).toBeLessThanOrEqual(-6)
    expect(derived.sourceEq).toBeNull()
    expect(derived.desired).toBeNull()
    expect(derived.metrics).toBeNull()
  })

  it('derives Source + EQ with Source alone and waits for Target before comparison outputs', () => {
    store.getState().setSource(makeFlatCurve('source'))
    store.getState().addFilter('PK')
    const addedFilter = store.getState().filters[0]!
    store.getState().updateFilter(addedFilter.id, { gainDb: 3 })

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('incomplete')
    expect(derived.source).not.toBeNull()
    expect(derived.sourceEq?.frequencies).toEqual(createEvaluationGrid())
    expect(derived.peq).not.toBeNull()
    expect(derived.preamp).not.toBeNull()
    expect(derived.desired).toBeNull()
    expect(derived.metrics).toBeNull()
  })

  it('prepares Target alone while leaving Source-dependent and comparison outputs unavailable', () => {
    store.getState().setTarget(makeFlatCurve('target'))

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('incomplete')
    expect(derived.source).toBeNull()
    expect(derived.target).not.toBeNull()
    expect(derived.peq?.db.every((value) => value === 0)).toBe(true)
    expect(derived.preamp?.preampDb).toBe(0)
    expect(derived.sourceEq).toBeNull()
    expect(derived.desired).toBeNull()
    expect(derived.metrics).toBeNull()
  })

  it('uses the canonical evaluation grid for full Source and Target comparison', () => {
    store.getState().setSource(makeFlatCurve('source'))
    store.getState().setTarget(makeFlatCurve('target'))

    const derived = deriveWorkspace(store.getState())
    const frequencies = createEvaluationGrid()

    expect(derived.status).toBe('ready')
    expect(derived.source?.frequencies).toEqual(frequencies)
    expect(derived.target?.frequencies).toEqual(frequencies)
    expect(derived.peq?.frequencies).toEqual(frequencies)
    expect(derived.sourceEq?.frequencies).toEqual(frequencies)
    expect(derived.desired?.frequencies).toEqual(frequencies)
    expect(derived.metrics).not.toBeNull()
  })

  it('prepares Source and Target with the same global normalization', () => {
    store.getState().setSource(makeFlatCurve('source'))
    store.getState().setTarget({
      ...makeFlatCurve('target'),
      rawPoints: [
        { frequencyHz: 20, db: 8 },
        { frequencyHz: 20_000, db: 8 },
      ],
    })
    store.getState().setNormalization({ anchorHz: 1_000, targetDb: 3 })

    const derived = deriveWorkspace(store.getState())

    expect(derived.source?.db.every((db) => Math.abs(db - 3) < 1e-10)).toBe(true)
    expect(derived.target?.db.every((db) => Math.abs(db - 3) < 1e-10)).toBe(true)
  })

  it('isolates a present curve coverage error from PEQ, preamp, and valid Source derivation', () => {
    store.getState().setSource(makeFlatCurve('source'))
    store.getState().setTarget({
      ...makeFlatCurve('target'),
      rawPoints: [
        { frequencyHz: 100, db: 0 },
        { frequencyHz: 10_000, db: 0 },
      ],
    })
    store.getState().setFilters([filter], 'manual')

    const derived = deriveWorkspace(store.getState())

    expect(derived.status).toBe('coverage-error')
    expect(derived.peq).not.toBeNull()
    expect(derived.preamp).not.toBeNull()
    expect(derived.sourceEq).not.toBeNull()
    expect(derived.desired).toBeNull()
    expect(derived.metrics).toBeNull()
  })

  it('does not mutate raw curve inputs while deriving normalized responses', () => {
    const sourceCurve = makeFlatCurve('source')
    const targetCurve = makeFlatCurve('target')
    const sourceRawPoints = structuredClone(sourceCurve.rawPoints)
    const targetRawPoints = structuredClone(targetCurve.rawPoints)
    store.getState().setSource(sourceCurve)
    store.getState().setTarget(targetCurve)
    store.getState().setNormalization({ anchorHz: 500, targetDb: 4 })

    deriveWorkspace(store.getState())

    expect(sourceCurve.rawPoints).toEqual(sourceRawPoints)
    expect(targetCurve.rawPoints).toEqual(targetRawPoints)
  })
})
