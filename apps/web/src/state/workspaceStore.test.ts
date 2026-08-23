import type { Curve, Filter } from '@autoeq-workbench/core'
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

  it('selects filters explicitly and records manual provenance', () => {
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter(filter.id)

    expect(store.getState().filterProvenance).toBe('manual')
    expect(store.getState().solutionState).toBe('modified')
    expect(store.getState().selectedFilterId).toBe(filter.id)
  })
})
