# Standard AutoEQ v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Efficient Workflow v2 overrides generic fan-out defaults: use one agent unless a closed independent task has clear net value; never nest subagents and never exceed two concurrent. Track execution with the checkboxes below.

**Goal:** Make Standard AutoEQ v2 the product-default optimizer while preserving frozen v1, delivered `RMSE <= 0.25 dB` and `maxAbs <= 0.75 dB`, precision-first compression, hard delivered `Max Filters`, and selectable `5/15/30/60/120 s` runtime.

**Architecture:** Keep `runStandardAutoEq()` as frozen v1. Add an isolated `packages/core/src/autoeq/v2/` pipeline for ranking/runtime/cache, multi-scale candidates, bounded hybrid search, joint refinement, quantized deliverables/compression, and `runStandardAutoEqV2()`. Browser orchestration stays disposable-Worker + runId + input-signature guard + atomic apply; only the engine entry point and versioned data contracts change.

**Tech Stack:** TypeScript 6, Vitest, React 19, Zustand, Web Worker, Playwright, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`

## Global Constraints

- `standard-v1` numerical output and `packages/core/benchmarks/baseline-standard-v1.json` are frozen.
- `packages/core` remains the sole numerical authority.
- Final target is simultaneous `RMSE <= 0.25 dB` and `maxAbs <= 0.75 dB` on the exact quantized delivered cascade.
- No treble de-weighting; effective fit-grid samples are uniform.
- PK/LS/HS only; 20–20,000 Hz; gain -15..+15 dB; PK Q 0.1..12; shelf Q 0.7; hard delivered Max Filters 64.
- Time Limit is exactly `5 | 15 | 30 | 60 | 120`, default 60; timeout is normal result; Cancel applies no partial result.
- Non-timeout v2 runs are exactly deterministic. Timeout is best-effort deterministic across machines and exact under the injected fake clock.
- V1 manifest remains schema 2 with historical settings; v2 manifest is schema 3. Session v2 is schema 2; session migration adds `timeLimitSeconds: 60` only when absent and never overwrites a persisted approved value.
- Use synthetic/sanitized fixtures only. Never commit private FR/Target data.
- Efficient Workflow v2: minimal directed reads, focused tests during tasks, one global gate pass after the diff stabilizes, no routine narration, no repeated benchmark/global runs without a concrete reason.
- Preserve unrelated WIP; never reset, clean, stash, or overwrite it for convenience.

## Planned File Boundary

```text
packages/core/src/autoeq/v2/
  config.ts
  ranking.ts
  runtime.ts
  responseCache.ts
  candidates.ts
  jointRefine.ts
  search.ts
  discreteRefine.ts
  deliverable.ts
  runStandardAutoEqV2.ts

packages/core/test/autoeq/v2/
  config.test.ts
  ranking.test.ts
  runtime.test.ts
  responseCache.test.ts
  candidates.test.ts
  jointRefine.test.ts
  search.test.ts
  discreteRefine.test.ts
  deliverable.test.ts
  runStandardAutoEqV2.test.ts
  benchmarkCases.test.ts
```

Suggested coherent sessions: A Tasks 1–2; B Task 3; C Task 4; D Task 5; E Tasks 6–7; F Task 8. Handoffs, if needed, reference this plan/spec and use the repo 10–15 line format rather than copying them.

---

### Task 1: Version settings, inputs, results, and manifests while freezing v1

**Files:**
- Modify: `packages/core/src/config/autoeqSettings.ts`
- Modify: `packages/core/src/autoeq/types.ts`
- Modify: `packages/core/src/autoeq/config.ts`
- Modify: `packages/core/src/autoeq/runStandardAutoEq.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/benchmarks/cases.ts`
- Test: `packages/core/test/config/autoeqSettings.test.ts`
- Test: `packages/core/test/autoeq/config.test.ts`
- Test: `packages/core/test/autoeq/runStandardAutoEq.test.ts`

**Produces:** `AutoEqSettingsV1`, current `AutoEqSettings`, `AutoEqTimeLimitSeconds`, `AUTOEQ_TIME_LIMIT_OPTIONS`, `DEFAULT_AUTOEQ_SETTINGS_V1`, `DEFAULT_AUTOEQ_SETTINGS`, `isValidAutoEqSettingsV1()`, current `isValidAutoEqSettings()`, versioned input/result/manifest types.

- [ ] **Step 1: Write failing settings tests**

Pin this contract:

```ts
expect(AUTOEQ_TIME_LIMIT_OPTIONS).toEqual([5, 15, 30, 60, 120])
expect(DEFAULT_AUTOEQ_SETTINGS.timeLimitSeconds).toBe(60)
expect(DEFAULT_AUTOEQ_SETTINGS_V1).toEqual({
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  minGainDb: -15,
  maxGainDb: 15,
  minQ: 0.1,
  maxQ: 12,
  maxFilters: 10,
})
for (const value of [5, 15, 30, 60, 120] as const) {
  expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: value })).toBe(true)
}
for (const value of [0, 10, 29, 31, 121, Number.NaN]) {
  expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds: value } as AutoEqSettings)).toBe(false)
}
expect(isValidAutoEqSettingsV1(DEFAULT_AUTOEQ_SETTINGS_V1)).toBe(true)
```

Run and expect failure before implementation:

```bash
pnpm --filter @autoeq-workbench/core test -- test/config/autoeqSettings.test.ts
```

- [ ] **Step 2: Implement historical/current settings split**

```ts
export const AUTOEQ_TIME_LIMIT_OPTIONS = [5, 15, 30, 60, 120] as const
export type AutoEqTimeLimitSeconds = (typeof AUTOEQ_TIME_LIMIT_OPTIONS)[number]

export interface AutoEqSettingsV1 {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  maxFilters: number
}

export interface AutoEqSettings extends AutoEqSettingsV1 {
  timeLimitSeconds: AutoEqTimeLimitSeconds
}
```

`DEFAULT_AUTOEQ_SETTINGS_V1` is the current 7-field default. `DEFAULT_AUTOEQ_SETTINGS = { ...DEFAULT_AUTOEQ_SETTINGS_V1, timeLimitSeconds: 60 }`. Move the existing numeric/bounds checks unchanged into `isValidAutoEqSettingsV1()`; current `isValidAutoEqSettings()` additionally requires membership in the five-option tuple. Never clamp timeout values.

- [ ] **Step 3: Write failing v1 manifest-compatibility tests**

Use `DEFAULT_AUTOEQ_SETTINGS_V1` in v1 inputs and pin:

```ts
expect(result.manifest.schemaVersion).toBe(2)
expect(result.manifest.algorithmVersion).toBe('standard-v1')
expect('timeLimitSeconds' in result.manifest.autoeqSettings).toBe(false)
```

- [ ] **Step 4: Version types explicitly**

Use these public boundaries:

```ts
export interface StandardAutoEqInputV1 {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettingsV1
}

export interface StandardAutoEqInputV2 {
  source: Curve
  target: Curve
  normalization: Normalization
  settings: AutoEqSettings
}

export interface StandardV2AlgorithmParameters {
  targetRmseDb: 0.25
  targetMaxAbsDb: 0.75
  candidateResidualFloorDb: 0.15
  pkQScaleMultipliers: readonly [0.5, 1, 2]
  maxExactCandidatesPerIteration: 8
  maxActiveSearchPaths: 3
  alternateRetentionRatio: 1.02
  maxJointRefinementCycles: 6
}

export type StandardV2TerminationReason = 'target-reached' | 'converged' | 'time-limit'

export interface RunManifestV1 {
  schemaVersion: 2
  algorithmVersion: 'standard-v1'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettingsV1
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardAlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
}

export interface RunManifestV2 {
  schemaVersion: 3
  algorithmVersion: 'standard-v2'
  profile: 'Standard'
  sampleRateHz: number
  fitPointsPerOctave: number
  autoeqSettings: AutoEqSettings
  normalization: Normalization
  sourceName: string
  targetName: string
  algorithmParameters: StandardV2AlgorithmParameters
  finalFilters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  terminationReason: StandardV2TerminationReason
  targetAchieved: boolean
}

export interface AutoEqResultV1 {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifestV1
}
export interface AutoEqResultV2 {
  filters: Filter[]
  metrics: ErrorMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifestV2
}
export type RunManifest = RunManifestV1 | RunManifestV2
export type AutoEqResult = AutoEqResultV1 | AutoEqResultV2
```

Keep `StandardAutoEqInput` as a compatibility alias to `StandardAutoEqInputV1` if existing imports still need it; new browser code uses `StandardAutoEqInputV2` explicitly.

- [ ] **Step 5: Keep v1 runner/config/benchmark on v1 settings**

`resolveStandardAutoEqConfig()` validates with `isValidAutoEqSettingsV1()`. `runStandardAutoEq()` returns `AutoEqResultV1` and serializes only the historical 7 settings fields. `packages/core/benchmarks/cases.ts` uses `DEFAULT_AUTOEQ_SETTINGS_V1`, `AutoEqSettingsV1`, `StandardAutoEqInputV1`.

- [ ] **Step 6: Verify and commit Task 1**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/config/autoeqSettings.test.ts \
  test/autoeq/config.test.ts \
  test/autoeq/runStandardAutoEq.test.ts
pnpm --filter @autoeq-workbench/core benchmark
```

Expected: tests PASS; frozen v1 benchmark has zero deterministic drift.

```bash
git add packages/core/src/config/autoeqSettings.ts packages/core/src/autoeq/types.ts \
  packages/core/src/autoeq/config.ts packages/core/src/autoeq/runStandardAutoEq.ts \
  packages/core/src/index.ts packages/core/benchmarks/cases.ts \
  packages/core/test/config/autoeqSettings.test.ts packages/core/test/autoeq/config.test.ts \
  packages/core/test/autoeq/runStandardAutoEq.test.ts
git commit -m "feat(core): version AutoEQ settings and manifests"
```

---

### Task 2: Add v2 config, ranking, deadline, and response-cache primitives

**Files:**
- Create: `packages/core/src/autoeq/v2/config.ts`
- Create: `packages/core/src/autoeq/v2/ranking.ts`
- Create: `packages/core/src/autoeq/v2/runtime.ts`
- Create: `packages/core/src/autoeq/v2/responseCache.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/autoeq/v2/config.test.ts`
- Test: `packages/core/test/autoeq/v2/ranking.test.ts`
- Test: `packages/core/test/autoeq/v2/runtime.test.ts`
- Test: `packages/core/test/autoeq/v2/responseCache.test.ts`

**Produces:** `STANDARD_V2_CONFIG`, `resolveStandardAutoEqV2Config()`, `calculateWorkingMaxFilters()`, `isV2TargetAchieved()`, `compareV2Solutions()`, `StandardV2Runtime`, `createStandardV2Deadline()`, and pure response-cache operations.

- [ ] **Step 1: Write failing exact-constant/working-cap/ranking tests**

Pin:

```ts
expect(STANDARD_V2_CONFIG.algorithm).toEqual({
  targetRmseDb: 0.25,
  targetMaxAbsDb: 0.75,
  candidateResidualFloorDb: 0.15,
  pkQScaleMultipliers: [0.5, 1, 2],
  maxExactCandidatesPerIteration: 8,
  maxActiveSearchPaths: 3,
  alternateRetentionRatio: 1.02,
  maxJointRefinementCycles: 6,
})
expect(calculateWorkingMaxFilters(0)).toBe(0)
expect(calculateWorkingMaxFilters(5)).toBe(9)
expect(calculateWorkingMaxFilters(10)).toBe(15)
expect(calculateWorkingMaxFilters(20)).toBe(30)
expect(calculateWorkingMaxFilters(64)).toBe(64)
expect(isV2TargetAchieved(metrics(0.25, 0.75))).toBe(true)
expect(isV2TargetAchieved(metrics(0.10, 0.76))).toBe(false)
expect(compareV2Solutions(solution(0.24, 0.70), solution(0.10, 1.20))).toBeLessThan(0)
```

The deterministic tie tuple is exactly: normalized violation → RMSE → maxAbs → cancellation totalScore → max Q → max abs gain → sum abs gain → filter count → per-filter `[frequencyHz, typeOrder(LS=0,PK=1,HS=2), gainDb, q]` in current stable list order.

- [ ] **Step 2: Write failing fake-clock tests**

```ts
let now = 1_000
const deadline = createStandardV2Deadline({ nowMs: () => now }, 5)
expect(deadline.isExpired()).toBe(false)
now = 5_999
expect(deadline.isExpired()).toBe(false)
now = 6_000
expect(deadline.isExpired()).toBe(true)
```

The deadline captures start once. Core v2 may not call wall-clock APIs anywhere except the production default runtime supplied by the runner.

- [ ] **Step 3: Write failing response-cache equivalence tests**

For a 2–3 filter cascade, compare every cached sample to `cascadeMagnitudeDb()` before/after a one-filter replacement:

```ts
for (let i = 0; i < expected.length; i += 1) {
  expect(cache.cascadeDb[i]).toBeCloseTo(expected[i]!, 12)
}
```

- [ ] **Step 4: Implement the primitives**

`calculateWorkingMaxFilters()` is exactly:

```ts
return maxFilters === 0
  ? 0
  : Math.min(64, maxFilters + Math.max(4, Math.ceil(maxFilters / 2)))
```

Normalized violation is `Math.max(rmseDb / 0.25, maxAbsDb / 0.75)`. Response cache stores each filter's dB response plus their sum; replacing filter `i` computes `cascade - oldResponse[i] + newResponse`.

- [ ] **Step 5: Verify and commit Task 2**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/config.test.ts \
  test/autoeq/v2/ranking.test.ts test/autoeq/v2/runtime.test.ts \
  test/autoeq/v2/responseCache.test.ts
git add packages/core/src/autoeq/v2 packages/core/src/index.ts packages/core/test/autoeq/v2
git commit -m "feat(core): add Standard v2 optimization primitives"
```

---

### Task 3: Add multi-scale candidates, joint refinement, and bounded hybrid search

**Files:**
- Create: `packages/core/src/autoeq/v2/candidates.ts`
- Create: `packages/core/src/autoeq/v2/jointRefine.ts`
- Create: `packages/core/src/autoeq/v2/search.ts`
- Test: `packages/core/test/autoeq/v2/candidates.test.ts`
- Test: `packages/core/test/autoeq/v2/jointRefine.test.ts`
- Test: `packages/core/test/autoeq/v2/search.test.ts`

**Produces:**

```ts
export interface V2FilterCandidate {
  type: Filter['type']
  frequencyHz: number
  gainDb: number
  q: number
  featureIndex: number
  qScale: 0.5 | 1 | 2 | null
  cheapScore: number
}

export function generateV2Candidates(input: CandidateInput): V2FilterCandidate[]
export function rankV2CandidateShortlist(candidates: readonly V2FilterCandidate[]): V2FilterCandidate[]
export function jointRefineV2(input: JointRefineInput): JointRefineResult
export function searchStandardV2WorkingSolutions(input: SearchInput): SearchResult
```

- [ ] **Step 1: Write failing candidate tests**

Use synthetic residuals to assert: extrema below `0.15 dB` generate nothing; PK center is the canonical extremum sample; Q scales are `[0.5,1,2]` before clamping/dedup; shelves use Q `0.7`; excluded fit frequencies cannot justify shelves; shortlist length never exceeds 8.

Canonical candidate dedup key is exact, not a new tuning threshold:

```text
(type, featureIndex, normalized frequencyHz, normalized gainDb, normalized q)
```

Equal cheap scores order by frequency → type LS/PK/HS → gain → Q.

- [ ] **Step 2: Implement deterministic candidate geometry and cheap score**

```text
PK center        = local signed residual extremum sample
width boundary   = nearest sign crossing; if missing on one side, use that side's half-height crossing
base Q           = centerHz / max(epsilon, highBoundaryHz - lowBoundaryHz)
Q variants       = clamp(baseQ * [0.5,1,2], effective Q envelope)
PK gain          = residual at center, clamped to gain envelope
shelf gain       = median signed residual across broad edge evidence
shelf transition = canonical half-height transition sample nearest the interior edge
cheapScore       = decrease in squared residual energy from isolated candidate response
```

Cheap score only chooses the exact shortlist; final ranking always uses the complete-cascade solution tuple.

- [ ] **Step 3: Write failing joint-refinement/deadline tests**

Use scales exactly:

```ts
[
  { fcOctaveStep: 1 / 6,  gainStepDb: 1.0,  qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1,  qOctaveStep: 1 / 32 },
]
```

Assert `compareV2Solutions(result.solution, start.solution) <= 0`, `completedCycles <= 6`, shelves stay Q 0.7, and a fake deadline expiring between coordinate trials prevents the next trial from starting.

- [ ] **Step 4: Write failing path-cap/retention tests**

With deterministic violations `1.000, 1.010, 1.019, 1.021`, ordinary alternatives through `1.019` are eligible and `1.021` is not. Active paths never exceed three. A single deterministic escape outside 1.02 is allowed only when the main path is stagnant, still within the three-path cap.

Under the approved staged-retention amendment, add a search regression proving that one active parent exact-appends the full shortlist but normally starts joint refinement for at most three eligible appended cascades. Add a false-convergence regression where all staged survivors fail to improve the parent but a non-staged candidate improves after refinement; assert that fallback reaches the first such improvement and stops. Assert deterministic repeats, unchanged global path cap, cooperative deadline behavior, and an internal `jointRefinementCount` that is not persisted in result manifests.

- [ ] **Step 5: Implement joint refinement and search**

For each active parent, exact-append the full cheap shortlist, rank the appended complete cascades with the approved tuple, retain at most three eligible appended cascades using the existing retention rule, and trigger whole-cascade coarse→medium→fine refinement for those staged survivors. Accept a refined cascade only when it improves its parent. If no staged survivor improves the parent, refine non-staged appends in exact tuple order and stop fallback at the first accepted improvement, target-capable result, deadline, or exhaustion. Repeat cycles only while the ranking tuple improves, max 6, with deadline checks before each exact append, refinement, coordinate trial, and new cycle.

Search loop:

```text
residual
→ generate candidates
→ cheap shortlist <= 8
→ exact append all shortlisted candidates
→ per-parent rank + retain eligible candidates, max 3
→ joint refine staged survivors
→ if zero improve, refine deferred candidates until first parent improvement
→ global rank + retain main and eligible alternatives, max 3
→ repeat until no improving path, working cap, target-capable deliverable, or deadline
```

`SearchResult` includes `peakWorkingFilterCount` and `jointRefinementCount` for internal benchmark/tests only; neither is persisted in manifest/UI.

- [ ] **Step 6: Verify and commit Task 3**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/candidates.test.ts \
  test/autoeq/v2/jointRefine.test.ts test/autoeq/v2/search.test.ts
git add packages/core/src/autoeq/v2 packages/core/test/autoeq/v2
git commit -m "feat(core): add bounded Standard v2 hybrid search"
```

---

### Task 4: Add quantized deliverables, precision-first compression, and v2 runner

**Files:**
- Create: `packages/core/src/autoeq/v2/discreteRefine.ts`
- Create: `packages/core/src/autoeq/v2/deliverable.ts`
- Create: `packages/core/src/autoeq/v2/runStandardAutoEqV2.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/autoeq/v2/discreteRefine.test.ts`
- Test: `packages/core/test/autoeq/v2/deliverable.test.ts`
- Test: `packages/core/test/autoeq/v2/runStandardAutoEqV2.test.ts`

**Produces:** `cyclicDiscreteRefineV2()`, `buildDeliverableV2()`, `compressDeliverableV2()`, `runStandardAutoEqV2()`.

**Approved pre-closeout amendment:** keep `standard-v2` and the exact manual grid, but replace Frequency's once-per-cycle movement with deterministic coordinate-local descent over consecutive `Fc ± 1 Hz` neighbors. Stay on Frequency after every accepted `1 Hz` move; leave it only at a local optimum, envelope boundary, or deadline. Gain/Q behavior and all approved constants remain unchanged. One-filter trials must reuse unchanged cached responses and apply `currentCascade - oldFilterResponse + newFilterResponse`. Compare violation/RMSE/maxAbs before computing cancellation audits; materialize audits only for exact primary ties and the final returned solution. Tests must pin consecutive moves, Frequency-before-Gain/Q visitation, envelope handling, deterministic ranking/ties and repeats, cooperative deadline/checkpoint behavior, unchanged-filter response reuse, lazy audit count, and exact final audit.

- [ ] **Step 1: Write failing discrete/checkpoint/compression tests**

Assert cyclic discrete refinement can improve beyond two cycles, stays on the existing manual grid (`1 Hz`, `0.1 dB`, `0.01 Q`), and never worsens the ranking tuple. Under the pre-closeout amendment, assert Frequency performs consecutive deterministic `±1 Hz` local descent to a coordinate-local optimum before Gain/Q, respects the effective envelope, checks the deadline before each trial and continuation step, preserves the last complete checkpoint, recomputes only the changed filter response, avoids cancellation audits when primary metrics decide a trial, and returns an exact final audit.

Assert zero-filter checkpoint exists immediately and every checkpoint is quantized, valid, `filters.length <= settings.maxFilters`, and only replaced by an equal-or-better deliverable.

Create one redundant cascade where removing a filter + bounded refit remains inside `0.25/0.75` and one irreducible cascade where every removal exits the envelope. Compression removes only the redundant filter.

- [ ] **Step 2: Implement exact deliverable construction**

```text
constrained quantization (manual grid ∩ effective envelope)
→ cyclic discrete refinement with Frequency coordinate-local descent until a full cycle has no improvement/deadline
→ remove exact 0 dB filters
→ deterministic sort
→ autoeq-1..N IDs
→ exact delivered metrics
→ dense full-band preamp
→ final cancellation audit
```

Only a result from `buildDeliverableV2()` may replace `bestDeliverable`.

- [ ] **Step 3: Implement deterministic backward elimination**

Estimate each single-filter removal by the ranking tuple; test least-important removals first; joint-refit remaining filters; rebuild the exact quantized deliverable; keep removal only if both precision thresholds remain satisfied. Repeat until no single removal can preserve the envelope or the deadline prevents the next required attempt. A normal `target-reached` result must therefore be one-filter locally minimal.

If target is never achieved, deliver the best valid `<= Max Filters` checkpoint; do not sacrifice materially better fit merely to lower filter count.

- [ ] **Step 4: Write failing runner tests for determinism/timeout/termination**

Pin:

```ts
expect(result.manifest.schemaVersion).toBe(3)
expect(result.manifest.algorithmVersion).toBe('standard-v2')
expect(result.filters.length).toBeLessThanOrEqual(input.settings.maxFilters)
expect(result.manifest.targetAchieved).toBe(
  result.metrics.rmseDb <= 0.25 && result.metrics.maxAbsDb <= 0.75,
)
expect(['target-reached', 'converged', 'time-limit']).toContain(result.manifest.terminationReason)
```

Non-expiring fake-clock repeated runs must deep-equal exactly. A controlled deadline must return a normal valid `time-limit` checkpoint. A timeout after target achievement but before local-minimal compression may have `targetAchieved: true` and `terminationReason: 'time-limit'`.

- [ ] **Step 5: Implement the runner**

```ts
export function runStandardAutoEqV2(
  input: StandardAutoEqInputV2,
  runtime: StandardV2Runtime = { nowMs: () => performance.now() },
): AutoEqResultV2
```

Pipeline: validate/resolve → prepare source/target on canonical grid → desired Target−Source in effective interval → zero-filter deliverable → bounded working search with monotonic deliverable updates → precision-first compression when deliverable target is achieved → exact manifest. Start no new expensive primitive after deadline. `target-reached` requires achieved final deliverable plus completed one-filter local-minimal compression; `converged` means no improving path before deadline; otherwise deadline-limited incomplete work is `time-limit`. Manifest contains no timestamp, elapsedMs, runId, or machine ID.

- [ ] **Step 6: Verify v2 plus frozen v1 once and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
pnpm --filter @autoeq-workbench/core test -- test/autoeq/runStandardAutoEq.test.ts
pnpm --filter @autoeq-workbench/core benchmark
git add packages/core/src/autoeq/v2 packages/core/src/index.ts packages/core/test/autoeq/v2
git commit -m "feat(core): add Standard AutoEQ v2 runner"
```

---

### Task 5: Add v2 solvable, stress, and holdout benchmark evidence

**Files:**
- Create: `packages/core/benchmarks/v2Cases.ts`
- Create: `packages/core/benchmarks/v2HoldoutCases.ts`
- Create: `packages/core/benchmarks/runV2.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/test/autoeq/benchmarkInvariants.test.ts`
- Test: `packages/core/test/autoeq/v2/benchmarkCases.test.ts`

**Produces:** unchanged `benchmark` for v1, plus `benchmark:v2` and `benchmark:v2:holdout`.

**Approved pre-closeout geometry retry amendment:** preserve both approved candidate geometries. `runStandardAutoEqV2()` creates one deadline and attempts half-height-only, then sign-crossing-only, then one mixed-geometry fallback only if both coherent attempts converge outside the delivered target and time remains. All attempts share the monotonic best-deliverable checkpoint and stop immediately on delivered target achievement. Do not partition or reset the runtime budget, start a later attempt after expiration, add a tuning constant, or alter Standard v1.

- [ ] **Step 1: Add exact known-solvable synthetic cases**

Build source as the negative cascade response and target flat 0 dB. Use these quantized desired cascades:

```text
bass_mid_mix:
  LS 120 +5.0 Q0.7; PK 700 -2.8 Q1.4; PK 2400 +3.2 Q2.2
alternating_2_8k:
  PK 2200 +3.0 Q2.4; PK 3300 -3.8 Q3.0; PK 4800 +3.4 Q3.8; PK 7100 -2.8 Q3.2
dense_treble:
  PK 6200 +2.6 Q4.0; PK 8100 -3.2 Q5.0; PK 10400 +2.5 Q4.2; PK 13600 -2.2 Q3.5; PK 17000 +1.6 Q2.5
mixed_widths:
  LS 95 +3.0 Q0.7; PK 450 -2.0 Q0.8; PK 1800 +4.5 Q2.0; PK 3900 -5.0 Q7.0; HS 11500 +2.0 Q0.7
overlap:
  PK 900 +2.5 Q0.9; PK 1400 -3.0 Q1.2; PK 2100 +3.5 Q1.6; PK 3100 -2.5 Q2.0
near_budget (Max Filters 8):
  PK 90 +2.0 Q1.2; PK 220 -2.4 Q1.5; PK 520 +2.8 Q1.8; PK 1200 -3.0 Q2.0; PK 2600 +3.2 Q2.4; PK 5200 -3.0 Q2.8; PK 9000 +2.5 Q3.0; PK 15000 -2.0 Q2.5
quantization_sensitive:
  PK 1235 +4.0 Q1.76; PK 4567 -2.3 Q2.37
overcomplete_compress (Max Filters 6):
  LS 110 +2.5 Q0.7; PK 500 -2.2 Q0.9; PK 1300 +3.5 Q1.7; PK 2600 -3.8 Q2.5; PK 5200 +3.0 Q3.2; HS 12000 -2.0 Q0.7
```

The overcomplete case additionally asserts internal `peakWorkingFilterCount >= finalFilterCount`; it must not add that diagnostic to manifest.

- [ ] **Step 2: Add exact adversarial/stress and holdout cases**

Stress desired mixtures:

```text
stress_mid_treble:
  PK 1800 +3.5 Q1.4; PK 2400 -4.0 Q4.5; PK 3200 +3.8 Q5.5; PK 4100 -3.6 Q6.0;
  PK 5400 +3.2 Q5.0; PK 7000 -3.0 Q4.5; PK 9000 +2.8 Q4.0; PK 12000 -2.6 Q3.5; PK 16500 +2.0 Q3.0
stress_mixed_edges:
  LS 85 +4.0 Q0.7; PK 180 -2.5 Q2.0; PK 900 +3.0 Q1.0; PK 2800 -4.0 Q5.0;
  PK 6200 +3.5 Q6.0; PK 8500 -3.5 Q6.0; PK 13000 +2.5 Q4.0; HS 15500 -2.0 Q0.7
```

Holdout module contains three separate cases, not imported by normal tuning tests:

```text
holdout_solvable_a: LS 140 +3.5 Q0.7; PK 1700 -3.0 Q1.9; PK 6400 +2.7 Q3.4; HS 14500 -1.5 Q0.7
holdout_solvable_b: PK 350 +2.2 Q0.8; PK 2800 -4.2 Q4.8; PK 7600 +3.0 Q5.2; PK 11800 -2.4 Q3.1
holdout_stress: PK 2100 +3.2 Q2.0; PK 2900 -3.4 Q5.0; PK 3900 +3.3 Q5.5; PK 5200 -3.1 Q5.0; PK 7300 +2.9 Q4.5; PK 10500 -2.7 Q4.0; PK 16000 +2.0 Q3.0
```

- [ ] **Step 3: Implement v2 benchmark output/gates**

Each row records `caseId, algorithmVersion, elapsedMs, terminationReason, targetAchieved, maeDb, rmseDb, maxAbsDb, filterCount, maxQ, maxFilterBoostDb, preampDb, moderateCancellations, strongCancellations, filters`.

`benchmark:v2` fails when a known-solvable default-60 s case misses `0.25/0.75`, any result exceeds Max Filters, deterministic non-timeout repeats differ, fake-clock timeout differs, or longer prefix-equivalent budget returns a worse best deliverable. Report typical/stress timing; do not hard-fail shared CI on the `<=3 s` typical / `<=10 s` stress targets.

Package scripts:

```json
"benchmark": "tsx benchmarks/run.ts",
"benchmark:v2": "tsx benchmarks/runV2.ts",
"benchmark:v2:holdout": "tsx benchmarks/runV2.ts --holdout"
```

- [ ] **Step 4: Add geometry-coherent retry via TDD**

Add `V2CandidateBoundaryMode = 'sign-crossing' | 'half-height' | 'mixed'`. Require `CandidateInput.boundaryMode` and `SearchInput.boundaryMode`; `generateV2Candidates()` emits only the selected geometry for coherent attempts and both approved geometries for the final mixed fallback. Candidate ranking, shortlist size, per-geometry feature representatives, shelves, and approved constants remain unchanged.

First add focused regressions that fail on the mixed implementation:

```ts
expect(generateV2Candidates({ ...input, boundaryMode: 'half-height' })
  .filter(({ type }) => type === 'PK')
  .every(({ boundaryMode }) => boundaryMode === 'half-height')).toBe(true)

expect(generateV2Candidates({ ...input, boundaryMode: 'sign-crossing' })
  .filter(({ type }) => type === 'PK')
  .every(({ boundaryMode }) => boundaryMode === 'sign-crossing')).toBe(true)
```

Add runner/search regressions proving the fixed attempt order, one shared deadline, no second attempt after expiration, shared monotonic checkpoint, immediate target stop, and deterministic repeats. Run the named tests and observe the expected RED before production edits. Implement the minimum mode plumbing and orchestration, then rerun candidate/search/runner tests GREEN.

Pin the final fallback with an `overlap` acceptance regression: neither coherent mode reaches `0.25/0.75`, while the mixed fallback does. The mixed attempt must remain last and conditional; it must not run when half-height or sign-crossing already reaches the target.

Run the critical cases individually under the default 60-second budget. `dense_treble`, `alternating_2_8k`, and `near_budget` must each satisfy both precision thresholds. If any fails, report its exact metrics and termination evidence; do not change approved constants.

- [ ] **Step 5: Restore exact Standard-v1 response math via TDD**

Use the existing deterministic Standard-v1 output test as the RED regression. Keep the legacy real/imaginary calculation inside `biquadMagnitudeDb()` and use the algebraically optimized reusable-grid calculation only in `biquadMagnitudeDbOnGrid()` for v2 call sites. Rerun the named v1 test GREEN, then run focused response-cache and v2 response tests to prove the optimized path remains equivalent for its contract.

- [ ] **Step 6: Run v2 benchmark, then v1 drift check, and commit only if requested**

```bash
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/core benchmark
```

If approved v2 constants cannot satisfy a known-solvable gate, stop and report the exact case/metrics; do not silently retune constants.

```bash
git add packages/core/benchmarks packages/core/package.json \
  packages/core/test/autoeq/benchmarkInvariants.test.ts packages/core/test/autoeq/v2/benchmarkCases.test.ts
git commit -m "test(core): add Standard v2 benchmark corpus"
```

The commit commands above are delivery guidance only and must not be run without explicit user authorization.

---

### Task 6: Migrate session schema and fixtures; include timeout in signature/staleness

**Files:**
- Modify: `apps/web/src/session/workbenchSession.ts`
- Modify: `apps/web/src/session/workbenchSession.test.ts`
- Modify: `apps/web/src/state/autoEqRunInputSignature.ts`
- Modify: `apps/web/src/state/autoeqController.test.ts`
- Modify: `apps/web/src/test/autoEqFixture.ts`

**Produces:** `WorkbenchSessionV2` schema 2; valid v1→v2 migration; version-correct test fixtures; timeout-sensitive input signature.

- [ ] **Step 1: Split web test fixtures into historical v1 and current v2**

Keep `createAutoEqResult()` as the historical v1 fixture using `DEFAULT_AUTOEQ_SETTINGS_V1`. Add:

```ts
export function createAutoEqResultV2(
  gainDb = 3,
  overrides: Partial<RunManifestV2> = {},
): AutoEqResultV2
```

Its manifest is schema 3 / `standard-v2`, uses current `DEFAULT_AUTOEQ_SETTINGS`, exact Standard-v2 parameters, and defaults `terminationReason: 'target-reached'`, `targetAchieved: true` only when its fixture metrics satisfy both thresholds. Tests that model current product runs use `createAutoEqResultV2()`; migration/history tests use v1.

- [ ] **Step 2: Write failing session-v1 migration / invalid-v2 tests**

Pin:

```ts
expect(migrated.schemaVersion).toBe(2)
expect(migrated.autoeqSettings.timeLimitSeconds).toBe(60)
expect(migrated.autoEqRun?.manifest.schemaVersion).toBe(2)
expect(migrated.autoEqRun?.manifest.algorithmVersion).toBe('standard-v1')
expect('timeLimitSeconds' in migrated.autoEqRun!.manifest.autoeqSettings).toBe(false)
```

Reject schema-2 sessions with timeout 10/missing timeout and fabricated schema-3 `standard-v1` manifests. Existing invalid-import tests must continue proving no workspace/history/compare/transient mutation.

- [ ] **Step 3: Implement explicit manifest/session unions and migration**

Use separate `isValidRunManifestV1`, `isValidRunManifestV2`, `isValidWorkbenchSessionV1`, `isValidWorkbenchSessionV2`. Export new sessions as:

```ts
export interface WorkbenchSessionV2 {
  schemaVersion: 2
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
```

Migration adds `timeLimitSeconds: 60` only when the field is absent, with the cloned historical run record unchanged. Any approved `timeLimitSeconds` value already persisted is preserved exactly and is never overwritten.

- [ ] **Step 4: Add timeout to signature and stale tests in the existing controller test**

`createAutoEqRunInputSignature()` includes `timeLimitSeconds`. In `autoeqController.test.ts`, prove 30→60 changes the signature/stales a prior AutoEQ result, while curve-name/theme/tab changes still do not alter numerical signature behavior.

- [ ] **Step 5: Verify and commit Task 6**

```bash
pnpm --filter @autoeq-workbench/web test -- src/session/workbenchSession.test.ts src/state/autoeqController.test.ts
git add apps/web/src/session/workbenchSession.ts apps/web/src/session/workbenchSession.test.ts \
  apps/web/src/state/autoEqRunInputSignature.ts apps/web/src/state/autoeqController.test.ts \
  apps/web/src/test/autoEqFixture.ts
git commit -m "feat(web): migrate sessions for Standard v2"
```

---

### Task 7: Switch product Worker to v2 and add Time Limit selector

**Files:**
- Modify: `apps/web/src/features/filters/AutoEqSettings.tsx`
- Modify: `apps/web/src/features/filters/AutoEqSettings.test.tsx`
- Modify: `apps/web/src/state/autoeqController.ts`
- Modify: `apps/web/src/state/autoeqController.test.ts`
- Modify: `apps/web/src/workers/autoeqClient.ts`
- Modify: `apps/web/src/workers/autoeqClient.test.ts`
- Modify: `apps/web/src/workers/autoeq.worker.ts`
- Modify: `apps/web/src/workers/autoeq.worker.test.ts`
- Modify: `apps/web/src/test/autoEqFixture.ts` only if current-run helpers need final type adjustments.

- [ ] **Step 1: Write failing selector test**

```ts
const select = screen.getByRole('combobox', { name: 'AutoEQ time limit' })
expect(select).toHaveValue('60')
expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
  '5 s', '15 s', '30 s', '60 s', '120 s',
])
await user.selectOptions(select, '60')
expect(useWorkspaceStore.getState().autoeqSettings.timeLimitSeconds).toBe(60)
```

- [ ] **Step 2: Implement the compact select under Max Filters**

```tsx
<select
  aria-label="AutoEQ time limit"
  value={settings.timeLimitSeconds}
  onChange={(event) => update({
    timeLimitSeconds: Number(event.target.value) as AutoEqTimeLimitSeconds,
  })}
>
  {AUTOEQ_TIME_LIMIT_OPTIONS.map((seconds) => (
    <option key={seconds} value={seconds}>{seconds} s</option>
  ))}
</select>
```

Use the existing export-select visual vocabulary/native select behavior; no second settings surface, v1/v2 selector, timeout badge, or warning.

- [ ] **Step 3: Write failing current-run orchestration tests**

Update controlled client types to `StandardAutoEqInputV2`/`AutoEqResultV2`. Use `createAutoEqResultV2()` and override through its typed parameter:

```ts
const timeoutResult = createAutoEqResultV2(2, {
  terminationReason: 'time-limit',
  targetAchieved: false,
})
```

Prove captured Worker input contains selected timeout, timeout result applies normally when signature matches, Cancel applies nothing partial, and obsolete/late runId results stay ignored.

- [ ] **Step 4: Switch browser types and Worker entry point**

```ts
export interface AutoEqClient {
  run(runId: string, input: StandardAutoEqInputV2): Promise<AutoEqResultV2>
  cancel(runId?: string): void
}
```

Controller `captureRunInput()` returns v2 input and provenance validation includes `timeLimitSeconds`. Worker imports/calls `runStandardAutoEqV2(data.input)`. Do not add a client timer; core owns the cooperative deadline starting inside Worker execution.

- [ ] **Step 5: Verify and commit Task 7**

```bash
pnpm --filter @autoeq-workbench/web test -- \
  src/features/filters/AutoEqSettings.test.tsx src/state/autoeqController.test.ts \
  src/workers/autoeqClient.test.ts src/workers/autoeq.worker.test.ts
git add apps/web/src/features/filters/AutoEqSettings.tsx apps/web/src/features/filters/AutoEqSettings.test.tsx \
  apps/web/src/state/autoeqController.ts apps/web/src/state/autoeqController.test.ts \
  apps/web/src/workers apps/web/src/test/autoEqFixture.ts
git commit -m "feat(web): run Standard v2 with selectable time limit"
```

---

### Task 8: E2E, holdout, CI, review, and real-world closeout gate

**Files:**
- Modify: `apps/web/e2e/workbench.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `AGENTS.md`

- [ ] **Step 1: Extend existing Workbench E2E**

One synthetic flow must cover:

```text
import FR + Target
→ open Equalizer
→ Time Limit defaults to 60 s
→ select 5 s
→ run AutoEQ and receive applied filters
→ export session and assert schemaVersion=2 + timeLimitSeconds=5
→ re-import and assert settings/filters/provenance round-trip
```

Keep/extend Cancel E2E to prove prior filters survive and no partial result applies. Assert no visible timeout warning exists.

Run only this spec during development:

```bash
pnpm --filter @autoeq-workbench/web e2e -- workbench.spec.ts
```

- [ ] **Step 2: Run holdout once after constants stabilize**

```bash
pnpm --filter @autoeq-workbench/core benchmark:v2:holdout
```

Known-solvable holdout cases must satisfy `0.25/0.75`; stress holdout must return valid bounded results. Fix defects with focused regression tests; do not silently retune approved version constants against holdout.

- [ ] **Step 3: Add v2 benchmark to CI and repo references**

Keep all current CI steps and add:

```yaml
- run: pnpm --filter @autoeq-workbench/core benchmark
- run: pnpm --filter @autoeq-workbench/core benchmark:v2
```

`AGENTS.md` Approved References adds only:

```text
- Standard AutoEQ v2 design: `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`
- Standard AutoEQ v2 plan: `docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md`
```

Do not duplicate global Efficient Workflow policy.

- [ ] **Step 4: Review directed diff before global gates**

```bash
git status --short
git diff --check
git diff --stat 00916b5bc32bbf18bc07920ae9f195526fc5a595...HEAD
git diff 00916b5bc32bbf18bc07920ae9f195526fc5a595...HEAD -- \
  packages/core/src/autoeq packages/core/src/config/autoeqSettings.ts packages/core/benchmarks \
  apps/web/src/session apps/web/src/state apps/web/src/workers \
  apps/web/src/features/filters/AutoEqSettings.tsx apps/web/e2e/workbench.spec.ts \
  .github/workflows/ci.yml AGENTS.md
```

Expected: no unrelated files; no whitespace errors; v1 numerical changes limited to version-boundary compatibility with frozen benchmark proof.

- [ ] **Step 5: Run the single final global local gate pass**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/web e2e
```

If a gate fails: fix cause, rerun failed gate + directly affected focused tests first; rerun the whole chain only if the fix plausibly affects other global gates.

- [ ] **Step 6: Commit closeout plumbing**

```bash
git add apps/web/e2e/workbench.spec.ts .github/workflows/ci.yml AGENTS.md
git commit -m "test: close Standard AutoEQ v2 integration"
```

- [ ] **Step 7: Perform or request the required real-world smoke gate without committing private curves**

Validate at least one difficult real FR/Target pair: closer mids/treble adherence; no treble relaxation; final count <= Max Filters; Time Limit selector works; longer budget can allow an unfinished case to reach target; Cancel remains no-partial-apply; export/import/session/graph regressions absent. Record only non-sensitive pass/fail and metrics.

If the execution environment has no suitable real curve, do **not** invent evidence or mark manual validation complete. Report `Notes: real-world smoke pending user validation`.

- [ ] **Step 8: Push/CI only when execution authorization permits it**

If pushed, exact implementation HEAD SHA must pass GitHub Actions including both benchmarks and Playwright E2E. Do not merge, deploy, release, or publish without separate explicit authorization.

---

## Self-Review Result

- Spec coverage mapped: version boundary, settings, precision/ranking, candidates, cache, path cap, joint refine, working cap, quantized checkpoint, compression, timeout, termination, manifests, session migration, staleness, benchmark/holdout/performance, UI, E2E, CI, real-world gate.
- No unresolved placeholders or conditional file paths remain; web signature coverage intentionally lives in existing `autoeqController.test.ts`.
- Versioned type flow is consistent: v1 = `AutoEqSettingsV1` / `StandardAutoEqInputV1` / `AutoEqResultV1`; product v2 = current `AutoEqSettings` / `StandardAutoEqInputV2` / `AutoEqResultV2`; `RunManifest` is the v1|v2 union.
- Efficient Workflow v2 is encoded as focused-first/global-once, single-agent default, coherent sessions, holdout once after constants stabilize, and compact reporting.

## OpenCode Execution Contract

Instructions first; use committed docs as context rather than re-pasting them:

```text
Read AGENTS.md, docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md,
and docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md.
Execute the plan in order with superpowers:executing-plans and TDD.
Follow Efficient Workflow v2: single agent by default, minimal directed reads,
focused-first verification, one final global pass, no routine narration.
Preserve unrelated WIP. Do not reset/clean/stash/overwrite it.
Do not retune frozen v1 or approved v2 constants; stop with evidence if the approved contract is impossible.
Commit coherent task boundaries. Do not merge/deploy/release/publish.

Return only:
Status: PASS | BLOCKED
SHA: <head sha>
Changes: 1–5 concise bullets
Verification: focused tests; final root gates; v1 benchmark; v2 benchmark; holdout; E2E; exact-SHA CI if pushed
Notes: only blockers, manual-validation need, or real limitations
```
