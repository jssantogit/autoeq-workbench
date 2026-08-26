import {
  AUTOEQ_PRODUCT_LIMITS,
  createEvaluationGrid,
  DEFAULT_AUTOEQ_SETTINGS,
  type AutoEqSettings,
  type Curve,
  type Filter,
  type FilterDefinition,
} from '@autoeq-workbench/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAutoEqResult } from '../test/autoEqFixture'
import {
  createWorkspaceStore,
  defaultNormalization,
  deriveWorkspace,
  type FilterSnapshotState,
} from './workspaceStore'

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
      autoEqRun: null,
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
  it('applies an isolated AutoEQ result atomically in one undoable history step', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter(filter.id)
    const result = createAutoEqResult(4)
    const expectedManifest = structuredClone(result.manifest)

    expect(store.getState().applyAutoEqResult(result)).toBe(true)

    expect(store.getState()).toMatchObject({
      filters: result.filters,
      selectedFilterId: null,
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: expectedManifest },
    })
    expect(store.getState().filters).not.toBe(result.filters)
    expect(store.getState().autoEqRun!.manifest).not.toBe(result.manifest)
    expect(store.getState().autoEqRun!.manifest.finalFilters).not.toBe(result.manifest.finalFilters)

    result.filters[0]!.gainDb = 9
    result.manifest.finalFilters[0]!.gainDb = 9
    result.manifest.algorithmParameters.deadbandDb = 9
    expect(store.getState().filters[0]!.gainDb).toBe(4)
    expect(store.getState().autoEqRun!.manifest).toEqual(expectedManifest)

    store.getState().undo()
    expect(store.getState()).toMatchObject({
      filters: [filter],
      selectedFilterId: filter.id,
      filterProvenance: 'manual',
      solutionState: 'clean',
      autoEqRun: null,
    })
    store.getState().redo()
    expect(store.getState()).toMatchObject({
      filters: [{ ...filter, id: 'autoeq-1', gainDb: 4 }],
      selectedFilterId: null,
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: expectedManifest },
    })
  })

  it('preserves the AutoEQ run through modified and stale states but clears it on import', () => {
    const store = createWorkspaceStore()
    const result = createAutoEqResult()
    expect(store.getState().applyAutoEqResult(result)).toBe(true)

    store.getState().updateFilter('autoeq-1', { gainDb: 4 })
    expect(store.getState()).toMatchObject({
      filterProvenance: 'autoeq',
      solutionState: 'modified',
      autoEqRun: { manifest: result.manifest },
    })
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    expect(store.getState()).toMatchObject({
      activeFrId: source.id,
      activeTargetId: target.id,
      solutionState: 'stale',
      autoEqRun: { manifest: result.manifest },
    })
    store.getState().setNormalization({ anchorHz: 1_000, targetDb: -1 })
    store.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxGainDb: 12 })
    expect(store.getState()).toMatchObject({
      solutionState: 'stale',
      autoEqRun: { manifest: result.manifest },
    })

    store.getState().replaceFiltersFromImport([
      { enabled: true, type: 'PK', frequencyHz: 2_000, gainDb: 2, q: 1 },
    ])
    expect(store.getState()).toMatchObject({
      filterProvenance: 'manual',
      solutionState: 'clean',
      autoEqRun: null,
    })

    store.getState().undo()
    expect(store.getState()).toMatchObject({
      solutionState: 'stale',
      autoEqRun: { manifest: result.manifest },
    })
    store.getState().redo()
    expect(store.getState().autoEqRun).toBeNull()
  })

  it('rejects an inconsistent AutoEQ result atomically without adding history', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    const before = store.getState()
    const result = createAutoEqResult()
    result.manifest.finalFilters[0]!.gainDb = 9

    expect(store.getState().applyAutoEqResult(result)).toBe(false)

    expect(store.getState()).toBe(before)
    const mismatchedMetrics = createAutoEqResult()
    mismatchedMetrics.metrics.maeDb = 9
    expect(store.getState().applyAutoEqResult(mismatchedMetrics)).toBe(false)
    expect(store.getState()).toBe(before)
    const missingMetrics = createAutoEqResult()
    missingMetrics.metrics = {} as typeof missingMetrics.metrics
    expect(store.getState().applyAutoEqResult(missingMetrics)).toBe(false)
    expect(store.getState()).toBe(before)
    const missingAlgorithmParameters = createAutoEqResult()
    missingAlgorithmParameters.manifest.algorithmParameters = null as never
    expect(store.getState().applyAutoEqResult(missingAlgorithmParameters)).toBe(false)
    expect(store.getState()).toBe(before)
    const malformedFilters = createAutoEqResult()
    malformedFilters.filters = [null as never]
    expect(store.getState().applyAutoEqResult(malformedFilters)).toBe(false)
    expect(store.getState()).toBe(before)
    store.getState().undo()
    expect(store.getState().filters).toEqual([])
  })

  it('stales a successful empty AutoEQ run when its settings change', () => {
    const store = createWorkspaceStore()
    const result = createAutoEqResult()
    result.filters = []
    result.manifest.finalFilters = []

    store.getState().applyAutoEqResult(result)
    expect(store.getState()).toMatchObject({
      filters: [],
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: { manifest: result.manifest },
    })

    store.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxFilters: 8 })
    expect(store.getState()).toMatchObject({
      solutionState: 'stale',
      autoEqRun: { manifest: result.manifest },
    })
  })

  it.each(['add', 'remove', 'toggle', 'reorder'] as const)(
    'keeps the AutoEQ run and marks a clean solution modified on %s',
    (operation) => {
      const store = createWorkspaceStore()
      const result = createAutoEqResult()
      if (operation === 'reorder') {
        const second = { ...result.filters[0]!, id: 'autoeq-2', frequencyHz: 2_000 }
        result.filters.push(second)
        result.manifest.finalFilters.push({ ...second })
      }
      store.getState().applyAutoEqResult(result)

      if (operation === 'add') store.getState().addFilter('PK')
      if (operation === 'remove') store.getState().removeFilter('autoeq-1')
      if (operation === 'toggle') store.getState().toggleFilter('autoeq-1')
      if (operation === 'reorder') store.getState().reorderFilter('autoeq-2', 'up')

      expect(store.getState()).toMatchObject({
        filterProvenance: 'autoeq',
        solutionState: 'modified',
        autoEqRun: { manifest: result.manifest },
      })
    },
  )

  it('stores valid AutoEQ settings as copied undoable snapshots and rejects invalid updates', () => {
    const store = createWorkspaceStore()
    const settings: AutoEqSettings = { ...DEFAULT_AUTOEQ_SETTINGS, minFrequencyHz: 30, maxQ: 10 }

    expect(store.getState().autoeqSettings).toEqual(DEFAULT_AUTOEQ_SETTINGS)
    expect(store.getState().autoeqSettings).not.toBe(DEFAULT_AUTOEQ_SETTINGS)
    store.getState().setAutoEqSettings(settings)
    expect(store.getState().autoeqSettings).toEqual(settings)
    expect(store.getState().autoeqSettings).not.toBe(settings)

    settings.minFrequencyHz = 40
    expect(store.getState().autoeqSettings.minFrequencyHz).toBe(30)
    store.getState().undo()
    expect(store.getState().autoeqSettings).toEqual(DEFAULT_AUTOEQ_SETTINGS)
    expect(store.getState().autoeqSettings).not.toBe(DEFAULT_AUTOEQ_SETTINGS)
    store.getState().redo()
    expect(store.getState().autoeqSettings).toMatchObject({ minFrequencyHz: 30, maxQ: 10 })
    expect(store.getState().autoeqSettings).not.toBe(settings)

    const before = store.getState()
    store.getState().setAutoEqSettings({ ...before.autoeqSettings, minQ: before.autoeqSettings.maxQ })
    expect(store.getState()).toBe(before)
  })

  it('stales nonempty AutoEQ-provenance filters on settings changes but leaves manual filters clean', () => {
    const autoEqStore = createWorkspaceStore()
    autoEqStore.getState().setFilters([filter], 'autoeq')
    autoEqStore.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxGainDb: 12 })
    expect(autoEqStore.getState()).toMatchObject({ solutionState: 'stale', filters: [filter] })

    const manualStore = createWorkspaceStore()
    manualStore.getState().setFilters([filter], 'manual')
    manualStore.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxGainDb: 12 })
    expect(manualStore.getState()).toMatchObject({ solutionState: 'clean', filters: [filter] })

    const emptyStore = createWorkspaceStore()
    emptyStore.getState().setAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, maxGainDb: 12 })
    expect(emptyStore.getState().solutionState).toBe('clean')
  })

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

  it('sorts filters stably in one history step without changing solution metadata or selection', () => {
    const store = createWorkspaceStore()
    const filters: Filter[] = [
      { ...filter, id: 'high', frequencyHz: 2_000 },
      { ...filter, id: 'low-first', frequencyHz: 100 },
      { ...filter, id: 'low-second', frequencyHz: 100 },
      { ...filter, id: 'middle', frequencyHz: 1_000 },
    ]
    store.getState().setFilters(filters, 'autoeq')
    store.getState().updateFilter('middle', { gainDb: 4 })
    store.getState().selectFilter('low-second')
    const beforeSort = store.getState()

    store.getState().sortFiltersByFrequency()

    expect(store.getState().filters.map(({ id }) => id)).toEqual([
      'low-first',
      'low-second',
      'middle',
      'high',
    ])
    expect(store.getState()).toMatchObject({
      filterProvenance: 'autoeq',
      solutionState: 'modified',
      selectedFilterId: 'low-second',
    })

    store.getState().undo()
    expect(store.getState()).toMatchObject({
      filters: beforeSort.filters,
      filterProvenance: beforeSort.filterProvenance,
      solutionState: beforeSort.solutionState,
      selectedFilterId: beforeSort.selectedFilterId,
    })
    store.getState().undo()
    expect(store.getState().filters.find(({ id }) => id === 'middle')?.gainDb).toBe(3)
    store.getState().redo()
    store.getState().redo()
    expect(store.getState().filters.map(({ id }) => id)).toEqual([
      'low-first',
      'low-second',
      'middle',
      'high',
    ])
  })

  it('does not record history when filters are already frequency-sorted', () => {
    const store = createWorkspaceStore()
    const sorted = [
      { ...filter, id: 'low', frequencyHz: 100 },
      { ...filter, id: 'high', frequencyHz: 2_000 },
    ]
    store.getState().setFilters(sorted, 'manual')
    const beforeSort = store.getState()

    store.getState().sortFiltersByFrequency()

    expect(store.getState()).toBe(beforeSort)
    store.getState().undo()
    expect(store.getState().filters).toEqual([])
  })

  it('atomically imports filter definitions with fresh IDs in one history step', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'autoeq')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    store.getState().selectFilter(filter.id)
    const beforeImport = store.getState()
    const imported: FilterDefinition[] = [
      { enabled: false, type: 'LS', frequencyHz: 105, gainDb: -2.5, q: 0.7 },
      { enabled: true, type: 'PK', frequencyHz: 2_500, gainDb: 6, q: 3.25 },
    ]

    store.getState().replaceFiltersFromImport(imported)

    const afterImport = store.getState()
    expect(afterImport.filters.map(({ id: _id, ...definition }) => definition)).toEqual(imported)
    expect(new Set(afterImport.filters.map(({ id }) => id)).size).toBe(imported.length)
    expect(afterImport.filters.every(({ id }) => id.startsWith('filter-'))).toBe(true)
    expect(afterImport.filters.some(({ id }) => id === filter.id)).toBe(false)
    expect(afterImport).toMatchObject({
      filterProvenance: 'manual',
      solutionState: 'clean',
      selectedFilterId: null,
    })

    store.getState().undo()
    expect(store.getState()).toMatchObject({
      filters: beforeImport.filters,
      filterProvenance: beforeImport.filterProvenance,
      solutionState: beforeImport.solutionState,
      selectedFilterId: beforeImport.selectedFilterId,
    })
    store.getState().undo()
    expect(store.getState().filters).toEqual([filter])
    store.getState().redo()
    store.getState().redo()
    expect(store.getState()).toMatchObject({
      filters: afterImport.filters,
      filterProvenance: 'manual',
      solutionState: 'clean',
      selectedFilterId: null,
    })
  })

  it('applies a copied filter snapshot in one undoable history step and redoes it deterministically', () => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'autoeq')
    store.getState().updateFilter(filter.id, { gainDb: 4 })
    store.getState().selectFilter(filter.id)
    const beforeApply = store.getState()
    const snapshot: FilterSnapshotState = {
      filters: [
        { ...filter, id: 'high', type: 'HS', frequencyHz: 8_000, gainDb: -2, q: 0.7 },
        { ...filter, id: 'low', type: 'LS', frequencyHz: 120, gainDb: 1.5, q: 0.8 },
      ],
      filterProvenance: 'manual',
      solutionState: 'stale',
      autoEqRun: null,
    }
    const expectedFilters = snapshot.filters.map((item) => ({ ...item }))

    store.getState().applyFilterSnapshot(snapshot)

    expect(store.getState()).toMatchObject({
      filters: expectedFilters,
      filterProvenance: 'manual',
      solutionState: 'stale',
      selectedFilterId: null,
    })
    expect(store.getState().filters).not.toBe(snapshot.filters)
    expect(store.getState().filters[0]).not.toBe(snapshot.filters[0])

    snapshot.filters.reverse()
    snapshot.filters[0]!.gainDb = 9
    expect(store.getState().filters).toEqual(expectedFilters)

    store.getState().undo()
    expect(store.getState()).toMatchObject({
      filters: beforeApply.filters,
      filterProvenance: beforeApply.filterProvenance,
      solutionState: beforeApply.solutionState,
      selectedFilterId: beforeApply.selectedFilterId,
    })

    store.getState().redo()
    expect(store.getState()).toMatchObject({
      filters: expectedFilters,
      filterProvenance: 'manual',
      solutionState: 'stale',
      selectedFilterId: null,
    })

    store.getState().undo()
    store.getState().undo()
    expect(store.getState().filters).toEqual([filter])
  })

  it.each([
    [
      'invalid filter data',
      [{ ...filter, frequencyHz: 0 }],
    ],
    [
      'duplicate filter IDs',
      [filter, { ...filter }],
    ],
    [
      'an over-limit filter count',
      Array.from({ length: AUTOEQ_PRODUCT_LIMITS.hardMaxFilters + 1 }, (_, index) => ({
        ...filter,
        id: `snapshot-${index}`,
      })),
    ],
  ] satisfies [string, Filter[]][])('rejects a snapshot with %s atomically', (_label, filters) => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    store.getState().selectFilter(filter.id)
    const beforeApply = store.getState()

    store.getState().applyFilterSnapshot({
      filters,
      filterProvenance: 'autoeq',
      solutionState: 'clean',
      autoEqRun: null,
    })

    expect(store.getState()).toBe(beforeApply)
    store.getState().undo()
    expect(store.getState().filters).toEqual([])
  })

  it.each([
    ['an invalid definition', [{ enabled: true, type: 'PK', frequencyHz: 0, gainDb: 0, q: 1 }]],
    [
      'more than 64 definitions',
      Array.from({ length: 65 }, () => ({
        enabled: true,
        type: 'PK' as const,
        frequencyHz: 1_000,
        gainDb: 0,
        q: 1,
      })),
    ],
  ] satisfies [string, FilterDefinition[]][])('rejects %s without changing state or history', (_label, imported) => {
    const store = createWorkspaceStore()
    store.getState().setFilters([filter], 'manual')
    const beforeImport = store.getState()

    store.getState().replaceFiltersFromImport(imported)

    expect(store.getState()).toBe(beforeImport)
    store.getState().undo()
    expect(store.getState().filters).toEqual([])
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
