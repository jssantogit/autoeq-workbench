import type { Curve, Filter } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { buildGraphSeries, formatGraphInspector } from './graphSeries'

const source: Curve = {
  id: 'source',
  name: 'Source',
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
  name: 'Target',
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
  it('builds normalized Source data while the workspace is incomplete', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.status).toBe('incomplete')
    expect(series.map(({ name }) => name)).toEqual(['Source', 'PEQ'])
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

  it('keeps auxiliary PEQ and Desired series toggleable but hidden by default', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.map(({ name }) => name)).toEqual(['Source', 'Target', 'PEQ', 'Desired'])
    expect(series.filter(({ defaultVisible }) => defaultVisible).map(({ name }) => name)).toEqual([
      'Source',
      'Target',
    ])
    expect(series.every(({ data }) => data.every(([frequency, db]) => frequency > 0 && Number.isFinite(db)))).toBe(true)
  })

  it('adds FR + EQ to the default series only when filters exist', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().setFilters([filter], 'manual')

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.filter(({ defaultVisible }) => defaultVisible).map(({ name }) => name)).toEqual([
      'Source',
      'Target',
      'FR + EQ',
    ])
    expect(series.find(({ name }) => name === 'FR + EQ')?.data).not.toEqual(
      series.find(({ name }) => name === 'Source')?.data,
    )
  })

  it('allows future imported-curve series names without a brittle fixed-name contract', () => {
    const text = formatGraphInspector(
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

    expect(text).toContain('Room overlay:')
  })

  it('keeps a disabled selected filter response inspectable with its Fc marker', () => {
    const store = createWorkspaceStore()
    store.getState().addCurve(source)
    store.getState().addCurve(target)
    store.getState().setFilters([{ ...filter, enabled: false }], 'manual')
    store.getState().selectFilter(filter.id)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)
    const selected = series.find(({ name }) => name === 'Selected Filter')

    expect(derived.peq?.db.every((db) => Math.abs(db) < 1e-10)).toBe(true)
    expect(selected?.defaultVisible).toBe(true)
    expect(selected?.markerFrequencyHz).toBe(1_000)
    expect(Math.max(...selected!.data.map(([, db]) => db))).toBeGreaterThan(2.9)
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
    expect(series.map(({ name }) => name)).toEqual(['Source', 'Target', 'PEQ'])
  })
})

describe('formatGraphInspector', () => {
  it('log-interpolates values at the pointer and lists only present visible series', () => {
    const text = formatGraphInspector(
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

    expect(text).toContain('1.00 kHz')
    expect(text).toContain('Source: 10.00 dB')
    expect(text).toContain('Target: 5.00 dB')
    expect(text).not.toContain('PEQ')
  })
})
