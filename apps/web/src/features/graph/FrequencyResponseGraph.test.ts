import type { Curve, Filter } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { buildGraphSeries, formatEqualizedFrName } from './graphSeries'

const source: Curve = {
  id: 'source',
  name: 'Juzear Nimbus [1].txt',
  kind: 'fr',
  rawPoints: [
    { frequencyHz: 20, db: -2 },
    { frequencyHz: 500, db: 1 },
    { frequencyHz: 20_000, db: 2 },
  ],
  metadata: {},
}

const target: Curve = {
  id: 'target',
  name: 'JM-1 Target',
  kind: 'target',
  rawPoints: [
    { frequencyHz: 20, db: 1 },
    { frequencyHz: 500, db: 0 },
    { frequencyHz: 20_000, db: -1 },
  ],
  metadata: {},
}

const filter: Filter = {
  id: 'filter',
  enabled: true,
  type: 'PK',
  frequencyHz: 1_000,
  gainDb: 3,
  q: 1,
}

const overlay: Curve = {
  id: 'overlay',
  name: 'Room overlay',
  kind: 'fr',
  rawPoints: [
    { frequencyHz: 20, db: 2 },
    { frequencyHz: 500, db: 1 },
    { frequencyHz: 20_000, db: 0 },
  ],
  metadata: {},
}

describe('buildGraphSeries', () => {
  it('builds only the imported FR while the workspace is incomplete and has no filters', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.status).toBe('incomplete')
    expect(series.map(({ name }) => name)).toEqual(['Juzear Nimbus [1].txt'])
    expect(series[0]?.data).toEqual([
      [20, -3],
      [500, 0],
      [20_000, 1],
    ])
  })

  it('builds one actual-name series for every imported curve and keeps its kind and active state', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve({ ...source, name: 'Left channel' })
    store.getState().addCurve({ ...target, name: 'House target' })
    store.getState().addCurve(overlay)

    const measurements = buildGraphSeries(deriveWorkspace(store.getState())).filter(
      ({ kind }) => kind === 'measurement',
    )

    expect(measurements).toMatchObject([
      { id: 'source', name: 'Left channel', curveId: 'source', measurementKind: 'fr', active: true },
      { id: 'target', name: 'House target', curveId: 'target', measurementKind: 'target', active: true },
      { id: 'overlay', name: 'Room overlay', curveId: 'overlay', measurementKind: 'fr', active: false },
    ])
  })

  it('renders only imported FR and Target responses when there are no filters', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.map(({ name }) => name)).toEqual(['Juzear Nimbus [1].txt', 'JM-1 Target'])
    expect(series.every(({ data }) => data.every(([frequency, db]) => frequency > 0 && Number.isFinite(db)))).toBe(true)
  })

  it('adds the active FR equalized response without graphing internal correction curves', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().setFilters([filter], 'manual')

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt',
      'Juzear Nimbus [1].txt EQ',
      'JM-1 Target',
    ])
    expect(series.map(({ kind }) => kind)).toEqual(['measurement', 'equalized-fr', 'measurement'])
    expect(series.find(({ kind }) => kind === 'equalized-fr')).toMatchObject({
      id: 'fr-eq',
      sourceCurveId: 'source',
    })
    expect(series.find(({ kind }) => kind === 'equalized-fr')?.data).not.toEqual(
      series.find(({ id }) => id === 'source')?.data,
    )
    expect(series.map(({ name }) => name)).not.toEqual(expect.arrayContaining([
      'FR + EQ', 'Selected Filter', 'PEQ', 'Desired',
    ]))
  })

  it('derives the equalized FR without an active Target', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().setFilters([filter], 'manual')

    expect(buildGraphSeries(deriveWorkspace(store.getState())).map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt',
      'Juzear Nimbus [1].txt EQ',
    ])
  })

  it('keeps exactly one equalized response and follows the active FR immediately', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(overlay)
    store.getState().addCurve(target)
    store.getState().setFilters([filter], 'manual')

    expect(buildGraphSeries(deriveWorkspace(store.getState())).map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt', 'Juzear Nimbus [1].txt EQ', 'Room overlay', 'JM-1 Target',
    ])

    store.getState().setActiveFr('overlay')
    const switched = buildGraphSeries(deriveWorkspace(store.getState()))
    expect(switched.map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt', 'Room overlay', 'Room overlay EQ', 'JM-1 Target',
    ])
    expect(switched.filter(({ kind }) => kind === 'equalized-fr')).toHaveLength(1)
  })

  it('does not turn filter selection into a graph response or marker', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().setFilters([{ ...filter, enabled: false }], 'manual')
    store.getState().selectFilter(filter.id)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.peq?.db.every((db) => Math.abs(db) < 1e-10)).toBe(true)
    expect(series.map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt',
      'Juzear Nimbus [1].txt EQ',
      'JM-1 Target',
    ])
    expect(series.every((item) => !('markerFrequencyHz' in item))).toBe(true)
  })

  it('reports fixed-range coverage failures without dropping imported curve data', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve({
      ...source,
      rawPoints: source.rawPoints.filter(({ frequencyHz }) => frequencyHz >= 500),
    })
    store.getState().addCurve(target)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.status).toBe('coverage-error')
    expect(derived.message).toMatch(/20 Hz.*20 kHz/i)
    expect(series.map(({ name }) => name)).toEqual(['Juzear Nimbus [1].txt', 'JM-1 Target'])
  })
})

describe('formatEqualizedFrName', () => {
  it.each([
    ['Juzear Nimbus [1].txt', 'Juzear Nimbus [1].txt EQ'],
    ['Truthear Nova.CSV', 'Truthear Nova.CSV EQ'],
    ['DUNU Titan S2', 'DUNU Titan S2 EQ'],
  ])('formats %s as %s', (name, expected) => {
    expect(formatEqualizedFrName(name)).toBe(expected)
  })
})
