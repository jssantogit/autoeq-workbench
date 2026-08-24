# Remake 03 — Equalizer And EQ I/O Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Equalizer panel with the source-derived Squiglink Parametric Equalizer composition and add source-backed PEQ import/export plus Graphic EQ/Wavelet export, while keeping Workbench filter/DSP/product contracts authoritative and leaving the AutoEQ button inert.

**Architecture:** Equalizer UI is React and reads/writes the existing Zustand workspace. Format parsing/export math belongs in framework-independent `packages/core`, not React. Squiglink's legacy filter text conventions and GraphicEQ algorithm are source references, but all biquad response/preamp calculations use the Workbench core. UI adapts Squiglink `LSQ/HSQ` labels to core `LS/HS` types explicitly.

**Tech Stack:** TypeScript core, React 19, Zustand 5, Vitest, Testing Library, browser Blob/Object URL APIs for local download only.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Remake 02 must be complete and green before starting this plan.
- Preserve core filter types `PK | LS | HS`; do not create a second runtime filter model.
- Preserve hard Workbench limits: 20-20000 Hz, gain -15..15 dB, Q 0.1..12, max 64 filters.
- Preserve shelves Q behavior and current core response math; Squiglink's old ±40 UI clamps or AutoEQ ±12/Q .5-2 limits must not replace Workbench limits.
- Preserve dense-grid Workbench preamp calculation; do not call or port Squiglink `Equalizer.calc_preamp` as authority.
- Do not port `Equalizer.autoeq`, `search_candidates`, or `optimize` from Squiglink.
- AutoEQ UI/constraints may be source-derived, but `AutoEQ` remains inert until Plan 2.
- PEQ import/export and GraphicEQ are local browser operations only; no server/network upload.
- Parsing, validation, export formatting, GraphicEQ frequency generation, response conversion, and normalization live in `packages/core` per `AGENTS.md`.
- Export current delivered filter values/state only; never export stale/unquantized optimizer intermediates.
- Every pushed checkpoint must leave manual EQ and public FR/Target workflows usable.

---

### Task 1: Add core Equalizer APO import/export conventions from the Squiglink source

**Files:**
- Create: `packages/core/src/io/equalizerApo.ts`
- Create: `packages/core/test/io/equalizerApo.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export type FilterDefinition = Omit<Filter, 'id'>

export function parseEqualizerApoFilters(text: string): FilterDefinition[]

export function formatEqualizerApoFilters(
  filters: readonly Filter[],
  preampDb: number,
): string
```

Source convention to preserve:

```text
Preamp: -2.4 dB
Filter 1: ON PK Fc 1000 Hz Gain 1.0 dB Q 1.000
Filter 2: OFF LSC Fc 105 Hz Gain -2.5 dB Q 0.700
Filter 3: ON HSC Fc 10000 Hz Gain 1.5 dB Q 0.700
```

- [ ] **Step 1: Write failing parser tests from the source grammar**

Cover all accepted source forms:

```ts
expect(parseEqualizerApoFilters(
  'Filter 1: ON PK Fc 1000 Hz Gain 2.5 dB Q 1.200',
)).toEqual([
  { enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 2.5, q: 1.2 },
])
```

Shelf mappings:

```text
LS, LSQ, LSC -> core LS
HS, HSQ, HSC -> core HS
```

When an `LS`/`HS` line omits Q, use `0.707` like the Squiglink importer. `PK` requires an explicit finite Q.

Also test:

```text
OFF -> enabled false
blank/non-filter lines are ignored
zero recognized filter lines -> CoreError('parse', ...)
recognized line outside Workbench frequency/gain/Q bounds -> CoreError('validation', ...)
more than 64 valid filter lines -> CoreError('validation', ...)
```

- [ ] **Step 2: Write failing formatter tests**

Assert exact line conventions:

```ts
const text = formatEqualizerApoFilters(filters, -2.34)
expect(text).toContain('Preamp: -2.3 dB')
expect(text).toContain('Filter 1: ON PK Fc 1000 Hz Gain 1.0 dB Q 1.000')
expect(text).toContain('Filter 2: OFF LSC Fc 105 Hz Gain -2.5 dB Q 0.700')
expect(text).toContain('Filter 3: ON HSC Fc 10000 Hz Gain 1.5 dB Q 0.700')
```

The output order must equal current filter order. Include disabled filters as `OFF`. Reject non-finite `preampDb` with `CoreError('export', ...)`.

- [ ] **Step 3: Run targeted tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/core test -- test/io/equalizerApo.test.ts
```

Expected: FAIL because functions do not exist.

- [ ] **Step 4: Implement the parser using the source regex shape and Workbench validation**

Base the recognized filter grammar on Squiglink's importer:

```ts
const FILTER_LINE = /Filter\s*\d+:\s*(\S+)\s*(\S+)\s*Fc\s*(\S+)\s*Hz\s*Gain\s*(\S+)\s*dB(?:\s*Q\s*(\S+))?/i
```

Parse without using truthiness for numeric zero. Map type labels explicitly and validate each resulting definition against `MVP_NUMERIC_POLICY` and `AUTOEQ_PRODUCT_LIMITS`.

Do not parse or apply the imported `Preamp:` line: Workbench preamp is derived from the imported filter cascade after state replacement.

- [ ] **Step 5: Implement formatter from current filter state**

Mapping:

```ts
PK -> PK
LS -> LSC
HS -> HSC
```

Formatting:

```text
preamp: one decimal
frequency: integer Hz
gain: one decimal
Q: three decimals
line endings: \r\n
```

- [ ] **Step 6: Export APIs and run tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/io/equalizerApo.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the core text I/O**

```bash
git add packages/core/src/io/equalizerApo.ts packages/core/test/io/equalizerApo.test.ts packages/core/src/index.ts
git commit -m "feat(core): add Equalizer APO filter io"
```

### Task 2: Add core Graphic EQ/Wavelet export using Workbench DSP

**Files:**
- Create: `packages/core/src/io/graphicEq.ts`
- Create: `packages/core/test/io/graphicEq.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface GraphicEqPoint {
  frequencyHz: number
  gainDb: number
}

export function createGraphicEq(
  filters: readonly Filter[],
  sampleRateHz?: number,
): GraphicEqPoint[]

export function formatGraphicEq(
  filters: readonly Filter[],
  sampleRateHz?: number,
): string
```

- [ ] **Step 1: Lock the source frequency grids in tests**

Squiglink source uses an approximately 1/96-octave raw evaluation grid and a coarser Wavelet output grid:

```ts
function sourceRawFrequencies(): number[] {
  return new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0072)))
    .fill(null)
    .map((_, i) => 20 * Math.pow(1.0072, i))
}

function sourceGraphicFrequencies(): number[] {
  return Array.from(new Set(
    new Array(Math.ceil(Math.log(20_000 / 20) / Math.log(1.0563)))
      .fill(null)
      .map((_, i) => Math.floor(20 * Math.pow(1.0563, i))),
  )).sort((a, b) => a - b)
}
```

Tests must verify generated output frequencies exactly match the second function and stay inside 20-20000 Hz.

- [ ] **Step 2: Write response/normalization tests before implementation**

For no filters, every output gain must be 0 within numerical tolerance.

For a positive PK filter, assert:

```text
output length equals source GraphicEQ grid length
maximum output gain is 0 dB within 1e-9
at least one other point is negative after normalization
all gains are finite
```

For multiple filters, compare the pre-normalized raw response path against `cascadeMagnitudeDb(filters, sourceRawFrequencies(), 48000)` so no duplicate legacy biquad math becomes authoritative.

`formatGraphicEq` must begin exactly:

```text
GraphicEQ: 
```

and emit `frequency gain` pairs separated by `; ` with integer Hz and one-decimal dB.

- [ ] **Step 3: Run targeted tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/core test -- test/io/graphicEq.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the source bin-averaging algorithm around core response math**

Algorithm:

1. build source raw frequencies;
2. evaluate full cascade with `cascadeMagnitudeDb` at the supplied sample rate (default `MVP_NUMERIC_POLICY.sampleRateHz`);
3. for each output frequency `f[j]`, define the upper bin boundary as `sqrt(f[j] * f[j+1])`, or 20000 Hz for the last bin;
4. average all raw gains below that boundary that have not already been consumed;
5. subtract the maximum averaged gain from every output point so the delivered GraphicEQ has no positive boost.

If a bin has no raw points, interpolate from the adjacent raw response instead of producing `NaN`; cover that fallback with a unit test.

- [ ] **Step 5: Export APIs and run core gate**

```bash
pnpm --filter @autoeq-workbench/core test -- test/io/graphicEq.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit GraphicEQ core behavior**

```bash
git add packages/core/src/io/graphicEq.ts packages/core/test/io/graphicEq.test.ts packages/core/src/index.ts
git commit -m "feat(core): add Graphic EQ export"
```

### Task 3: Add atomic sort/import actions to the canonical workspace

**Files:**
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/workspaceStore.test.ts`

**Interfaces:**

```ts
import type { FilterDefinition } from '@autoeq-workbench/core'

export interface WorkspaceState {
  // existing fields...
  sortFiltersByFrequency(): void
  replaceFiltersFromImport(filters: readonly FilterDefinition[]): void
}
```

- [ ] **Step 1: Write failing state tests**

Assert `sortFiltersByFrequency()` sorts ascending by `frequencyHz` in one history record and preserves `selectedFilterId`.

Assert `replaceFiltersFromImport()`:

```text
replaces the full current list atomically
assigns unique local ids
preserves enabled/type/frequency/gain/Q values
sets provenance to manual
sets solutionState to clean
clears selectedFilterId
creates one undo point
rejects >64 or invalid definitions without changing state
```

Undo after import must restore the exact prior filter list/provenance/solution state.

- [ ] **Step 2: Run state tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement both actions through existing `record()` history mechanics**

`replaceFiltersFromImport` must validate using the same hard filter validation already used by `setFilters`, create ids through the existing `uniqueFilterId`, and produce one state transition. Do not loop through `addFilter()` because that would create 1 history entry per band.

- [ ] **Step 4: Run targeted tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit workspace actions**

```bash
git add apps/web/src/state/workspaceStore.ts apps/web/src/state/workspaceStore.test.ts
git commit -m "feat(web): add atomic filter import and sort"
```

### Task 4: Build a local-only browser file/download adapter

**Files:**
- Create: `apps/web/src/squiglink/eq-io/downloadTextFile.ts`
- Create: `apps/web/src/squiglink/eq-io/downloadTextFile.test.ts`

**Interfaces:**

```ts
export function downloadTextFile(
  filename: string,
  text: string,
  documentRef?: Document,
  urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
): void
```

- [ ] **Step 1: Write a failing test with mocked URL APIs**

Assert the helper:

```text
creates a Blob from text
creates an object URL
creates/clicks a temporary <a download=...>
removes the anchor
revokes the object URL after click
performs no fetch/XHR/network call
```

- [ ] **Step 2: Run test and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/eq-io/downloadTextFile.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the minimal browser adapter and pass tests**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/eq-io/downloadTextFile.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit browser-only download infrastructure**

```bash
git add apps/web/src/squiglink/eq-io
git commit -m "feat(web): add local EQ download helper"
```

### Task 5: Replace the Equalizer composition with the Squiglink-derived panel

**Files:**
- Modify: `apps/web/src/features/filters/EqualizerTab.tsx`
- Modify: `apps/web/src/features/filters/EqualizerTab.test.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.test.tsx`
- Modify: `apps/web/src/features/filters/FilterRow.tsx`
- Create: `apps/web/src/features/filters/AutoEqConstraints.tsx`
- Create: `apps/web/src/features/filters/AutoEqConstraints.test.tsx`
- Create: `apps/web/src/squiglink/eq-io/filterTypeAdapter.ts`
- Create: `apps/web/src/squiglink/eq-io/filterTypeAdapter.test.ts`

**Interfaces:**

```ts
export type SquiglinkFilterType = 'PK' | 'LSQ' | 'HSQ'

export function toSquiglinkFilterType(type: FilterType): SquiglinkFilterType
export function fromSquiglinkFilterType(type: SquiglinkFilterType): FilterType
```

- [ ] **Step 1: Write the type-adapter tests**

```ts
expect(toSquiglinkFilterType('PK')).toBe('PK')
expect(toSquiglinkFilterType('LS')).toBe('LSQ')
expect(toSquiglinkFilterType('HS')).toBe('HSQ')
expect(fromSquiglinkFilterType('LSQ')).toBe('LS')
expect(fromSquiglinkFilterType('HSQ')).toBe('HS')
```

- [ ] **Step 2: Rewrite Equalizer component tests around source composition**

Assert the panel contains:

```text
Parametric Equalizer
FR selector
Target selector
AutoEQ button
Type / Frequency / Gain / Q column headings
+ / - / Sort
Import
Export
Export Graphic EQ (Wavelet)
filter count
AutoEQ constraints/settings control
```

Assert `AutoEQ` is present but clicking it does not modify filters, solution state, or provenance and does not spawn a Worker/network request.

Assert source UI labels `LSQ`/`HSQ` update canonical filters as `LS`/`HS`.

- [ ] **Step 3: Write constraints tests using current `AutoEqSettings` only**

The source-derived constraints panel must edit only existing settings fields:

```text
Frequency min/max
Gain min/max
Q min/max
Max Filters
```

Do not add filter-type-enable toggles or a second constraint model in this plan. Every field must use `AUTOEQ_PRODUCT_LIMITS` and `isValidAutoEqSettings`.

- [ ] **Step 4: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters src/squiglink/eq-io/filterTypeAdapter.test.ts
```

Expected: FAIL until the new composition is implemented.

- [ ] **Step 5: Implement source-derived row/table/button composition**

Keep canonical state actions for every mutation. `+` adds a PK by default. `-` removes the selected filter and is disabled if none is selected. `Sort` calls the atomic `sortFiltersByFrequency()` action. Preserve Undo/Redo behavior and move filter count/status into the Equalizer context.

- [ ] **Step 6: Implement AutoEQ constraints using existing settings contract**

Recompose current validated settings into the source-style constraints presentation. Do not duplicate values in component state beyond transient input editing.

`AutoEQ` remains an inert button with no optimizer import. It may be enabled visually; its click handler is a no-op until Plan 2. No legacy overlay or "running" state may be wired.

- [ ] **Step 7: Run filters tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters src/squiglink/eq-io/filterTypeAdapter.test.ts src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the visual/manual Equalizer port**

```bash
git add apps/web/src/features/filters apps/web/src/squiglink/eq-io/filterTypeAdapter.ts apps/web/src/squiglink/eq-io/filterTypeAdapter.test.ts
git commit -m "feat(web): port Squiglink equalizer panel"
```

### Task 6: Wire PEQ import/export and GraphicEQ export into the Equalizer

**Files:**
- Create: `apps/web/src/features/filters/FilterIoControls.tsx`
- Create: `apps/web/src/features/filters/FilterIoControls.test.tsx`
- Modify: `apps/web/src/features/filters/EqualizerTab.tsx`

**Interfaces:**
- Consumes: `parseEqualizerApoFilters`, `formatEqualizerApoFilters`, `formatGraphicEq`, `replaceFiltersFromImport`, `derived.preamp.preampDb`, current canonical filters.
- Produces: local import/download UI with non-destructive errors.

- [ ] **Step 1: Write failing import tests**

Use a synthetic `File` containing:

```text
Preamp: -4.0 dB
Filter 1: ON PK Fc 1000 Hz Gain 2.0 dB Q 1.000
Filter 2: ON LSC Fc 105 Hz Gain -3.0 dB Q 0.700
```

After import, expect exactly two canonical filters with types `PK` and `LS`, unique ids, and no use of imported `Preamp: -4.0`; derived Workbench preamp must come from the resulting cascade.

For malformed/out-of-bounds input, assert the existing filter list remains unchanged and an inline error is shown.

- [ ] **Step 2: Write failing export tests**

Mock `downloadTextFile`. PEQ export must call it with a `.txt` filename and text from `formatEqualizerApoFilters(currentFilters, derivedPreampDb)`.

GraphicEQ export must call it with `formatGraphicEq(currentFilters, MVP_NUMERIC_POLICY.sampleRateHz)`.

If there are zero filters, disable both filter exports rather than generating misleading empty files.

- [ ] **Step 3: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters/FilterIoControls.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement local file import with request-staleness protection**

Follow the same pattern already used by `CurveImport`: keep a monotonically increasing request ref, read `file.text()`, ignore late results, reset the input value, and preserve the workspace on error.

- [ ] **Step 5: Implement both downloads using current canonical state**

Suggested names:

```text
<active-fr-name-or-Workbench> PEQ.txt
<active-fr-name-or-Workbench> Graphic EQ.txt
```

Sanitize only filesystem-hostile separator characters; do not leak local file paths.

- [ ] **Step 6: Run targeted integration tests**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/filters packages/core/test/io/equalizerApo.test.ts packages/core/test/io/graphicEq.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

If the test runner cannot address cross-package paths in one invocation, run the core and web targeted commands separately. All must pass.

- [ ] **Step 7: Commit and publish the complete Equalizer/I/O checkpoint**

```bash
git add packages/core apps/web/src/features/filters apps/web/src/squiglink/eq-io
git commit -m "feat(web): add EQ import and exports"
git push origin remake/squiglink-base
```

Wait for CI/Pages and smoke-test import/export on the public origin.

### Task 7: Remake 03 regression and legacy-AutoEQ exclusion audit

**Files:**
- Modify only if verification exposes defects in Remake 03 files.

**Interfaces:**
- Produces: stable manual Equalizer + I/O gate for Tools work.

- [ ] **Step 1: Run the full repository verification**

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

- [ ] **Step 2: Prove the legacy optimizer is not imported into runtime**

Run:

```bash
if git grep -n "search_candidates\|OptimizeDeltas\|Equalizer\.autoeq\|function autoeq" -- apps packages ':!docs/**'; then
  echo "Legacy Squiglink AutoEQ code detected" >&2
  exit 1
fi
```

Expected: no runtime matches.

- [ ] **Step 3: Prove export math stays in core**

```bash
git grep -n "cascadeMagnitudeDb\|GraphicEQ:" -- apps/web/src packages/core/src
```

Expected: cascade/GraphicEQ generation logic is in core; React only invokes exported APIs and handles browser file UX.

- [ ] **Step 4: Public functional acceptance**

Verify on mobile/desktop, Light/Dark:

```text
FR/Target selectors work
PK/LSQ/HSQ editing maps correctly to PK/LS/HS core filters
+ / - / Sort work
Undo/Redo work
filter count is visible in Equalizer
constraints edit only valid Workbench settings
AutoEQ button is visible and inert
PEQ import is atomic/non-destructive
PEQ export includes derived dense-grid Workbench preamp
GraphicEQ export begins "GraphicEQ:" and has no positive boost
manual EQ still updates only the active FR EQ graph
```

- [ ] **Step 5: Push final fixes and record CI/Pages evidence**

Do not start Remake 04 until the final Remake 03 SHA is green and deployed.

## Completion Gate

Remake 03 is complete only when:

1. Equalizer composition is source-derived and uses canonical Workbench state;
2. canonical runtime filter types remain `PK | LS | HS`, with explicit source-label adapters for `LSQ/HSQ`;
3. all current hard product limits remain enforced;
4. Sort and filter import are atomic history operations;
5. Equalizer APO-style PEQ import/export is implemented in core and wired locally in the browser;
6. import ignores file preamp and Workbench derives preamp from the actual cascade;
7. GraphicEQ/Wavelet export uses Squiglink's source frequency/bin convention but Workbench cascade math;
8. PEQ export uses Workbench dense-grid derived preamp;
9. AutoEQ controls occupy the final source-derived layout while the button remains inert;
10. no legacy Squiglink AutoEQ optimizer code runs or is imported;
11. all repository checks and public smoke tests pass;
12. public Pages points to the final green remake SHA.

Stop and record the final SHA, CI/Pages evidence, exported sample structure from synthetic filters, and any deliberate source adaptation before Remake 04.
