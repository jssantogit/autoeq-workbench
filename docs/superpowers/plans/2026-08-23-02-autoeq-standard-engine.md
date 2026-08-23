# AutoEQ Workbench Standard Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Standard AutoEQ engine that starts from zero filters, generates and refines PK/LS/HS candidates, penalizes unnecessary complexity, prunes/cancellation-audits the result, quantizes it, and runs safely in a Web Worker.

**Architecture:** The engine lives entirely in `packages/core`. It uses a deterministic greedy-addition loop plus bounded coordinate descent over the complete filter cascade. The browser calls it through a typed worker protocol; successful runs replace the current solution atomically, while cancel/failure preserves prior valid state.

**Tech Stack:** TypeScript, Vitest, existing core DSP/curve functions from Plan 1, Vite Web Workers, React/Zustand integration in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`

## Global Constraints

- Complete the mandatory Plan 1.5 Visual Foundation Closeout gate before starting this plan.
- Standard profile uses fixed 48,000 Hz sample rate and 20 Hz–20 kHz optimization range.
- Standard allows PK/LS/HS, filter gain -15..+15 dB, PK Q 0.1..12, shelf Q 0.7.
- `maxFilters` default 10, hard ceiling 64, and is never a fill target.
- Optimizer must start from zero filters for each run.
- Same Source, Target, effective config, and algorithm version must produce the same result.
- Optimization evaluates the complete enabled cascade, not isolated filter gain heuristics.
- Final reported result is quantized before final metrics/preamp.
- Exact tuning constants introduced here are initial `standard-v1` seeds and must be benchmarked in Plan 3; do not hide them in implementation code.
- No confidence/rig weighting in Standard v1.

---

## File Structure Locked by This Plan

```text
packages/core/src/autoeq/
  config.ts
  types.ts
  loss.ts
  candidates.ts
  optimize.ts
  refine.ts
  prune.ts
  cancellation.ts
  quantize.ts
  discreteRefine.ts
  runStandardAutoEq.ts
packages/core/test/autoeq/
  loss.test.ts
  candidates.test.ts
  refine.test.ts
  cancellation.test.ts
  quantize.test.ts
  standard.test.ts
apps/web/src/workers/
  autoeq.worker.ts
  autoeqClient.ts
apps/web/src/features/autoeq/
  AutoEqControls.tsx
  AutoEqStatus.tsx
```

---

### Task 1: Define Standard config, result contracts, and robust objective

**Files:**
- Create: `packages/core/src/autoeq/types.ts`
- Create: `packages/core/src/autoeq/config.ts`
- Create: `packages/core/src/autoeq/loss.ts`
- Create: `packages/core/test/autoeq/loss.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `AutoEqConfig`, `AutoEqMetrics`, `CancellationAudit`, `RunManifest`, `AutoEqResult`.
- Produces `STANDARD_V1_CONFIG`.
- Produces `evaluateObjective(input: ObjectiveInput): ObjectiveBreakdown`.

- [ ] **Step 1: Write config invariant tests**

```ts
import { MVP_NUMERIC_POLICY, STANDARD_V1_CONFIG } from '../../src/index.js'

it('exposes Standard v1 product bounds', () => {
  expect(STANDARD_V1_CONFIG).toMatchObject({
    sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
    minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
    maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
    fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  })
  expect(STANDARD_V1_CONFIG.defaultMaxFilters).toBe(10)
  expect(STANDARD_V1_CONFIG.hardMaxFilters).toBe(64)
  expect(STANDARD_V1_CONFIG.minGainDb).toBe(-15)
  expect(STANDARD_V1_CONFIG.maxGainDb).toBe(15)
  expect(STANDARD_V1_CONFIG.minPkQ).toBe(0.1)
  expect(STANDARD_V1_CONFIG.maxPkQ).toBe(12)
})
```

- [ ] **Step 2: Define explicit initial algorithm constants**

Use a separate `algorithm` block so Plan 3 can tune it without changing product bounds:

```ts
import { MVP_NUMERIC_POLICY } from '../config/numericPolicy.js'

export const STANDARD_V1_CONFIG = {
  profile: 'Standard',
  algorithmVersion: 'standard-v1',
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  minFrequencyHz: MVP_NUMERIC_POLICY.minFrequencyHz,
  maxFrequencyHz: MVP_NUMERIC_POLICY.maxFrequencyHz,
  fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  defaultMaxFilters: 10,
  hardMaxFilters: 64,
  minGainDb: -15,
  maxGainDb: 15,
  minPkQ: 0.1,
  maxPkQ: 12,
  shelfQ: 0.7,
  algorithm: {
    deadbandDb: 0.1,
    huberDeltaDb: 1.0,
    candidateThresholdDb: 0.5,
    minObjectiveImprovement: 0.005,
    pruneTolerance: 0.002,
    filterCountWeight: 0.01,
    highQWeight: 0.002,
    gainWeight: 0.0005,
    cancellationWeight: 0.01
  }
} as const
```

The sample rate, optimization range, and fit density are sourced from the frozen MVP numeric policy rather than duplicated in the AutoEQ module. The remaining Standard-specific values are engineering starting points, not scientific claims.

- [ ] **Step 3: Write objective tests**

Required behavior:

```ts
it('applies a 0.1 dB residual deadband', () => {
  const a = evaluateObjective(makeObjectiveInput({ residualDb: [0.05, -0.08] }))
  expect(a.fit).toBe(0)
})

it('charges for extra filters even with identical residual', () => {
  const noFilters = evaluateObjective(makeObjectiveInput({ residualDb: [1, -1], filters: [] }))
  const oneFilter = evaluateObjective(makeObjectiveInput({ residualDb: [1, -1], filters: [pk({ gainDb: 1 })] }))
  expect(oneFilter.total).toBeGreaterThan(noFilters.total)
})
```

- [ ] **Step 4: Implement deadbanded Huber fit and structural penalties**

Per residual sample:

```ts
const magnitude = Math.max(0, Math.abs(errorDb) - deadbandDb)
const huber = magnitude <= delta
  ? 0.5 * magnitude * magnitude
  : delta * (magnitude - 0.5 * delta)
```

Penalties:

```ts
filterCount = filters.length * filterCountWeight
highQ = sum(max(0, log2(q / 2)) ** 2) * highQWeight
gain = sum(max(0, abs(gainDb) - 6) ** 2) * gainWeight
cancellation = cancellationScore * cancellationWeight
```

Return each component plus `total`; keep tests against components, not only total.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/loss.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): define Standard AutoEQ objective"
```

---

### Task 2: Generate deterministic PK and shelf candidates from residual regions

**Files:**
- Create: `packages/core/src/autoeq/candidates.ts`
- Create: `packages/core/test/autoeq/candidates.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `findResidualRegions(frequencies, residualDb, thresholdDb): ResidualRegion[]`.
- Produces `generateCandidates(input: CandidateInput): FilterCandidate[]`.

- [ ] **Step 1: Write region tests**

```ts
it('splits contiguous residuals when sign changes', () => {
  const regions = findResidualRegions([100, 200, 400, 800], [1, 1, -1, -1], 0.5)
  expect(regions).toHaveLength(2)
  expect(regions[0].sign).toBe(1)
  expect(regions[1].sign).toBe(-1)
})
```

Regions require `abs(residual) >= threshold` and consistent sign; sub-threshold points close a region.

- [ ] **Step 2: Write PK candidate test**

For a region from 500 to 2000 Hz, candidate Fc is geometric center and initial Q uses the Squiglink-inspired width estimate before clamping:

```ts
const center = Math.sqrt(startHz * endHz)
const q = clamp(center / Math.max(1e-9, endHz - startHz), 0.1, 12)
```

Initial gain is residual interpolated at center, clamped to -15..+15 dB.

- [ ] **Step 3: Write shelf candidate tests**

Generate an LS candidate only when at least 70% of fit-grid points from 20–200 Hz share the same residual sign and median absolute residual >= threshold. Use `Fc=105 Hz`, `Q=0.7`, gain equal to clamped median residual.

Generate an HS candidate under the same rule for 8–20 kHz, using `Fc=10000 Hz`, `Q=0.7`.

- [ ] **Step 4: Implement deterministic ordering and deduplication**

Sort candidates by:

1. broader region first (`regionOctaves` descending);
2. absolute initial gain descending;
3. Fc ascending;
4. type order `LS`, `PK`, `HS` for stable ties.

Deduplicate candidates with same type and Fc within 1/48 octave, keeping the broader/higher-magnitude candidate.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/candidates.test.ts
git add packages/core
git commit -m "feat(core): generate AutoEQ filter candidates"
```

---

### Task 3: Implement deterministic whole-cascade coordinate refinement

**Files:**
- Create: `packages/core/src/autoeq/refine.ts`
- Create: `packages/core/src/autoeq/optimize.ts`
- Create: `packages/core/test/autoeq/refine.test.ts`

**Interfaces:**
- Produces `refineFilters(input: RefineInput): Filter[]`.
- Produces `optimizeGreedy(input: OptimizeInput): OptimizationState`.

- [ ] **Step 1: Write refinement test against a known PK target**

Build a synthetic desired correction from one known PK (`Fc=1000`, `Gain=6`, `Q=2`) and initialize a candidate at 900 Hz / 5 dB / Q 1.5. Assert refinement reduces objective and moves parameters closer to the known response.

Do not assert exact recovered parameters; assert final response MAE < initial response MAE.

- [ ] **Step 2: Implement three deterministic refinement passes**

For each enabled filter, evaluate local neighborhoods while holding all other filters fixed.

Use these pass scales:

```ts
const passes = [
  { fcOctaveStep: 1 / 6, gainStepDb: 1.0, qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1, qOctaveStep: 1 / 32 }
]
```

For PK, candidate values are current plus/minus one step for Fc/Gain/Q, including the unchanged value. Fc/Q steps are multiplicative powers of 2. Clamp every candidate to product bounds.

For LS/HS, keep Q fixed at 0.7 but refine Fc and gain.

At each coordinate choose the lowest objective; for exact ties choose lower absolute gain, then lower Q, then lower Fc for determinism.

- [ ] **Step 3: Write greedy-addition test**

Synthetic desired correction requiring one broad +4 dB feature should result in at least one filter but fewer than `maxFilters=10`, and objective must monotonically decrease across accepted additions.

- [ ] **Step 4: Implement greedy loop**

Pseudo-contract:

```ts
while (filters.length < maxFilters) {
  const residual = desired - cascade(filters)
  const candidates = generateCandidates(...)
  const evaluated = candidates.map(c => refineFilters([...filters, c]))
  const best = minimumObjective(evaluated)
  if (currentObjective - best.objective < minObjectiveImprovement) break
  filters = best.filters
  currentObjective = best.objective
}
```

Recompute residual from the complete cascade after every accepted candidate. Never mutate an earlier run's filters.

- [ ] **Step 5: Add a hard guard for maxFilters**

`run` input validation rejects `<0`, non-integer, or `>64`. Zero is valid and returns no filters.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/refine.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git add packages/core
git commit -m "feat(core): add deterministic AutoEQ optimizer"
```

---

### Task 4: Add cancellation audit and iterative pruning

**Files:**
- Create: `packages/core/src/autoeq/cancellation.ts`
- Create: `packages/core/src/autoeq/prune.ts`
- Create: `packages/core/test/autoeq/cancellation.test.ts`
- Modify: `packages/core/src/autoeq/loss.ts`

**Interfaces:**
- Produces `auditCancellations(filters, frequencies, sampleRateHz): CancellationAudit`.
- Produces `pruneFilters(input: PruneInput): Filter[]`.

- [ ] **Step 1: Write cancellation tests**

Create two nearby opposite PKs and two far-apart opposite PKs. Nearby pair must score higher.

Pair scoring:

1. only opposite-sign non-zero gain pairs;
2. compute octave distance `abs(log2(fcA/fcB))`; ignore pairs > 1 octave;
3. compute each individual dB response on fit grid;
4. compute cosine similarity of `abs(responseA)` and `abs(responseB)`;
5. `score = similarity * (1 - octaveDistance) * min(abs(gainA), abs(gainB)) / 15`.

Severity:

- `strong` when score >= 0.65;
- `moderate` when score >= 0.35;
- otherwise omit from audit.

Return pair IDs, score, severity, and total score.

- [ ] **Step 2: Wire total cancellation score into objective**

`evaluateObjective` receives the audit's total score, not an independently recomputed approximation.

- [ ] **Step 3: Write pruning tests**

A 0.03 dB filter must be removed. A filter whose removal improves objective must be removed. A necessary +6 dB PK matching a synthetic target must remain.

- [ ] **Step 4: Implement iterative pruning**

Algorithm:

1. remove filters with `abs(gainDb) < 0.05`;
2. for each remaining filter in stable list order, evaluate objective without it;
3. remove when `objectiveWithout <= currentObjective + pruneTolerance`;
4. after each removal restart scan from index 0;
5. stop when a full pass removes nothing;
6. call one final `refineFilters` pass after pruning.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/cancellation.test.ts
pnpm --filter @autoeq-workbench/core test
git add packages/core
git commit -m "feat(core): audit and prune AutoEQ filters"
```

---

### Task 5: Quantize final filters and perform bounded discrete refinement

**Files:**
- Create: `packages/core/src/autoeq/quantize.ts`
- Create: `packages/core/src/autoeq/discreteRefine.ts`
- Create: `packages/core/test/autoeq/quantize.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `POWERAMP_MANUAL_ENTRY_POLICY`.
- Produces `quantizeFilter(filter, policy): Filter`.
- Produces `quantizeFilters(filters, policy): Filter[]`.
- Produces `discreteRefine(input): Filter[]`.

- [ ] **Step 1: Define one explicit MVP manual-entry precision policy**

Use:

```ts
export const POWERAMP_MANUAL_ENTRY_POLICY = {
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1
} as const
```

This is the Workbench's **Poweramp-style manual-entry export precision**, kept in one adapter-facing policy source. It is not a claim about Poweramp's native backup-file schema.

- [ ] **Step 2: Write quantization tests**

```ts
expect(quantizeFilter(pk({ frequencyHz: 1000.49, gainDb: 1.26, q: 1.237 }), policy))
  .toMatchObject({ frequencyHz: 1000, gainDb: 1.3, q: 1.24 })
```

Verify clamping happens before rounding and `-0` is normalized to `0`.

- [ ] **Step 3: Implement quantization**

Use nearest-step rounding with decimal-safe helper:

```ts
const roundToStep = (value: number, step: number) =>
  Math.round((value + Number.EPSILON) / step) * step
```

Then normalize known decimal precision to avoid floating artifacts in manifests/text.

- [ ] **Step 4: Write discrete refinement test**

Start from a continuous filter that rounds slightly away from the best fit. Assert `discreteRefine` never returns a worse objective than raw quantization and every returned parameter lies exactly on policy steps.

- [ ] **Step 5: Implement bounded discrete neighborhood search**

For two passes, for each filter test the Cartesian product of current and ±1 quantization step for allowed parameters. Keep shelves Q fixed at 0.7. Choose best objective with deterministic tie-breakers. Never leave policy grid or product bounds.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/quantize.test.ts
git add packages/core
git commit -m "feat(core): quantize and discretely refine AutoEQ"
```

---

### Task 6: Assemble the Standard pipeline and reproducible run manifest

**Files:**
- Create: `packages/core/src/autoeq/runStandardAutoEq.ts`
- Create: `packages/core/test/autoeq/standard.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `runStandardAutoEq(input: StandardAutoEqInput): AutoEqResult`.

- [ ] **Step 1: Write an end-to-end synthetic recovery test**

Construct Target as flat 0 dB on a 96-points-per-octave grid. Construct Source as the inverse of a known +5 dB PK at 1 kHz/Q 1.5, so desired correction equals that PK response.

Run with `maxFilters=5` and assert:

```ts
expect(result.filters.length).toBeGreaterThan(0)
expect(result.filters.length).toBeLessThanOrEqual(5)
expect(result.metrics.maeDb).toBeLessThan(0.25)
expect(result.manifest.algorithmVersion).toBe('standard-v1')
expect(result.manifest.finalFilters).toEqual(result.filters)
```

- [ ] **Step 2: Write a determinism test**

Run identical input twice and assert deep equality of `filters`, metrics rounded to manifest precision, cancellation audit, and preamp.

- [ ] **Step 3: Implement exact pipeline order**

```text
validate -> common 96-ppo log grid -> normalize/prepared input -> desired
-> greedy optimize -> prune/refine -> cancellation audit
-> quantize -> discrete refine -> exact final cascade
-> final metrics -> dense-grid preamp -> manifest
```

Final metrics must use final quantized/discretely-refined filters only.

- [ ] **Step 4: Build run manifest**

Manifest includes:

```ts
{
  schemaVersion: 1,
  algorithmVersion: 'standard-v1',
  profile: 'Standard',
  sampleRateHz: 48000,
  optimizationRangeHz: [20, 20000],
  maxFilters,
  sourceName,
  targetName,
  sourceNormalization,
  targetNormalization,
  algorithmParameters: STANDARD_V1_CONFIG.algorithm,
  finalFilters,
  metrics,
  preampDb,
  cancellationSummary
}
```

- [ ] **Step 5: Run full core suite**

```bash
pnpm --filter @autoeq-workbench/core test
pnpm --filter @autoeq-workbench/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): complete Standard AutoEQ pipeline"
```

---

### Task 7: Add typed Web Worker execution and safe cancellation

**Files:**
- Create: `apps/web/src/workers/autoeq.worker.ts`
- Create: `apps/web/src/workers/autoeqClient.ts`
- Create: `apps/web/src/workers/autoeqClient.test.ts`
- Modify: `apps/web/src/state/workspaceStore.ts`

**Interfaces:**
- Produces `runAutoEq(request): Promise<AutoEqResult>` and `cancelAutoEq(): void`.
- Worker messages use `{ type: 'run' | 'result' | 'error'; runId: string; ... }`.

- [ ] **Step 1: Write client state-transition tests with a fake Worker adapter**

Required sequence:

```text
idle -> running -> success -> idle
idle -> running -> cancel -> idle
idle -> running -> error -> idle
```

Cancel/error must not call `setFilters` with partial data.

- [ ] **Step 2: Implement worker module**

Vite worker creation:

```ts
new Worker(new URL('./autoeq.worker.ts', import.meta.url), { type: 'module' })
```

`autoeq.worker.ts` imports only core, runs `runStandardAutoEq`, and serializes `CoreError` into structured worker error data.

- [ ] **Step 3: Implement cancellation by terminating active worker**

On cancel:

1. `worker.terminate()`;
2. reject active promise with a typed cancellation result;
3. discard any late message by run ID;
4. create a fresh Worker for the next run.

Do not fake percentage progress.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter ./apps/web test -- autoeqClient.test.ts
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "feat(web): run AutoEQ in cancellable worker"
```

---

### Task 8: Add Standard AutoEQ controls and atomic solution replacement in UI

**Files:**
- Create: `apps/web/src/features/autoeq/AutoEqControls.tsx`
- Create: `apps/web/src/features/autoeq/AutoEqStatus.tsx`
- Create: `apps/web/src/features/autoeq/AutoEqControls.test.tsx`
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx`

**Interfaces:**
- UI exposes only Standard profile and `maxFilters` in MVP.
- Successful run sets quantized filters with provenance `autoeq` and state `clean`.

- [ ] **Step 1: Write controls tests**

Assert Run is disabled without both Source and Target, maxFilters accepts integer 0..64 and defaults to 10, Running shows Cancel, and success displays active filter count/preamp.

- [ ] **Step 2: Implement controls**

Visible controls:

- Profile: `Standard` read-only label/select with one option;
- Max Filters numeric input 0..64;
- `Run AutoEQ` primary button;
- `Cancel` only while running.

Keep algorithm penalty constants out of normal UI.

- [ ] **Step 3: Implement atomic store replacement**

On success, push previous authoritative filter state to undo history, then replace filters in one action. Preserve `result.manifest` as run provenance. Manual edits after success mark `modified` but do not overwrite the original manifest.

- [ ] **Step 4: Add UI integration test**

Use a mocked worker result with two quantized filters. Click Run, resolve result, verify two table rows appear, status is clean, metrics summary uses result values, then edit Gain and verify status becomes Modified.

- [ ] **Step 5: Full verification and direct browser check**

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Open the app and run a synthetic Source->Target case. Confirm the UI remains interactive during worker execution and cancellation preserves prior filters.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: expose Standard AutoEQ workflow"
```

---

## Plan 2 Completion Gate

Before Plan 3:

- same synthetic input produces identical final filters on repeated runs;
- easy one-filter synthetic case reaches MAE < 0.25 dB with <=5 allowed filters;
- final result contains only quantized policy-grid values;
- additional filters stop when objective improvement is below threshold rather than filling maxFilters;
- nearby strong opposing filters appear in cancellation audit and are penalized/pruned;
- final metrics and preamp are recomputed from the final quantized filter list;
- worker cancellation and failure preserve the prior valid solution;
- web UI shows Standard, maxFilters, Run/Cancel, clean/modified state;
- `pnpm test`, `pnpm typecheck`, `pnpm build`, and `git diff --check` all pass.
