# AutoEQ Workbench Integration, Export & Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the MVP by adding reproducible exports/sessions, diagnostics, benchmark/regression infrastructure, full browser workflows, and final acceptance validation against the approved design.

**Architecture:** Export/session/benchmark behavior is implemented as core adapters and deterministic serialization, then surfaced by thin React controls. Benchmarks consume the same public core API as the app. Final acceptance combines unit/regression evidence, browser-level behavior, direct visual inspection, and a recorded Standard-v1 validation report.

**Tech Stack:** TypeScript, Vitest, React/Testing Library, Vite, existing `@autoeq-workbench/core`, optional Playwright dev-only E2E harness for the browser acceptance flow.

**Spec:** `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`

## Global Constraints

- Complete Plans 1 and 2 before starting this plan.
- Poweramp output in MVP is a **Poweramp-style manual-entry text preset**, not an undocumented claim of compatibility with Poweramp's native backup schema.
- Exported filters and metrics must use exactly the same final quantized filters shown in the workspace.
- Preamp comes from dense combined-cascade maximum boost and rounds outward to 0.1 dB.
- Session JSON is explicit user export/import, not automatic persistence.
- Imported private/user curves must never become committed fixtures; use synthetic or explicitly sanitized fixtures only.
- Algorithm tuning must preserve determinism and be justified by benchmark evidence.
- No deploy, public release, merge, or publication action without explicit user request.

---

## File Structure Locked by This Plan

```text
packages/core/src/exports/
  powerampText.ts
  curveText.ts
packages/core/src/session/
  schema.ts
  serialize.ts
  deserialize.ts
packages/core/src/metrics/
  bandMetrics.ts
packages/core/test/exports/
  powerampText.test.ts
  curveText.test.ts
packages/core/test/session/
  session.test.ts
packages/core/benchmarks/
  cases.ts
  run.ts
  baseline-standard-v1.json
apps/web/src/features/export/
  ExportControls.tsx
apps/web/src/features/session/
  SessionControls.tsx
apps/web/src/features/diagnostics/
  DiagnosticsPanel.tsx
apps/web/e2e/
  workbench.spec.ts
docs/research/
  AUTOEQ_ENGINE_VALIDATION_v1.md
```

---

### Task 1: Implement exact Poweramp-style text and derived-curve exports

**Files:**
- Create: `packages/core/src/exports/powerampText.ts`
- Create: `packages/core/src/exports/curveText.ts`
- Create: `packages/core/test/exports/powerampText.test.ts`
- Create: `packages/core/test/exports/curveText.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `formatPowerampText(input: PowerampTextInput): string`.
- Produces `formatCurveText(frequencies, db, options): string`.
- Produces `formatCurveCsv(frequencies, db, options): string`.

- [ ] **Step 1: Write Poweramp text golden test**

Use final quantized filters only:

```ts
const text = formatPowerampText({
  name: 'Demo',
  preampDb: -6.1,
  filters: [
    { id: 'a', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 6, q: 1.41 },
    { id: 'b', enabled: false, type: 'HS', frequencyHz: 10000, gainDb: -1.2, q: 0.7 }
  ]
})

expect(text).toBe([
  '# AutoEQ Workbench — Demo',
  '# Poweramp-style manual-entry preset',
  'Preamp: -6.1 dB',
  'Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.41',
  'Filter 2: OFF HS Fc 10000 Hz Gain -1.2 dB Q 0.70'
].join('\n'))
```

Disabled filters are preserved as `OFF` in the text for reproducibility; Poweramp application of the preset should use enabled filters only.

- [ ] **Step 2: Implement stable numeric formatting**

Rules:

- frequency: integer Hz;
- gain: one decimal dB;
- Q: two decimals;
- preamp: one decimal dB;
- normalize `-0.0` to `0.0`;
- preserve filter list order;
- type map exactly `PK | LS | HS`.

The formatter does not re-quantize. It rejects filters that are off the `POWERAMP_MANUAL_ENTRY_POLICY` grid to prevent export/validation drift.

- [ ] **Step 3: Write and implement curve export tests**

TXT format:

```text
Frequency\tdB
20\t0.123456
1000\t-1.500000
```

CSV format:

```text
Frequency,dB
20,0.123456
1000,-1.500000
```

Require equal non-empty arrays and finite values.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/exports
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): add reproducible preset and curve exports"
```

---

### Task 2: Implement versioned Workbench session JSON round-trip

**Files:**
- Create: `packages/core/src/session/schema.ts`
- Create: `packages/core/src/session/serialize.ts`
- Create: `packages/core/src/session/deserialize.ts`
- Create: `packages/core/test/session/session.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `WORKBENCH_SESSION_SCHEMA_VERSION = 1`.
- Produces `serializeSession(snapshot: WorkspaceSession): string`.
- Produces `deserializeSession(text: string): WorkspaceSession`.

- [ ] **Step 1: Define JSON-safe session contract**

```ts
interface WorkspaceSession {
  schemaVersion: 1
  source: Curve | null
  target: Curve | null
  sourceNormalization: Normalization
  targetNormalization: Normalization
  filters: Filter[]
  maxFilters: number
  solutionState: 'clean' | 'modified' | 'stale'
  runManifest: RunManifest | null
}
```

Do not serialize selected filter, ECharts zoom, Worker state, browser File objects, object URLs, or undo stack.

- [ ] **Step 2: Write exact round-trip test**

```ts
const encoded = serializeSession(sessionFixture)
const decoded = deserializeSession(encoded)
expect(decoded).toEqual(sessionFixture)
```

Also verify stable key ordering by asserting two serializations of the same snapshot are byte-identical.

- [ ] **Step 3: Write rejection tests**

Reject:

- malformed JSON;
- missing/unsupported schema version;
- non-finite curve values;
- filter type outside PK/LS/HS;
- filter bounds outside product constraints;
- maxFilters outside 0..64;
- manifest filters inconsistent with a claimed `clean` current solution when the session says filters are unchanged.

Return structured `CoreError` category `validation`.

- [ ] **Step 4: Implement serializer/deserializer**

Use plain JSON with two-space indentation and final newline. Validation must reuse core filter/curve validation helpers instead of duplicating rules.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/session
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): add portable Workbench sessions"
```

---

### Task 3: Add export/session controls and non-destructive browser I/O

**Files:**
- Create: `apps/web/src/features/export/ExportControls.tsx`
- Create: `apps/web/src/features/session/SessionControls.tsx`
- Create: `apps/web/src/features/export/ExportControls.test.tsx`
- Create: `apps/web/src/features/session/SessionControls.test.tsx`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Export buttons call core formatters and browser Blob/object-URL download helper.
- Session import atomically replaces authoritative workspace state only after full validation succeeds.

- [ ] **Step 1: Write a small browser download helper and test arguments**

Helper contract:

```ts
downloadTextFile({ filename: string, content: string, mimeType: string }): void
```

Tests mock `URL.createObjectURL`, anchor `.click()`, and `URL.revokeObjectURL`; they do not inspect browser internals.

- [ ] **Step 2: Implement ExportControls**

Buttons after a valid workspace result:

- `Export Poweramp`;
- `Export Source + EQ (.txt)`;
- `Export PEQ (.txt)`;
- `Export Residual (.txt)`;
- optional CSV choice via compact menu/select, not separate giant cards.

`Export Poweramp` is disabled if final current filters are not on the policy grid or if preamp/derived result is invalid.

- [ ] **Step 3: Write non-destructive session-import test**

Start with a valid store. Attempt invalid session import. Assert the entire prior authoritative snapshot is unchanged.

- [ ] **Step 4: Implement SessionControls**

Actions:

- `Export Session` -> `.autoeq-workbench.json`;
- `Import Session` -> read text, fully deserialize/validate, then commit one atomic store replacement and clear undo/redo history.

Filename should include a sanitized Source name and date when available but never include full local file paths.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter ./apps/web test -- ExportControls SessionControls
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "feat(web): add preset curve and session I/O"
```

---

### Task 4: Add detailed diagnostics and frequency-band metrics

**Files:**
- Create: `packages/core/src/metrics/bandMetrics.ts`
- Create: `packages/core/test/bandMetrics.test.ts`
- Create: `apps/web/src/features/diagnostics/DiagnosticsPanel.tsx`
- Create: `apps/web/src/features/diagnostics/DiagnosticsPanel.test.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `calculateBandMetrics(residual, frequencies, bands): BandMetric[]`.
- Diagnostics displays, but does not recompute, core metrics/audit.

- [ ] **Step 1: Write band-metric tests**

Default diagnostic bands:

```ts
[
  { id: '20-5000', minHz: 20, maxHz: 5000 },
  { id: '20-8000', minHz: 20, maxHz: 8000 },
  { id: '20-10000', minHz: 20, maxHz: 10000 },
  { id: '20-14000', minHz: 20, maxHz: 14000 },
  { id: '20-20000', minHz: 20, maxHz: 20000 }
]
```

Each band returns MAE, RMSE, max absolute residual, and max-error frequency using points inside inclusive band bounds.

- [ ] **Step 2: Implement band metrics through the existing metric primitive**

Filter indices by frequency range, then call the same `calculateErrorMetrics` logic; do not fork the formula.

- [ ] **Step 3: Implement compact main metrics and expandable diagnostics**

Main summary shows:

- `N filters`;
- full-range MAE;
- preamp.

Diagnostics shows:

- global RMSE/max error;
- band table;
- max Q/max boost filter;
- dense-grid max-boost frequency;
- cancellation audit list with Moderate/Strong labels;
- run algorithm version and state Clean/Modified/Stale.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- bandMetrics.test.ts
pnpm --filter ./apps/web test -- DiagnosticsPanel.test.tsx
git add packages/core apps/web
git commit -m "feat: add AutoEQ diagnostics and band metrics"
```

---

### Task 5: Build deterministic benchmark corpus and baseline recorder

**Files:**
- Create: `packages/core/benchmarks/cases.ts`
- Create: `packages/core/benchmarks/run.ts`
- Create: `packages/core/benchmarks/baseline-standard-v1.json`
- Modify: `packages/core/package.json`
- Create: `packages/core/test/autoeq/benchmarkInvariants.test.ts`

**Interfaces:**
- Produces `pnpm --filter @autoeq-workbench/core benchmark`.
- Produces machine-readable case results and committed baseline JSON.

- [ ] **Step 1: Define synthetic benchmark cases without private data**

Cases must be generated from mathematical filters/curves, not copied user measurements:

1. `flat_identity` — Source equals Target; expected 0 filters.
2. `broad_bass_shelf` — known LS correction.
3. `single_mid_peak` — known PK near 1.5 kHz.
4. `vocal_multi_feature` — two broad PK features from 700 Hz–3.5 kHz.
5. `irregular_treble` — multiple 6–16 kHz features.
6. `narrow_feature` — Q 8 feature to exercise high-Q allowance.
7. `filter_budget` — composite of >10 potential features.
8. `quantization_sensitive` — optimum between manual-entry grid values.
9. `preamp_overlap` — overlapping positive filters.
10. `opposing_filters_pressure` — target that can tempt cancellation.

Each generator returns Source, Target, normalizations, and maxFilters.

- [ ] **Step 2: Implement benchmark runner**

For each case run Standard once and record:

```ts
{
  caseId,
  algorithmVersion,
  elapsedMs,
  maeDb,
  rmseDb,
  maxAbsDb,
  filterCount,
  maxQ,
  maxFilterBoostDb,
  preampDb,
  moderateCancellations,
  strongCancellations,
  filters
}
```

Timing is informational and must not be used in deterministic equality assertions.

- [ ] **Step 3: Add benchmark invariants as automated tests**

Required invariants:

- `flat_identity.filterCount === 0`;
- no case exceeds configured maxFilters;
- no final filter violates gain/Q/Fc bounds or quantization grid;
- no case has a `strong` cancellation in final result;
- same case run twice produces same filters;
- final preamp is never less attenuating than dense combined boost requires.

- [ ] **Step 4: Add baseline command**

`package.json`:

```json
{
  "scripts": {
    "benchmark": "tsx benchmarks/run.ts",
    "benchmark:update": "tsx benchmarks/run.ts --write-baseline"
  }
}
```

Add `tsx` as core dev dependency. `--write-baseline` writes stable JSON sorted by case ID; normal `benchmark` prints a table and compares current algorithm metrics to baseline when present.

- [ ] **Step 5: Record initial Standard-v1 baseline**

```bash
pnpm --filter @autoeq-workbench/core benchmark:update
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core test -- benchmarkInvariants.test.ts
```

Commit the baseline as evidence, not as an assertion that tuning is complete.

- [ ] **Step 6: Commit**

```bash
git add packages/core/benchmarks packages/core/package.json packages/core/test
git commit -m "test(core): add Standard AutoEQ benchmark corpus"
```

---

### Task 6: Tune Standard-v1 only through benchmark-visible changes

**Files:**
- Modify when justified: `packages/core/src/autoeq/config.ts`
- Modify when justified: `packages/core/src/autoeq/{candidates,refine,prune,cancellation}.ts`
- Update: `packages/core/benchmarks/baseline-standard-v1.json`
- Create: `docs/research/AUTOEQ_ENGINE_VALIDATION_v1.md`

**Interfaces:**
- Produces documented `standard-v1` baseline and rationale for retained/rejected defaults.

- [ ] **Step 1: Run baseline before changing algorithm constants**

```bash
pnpm --filter @autoeq-workbench/core benchmark > /tmp/autoeq-before.txt
```

Preserve the output in the work session for comparison; do not commit `/tmp` files.

- [ ] **Step 2: Evaluate one tuning hypothesis at a time**

Allowed initial hypotheses include:

- deadband 0.1 dB vs 0.05/0.15;
- candidate threshold 0.5 dB vs 0.4/0.75;
- filter-count penalty strength;
- high-Q penalty strength;
- pruning tolerance;
- cancellation penalty thresholds.

Change one conceptual parameter family per experiment, rerun benchmark, and revert when evidence is not clearly better.

- [ ] **Step 3: Apply regression guardrails**

Do not retain a tuning change when any of these occur without an explicit documented trade-off:

- new strong cancellation appears;
- deterministic output changes between identical repeated runs;
- any easy case (`flat_identity`, `broad_bass_shelf`, `single_mid_peak`) worsens MAE by >0.15 dB;
- filter count grows by >=3 with <0.05 dB MAE improvement;
- quantization-sensitive case becomes worse post-quantization than its previous baseline by >0.15 dB.

A trade-off exception must be written into the validation report with before/after metrics.

- [ ] **Step 4: Write `AUTOEQ_ENGINE_VALIDATION_v1.md`**

Required sections:

```text
# AutoEQ Engine Validation v1
- Corpus and methodology
- Standard-v1 retained defaults
- Defaults tested and rejected
- Per-case result table
- Filter-count/MAE trade-offs
- Q/cancellation findings
- Quantization findings
- Preamp findings
- Known limitations
- Next profiles/research
```

Clearly distinguish synthetic benchmark evidence from claims about real IEM measurement uncertainty.

- [ ] **Step 5: Freeze/update baseline and verify**

```bash
pnpm --filter @autoeq-workbench/core benchmark:update
pnpm --filter @autoeq-workbench/core benchmark
pnpm test
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core docs/research/AUTOEQ_ENGINE_VALIDATION_v1.md
git commit -m "test: validate Standard AutoEQ v1 defaults"
```

---

### Task 7: Add one real browser E2E acceptance flow

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/workbench.spec.ts`
- Create: `apps/web/e2e/fixtures/source.txt`
- Create: `apps/web/e2e/fixtures/target.csv`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces `pnpm --filter ./apps/web e2e`.

- [ ] **Step 1: Add Playwright as dev-only test dependency**

```bash
pnpm --dir apps/web add -D @playwright/test
pnpm --dir apps/web exec playwright install chromium
```

Add script:

```json
"e2e": "playwright test"
```

Do not commit browser binaries.

- [ ] **Step 2: Create synthetic fixture files**

`source.txt` and `target.csv` contain small deterministic generated curves spanning 20 Hz–20 kHz. They must not contain real user measurement data.

- [ ] **Step 3: Write full flow test**

The Chromium flow must:

1. open workbench;
2. import Source `.txt`;
3. import Target `.csv`;
4. verify graph legend contains Source/Target;
5. set normalization 500 Hz / 0 dB;
6. add a manual PK and verify filter row;
7. run AutoEQ and await completed status;
8. verify filter count <=10;
9. edit one final Gain and verify `Modified` state;
10. disable a filter and verify row remains;
11. export Poweramp and assert downloaded text contains `Preamp:` and `Filter 1:`;
12. export session;
13. reload page;
14. import exported session and verify filter count/state are restored.

- [ ] **Step 4: Run E2E plus regular verification**

```bash
pnpm --filter ./apps/web e2e
pnpm test
pnpm typecheck
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "test(web): cover complete Workbench browser flow"
```

---

### Task 8: Final visual/interaction pass against the CrinGraph/Squiglink direction

**Files:**
- Modify only as needed: `apps/web/src/App.tsx`
- Modify only as needed: `apps/web/src/index.css`
- Modify only as needed: UI/feature components under `apps/web/src`
- Test affected components only when behavior changes.

**Interfaces:**
- No domain/API changes. This task is constrained to presentation/usability issues found during direct observation.

- [ ] **Step 1: Run the app with representative curves**

```bash
pnpm --filter ./apps/web dev
```

Open desktop viewport around 1440x900 and a narrower ~900px viewport.

- [ ] **Step 2: Directly inspect the required interaction language**

Verify:

- graph is the visually dominant element;
- toolbar is compact and adjacent to graph;
- Source/Target/AutoEQ controls and filter editor are dense rather than card-heavy;
- filter table remains usable with 10+ rows;
- selected filter is visibly connected to graph highlight;
- Run AutoEQ and Export Poweramp remain easy to locate;
- no measurement-database selectors or Squiglink-specific catalog UI leaked into product;
- narrow layout stacks lower panels without making graph unusable.

- [ ] **Step 3: Make only observed presentation fixes**

Do not redesign architecture or introduce a component library. Use existing Tailwind/primitives. Any behavior change gets a focused test before the fix.

- [ ] **Step 4: Re-run affected tests and build**

```bash
pnpm --filter ./apps/web test
pnpm --filter ./apps/web typecheck
pnpm --filter ./apps/web build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "style: refine graph-centered Workbench layout"
```

---

### Task 9: Execute the MVP acceptance gate and final diff/history review

**Files:**
- Modify only if verification finds a concrete defect.
- Update: `docs/research/AUTOEQ_ENGINE_VALIDATION_v1.md` only if final evidence changes recorded results.

**Interfaces:**
- Produces evidence that the approved MVP acceptance criteria are satisfied.

- [ ] **Step 1: Run all automated verification**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter ./apps/web e2e
git diff --check
```

Every command must exit 0 before claiming completion.

- [ ] **Step 2: Verify acceptance criteria directly**

Check all 20 criteria from section 21 of the spec, including import, normalization, non-blocking/cancellable AutoEQ, 0..maxFilters behavior, manual PK/LS/HS editing, enable/disable, selected filter inspection, post-quantization validation, dense preamp, exact export, curve/session export, non-destructive failure, benchmark evidence, and graph-centered interaction language.

- [ ] **Step 3: Review repository diff/history for scope and hygiene**

Inspect:

```bash
git status --short
git log --oneline --decorate -20
git diff HEAD~1..HEAD --check
```

Review for accidental secrets/private paths, committed generated browser artifacts, user measurements, unnecessary dependencies, UI-domain coupling, and unrelated refactors.

- [ ] **Step 4: Document residual risks, not process theater**

In the final implementation report, mention only material residual issues, for example Standard-v1 synthetic-benchmark limitations, lack of rig confidence weighting, fixed 48 kHz, or native Poweramp backup-format support being intentionally out of scope.

- [ ] **Step 5: Final commit only if acceptance verification required a fix**

If no fix was needed, do not create an empty ceremonial commit. If a concrete defect was fixed, commit only that verified change with an accurate message.

---

## Plan 3 Completion Gate

The MVP is ready for user review only when:

- every automated command in Task 9 passes;
- the browser E2E flow passes in Chromium;
- Standard-v1 benchmark baseline is committed and validation report explains retained/rejected tuning choices;
- Poweramp-style text is generated from exactly the final quantized displayed filters;
- session JSON round-trips authoritative state and invalid session import is non-destructive;
- final UI directly observed at desktop/narrow viewport remains graph-centered and technically dense;
- repository review finds no private data, local paths, secrets, accidental generated artifacts, or unrelated scope drift.