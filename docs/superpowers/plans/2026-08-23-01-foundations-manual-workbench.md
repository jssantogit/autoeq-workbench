# AutoEQ Workbench Foundations & Manual Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monorepo foundation, framework-agnostic FR/DSP core, and a working graph-centered browser workbench where Source/Target can be imported, normalized, visualized, and manually EQ'd with PK/LS/HS filters.

**Architecture:** A pnpm workspace contains `packages/core` for deterministic numerical/domain logic and `apps/web` for React UI. The web app imports `@autoeq-workbench/core`, renders curves with ECharts, stores authoritative workspace state in Zustand, and recomputes derived responses from core functions rather than duplicating DSP logic.

**Tech Stack:** React, TypeScript, Vite, pnpm workspaces, Tailwind CSS v4 Vite plugin, Apache ECharts, Zustand, Vitest, Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`

## Global Constraints

- MVP is 100% client-side: no backend, account, database, or cloud persistence.
- Fixed project sample rate is 48,000 Hz.
- Working/visual frequency range is 20 Hz–20 kHz.
- Core supports `PK`, `LS`, and `HS` filters.
- Filter gain bounds are -15 dB to +15 dB; PK Q bounds are 0.1 to 12; shelf default Q is 0.7.
- `maxFilters` defaults to 10 and has a hard ceiling of 64.
- Imported raw points are immutable domain input; normalization/interpolation are derived operations.
- UI remains thin: no DSP formulas, metric definitions, parser rules, or export math inside React components.
- Quantization/AutoEQ are NOT implemented in this plan; this plan establishes the exact core interfaces they will consume.
- Follow Noqlen Playbook: inspect -> implement -> verify -> review; use synthetic/sanitized test data only.

---

## File Structure Locked by This Plan

```text
/
  AGENTS.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  apps/web/
    package.json
    vite.config.ts
    vitest.config.ts
    tsconfig.app.json
    src/
      App.tsx
      main.tsx
      index.css
      components/ui/{Button,NumberField,Panel}.tsx
      features/curves/{CurveImport,NormalizationControls}.tsx
      features/graph/FrequencyResponseGraph.tsx
      features/filters/{FilterEditor,FilterRow}.tsx
      features/metrics/MetricsSummary.tsx
      state/workspaceStore.ts
      state/history.ts
      test/setup.ts
  packages/core/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      index.ts
      types/{curve,filter,error}.ts
      io/parseCurve.ts
      curves/{grid,interpolate,normalize,derive}.ts
      dsp/{biquad,response,cascade}.ts
      metrics/{errorMetrics,preamp}.ts
    test/
      fixtures/curves.ts
      parseCurve.test.ts
      curves.test.ts
      biquad.test.ts
      cascade.test.ts
      metrics.test.ts
```

---

### Task 1: Bootstrap the workspace and verification harness

**Files:**
- Create: `AGENTS.md`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/smoke.test.ts`
- Create via Vite template then modify: `apps/web/*`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`

**Interfaces:**
- Produces package name `@autoeq-workbench/core` with ESM exports from `src/index.ts`.
- Produces root commands `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`.

- [ ] **Step 1: Create the pnpm workspace and Vite React app**

Run:

```bash
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - apps/*
  - packages/*
EOF

mkdir -p packages/core/src packages/core/test
pnpm create vite apps/web --template react-ts
pnpm add -D -w typescript vitest
pnpm --dir packages/core add -D vitest typescript
pnpm --dir apps/web add echarts zustand
pnpm --dir apps/web add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tailwindcss @tailwindcss/vite
```

Expected: `apps/web` is a React TypeScript Vite project and workspace dependencies resolve through pnpm.

- [ ] **Step 2: Add the root package scripts and core package contract**

Use this root `package.json` shape:

```json
{
  "name": "autoeq-workbench",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "engines": { "node": ">=22.12.0" }
}
```

Use this core `package.json` contract:

```json
{
  "name": "@autoeq-workbench/core",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "lint": "tsc --noEmit"
  }
}
```

Add `@autoeq-workbench/core: workspace:*` to `apps/web` dependencies.

- [ ] **Step 3: Configure Tailwind v4 and Vitest**

In `apps/web/vite.config.ts` use:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [react(), tailwindcss()] })
```

At the top of `apps/web/src/index.css` use:

```css
@import "tailwindcss";
```

In `apps/web/vitest.config.ts` use jsdom and `src/test/setup.ts`; in setup import `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Write smoke tests before domain code**

`packages/core/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('core harness', () => {
  it('runs deterministic tests', () => {
    expect(20 * 1000).toBe(20000)
  })
})
```

`apps/web/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the workbench title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /autoeq workbench/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Add repository-local agent guidance**

Create `AGENTS.md` with the applicable rules: Noqlen `Inspect -> Implement -> Verify -> Review`, core logic stays out of UI, synthetic fixtures only, no secrets/private curves committed, targeted tests before broad tests, and no deploy/merge/release without explicit request. Reference the approved spec and the three implementation plans.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .gitignore apps packages
git commit -m "chore: bootstrap AutoEQ Workbench workspace"
```

---

### Task 2: Define core domain types and parse two-column FR files

**Files:**
- Create: `packages/core/src/types/curve.ts`
- Create: `packages/core/src/types/filter.ts`
- Create: `packages/core/src/types/error.ts`
- Create: `packages/core/src/io/parseCurve.ts`
- Create: `packages/core/test/fixtures/curves.ts`
- Create: `packages/core/test/parseCurve.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `CurvePoint`, `Curve`, `CurveRole`, `Normalization`, `Filter`, `FilterType`, `CoreError`.
- Produces `parseCurveText(text: string, options: { name: string; role: 'source' | 'target' }): Curve`.

- [ ] **Step 1: Write parser tests**

Cover whitespace, tab, comma, semicolon, optional headers/comments, and explicit rejection of ambiguity/non-positive/non-finite/duplicate-conflict rows.

Representative test:

```ts
it('parses a whitespace-delimited curve with header', () => {
  const curve = parseCurveText('Frequency SPL\n20 81.2\n1000 90.0\n20000 82.1', {
    name: 'Source', role: 'source'
  })
  expect(curve.rawPoints).toEqual([
    { frequencyHz: 20, db: 81.2 },
    { frequencyHz: 1000, db: 90 },
    { frequencyHz: 20000, db: 82.1 }
  ])
})
```

Rejection test:

```ts
expect(() => parseCurveText('100,1,2\n200,3,4', { name: 'bad', role: 'source' }))
  .toThrowError(/ambiguous|columns/i)
```

- [ ] **Step 2: Run parser tests and observe failure**

```bash
pnpm --filter @autoeq-workbench/core test -- parseCurve.test.ts
```

Expected: FAIL because parser/types do not exist.

- [ ] **Step 3: Implement domain types and conservative parser**

Required parser behavior:

```ts
export function parseCurveText(
  text: string,
  options: { name: string; role: 'source' | 'target' }
): Curve
```

Algorithm:

1. normalize BOM/newlines;
2. remove blank lines and comment lines beginning `#`, `//`, or `; `;
3. detect one delimiter strategy from tab, semicolon, comma, or whitespace by requiring exactly two numeric columns on every data row;
4. permit a single leading non-numeric header row;
5. parse finite numbers;
6. require frequency > 0;
7. sort by frequency only if file order is not increasing, while preserving raw numeric values;
8. reject duplicate frequencies with conflicting dB values; collapse exact duplicates;
9. require at least two unique points;
10. return raw points without normalization/interpolation.

Use `CoreError` with category `parse` or `validation` instead of generic thrown strings.

- [ ] **Step 4: Export public types/functions and run tests**

```bash
pnpm --filter @autoeq-workbench/core test -- parseCurve.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "feat(core): parse frequency response curves"
```

---

### Task 3: Implement log-frequency interpolation, normalization, common grids, and desired correction

**Files:**
- Create: `packages/core/src/curves/grid.ts`
- Create: `packages/core/src/curves/interpolate.ts`
- Create: `packages/core/src/curves/normalize.ts`
- Create: `packages/core/src/curves/derive.ts`
- Create: `packages/core/test/curves.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `createLogGrid(minHz, maxHz, pointsPerOctave): number[]`.
- Produces `interpolateLogFrequency(points, frequencies): number[]`.
- Produces `normalizationOffset(points, normalization): number`.
- Produces `applyOffset(values, offsetDb): number[]`.
- Produces `prepareCurve(curve, normalization, frequencies): PreparedCurve`.
- Produces `desiredCorrection(sourceDb, targetDb): number[]`.

- [ ] **Step 1: Write interpolation and normalization tests**

```ts
it('interpolates linearly in log frequency', () => {
  const points = [
    { frequencyHz: 100, db: 0 },
    { frequencyHz: 10000, db: 20 }
  ]
  expect(interpolateLogFrequency(points, [1000])[0]).toBeCloseTo(10, 10)
})

it('normalizes without mutating raw points', () => {
  const raw = [{ frequencyHz: 500, db: 83 }, { frequencyHz: 1000, db: 86 }]
  const copy = structuredClone(raw)
  expect(normalizationOffset(raw, { anchorHz: 500, targetDb: 0 })).toBeCloseTo(-83)
  expect(raw).toEqual(copy)
})
```

- [ ] **Step 2: Run tests and observe failure**

```bash
pnpm --filter @autoeq-workbench/core test -- curves.test.ts
```

- [ ] **Step 3: Implement grid/interpolation/normalization**

`createLogGrid` must include exact endpoints and be deterministic. Use geometric spacing:

```ts
const octaves = Math.log2(maxHz / minHz)
const count = Math.ceil(octaves * pointsPerOctave)
frequency[i] = minHz * 2 ** (i / pointsPerOctave)
```

Clamp final sample to `maxHz`; never extrapolate beyond imported curve coverage without an explicit error/result marker.

For anchor normalization, interpolate the raw curve at `anchorHz` in log-frequency and return `targetDb - anchorDb`.

- [ ] **Step 4: Add desired correction test and implementation**

```ts
expect(desiredCorrection([0, 1, 2], [1, 0, 4])).toEqual([1, -1, 2])
```

Implementation is exact element-wise `target - source` with equal-length validation.

- [ ] **Step 5: Run core tests/typecheck**

```bash
pnpm --filter @autoeq-workbench/core test
pnpm --filter @autoeq-workbench/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/curves packages/core/src/index.ts packages/core/test/curves.test.ts
git commit -m "feat(core): add curve preparation pipeline"
```

---

### Task 4: Implement exact PK/LS/HS biquad magnitude response and cascade

**Files:**
- Create: `packages/core/src/dsp/biquad.ts`
- Create: `packages/core/src/dsp/response.ts`
- Create: `packages/core/src/dsp/cascade.ts`
- Create: `packages/core/test/biquad.test.ts`
- Create: `packages/core/test/cascade.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `biquadCoefficients(filter: Filter, sampleRateHz: number): BiquadCoefficients`.
- Produces `biquadMagnitudeDb(filter, frequencies, sampleRateHz): number[]`.
- Produces `cascadeMagnitudeDb(filters, frequencies, sampleRateHz): number[]`.

- [ ] **Step 1: Write neutral and center-frequency tests**

```ts
it('0 dB PK is magnitude-neutral', () => {
  const f = { id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 0, q: 1 }
  expect(biquadMagnitudeDb(f, [20, 1000, 20000], 48000)).toEqual(
    expect.arrayContaining([expect.closeTo(0, 8), expect.closeTo(0, 8), expect.closeTo(0, 8)])
  )
})

it('PK magnitude at Fc matches gain', () => {
  const f = { id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 6, q: 2 }
  expect(biquadMagnitudeDb(f, [1000], 48000)[0]).toBeCloseTo(6, 6)
})
```

Add LS/HS asymptotic tests at frequencies safely away from Fc.

- [ ] **Step 2: Run and observe failure**

```bash
pnpm --filter @autoeq-workbench/core test -- biquad.test.ts cascade.test.ts
```

- [ ] **Step 3: Implement RBJ-style digital biquad coefficients**

Use `A = 10 ** (gainDb / 40)`, `w0 = 2*pi*Fc/Fs`, and the standard peaking/low-shelf/high-shelf cookbook equations. Normalize all coefficients by `a0` before evaluating.

For shelf Q, interpret Q via `alpha = sin(w0)/(2*Q)` consistently with the project's filter model. Add coefficient validity checks for `Fc > 0`, `Fc < Fs/2`, finite gain/Q, and `Q > 0`.

- [ ] **Step 4: Implement complex magnitude evaluation**

For each frequency compute:

```ts
const z1 = { re: Math.cos(-w), im: Math.sin(-w) }
const z2 = { re: Math.cos(-2 * w), im: Math.sin(-2 * w) }
// H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)
// magnitudeDb = 20 * log10(|H|)
```

Keep tiny numerical floor before `log10`.

- [ ] **Step 5: Implement enabled-filter cascade and tests**

Cascade response is the element-wise sum of each enabled filter's dB magnitude. Disabled filters contribute zero.

Test two identical +3 dB PKs at Fc produce approximately +6 dB at Fc and disabling one returns approximately +3 dB.

- [ ] **Step 6: Run all core verification**

```bash
pnpm --filter @autoeq-workbench/core test
pnpm --filter @autoeq-workbench/core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/dsp packages/core/src/index.ts packages/core/test
git commit -m "feat(core): add parametric biquad response engine"
```

---

### Task 5: Implement derived EQ response, error metrics, and dense-grid preamp

**Files:**
- Create: `packages/core/src/metrics/errorMetrics.ts`
- Create: `packages/core/src/metrics/preamp.ts`
- Create: `packages/core/test/metrics.test.ts`
- Modify: `packages/core/src/curves/derive.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `applyEqToSource(sourceDb, peqDb): number[]`.
- Produces `residualError(targetDb, sourceEqDb): number[]` where positive means target remains above result.
- Produces `calculateErrorMetrics(residual, frequencies): ErrorMetrics`.
- Produces `calculatePreampDb(filters, sampleRateHz): PreampResult`.

- [ ] **Step 1: Write metrics tests**

```ts
it('reports MAE, RMSE and max residual', () => {
  const m = calculateErrorMetrics([1, -2, 3], [100, 1000, 10000])
  expect(m.maeDb).toBeCloseTo(2)
  expect(m.rmseDb).toBeCloseTo(Math.sqrt(14 / 3))
  expect(m.maxAbsDb).toBe(3)
  expect(m.maxAbsFrequencyHz).toBe(10000)
})
```

- [ ] **Step 2: Write a combined-boost preamp test**

```ts
it('uses combined cascade boost rather than largest filter gain', () => {
  const filters = [
    { id: '1', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 3, q: 1 },
    { id: '2', enabled: true, type: 'PK' as const, frequencyHz: 1000, gainDb: 3, q: 1 }
  ]
  const result = calculatePreampDb(filters, 48000)
  expect(result.maxBoostDb).toBeCloseTo(6, 2)
  expect(result.preampDb).toBeLessThanOrEqual(-6)
})
```

- [ ] **Step 3: Implement metrics**

`calculateErrorMetrics` returns `maeDb`, `rmseDb`, `maxAbsDb`, `maxAbsFrequencyHz` and validates equal lengths/non-empty input.

- [ ] **Step 4: Implement dense-grid preamp**

Use a deterministic log grid of **16,384 samples from 20 Hz to 20 kHz** for final/preamp calculation in the MVP. Calculate the enabled-filter cascade on that grid, find the maximum positive boost, and round attenuation outward to 0.1 dB:

```ts
const required = Math.max(0, maxBoostDb)
const preampDb = -Math.ceil(required * 10 - 1e-10) / 10
```

Return both `preampDb`, `maxBoostDb`, and `maxBoostFrequencyHz`.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @autoeq-workbench/core test -- metrics.test.ts
pnpm --filter @autoeq-workbench/core test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/test/metrics.test.ts
git commit -m "feat(core): add EQ metrics and dense preamp"
```

---

### Task 6: Build the graph-centered Source/Target workspace

**Files:**
- Create: `apps/web/src/state/workspaceStore.ts`
- Create: `apps/web/src/state/history.ts`
- Create: `apps/web/src/features/curves/CurveImport.tsx`
- Create: `apps/web/src/features/curves/NormalizationControls.tsx`
- Create: `apps/web/src/features/graph/FrequencyResponseGraph.tsx`
- Create: `apps/web/src/features/metrics/MetricsSummary.tsx`
- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/NumberField.tsx`
- Create: `apps/web/src/components/ui/Panel.tsx`
- Modify: `apps/web/src/App.tsx`
- Create tests beside each feature or under `apps/web/src/*.test.tsx`

**Interfaces:**
- Store authoritative state: `source`, `target`, normalization settings, filters, selectedFilterId, solutionState.
- Derived selectors call core functions; they do not persist duplicated DSP arrays as authoritative state.

- [ ] **Step 1: Write store/import behavior tests**

Test that importing Source preserves Target, importing Target preserves Source, and replacement marks existing filters/result stale rather than deleting them.

```ts
expect(store.getState().solutionState).toBe('stale')
expect(store.getState().filters).toHaveLength(1)
```

- [ ] **Step 2: Implement Zustand store with explicit actions**

Required actions:

```ts
setSource(curve: Curve): void
setTarget(curve: Curve): void
setSourceNormalization(value: Normalization): void
setTargetNormalization(value: Normalization): void
normalizeTogether(value: Normalization): void
setFilters(filters: Filter[], provenance: 'manual' | 'autoeq'): void
selectFilter(id: string | null): void
```

Do not put ECharts instances or File objects in the store.

- [ ] **Step 3: Write and implement file import components**

Use browser `File.text()` then `parseCurveText`. Display structured parse errors without mutating previous valid curve state.

Test invalid import leaves previous curve name visible.

- [ ] **Step 4: Write and implement normalization controls**

Controls expose anchor Hz and target dB independently for Source and Target plus `Normalize Together`. Default initial values are `500 Hz` and `0 dB`.

- [ ] **Step 5: Write graph component test for series contract**

Extract a pure helper `buildGraphSeries(workspaceDerived)` and test series names/data before testing ECharts rendering. Expected default series names are `Source`, `Target`, and `Source + EQ` only when filters exist.

- [ ] **Step 6: Implement ECharts graph**

Requirements:

- x axis `type: 'log'`, min 20, max 20000;
- y axis value dB;
- tooltip axis inspector;
- dataZoom/pan is visual only;
- legend toggles Source/Target/Source+EQ/PEQ/Desired;
- reset-view button dispatches ECharts restore/dataZoom reset;
- selected filter response can be overlaid later without changing graph API.

- [ ] **Step 7: Assemble CrinGraph/Squiglink-inspired layout**

`App.tsx` order:

1. title/compact status;
2. dominant graph;
3. compact graph/normalization toolbar;
4. lower two-column region for Source/Target/config and Filter Editor placeholder;
5. compact metrics area.

Use technical density; avoid oversized card spacing.

- [ ] **Step 8: Verify web tests/build**

```bash
pnpm --filter ./apps/web test
pnpm --filter ./apps/web typecheck
pnpm --filter ./apps/web build
```

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): add curve workspace and FR graph"
```

---

### Task 7: Add manual filter editing, live recomputation, selection, and undo/redo

**Files:**
- Create: `apps/web/src/features/filters/FilterEditor.tsx`
- Create: `apps/web/src/features/filters/FilterRow.tsx`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/history.ts`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/features/filters/FilterEditor.test.tsx`
- Create: `apps/web/src/state/workspaceStore.test.ts`

**Interfaces:**
- Produces manual filter operations and `clean | modified | stale` solution-state semantics.
- Graph consumes selected filter ID and derived individual response.

- [ ] **Step 1: Write filter operation tests**

Cover add/remove/duplicate/toggle/reorder/select and bounds validation.

Example:

```ts
store.getState().addFilter('PK')
const [filter] = store.getState().filters
expect(filter).toMatchObject({ enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 0, q: 1 })
```

Manual changes after AutoEQ provenance must set `solutionState = 'modified'`.

- [ ] **Step 2: Implement default manual filters and bounded edits**

Defaults:

```ts
PK: { frequencyHz: 1000, gainDb: 0, q: 1 }
LS: { frequencyHz: 105, gainDb: 0, q: 0.7 }
HS: { frequencyHz: 10000, gainDb: 0, q: 0.7 }
```

Core state accepts only finite values within product bounds. UI `NumberField` may hold temporary invalid text locally until blur/Enter produces a valid numeric edit.

- [ ] **Step 3: Implement history as snapshots of authoritative editable state**

History entries include normalization + filters + solution state, not graph zoom. Provide `undo()` and `redo()`; coalesce a single committed numeric field edit into one history item rather than one item per keypress.

- [ ] **Step 4: Implement FilterEditor table**

Columns:

`ON | # | Type | Fc | Gain | Q | Actions`

Actions: add, duplicate, remove, reorder up/down, select. Disable Add when `filters.length === 64`.

- [ ] **Step 5: Wire live derived response**

Every valid filter edit recomputes through core:

```ts
const peqDb = cascadeMagnitudeDb(enabledFilters, grid, 48000)
const sourceEqDb = applyEqToSource(sourcePrepared.db, peqDb)
const residual = residualError(targetPrepared.db, sourceEqDb)
const metrics = calculateErrorMetrics(residual, grid)
const preamp = calculatePreampDb(enabledFilters, 48000)
```

Do not persist these arrays as independent authoritative state.

- [ ] **Step 6: Highlight selected filter on graph**

Selected filter adds an individual-response series and an Fc marker. Toggling `ON` removes that filter from PEQ/metrics/preamp while preserving the row.

- [ ] **Step 7: Add visible undo/redo and manual-workbench integration test**

Integration scenario:

1. import synthetic Source and Target;
2. normalize both at 500 Hz / 0 dB;
3. add +3 dB PK at 1 kHz;
4. verify Source+EQ changes and preamp is negative;
5. disable filter and verify PEQ returns to 0 dB;
6. undo and verify enabled state returns.

- [ ] **Step 8: Full verification and diff review**

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Then review actual diff for domain/UI boundary violations, accidental data persistence, secrets, and unrelated cleanup.

- [ ] **Step 9: Commit**

```bash
git add apps/web packages/core
git commit -m "feat: complete manual AutoEQ workbench foundation"
```

---

## Plan 1 Completion Gate

Before moving to Plan 2, directly verify in a browser that:

- Source and Target import successfully from synthetic `.txt` and `.csv` files;
- graph is log-scaled 20 Hz–20 kHz and visually dominant;
- normalization changes do not mutate raw imported points;
- adding/editing/disabling PK/LS/HS filters updates the displayed response immediately;
- selected-filter response is visible;
- MAE/RMSE/max error and dense-grid preamp update correctly;
- undo/redo works for filter and normalization edits;
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.

Do not start the AutoEQ optimizer until this gate is green.