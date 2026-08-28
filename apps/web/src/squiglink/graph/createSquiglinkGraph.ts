import { curveCardinal, curveNatural, line as d3Line, scaleLinear, scaleLog, select } from 'd3'
import { smoothGraphSeries } from './smoothing'
import type {
  SquiglinkGraphController,
  SquiglinkGraphPalette,
  SquiglinkGraphSeries,
  SquiglinkGraphState,
  SquiglinkInspectorReading,
} from './types'

const WIDTH = 800
const HEIGHT = 346
const PLOT_LEFT = 15
const PLOT_RIGHT = 785
const PLOT_TOP = 20
const PLOT_BOTTOM = 324
const X_TICKS = [
  20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800,
  1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 15_000, 20_000,
] as const
const TICK_PATTERN = [3, 0, 0, 1, 0, 0, 2, 0] as const
const TICK_THICKNESS = [0.2, 0.4, 0.4, 0.9, 1.5] as const
const Y_TICKS = [25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30] as const
const ZOOM_RANGES = {
  full: [20, 20_000],
  bass: [20, 400],
  midrange: [100, 4_000],
  treble: [1_000, 20_000],
} as const
const DEFAULT_PALETTE: SquiglinkGraphPalette = {
  background: '#fffefa',
  axis: '#7b7b76',
  majorGrid: '#d8d8d3',
  minorGrid: '#ecece7',
  marker: '#2f3437',
}
const GRID_DIVISIONS_PER_OCTAVE = 48
let graphId = 0

interface PreparedSeries extends SquiglinkGraphSeries {
  renderedData: [number, number][]
}

function formatFrequency(frequencyHz: number): string {
  return frequencyHz >= 1_000
    ? `${(frequencyHz / 1_000).toFixed(2)} kHz`
    : `${frequencyHz.toFixed(0)} Hz`
}

function formatXTick(frequencyHz: number): string {
  if (frequencyHz === 20) return '20Hz'
  if (frequencyHz === 20_000) return '20kHz'
  return frequencyHz >= 1_000 ? `${frequencyHz / 1_000}k` : String(frequencyHz)
}

function interpolateLog(data: readonly [number, number][], frequencyHz: number): number | null {
  if (data.length === 0 || frequencyHz < data[0]![0] || frequencyHz > data.at(-1)![0]) return null
  for (let index = 0; index < data.length; index += 1) {
    const right = data[index]!
    if (frequencyHz === right[0]) return right[1]
    if (frequencyHz > right[0] || index === 0) continue
    const left = data[index - 1]!
    const ratio = Math.log(frequencyHz / left[0]) / Math.log(right[0] / left[0])
    return left[1] + ratio * (right[1] - left[1])
  }
  return null
}

function validSortedData(data: readonly [number, number][]): [number, number][] {
  const sorted = data
    .map(([frequencyHz, db], index) => ({ frequencyHz, db, index }))
    .filter(({ frequencyHz, db }) => frequencyHz > 0 && Number.isFinite(frequencyHz) && Number.isFinite(db))
    .sort((left, right) => left.frequencyHz - right.frequencyHz || left.index - right.index)
  const unique: [number, number][] = []
  for (const { frequencyHz, db } of sorted) {
    if (unique.at(-1)?.[0] === frequencyHz) unique[unique.length - 1] = [frequencyHz, db]
    else unique.push([frequencyHz, db])
  }
  return unique
}

function resampleDisplayData(data: readonly [number, number][]): [number, number][] {
  const source = validSortedData(data)
  if (source.length < 2) return source
  const first = source[0]![0]
  const last = source.at(-1)![0]
  const firstIndex = Math.ceil(GRID_DIVISIONS_PER_OCTAVE * Math.log2(first / 20))
  const lastIndex = Math.floor(GRID_DIVISIONS_PER_OCTAVE * Math.log2(last / 20))
  const sampled = Array.from({ length: Math.max(0, lastIndex - firstIndex + 1) }, (_, offset) => {
    const frequencyHz = 20 * 2 ** ((firstIndex + offset) / GRID_DIVISIONS_PER_OCTAVE)
    const db = interpolateLog(source, frequencyHz)
    return db === null ? null : [frequencyHz, db] as [number, number]
  }).filter((point): point is [number, number] => point !== null)
  if (sampled[0]?.[0] !== first) sampled.unshift([...source[0]!] as [number, number])
  if (sampled.at(-1)?.[0] !== last) sampled.push([...source.at(-1)!] as [number, number])
  return sampled.length >= 3 ? sampled : source
}

function prepareSeries(series: readonly SquiglinkGraphSeries[], smoothingLevel: number): PreparedSeries[] {
  return series.filter(({ visible }) => visible).map((item) => {
    const source = smoothingLevel > 0 ? resampleDisplayData(item.data) : validSortedData(item.data)
    return { ...item, renderedData: smoothGraphSeries(source, smoothingLevel) }
  })
}

export function createSquiglinkGraph(
  svg: SVGSVGElement,
  initial: SquiglinkGraphState,
  callbacks: { onInspector(reading: SquiglinkInspectorReading | null): void },
): SquiglinkGraphController {
  const clipId = `squiglink-graph-clip-${++graphId}`
  const svgSelection = select(svg).attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
  const root = svgSelection.append('g').attr('data-squiglink-graph-root', '')
  const defs = root.append('defs')
  defs.append('clipPath').attr('id', clipId).append('rect')
    .attr('x', PLOT_LEFT).attr('y', PLOT_TOP)
    .attr('width', PLOT_RIGHT - PLOT_LEFT).attr('height', PLOT_BOTTOM - PLOT_TOP)
  const background = root.append('rect').attr('data-graph-background', '')
    .attr('width', WIDTH).attr('height', HEIGHT)
  const xAxis = root.append('g').attr('data-graph-axis', 'x').attr('aria-hidden', 'true')
  const yAxis = root.append('g').attr('data-graph-axis', 'y').attr('aria-hidden', 'true')
  const seriesLayer = root.append('g').attr('data-series-layer', '')
    .attr('clip-path', `url(#${clipId})`)
  const labelLayer = root.append('g').attr('data-label-layer', '')
    .attr('aria-label', 'Visible graph series').attr('pointer-events', 'none')
  const inspectorLayer = root.append('g').attr('data-inspector-layer', '')
    .attr('pointer-events', 'none')
  const hitArea = root.append('rect').attr('data-inspector-hit-area', '')
    .attr('role', 'slider').attr('aria-label', 'Inspect graph frequency')
    .attr('x', PLOT_LEFT).attr('y', PLOT_TOP)
    .attr('width', PLOT_RIGHT - PLOT_LEFT).attr('height', PLOT_BOTTOM - PLOT_TOP)
    .attr('fill', 'transparent')
  const x = scaleLog().range([PLOT_LEFT, PLOT_RIGHT])
  const y = scaleLinear().domain([-30.5, 25]).range([PLOT_BOTTOM, PLOT_TOP])
  let current = initial
  let prepared: PreparedSeries[] = []
  let inspectorFrequency: number | null = null
  let destroyed = false

  function clearInspector(): void {
    inspectorFrequency = null
    inspectorLayer.selectAll('*').remove()
    callbacks.onInspector(null)
  }

  function inspectFrequency(requestedFrequency: number): void {
    if (!current.view.inspectorEnabled) return
    const [minimum, maximum] = ZOOM_RANGES[current.view.zoom]
    const frequencyHz = Math.min(maximum, Math.max(minimum, requestedFrequency))
    inspectorFrequency = frequencyHz
    const values = prepared.flatMap((item) => {
      const db = interpolateLog(item.renderedData, frequencyHz)
      return db === null ? [] : [{ id: item.id, name: item.name, db }]
    })
    const reading = { frequencyHz, values }
    callbacks.onInspector(reading)
    renderInspector(reading)
  }

  function renderInspector(reading: SquiglinkInspectorReading): void {
    const palette = current.palette ?? DEFAULT_PALETTE
    const compact = current.view.presentation === 'compact'
    const tooltipWidth = compact ? 240 : 170
    const lineHeight = compact ? 22 : 13
    const titleY = compact ? 20 : 13
    const valueY = compact ? 43 : 27
    const values = reading.values.slice(0, 6)
    const overflow = reading.values.length > values.length
    const tooltipHeight = (compact ? 48 : 30) + values.length * lineHeight + (overflow ? lineHeight : 0)
    const inspectorX = x(reading.frequencyHz)
    const tooltipX = Math.min(PLOT_RIGHT - tooltipWidth - 4, Math.max(PLOT_LEFT + 4, inspectorX + 8))
    inspectorLayer.selectAll('*').remove()
    inspectorLayer.append('line').attr('data-inspector-crosshair', '')
      .attr('x1', inspectorX).attr('x2', inspectorX).attr('y1', PLOT_TOP).attr('y2', PLOT_BOTTOM)
      .attr('stroke', palette.marker).attr('stroke-width', 0.8).attr('stroke-dasharray', '3 3')
    const tooltip = inspectorLayer.append('g').attr('data-inspector-tooltip', '')
      .attr('transform', `translate(${tooltipX} ${PLOT_TOP + 18})`)
    tooltip.append('rect').attr('data-inspector-tooltip-box', '')
      .attr('width', tooltipWidth).attr('height', tooltipHeight).attr('rx', 3)
      .attr('fill', palette.background).attr('fill-opacity', 0.94).attr('stroke', palette.majorGrid)
    tooltip.append('text').attr('class', 'graph-tooltip-label')
      .attr('x', 7).attr('y', titleY).attr('fill', palette.marker)
      .attr('font-size', compact ? 19 : 10).attr('font-weight', 700)
      .text(formatFrequency(reading.frequencyHz))
    values.forEach((value, index) => {
      const color = prepared.find(({ id }) => id === value.id)?.color ?? palette.axis
      const rowY = valueY + index * lineHeight
      if (compact) {
        const row = tooltip.append('g').attr('class', 'graph-tooltip-value')
          .attr('data-inspector-value-row', '').attr('fill', color).attr('font-size', 18)
        const abbreviated = value.name.length <= 11 ? value.name : `${value.name.slice(0, 8)}...`
        const name = row.append('text').attr('data-inspector-value-name', '').attr('x', 7).attr('y', rowY)
        name.append('title').text(value.name)
        name.append('tspan').text(abbreviated)
        row.append('text').attr('data-inspector-value-number', '')
          .attr('x', tooltipWidth - 7).attr('y', rowY).attr('text-anchor', 'end')
          .text(`${value.db.toFixed(2)} dB`)
      } else {
        tooltip.append('text').attr('class', 'graph-tooltip-value')
          .attr('x', 7).attr('y', rowY).attr('fill', color).attr('font-size', 9)
          .text(`${value.name}: ${value.db.toFixed(2)} dB`)
      }
    })
    if (overflow) {
      tooltip.append('text').attr('class', 'graph-tooltip-value')
        .attr('x', 7).attr('y', valueY + values.length * lineHeight)
        .attr('fill', palette.axis).attr('font-size', compact ? 18 : 9)
        .text(`+${reading.values.length - values.length} more`)
    }
    hitArea.attr('aria-valuenow', Math.round(reading.frequencyHz))
      .attr('aria-valuetext', formatFrequency(reading.frequencyHz))
  }

  function renderAxes(palette: SquiglinkGraphPalette): void {
    const [minimum, maximum] = ZOOM_RANGES[current.view.zoom]
    const ticks = X_TICKS.map((frequencyHz, index) => {
      const importance = index === 0 || index === X_TICKS.length - 1
        ? 4
        : TICK_PATTERN[index % TICK_PATTERN.length]!
      return { frequencyHz, importance, label: formatXTick(frequencyHz) }
    }).filter(({ frequencyHz }) => frequencyHz >= minimum && frequencyHz <= maximum)
    const xGroups = xAxis.selectAll<SVGGElement, (typeof ticks)[number]>('g[data-x-tick]')
      .data(ticks, (tick) => tick.frequencyHz).join((enter) => {
        const group = enter.append('g')
        group.append('line')
        group.append('text').attr('class', 'graph-axis-label graph-axis-label--x')
        return group
      })
    xGroups.attr('data-x-tick', (tick) => tick.frequencyHz)
    xGroups.select('line').attr('data-x-grid', (tick) => tick.frequencyHz)
      .attr('x1', (tick) => x(tick.frequencyHz)).attr('x2', (tick) => x(tick.frequencyHz))
      .attr('y1', 10).attr('y2', 312)
      .attr('stroke', (tick) => tick.importance >= 2 ? palette.majorGrid : palette.minorGrid)
      .attr('stroke-width', (tick) => TICK_THICKNESS[tick.importance]!)
    xGroups.select('text')
      .attr('class', 'graph-axis-label graph-axis-label--x')
      .attr('x', (tick) => x(tick.frequencyHz)).attr('y', 330).attr('dy', '0.71em')
      .attr('dx', (tick) => tick.frequencyHz === 20 ? 4 : tick.frequencyHz === 20_000 ? -5 : null)
      .attr('fill', palette.axis).attr('font-size', (tick) => tick.importance === 0 ? '8.6' : '10')
      .attr('font-weight', (tick) => tick.importance === 0 ? 'lighter' : null)
      .attr('text-anchor', 'middle')
      .text((tick) => tick.label)

    const yGroups = yAxis.selectAll<SVGGElement, number>('g[data-y-tick]')
      .data(Y_TICKS, (db) => db).join((enter) => {
        const group = enter.append('g').attr('data-y-tick', '')
        group.append('line')
        group.append('text').attr('class', 'graph-axis-label graph-axis-label--y')
        return group
      })
    yGroups.select('line').attr('data-y-grid', (db) => db)
      .attr('x1', PLOT_LEFT).attr('x2', PLOT_RIGHT).attr('y1', (db) => y(db)).attr('y2', (db) => y(db))
      .attr('stroke', palette.majorGrid)
      .attr('stroke-width', 0.2716216216216216)
      .attr('stroke-linecap', 'round')
    yGroups.select('text').attr('data-y-label', (db) => db)
      .attr('x', PLOT_LEFT + 3).attr('y', (db) => y(db)).attr('dy', -2).attr('fill', palette.axis)
      .attr('font-size', 10).attr('text-anchor', 'start')
      .text((db) => db)
    yAxis.selectAll<SVGTextElement, number>('text[data-db-label]').data([0]).join('text')
      .attr('class', 'graph-axis-label graph-db-label').attr('data-db-label', '')
      .attr('transform', `translate(${PLOT_RIGHT} 0) rotate(-90)`)
      .attr('x', -10).attr('y', -(PLOT_RIGHT - PLOT_LEFT) - 2).attr('fill', palette.axis)
      .attr('font-size', 10).attr('text-anchor', 'end').text('dB')
  }

  function renderSeries(): void {
    const curve = current.view.smoothingLevel > 0 ? curveNatural : curveCardinal.tension(0.5)
    const line = d3Line<[number, number]>()
      .x(([frequencyHz]) => x(frequencyHz)).y(([, db]) => y(db)).curve(curve)
    seriesLayer.selectAll<SVGPathElement, PreparedSeries>('path[data-series-id]')
      .data(prepared, (item) => item.id).join('path')
      .attr('data-series-id', (item) => item.id).attr('data-series-name', (item) => item.name)
      .attr('fill', 'none').attr('stroke', (item) => item.color)
      .attr('stroke-width', (item) => item.lineWidth ?? (item.dashed ? 1.1 : 1.35))
      .attr('stroke-opacity', (item) => item.opacity ?? (item.dashed ? 0.82 : 1))
      .attr('stroke-dasharray', (item) => item.dashed ? '7 5' : null)
      .attr('vector-effect', 'non-scaling-stroke').attr('d', (item) => line(item.renderedData))
  }

  function renderLabels(palette: SquiglinkGraphPalette): void {
    const compact = current.view.presentation === 'compact'
    const visible = current.view.labelsEnabled ? prepared.slice(0, 8) : []
    const groups = labelLayer.selectAll<SVGGElement, PreparedSeries>('g[data-curve-label-group]')
      .data(visible, (item) => item.id).join('g')
      .attr('data-curve-label-group', (item) => item.id)
    groups.each(function renderLabel(item, index) {
      const group = select(this)
      const labelY = PLOT_BOTTOM - (compact ? 24 : 20) - index * (compact ? 14 : 15)
      group.selectAll('line').remove()
      group.selectAll<SVGTextElement, PreparedSeries>('text').data([item]).join('text')
        .attr('class', 'graph-curve-label').attr('data-curve-label', item.id)
        .attr('x', 67).attr('y', labelY).attr('fill', item.color)
        .attr('font-size', compact ? 11 : 10).attr('font-weight', 650)
        .style('white-space', 'pre').text(item.name)
    })
    const overflow = current.view.labelsEnabled ? prepared.length - visible.length : 0
    labelLayer.selectAll<SVGTextElement, number>('text[data-label-overflow]').data(overflow > 0 ? [overflow] : [])
      .join('text').attr('data-label-overflow', '')
      .attr('class', 'graph-curve-label graph-curve-label--overflow').attr('x', 67)
      .attr('y', PLOT_BOTTOM - (compact ? 24 : 20) - visible.length * (compact ? 14 : 15))
      .attr('fill', palette.axis).attr('font-size', compact ? 10 : 9)
      .text((count) => `+${count} more`)
  }

  function update(next: SquiglinkGraphState): void {
    if (destroyed) return
    current = next
    const palette = next.palette ?? DEFAULT_PALETTE
    const [minimum, maximum] = ZOOM_RANGES[next.view.zoom]
    x.domain([minimum, maximum])
    prepared = prepareSeries(next.series, next.view.smoothingLevel)
    background.attr('fill', palette.background)
    svgSelection.attr('data-graph-presentation', next.view.presentation ?? 'desktop')
    renderAxes(palette)
    renderSeries()
    renderLabels(palette)
    hitArea.attr('aria-valuemin', minimum).attr('aria-valuemax', maximum)
      .attr('aria-disabled', !next.view.inspectorEnabled)
      .attr('tabindex', next.view.inspectorEnabled ? 0 : -1)
      .attr('aria-valuenow', Math.round(inspectorFrequency ?? Math.min(maximum, Math.max(minimum, 1_000))))
      .attr('aria-valuetext', formatFrequency(inspectorFrequency ?? Math.min(maximum, Math.max(minimum, 1_000))))
    if (!next.view.inspectorEnabled) clearInspector()
    else if (inspectorFrequency !== null) inspectFrequency(inspectorFrequency)
  }

  hitArea
    .on('pointermove.squiglink', (event: PointerEvent) => {
      if (!current.view.inspectorEnabled) return
      const bounds = svg.getBoundingClientRect()
      if (bounds.width <= 0) return
      const position = (event.clientX - bounds.left) / bounds.width * WIDTH
      const bounded = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, position))
      inspectFrequency(x.invert(bounded))
    })
    .on('pointerleave.squiglink', clearInspector)
    .on('focus.squiglink', () => {
      if (inspectorFrequency === null) inspectFrequency(1_000)
    })
    .on('keydown.squiglink', (event: KeyboardEvent) => {
      if (!current.view.inspectorEnabled) return
      const currentX = inspectorFrequency === null ? x(1_000) : x(inspectorFrequency)
      const step = (PLOT_RIGHT - PLOT_LEFT) / 100
      let nextX: number | null = null
      if (event.key === 'ArrowLeft') nextX = currentX - step
      if (event.key === 'ArrowRight') nextX = currentX + step
      if (event.key === 'Home') {
        event.preventDefault()
        inspectFrequency(ZOOM_RANGES[current.view.zoom][0])
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        inspectFrequency(ZOOM_RANGES[current.view.zoom][1])
        return
      }
      if (nextX === null) return
      event.preventDefault()
      inspectFrequency(x.invert(Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, nextX))))
    })

  update(initial)

  return {
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      hitArea.on('.squiglink', null)
      svgSelection.interrupt()
      root.selectAll('*').interrupt()
      root.remove()
      callbacks.onInspector(null)
    },
  }
}
