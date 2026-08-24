# Remake 02 — Shell, Graph, And Curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current visual shell and custom React/SVG graph with a source-derived Squiglink shell, toolbar, D3 renderer, and curve manager while preserving all current FR/Target/filter functionality and publishing a usable site after every coherent step.

**Architecture:** React remains the application/lifecycle owner, Zustand remains canonical state, and `packages/core` remains the DSP/domain authority. A TypeScript adapter encapsulates a real D3 port of Squiglink's graph; D3 owns the SVG interior while React supplies semantic graph series and view state. Squiglink CSS/layout is copied into runtime source and parameterized with Workbench Light/Dark tokens rather than imported from `vendor/`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand 5, D3 v7, Tailwind 4 where already used, Vitest, Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Remake 01 must be complete: public Pages preview comes from successful `remake/squiglink-base` CI and `vendor/squiglink/` is present as reference-only source.
- Keep Vite + React + TypeScript; do not replace the app with legacy global HTML/JS.
- `packages/core` remains authoritative for parsing, normalization, filter DSP, preamp, and metrics.
- Zustand remains canonical application state; the D3 port must not create a second global workspace state.
- Do not import runtime code from `vendor/squiglink/`; adapted code lives under `apps/web/src/squiglink/`.
- Add D3 as a normal pnpm/Vite dependency; do not add `<script>` tags or CDN dependencies.
- Preserve the main graph semantic contract: imported FR(s), imported Target(s), and one full-cascade equalized FR for the active FR when filters exist; no isolated filter response and no selected-filter marker.
- Use Squiglink's graph `viewBox="0 0 800 346"`, log-frequency x axis, source-derived grid/ticks/zoom/interactions, but keep Workbench relative-dB semantics rather than Squiglink's absolute-SPL y-domain.
- Source zoom ranges are fixed as: Bass 20-400 Hz, Mids 100-4000 Hz, Treble 1000-20000 Hz, Full 20-20000 Hz.
- Light and Dark both remain; Light remains default. Workbench palette/tokens replace Squiglink colors.
- New information architecture is exactly `Curves | Equalizer | Tools`.
- `UtilityRail` must disappear once the source-derived toolbar owns its functions; do not leave duplicate user-facing controls.
- Normalization remains non-destructive and bounded to 20-20000 Hz.
- Baseline, offset, smoothing, visibility, and labels are display-state only and must not mutate imported raw curve samples.
- Keep the public site usable at each pushed migration checkpoint.
- No legacy Squiglink AutoEQ code may enter runtime.

---

### Task 1: Add D3 and define source-derived graph view state

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

- [ ] **Step 1: Write failing state tests for the new dock and graph-view contract**

Add tests that assert:

```ts
const store = createUiStore(() => 0)
expect(store.getState().activeDockTab).toBe('curves')
expect(store.getState().graphZoomPreset).toBe('full')
expect(store.getState().smoothingLevel).toBe(5)
expect(store.getState().labelsEnabled).toBe(true)
expect(store.getState().baselineCurveId).toBeNull()

store.getState().setActiveDockTab('tools')
store.getState().setGraphZoomPreset('bass')
store.getState().setSmoothingLevel(0)
store.getState().toggleLabels()
expect(store.getState().activeDockTab).toBe('tools')
expect(store.getState().graphZoomPreset).toBe('bass')
expect(store.getState().smoothingLevel).toBe(0)
expect(store.getState().labelsEnabled).toBe(false)
```

Also register a curve and assert its appearance is `{ color: <palette color>, visible: true, offsetDb: 0 }`, then assert `setCurveOffset(id, 3.5)` stores `3.5`, non-finite values are ignored, and removing the baseline curve clears `baselineCurveId`.

- [ ] **Step 2: Run the targeted store tests and confirm they fail**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
```

Expected: failures because `tools`, zoom/smoothing/labels/baseline, and offsets are not implemented.

- [ ] **Step 3: Install D3 and type declarations**

```bash
pnpm --filter @autoeq-workbench/web add d3
pnpm --filter @autoeq-workbench/web add -D @types/d3
```

Expected: `apps/web/package.json` gains `d3` under dependencies and `@types/d3` under devDependencies; lockfile updates once.

- [ ] **Step 4: Implement the UI state contract minimally**

Use these exact defaults and validation rules:

```ts
activeDockTab: 'curves'
inspectorEnabled: true
labelsEnabled: true
graphZoomPreset: 'full'
smoothingLevel: 5
baselineCurveId: null
```

`setSmoothingLevel` accepts finite values `>= 0` and ignores negative/non-finite values. `setCurveOffset` accepts finite values only. `setBaselineCurve(id)` accepts `null` or an already-registered curve id. `unregisterCurve(id)` must clear `baselineCurveId` if the removed curve was the baseline.

- [ ] **Step 5: Run targeted tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the state/dependency boundary**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/state/uiStore.ts apps/web/src/state/uiStore.test.ts
git commit -m "feat(web): add Squiglink graph view state"
```

### Task 2: Port the Squiglink shell and shared style language without replacing the working graph yet

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
- Modify: `apps/web/src/main.tsx` only if explicit CSS imports are cleaner there

**Interfaces:**
- Consumes: existing `FrequencyResponseGraph`, `CurvesTab`, `EqualizerTab`, `MetricsSummary`, theme store.
- Produces: source-derived primary/secondary shell with `Curves | Equalizer | Tools`; existing graph and functionality remain mounted during this task.

- [ ] **Step 1: Copy the upstream stylesheet into runtime source as an adapted baseline**

Copy `vendor/squiglink/style-alt.css` to `apps/web/src/squiglink/styles/squiglink-base.css` and add a header comment:

```css
/*
 * Adapted from squiglink/lab style-alt.css at
 * 9ff842c539b058cc726207b689c904c9efff75fd (0BSD).
 * Runtime copy: edit here; vendor/squiglink remains immutable.
 */
```

Do not import from `vendor/`. Remove only selectors that directly depend on ads, Patreon/premium elements, hosted Brands/Models database UI, or remote branding assets when those selectors conflict with the new shell. Preserve source layout/responsive/control rules rather than rewriting them from memory.

- [ ] **Step 2: Add Workbench theme tokens as an override layer**

Create `workbench-theme.css` with shared semantic variables and Light default:

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

Map source background/surface/text/border/accent declarations to these variables in the override layer. Do not recolor semantic graph-series lines with `--wb-accent`.

- [ ] **Step 3: Write failing shell tests before changing App composition**

Assert that the rendered app has:

```text
AutoEQ Workbench
Curves
Equalizer
Tools
```

and no `Details` tab label. Switch to `Tools` and assert interim analysis includes `MAE`, `RMSE`, and `Preamp` so the new tab is useful before Remake 04.

- [ ] **Step 4: Run shell tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/App.test.tsx src/features/tools/ToolsInterim.test.tsx
```

Expected: FAIL because current IA is `Curves | Equalizer | Details` and `ToolsInterim` does not exist.

- [ ] **Step 5: Implement the source-derived shell around the existing functional graph**

`ToolsInterim` should be deliberately small:

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

Update the dock to use exactly `Curves | Equalizer | Tools`. Recompose `App.tsx` using source-derived `.main`, `.parts-primary`, `.parts-secondary`, `.graphBox`, `.controls`, and tab/panel relationships, but leave the current `FrequencyResponseGraph` mounted in the graph region for this task.

`AppHeader` displays the textual wordmark `AutoEQ Workbench` in the position/role occupied by Squiglink branding; no generated logo or Squiglink logo asset.

- [ ] **Step 6: Import the runtime CSS and run targeted tests**

```bash
pnpm --filter @autoeq-workbench/web test -- src/App.test.tsx src/features/tools/ToolsInterim.test.tsx src/components/layout/__tests__
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Run the full web build and manually inspect both themes at desktop/mobile widths**

```bash
pnpm --filter @autoeq-workbench/web build
pnpm --filter @autoeq-workbench/web dev --host 0.0.0.0
```

Inspect at approximately 390 px and 1280 px viewport widths. Verify graph remains prominent, panel layout follows source proportions, controls do not overlap, and Light/Dark use Workbench colors.

- [ ] **Step 8: Commit and publish this functional shell checkpoint**

```bash
git add apps/web/src apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): port Squiglink shell"
git push origin remake/squiglink-base
```

Wait for CI/Pages and smoke-test public FR/Target import plus manual EQ before continuing.

### Task 3: Extract pure display transforms for offset and baseline

**Files:**
- Create: `apps/web/src/squiglink/graph/displayTransform.ts`
- Create: `apps/web/src/squiglink/graph/displayTransform.test.ts`
- Modify: `apps/web/src/features/graph/graphSeries.ts` only if readonly typing needs tightening

**Interfaces:**
- Consumes: existing semantic `GraphSeries[]`, `curveAppearance`, `baselineCurveId`.
- Produces:

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

- [ ] **Step 1: Write tests proving view transforms do not mutate semantic data**

Use synthetic curves and assert:

```ts
const sourceData = [[100, 1], [1000, 2], [10000, 3]] as const
const result = buildDisplaySeries(series, appearance, null)
expect(result[0]!.displayData).toEqual([[100, 4], [1000, 5], [10000, 6]]) // +3 dB offset
expect(series[0]!.data).toEqual(sourceData)
```

Also assert that an equalized-FR series inherits the offset of its `sourceCurveId`.

For a selected baseline, assert the baseline renders at 0 dB at its own points and another series renders as `series - interpolatedBaseline`; raw `GraphSeries.data` remains byte-equal before/after.

- [ ] **Step 2: Run the test and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/displayTransform.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic log-frequency interpolation for display-only baseline subtraction**

Use a private helper with this contract:

```ts
function interpolateLogFrequency(
  data: readonly [number, number][],
  frequencyHz: number,
): number | null
```

Rules:

```text
frequency <= first point -> first value only when equal, otherwise null
frequency >= last point  -> last value only when equal, otherwise null
interior                  -> linear interpolation in log10(frequency)
invalid/non-positive f    -> null
```

`buildDisplaySeries` first applies each series' visual offset, then subtracts the selected baseline's offset-adjusted value at matching/interpolated frequencies. If a baseline value is unavailable for a point, omit that display point rather than extrapolating.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/displayTransform.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the display-only transform boundary**

```bash
git add apps/web/src/squiglink/graph/displayTransform.ts apps/web/src/squiglink/graph/displayTransform.test.ts apps/web/src/features/graph/graphSeries.ts
git commit -m "feat(web): add graph display transforms"
```

### Task 4: Port the D3 graph behind a lifecycle-safe TypeScript adapter

**Files:**
- Create: `apps/web/src/squiglink/graph/types.ts`
- Create: `apps/web/src/squiglink/graph/smoothing.ts`
- Create: `apps/web/src/squiglink/graph/smoothing.test.ts`
- Create: `apps/web/src/squiglink/graph/createSquiglinkGraph.ts`
- Create: `apps/web/src/squiglink/graph/createSquiglinkGraph.test.ts`

**Interfaces:**
- Produces:

```ts
export type GraphZoomPreset = 'full' | 'bass' | 'mids' | 'treble'

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

export interface SquiglinkGraphCallbacks {
  onInspector(reading: SquiglinkInspectorReading | null): void
}

export interface SquiglinkGraphController {
  update(next: SquiglinkGraphState): void
  destroy(): void
}

export function createSquiglinkGraph(
  svg: SVGSVGElement,
  initial: SquiglinkGraphState,
  callbacks: SquiglinkGraphCallbacks,
): SquiglinkGraphController
```

- [ ] **Step 1: Port and test the source smoothing functions as a pure module**

Extract the algebra from `vendor/squiglink/graphtool.js` functions `pair`, `smooth_prep`, `smooth_eval`, and `smooth`, replacing global `smooth_level`, `smooth_scale`, and cached `smooth_param` with explicit arguments/cache local to the module.

Expose:

```ts
export function smoothGraphSeries(
  data: readonly [number, number][],
  level: number,
  scale?: number,
): [number, number][]
```

Tests must assert:

```text
level 0 returns numerically identical points
frequencies never change
constant dB input remains constant within 1e-9
output length equals input length
input arrays are not mutated
```

- [ ] **Step 2: Write adapter tests before implementation**

In jsdom, create an SVG and assert after mount:

```ts
expect(svg.getAttribute('viewBox')).toBe('0 0 800 346')
expect(svg.querySelectorAll('[data-graph-axis="x"]')).toHaveLength(1)
expect(svg.querySelectorAll('[data-graph-axis="y"]')).toHaveLength(1)
expect(svg.querySelectorAll('[data-series-id="fr-1"]')).toHaveLength(1)
```

Call `update()` twice and assert axes/series are not duplicated. Call `destroy()` and assert adapter-created nodes/listeners are removed.

- [ ] **Step 3: Run targeted graph tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/smoothing.test.ts src/squiglink/graph/createSquiglinkGraph.test.ts
```

Expected: FAIL because the modules are not implemented.

- [ ] **Step 4: Port the source graph structure and axes into the adapter**

Use the upstream source as the line-by-line reference for SVG structure, tick hierarchy, log x scale, natural curve rendering, fades/labels/inspector behavior. Keep these exact source contracts:

```ts
const GRAPH_VIEWBOX = '0 0 800 346'
const X_FULL: [number, number] = [20, 20_000]
const ZOOM_RANGES = {
  full: [20, 20_000],
  bass: [20, 400],
  mids: [100, 4_000],
  treble: [1_000, 20_000],
} as const
```

Keep the Squiglink x tick family:

```ts
[20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800,
 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000]
```

Adapt only the y-domain to Workbench relative dB. Use a fixed initial domain:

```ts
const Y_DOMAIN: [number, number] = [-30, 25]
```

and render +25 at the top / -30 at the bottom. Do not add an SPL offset or reinterpret Workbench 0 dB as Squiglink absolute SPL.

- [ ] **Step 5: Implement data joins and update semantics**

Use D3 keyed joins by `series.id`. `update()` must update domain, paths, dash pattern, color, visibility, smoothing, labels, and inspector state without recreating the whole SVG. Use `d3.curveNatural` for smoothed rendering and the source's unsmoothed cardinal behavior when smoothing level is zero.

Targets are passed in with `dashed: true`; measurements/equalized FR use `dashed: false`.

- [ ] **Step 6: Implement cleanup explicitly**

Track namespaced D3/DOM handlers and remove them in `destroy()`. Cancel active transitions and remove adapter-created groups/defs/overlays. The controller must be safe to destroy once even if React unmounts during an update.

- [ ] **Step 7: Run targeted tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/graph/smoothing.test.ts src/squiglink/graph/createSquiglinkGraph.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the D3 adapter in isolation**

```bash
git add apps/web/src/squiglink/graph
git commit -m "feat(web): port Squiglink D3 graph"
```

### Task 5: Replace the old graph component and UtilityRail with the ported graph + source toolbar

**Files:**
- Create: `apps/web/src/features/graph/GraphToolbar.tsx`
- Create: `apps/web/src/features/graph/GraphToolbar.test.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.component.test.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.test.ts`
- Modify: `apps/web/src/features/graph/graphAppearance.ts`
- Modify: `apps/web/src/features/graph/graphAppearance.test.ts`
- Modify: `apps/web/src/App.tsx`
- Delete after replacement tests pass: `apps/web/src/components/layout/UtilityRail.tsx`
- Delete after replacement tests pass if no longer imported: `apps/web/src/features/graph/graphGeometry.ts`
- Delete after replacement tests pass if no longer needed: `apps/web/src/features/graph/graphGeometry.test.ts`

**Interfaces:**
- Consumes: `buildGraphSeries(derived)`, `buildDisplaySeries(...)`, uiStore graph view state, workspace normalization.
- Produces: React wrapper around `createSquiglinkGraph`; source-derived toolbar is the only graph toolbar.

- [ ] **Step 1: Rewrite component tests around semantic behavior instead of old SVG internals**

Tests must assert that with two FRs, one Target, active FR, and enabled filters, the adapter input contains exactly:

```text
FR 1
FR 1 EQ
FR 2
Target 1
```

and never contains `PEQ`, `Desired`, or selected-filter series. Preserve existing tests for equalized-FR naming and target styling.

- [ ] **Step 2: Write toolbar tests**

Render `GraphToolbar` and assert controls named:

```text
Bass
Mids
Treble
Normalize dB
Normalize Hz
Smooth
inspect
label
screenshot
recolor
```

Click Bass twice and assert `graphZoomPreset` goes `full -> bass -> full`. Enter normalization frequency `500` and target `0` and assert workspace normalization updates through `setNormalization`. Enter `25000` Hz and assert state remains unchanged. Toggle inspect/label and assert uiStore state changes.

- [ ] **Step 3: Run graph/toolbar tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph/GraphToolbar.test.tsx src/features/graph/FrequencyResponseGraph.component.test.tsx src/features/graph/FrequencyResponseGraph.test.ts
```

Expected: FAIL until the new wrapper/toolbar is implemented.

- [ ] **Step 4: Implement the React lifecycle wrapper**

`FrequencyResponseGraph` must create the controller only when its SVG node mounts:

```tsx
useEffect(() => {
  if (svgRef.current === null) return
  const controller = createSquiglinkGraph(svgRef.current, graphState, callbacks)
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

Do not make D3 mutate React-owned siblings.

- [ ] **Step 5: Build adapter input from canonical Workbench state**

For each semantic series:

```text
measurement FR -> appearance color, solid, appearance.visible
measurement Target -> neutral gray, dashed, appearance.visible
equalized FR -> deterministic distinct FR-EQ color, solid, inherits source FR visibility/offset
```

Run `buildDisplaySeries` before passing points to D3. Baseline/offset remain view-only.

- [ ] **Step 6: Port toolbar behavior and reuse the existing screenshot helper where it remains valid**

Use source toolbar composition. Keep normalization in workspace state. Keep source zoom ranges. Keep smoothing level in uiStore. Reuse `graphScreenshot.ts` only if it works against the new SVG; otherwise adapt it behind the same local-only screenshot behavior and retain its existing unit tests.

`recolor` cycles/reassigns visible FR colors through the existing measurement palette; it must not recolor Target gray or use the amber UI accent as a graph-series color.

- [ ] **Step 7: Remove the duplicate old UtilityRail and obsolete geometry only after imports are gone**

Run before deleting:

```bash
git grep -n "UtilityRail\|graphGeometry" -- apps/web/src
```

Delete each file only when no runtime/test import still requires it.

- [ ] **Step 8: Run targeted and broad web tests**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph src/state/uiStore.test.ts src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
pnpm --filter @autoeq-workbench/web build
```

Expected: PASS.

- [ ] **Step 9: Commit and publish the graph replacement checkpoint**

```bash
git add apps/web/src apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): switch to Squiglink graph renderer"
git push origin remake/squiglink-base
```

On the public URL verify graph render, Bass/Mids/Treble toggle, normalization, smoothing, inspect, labels, screenshot, recolor, Light/Dark, FR import, Target import, and manual filter EQ.

### Task 6: Replace the Curves panel with a Squiglink-derived manager

**Files:**
- Create: `apps/web/src/features/curves/CurveManagerRow.tsx`
- Create: `apps/web/src/features/curves/CurveManagerRow.test.tsx`
- Modify: `apps/web/src/features/curves/CurvesTab.tsx`
- Modify: `apps/web/src/features/curves/CurveAppearanceControls.tsx` or delete it after migration
- Modify: `apps/web/src/features/curves/CurveImport.tsx`
- Modify: `apps/web/src/features/curves/CurveImport.test.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: workspace curve CRUD/active pair, uiStore appearance/baseline/offset state.
- Produces: source-derived curve rows with active state, visibility, recolor, baseline, offset, rename/remove, and local FR/Target import.

- [ ] **Step 1: Write manager-row tests for every approved state mutation**

For an FR row, assert controls can:

```text
make FR active
hide/show
set baseline / clear baseline
change display offset
rename
remove
```

For a Target row, assert it can become active Target and retains neutral graph styling despite row controls. Assert setting offset or baseline does not change `workspaceStore.curves[*].rawPoints`.

- [ ] **Step 2: Write Curves empty/populated-state tests**

Empty state must present a prominent source-derived import action rather than two disconnected empty lists. The import affordance may expose `Upload FR` and `Upload Target` directly or from one compact chooser, but both must remain local file inputs using current parser behavior.

Populated state must show all FR and Target curves in one manager composition with a visible semantic marker/label distinguishing FR from Target.

- [ ] **Step 3: Run the tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/curves src/App.test.tsx
```

Expected: FAIL until the source-derived manager exists.

- [ ] **Step 4: Implement `CurveManagerRow` using existing stores rather than local duplicate curve state**

Do not store a second copy of curve name/color/visibility/offset. Read/write directly through:

```ts
workspaceStore: setActiveFr, setActiveTarget, renameCurve, removeCurve
uiStore: setCurveVisible, setCurveColor, setCurveOffset, setBaselineCurve
```

On remove, call both workspace removal and `unregisterCurve(curve.id)` so appearance/baseline state is cleaned.

- [ ] **Step 5: Recompose `CurvesTab` with source manager density and controls**

Use the Squiglink manager row/inline-icon proportions and responsive behavior as the source reference. Preserve local `.txt/.csv` parsing by continuing to call `parseCurveText` through `CurveImport`; do not port Squiglink's hosted measurement selection/database behavior.

- [ ] **Step 6: Run curve + graph integration tests**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/curves src/features/graph src/state/uiStore.test.ts src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Delete the old curve appearance component if fully superseded**

```bash
git grep -n "CurveAppearanceControls" -- apps/web/src
```

If only its own file remains, delete it and rerun the targeted tests.

- [ ] **Step 8: Commit and publish Curves migration**

```bash
git add apps/web/src
git commit -m "feat(web): port Squiglink curve manager"
git push origin remake/squiglink-base
```

Public smoke: import multiple FRs/Targets, switch active pair, hide/show, offset, baseline, recolor, rename/remove, verify active FR EQ follows active FR, and refresh root.

### Task 7: Close Remake 02 with full regression and source/runtime audit

**Files:**
- Modify only if failures expose defects in Remake 02 files.

**Interfaces:**
- Produces: stable published shell/graph/curves gate for Remake 03.

- [ ] **Step 1: Run the complete repository gate**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/web build:pages
git diff --check
```

Expected: all exit 0.

- [ ] **Step 2: Audit forbidden runtime references**

```bash
if git grep -n "vendor/squiglink" -- apps packages ':!docs/**'; then
  echo "Runtime import/reference to vendor is forbidden" >&2
  exit 1
fi
if grep -R "d3js.org\|cdnjs.cloudflare.com.*d3" apps/web/dist; then
  echo "CDN D3 reference found" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 3: Audit graph semantics**

Search the new graph runtime and tests:

```bash
git grep -n "selectedFilter\|Desired\|PEQ" -- apps/web/src/features/graph apps/web/src/squiglink/graph
```

Any match must be a negative test/assertion/documentation comment, not a rendered series path.

- [ ] **Step 4: Public visual/functional acceptance**

Verify at mobile and desktop widths in both Light and Dark:

```text
source-derived header/shell proportions
Curves | Equalizer | Tools tabs
800x346 D3 graph responsive inside its container
20 Hz-20 kHz log axis and source-like ticks/grid
Bass/Mids/Treble zoom toggle and return to Full
normalization fields bounded 20-20000 Hz
smoothing 0 and 5 visibly work
inspect/label/screenshot/recolor work
multiple FR/Target rows manage correctly
baseline/offset are display-only
active FR EQ moves with active FR
manual filters still alter only the active FR EQ curve
no isolated filter curve/marker
Light/Dark preserve Workbench palette
```

- [ ] **Step 5: Push the final fixes, wait for CI/Pages, and record evidence**

Do not start Remake 03 until the public SHA matches the final green Remake 02 SHA.

## Completion Gate

Remake 02 is complete only when:

1. the whole shell/header/panel relationship is source-derived from Squiglink and branded only as `AutoEQ Workbench`;
2. tabs are exactly `Curves | Equalizer | Tools` and interim Tools still exposes useful Analysis;
3. Light/Dark both work with Light default and Workbench palette;
4. D3 is bundled through pnpm/Vite, with no CDN or runtime vendor dependency;
5. the old custom React/SVG graph is replaced by a lifecycle-safe D3 adapter using `viewBox 0 0 800 346`;
6. graph x-axis/zoom/tick behavior follows Squiglink while y values remain Workbench relative dB;
7. graph displays only FR(s), Target(s), and active full-cascade FR EQ;
8. toolbar replaces UtilityRail and all approved controls work;
9. Curves uses source-derived manager composition and supports local FR/Target import, active selection, visibility, recolor, baseline, offset, rename, and remove without mutating raw samples for view-only actions;
10. manual PEQ functionality remains intact even though Equalizer visual migration is deferred to Remake 03;
11. full repository verification and public mobile/desktop Light/Dark smoke checks pass;
12. no legacy Squiglink AutoEQ runtime has been introduced.

Stop and record final commit SHA, CI/Pages evidence, public URL, screenshots/observations from mobile and desktop, and any source-derived behavior intentionally adapted before starting Remake 03.
