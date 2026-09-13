import { describe, expect, it } from 'vitest'
import type { CurveAppearance } from '../../state/uiStore'
import type { GraphSeries } from '../../features/graph/graphSeries'
import { buildDisplaySeries } from './displayTransform'

function appearance(
  values: Record<string, Partial<CurveAppearance>>,
): Record<string, CurveAppearance> {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, {
    color: '#1565c0', visible: true, offsetDb: 0, ...value,
  }]))
}

const measurement = (
  id: string,
  data: [number, number][],
): GraphSeries => ({
  id,
  name: id,
  kind: 'measurement',
  data,
  defaultVisible: true,
  curveId: id,
  measurementKind: 'fr',
  active: false,
})

describe('buildDisplaySeries', () => {
  it('applies display offsets without mutating semantic samples', () => {
    const sourceData = [[100, 1], [1_000, 2], [10_000, 3]] as [number, number][]
    const series = [measurement('fr-1', sourceData)]
    const result = buildDisplaySeries(series, appearance({ 'fr-1': { offsetDb: 3 } }), null)

    expect(result[0]!.displayData).toEqual([[100, 4], [1_000, 5], [10_000, 6]])
    expect(series[0]!.data).toEqual([[100, 1], [1_000, 2], [10_000, 3]])
    expect(result[0]!.displayData).not.toBe(series[0]!.data)
  })

  it('subtracts an offset-adjusted baseline with log-frequency interpolation', () => {
    const baseline = measurement('baseline', [[100, 1], [1_000, 2], [10_000, 3]])
    const compared = measurement('compared', [
      [100, 5], [Math.sqrt(100 * 1_000), 5.5], [1_000, 6], [10_000, 7], [20_000, 8],
    ])
    const result = buildDisplaySeries(
      [baseline, compared],
      appearance({ baseline: { offsetDb: 1 }, compared: { offsetDb: 1 } }),
      'baseline',
    )

    expect(result[0]!.displayData).toEqual([[100, 0], [1_000, 0], [10_000, 0]])
    expect(result[1]!.displayData).toEqual([
      [100, 4], [Math.sqrt(100 * 1_000), 4], [1_000, 4], [10_000, 4],
    ])
  })

  it('inherits the source curve offset for the equalized FR', () => {
    const equalized: GraphSeries = {
      id: 'fr-eq',
      name: 'Source EQ',
      kind: 'equalized-fr',
      data: [[100, 2], [1_000, 3]],
      defaultVisible: true,
      sourceCurveId: 'source',
    }

    expect(buildDisplaySeries(
      [equalized], appearance({ source: { offsetDb: -2 } }), null,
    )[0]!.displayData).toEqual([[100, 0], [1_000, 1]])
  })
})
