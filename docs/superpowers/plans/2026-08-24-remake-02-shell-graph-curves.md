# Remake 02 — Shell, Graph, And Curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current visual shell and custom React/SVG graph with a source-derived Squiglink shell, toolbar, D3 renderer, and curve manager while preserving current FR/Target/manual-EQ behavior after every publishable checkpoint.

**Architecture:** React owns composition/lifecycle, Zustand owns canonical workspace/UI state, and `packages/core` remains the domain/DSP authority. A TypeScript adapter owns a real D3 port of the Squiglink graph; D3 mutates only the SVG subtree it owns. Squiglink CSS is copied into runtime source and recolored through Workbench Light/Dark variables rather than imported from `vendor/`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand 5, D3 v7, Tailwind 4 where already used, Vitest, Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Remake 01 must be complete and publicly green first.
- Keep Vite + React + TypeScript; do not replace the app with legacy global HTML/JS.
- Keep `packages/core` authoritative for parsing, normalization, filters, preamp, metrics, and future AutoEQ.
- Do not import or execute runtime code from `vendor/squiglink/`.
- Bundle D3 through pnpm/Vite; no D3 CDN/script tag.
- Preserve graph semantics: imported FR(s), imported Target(s), and one full-cascade equalized FR for the active FR only.
- Never render an isolated filter response or selected-filter graph marker.
- Port `viewBox="0 0 800 346"`, source log-frequency behavior, tick/grid hierarchy, zoom interaction, inspector, labels, screenshot, recolor, and smoothing interaction.
- Keep Workbench relative-dB y semantics; use fixed initial domain -30..+25 dB rather than Squiglink absolute SPL.
- Source zoom ranges are exact: Full 20-20000, Bass 20-400, Mids 100-4000, Treble 1000-20000 Hz.
- Light and Dark remain; Light is default; graph-series colors remain independent from amber/copper UI accent.
- Tabs are exactly `Curves | Equalizer | Tools`.
- The source-derived graph toolbar replaces `UtilityRail`; no duplicate controls remain after cutover.
- Normalization remains non-destructive and frequency-bounded to 20-20000 Hz.
- Offset, baseline, smoothing, visibility, and labels are display state and never mutate imported raw samples.
- No legacy Squiglink AutoEQ code may enter runtime.

## Authorized Execution Corrections

These corrections resolve conflicts found between the original task sequence, the current typed React application, and the pinned Squiglink source. They are authoritative where the task text below differs.

1. Task 1 keeps `DockTab = 'curves' | 'equalizer' | 'details'` so its required typecheck remains coherent. Task 2 migrates `details` to `tools` atomically across App composition, dock components, state, and affected tests.
2. Task 1 makes `CurveAppearance.offsetDb` required and updates every affected fixture or helper with neutral `offsetDb: 0`, including files omitted from the original Task 1 file list when required for a green typecheck.
3. Task 2 keeps `UtilityRail` functional. Task 5 removes it only after the source-derived graph toolbar is implemented and tested with theme access, normalization, inspector, screenshot, and the remaining migrated controls.
4. The shell follows the actual upstream hierarchy: `.graphtool > header.header + main.main`. `AppHeader` is not placed inside `main.main`.
5. The curve manager preserves the upstream table structure: `table.manageTable > tbody > tr > td`, with React accessibility semantics layered onto that structure.
6. Smoothing is display-only. The graph adapter deterministically resamples each series onto an approximately 1/48-octave common logarithmic grid within valid source coverage, applies the ported Squiglink smoothing algebra to that representation, and passes only display output to the renderer. Raw imported samples remain unchanged.

Additional files may change only when necessary to keep an amended task's contract compilable and tested. These corrections do not authorize unrelated refactors, runtime imports from `vendor/`, legacy Squiglink AutoEQ, or Remake 03 work.

---

### Task 1: Add D3 and lock graph-view UI state

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/state/uiStore.ts`
- Modify: `apps/web/src/state/uiStore.test.ts`

**Interfaces:**
- Produces:

```ts
export type DockTab = 'curves' | 'equalizer' | 'tools'
export type GraphZoomPreset = 'full' | 'bass' | 'mids' | 'treble'

export interface CurveAppearance {
  color: string
  visible: boolean
  offsetDb: number
}

export interface UiState {
  theme: ThemeMode
  activeDockTab: DockTab
  inspectorEnabled: boolean
  labelsEnabled: boolean
  graphZoomPreset: GraphZoomPreset
  smoothingLevel: number
  baselineCurveId: string | null
  curveAppearance: Record<string, CurveAppearance>
  setTheme(theme: ThemeMode): void
  setActiveDockTab(tab: DockTab): void
  toggleInspector(): void
  toggleLabels(): void
  setGraphZoomPreset(preset: GraphZoomPreset): void
  setSmoothingLevel(level: number): void
  setBaselineCurve(id: string | null): void
  registerCurve(id: string): void
  unregisterCurve(id: string): void
  setCurveColor(id: string, color: string): void
  setCurveVisible(id: string, visible: boolean): void
  setCurveOffset(id: string, offsetDb: number): void
}
```

- [ ] **Step 1: Write failing state tests**

```ts
const store = createUiStore(() => 0)
expect(store.getState().activeDockTab).toBe('curves')
expect(store.getState().graphZoomPreset).toBe('full')
expect(store.getState().smoothingLevel).toBe(5)
expect(store.getState().labelsEnabled).toBe(true)
expect(store.getState().baselineCurveId).toBeNull()

store.getState().registerCurve('fr-1')
expect(store.getState().curveAppearance['fr-1']).toEqual({
  color: '#1565c0',
  visible: true,
  offsetDb: 0,
})
store.getState().setCurveOffset('fr-1', 3.5)
expect(store.getState().curveAppearance['fr-1']?.offsetDb).toBe(3.5)

store.getState().setBaselineCurve('fr-1')
store.getState().unregisterCurve('fr-1')
expect(store.getState().baselineCurveId).toBeNull()
```

Also test that negative/non-finite smoothing values and non-finite offsets are ignored.

- [ ] **Step 2: Run the test and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
```

Expected: FAIL because the new state fields/actions do not exist.

- [ ] **Step 3: Install bundled D3 dependencies**

```bash
pnpm --filter @autoeq-workbench/web add d3
pnpm --filter @autoeq-workbench/web add -D @types/d3
```

- [ ] **Step 4: Implement the minimal UI state changes**

```ts
export const DEFAULT_GRAPH_VIEW = Object.freeze({
  inspectorEnabled: true,
  labelsEnabled: true,
  graphZoomPreset: 'full' as const,
  smoothingLevel: 5,
  baselineCurveId: null as string | null,
})

// inside createUiStore
setSmoothingLevel: (smoothingLevel) => {
  if (!Number.isFinite(smoothingLevel) || smoothingLevel < 0) return
  set({ smoothingLevel })
},
setBaselineCurve: (baselineCurveId) =>
  set((state) =>
    baselineCurveId === null || state.curveAppearance[baselineCurveId] !== undefined
      ? { baselineCurveId }
      : state,
  ),
setCurveOffset: (id, offsetDb) => {
  if (!Number.isFinite(offsetDb)) return
  set((state) => {
    const appearance = state.curveAppearance[id]
    return appearance === undefined
      ? state
      : {
          curveAppearance: {
            ...state.curveAppearance,
            [id]: { ...appearance, offsetDb },
          },
        }
  })
},
```

Extend `registerCurve()` to initialize `offsetDb: 0`, and extend `unregisterCurve()` to clear `baselineCurveId` when removing the active baseline.

- [ ] **Step 5: Run targeted verification**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/state/uiStore.ts apps/web/src/state/uiStore.test.ts
git commit -m "feat(web): add Squiglink graph view state"
```

### Task 2: Port the shell/style language around the still-working old graph

**Files:**
- Create: `apps/web/src/squiglink/styles/squiglink-base.css`
- Create: `apps/web/src/squiglink/styles/workbench-theme.css`
- Create: `apps/web/src/features/tools/ToolsInterim.tsx`
- Create: `apps/web/src/features/tools/ToolsInterim.test.tsx`
- Modify: `apps/web/src/components/layout/AppHeader.tsx`
- Modify: `apps/web/src/components/layout/DockTabs.tsx`
- Modify: `apps/web/src/components/layout/WorkbenchDock.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: current `FrequencyResponseGraph`, `CurvesTab`, `EqualizerTab`, `MetricsSummary`, `uiStore.theme`.
- Produces: source-derived shell with final `Curves | Equalizer | Tools` IA while the old graph remains functional for this checkpoint.

- [ ] **Step 1: Copy the upstream runtime stylesheet into an editable source-derived runtime file**

```bash
cp vendor/squiglink/style-alt.css apps/web/src/squiglink/styles/squiglink-base.css
```

Prepend this provenance comment:

```css
/*
 * Adapted from squiglink/lab style-alt.css at
 * 9ff842c539b058cc726207b689c904c9efff75fd (0BSD).
 * Runtime copy: vendor/squiglink remains immutable.
 */
```

Remove only selectors that directly require ads, Patreon/premium content, hosted Brands/Models database UI, or Squiglink branding assets.

- [ ] **Step 2: Add exact Workbench Light/Dark variables**

```css
:root,
:root[data-theme='light'] {
  --wb-bg: #f6f3ed;
  --wb-surface: #fffdf8;
  --wb-surface-muted: #eee9df;
  --wb-text: #232323;
  --wb-text-muted: #6f6b63;
  --wb-border: #d7d0c4;
  --wb-accent: #ffa03a;
  --wb-accent-hover: #e98a27;
  --wb-copper: #9a642b;
}

:root[data-theme='dark'] {
  --wb-bg: #080c0e;
  --wb-surface: #0e1417;
  --wb-surface-muted: #151d21;
  --wb-text: #eceae4;
  --wb-text-muted: #a6a39c;
  --wb-border: #293237;
  --wb-accent: #ffa03a;
  --wb-accent-hover: #e98a27;
  --wb-copper: #9a642b;
}
```

Use these variables in `workbench-theme.css` to override source background/surface/text/border/accent declarations. Do not map semantic graph line colors to `--wb-accent`.

- [ ] **Step 3: Write failing shell/IA tests**

```tsx
render(<App />)
expect(screen.getByText('AutoEQ Workbench')).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'Curves' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'Equalizer' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'Tools' })).toBeInTheDocument()
expect(screen.queryByRole('tab', { name: 'Details' })).not.toBeInTheDocument()

await user.click(screen.getByRole('tab', { name: 'Tools' }))
expect(screen.getByText('MAE')).toBeInTheDocument()
expect(screen.getByText('RMSE')).toBeInTheDocument()
expect(screen.getByText('Preamp')).toBeInTheDocument()
```

- [ ] **Step 4: Run the shell tests and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/App.test.tsx src/features/tools/ToolsInterim.test.tsx
```

Expected: FAIL because `Tools`/`ToolsInterim` do not exist.

- [ ] **Step 5: Implement interim Tools and source-derived App composition**

```tsx
export function ToolsInterim({ derived }: { derived: WorkspaceDerived }) {
  return (
    <section className="tools-panel" aria-label="Tools workspace">
      <section className="tools-section tools-section--analysis">
        <h3>Analysis</h3>
        <MetricsSummary derived={derived} />
      </section>
    </section>
  )
}
```

Recompose `App` with source-derived structural class names while leaving the existing graph component mounted:

```tsx
<main className="main workbench">
  <AppHeader />
  <section className="parts-primary">
    <div className="graphBox">
      <FrequencyResponseGraph derived={derived} />
    </div>
  </section>
  <section className="parts-secondary">
    <WorkbenchDock
      curves={<CurvesTab />}
      equalizer={<EqualizerTab />}
      tools={<ToolsInterim derived={derived} />}
    />
  </section>
</main>
```

`AppHeader` renders only the textual wordmark `AutoEQ Workbench` in the source branding role.

- [ ] **Step 6: Import the source/theme styles from the existing CSS entry point**

At the top of `apps/web/src/index.css`, keep Tailwind and add the runtime styles in this order:

```css
@import "tailwindcss";
@import "./squiglink/styles/squiglink-base.css";
@import "./squiglink/styles/workbench-theme.css";
```

Remove a duplicated `@import "tailwindcss";` if the current file already has it elsewhere.

- [ ] **Step 7: Run tests/build and inspect both themes**

```bash
pnpm --filter @autoeq-workbench/web test -- src/App.test.tsx src/features/tools/ToolsInterim.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
pnpm --filter @autoeq-workbench/web build
```

Inspect at ~390 px and ~1280 px widths in Light and Dark before committing.

- [ ] **Step 8: Commit, push, and smoke the public functional checkpoint**

```bash
git add apps/web/src
git commit -m "feat(web): port Squiglink shell"
git push origin remake/squiglink-base
```

Wait for green CI/Pages; verify FR/Target import and manual EQ still work publicly.

### Task 3: Add pure display transforms for offset/baseline

**Files:**
- Create: `apps/web/src/squiglink/graph/displayTransform.ts`
- Create: `apps/web/src/squiglink/graph/displayTransform.test.ts`
- Modify: `apps/web/src/features/graph/graphSeries.ts`

**Interfaces:**

```ts
export interface DisplaySeries extends GraphSeries {
  displayData: readonly [number, number][]
}

export function buildDisplaySeries(
  series: readonly GraphSeries[],
  appearance: Readonly<Record<string, CurveAppearance>>,
  baselineCurveId: string | null,
): DisplaySeries[]
```

- [ ] **Step 1: Write failing transform tests**

```ts
const sourceData = [[100, 1], [1000, 2], [10000, 3]] as const
const result = buildDisplaySeries(series, {
  'fr-1': { color: '#1565c0', visible: true, offsetDb: 3 },
}, null)
expect(result[0]!.displayData).toEqual([[100, 4], [1000, 5], [10000, 6]])
expect(series[0]!.data).toEqual(sourceData)
```

Add a second test where the baseline is `[100,1], [1000,2], [10000,3]` and another curve is exactly +4 dB at the same frequencies; expect `[100,4], [1000,4], [10000,4]`. Assert an `equalized-fr` series inherits its `sourceCurveId` offset.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/displayTransform.test.ts
```

- [ ] **Step 3: Implement deterministic log-frequency interpolation and display transforms**

```ts
function interpolateLogFrequency(
  data: readonly [number, number][],
  frequencyHz: number,
): number | null {
  if (data.length === 0 || !Number.isFinite(frequencyHz) || frequencyHz <= 0) return null
  const first = data[0]!
  const last = data[data.length - 1]!
  if (frequencyHz === first[0]) return first[1]
  if (frequencyHz === last[0]) return last[1]
  if (frequencyHz < first[0] || frequencyHz > last[0]) return null

  for (let i = 1; i < data.length; i += 1) {
    const left = data[i - 1]!
    const right = data[i]!
    if (frequencyHz > right[0]) continue
    const x = Math.log10(frequencyHz)
    const x0 = Math.log10(left[0])
    const x1 = Math.log10(right[0])
    const t = (x - x0) / (x1 - x0)
    return left[1] + t * (right[1] - left[1])
  }
  return null
}
```

Apply offset first. For equalized FR, resolve appearance using `sourceCurveId`. If a baseline exists, build its offset-adjusted points once, subtract interpolated baseline values from every display series, and omit points outside baseline coverage. Never mutate `GraphSeries.data`.

- [ ] **Step 4: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/displayTransform.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/squiglink/graph/displayTransform.ts apps/web/src/squiglink/graph/displayTransform.test.ts apps/web/src/features/graph/graphSeries.ts
git commit -m "feat(web): add graph display transforms"
```

### Task 4: Port the D3 graph behind a lifecycle adapter

**Files:**
- Create: `apps/web/src/squiglink/graph/types.ts`
- Create: `apps/web/src/squiglink/graph/smoothing.ts`
- Create: `apps/web/src/squiglink/graph/smoothing.test.ts`
- Create: `apps/web/src/squiglink/graph/createSquiglinkGraph.ts`
- Create: `apps/web/src/squiglink/graph/createSquiglinkGraph.test.ts`

**Interfaces:**

```ts
export interface SquiglinkGraphSeries {
  id: string
  name: string
  data: readonly [number, number][]
  color: string
  dashed: boolean
  visible: boolean
}

export interface SquiglinkGraphView {
  zoom: GraphZoomPreset
  smoothingLevel: number
  inspectorEnabled: boolean
  labelsEnabled: boolean
}

export interface SquiglinkInspectorReading {
  frequencyHz: number
  values: readonly { id: string; name: string; db: number }[]
}

export interface SquiglinkGraphState {
  series: readonly SquiglinkGraphSeries[]
  view: SquiglinkGraphView
}

export interface SquiglinkGraphController {
  update(next: SquiglinkGraphState): void
  destroy(): void
}

export function createSquiglinkGraph(
  svg: SVGSVGElement,
  initial: SquiglinkGraphState,
  callbacks: { onInspector(reading: SquiglinkInspectorReading | null): void },
): SquiglinkGraphController
```

- [ ] **Step 1: Write failing smoothing invariants**

```ts
expect(smoothGraphSeries(points, 0)).toEqual(points)
expect(smoothGraphSeries([[100, 2], [1000, 2], [10000, 2]], 5))
  .toEqual(expect.arrayContaining([[100, 2], [1000, 2], [10000, 2]]))
expect(smoothGraphSeries(points, 5).map(([f]) => f)).toEqual(points.map(([f]) => f))
```

Also assert output length equals input length and input arrays are not mutated.

- [ ] **Step 2: Write failing adapter lifecycle tests**

```ts
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
const controller = createSquiglinkGraph(svg, initialState, { onInspector: vi.fn() })
expect(svg.getAttribute('viewBox')).toBe('0 0 800 346')
expect(svg.querySelectorAll('[data-graph-axis="x"]')).toHaveLength(1)
expect(svg.querySelectorAll('[data-graph-axis="y"]')).toHaveLength(1)
controller.update(initialState)
controller.update(initialState)
expect(svg.querySelectorAll('[data-graph-axis="x"]')).toHaveLength(1)
controller.destroy()
expect(svg.querySelector('[data-squiglink-graph-root]')).toBeNull()
```

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/smoothing.test.ts src/squiglink/graph/createSquiglinkGraph.test.ts
```

- [ ] **Step 4: Port the source smoothing implementation with explicit parameters**

Use `vendor/squiglink/graphtool.js` functions `pair`, `smooth_prep`, `smooth_eval`, and `smooth` as the exact algebra source. Replace globals with arguments and expose only:

```ts
export function smoothGraphSeries(
  data: readonly [number, number][],
  level: number,
  scale = 0.01,
): [number, number][] {
  if (level === 0 || data.length < 3) return data.map(([f, db]) => [f, db])
  const frequencies = data.map(([f]) => f)
  const gains = data.map(([, db]) => db)
  const x = frequencies.map(Math.log)
  const h = x.slice(1).map((value, index) => value - x[index]!)
  const s = level * scale
  const d = (index: number) => s * Math.pow(1 / 80, Math.pow(index / x.length, 2))
  const prepared = smoothPrep(h, d)
  const smoothed = smoothEval(prepared, gains)
  return frequencies.map((frequencyHz, index) => [frequencyHz, smoothed[index]!])
}
```

Port `smoothPrep` and `smoothEval` line-for-line into typed local helpers from the pinned source; do not change constants/formulae and do not add another smoothing library.

- [ ] **Step 5: Implement fixed graph constants and the owned SVG root**

```ts
const VIEW_BOX = '0 0 800 346'
const X_TICKS = [
  20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800,
  1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000,
] as const
const ZOOM_RANGES = {
  full: [20, 20_000],
  bass: [20, 400],
  mids: [100, 4_000],
  treble: [1_000, 20_000],
} as const
const Y_DOMAIN: [number, number] = [-30, 25]

const root = select(svg)
  .attr('viewBox', VIEW_BOX)
  .append('g')
  .attr('data-squiglink-graph-root', '')
```

Build x with `scaleLog()`, y with `scaleLinear().domain(Y_DOMAIN)` and reversed screen range, then port Squiglink's axis/grid styling into groups marked `data-graph-axis="x"` and `data-graph-axis="y"`.

- [ ] **Step 6: Implement keyed series updates**

```ts
function renderSeries(next: SquiglinkGraphState) {
  const line = d3Line<[number, number]>()
    .x(([frequencyHz]) => x(frequencyHz))
    .y(([, db]) => y(db))
    .curve(next.view.smoothingLevel > 0 ? curveNatural : curveCardinal.tension(0.5))

  root.select<SVGGElement>('[data-series-layer]')
    .selectAll<SVGPathElement, SquiglinkGraphSeries>('path[data-series-id]')
    .data(next.series.filter((item) => item.visible), (item) => item.id)
    .join('path')
    .attr('data-series-id', (item) => item.id)
    .attr('fill', 'none')
    .attr('stroke', (item) => item.color)
    .attr('stroke-dasharray', (item) => item.dashed ? '7 5' : null)
    .attr('d', (item) => line(smoothGraphSeries(item.data, next.view.smoothingLevel)))
}
```

Update zoom domain, axes, paths, labels, inspector overlay, and visibility in `update()`; do not append duplicate roots/axes on updates.

- [ ] **Step 7: Implement explicit destroy cleanup**

```ts
destroy() {
  select(svg).interrupt()
  select(svg).on('.squiglink', null)
  root.selectAll('*').interrupt()
  root.remove()
  callbacks.onInspector(null)
}
```

Namespace pointer/mouse handlers as `.squiglink` so cleanup is deterministic.

- [ ] **Step 8: Run targeted tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/smoothing.test.ts src/squiglink/graph/createSquiglinkGraph.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/squiglink/graph
git commit -m "feat(web): port Squiglink D3 graph"
```

### Task 5: Cut React over to D3 and replace UtilityRail with the source toolbar

**Files:**
- Create: `apps/web/src/features/graph/GraphToolbar.tsx`
- Create: `apps/web/src/features/graph/GraphToolbar.test.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.component.test.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.test.ts`
- Modify: `apps/web/src/features/graph/graphAppearance.ts`
- Modify: `apps/web/src/features/graph/graphAppearance.test.ts`
- Modify: `apps/web/src/App.tsx`
- Delete after successful replacement: `apps/web/src/components/layout/UtilityRail.tsx`
- Delete after successful replacement: `apps/web/src/features/graph/graphGeometry.ts`
- Delete after successful replacement: `apps/web/src/features/graph/graphGeometry.test.ts`

**Interfaces:**
- Consumes: `buildGraphSeries`, `buildDisplaySeries`, `createSquiglinkGraph`, workspace normalization, graph UI state.
- Produces: adapter-backed graph + only graph toolbar.

- [ ] **Step 1: Write failing toolbar/state tests**

```tsx
expect(screen.getByRole('button', { name: 'Bass' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Mids' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Treble' })).toBeInTheDocument()
expect(screen.getByLabelText('Normalize dB')).toBeInTheDocument()
expect(screen.getByLabelText('Normalize Hz')).toBeInTheDocument()
expect(screen.getByLabelText('Smooth')).toBeInTheDocument()
expect(screen.getByRole('button', { name: /inspect/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /label/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /screenshot/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /recolor/i })).toBeInTheDocument()
```

Click Bass twice and assert `full -> bass -> full`; set normalization Hz to 500 and verify workspace state; attempt 25000 and verify state is unchanged.

- [ ] **Step 2: Rewrite graph component tests around adapter input semantics**

For two FRs, one Target, active FR, and enabled filters:

```ts
expect(series.map((item) => item.name)).toEqual([
  'FR 1',
  'FR 1 EQ',
  'FR 2',
  'Target 1',
])
expect(series.some((item) => /PEQ|Desired|Selected Filter/.test(item.name))).toBe(false)
```

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph/GraphToolbar.test.tsx src/features/graph/FrequencyResponseGraph.component.test.tsx src/features/graph/FrequencyResponseGraph.test.ts
```

- [ ] **Step 4: Implement the React adapter lifecycle**

```tsx
const svgRef = useRef<SVGSVGElement | null>(null)
const controllerRef = useRef<SquiglinkGraphController | null>(null)

useEffect(() => {
  if (svgRef.current === null) return
  const controller = createSquiglinkGraph(svgRef.current, graphState, {
    onInspector: setInspectorReading,
  })
  controllerRef.current = controller
  return () => {
    controller.destroy()
    controllerRef.current = null
  }
}, [])

useEffect(() => {
  controllerRef.current?.update(graphState)
}, [graphState])
```

D3 must mutate only `<svg ref={svgRef}>` descendants.

- [ ] **Step 5: Build graph state from semantic series + display transforms**

```ts
const semantic = buildGraphSeries(derived)
const display = buildDisplaySeries(semantic, curveAppearance, baselineCurveId)
const graphState: SquiglinkGraphState = {
  series: display.map((item) => {
    const appearance = resolveGraphSeriesAppearance(item, theme)
    return {
      id: item.id,
      name: item.name,
      data: item.displayData,
      color: appearance.color,
      dashed: appearance.lineStyle === 'dashed',
      visible: resolveSeriesVisibility(item, curveAppearance),
    }
  }),
  view: {
    zoom: graphZoomPreset,
    smoothingLevel,
    inspectorEnabled,
    labelsEnabled,
  },
}
```

Equalized FR visibility/offset follows its `sourceCurveId`; Targets stay neutral gray dashed.

- [ ] **Step 6: Implement the source-derived toolbar with canonical actions**

```tsx
const toggleZoom = (preset: Exclude<GraphZoomPreset, 'full'>) =>
  setGraphZoomPreset(graphZoomPreset === preset ? 'full' : preset)

const updateNormalizationHz = (value: number) => {
  if (value < MVP_NUMERIC_POLICY.minFrequencyHz || value > MVP_NUMERIC_POLICY.maxFrequencyHz) return
  setNormalization({ ...normalization, anchorHz: value })
}
```

Use the existing screenshot helper against the new SVG if its tests still pass; otherwise adapt that helper, not a second screenshot implementation. `recolor` changes visible FR measurement colors through existing palette selection; never recolor Targets or use UI amber as a semantic curve color.

- [ ] **Step 7: Remove old toolbar/geometry after grep proves no imports**

```bash
git grep -n "UtilityRail\|graphGeometry" -- apps/web/src || true
rm apps/web/src/components/layout/UtilityRail.tsx
rm apps/web/src/features/graph/graphGeometry.ts apps/web/src/features/graph/graphGeometry.test.ts
```

If grep shows a legitimate remaining import, migrate that import to the new graph/toolbar modules before running the `rm` commands; do not keep two graph implementations.

- [ ] **Step 8: Verify, commit, push, and smoke public graph behavior**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph src/state/uiStore.test.ts src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
pnpm --filter @autoeq-workbench/web build
git add -A apps/web/src
git commit -m "feat(web): switch to Squiglink graph renderer"
git push origin remake/squiglink-base
```

After CI/Pages, verify graph render, zoom, normalization, smoothing, inspect, labels, screenshot, recolor, Light/Dark, imports, and manual EQ on the public URL.

### Task 6: Replace Curves with the source-derived curve manager

**Files:**
- Create: `apps/web/src/features/curves/CurveManagerRow.tsx`
- Create: `apps/web/src/features/curves/CurveManagerRow.test.tsx`
- Modify: `apps/web/src/features/curves/CurvesTab.tsx`
- Modify: `apps/web/src/features/curves/CurveImport.tsx`
- Modify: `apps/web/src/features/curves/CurveImport.test.tsx`
- Delete after migration: `apps/web/src/features/curves/CurveAppearanceControls.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: workspace curve CRUD/active pair plus uiStore appearance/baseline/offset.
- Produces: source-derived rows with local import, active selection, visibility, recolor, baseline, offset, rename/remove.

- [ ] **Step 1: Write failing row/empty-state tests**

```tsx
expect(screen.getByRole('button', { name: /set .* active fr/i })).toBeInTheDocument()
expect(screen.getByRole('checkbox', { name: /visible/i })).toBeChecked()
expect(screen.getByRole('button', { name: /baseline/i })).toBeInTheDocument()
expect(screen.getByLabelText(/offset/i)).toHaveValue(0)
expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
```

For empty Curves, assert both local `Upload FR` and `Upload Target` actions are reachable. For Target row, assert it can become active Target. After offset/baseline actions, assert `workspaceStore.curves[0].rawPoints` is unchanged.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/curves src/App.test.tsx
```

- [ ] **Step 3: Implement row actions directly against existing stores**

```tsx
const activate = () => {
  if (curve.kind === 'fr') setActiveFr(curve.id)
  else setActiveTarget(curve.id)
}
const remove = () => {
  removeCurve(curve.id)
  unregisterCurve(curve.id)
}
const toggleBaseline = () =>
  setBaselineCurve(baselineCurveId === curve.id ? null : curve.id)
```

Offset writes only `uiStore.setCurveOffset`; visibility/color write only appearance state; rename/remove/active selection write workspace state.

- [ ] **Step 4: Recompose Curves using source manager density and existing parser**

```tsx
<section className="manage" aria-label="Curves workspace">
  <div className="curve-upload-actions">
    <CurveImport kind="fr" />
    <CurveImport kind="target" />
  </div>
  <div className="manageTable" role="list">
    {curves.map((curve) => (
      <CurveManagerRow key={curve.id} curve={curve} />
    ))}
  </div>
</section>
```

Keep `CurveImport` calling `parseCurveText` from core; do not add hosted Brands/Models selection.

- [ ] **Step 5: Delete superseded appearance component, verify, commit, push**

```bash
git grep -n "CurveAppearanceControls" -- apps/web/src || true
rm apps/web/src/features/curves/CurveAppearanceControls.tsx
pnpm --filter @autoeq-workbench/web test -- src/features/curves src/features/graph src/state/uiStore.test.ts src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add -A apps/web/src
git commit -m "feat(web): port Squiglink curve manager"
git push origin remake/squiglink-base
```

After CI/Pages, publicly test multiple FR/Targets, active pair switching, visibility, color, offset, baseline, rename/remove, and active FR EQ tracking.

### Task 7: Remake 02 completion gate

**Files:**
- Verification/fixes only in files changed above.

**Interfaces:**
- Produces: stable shell/graph/Curves baseline for Remake 03.

- [ ] **Step 1: Run the full repository gate**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/web build:pages
git diff --check
```

- [ ] **Step 2: Audit forbidden runtime references and graph-series regressions**

```bash
if git grep -n "vendor/squiglink" -- apps packages ':!docs/**'; then exit 1; fi
if grep -R "d3js.org\|cdnjs.cloudflare.com.*d3" apps/web/dist; then exit 1; fi
git grep -n "selectedFilter\|Desired\|PEQ" -- apps/web/src/features/graph apps/web/src/squiglink/graph || true
```

Review the final grep: any match must be a negative test/comment, not a rendered graph series.

- [ ] **Step 3: Verify public viewport/theme/function matrix**

```text
390x844 Light + Dark
1280x800 Light + Dark
Curves | Equalizer | Tools
D3 graph no overflow
20-20000 Hz source-like ticks/grid
Bass/Mids/Treble toggle and return Full
Normalize 20-20000 bound
Smooth 0 vs 5
Inspect/Label/Screenshot/Recolor
multiple FR/Target management
baseline/offset display-only
active FR EQ follows active FR
manual filters affect full-cascade FR EQ only
```

- [ ] **Step 4: Record final green/deployed SHA and stop**

Do not start Remake 03 until CI and Pages both point to the final Remake 02 SHA.

## Completion Gate

Remake 02 is complete only when shell/header/panels are source-derived, tabs are `Curves | Equalizer | Tools`, both themes work with the Workbench palette, D3 is bundled and lifecycle-contained, graph semantics remain FR/Target/active full-cascade FR EQ only, UtilityRail/old geometry are removed, source toolbar works, Curves uses source manager composition, view-only transforms do not mutate raw data, manual EQ still works, all repository checks pass, and the public site serves the same final green SHA. No legacy Squiglink AutoEQ runtime may exist.
