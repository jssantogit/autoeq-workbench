# AutoEQ Workbench Visual Foundation Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Plan 1 with a Squiglink-inspired, graph-first Light/Dark responsive UI and fix the two numerical/derivation inconsistencies identified before the Standard AutoEQ engine begins.

**Architecture:** Preserve the existing React/ECharts/Zustand web layer and framework-independent `packages/core`. Add one shared core numeric policy, keep presentation preferences in a dedicated UI Zustand store, refactor the ECharts appearance into testable helpers, and replace the dashboard-like page with one graph + responsive `Curves | Equalizer | Details` dock used on both mobile and desktop.

**Tech Stack:** React, TypeScript, Vite, Apache ECharts, Zustand, Tailwind CSS v4 plus existing CSS classes/tokens, Vitest, Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-23-visual-foundation-closeout-design.md`

## Global Constraints

- Preserve `packages/core` as framework-agnostic; it must not import React, Zustand, Tailwind, ECharts, DOM APIs, or browser storage.
- Preserve the existing `apps/web` -> `packages/core` dependency direction.
- Keep ECharts; do not port Squiglink's D3 graph implementation.
- Do not copy Squiglink/Super Reviews logos, watermark, branding, database selectors, data, or site-specific yellow/blue identity.
- Squiglink/CrinGraph is an interaction/layout/graph-presentation reference only.
- Support `light` and `dark`; first load defaults to `light` unless a valid local theme preference already exists.
- UI accent is amber/copper/brown. Measurement-curve colors are independent from the UI accent.
- Reference target curves render neutral gray and dashed/dotted.
- Measurement Source/Target FR curves receive independent graph colors and can be recolored by the user.
- Desktop and mobile use the same dock tabs: `Curves | Equalizer | Details`.
- Fixed MVP numeric policy remains 48,000 Hz and 20 Hz-20 kHz.
- Canonical evaluation grid becomes 96 points/octave and is shared by the manual workspace and future Standard-v1 engine.
- PEQ and preamp must be derivable without Target; Source + EQ must be derivable with Source alone; residual metrics require both Source and Target.
- Do not implement Standard AutoEQ in this plan.
- Do not introduce unsupported smoothing, labeling, export, database, or backend features just to mimic Squiglink controls.
- Use synthetic test curves only.
- Every task is test-first, reviewed, and committed separately.

---

## File Structure Locked by This Plan

```text
packages/core/src/config/
  numericPolicy.ts
packages/core/test/config/
  numericPolicy.test.ts

apps/web/src/state/
  uiStore.ts
  uiStore.test.ts
apps/web/src/components/layout/
  AppHeader.tsx
  ThemeToggle.tsx
  WorkbenchDock.tsx
  DockTabs.tsx
apps/web/src/components/layout/__tests__/
  WorkbenchDock.test.tsx
apps/web/src/features/curves/
  CurvesTab.tsx
  CurveAppearanceControls.tsx
apps/web/src/features/graph/
  graphAppearance.ts
  graphAppearance.test.ts
  GraphToolbar.tsx
apps/web/src/features/filters/
  EqualizerTab.tsx
apps/web/src/features/metrics/
  DetailsTab.tsx
```

Existing files modified by this plan:

```text
packages/core/src/index.ts
apps/web/src/App.tsx
apps/web/src/index.css
apps/web/src/state/workspaceStore.ts
apps/web/src/state/workspaceStore.test.ts
apps/web/src/features/curves/CurveImport.tsx
apps/web/src/features/curves/CurveImport.test.tsx
apps/web/src/features/curves/NormalizationControls.tsx
apps/web/src/features/graph/FrequencyResponseGraph.tsx
apps/web/src/features/graph/FrequencyResponseGraph.component.test.tsx
apps/web/src/features/graph/FrequencyResponseGraph.test.ts
apps/web/src/features/graph/graphSeries.ts
apps/web/src/features/filters/FilterEditor.tsx
apps/web/src/features/filters/FilterRow.tsx
apps/web/src/features/filters/FilterEditor.test.tsx
apps/web/src/features/metrics/MetricsSummary.tsx
apps/web/src/manualWorkbench.test.tsx
docs/superpowers/plans/2026-08-23-02-autoeq-standard-engine.md
docs/superpowers/plans/README.md
```

---

### Task 1: Establish one canonical numeric policy and partial workspace derivation

**Files:**
- Create: `packages/core/src/config/numericPolicy.ts`
- Create: `packages/core/test/config/numericPolicy.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/workspaceStore.test.ts`

**Interfaces:**
- Produces `MVP_NUMERIC_POLICY`.
- Produces `createEvaluationGrid(): number[]`.
- `deriveWorkspace(state)` must expose PEQ/preamp independently from Source/Target completeness.
- Later Plan 2 must consume `MVP_NUMERIC_POLICY` instead of duplicating sample-rate/range/grid constants.

- [ ] **Step 1: Write failing core policy tests**

Create `packages/core/test/config/numericPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MVP_NUMERIC_POLICY, createEvaluationGrid } from '../../src/index.js'

describe('MVP numeric policy', () => {
  it('locks the shared 48 kHz 20 Hz-20 kHz 96 ppo evaluation policy', () => {
    expect(MVP_NUMERIC_POLICY).toEqual({
      sampleRateHz: 48_000,
      minFrequencyHz: 20,
      maxFrequencyHz: 20_000,
      evaluationPointsPerOctave: 96,
    })
  })

  it('creates a strictly increasing canonical evaluation grid', () => {
    const grid = createEvaluationGrid()
    expect(grid[0]).toBe(20)
    expect(grid.at(-1)).toBe(20_000)
    expect(grid.length).toBeGreaterThan(900)
    expect(grid.every((value, index) => index === 0 || value > grid[index - 1]!)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the targeted test and verify the expected failure**

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- test/config/numericPolicy.test.ts
```

Expected: FAIL because `MVP_NUMERIC_POLICY` / `createEvaluationGrid` do not exist.

- [ ] **Step 3: Implement the shared policy in core**

Create `packages/core/src/config/numericPolicy.ts`:

```ts
import { createLogGrid } from '../curves/grid.js'

export const MVP_NUMERIC_POLICY = Object.freeze({
  sampleRateHz: 48_000,
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  evaluationPointsPerOctave: 96,
})

export function createEvaluationGrid(): number[] {
  return createLogGrid(
    MVP_NUMERIC_POLICY.minFrequencyHz,
    MVP_NUMERIC_POLICY.maxFrequencyHz,
    MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  )
}
```

Export both from `packages/core/src/index.ts`.

- [ ] **Step 4: Run the core policy tests**

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- test/config/numericPolicy.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Add failing workspace tests for partial derivation**

In `apps/web/src/state/workspaceStore.test.ts`, add synthetic full-range Source and a +6 dB PK and assert:

```ts
it('derives PEQ and preamp without Source or Target', () => {
  const store = createWorkspaceStore()
  store.getState().addFilter('PK')
  const filter = store.getState().filters[0]!
  store.getState().updateFilter(filter.id, { gainDb: 6 })

  const derived = deriveWorkspace(store.getState())

  expect(derived.status).toBe('incomplete')
  expect(derived.peq).not.toBeNull()
  expect(derived.preamp?.preampDb).toBeLessThanOrEqual(-6)
  expect(derived.sourceEq).toBeNull()
  expect(derived.metrics).toBeNull()
})

it('derives Source + EQ with Source alone and waits for Target before residual metrics', () => {
  const store = createWorkspaceStore()
  store.getState().setSource(makeFlatCurve('source'))
  store.getState().addFilter('PK')
  const filter = store.getState().filters[0]!
  store.getState().updateFilter(filter.id, { gainDb: 3 })

  const derived = deriveWorkspace(store.getState())

  expect(derived.status).toBe('incomplete')
  expect(derived.sourceEq).not.toBeNull()
  expect(derived.peq).not.toBeNull()
  expect(derived.preamp).not.toBeNull()
  expect(derived.desired).toBeNull()
  expect(derived.metrics).toBeNull()
})

it('uses the canonical 96 ppo grid for comparable full-range curves', () => {
  const store = createWorkspaceStore()
  store.getState().setSource(makeFlatCurve('source'))
  store.getState().setTarget(makeFlatCurve('target'))

  const derived = deriveWorkspace(store.getState())

  expect(derived.status).toBe('ready')
  expect(derived.source?.frequencies).toEqual(createEvaluationGrid())
})
```

Use the existing synthetic curve helper style in the test file; do not add real measurements.

- [ ] **Step 6: Run the workspace tests and verify they fail for the current all-or-nothing derivation**

Run:

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
```

Expected: the new PEQ/preamp/source-only assertions FAIL.

- [ ] **Step 7: Refactor `deriveWorkspace` by dependency instead of by page readiness**

Replace hard-coded `createLogGrid(20, 20_000, 24)` / `48_000` uses with `createEvaluationGrid()` and `MVP_NUMERIC_POLICY.sampleRateHz`.

Required derivation order:

```ts
const frequencies = createEvaluationGrid()
const peqDb = cascadeMagnitudeDb(state.filters, frequencies, MVP_NUMERIC_POLICY.sampleRateHz)
const preamp = calculatePreampDb(state.filters, MVP_NUMERIC_POLICY.sampleRateHz)

// Always available numerically, including an empty-filter 0 dB response.
const peq = { frequencies, db: peqDb }

// Source + EQ only requires a full-range Source.
const sourceEq = preparedSourceOnEvaluationGrid === null
  ? null
  : { frequencies, db: applyEqToSource(preparedSourceOnEvaluationGrid.db, peqDb) }

// Desired/residual/metrics require both full-range curves.
const desired = preparedSourceOnEvaluationGrid !== null && preparedTargetOnEvaluationGrid !== null
  ? { frequencies, db: desiredCorrection(preparedSourceOnEvaluationGrid.db, preparedTargetOnEvaluationGrid.db) }
  : null
```

Status rules remain:

- `ready`: both Source and Target are valid and cover the working range;
- `incomplete`: one or both are absent;
- `coverage-error`: a present curve cannot support the required full-range derived operation.

Even on `incomplete`/curve coverage error, keep PEQ/preamp if filter math itself is valid.

- [ ] **Step 8: Run targeted core/web tests and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/config/numericPolicy.test.ts
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/core typecheck
pnpm --filter @autoeq-workbench/web typecheck
git add packages/core apps/web/src/state
git commit -m "fix: unify workbench evaluation policy"
```

---

### Task 2: Add presentation-only UI state, curve colors, and Light/Dark theme behavior

**Files:**
- Create: `apps/web/src/state/uiStore.ts`
- Create: `apps/web/src/state/uiStore.test.ts`

**Interfaces:**
- Produces `ThemeMode = 'light' | 'dark'`.
- Produces `DockTab = 'curves' | 'equalizer' | 'details'`.
- Produces `TargetPresentation = 'measurement' | 'reference'`.
- Produces `useUiStore` and `uiStore`.
- Produces `MEASUREMENT_CURVE_PALETTE` and `pickMeasurementColor(excluded, random?)`.
- Persists only theme under localStorage key `autoeq-workbench.theme` in this plan.

- [ ] **Step 1: Write failing UI-state tests**

Create `apps/web/src/state/uiStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEASUREMENT_CURVE_PALETTE,
  createUiStore,
  pickMeasurementColor,
} from './uiStore'

describe('UI preferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to light theme and Curves dock', () => {
    const store = createUiStore()
    expect(store.getState().theme).toBe('light')
    expect(store.getState().activeDockTab).toBe('curves')
  })

  it('restores a valid persisted dark preference', () => {
    localStorage.setItem('autoeq-workbench.theme', 'dark')
    const store = createUiStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('ignores invalid persisted theme values', () => {
    localStorage.setItem('autoeq-workbench.theme', 'sepia')
    const store = createUiStore()
    expect(store.getState().theme).toBe('light')
  })

  it('picks a measurement color from the palette while excluding an active color', () => {
    const random = vi.fn(() => 0)
    const picked = pickMeasurementColor([MEASUREMENT_CURVE_PALETTE[0]!], random)
    expect(picked).not.toBe(MEASUREMENT_CURVE_PALETTE[0])
    expect(MEASUREMENT_CURVE_PALETTE).toContain(picked)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
```

Expected: FAIL because `uiStore.ts` does not exist.

- [ ] **Step 3: Implement the UI store without leaking presentation into core**

Use a dedicated Zustand vanilla store. Initial contract:

```ts
export type ThemeMode = 'light' | 'dark'
export type DockTab = 'curves' | 'equalizer' | 'details'
export type TargetPresentation = 'measurement' | 'reference'

export interface UiState {
  theme: ThemeMode
  activeDockTab: DockTab
  sourceColor: string
  targetColor: string
  sourceVisible: boolean
  targetVisible: boolean
  targetPresentation: TargetPresentation
  setTheme: (theme: ThemeMode) => void
  setActiveDockTab: (tab: DockTab) => void
  setCurveColor: (role: 'source' | 'target', color: string) => void
  assignFreshCurveColor: (role: 'source' | 'target') => void
  setCurveVisible: (role: 'source' | 'target', visible: boolean) => void
  setTargetPresentation: (value: TargetPresentation) => void
}
```

Use a graph palette intentionally separate from amber UI tokens, for example:

```ts
export const MEASUREMENT_CURVE_PALETTE = [
  '#1565c0',
  '#c62828',
  '#2e7d32',
  '#6a1b9a',
  '#00838f',
  '#ad1457',
  '#3949ab',
  '#00796b',
] as const
```

`assignFreshCurveColor` should exclude the other active measurement color. `pickMeasurementColor` may use `Math.random` by default but accepts an injected random function for deterministic tests.

Theme persistence:

```ts
const THEME_KEY = 'autoeq-workbench.theme'

function readTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'dark' || value === 'light' ? value : 'light'
}
```

Guard browser-only storage access if the module can execute without `window`/`localStorage` in tests/build tooling.

- [ ] **Step 4: Apply theme to the document from one place**

When `setTheme()` succeeds, set:

```ts
document.documentElement.dataset.theme = theme
localStorage.setItem(THEME_KEY, theme)
```

Initialize the document dataset from the store once in `main.tsx` or a tiny `initializeTheme()` export; do not scatter document mutations across components.

- [ ] **Step 5: Run UI-state tests and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/uiStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/state apps/web/src/main.tsx
git commit -m "feat(web): add theme and graph presentation state"
```

---

### Task 3: Build the new theme tokens, header, and shared responsive dock shell

**Files:**
- Create: `apps/web/src/components/layout/AppHeader.tsx`
- Create: `apps/web/src/components/layout/ThemeToggle.tsx`
- Create: `apps/web/src/components/layout/DockTabs.tsx`
- Create: `apps/web/src/components/layout/WorkbenchDock.tsx`
- Create: `apps/web/src/components/layout/__tests__/WorkbenchDock.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- `AppHeader` renders product identity + theme control, not the current terminal status-pill row.
- `WorkbenchDock` renders the active tab from `UiState.activeDockTab`.
- `DockTabs` exposes exactly Curves/Equalizer/Details.

- [ ] **Step 1: Write a failing dock-navigation test**

```tsx
it('uses one Curves / Equalizer / Details dock and switches content without changing pages', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.getByRole('tab', { name: 'Curves' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel', { name: 'Curves' })).toBeVisible()

  await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
  expect(screen.getByRole('tab', { name: 'Equalizer' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel', { name: 'Equalizer' })).toBeVisible()

  await user.click(screen.getByRole('tab', { name: 'Details' }))
  expect(screen.getByRole('tabpanel', { name: 'Details' })).toBeVisible()
})
```

At this task, temporary tab panel children may wrap the existing controls; later tasks refine their internals.

- [ ] **Step 2: Write a failing theme-toggle test**

```tsx
it('starts light and lets the user switch to dark', async () => {
  const user = userEvent.setup()
  localStorage.clear()
  render(<App />)

  expect(document.documentElement.dataset.theme).toBe('light')
  await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('autoeq-workbench.theme')).toBe('dark')
})
```

- [ ] **Step 3: Run the tests and verify the current App fails the new shell contract**

```bash
pnpm --filter @autoeq-workbench/web test -- src/components/layout/__tests__/WorkbenchDock.test.tsx
```

Expected: FAIL because the shared dock/header do not exist.

- [ ] **Step 4: Implement semantic theme tokens in `index.css`**

Replace hard-coded dark/cyan page identity with central tokens. Use this starting point, refining only for contrast/readability:

```css
:root,
:root[data-theme='light'] {
  --color-bg: #f4f1ec;
  --color-bg-elevated: #fffdf9;
  --color-bg-subtle: #ece7df;
  --color-input: #fffdfa;
  --color-border: #d8d1c7;
  --color-border-strong: #b9afa2;
  --color-text: #24211f;
  --color-text-muted: #756e67;
  --color-text-faint: #9b938b;
  --color-accent: #f39a3b;
  --color-accent-hover: #df8427;
  --color-accent-active: #bd681d;
  --color-accent-soft: #fbe4ca;
  --color-focus: #b76420;
  --color-danger: #b42318;
  --color-success: #287a53;
  --color-graph-bg: #fffefa;
  --color-graph-grid-major: #d8d8d3;
  --color-graph-grid-minor: #ecece7;
  --color-graph-axis: #7b7b76;
  --color-target: #989894;
}

:root[data-theme='dark'] {
  --color-bg: #080c0e;
  --color-bg-elevated: #0e1417;
  --color-bg-subtle: #151c1f;
  --color-input: #12191c;
  --color-border: #293135;
  --color-border-strong: #465055;
  --color-text: #f1eee8;
  --color-text-muted: #aaa29a;
  --color-text-faint: #77716b;
  --color-accent: #f39a3b;
  --color-accent-hover: #ffad57;
  --color-accent-active: #c97727;
  --color-accent-soft: #362414;
  --color-focus: #ffb45e;
  --color-danger: #ff8580;
  --color-success: #67c99b;
  --color-graph-bg: #0b1012;
  --color-graph-grid-major: #2a3032;
  --color-graph-grid-minor: #1b2123;
  --color-graph-axis: #96918c;
  --color-target: #8f8e8a;
}
```

Rules:

- remove the current cyan grid-paper body background;
- use Open Sans/system-like sans appearance rather than monospace as the dominant type style;
- reserve monospace only for numeric values where it materially helps alignment;
- soften panel borders/radii to Squiglink-like geometry;
- use accent sparingly for active controls, not every border.

- [ ] **Step 5: Implement `ThemeToggle`, `AppHeader`, `DockTabs`, and `WorkbenchDock`**

Accessible tab semantics:

```tsx
<div role="tablist" aria-label="Workbench tools">
  <button role="tab" aria-selected={active === 'curves'}>Curves</button>
  <button role="tab" aria-selected={active === 'equalizer'}>Equalizer</button>
  <button role="tab" aria-selected={active === 'details'}>Details</button>
</div>
```

The header should contain `AutoEQ Workbench` and the theme toggle; remove the current row of `SOURCE EMPTY / TARGET EMPTY / FILTERS / CLEAN` pills from the visual header.

- [ ] **Step 6: Restructure `App.tsx` into graph + toolbar + shared dock**

Target shape:

```tsx
<main className="workbench">
  <AppHeader />
  <FrequencyResponseGraph derived={derived} />
  <GraphToolbar />
  <WorkbenchDock
    curves={<CurvesTab />}
    equalizer={<EqualizerTab />}
    details={<DetailsTab derived={derived} />}
  />
</main>
```

If the feature tabs do not exist yet, create minimal wrappers in this task that render the current controls; Tasks 5-7 finish them.

- [ ] **Step 7: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/components/layout/__tests__/WorkbenchDock.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/App.tsx apps/web/src/components apps/web/src/index.css
git commit -m "feat(web): add Squiglink-inspired workbench shell"
```

---

### Task 4: Refactor graph appearance into testable Squiglink-style presentation

**Files:**
- Create: `apps/web/src/features/graph/graphAppearance.ts`
- Create: `apps/web/src/features/graph/graphAppearance.test.ts`
- Create: `apps/web/src/features/graph/GraphToolbar.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.component.test.tsx`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.test.ts`
- Modify: `apps/web/src/features/graph/graphSeries.ts`

**Interfaces:**
- Produces `GraphAppearanceInput`.
- Produces `seriesAppearance(name, input)` and `graphTheme(theme)` pure helpers.
- `FrequencyResponseGraph` consumes UI curve preferences/theme instead of hard-coded cyan/orange/purple constants.
- `GraphToolbar` owns Reset View and graph-specific actions; AutoEQ controls do not live here.

- [ ] **Step 1: Write failing appearance tests for measurement vs reference target semantics**

```ts
it('renders a reference Target as neutral gray dashed instead of the UI accent', () => {
  const style = seriesAppearance('Target', {
    theme: 'light',
    sourceColor: '#1565c0',
    targetColor: '#c62828',
    targetPresentation: 'reference',
  })

  expect(style.color).toBe('#989894')
  expect(style.lineType).toBe('dashed')
})

it('renders a measurement Target with its assigned graph color', () => {
  const style = seriesAppearance('Target', {
    theme: 'light',
    sourceColor: '#1565c0',
    targetColor: '#c62828',
    targetPresentation: 'measurement',
  })

  expect(style.color).toBe('#c62828')
  expect(style.lineType).toBe('solid')
})

it('keeps Source independent from the amber UI accent', () => {
  const style = seriesAppearance('Source', {
    theme: 'light',
    sourceColor: '#1565c0',
    targetColor: '#c62828',
    targetPresentation: 'measurement',
  })
  expect(style.color).toBe('#1565c0')
  expect(style.color.toLowerCase()).not.toBe('#f39a3b')
})
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph/graphAppearance.test.ts
```

- [ ] **Step 3: Implement graph-specific theme constants and series styling**

Keep ECharts canvas colors in one TypeScript appearance module. Suggested derived-curve styles:

```ts
const DERIVED_COLORS = {
  light: {
    peq: '#7257a6',
    desired: '#b54f67',
    selectedFilter: '#2f3437',
  },
  dark: {
    peq: '#aa8ddd',
    desired: '#e07a91',
    selectedFilter: '#f3efe8',
  },
} as const
```

`Source + EQ` should visually relate to Source without becoming amber; use the Source color with a distinct line width/type/opacity rather than an unrelated UI accent.

- [ ] **Step 4: Refactor ECharts options to a clean FR presentation**

Required changes in `FrequencyResponseGraph.tsx`:

- no heavy outer graph frame;
- graph background uses the active graph theme;
- major/minor grids are subtle;
- axis label colors come from `graphTheme(theme)`;
- legend text follows theme;
- Source/Target colors come from UI store;
- Target line type follows `targetPresentation`;
- Source/Target visibility follows UI state while retaining user legend toggles;
- remove the current cyan `dataZoom` filler;
- keep inside zoom/pan;
- if the visible slider remains, make it neutral and visually secondary; on narrow mobile it may be hidden in CSS/option logic;
- retain zoom/legend state across derived-data updates;
- selected-filter Fc marker remains visible but theme-aware.

Do not change DSP data to achieve visual smoothing.

- [ ] **Step 5: Move Reset View into `GraphToolbar`**

Expose a small imperative callback or chart action hook so `GraphToolbar` can trigger Reset View without moving chart ownership out of `FrequencyResponseGraph`.

A minimal acceptable pattern is passing an `onResetReady` callback from App/toolbar wiring or retaining the reset control inside a compact toolbar region emitted by the graph component. Do not create a global chart singleton.

- [ ] **Step 6: Update component tests**

Tests must verify at least:

- ECharts still initializes once and disposes;
- target reference mode produces dashed gray style;
- changing theme updates chart colors without recreating domain data;
- changing source/target color updates presentation;
- previous zoom/legend interaction preservation test remains green.

Mock ECharts options rather than pixel-testing canvas output.

- [ ] **Step 7: Run graph tests and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/graph/FrequencyResponseGraph.test.ts src/features/graph/FrequencyResponseGraph.component.test.tsx src/features/graph/graphAppearance.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/graph
git commit -m "feat(web): restyle FR graph with Squiglink semantics"
```

---

### Task 5: Rebuild the Curves tab around import, appearance, and normalization

**Files:**
- Create: `apps/web/src/features/curves/CurvesTab.tsx`
- Create: `apps/web/src/features/curves/CurveAppearanceControls.tsx`
- Modify: `apps/web/src/features/curves/CurveImport.tsx`
- Modify: `apps/web/src/features/curves/CurveImport.test.tsx`
- Modify: `apps/web/src/features/curves/NormalizationControls.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- `CurvesTab` contains Source and Target work areas plus normalization.
- `CurveAppearanceControls` edits graph color/visibility; Target also selects `measurement | reference` presentation.
- Successful curve replacement assigns a fresh measurement color for that role.

- [ ] **Step 1: Write failing Source/Target appearance-control tests**

```tsx
it('assigns a fresh graph color after a successful Source import', async () => {
  const initial = uiStore.getState().sourceColor
  render(<CurveImport role="source" />)
  await importSyntheticFile('Import Source curve', 'Source.txt')
  expect(uiStore.getState().sourceColor).not.toBe(initial)
})

it('lets the user mark Target as a reference target', async () => {
  const user = userEvent.setup()
  render(<CurveAppearanceControls role="target" />)
  await user.click(screen.getByRole('radio', { name: 'Reference target' }))
  expect(uiStore.getState().targetPresentation).toBe('reference')
})

it('lets the user choose a measurement curve color', async () => {
  render(<CurveAppearanceControls role="source" />)
  fireEvent.change(screen.getByLabelText('Source curve color'), { target: { value: '#123456' } })
  expect(uiStore.getState().sourceColor).toBe('#123456')
})
```

- [ ] **Step 2: Run targeted tests and verify failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/curves/CurveImport.test.tsx
```

- [ ] **Step 3: Wire successful imports to presentation state**

After `setCurve(parsed)` succeeds in `CurveImport.handleFile`, call:

```ts
assignFreshCurveColor(role)
```

Do not change the color when parsing fails or a stale async import response is discarded.

Preserve the existing async race protection using `requestRef`.

- [ ] **Step 4: Implement `CurveAppearanceControls`**

Source controls:

- visibility toggle;
- color swatch / `<input type="color">`;
- accessible label.

Target controls:

- same visibility/color controls;
- presentation segmented/radio control:
  - `Measurement FR`
  - `Reference target`

When `Reference target` is selected, keep the stored custom target color intact for later return to measurement mode, but graph rendering ignores it and uses neutral gray dashed style.

- [ ] **Step 5: Build `CurvesTab` and simplify normalization layout**

Layout content:

```text
Curves
  Source card
    name/status/import
    visibility/color
    anchor Hz / target dB
  Target card
    name/status/import
    measurement/reference mode
    visibility/color
    anchor Hz / target dB
  Normalize Together
    anchor Hz / target dB / action
```

Reuse existing `NormalizationControls` actions/state; only reorganize markup/styles. Do not make normalization destructive.

- [ ] **Step 6: Apply Squiglink-like control geometry**

In CSS:

- rounded controls around 8-12 px, not current 2 px terminal geometry;
- inputs on subtle surfaces;
- status text as quiet labels rather than tiny bordered pills;
- stacked mobile layout, side-by-side Source/Target on wide dock;
- amber only for active interactive state/focus/primary action;
- file inputs may be visually wrapped by a button/label but must remain keyboard accessible.

- [ ] **Step 7: Run curve/normalization tests and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/curves/CurveImport.test.tsx src/features/curves/NormalizationControls.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/curves apps/web/src/index.css
git commit -m "feat(web): rebuild Curves dock experience"
```

---

### Task 6: Rebuild the Equalizer tab and make filter editing genuinely mobile-friendly

**Files:**
- Create: `apps/web/src/features/filters/EqualizerTab.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.tsx`
- Modify: `apps/web/src/features/filters/FilterRow.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- `EqualizerTab` hosts current manual EQ/filter editing; Plan 2 later inserts Standard AutoEQ controls into this tab.
- Filter behavior and limits remain unchanged: PK/LS/HS, 64 hard ceiling, enable/disable/add/remove/duplicate/reorder/undo/redo.

- [ ] **Step 1: Add failing semantics tests for the Equalizer tab**

```tsx
it('keeps manual filter editing inside the Equalizer dock', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: 'Equalizer' }))

  expect(screen.getByRole('button', { name: 'Add PK' })).toBeVisible()
  expect(screen.getByText('0 / 64 filters')).toBeVisible()
})

it('preserves enable, duplicate, reorder and delete actions after the visual refactor', async () => {
  const user = userEvent.setup()
  render(<FilterEditor />)
  await user.click(screen.getByRole('button', { name: 'Add PK' }))
  await user.click(screen.getByRole('button', { name: 'Duplicate filter 1' }))
  expect(workspaceStore.getState().filters).toHaveLength(2)
})
```

Use existing accessible names from `FilterRow`; adjust the test to the repository's current names rather than weakening accessibility.

- [ ] **Step 2: Run FilterEditor tests before markup changes**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters/FilterEditor.test.tsx
```

Record the green baseline before restructuring.

- [ ] **Step 3: Implement `EqualizerTab` with a future AutoEQ insertion point but no fake controls**

```tsx
export function EqualizerTab() {
  return (
    <section className="equalizer-tab" aria-label="Equalizer workspace">
      <div className="equalizer-tab__meta">
        <span>Manual</span>
        <span>48 kHz</span>
        <span>20 Hz-20 kHz</span>
      </div>
      <FilterEditor />
    </section>
  )
}
```

Do not render a disabled `Run AutoEQ` placeholder; Plan 2 owns that feature.

- [ ] **Step 4: Add explicit mobile labels to filter cells**

In `FilterRow.tsx`, every data cell gets `data-label`, e.g.:

```tsx
<td data-label="Type">...</td>
<td data-label="Fc">...</td>
<td data-label="Gain">...</td>
<td data-label="Q">...</td>
<td data-label="Actions">...</td>
```

- [ ] **Step 5: Convert narrow filter rows into responsive cards instead of a permanently wide table**

At desktop/tablet widths, keep the dense table.

At `max-width: 720px`, CSS should:

- visually hide the table header;
- make each `<tr>` a bordered/elevated grid/card;
- expose `data-label` text for numeric fields;
- put ON/#/Type on a compact first row;
- put Fc/Gain/Q in a three-column numeric row when width allows, falling to two/one columns only below ~380 px;
- keep actions touch-sized;
- eliminate normal horizontal scrolling for standard filter editing.

Do not duplicate a separate mobile Filter component unless CSS restructuring proves impossible.

- [ ] **Step 6: Preserve selected-filter and disabled-filter visual state**

Selected filter uses a restrained amber accent edge/background. Disabled rows reduce emphasis but keep editable values visible.

Do not alter underlying filter semantics.

- [ ] **Step 7: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters/FilterEditor.test.tsx src/manualWorkbench.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/filters apps/web/src/index.css
git commit -m "feat(web): rebuild responsive Equalizer dock"
```

---

### Task 7: Build the Details tab around metrics, preamp, and workspace state

**Files:**
- Create: `apps/web/src/features/metrics/DetailsTab.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx`
- Modify: `apps/web/src/manualWorkbench.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- `DetailsTab` consumes `WorkspaceDerived` and workspace status/provenance.
- Metrics summary must display preamp whenever derivable, including Source-only or no-curve manual EQ states.
- MAE/RMSE/max error remain unavailable until Source + Target comparison is valid.

- [ ] **Step 1: Add a failing partial-state metrics test**

```tsx
it('shows preamp in Details even before Target is loaded', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('tab', { name: 'Equalizer' }))
  await user.click(screen.getByRole('button', { name: 'Add PK' }))
  const gain = screen.getByRole('spinbutton', { name: 'Filter 1 gain dB' })
  await user.clear(gain)
  await user.type(gain, '6')
  fireEvent.blur(gain)

  await user.click(screen.getByRole('tab', { name: 'Details' }))
  expect(screen.getByText('Preamp').nextElementSibling).toHaveTextContent('-6')
  expect(screen.getByText('MAE').nextElementSibling).toHaveTextContent('--')
})
```

Because dense-grid overlap and conservative rounding can make preamp slightly more negative in other cases, do not globally assert exact `-6.00` unless this single-filter fixture mathematically guarantees it in current core tests.

- [ ] **Step 2: Run the integration test and verify the old page organization fails the new Details behavior**

```bash
pnpm --filter @autoeq-workbench/web test -- src/manualWorkbench.test.tsx
```

- [ ] **Step 3: Implement `DetailsTab`**

Show compact sections for:

- MAE;
- RMSE;
- max absolute error;
- max-error frequency when present in current metric contract;
- preamp;
- filter count;
- solution state (`clean`, `modified`, `stale`);
- filter provenance (`manual`, later `autoeq`);
- fixed numeric policy (`48 kHz`, `20 Hz-20 kHz`, `96 ppo evaluation`).

Do not invent RunManifest/export diagnostics before their owning plans.

- [ ] **Step 4: Restyle `MetricsSummary` as readable metric rows/tiles**

Use theme tokens, normal sans labels, and monospace only for numeric values. Avoid the current terminal-strip appearance.

- [ ] **Step 5: Run metrics/integration tests and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/manualWorkbench.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/metrics apps/web/src/index.css apps/web/src/manualWorkbench.test.tsx
git commit -m "feat(web): add Details dock metrics view"
```

---

### Task 8: Integrate, verify responsive behavior, and update the Plan 2 handoff

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/manualWorkbench.test.tsx`
- Modify: `docs/superpowers/plans/2026-08-23-02-autoeq-standard-engine.md`
- Modify: `docs/superpowers/plans/README.md`

**Interfaces:**
- Plan 1.5 completion gate becomes mandatory before Plan 2.
- Plan 2 `STANDARD_V1_CONFIG` must import/copy fixed product numeric values from `MVP_NUMERIC_POLICY`, not create a second independent 48k/20-20k/96ppo source of truth.

- [ ] **Step 1: Add the final app-level regression flow**

The integration test should exercise:

```text
initial Light theme
-> import synthetic Source
-> Source curve has a graph color
-> switch Curves Target presentation to Reference target
-> import synthetic Target
-> Normalize Together
-> switch Equalizer
-> add +3 dB PK
-> response and preamp update
-> disable filter
-> undo
-> switch Details
-> MAE/RMSE/preamp visible
-> switch Dark theme
```

Do not assert CSS pixel output in jsdom. Assert state, semantics, and chart option inputs.

- [ ] **Step 2: Update Plan 2 numeric config instructions**

In `2026-08-23-02-autoeq-standard-engine.md`, replace duplicated fixed numeric values in the config implementation snippet with the shared policy:

```ts
import { MVP_NUMERIC_POLICY } from '../config/numericPolicy.js'

export const STANDARD_V1_CONFIG = {
  profile: 'Standard',
  algorithmVersion: 'standard-v1',
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
  maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
  fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  // remaining Standard-specific bounds and algorithm constants unchanged
} as const
```

Update its invariant tests accordingly. This is a documentation-plan correction only; do not start implementing Plan 2.

- [ ] **Step 3: Update the plan index order**

`docs/superpowers/plans/README.md` must state:

```text
1. Plan 1 foundations/manual workbench
1.5 Visual Foundation Closeout
2. Standard AutoEQ engine
3. Integration/export/benchmarks
```

Explain that 1.5 freezes the graph/dock/theme foundation and closes the numeric-grid/partial-derivation issues before AutoEQ work begins.

- [ ] **Step 4: Run focused automated verification**

```bash
pnpm --filter @autoeq-workbench/core test
pnpm --filter @autoeq-workbench/web test
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Verify the Light desktop browser state directly**

At approximately 1440x900:

1. first load is Light;
2. graph is visually dominant and no longer enclosed by the old dark terminal panel treatment;
3. warm amber/copper is used for UI active controls, not measurement lines;
4. `Curves | Equalizer | Details` dock is immediately understandable;
5. Source/Target cards can sit side-by-side;
6. graph labels/grid are clean and Squiglink-like;
7. imported measurement curves have independent colors;
8. reference Target is gray dashed;
9. changing curve color updates graph without changing curve data;
10. manual filter editing and metrics still work.

- [ ] **Step 6: Verify the Dark desktop browser state directly**

Toggle Dark and verify:

- warm near-black surfaces;
- readable neutral text;
- amber remains restrained;
- graph grid/target remain visible without becoming high-contrast noise;
- measurement colors remain distinguishable.

- [ ] **Step 7: Verify mobile behavior directly**

At approximately 390x844 (and one narrower ~360 px check):

1. graph remains at the top and visually primary;
2. no page-level accidental horizontal overflow;
3. dock tabs remain usable with touch-sized targets;
4. Curves controls stack cleanly;
5. Equalizer filter rows become readable responsive cards/rows without ordinary horizontal table scrolling;
6. Details metrics remain readable;
7. theme toggle remains reachable;
8. graph itself remains usable without the dock pushing it into a tiny strip.

- [ ] **Step 8: Verify the numerical closeout cases directly**

Browser/manual check:

1. with no curves loaded, add a positive PK -> PEQ and preamp are available;
2. load Source only -> Source + EQ is available while MAE/RMSE remain unavailable;
3. load Target -> residual metrics become available;
4. disable the filter -> PEQ/preamp update;
5. undo -> previous filter state returns.

- [ ] **Step 9: Review actual diff for scope and reference-copy mistakes**

Review for:

- no Squiglink logo/watermark/assets/data copied;
- no hard-coded Super Reviews blue/yellow identity;
- no domain math moved into React;
- no ECharts/DSP coupling added to core;
- no real/user curve fixtures committed;
- no fake AutoEQ controls;
- no duplicate numeric policy constants left in the manual workspace;
- no unrelated refactor.

- [ ] **Step 10: Commit final integration/docs changes**

```bash
git add apps/web docs/superpowers/plans
git commit -m "chore: close visual foundation before AutoEQ engine"
```

---

## Plan 1.5 Completion Gate

Do **not** start Plan 2 until all of these are true:

- Light is the clean-install/default theme and Dark is user-toggleable/persisted;
- app visual identity is amber/copper/brown but measurement curves are not forced to amber;
- graph presentation is clearly closer to modern Squiglink in spacing, grid, axes, line treatment, and chrome while remaining ECharts-based;
- Source/Target measurement curves receive independent editable colors;
- reference Target curves render neutral gray dashed/dotted;
- desktop and mobile both use the same `Curves | Equalizer | Details` dock architecture;
- mobile filter editing does not rely on routine horizontal table scrolling;
- PEQ/preamp work without Target;
- Source + EQ works with Source alone;
- residual metrics require both Source and Target;
- manual workspace and future Standard engine share the 48 kHz / 20 Hz-20 kHz / 96 ppo numeric policy;
- existing import race safety, undo/redo, filter semantics, zoom preservation, and dense-grid preamp behavior remain intact;
- no Squiglink branding/data/assets are copied;
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check` pass;
- desktop and mobile browser verification is recorded in the implementation handoff.

When this gate is green, Plan 2 may start without another visual restructuring pass.
