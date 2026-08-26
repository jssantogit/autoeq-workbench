# Plan 3A — Normalization, Session & Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add true Squiglink-shaped dB/Hz normalization modes, portable Workbench Session v1, and explicit Equalizer APO / Poweramp / Wavelet exports without changing Standard-v1 optimizer behavior.

**Architecture:** Normalization math lives in `packages/core`; session serialization remains a browser-independent workspace adapter under `apps/web` because it includes Workbench provenance/state; export formatters stay in core and UI controls remain thin. Manifest schema evolves only to represent the new normalization input while `algorithmVersion` stays `standard-v1`.

**Tech Stack:** TypeScript, Vitest, React/Testing Library, Zustand, existing core DSP, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`

## Global Constraints

- Start from a clean `remake/squiglink-base` synced with the docs commit that introduces this plan.
- Do not change Standard-v1 algorithm constants or optimizer search behavior.
- `vendor/squiglink/` is immutable reference only; never runtime-import it.
- Preserve current default normalization result: Hz mode at 500 Hz must match the pre-Plan-3 500 Hz / 0 dB behavior.
- Session import is all-or-nothing and must clear Compare/history/transient run state only after full validation succeeds.
- Export always reflects current enabled editor filters; never re-run AutoEQ or re-quantize.
- TDD every behavior change and commit each task separately.

---

### Task 1: Port source-derived normalization modes into core

**Files:**
- Modify: `packages/core/src/types/curve.ts`
- Create: `packages/core/src/curves/loudnessNormalize.ts`
- Modify: `packages/core/src/curves/normalize.ts`
- Modify: `packages/core/src/curves/derive.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/curves.test.ts`
- Create: `packages/core/test/loudnessNormalize.test.ts`

**Interfaces:**
- Produces:

```ts
export type NormalizationMode = 'hz' | 'db'
export interface Normalization {
  mode: NormalizationMode
  frequencyHz: number
  levelDb: number
}

export function normalizationOffset(
  points: readonly CurvePoint[],
  normalization: Normalization,
): number
```

- `loudnessNormalize.ts` contains only the source-adapted Squiglink loudness/ISO routine and exports a single core primitive used by `normalizationOffset`.

- [ ] **Step 1: Change the curve normalization type and write failing Hz-mode tests**

Add tests equivalent to:

```ts
const flat = [
  { frequencyHz: 20, db: 7 },
  { frequencyHz: 500, db: 10 },
  { frequencyHz: 20_000, db: 4 },
]

expect(normalizationOffset(flat, {
  mode: 'hz', frequencyHz: 500, levelDb: 60,
})).toBe(-10)

const prepared = prepareCurve(curveFixture, {
  mode: 'hz', frequencyHz: 500, levelDb: 60,
}, [500])
expect(prepared.db[0]).toBeCloseTo(0, 12)
```

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- curves.test.ts
```

Expected: FAIL because the current type/implementation uses `anchorHz` / `targetDb`.

- [ ] **Step 2: Port the Squiglink dB/loudness routine with provenance**

Adapt only the normalization math/constants needed from pinned `vendor/squiglink/graphtool.js` (`iso223_params`, `free_field`, `init_normalize`, `find_offset`). Add a header comment naming the pinned upstream file/commit and 0BSD provenance. Do not retain D3/global-state code.

The exported primitive must be deterministic, finite-input validated, and throw `CoreError('validation', ...)` or `CoreError('numeric', ...)` rather than returning NaN/Infinity.

- [ ] **Step 3: Add a source-equivalence test for dB mode**

In `loudnessNormalize.test.ts`, include a test-only direct reference translation of the pinned Squiglink routine for one small deterministic synthetic FR fixture. Assert the production primitive matches the test reference to `1e-9` offset dB. Keep the test reference local to the test file and mark it as source-equivalence evidence, not production authority.

Also assert relative recentering:

```ts
const norm = { mode: 'db' as const, frequencyHz: 500, levelDb: 60 }
const prepared = prepareCurve(curveFixture, norm, frequencies)
expect(prepared.db.every(Number.isFinite)).toBe(true)
```

For two curves, verify subtracting the common display center preserves the difference produced by the source-equivalent absolute normalization.

- [ ] **Step 4: Implement mode dispatch**

`normalizationOffset` behavior:

```ts
if (normalization.mode === 'hz') {
  return -interpolateLogFrequency(points, [normalization.frequencyHz])[0]!
}

const absoluteOffset = calculateSquiglinkLoudnessOffset(points, normalization.levelDb)
return absoluteOffset - normalization.levelDb
```

Validate `frequencyHz` against the usable positive input domain and `levelDb` as finite; the UI/product layer will apply its tighter 20–20k / 0–100 limits.

- [ ] **Step 5: Verify core and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- curves.test.ts loudnessNormalize.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core
git commit -m "feat(core): add source-derived normalization modes"
```

---

### Task 2: Evolve normalization through AutoEQ provenance and workspace state

**Files:**
- Modify: `packages/core/src/autoeq/types.ts`
- Modify: `packages/core/src/autoeq/runStandardAutoEq.ts`
- Modify: `packages/core/test/autoeq/runStandardAutoEq.test.ts`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/history.ts`
- Modify: `apps/web/src/state/autoEqRunInputSignature.ts`
- Modify: `apps/web/src/state/autoeqController.ts`
- Modify: `apps/web/src/state/autoeqRunStore.test.ts` or the existing controller/signature tests
- Modify: tests that construct `Normalization` fixtures across core/web

**Interfaces:**
- `RunManifest.schemaVersion` becomes `2`.
- `RunManifest.algorithmVersion` remains exactly `'standard-v1'`.
- `RunManifest.normalization` stores the full new `Normalization` shape.
- Workspace default becomes:

```ts
{
  mode: 'hz',
  frequencyHz: 500,
  levelDb: 60,
}
```

- [ ] **Step 1: Write compatibility/regression tests before implementation**

Create a test that runs the same synthetic source/target twice:

```ts
const result = runStandardAutoEq({
  source,
  target,
  normalization: { mode: 'hz', frequencyHz: 500, levelDb: 60 },
  settings: DEFAULT_AUTOEQ_SETTINGS,
})

expect(result.manifest.schemaVersion).toBe(2)
expect(result.manifest.algorithmVersion).toBe('standard-v1')
expect(result.manifest.normalization).toEqual({
  mode: 'hz', frequencyHz: 500, levelDb: 60,
})
```

Use the pre-Plan-3 synthetic expected filter list from the existing Standard-v1 tests as the compatibility assertion; do not update expected filters merely because the new normalization type exists.

- [ ] **Step 2: Update workspace validation/history/signature**

`setNormalization` accepts only:

```ts
mode === 'hz' || mode === 'db'
20 <= frequencyHz <= 20_000
0 <= levelDb <= 100
```

A mode/value change is one undoable workspace edit and marks a clean AutoEQ result stale using the existing stale semantics.

The run-input signature must include `mode`, `frequencyHz`, and `levelDb` so switching normalization mode invalidates obsolete Worker results.

- [ ] **Step 3: Update result validation for manifest schema 2**

Extract the current manifest shape checks from `workspaceStore.ts` into a focused helper if doing so reduces duplication; do not create a parallel domain validator. The helper must require the full new normalization object and `schemaVersion === 2`.

- [ ] **Step 4: Run focused lifecycle tests**

```bash
pnpm --filter @autoeq-workbench/core test -- runStandardAutoEq.test.ts
pnpm --filter ./apps/web test -- workspaceStore autoEqRunInputSignature autoeqController
pnpm --filter ./apps/web typecheck
```

Expected: all pass and no Standard algorithm file (`candidates/refine/prune/...`) changes.

- [ ] **Step 5: Commit**

```bash
git add packages/core apps/web/src/state apps/web/src/workers apps/web/src/**/*.test.*
git commit -m "feat: carry normalization mode through AutoEQ provenance"
```

---

### Task 3: Implement deterministic portable Workbench Session v1

**Files:**
- Create: `apps/web/src/session/workbenchSession.ts`
- Create: `apps/web/src/session/workbenchSession.test.ts`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/eqCompareStore.ts`
- Modify: `apps/web/src/state/autoeqController.ts`

**Interfaces:**

```ts
export const WORKBENCH_SESSION_SCHEMA_VERSION = 1 as const

export interface WorkbenchSessionV1 {
  schemaVersion: 1
  curves: Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
  autoEqRun: AutoEqRunRecord | null
}

export function serializeWorkbenchSession(input: WorkbenchSessionV1): string
export function deserializeWorkbenchSession(text: string): WorkbenchSessionV1
```

Add one workspace action that applies a fully validated session atomically. It must not accept raw unvalidated JSON.

- [ ] **Step 1: Write stable round-trip and rejection tests**

Test byte stability:

```ts
const encoded1 = serializeWorkbenchSession(fixture)
const encoded2 = serializeWorkbenchSession(fixture)
expect(encoded1).toBe(encoded2)
expect(encoded1.endsWith('\n')).toBe(true)
expect(deserializeWorkbenchSession(encoded1)).toEqual(fixture)
```

Reject at minimum:

- malformed JSON;
- schema version other than 1;
- duplicate curve IDs or filter IDs;
- invalid curve kind/non-finite point/empty name;
- active FR ID not referencing an FR;
- active Target ID not referencing a Target;
- invalid normalization/settings/filter;
- invalid provenance/state combination;
- malformed AutoEQ run manifest schema 2;
- `clean` AutoEQ state whose filters do not equal the manifest final filters.

Use a public validation error message without local paths.

- [ ] **Step 2: Implement deterministic serializer/deserializer**

Serializer constructs a fresh object in the interface key order shown above and uses:

```ts
JSON.stringify(stableObject, null, 2) + '\n'
```

Deserializer clones arrays/objects and never returns references to parser-owned mutable values.

- [ ] **Step 3: Write atomic-import store test**

Start with populated workspace + undo history + Compare snapshots. Attempt invalid session: assert the whole prior state and Compare state remain unchanged.

Then apply a valid session and assert:

```text
curves/active IDs/normalization/settings/filters/provenance/state/run record restored
selectedFilterId = null
canUndo = false
canRedo = false
Compare snapshots empty
AutoEQ transient state idle
```

If a Worker run was active, call the existing cancel/invalidation path before the atomic replacement and assert a simulated late result cannot mutate the imported session.

- [ ] **Step 4: Implement the atomic workspace replacement boundary**

Do not reconstruct state by calling `addCurve`, `setFilters`, etc. sequentially. Add a single validated replacement path that assigns the authoritative snapshot and clears history in the same logical operation.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter ./apps/web test -- workbenchSession workspaceStore autoeqController eqCompareStore
pnpm --filter ./apps/web typecheck
git diff --check
git add apps/web/src/session apps/web/src/state
git commit -m "feat(web): add portable Workbench sessions"
```

---

### Task 4: Add Poweramp formatter and normalize active-preset export semantics

**Files:**
- Create: `packages/core/src/exports/powerampText.ts`
- Create: `packages/core/test/exports/powerampText.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify if required for enabled-filter consistency: existing APO/GraphicEQ formatter tests

**Interfaces:**

```ts
export interface PowerampTextInput {
  name: string
  preampDb: number
  filters: readonly Filter[]
}

export function formatPowerampText(input: PowerampTextInput): string
```

- [ ] **Step 1: Write exact golden test**

```ts
expect(formatPowerampText({
  name: 'Demo',
  preampDb: -6.1,
  filters: [
    { id: 'a', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 6, q: 1.41 },
    { id: 'b', enabled: false, type: 'HS', frequencyHz: 10000, gainDb: -1.2, q: 0.7 },
  ],
})).toBe([
  '# AutoEQ Workbench — Demo',
  '# Poweramp-style manual-entry preset',
  'Preamp: -6.1 dB',
  'Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.41',
].join('\n'))
```

Also test LS/HS, dense renumbering, `-0` normalization and disabled-only input.

- [ ] **Step 2: Implement stable formatting without re-quantization**

Validate enabled filter values are finite and on current manual-entry policy grid. If invalid, throw `CoreError('export', ...)` rather than silently rounding the filter onto another setting.

- [ ] **Step 3: Verify existing APO and GraphicEQ active-filter behavior**

Add/retain tests proving disabled filters are omitted from APO active preset and make no contribution to Wavelet GraphicEQ. Do not change formatter semantics if they already satisfy this.

- [ ] **Step 4: Commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/exports
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): add Poweramp manual-entry export"
```

---

### Task 5: Wire Session and explicit export destinations with behavior-first UI

**Files:**
- Create: `apps/web/src/features/session/SessionControls.tsx`
- Create: `apps/web/src/features/session/SessionControls.test.tsx`
- Modify: `apps/web/src/features/filters/FilterIoControls.tsx`
- Modify: `apps/web/src/features/filters/FilterIoControls.test.tsx`
- Modify: `apps/web/src/features/tools/ToolsTab.tsx`
- Reuse: `apps/web/src/squiglink/eq-io/downloadTextFile.ts`

**Interfaces:**
- Equalizer exposes `Import` plus one compact semantic `Export` control with choices `Equalizer APO`, `Poweramp`, `Wavelet`.
- Tools exposes a `Session` section with `Export Session` and `Import Session`.
- Final visual polish belongs to Plan 3C; this task locks behavior/accessibility only.

- [ ] **Step 1: Write export-choice tests**

Mock `downloadTextFile`. For a workspace with one enabled and one disabled filter, invoke each destination and assert:

```text
APO filename ends in " Equalizer APO.txt"
Poweramp filename ends in " Poweramp.txt"
Wavelet filename ends in " Wavelet GraphicEQ.txt"
```

Assert Poweramp/APO use current safety preamp and all three outputs exclude disabled filter effect.

- [ ] **Step 2: Implement explicit destination control**

Use a native accessible `<select>` plus adjacent `Export` button or a compact native menu pattern already present in the repo. Do not add a component-library dependency. The final 3C styling may make it source-like.

- [ ] **Step 3: Write SessionControls import/export tests**

Export test asserts `.autoeq-workbench.json` and deterministic serialized content.

Import test supplies a valid `File`, awaits text, validates fully, then calls the atomic apply boundary. Invalid file renders a public error and leaves workspace unchanged.

- [ ] **Step 4: Handle active AutoEQ on session import**

Use the existing controller cancel path before applying a validated session. Do not add direct Worker manipulation inside `SessionControls`.

- [ ] **Step 5: Verify Plan 3A**

```bash
pnpm --filter @autoeq-workbench/core test
pnpm --filter ./apps/web test
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add apps/web packages/core
git commit -m "feat(web): add session and explicit EQ outputs"
```

## Plan 3A Completion Gate

Plan 3A is complete only when:

- normalization has mutually exclusive Hz/dB modes with source-derived dB behavior;
- default Hz mode preserves prior Standard-v1 delivered output;
- manifest schema explicitly represents the new normalization contract while algorithm version remains `standard-v1`;
- Session v1 deterministic round-trip and atomic invalid-import behavior pass;
- Compare/history/transient state reset only on successful session import;
- APO, Poweramp and Wavelet are explicit and current-state based;
- full test/typecheck/build/lint/diff-check gate is green.
