import type { Curve, Filter } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { buildGraphSeries, formatEqualizedFrName, formatGraphInspector } from './graphSeries'
import { createNaturalSplineSegments } from './graphGeometry'

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
      'Juzear Nimbus [1] EQ',
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
      'Juzear Nimbus [1] EQ',
    ])
  })

  it('keeps exactly one equalized response and follows the active FR immediately', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(overlay)
    store.getState().addCurve(target)
    store.getState().setFilters([filter], 'manual')

    expect(buildGraphSeries(deriveWorkspace(store.getState())).map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt', 'Juzear Nimbus [1] EQ', 'Room overlay', 'JM-1 Target',
    ])

    store.getState().setActiveFr('overlay')
    const switched = buildGraphSeries(deriveWorkspace(store.getState()))
    expect(switched.map(({ name }) => name)).toEqual([
      'Juzear Nimbus [1].txt', 'Room overlay', 'Room overlay EQ', 'JM-1 Target',
    ])
    expect(switched.filter(({ kind }) => kind === 'equalized-fr')).toHaveLength(1)
  })

  it('allows future imported-curve series names without a brittle fixed-name contract', () => {
    const inspector = formatGraphInspector(
      1_000,
      [{
        id: 'room',
        name: 'Room overlay',
        kind: 'measurement',
        data: [[20, 1], [20_000, 2]],
        defaultVisible: true,
        curveId: 'room',
        measurementKind: 'fr',
        active: false,
      }],
    )

    expect(inspector.values[0]?.name).toBe('Room overlay')
    expect(inspector.values[0]?.db).toBeTypeOf('number')
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
      'Juzear Nimbus [1] EQ',
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
    ['Juzear Nimbus [1].txt', 'Juzear Nimbus [1] EQ'],
    ['Truthear Nova.CSV', 'Truthear Nova EQ'],
    ['DUNU Titan S2', 'DUNU Titan S2 EQ'],
  ])('formats %s as %s', (name, expected) => {
    expect(formatEqualizedFrName(name)).toBe(expected)
  })
})

describe('formatGraphInspector', () => {
  it('evaluates the rendered natural spline and lists only present visible series', () => {
    const inspector = formatGraphInspector(
      1_000,
      [
        {
          name: 'Source',
          id: 'source',
          kind: 'measurement',
          data: [
            [100, 0],
            [10_000, 20],
          ],
          defaultVisible: true,
          curveId: 'source',
          measurementKind: 'fr',
          active: true,
        },
        {
          name: 'Target',
          id: 'target',
          kind: 'measurement',
          data: [
            [100, 5],
            [10_000, 5],
          ],
          defaultVisible: true,
          curveId: 'target',
          measurementKind: 'target',
          active: true,
        },
      ],
    )

    expect(inspector).toMatchObject({
      frequencyHz: 1_000,
      frequencyLabel: '1.00 kHz',
      values: [{ id: 'source', name: 'Source' }, { id: 'target', name: 'Target', db: 5 }],
    })
    expect(inspector.values[0]!.db).toBeCloseTo(10, 8)
  })

  it('uses caller-precomputed spline segments when supplied', () => {
    const series = [{
      name: 'Source', id: 'source', kind: 'measurement' as const,
      data: [[20, 99], [20_000, 99]] as [number, number][],
      defaultVisible: true, curveId: 'source', measurementKind: 'fr' as const, active: true,
    }]
    const prepared = new Map([[
      'source',
      createNaturalSplineSegments([[10, 0], [200, 4], [30_000, 0]]),
    ]])

    expect(formatGraphInspector(20, series, prepared).values[0]!.db).not.toBe(99)
    expect(formatGraphInspector(20_000, series, prepared).values[0]!.db).not.toBe(99)
  })
})
