# Standard AutoEQ v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved deterministic Standard AutoEQ v1 engine, execute it in a disposable Web Worker, and integrate successful results atomically into the existing post-remake workspace.

**Architecture:** `packages/core` owns all AutoEQ numerics and reproducible result contracts. The web layer captures immutable run inputs, executes one disposable Worker per run, rejects obsolete results, and applies a successful `AutoEqResult` through one undoable workspace action. Existing Equalizer settings, graph semantics, Tools audio, Compare A/B, and workspace provenance remain consumers of canonical filters rather than parallel AutoEQ-specific state.

**Tech Stack:** TypeScript 6, React 19, Zustand 5, Vite Web Workers, Vitest/jsdom, existing `@autoeq-workbench/core` curve/DSP/metrics APIs.

**Spec:** `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`

## Global Constraints

- Synchronize `remake/squiglink-base` first and confirm the worktree is clean before changing code.
- The spec above is the behavioral authority. This plan is the execution map.
- Preserve the approved Remake 04 behavior and source-first graph/layout contracts.
- Standard v1 only: no Same-Rig Literal, Cross-Rig Conservative, Consensus 711, rig/confidence weighting, alternate profiles, benchmark tuning, WASM, backend, or cloud processing.
- `packages/core` is the sole authority for optimization formulas and final diagnostics.
- Product limits remain `AUTOEQ_PRODUCT_LIMITS` + `MVP_NUMERIC_POLICY`: 48 kHz, 20–20,000 Hz, 96 ppo, gain -15..+15 dB, PK Q 0.1..12, default `maxFilters=10`, hard maximum 64, shelf Q 0.7.
- `AutoEqSettings` may only narrow the effective run envelope. Invalid settings are rejected, never silently clamped or widened into validity.
- Every run starts from zero generated filters. Current manual/editor filters are not optimizer seeds.
- `maxFilters` is a ceiling, never a fill target. `maxFilters=0` is valid.
- Same numerical inputs + same settings + `standard-v1` must produce deeply identical delivered filters, IDs, metrics, audit, preamp, and manifest.
- Final metrics, cancellation audit, and preamp describe the exact delivered quantized/discretely-refined filter list.
- Failure, cancel, late messages, and obsolete results never mutate the prior valid workspace solution.
- The existing Equalizer FR/Target selectors and `AutoEqConstraints` remain the only user-facing Standard configuration surface.
- The graph continues to render only imported FRs, imported Targets, and the active `<FR> EQ` semantic curve. Do not reintroduce Desired, PEQ transfer, isolated filter curves, or selected-filter markers.
- `vendor/**` remains immutable and non-runtime.
- Use TDD for every task: failing test, confirm RED, minimal implementation, confirm GREEN, then commit.

---

## Locked File Structure

```text
packages/core/src/autoeq/
  types.ts
  config.ts
  loss.ts
  candidates.ts
  refine.ts
  optimize.ts
  cancellation.ts
  prune.ts
  quantize.ts
  discreteRefine.ts
  runStandardAutoEq.ts
packages/core/test/autoeq/
  config.test.ts
  loss.test.ts
  candidates.test.ts
  refine.test.ts
  cancellation.test.ts
  quantize.test.ts
  standard.test.ts
apps/web/src/workers/
  autoeq.worker.ts
  autoeqClient.ts
  autoeqClient.test.ts
apps/web/src/state/
  autoeqRunStore.ts
  autoeqRunStore.test.ts
  autoeqController.ts
  autoeqController.test.ts
```

Existing files modified later by this plan:

```text
packages/core/src/index.ts
apps/web/src/state/workspaceStore.ts
apps/web/src/state/workspaceStore.test.ts
apps/web/src/state/history.ts
apps/web/src/state/eqCompareStore.ts
apps/web/src/state/eqCompareStore.test.ts
apps/web/src/state/initializeEqCompareRecorder.ts
apps/web/src/state/initializeEqCompareRecorder.test.ts
apps/web/src/features/filters/EqualizerTab.tsx
apps/web/src/features/filters/EqualizerTab.test.tsx
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/index.css
```

---

### Task 1: Define Standard v1 contracts, resolver, and objective

**Files:**
- Create: `packages/core/src/autoeq/types.ts`
- Create: `packages/core/src/autoeq/config.ts`
- Create: `packages/core/src/autoeq/loss.ts`
- Test: `packages/core/test/autoeq/config.test.ts`
- Test: `packages/core/test/autoeq/loss.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `AutoEqSettings`, `AUTOEQ_PRODUCT_LIMITS`, `MVP_NUMERIC_POLICY`, `Curve`, `Normalization`, `Filter`, `ErrorMetrics`, `CoreError`.
- Produces:

```ts
export interface StandardAlgorithmParameters {
  deadbandDb: number
  huberDeltaDb: number
  candidateThresholdDb: number
  minObjectiveImprovement: number
  pruneTolerance: number
  filterCountWeight: number
  highQWeight: number
  gainWeight: number
  cancellationWeight: number
}

export interface AutoEqConfig {
  algorithmVersion: 'standard-v1'
  sampleRateHz: number
  fitPointsPerOctave: number
  shelfQ: 0.7
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minPkQ: number
  maxPkQ: number
  maxFilters: number
  algorithm: StandardAlgorithmParameters
}

export interface CancellationPair {
  filterAId: string
  filterBId: string
  score: number
  severity: 'moderate' | 'strong'
}

export interface CancellationAudit {
  pairs: CancellationPair[]
  totalScore: number
}

export interface RunManifest {
  schemaVersion: 1
  algorithmVersion: 'standard-v1'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettings
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardAlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
}

export interface AutoEqResult {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifest
}

export interface StandardAutoEqInput {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettings
}

export function resolveStandardAutoEqConfig(settings: AutoEqSettings): AutoEqConfig
```

`types.ts` owns `StandardAlgorithmParameters`; `config.ts` imports that type. Do not make `types.ts` depend on `STANDARD_V1_CONFIG`, which would create a config/types cycle.

- [ ] **Step 1: Write resolver RED tests** proving defaults resolve to 20–20k / ±15 / Q 0.1–12 / 10, a narrower valid envelope is preserved exactly, `maxFilters=0` and `64` are accepted, and any invalid envelope throws `CoreError` category `validation`.
- [ ] **Step 2: Run** `pnpm --filter @autoeq-workbench/core test -- test/autoeq/config.test.ts` and confirm RED because resolver/contracts do not exist.
- [ ] **Step 3: Implement `STANDARD_V1_CONFIG` exactly as approved:** deadband `0.1`, Huber delta `1`, candidate threshold `0.5`, minimum objective improvement `0.005`, prune tolerance `0.002`, filter-count weight `0.01`, high-Q weight `0.002`, gain weight `0.0005`, cancellation weight `0.01`. It contains algorithm/version data only; it must not duplicate sample rate or product hard bounds.
- [ ] **Step 4: Implement `resolveStandardAutoEqConfig()`** using `isValidAutoEqSettings()`. Reject invalid input rather than clamp/widen it and preserve a valid requested effective envelope exactly.
- [ ] **Step 5: Write objective RED tests** for mean deadbanded Huber behavior, zero fit inside ±0.1 dB, filter-count cost, high-Q cost above Q=2, gain cost above ±6 dB, and cancellation cost supplied by the audit.
- [ ] **Step 6: Implement `evaluateObjective()`** as `mean(deadbandedHuber) + structural penalties`. Reject empty/mismatched/non-finite residual input with a structured validation/numeric error rather than returning `NaN`.
- [ ] **Step 7: Run** the two new test files plus `pnpm --filter @autoeq-workbench/core typecheck` and confirm GREEN.
- [ ] **Step 8: Commit** `feat(core): define Standard AutoEQ contracts and objective`.

---

### Task 2: Generate deterministic PK/LS/HS candidates inside the effective envelope

**Files:**
- Create: `packages/core/src/autoeq/candidates.ts`
- Test: `packages/core/test/autoeq/candidates.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface ResidualRegion {
  startIndex: number
  endIndex: number
  startHz: number
  endHz: number
  sign: -1 | 1
  regionOctaves: number
}

export interface FilterCandidate extends Filter {
  regionOctaves: number
}

export function findResidualRegions(
  frequencies: readonly number[],
  residualDb: readonly number[],
  thresholdDb: number,
): ResidualRegion[]

export function generateCandidates(input: {
  frequencies: readonly number[]
  residualDb: readonly number[]
  config: AutoEqConfig
}): FilterCandidate[]
```

Candidate IDs are deterministic temporary optimizer identities. After sort/deduplication, assign `candidate-1`, `candidate-2`, ... in returned order. Accepted filters retain their deterministic temporary IDs during optimization/cancellation scoring; Task 5 replaces them with final `autoeq-1..N` IDs after delivery ordering.

- [ ] **Step 1: Write RED tests** for sub-threshold termination, sign-change splitting, geometric-center PK generation, effective gain/Q/Fc clamping, LS evidence, HS evidence, effective-range exclusion, stable ordering, 1/48-octave same-type deduplication, and deterministic temporary IDs.
- [ ] **Step 2: Confirm RED** with `pnpm --filter @autoeq-workbench/core test -- test/autoeq/candidates.test.ts`.
- [ ] **Step 3: Implement residual regions** with equal-length, ascending-frequency, and finiteness validation.
- [ ] **Step 4: Implement PK seeds** using geometric center and `Q = center / max(1e-9, end-start)`, clamped to `config.minPkQ..maxPkQ`; initial gain comes from log-frequency interpolation of residual at center and is clamped to effective gain.
- [ ] **Step 5: Implement shelves** only when at least 70% of eligible samples in the approved low/high region share sign and median absolute residual is at least threshold. Keep Q 0.7 and do not generate a nominal shelf whose Fc is outside the effective run range.
- [ ] **Step 6: Implement deterministic sort, dedupe, and temporary ID assignment** exactly from the spec.
- [ ] **Step 7: Confirm GREEN** and commit `feat(core): generate deterministic AutoEQ candidates`.

---

### Task 3: Add whole-cascade refinement and greedy optimization

**Files:**
- Create: `packages/core/src/autoeq/refine.ts`
- Create: `packages/core/src/autoeq/optimize.ts`
- Test: `packages/core/test/autoeq/refine.test.ts`

**Interfaces:**

```ts
export function refineFilters(input: {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}): Filter[]

export interface OptimizationState {
  filters: Filter[]
  objective: number
  acceptedObjectives: number[]
}

export function optimizeGreedy(input: {
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}): OptimizationState
```

- [ ] **Step 1: Write a RED synthetic one-PK refinement test** starting near a known 1 kHz / +6 dB / Q2 response and assert final cascade MAE is lower than initial MAE.
- [ ] **Step 2: Write RED envelope tests** proving no refined Fc/gain/PK-Q escapes the effective config and shelves remain Q 0.7.
- [ ] **Step 3: Implement the three approved coordinate passes:** `1/6 octave, 1 dB, 1/2 Q-octave`; `1/24, 0.25 dB, 1/8 Q-octave`; `1/96, 0.1 dB, 1/32 Q-octave`. Evaluate the complete cascade for every tested coordinate.
- [ ] **Step 4: Implement deterministic exact-tie resolution:** lower absolute gain, then lower Q, then lower Fc, then stable list order.
- [ ] **Step 5: Write greedy RED tests** proving a broad material correction adds at least one but fewer than the ceiling, `maxFilters=0` returns `[]`, accepted objective values are monotonic non-increasing, and improvement below `0.005` stops addition.
- [ ] **Step 6: Implement `optimizeGreedy()`** from zero filters. Recompute residual from the entire accepted cascade after every accepted addition. Never mutate input arrays or seed from current workspace filters.
- [ ] **Step 7: Confirm GREEN**, run core typecheck, commit `feat(core): optimize Standard AutoEQ cascade`.

---

### Task 4: Add cancellation audit and iterative pruning

**Files:**
- Create: `packages/core/src/autoeq/cancellation.ts`
- Create: `packages/core/src/autoeq/prune.ts`
- Test: `packages/core/test/autoeq/cancellation.test.ts`
- Modify: `packages/core/src/autoeq/loss.ts`

**Interfaces:**

```ts
export function auditCancellations(
  filters: readonly Filter[],
  frequencies: readonly number[],
  sampleRateHz: number,
): CancellationAudit

export function pruneFilters(input: {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}): Filter[]
```

- [ ] **Step 1: Write RED audit tests** for nearby opposite-sign PKs scoring higher than far-apart pairs, >1 octave pairs omitted, `moderate >= 0.35`, `strong >= 0.65`, stable pair IDs/order, and zero score for no qualifying pair.
- [ ] **Step 2: Implement pair score** as cosine similarity of absolute individual responses × `(1 - octaveDistance)` × `min(abs(gainA), abs(gainB))/15`, only for opposite non-zero gains within one octave.
- [ ] **Step 3: Wire `audit.totalScore` into the objective**. Do not maintain a second cancellation approximation.
- [ ] **Step 4: Write RED pruning tests** for <0.05 dB removal, objective-neutral/removal-tolerant filters removed, a required +6 dB synthetic PK retained, restart-from-zero after each removal, and final refine pass.
- [ ] **Step 5: Implement iterative pruning** exactly from the approved spec.
- [ ] **Step 6: Confirm GREEN**, run full core suite, commit `feat(core): audit and prune AutoEQ filters`.

---

### Task 5: Quantize, discretely refine, finalize IDs, and assemble the Standard pipeline

**Files:**
- Create: `packages/core/src/autoeq/quantize.ts`
- Create: `packages/core/src/autoeq/discreteRefine.ts`
- Create: `packages/core/src/autoeq/runStandardAutoEq.ts`
- Test: `packages/core/test/autoeq/quantize.test.ts`
- Test: `packages/core/test/autoeq/standard.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export const POWERAMP_MANUAL_ENTRY_POLICY = {
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1,
} as const

export function quantizeFilters(
  filters: readonly Filter[],
  config: AutoEqConfig,
): Filter[]

export function discreteRefine(input: {
  filters: readonly Filter[]
  desiredDb: readonly number[]
  frequencies: readonly number[]
  config: AutoEqConfig
}): Filter[]

export function runStandardAutoEq(input: StandardAutoEqInput): AutoEqResult
```

`calculatePreampDb()` remains the preamp authority. Its existing dense 20–20k grid and safety rounding already return a 0.1 dB manual-entry-safe preamp. Do not independently re-round preamp with a competing formula; `preampStepDb` documents the delivery precision shared with that existing behavior.

- [ ] **Step 1: Write quantization RED tests** for clamp-before-round, 1 Hz / 0.1 dB / 0.01 Q grid, shelf Q 0.7, decimal normalization, and `-0 -> 0`.
- [ ] **Step 2: Implement quantization** with decimal-safe nearest-step rounding while respecting the effective run config.
- [ ] **Step 3: Write discrete-refinement RED tests** proving two passes of current/±1-step search never worsen the raw quantized objective and never leave the policy grid or effective bounds.
- [ ] **Step 4: Implement discrete refinement** with the same deterministic tie-breakers used by continuous refinement.
- [ ] **Step 5: Write pipeline RED tests** covering source/target preparation on 96 ppo; fit subset inside effective frequency range; one known inverse-PK case reaching MAE <0.25 dB with `maxFilters<=5`; two identical runs deep-equal; final zero-gain filters removed; final list frequency-sorted; IDs exactly `autoeq-1..N`; final audit derived after quantization/cleanup and after final IDs are assigned; final metrics derived from delivered filters over the effective fit interval; preamp derived from delivered filters through `calculatePreampDb()` on the full supported band; manifest contains no timestamp, UUID, or browser runId.
- [ ] **Step 6: Implement exact pipeline order:** validate → prepare canonical grid → select fit subset → desired correction → greedy optimize → prune/final continuous refine → quantize → discrete refine → remove delivered 0 dB filters → deterministic final sort → assign `autoeq-1..N` → exact final cascade → final metrics → full-band preamp → final cancellation audit → manifest.
- [ ] **Step 7: Assert in tests that `result.filters`, `manifest.finalFilters`, metrics, preamp, and audit all describe that same final list.**
- [ ] **Step 8: Run** `pnpm --filter @autoeq-workbench/core test` and `pnpm --filter @autoeq-workbench/core typecheck`; commit `feat(core): complete Standard AutoEQ v1 pipeline`.

---

### Task 6: Make the AutoEQ run record part of canonical workspace history and Compare A/B

**Files:**
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/workspaceStore.test.ts`
- Modify: `apps/web/src/state/history.ts`
- Modify: `apps/web/src/state/eqCompareStore.ts`
- Modify: `apps/web/src/state/eqCompareStore.test.ts`
- Modify: `apps/web/src/state/initializeEqCompareRecorder.ts`
- Modify: `apps/web/src/state/initializeEqCompareRecorder.test.ts`

**Interfaces:**

```ts
export interface AutoEqRunRecord {
  manifest: RunManifest
}

// WorkspaceState
autoEqRun: AutoEqRunRecord | null
applyAutoEqResult: (result: AutoEqResult) => void
```

Extend `FilterSnapshotState`, `WorkspaceHistorySnapshot`, `EqSnapshot`, and `EqSnapshotCapture` with `autoEqRun: AutoEqRunRecord | null`.

Implement one helper that deep-copies the JSON-safe manifest/filter arrays when recording/restoring. Compare canonical equality must include the run record; because the manifest is deterministic JSON-safe data, a stable deep comparison is acceptable. Do not compare transient Worker state.

- [ ] **Step 1: Write workspace RED tests** proving `applyAutoEqResult()` is one undo point, sets delivered filters, clears selection, sets provenance `autoeq`, state `clean`, and stores an isolated deep copy of the manifest.
- [ ] **Step 2: Write history RED tests** proving Undo/Redo restores the associated run record together with filters/provenance/state.
- [ ] **Step 3: Write lifecycle RED tests** proving manual edit after AutoEQ keeps the run record and marks `modified`; active FR/Target, normalization, or settings change keeps the record and marks `stale`; importing a new independent manual filter set clears the record.
- [ ] **Step 4: Implement `autoEqRun` + `applyAutoEqResult()`**. This action is the production route that creates a clean AutoEQ solution. Validate and deep-copy the result before recording history.
- [ ] **Step 5: Extend history snapshots** to deep-copy and restore the run record.
- [ ] **Step 6: Write Compare RED tests** proving A/B snapshots retain and restore the matching run record, canonical equality includes that record, and applying A/B never associates one manifest with another filter solution.
- [ ] **Step 7: Extend Compare capture/recorder** with `autoEqRun`; keep the Remake 04 snapshot cap, debounce, coalescing, and assigned-snapshot freeze behavior unchanged.
- [ ] **Step 8: Run** state-focused tests plus `pnpm --filter @autoeq-workbench/web typecheck`; commit `feat(web): track AutoEQ run provenance in workspace history`.

---

### Task 7: Add disposable Worker execution, transient run state, cancellation, and obsolete-result rejection

**Files:**
- Create: `apps/web/src/workers/autoeq.worker.ts`
- Create: `apps/web/src/workers/autoeqClient.ts`
- Test: `apps/web/src/workers/autoeqClient.test.ts`
- Create: `apps/web/src/state/autoeqRunStore.ts`
- Test: `apps/web/src/state/autoeqRunStore.test.ts`
- Create: `apps/web/src/state/autoeqController.ts`
- Test: `apps/web/src/state/autoeqController.test.ts`

**Interfaces:**

```ts
export type AutoEqRunStatus = 'idle' | 'running' | 'error'

export interface AutoEqPublicError {
  category: 'validation' | 'optimization' | 'numeric'
  message: string
}

export interface AutoEqRunUiState {
  status: AutoEqRunStatus
  activeRunId: string | null
  error: AutoEqPublicError | null
}

export function runAutoEq(): Promise<void>
export function cancelAutoEq(): void
```

Worker messages carry `{ type, runId, ...payload }`. `runId` is browser-only and never enters core manifest data.

- [ ] **Step 1: Write client RED tests** with a fake Worker adapter for success result, structured error, terminate-on-cancel, fresh Worker on the next run, and late-message/runId rejection.
- [ ] **Step 2: Implement `autoeq.worker.ts`** importing only public core APIs and serializing `CoreError` as category + message. Unexpected exceptions become a safe `optimization` or `numeric` public error message without exposing a stack trace to product UI.
- [ ] **Step 3: Implement `autoeqClient.ts`** as one disposable Worker per run; no persistent pool and no progress percentage.
- [ ] **Step 4: Write transient-store RED tests** for `idle -> running -> idle`, `idle -> running -> error`, dismiss/reset, and cancellation returning to idle without an error banner.
- [ ] **Step 5: Implement `autoeqRunStore`** separate from undoable workspace state.
- [ ] **Step 6: Write controller RED tests** proving it captures immutable active FR/Target/normalization/settings, rejects a workspace that is not ready, applies only a valid current result, and never mutates filters on cancel/error.
- [ ] **Step 7: Define and test a pure run-input signature** from active FR ID + active Target ID + their numerical raw point data + normalization + `AutoEqSettings`. Display names are provenance only and do not affect numerical obsolescence. Removing/replacing selected numerical input changes the signature.
- [ ] **Step 8: Add obsolete-result RED tests** where FR/Target selection, selected curve numerical data, normalization, or settings change before resolution; confirm the result is discarded and the prior solution survives. Also prove an unrelated tab/theme/UI change does not obsolete the result.
- [ ] **Step 9: Implement controller orchestration**: preflight current workspace, capture input/signature, start client, compare the current signature before commit, call `applyAutoEqResult()` only on match, and clear active transient run state on every terminal path.
- [ ] **Step 10: Run** worker/controller tests plus web typecheck; commit `feat(web): run AutoEQ safely in a disposable worker`.

---

### Task 8: Wire the existing Equalizer UI without creating a second AutoEQ surface

**Files:**
- Modify: `apps/web/src/features/filters/EqualizerTab.tsx`
- Modify: `apps/web/src/features/filters/EqualizerTab.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Pass the already-computed `WorkspaceDerived` from `App` to `EqualizerTab` for readiness. Do not create a second `deriveWorkspace()` path inside the controls.
- Existing `AutoEqConstraints` remains the only constraints UI.

- [ ] **Step 1: Write UI RED tests** proving AutoEQ is disabled without valid ready active FR+Target coverage, enabled when ready and idle, and no duplicate Standard settings surface appears.
- [ ] **Step 2: Write running-state RED tests** proving the main action becomes `Cancel`, there is no percentage/progress meter, and clicking it invokes `cancelAutoEq()`.
- [ ] **Step 3: Write error-state RED tests** proving a structured public error is shown compactly with accessible alert semantics while the prior filter rows stay present.
- [ ] **Step 4: Write success integration RED tests** with a mocked controller result proving the canonical filter table updates, solution becomes clean AutoEQ, and graph/Tools consumers update through existing canonical state rather than result-specific side channels.
- [ ] **Step 5: Implement UI wiring** in the existing source-shaped AutoEQ button row. Keep Constraints, Filter I/O, FR selector, and Target selector in their current composition.
- [ ] **Step 6: Pass `derived` from `App` to `EqualizerTab`** and update `App.test.tsx` fixtures accordingly. No AutoEQ DSP belongs in React.
- [ ] **Step 7: Add only the compact running/error CSS needed in `apps/web/src/index.css`**, reusing current CSS variables/density and preserving Light/Dark behavior.
- [ ] **Step 8: Run** Equalizer, App, graph, and Tools tests plus web typecheck/build; commit `feat(web): expose Standard AutoEQ workflow`.

---

### Task 9: Full regression, browser smoke, CI, and Pages closeout

**Files:**
- Modify only files required to fix defects actually observed during this gate.
- Do not tune `STANDARD_V1_CONFIG` constants during closeout.

- [ ] **Step 1: Run exact repository verification:**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/web build:pages
git diff --check
```

- [ ] **Step 2: Audit architecture boundaries:** no React/Zustand/Worker imports in `packages/core`; no optimizer formulas duplicated in web; no runtime imports from `vendor/**`; no Same-Rig/Cross-Rig/Consensus/weighting implementation in Standard v1.
- [ ] **Step 3: Run deterministic core smoke twice** on the same synthetic known-PK case and record deep equality, MAE <0.25 dB, and at most 5 filters.
- [ ] **Step 4: Run settings edge smoke:** defaults, narrower valid envelope, invalid envelope rejection, `maxFilters=0`, and `maxFilters=64` without fill-target behavior.
- [ ] **Step 5: Run workspace smoke:** existing manual filters → Run → clean AutoEQ → manual edit → modified → Undo → clean AutoEQ → normalization/settings/input change → stale → Undo/Redo restores the matching run record.
- [ ] **Step 6: Run Compare A/B smoke:** capture two solutions, assign A/B, switch A→B→A, and verify filters + provenance + state + AutoEQ run record remain paired and deterministic.
- [ ] **Step 7: Run Tools audio smoke in a real browser:** after AutoEQ success, Tone and local Music with `EQ Effect` use the new canonical filter cascade without a second AutoEQ/audio EQ path.
- [ ] **Step 8: Run graph smoke:** only imported FRs, Targets, and `<FR> EQ`; no Desired/PEQ/filter-marker regression.
- [ ] **Step 9: Run UI smoke in Light/Dark at 390×844 and 1280×800:** Run, Cancel, Constraints, result rows, modified/stale behavior, compact error state, no document horizontal overflow.
- [ ] **Step 10: Push coherent commits and wait for CI.** Record the final implementation SHA and confirm CI is green on that exact SHA.
- [ ] **Step 11: Confirm Pages checks out and builds that exact implementation SHA** before deployment. Keep the known `workflow_run` administrative `pages_build_version` nuance distinct from the actual checked-out content SHA.
- [ ] **Step 12: Public Pages smoke** repeats Run/Cancel/success/edit/Undo/A-B and Light/Dark. Do not close Plan 2 based only on unit tests.
- [ ] **Step 13: STOP.** Report SHA, commits/tasks, test/typecheck/build/lint results, deterministic synthetic result, CI, Pages checkout SHA, browser smoke, and any acceptance gap. Do not begin benchmark tuning or specialized profiles automatically.

---

## Plan 2 Completion Gate

Standard AutoEQ v1 is complete only when all of the following are true:

- the known one-PK synthetic case reaches MAE <0.25 dB with at most 5 allowed filters;
- identical input/settings produce a deeply identical delivered result and manifest;
- final values lie on the delivery quantization grid and inside the effective run envelope;
- `maxFilters` remains a ceiling and low-value additions stop below it;
- final cancellation audit, metrics, and full-band preamp are recomputed from the delivered filter list;
- final filters have deterministic `autoeq-1..N` IDs and deterministic ordering;
- success is exactly one undoable workspace replacement with `filterProvenance='autoeq'`, `solutionState='clean'`, and the matching run record;
- manual edits preserve run provenance and mark `modified`;
- active input/normalization/settings changes preserve provenance and mark `stale`;
- Undo/Redo and Compare A/B restore the matching run record with the filter solution;
- cancel, error, late messages, and obsolete results preserve the previous valid solution;
- the existing Equalizer is the only AutoEQ control/config surface;
- graph and Tools remain consumers of canonical filters with no parallel AutoEQ result path;
- repository verification, CI, Pages build from exact implementation SHA, and public browser smoke all pass;
- no benchmark tuning or specialized profile work has been started.