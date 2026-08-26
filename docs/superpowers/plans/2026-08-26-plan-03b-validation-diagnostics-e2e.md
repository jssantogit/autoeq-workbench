# Plan 3B — Frozen Validation, Diagnostics & Browser Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce reproducible evidence for frozen Standard AutoEQ v1, extend current-workspace diagnostics, and add one committed real-browser acceptance flow without tuning the optimizer.

**Architecture:** Deterministic metrics/benchmark primitives stay in `packages/core`; Tools consumes core outputs without recomputing formulas; Playwright Test provides committed browser acceptance while Playwright CLI remains an agent-side inspection tool.

**Tech Stack:** TypeScript, Vitest, React/Testing Library, `@playwright/test`, Vite, existing core API.

**Spec:** `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`

## Global Constraints

- Plan 3A must be complete and green before starting.
- `standard-v1` algorithm constants and optimizer files are read-only for this plan except a test-only import; do not tune them.
- Benchmarks use synthetic/generated curves only; no user measurement may enter fixtures or baseline JSON.
- Timing is informational, never deterministic acceptance.
- Analysis describes the current editor/workspace; manifest data is labeled origin/provenance only.
- Browser fixtures are synthetic and committed; browser binaries/artifacts are not committed.
- TDD and commit each task separately.

---

### Task 1: Add reusable frequency-band metrics

**Files:**
- Create: `packages/core/src/metrics/bandMetrics.ts`
- Create: `packages/core/test/bandMetrics.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface MetricBand {
  id: string
  minHz: number
  maxHz: number
}

export interface BandMetric extends ErrorMetrics {
  id: string
  minHz: number
  maxHz: number
}

export function calculateBandMetrics(
  residualDb: readonly number[],
  frequenciesHz: readonly number[],
  bands: readonly MetricBand[],
): BandMetric[]
```

- [ ] **Step 1: Write failing inclusive-band tests**

Use a tiny deterministic frequency/residual vector and assert samples exactly on `minHz`/`maxHz` are included. Assert returned MAE/RMSE/max/max-frequency equals calling the existing `calculateErrorMetrics` on the selected slice.

Reject empty bands, inverted bounds, unequal arrays and a band containing no samples with `CoreError('validation', ...)`.

- [ ] **Step 2: Implement by delegating to existing metric authority**

Select band indices, then call `calculateErrorMetrics`. Do not duplicate MAE/RMSE formulas.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- bandMetrics.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): add frequency-band diagnostics"
```

---

### Task 2: Extend Tools Analysis as current-workspace diagnostics

**Files:**
- Modify: `apps/web/src/features/tools/AnalysisSection.tsx`
- Modify: `apps/web/src/features/tools/AnalysisSection.test.tsx`
- Modify: `apps/web/src/state/workspaceStore.ts` only if a derived diagnostic field prevents duplicate calculations
- Use existing: `auditCancellations`, `createEvaluationGrid`, `calculateBandMetrics`

**Interfaces:**
- Main Analysis continues to consume `WorkspaceDerived` and authoritative current filters.
- Default bands are exactly:

```ts
[
  { id: '20-5000', minHz: 20, maxHz: 5_000 },
  { id: '20-8000', minHz: 20, maxHz: 8_000 },
  { id: '20-10000', minHz: 20, maxHz: 10_000 },
  { id: '20-14000', minHz: 20, maxHz: 14_000 },
  { id: '20-20000', minHz: 20, maxHz: 20_000 },
]
```

- [ ] **Step 1: Write current-vs-origin behavior tests**

Construct a clean AutoEQ result, then manually edit one filter. Assert the displayed live metrics change with the current filter state while the origin line still says `standard-v1` and current state says `Modified`.

For stale context, assert state displays `Stale` without replacing live metrics by manifest metrics.

- [ ] **Step 2: Add live cancellation and band calculations**

Use the current enabled cascade and canonical evaluation grid. Display Moderate/Strong counts; list pair IDs only in expanded diagnostic detail. Do not calculate a new optimization objective.

- [ ] **Step 3: Keep the UI compact and behavior-only**

This task may add semantic rows/markup but not final visual styling; Plan 3C owns the section grammar and typography.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter ./apps/web test -- AnalysisSection
pnpm --filter ./apps/web typecheck
git add apps/web packages/core
git commit -m "feat(web): expand current-solution diagnostics"
```

---

### Task 3: Build the frozen Standard-v1 synthetic benchmark corpus

**Files:**
- Create: `packages/core/benchmarks/cases.ts`
- Create: `packages/core/benchmarks/run.ts`
- Create: `packages/core/benchmarks/baseline-standard-v1.json`
- Create: `packages/core/test/autoeq/benchmarkInvariants.test.ts`
- Modify: `packages/core/package.json`
- Modify: workspace lockfile only for the explicit `tsx` dev dependency if not already present

**Interfaces:**

```ts
export interface BenchmarkCase {
  id: string
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettings
}

export interface BenchmarkResult {
  caseId: string
  algorithmVersion: 'standard-v1'
  elapsedMs: number
  maeDb: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  maxQ: number
  maxFilterBoostDb: number
  preampDb: number
  moderateCancellations: number
  strongCancellations: number
  filters: Filter[]
}
```

- [ ] **Step 1: Define ten mathematical cases**

Generate every case in code from flat curves and core filter-response primitives:

```text
flat_identity
broad_bass_shelf
single_mid_peak
vocal_multi_feature
irregular_treble
narrow_feature
filter_budget
quantization_sensitive
preamp_overlap
opposing_filters_pressure
```

Use default `{ mode:'hz', frequencyHz:500, levelDb:60 }` unless a case explicitly exercises another normalization mode. Do not copy real FR samples.

- [ ] **Step 2: Write invariants before baseline generation**

Required tests:

```ts
expect(flatIdentity.filters).toHaveLength(0)
expect(result.filters.length).toBeLessThanOrEqual(case.settings.maxFilters)
expect(result.filters.every(isOnManualGridAndInsideProductBounds)).toBe(true)
expect(result.filters.every((filter) => filter.gainDb !== 0)).toBe(true)
expect(result.cancellationAudit.pairs.some((p) => p.severity === 'strong')).toBe(false)
expect(runAgain.filters).toEqual(result.filters)
expect(runAgain.metrics).toEqual(result.metrics)
```

Also verify delivered preamp is at least as attenuating as the dense combined-cascade maximum requires.

- [ ] **Step 3: Implement benchmark CLI**

Add scripts:

```json
"benchmark": "tsx benchmarks/run.ts",
"benchmark:update": "tsx benchmarks/run.ts --write-baseline"
```

Normal `benchmark` reads committed baseline, re-runs cases and fails on deterministic filter/metric drift. Ignore `elapsedMs` in comparison. `benchmark:update` is the only command that writes the baseline.

- [ ] **Step 4: Record the initial frozen baseline**

Run:

```bash
pnpm --filter @autoeq-workbench/core benchmark:update
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core test -- benchmarkInvariants.test.ts
```

Review the JSON diff before commit. Do not change optimizer constants to make cases look better.

- [ ] **Step 5: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "test(core): freeze Standard v1 benchmark evidence"
```

---

### Task 4: Write a Standard-v1 validation report without tuning

**Files:**
- Create: `docs/research/AUTOEQ_ENGINE_VALIDATION_v1.md`

**Interfaces:**
- Report consumes committed benchmark results only; it changes no product behavior.

- [ ] **Step 1: Generate the benchmark output for the report**

```bash
pnpm --filter @autoeq-workbench/core benchmark
```

- [ ] **Step 2: Write the report with these exact sections**

```text
# AutoEQ Engine Validation v1
- Scope and frozen-version policy
- Synthetic corpus and methodology
- Per-case result table
- Filter-count and residual observations
- Q and cancellation observations
- Quantization observations
- Preamp observations
- Normalization-mode note
- Known limitations
- Future version/profile research
```

Explicitly state that synthetic evidence is not a claim about rig uncertainty or perceptual preference. Record weaknesses as future work, not reasons to tune `standard-v1` in this plan.

- [ ] **Step 3: Commit**

```bash
git add docs/research/AUTOEQ_ENGINE_VALIDATION_v1.md
git commit -m "docs: record Standard v1 benchmark validation"
```

---

### Task 5: Add committed Chromium E2E for the authoritative workflow

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/workbench.spec.ts`
- Create: `apps/web/e2e/fixtures/source.txt`
- Create: `apps/web/e2e/fixtures/target.csv`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `pnpm --filter ./apps/web e2e`.
- Uses synthetic files only.

- [ ] **Step 1: Add Playwright Test as a dev dependency**

```bash
pnpm --dir apps/web add -D @playwright/test
pnpm --dir apps/web exec playwright install chromium
```

Add:

```json
"e2e": "playwright test"
```

Browser binaries remain outside Git.

- [ ] **Step 2: Commit synthetic FR/Target fixtures**

Fixtures span 20 Hz–20 kHz, contain no user data and create a correction large enough for Standard AutoEQ to produce at least one filter under default settings.

- [ ] **Step 3: Write the full browser flow**

Chromium test must:

1. open Workbench;
2. import Source TXT and Target CSV;
3. verify both appear in graph/controls;
4. verify Normalize defaults to Hz / 500 and remembered dB value 60;
5. switch to dB mode, then back to Hz, verifying selected mode and value retention;
6. add/edit a manual PK and verify row values;
7. run AutoEQ and wait for result;
8. assert delivered filter count is inside configured max;
9. edit one generated Gain and assert `Modified` state appears in Analysis;
10. disable one filter and leave it present in editor;
11. export Equalizer APO, Poweramp and Wavelet and inspect downloaded text for the expected format markers;
12. assert the disabled filter is absent from active APO/Poweramp output/effect;
13. export Session;
14. change workspace state;
15. import the exported Session and verify curves, normalization, filters, enabled state and solution state restore;
16. verify Compare history is empty after Session import.

Use accessible roles/labels, not brittle CSS selectors where practical.

- [ ] **Step 4: Verify E2E repeatability**

Run twice:

```bash
pnpm --filter ./apps/web e2e
pnpm --filter ./apps/web e2e
```

Both must pass without committed screenshots/traces/videos.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "test(web): add Workbench browser acceptance flow"
```

---

### Task 6: Plan 3B full verification and scope review

**Files:**
- Modify only if verification finds a concrete defect in 3B scope.

- [ ] **Step 1: Run the full automated gate**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter ./apps/web e2e
pnpm build:pages
git diff --check
```

- [ ] **Step 2: Confirm optimizer freeze mechanically**

Review diff from the Plan 3A completion SHA and confirm no behavior changes were made to:

```text
packages/core/src/autoeq/candidates.ts
packages/core/src/autoeq/config.ts algorithm constants
packages/core/src/autoeq/discreteRefine.ts
packages/core/src/autoeq/loss.ts
packages/core/src/autoeq/optimize.ts
packages/core/src/autoeq/prune.ts
packages/core/src/autoeq/quantize.ts
packages/core/src/autoeq/refine.ts
```

Schema/type wiring is allowed only where documented by the spec.

- [ ] **Step 3: Review repository hygiene**

```bash
git status --short
git diff --check
git log --oneline --decorate -20
```

No browser artifacts, user measurement files, local paths or secrets may be committed.

- [ ] **Step 4: Commit only a real verification fix**

If every gate is already green, do not create a ceremonial commit.

## Plan 3B Completion Gate

Plan 3B is complete only when the synthetic benchmark is committed and deterministic, validation report is explicit about the frozen-version policy, live Analysis describes the current workspace, Chromium E2E passes twice, and the full repository gate is green without optimizer tuning.
