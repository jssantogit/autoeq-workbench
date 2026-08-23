import type { Curve, Filter, FilterType } from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkspaceStore, defaultNormalization } from './workspaceStore'

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

describe('workspace store', () => {
  let store: ReturnType<typeof createWorkspaceStore>

  beforeEach(() => {
    store = createWorkspaceStore()
  })

  it('starts with independent 500 Hz / 0 dB normalization defaults', () => {
    expect(store.getState().sourceNormalization).toEqual(defaultNormalization)
    expect(store.getState().targetNormalization).toEqual(defaultNormalization)
    expect(store.getState().sourceNormalization).not.toBe(
      store.getState().targetNormalization,
    )
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

  it('applies normalization independently or together', () => {
    store.getState().setSourceNormalization({ anchorHz: 1_000, targetDb: -1 })
    expect(store.getState().targetNormalization).toEqual(defaultNormalization)

    store.getState().setTargetNormalization({ anchorHz: 2_000, targetDb: 2 })
    expect(store.getState().sourceNormalization).toEqual({ anchorHz: 1_000, targetDb: -1 })

    store.getState().normalizeTogether({ anchorHz: 800, targetDb: 0.5 })
    expect(store.getState().sourceNormalization).toEqual({ anchorHz: 800, targetDb: 0.5 })
    expect(store.getState().targetNormalization).toEqual({ anchorHz: 800, targetDb: 0.5 })
    expect(store.getState().sourceNormalization).not.toBe(
      store.getState().targetNormalization,
    )
  })

  it('treats an initial manual filter set as a clean manual workspace', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter(filter.id)

    expect(store.getState().filterProvenance).toBe('manual')
    expect(store.getState().solutionState).toBe('clean')
    expect(store.getState().selectedFilterId).toBe(filter.id)
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
    store.getState().setSourceNormalization({ anchorHz: 1_000, targetDb: -2 })
    store.getState().updateFilter(filter.id, { gainDb: 6 })

    expect(store.getState().canUndo).toBe(true)
    store.getState().undo()
    expect(store.getState().filters[0]?.gainDb).toBe(3)
    expect(store.getState().solutionState).toBe('clean')
    expect(store.getState().filterProvenance).toBe('autoeq')
    expect(store.getState().selectedFilterId).toBe(filter.id)

    store.getState().undo()
    expect(store.getState().sourceNormalization).toEqual(defaultNormalization)
    expect(store.getState().canRedo).toBe(true)
    store.getState().redo()
    store.getState().redo()
    expect(store.getState().sourceNormalization).toEqual({ anchorHz: 1_000, targetDb: -2 })
    expect(store.getState().filters[0]?.gainDb).toBe(6)
    expect(store.getState().solutionState).toBe('modified')
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

  it('records normalize-together as one meaningful history item', () => {
    store.getState().normalizeTogether({ anchorHz: 800, targetDb: 1 })
    store.getState().undo()
    expect(store.getState().sourceNormalization).toEqual(defaultNormalization)
    expect(store.getState().targetNormalization).toEqual(defaultNormalization)
    expect(store.getState().canUndo).toBe(false)
  })
})
