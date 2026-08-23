import type { Curve, Filter } from '@autoeq-workbench/core'
import { describe, expect, it } from 'vitest'
import { createWorkspaceStore, deriveWorkspace } from '../../state/workspaceStore'
import { buildGraphSeries, formatGraphInspector } from './graphSeries'

const source: Curve = {
  id: 'source',
  name: 'Source',
  role: 'source',
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
  role: 'target',
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

describe('buildGraphSeries', () => {
  it('builds normalized Source data while the workspace is incomplete', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(source)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.status).toBe('incomplete')
    expect(series.map(({ name }) => name)).toEqual(['Source'])
    expect(series[0]?.data).toEqual([
      [20, -3],
      [500, 0],
      [20_000, 1],
    ])
  })

  it('keeps auxiliary PEQ and Desired series toggleable but hidden by default', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(source)
    store.getState().setTarget(target)

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.map(({ name }) => name)).toEqual(['Source', 'Target', 'PEQ', 'Desired'])
    expect(series.filter(({ defaultVisible }) => defaultVisible).map(({ name }) => name)).toEqual([
      'Source',
      'Target',
    ])
    expect(series.every(({ data }) => data.every(([frequency, db]) => frequency > 0 && Number.isFinite(db)))).toBe(true)
  })

  it('adds Source + EQ to the default series only when filters exist', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(source)
    store.getState().setTarget(target)
    store.getState().setFilters([filter], 'manual')

    const series = buildGraphSeries(deriveWorkspace(store.getState()))

    expect(series.filter(({ defaultVisible }) => defaultVisible).map(({ name }) => name)).toEqual([
      'Source',
      'Target',
      'Source + EQ',
    ])
    expect(series.find(({ name }) => name === 'Source + EQ')?.data).not.toEqual(
      series.find(({ name }) => name === 'Source')?.data,
    )
  })

  it('keeps a disabled selected filter response inspectable with its Fc marker', () => {
    const store = createWorkspaceStore()
    store.getState().setSource(source)
    store.getState().setTarget(target)
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
    store.getState().setSource({
      ...source,
      rawPoints: source.rawPoints.filter(({ frequencyHz }) => frequencyHz >= 500),
    })
    store.getState().setTarget(target)

    const derived = deriveWorkspace(store.getState())
    const series = buildGraphSeries(derived)

    expect(derived.status).toBe('coverage-error')
    expect(derived.message).toMatch(/20 Hz.*20 kHz/i)
    expect(series.map(({ name }) => name)).toEqual(['Source', 'Target'])
  })
})

describe('formatGraphInspector', () => {
  it('log-interpolates values at the pointer and lists only present visible series', () => {
    const text = formatGraphInspector(
      1_000,
      [
        {
          name: 'Source',
          data: [
            [100, 0],
            [10_000, 20],
          ],
          defaultVisible: true,
        },
        {
          name: 'Target',
          data: [
            [100, 5],
            [10_000, 5],
          ],
          defaultVisible: true,
        },
      ],
      { Source: true, Target: false, PEQ: true },
    )

    expect(text).toContain('1.00 kHz')
    expect(text).toContain('Source: 10.00 dB')
    expect(text).not.toContain('Target')
    expect(text).not.toContain('PEQ')
  })
})
