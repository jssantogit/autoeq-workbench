# Standard AutoEQ v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Under Efficient Workflow v2, use a single agent by default; use `superpowers:subagent-driven-development` only for an independent closed task whose delegation has clear net value. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship deterministic Standard AutoEQ v2 as the product-default optimizer with delivered `RMSE <= 0.25 dB`, `maxAbs <= 0.75 dB`, precision-first compression, bounded `5/15/30/60/120 s` runtime, and materially better difficult-case performance while preserving frozen Standard v1.

**Architecture:** Keep `standard-v1` callable and output-stable. Add a separate `packages/core/src/autoeq/v2/` pipeline: versioned config/ranking/runtime primitives → multi-scale candidates → response-cache-assisted bounded hybrid search → iterative joint refinement → quantized deliverable checkpoint → precision-first compression. The browser keeps the existing Worker/runId/signature/atomic-apply lifecycle and switches only the Worker engine entry point to `runStandardAutoEqV2()`.

**Tech Stack:** TypeScript 6, Vitest, React 19, Zustand, Web Worker, Playwright, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`

## Global Constraints

- `standard-v1` numerical behavior and benchmark baseline remain frozen; do not retune or silently alias v1 to v2.
- `packages/core` is the sole numerical authority; no optimization formulas in React/Zustand/Worker orchestration.
- Final precision target is `RMSE <= 0.25 dB` **and** `maxAbs <= 0.75 dB` on the exact quantized delivered cascade.
- No frequency-dependent treble relaxation; fit-grid samples are uniform over the effective interval.
- Supported filters remain PK/LS/HS; product bounds remain 20–20,000 Hz, gain -15..+15 dB, PK Q 0.1..12, shelf Q 0.7, hard Max Filters 64.
- `Max Filters` is a hard delivered ceiling; internal working cap follows the approved oversubscription formula.
- Time Limit values are exactly `5 | 15 | 30 | 60 | 120`, default `30`; timeout is a normal result, Cancel remains no-partial-apply.
- Non-timeout runs are strictly deterministic. Timeout output is best-effort deterministic across machines and exactly reproducible under the injected fake clock.
- New v2 manifest is schema 3; historical v1 manifests remain schema 2 without fabricated timeout fields.
- New Workbench Session exports are schema 2; valid session v1 imports migrate deterministically with `timeLimitSeconds = 30` while preserving historical v1 manifests.
- Repository fixtures remain synthetic or explicitly sanitized; do not commit private real-world FR/Target files.
- Efficient Workflow v2: minimal directed context, single-agent default, focused tests during each task, one global gate pass after the diff stabilizes, no routine narration, no repeated benchmark/global runs without a concrete reason.
- Preserve unrelated local WIP. Never reset, clean, stash, or overwrite it to simplify execution.

## File Structure

New v2 numerical files are intentionally isolated from frozen v1:

```text
packages/core/src/autoeq/v2/
  config.ts             versioned v2 constants + working-cap resolver
  ranking.ts            target envelope + deterministic solution ordering
  runtime.ts            injectable monotonic clock + deadline checks
  responseCache.ts      per-filter/cascade dB response cache
  candidates.ts         multi-scale PK/LS/HS seed generation + cheap ranking
  jointRefine.ts        iterative whole-cascade continuous refinement
  search.ts             greedy main path + at most two bounded alternatives
  discreteRefine.ts     cyclic manual-grid refinement
  deliverable.ts        quantize/score/checkpoint/compress final-cap solutions
  runStandardAutoEqV2.ts end-to-end v2 runner + manifest
```

Tests mirror responsibilities under `packages/core/test/autoeq/v2/`. Existing v1 modules stay in place. Shared existing primitives such as curve preparation, biquad response, quantization projection, metrics, preamp, and cancellation audit may be reused only when doing so does not change v1 outputs.

Suggested coherent execution sessions under Efficient Workflow v2:

```text
Session A: Tasks 1–2 — versioned contracts + v2 primitives
Session B: Tasks 3–4 — candidates/cache/refinement/search
Session C: Task 5 — deliverable/compression/runner
Session D: Task 6 — benchmark corpus and v2 benchmark command
Session E: Tasks 7–8 — session migration + browser integration
Session F: Task 9 — E2E, CI, final review, real-world smoke gate
```

Do not create a handoff when continuing in the same coherent session. If a session boundary is needed, use the repo-approved 10–15 line handoff format and reference this plan/spec instead of restating them.

---

### Task 1: Version current settings and manifests without changing Standard v1 output

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

**Interfaces:**
- Produces: `AutoEqSettingsV1`, `AutoEqSettings`, `AutoEqTimeLimitSeconds`, `AUTOEQ_TIME_LIMIT_OPTIONS`, `DEFAULT_AUTOEQ_SETTINGS_V1`, `DEFAULT_AUTOEQ_SETTINGS`, `isValidAutoEqSettingsV1()`, `isValidAutoEqSettings()`.
- Produces: `RunManifestV1`, `RunManifestV2`, `RunManifest`, `AutoEqResultV1`, `AutoEqResultV2`, `AutoEqResult`, `StandardAutoEqInputV1`, `StandardAutoEqInputV2`.
- Preserves: `runStandardAutoEq(input: StandardAutoEqInputV1): AutoEqResultV1` and its deterministic benchmark output.

- [ ] **Step 1: Add failing settings-contract tests for the discrete Time Limit domain while pinning the historical v1 shape**

Add assertions equivalent to:

```ts
expect(AUTOEQ_TIME_LIMIT_OPTIONS).toEqual([5, 15, 30, 60, 120])
expect(DEFAULT_AUTOEQ_SETTINGS.timeLimitSeconds).toBe(30)
expect(DEFAULT_AUTOEQ_SETTINGS_V1).toEqual({
  minFrequencyHz: 20,
  maxFrequencyHz: 20_000,
  minGainDb: -15,
  maxGainDb: 15,
  minQ: 0.1,
  maxQ: 12,
  maxFilters: 10,
})

for (const timeLimitSeconds of [5, 15, 30, 60, 120] as const) {
  expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds })).toBe(true)
}
for (const timeLimitSeconds of [0, 10, 29, 31, 121, NaN]) {
  expect(isValidAutoEqSettings({ ...DEFAULT_AUTOEQ_SETTINGS, timeLimitSeconds } as AutoEqSettings)).toBe(false)
}
```

Also pin `isValidAutoEqSettingsV1(DEFAULT_AUTOEQ_SETTINGS_V1) === true` and verify a v1 settings object with no timeout remains valid under the v1 validator.

- [ ] **Step 2: Run the focused settings tests and confirm the new contract fails before implementation**

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- test/config/autoeqSettings.test.ts
```

Expected: FAIL because the v2 Time Limit exports/types do not exist yet.

- [ ] **Step 3: Split historical and current settings contracts**

Implement the shape explicitly:

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

export const DEFAULT_AUTOEQ_SETTINGS_V1: Readonly<AutoEqSettingsV1> = Object.freeze({
  minFrequencyHz: AUTOEQ_PRODUCT_LIMITS.minFrequencyHz,
  maxFrequencyHz: AUTOEQ_PRODUCT_LIMITS.maxFrequencyHz,
  minGainDb: AUTOEQ_PRODUCT_LIMITS.minGainDb,
  maxGainDb: AUTOEQ_PRODUCT_LIMITS.maxGainDb,
  minQ: AUTOEQ_PRODUCT_LIMITS.minQ,
  maxQ: AUTOEQ_PRODUCT_LIMITS.maxQ,
  maxFilters: AUTOEQ_PRODUCT_LIMITS.defaultMaxFilters,
})

export const DEFAULT_AUTOEQ_SETTINGS: Readonly<AutoEqSettings> = Object.freeze({
  ...DEFAULT_AUTOEQ_SETTINGS_V1,
  timeLimitSeconds: 30,
})
```

Keep the current bounds logic in `isValidAutoEqSettingsV1()`. Define `isValidAutoEqSettings()` as v1-valid **plus** membership in `AUTOEQ_TIME_LIMIT_OPTIONS`; do not clamp arbitrary values.

- [ ] **Step 4: Add failing manifest/version-boundary tests before changing production types**

In `runStandardAutoEq.test.ts`, pin that a frozen v1 run still returns:

```ts
expect(result.manifest.schemaVersion).toBe(2)
expect(result.manifest.algorithmVersion).toBe('standard-v1')
expect('timeLimitSeconds' in result.manifest.autoeqSettings).toBe(false)
```

Use `DEFAULT_AUTOEQ_SETTINGS_V1` in the v1 input.

- [ ] **Step 5: Version AutoEQ input/result/manifest types explicitly**

Refactor `packages/core/src/autoeq/types.ts` so historical v1 remains exact and v2 is a separate contract:

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

export interface RunManifestV1 {
  schemaVersion: 2
  algorithmVersion: 'standard-v1'
  profile: 'Standard'
  // existing v1 fields
  autoeqSettings: AutoEqSettingsV1
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

Keep `StandardAutoEqInput` as a deprecated/backward-compatible alias to `StandardAutoEqInputV1` only if existing external imports require it; new browser code must use `StandardAutoEqInputV2` explicitly.

- [ ] **Step 6: Make v1 config and runner consume only the historical validator/settings shape**

Change `resolveStandardAutoEqConfig()` to validate `AutoEqSettingsV1` with `isValidAutoEqSettingsV1()`. Ensure `runStandardAutoEq()` serializes exactly the v1 settings shape and never writes a timeout field.

Update `packages/core/benchmarks/cases.ts` to use `DEFAULT_AUTOEQ_SETTINGS_V1`, `AutoEqSettingsV1`, and `StandardAutoEqInputV1` so the frozen baseline remains a true v1 input corpus.

- [ ] **Step 7: Export the versioned contracts and run focused v1 compatibility tests**

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/config/autoeqSettings.test.ts \
  test/autoeq/config.test.ts \
  test/autoeq/runStandardAutoEq.test.ts
pnpm --filter @autoeq-workbench/core benchmark
```

Expected: focused tests PASS and Standard-v1 benchmark reports no deterministic drift.

- [ ] **Step 8: Commit the version boundary**

```bash
git add packages/core/src/config/autoeqSettings.ts \
  packages/core/src/autoeq/types.ts \
  packages/core/src/autoeq/config.ts \
  packages/core/src/autoeq/runStandardAutoEq.ts \
  packages/core/src/index.ts \
  packages/core/benchmarks/cases.ts \
  packages/core/test/config/autoeqSettings.test.ts \
  packages/core/test/autoeq/config.test.ts \
  packages/core/test/autoeq/runStandardAutoEq.test.ts
git commit -m "feat(core): version AutoEQ settings and manifests"
```

---

### Task 2: Build Standard v2 config, ranking, runtime, and response-cache primitives

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

**Interfaces:**
- Produces: `STANDARD_V2_CONFIG`, `resolveStandardAutoEqV2Config()`, `calculateWorkingMaxFilters()`.
- Produces: `isV2TargetAchieved()`, `compareV2Solutions()`.
- Produces: `StandardV2Runtime`, `createStandardV2Deadline()`.
- Produces: `createResponseCache()`, `replaceCachedFilterResponse()`, `appendCachedFilterResponse()`, with cached and full-cascade results numerically equivalent.

- [ ] **Step 1: Write failing tests for the exact versioned v2 constants and working-cap formula**

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
```

- [ ] **Step 2: Write failing ranking tests that prove maxAbs cannot be hidden by a low RMSE**

Use a minimal `RankedV2Solution` helper and assert:

```ts
expect(isV2TargetAchieved({ rmseDb: 0.25, maxAbsDb: 0.75, ...rest })).toBe(true)
expect(isV2TargetAchieved({ rmseDb: 0.10, maxAbsDb: 0.76, ...rest })).toBe(false)

const localFailure = solution({ rmseDb: 0.10, maxAbsDb: 1.20 })
const balanced = solution({ rmseDb: 0.24, maxAbsDb: 0.70 })
expect(compareV2Solutions(balanced, localFailure)).toBeLessThan(0)
```

Also pin deterministic tie order: cancellation score → max Q → max abs gain → sum abs gain → filter count → stable filter parameter order.

- [ ] **Step 3: Write failing fake-clock deadline tests**

Use a controlled runtime:

```ts
let now = 1_000
const runtime: StandardV2Runtime = { nowMs: () => now }
const deadline = createStandardV2Deadline(runtime, 5)
expect(deadline.isExpired()).toBe(false)
now = 5_999
expect(deadline.isExpired()).toBe(false)
now = 6_000
expect(deadline.isExpired()).toBe(true)
```

The deadline captures `startMs` once; do not call wall time outside the injected runtime in core v2.

- [ ] **Step 4: Write failing response-cache equivalence tests**

Construct 2–3 PK filters on a short evaluation grid. Assert cached cascade dB equals `cascadeMagnitudeDb()` to tight floating tolerance before and after replacing one filter:

```ts
expect(cache.cascadeDb).toEqualFloatArray(fullCascadeDb)
const next = replaceCachedFilterResponse(cache, 1, movedFilter)
expect(next.cascadeDb).toEqualFloatArray(fullCascadeAfterMove)
```

Use the project's normal Vitest tolerance helpers or element-wise `toBeCloseTo(..., 12)`; do not introduce a custom approximate-math dependency.

- [ ] **Step 5: Implement the four pure v2 foundation modules**

`config.ts` resolves the same sample rate/96-ppo/user envelopes as v1 but reports `algorithmVersion: 'standard-v2'` and the exact approved algorithm constants. `calculateWorkingMaxFilters()` implements:

```ts
return maxFilters === 0
  ? 0
  : Math.min(
      AUTOEQ_PRODUCT_LIMITS.hardMaxFilters,
      maxFilters + Math.max(4, Math.ceil(maxFilters / 2)),
    )
```

`ranking.ts` computes normalized violation:

```ts
Math.max(metrics.rmseDb / 0.25, metrics.maxAbsDb / 0.75)
```

and then the approved deterministic tuple.

`runtime.ts` exposes only clock/deadline behavior; it owns no optimization decisions.

`responseCache.ts` stores one dB response array per filter plus their dB sum so a one-filter trial is `current - old + next` instead of rebuilding unchanged responses.

- [ ] **Step 6: Run only the new v2 primitive tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
```

Expected: all new primitive tests PASS.

- [ ] **Step 7: Commit the v2 foundation**

```bash
git add packages/core/src/autoeq/v2 packages/core/src/index.ts packages/core/test/autoeq/v2
git commit -m "feat(core): add Standard v2 optimization primitives"
```

---

### Task 3: Implement multi-scale candidates and cheap shortlist ranking

**Files:**
- Create: `packages/core/src/autoeq/v2/candidates.ts`
- Test: `packages/core/test/autoeq/v2/candidates.test.ts`

**Interfaces:**
- Consumes: `StandardV2Config`, current residual, canonical fit frequencies.
- Produces: `V2FilterCandidate`, `generateV2Candidates()`, `rankV2CandidateShortlist()`.
- Guarantees: Q variants exactly `0.5×/1×/2×`, shelf Q `0.7`, deterministic order/dedup, exact shortlist length `<= 8`.

- [ ] **Step 1: Write failing PK multi-scale tests**

Use a synthetic residual with one broad peak and one narrow valley. Assert that generated PK seeds center on deterministic local extrema and include constrained Q variants:

```ts
const candidates = generateV2Candidates({ frequenciesHz, residualDb, config })
const aroundPeak = candidates.filter((candidate) => candidate.type === 'PK' && candidate.featureIndex === peakIndex)
expect(aroundPeak.map(({ qScale }) => qScale)).toEqual([0.5, 1, 2])
expect(aroundPeak.every(({ frequencyHz }) => frequencyHz === frequenciesHz[peakIndex])).toBe(true)
```

Test that residual extrema below `0.15 dB` do not create candidates.

- [ ] **Step 2: Write failing edge/shelf tests**

Use broad same-sign low- and high-edge residuals and assert:

```ts
expect(ls?.type).toBe('LS')
expect(ls?.q).toBe(0.7)
expect(hs?.type).toBe('HS')
expect(hs?.q).toBe(0.7)
```

Also test that evidence outside `minFrequencyHz..maxFrequencyHz` cannot justify a shelf.

- [ ] **Step 3: Write failing deterministic dedup/order/shortlist tests**

Canonicalize candidate identity from the discrete feature source, not a new arbitrary tuning threshold:

```text
(type, canonical extremum/edge index, normalized seed Fc, normalized seed gain, normalized seed Q)
```

Duplicate feature detections with the same canonical identity collapse to one candidate. Equal cheap scores sort by frequency, then type order `LS, PK, HS`, then gain, then Q. Generate more than eight valid candidates and assert `rankV2CandidateShortlist(...).length === 8`.

- [ ] **Step 4: Implement deterministic multi-scale feature extraction and cheap score**

Implementation rules:

```text
PK center       = canonical residual extremum sample
PK width        = nearest surrounding sign crossing; use half-height boundary on a side that has no sign crossing
base Q          = centerHz / max(epsilon, highBoundaryHz - lowBoundaryHz)
Q variants      = clamp(baseQ * [0.5, 1, 2], effective Q envelope)
PK gain         = residual at center, clamped to effective gain envelope
shelf gain      = median signed residual across broad edge evidence
shelf transition= canonical half-height transition sample nearest the interior edge of the evidence region
```

If clamping makes multiple Q variants identical, canonical dedup removes duplicates. Do not inspect excluded fit frequencies.

Cheap score is the reduction in squared residual energy from the candidate's isolated response on the current fit grid; this score is only a shortlist heuristic, never the final solution authority.

- [ ] **Step 5: Run the candidate tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/candidates.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit candidate generation**

```bash
git add packages/core/src/autoeq/v2/candidates.ts packages/core/test/autoeq/v2/candidates.test.ts
git commit -m "feat(core): add multi-scale Standard v2 candidates"
```

---

### Task 4: Implement iterative joint refinement and bounded hybrid search

**Files:**
- Create: `packages/core/src/autoeq/v2/jointRefine.ts`
- Create: `packages/core/src/autoeq/v2/search.ts`
- Test: `packages/core/test/autoeq/v2/jointRefine.test.ts`
- Test: `packages/core/test/autoeq/v2/search.test.ts`

**Interfaces:**
- Consumes: candidate shortlist, response cache, ranking tuple, deadline, working filter cap.
- Produces: `jointRefineV2()`, `searchStandardV2WorkingSolutions()`.
- Guarantees: up to 6 joint cycles, path count <= 3, alternate retention ratio 1.02, monotonic retained-path ranking, no new expensive primitive after deadline.

- [ ] **Step 1: Write failing joint-refinement monotonicity and cycle-cap tests**

Inject a counting runtime/evaluator so tests can observe cycle boundaries without wall-clock sleeps. Assert:

```ts
expect(result.rank).not.toBeWorseThan(start.rank)
expect(result.completedCycles).toBeLessThanOrEqual(6)
```

Use the approved three deterministic coordinate scales in order:

```ts
[
  { fcOctaveStep: 1 / 6,  gainStepDb: 1.0,  qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1,  qOctaveStep: 1 / 32 },
]
```

Shelves never modify Q away from `0.7`.

- [ ] **Step 2: Write failing deadline-boundary tests for coordinate trials**

Arrange the fake clock so the deadline expires between two trials. Assert the second trial never starts and the function returns the best complete state from before expiry.

- [ ] **Step 3: Write failing hybrid-path cap and 2% retention tests**

Stub deterministic candidate evaluations with violations such as `1.000`, `1.010`, `1.019`, `1.021`. Assert only candidates within 1.02 of the branch best are eligible as ordinary alternatives and active paths never exceed three. Add a stagnation case where the best deterministic escape may be retained even when outside 1.02, still respecting the cap.

- [ ] **Step 4: Implement `jointRefineV2()` using cached one-filter replacement**

For each retained filter in stable list order, test `-step/current/+step` variants per coordinate within the effective envelope. Update only the moved filter response in the cache. A full coarse→medium→fine cycle repeats only if the ranking tuple improved and the cycle cap/deadline permits it.

- [ ] **Step 5: Implement `searchStandardV2WorkingSolutions()`**

Use one greedy main path plus at most two alternatives:

```text
compute residual
→ generate candidates
→ cheap-rank and take <= 8
→ exact evaluate + joint-refine each allowed candidate append
→ rank complete candidate paths
→ retain main + eligible alternatives, max 3
→ repeat until target-working evidence, convergence, working cap, or deadline
```

Do not use randomness, unbounded queues, nested beam expansion, or full-cascade recomputation for unchanged filter responses.

- [ ] **Step 6: Run only refinement/search tests**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/search.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit hybrid search**

```bash
git add packages/core/src/autoeq/v2/jointRefine.ts \
  packages/core/src/autoeq/v2/search.ts \
  packages/core/test/autoeq/v2/jointRefine.test.ts \
  packages/core/test/autoeq/v2/search.test.ts
git commit -m "feat(core): add bounded Standard v2 hybrid search"
```

---

### Task 5: Build quantized deliverables, precision-first compression, and the v2 runner

**Files:**
- Create: `packages/core/src/autoeq/v2/discreteRefine.ts`
- Create: `packages/core/src/autoeq/v2/deliverable.ts`
- Create: `packages/core/src/autoeq/v2/runStandardAutoEqV2.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/autoeq/v2/discreteRefine.test.ts`
- Test: `packages/core/test/autoeq/v2/deliverable.test.ts`
- Test: `packages/core/test/autoeq/v2/runStandardAutoEqV2.test.ts`

**Interfaces:**
- Produces: `cyclicDiscreteRefineV2()`, `buildDeliverableV2()`, `compressDeliverableV2()`, `runStandardAutoEqV2(input, runtime?)`.
- Guarantees: valid zero-filter checkpoint from start, delivered count <= `Max Filters`, checkpoint never worsens, target success only on delivered metrics, all three termination reasons, schema-3 manifest.

- [ ] **Step 1: Write failing cyclic discrete-refinement tests**

Start from a quantized filter where one `±1` manual-grid step improves the ranking and another subsequent cycle improves again. Assert refinement continues until a full cycle has no improvement, not just two fixed passes. Assert all returned Fc/gain/Q values remain on the manual-entry grid and inside the effective envelope.

- [ ] **Step 2: Write failing best-deliverable checkpoint invariants**

Test from zero filters through a sequence of working cascades:

```ts
expect(checkpoint.filters.length).toBeLessThanOrEqual(settings.maxFilters)
expect(isManualGridRepresentable(checkpoint.filters)).toBe(true)
expect(compareV2Solutions(nextCheckpoint, previousCheckpoint)).toBeLessThanOrEqual(0)
```

A worse candidate must not replace the checkpoint. `maxFilters = 0` must always yield a valid zero-filter deliverable.

- [ ] **Step 3: Write failing precision-first backward-elimination tests**

Create a known redundant delivered cascade where one filter can be removed and the remainder re-refined while staying inside `0.25/0.75`. Assert it is removed. Create a second case where every single-filter removal exits the envelope and assert the original count is preserved.

For a normally completed target result, verify one-filter local minimality by independently removing each final filter and confirming no removal+bounded-refit can remain inside the envelope.

- [ ] **Step 4: Implement `cyclicDiscreteRefineV2()` and `buildDeliverableV2()`**

Reuse the existing constrained delivery projection `manual-entry grid ∩ effective envelope`. After projection:

```text
cyclic discrete refine
→ remove exact 0 dB filters
→ deterministic sort
→ assign autoeq-1..N
→ exact final metrics
→ dense-grid preamp
→ final cancellation audit
```

The deliverable function is the only path that can update `bestDeliverable`.

- [ ] **Step 5: Implement `compressDeliverableV2()`**

Backward-elimination order is deterministic: estimate each removal using the ranking tuple, test least-important removals first, jointly refit the remainder, rebuild the quantized deliverable, and keep a removal only if both target thresholds still pass. Repeat until no single removal can pass or the deadline blocks the next required compression/refit action.

If the working solution never reaches the envelope, still compress/project to the best valid `<= Max Filters` deliverable according to the ranking tuple; do not trade a materially better out-of-envelope fit merely for fewer filters.

- [ ] **Step 6: Write the v2 runner tests before implementing the runner**

Cover:

```ts
expect(result.manifest.algorithmVersion).toBe('standard-v2')
expect(result.manifest.schemaVersion).toBe(3)
expect(result.filters.length).toBeLessThanOrEqual(input.settings.maxFilters)
expect(result.manifest.targetAchieved).toBe(
  result.metrics.rmseDb <= 0.25 && result.metrics.maxAbsDb <= 0.75,
)
expect(['target-reached', 'converged', 'time-limit']).toContain(result.manifest.terminationReason)
```

Add exact-repeat tests using a non-expiring fake clock; add a timeout test where the fake clock expires before further fit/compression and assert a normal valid result with `terminationReason: 'time-limit'`.

- [ ] **Step 7: Implement `runStandardAutoEqV2()` as the single v2 orchestration authority**

Signature:

```ts
export function runStandardAutoEqV2(
  input: StandardAutoEqInputV2,
  runtime: StandardV2Runtime = { nowMs: () => performance.now() },
): AutoEqResultV2
```

Pipeline:

```text
validate/resolve config
→ prepare source/target on canonical grid
→ desired Target - Source over effective interval
→ create zero-filter deliverable checkpoint
→ bounded hybrid working search
→ rebuild deliverables as useful working states appear
→ once a delivered target-achieved solution exists, run precision-first compression
→ if deadline blocks required work, return best checkpoint as time-limit
→ if search has no improving path, return best checkpoint as converged
→ only use target-reached after target achieved + one-filter local-minimal compression completes
→ construct reproducible schema-3 manifest without elapsedMs/timestamp/runId
```

If a timeout occurs after target achievement but before compression finishes, `targetAchieved` may be true while `terminationReason` is `time-limit`.

- [ ] **Step 8: Run the complete v2 core test directory plus frozen v1 tests/benchmark once**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
pnpm --filter @autoeq-workbench/core test -- test/autoeq/runStandardAutoEq.test.ts
pnpm --filter @autoeq-workbench/core benchmark
```

Expected: v2 tests PASS; v1 regression test and baseline benchmark remain unchanged.

- [ ] **Step 9: Commit the complete core v2 runner**

```bash
git add packages/core/src/autoeq/v2 packages/core/src/index.ts packages/core/test/autoeq/v2
git commit -m "feat(core): add Standard AutoEQ v2 runner"
```

---

### Task 6: Add Standard v2 solvable/stress/holdout benchmarks and performance evidence

**Files:**
- Create: `packages/core/benchmarks/v2Cases.ts`
- Create: `packages/core/benchmarks/v2HoldoutCases.ts`
- Create: `packages/core/benchmarks/runV2.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/test/autoeq/benchmarkInvariants.test.ts`
- Test: `packages/core/test/autoeq/v2/benchmarkCases.test.ts`

**Interfaces:**
- Produces: `benchmark:v2` command for development/CI functional gates.
- Produces: optional `benchmark:v2:holdout` command used only at final validation until closeout.
- Preserves: existing `benchmark` command as frozen Standard-v1 drift check.

- [ ] **Step 1: Define deterministic known-solvable synthetic cases from valid quantized filter cascades**

Use the existing benchmark-case construction pattern (`source = -desiredCascade`, flat target). Include at least these case families with all parameters already on the delivery grid:

```ts
bass_mid_mix: [
  LS(120, +5.0, 0.7),
  PK(700, -2.8, 1.4),
  PK(2400, +3.2, 2.2),
]

alternating_2_8k: [
  PK(2200, +3.0, 2.4),
  PK(3300, -3.8, 3.0),
  PK(4800, +3.4, 3.8),
  PK(7100, -2.8, 3.2),
]

dense_treble: [
  PK(6200, +2.6, 4.0),
  PK(8100, -3.2, 5.0),
  PK(10400, +2.5, 4.2),
  PK(13600, -2.2, 3.5),
  PK(17000, +1.6, 2.5),
]

mixed_widths: [
  LS(95, +3.0, 0.7),
  PK(450, -2.0, 0.8),
  PK(1800, +4.5, 2.0),
  PK(3900, -5.0, 7.0),
  HS(11500, +2.0, 0.7),
]
```

Add separate cases for overlapping filters, near-Max-Filters demand, quantization sensitivity, and over-complete-working/final-cap compression. Keep all fixtures synthetic.

- [ ] **Step 2: Add deterministic adversarial/stress cases not required to have a perfect known inverse**

Build residuals from dense mixtures of broad/narrow features in mids and treble so candidate conflicts are high. These cases assert valid bounded completion/checkpoint invariants, not an artificial guarantee of perfect fit.

- [ ] **Step 3: Reserve holdout cases in a separate module**

Put at least two solvable and one adversarial case in `v2HoldoutCases.ts`. Do not import that module into ordinary v2 tuning tests. The final holdout run happens only after algorithm constants are considered stable.

- [ ] **Step 4: Implement `runV2.ts` output and functional acceptance checks**

Each result records:

```ts
{
  caseId,
  algorithmVersion: 'standard-v2',
  elapsedMs,
  terminationReason,
  targetAchieved,
  maeDb,
  rmseDb,
  maxAbsDb,
  filterCount,
  maxQ,
  maxFilterBoostDb,
  preampDb,
  moderateCancellations,
  strongCancellations,
  filters,
}
```

Fail the command when a known-solvable default-30-second case misses the precision envelope, any result exceeds `Max Filters`, a non-time-limited deterministic repeat differs, or monotonic longer-budget checkpoint tests fail. Report typical/stress elapsed times but do **not** turn `<=3 s` / `<=10 s` into flaky CI assertions.

- [ ] **Step 5: Add package scripts without changing the frozen v1 benchmark command**

```json
{
  "benchmark": "tsx benchmarks/run.ts",
  "benchmark:v2": "tsx benchmarks/runV2.ts",
  "benchmark:v2:holdout": "tsx benchmarks/runV2.ts --holdout"
}
```

- [ ] **Step 6: Run the v2 benchmark and use the result only to fix correctness/performance defects, not to silently retune approved constants**

```bash
pnpm --filter @autoeq-workbench/core benchmark:v2
```

Expected functional gates: PASS. Record observed typical/stress timings in the command output. If the algorithm cannot meet correctness with approved constants, stop and report the specific failing case/metric instead of silently changing versioned constants.

- [ ] **Step 7: Run frozen v1 benchmark once after benchmark plumbing changes**

```bash
pnpm --filter @autoeq-workbench/core benchmark
```

Expected: no Standard-v1 drift.

- [ ] **Step 8: Commit v2 benchmark coverage**

```bash
git add packages/core/benchmarks packages/core/package.json \
  packages/core/test/autoeq/benchmarkInvariants.test.ts \
  packages/core/test/autoeq/v2/benchmarkCases.test.ts
git commit -m "test(core): add Standard v2 benchmark corpus"
```

---

### Task 7: Migrate Workbench Session v1→v2 and include Time Limit in signatures/staleness

**Files:**
- Modify: `apps/web/src/session/workbenchSession.ts`
- Modify: `apps/web/src/session/workbenchSession.test.ts`
- Modify: `apps/web/src/state/autoEqRunInputSignature.ts`
- Modify: `apps/web/src/state/autoEqRunInputSignature.test.ts` if present; otherwise add focused cases to the existing state/controller test that owns signature behavior.
- Modify: `apps/web/src/state/workspaceStore.ts` only if schema/default hydration requires an explicit change.

**Interfaces:**
- Produces: `WorkbenchSessionV2` schema 2 as the only new export shape.
- Consumes: `RunManifestV1 | RunManifestV2` without rewriting historical manifests.
- Guarantees: valid v1 import → in-memory v2 with `timeLimitSeconds: 30`; invalid import remains non-mutating; signature includes timeout but excludes names/UI-only state.

- [ ] **Step 1: Write failing session migration tests**

Create a valid session-v1 object with historical `standard-v1` manifest and no timeout. Assert import validation/migration produces:

```ts
expect(migrated.schemaVersion).toBe(2)
expect(migrated.autoeqSettings.timeLimitSeconds).toBe(30)
expect(migrated.autoEqRun?.manifest.schemaVersion).toBe(2)
expect(migrated.autoEqRun?.manifest.algorithmVersion).toBe('standard-v1')
expect('timeLimitSeconds' in migrated.autoEqRun!.manifest.autoeqSettings).toBe(false)
```

Also assert a new exported session uses schema 2 and preserves a schema-3 v2 manifest unchanged.

- [ ] **Step 2: Write failing invalid-import non-mutation tests for malformed timeout/session schema**

Reject session-v2 settings with `timeLimitSeconds: 10`, missing timeout, or fabricated schema-3 `standard-v1` manifest. Reuse the existing atomic parse/validate-before-apply test harness so workspace/history/compare state remains unchanged on failure.

- [ ] **Step 3: Implement explicit union validation + migration**

Use separate validators:

```ts
isValidRunManifestV1(manifest)
isValidRunManifestV2(manifest)
isValidWorkbenchSessionV1(value)
isValidWorkbenchSessionV2(value)
```

Migration is data-only:

```ts
function migrateWorkbenchSessionV1(session: WorkbenchSessionV1): WorkbenchSessionV2 {
  return {
    ...session,
    schemaVersion: 2,
    autoeqSettings: { ...session.autoeqSettings, timeLimitSeconds: 30 },
    autoEqRun: cloneAutoEqRunRecord(session.autoEqRun),
  }
}
```

Do not inject timeout into the nested v1 manifest.

- [ ] **Step 4: Add Time Limit to the numerical input signature and stale-result rule**

Ensure the signature includes `timeLimitSeconds` alongside every other effective AutoEQ setting. Add a test proving changing 30→60 changes the signature/stales AutoEQ provenance, while changing curve names/theme/tab still does not.

- [ ] **Step 5: Run focused session/signature tests**

```bash
pnpm --filter @autoeq-workbench/web test -- \
  src/session/workbenchSession.test.ts \
  src/state/autoEqRunInputSignature.test.ts
```

If the signature test lives under another existing filename, run that exact owning test instead of creating duplicate coverage.

- [ ] **Step 6: Commit session migration**

```bash
git add apps/web/src/session apps/web/src/state/autoEqRunInputSignature.ts \
  apps/web/src/state/autoEqRunInputSignature.test.ts apps/web/src/state/workspaceStore.ts
git commit -m "feat(web): migrate sessions for Standard v2 settings"
```

Only add paths that actually changed; do not stage unrelated state files.

---

### Task 8: Switch the product Worker to Standard v2 and add the Time Limit selector

**Files:**
- Modify: `apps/web/src/features/filters/AutoEqSettings.tsx`
- Modify: `apps/web/src/features/filters/AutoEqSettings.test.tsx`
- Modify: `apps/web/src/state/autoeqController.ts`
- Modify: `apps/web/src/state/autoeqController.test.ts` if present
- Modify: `apps/web/src/workers/autoeqClient.ts`
- Modify: `apps/web/src/workers/autoeqClient.test.ts` if present
- Modify: `apps/web/src/workers/autoeq.worker.ts`
- Modify: `apps/web/src/workers/autoeq.worker.test.ts` if present

**Interfaces:**
- Consumes: `StandardAutoEqInputV2`, `AutoEqResultV2`, `AUTOEQ_TIME_LIMIT_OPTIONS`.
- Product rule: existing AutoEQ button runs v2; no v1/v2 selector.
- UI rule: one native/select-style Time Limit control under Max Filters; no timeout warning/badge.

- [ ] **Step 1: Write failing UI tests for exact selector options/default**

Assert:

```ts
const select = screen.getByRole('combobox', { name: 'AutoEQ time limit' })
expect(select).toHaveValue('30')
expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
  '5 s', '15 s', '30 s', '60 s', '120 s',
])
```

Change to `60` with `userEvent.selectOptions()` and assert workspace settings become `timeLimitSeconds: 60`.

- [ ] **Step 2: Implement the compact Time Limit row using the existing select visual vocabulary**

Add below Max Filters:

```tsx
<div className="settings-row settings-row--limit" role="row" aria-label="AutoEQ time limit">
  <span role="rowheader">Time Limit</span>
  <span aria-hidden="true" />
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
</div>
```

Reuse existing settings/select CSS unless a tiny scoped rule is required for geometry. Do not create a second settings panel.

- [ ] **Step 3: Write failing controller/client/worker tests for v2 input and normal timeout application**

Controller capture must include timeout. Worker request/result types become v2-specific. Pin that a mocked result with:

```ts
manifest: {
  algorithmVersion: 'standard-v2',
  schemaVersion: 3,
  terminationReason: 'time-limit',
  targetAchieved: false,
  ...
}
```

is applied normally when the input signature still matches. Preserve tests proving Cancel applies nothing partial and late/obsolete runId results are ignored.

- [ ] **Step 4: Switch browser orchestration types and Worker entry point**

Use:

```ts
AutoEqClient.run(runId: string, input: StandardAutoEqInputV2): Promise<AutoEqResultV2>
```

`captureRunInput()` returns the new settings shape. `matchesCapturedProvenance()` checks every captured numerical setting including `timeLimitSeconds`; names remain provenance checks only as already required by the current controller contract.

Worker implementation becomes:

```ts
import { CoreError, runStandardAutoEqV2 } from '@autoeq-workbench/core'
// ...
result: runStandardAutoEqV2(data.input)
```

Do not add client-side timeout timers; the cooperative optimizer budget belongs in core v2 and begins when Worker execution begins.

- [ ] **Step 5: Run focused web tests**

```bash
pnpm --filter @autoeq-workbench/web test -- \
  src/features/filters/AutoEqSettings.test.tsx \
  src/state/autoeqController.test.ts \
  src/workers/autoeqClient.test.ts \
  src/workers/autoeq.worker.test.ts
```

Run only filenames that exist after implementation. Expected: selector, capture, timeout-result apply, Cancel, and obsolete-result coverage PASS.

- [ ] **Step 6: Commit the product-default switch**

```bash
git add apps/web/src/features/filters/AutoEqSettings.tsx \
  apps/web/src/features/filters/AutoEqSettings.test.tsx \
  apps/web/src/state/autoeqController.ts \
  apps/web/src/state/autoeqController.test.ts \
  apps/web/src/workers
git commit -m "feat(web): run Standard v2 with selectable time limit"
```

---

### Task 9: Close with E2E, holdout, CI gates, and real-world smoke validation

**Files:**
- Modify: `apps/web/e2e/workbench.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md` only to change status to implemented/closed **after** all required evidence exists; do not change approved behavior during execution.

**Interfaces:**
- CI must run frozen v1 benchmark **and** Standard v2 benchmark.
- E2E covers real browser AutoEQ flow and session schema-2 round-trip.
- Final human gate uses real imported curves but commits no private data.

- [ ] **Step 1: Add E2E coverage for Time Limit + v2 run + session round-trip**

Extend the existing workbench E2E rather than adding a parallel suite. Cover:

```text
import synthetic FR + Target fixture
→ open Equalizer
→ confirm Time Limit default 30 s
→ select 5 s (keeps E2E bounded)
→ run AutoEQ
→ verify filters are produced/applied and UI stays responsive
→ export session
→ assert exported JSON schemaVersion = 2 and autoeqSettings.timeLimitSeconds = 5
→ re-import session
→ assert settings/filters/provenance restore
```

Also keep/extend the existing Cancel flow so cancelling a running Worker preserves the prior filters and applies no partial result. Do not assert a timeout warning because none should exist.

- [ ] **Step 2: Run only the relevant E2E spec once during development**

```bash
pnpm --filter @autoeq-workbench/web e2e -- workbench.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run the holdout benchmark once after algorithm constants are stable**

```bash
pnpm --filter @autoeq-workbench/core benchmark:v2:holdout
```

Expected: known-solvable holdout cases satisfy `0.25/0.75`, invariants pass, and stress cases return valid bounded results. If holdout exposes a real algorithm defect, fix the defect and its focused regression test; do not silently tune the approved versioned constants against holdout outputs.

- [ ] **Step 4: Add Standard v2 benchmark to CI without removing any existing gate**

The CI sequence must contain both:

```yaml
- run: pnpm --filter @autoeq-workbench/core benchmark
- run: pnpm --filter @autoeq-workbench/core benchmark:v2
```

Keep existing typecheck/test/build/lint and Playwright Chromium/E2E steps.

- [ ] **Step 5: Update repo authority references after implementation exists**

Add to `AGENTS.md` Approved References:

```text
- Standard AutoEQ v2 design: `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`
- Standard AutoEQ v2 plan: `docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md`
```

Do not duplicate generic Efficient Workflow rules into AGENTS.

- [ ] **Step 6: Review the directed implementation diff before global gates**

Run:

```bash
git status --short
git diff --check
git diff --stat 00916b5bc32bbf18bc07920ae9f195526fc5a595...HEAD
git diff 00916b5bc32bbf18bc07920ae9f195526fc5a595...HEAD -- \
  packages/core/src/autoeq \
  packages/core/src/config/autoeqSettings.ts \
  packages/core/benchmarks \
  apps/web/src/session \
  apps/web/src/state \
  apps/web/src/workers \
  apps/web/src/features/filters/AutoEqSettings.tsx \
  apps/web/e2e/workbench.spec.ts \
  .github/workflows/ci.yml
```

Expected: no unrelated files, no whitespace errors, v1 numerical modules changed only where Task 1 compatibility required and with frozen benchmark proof.

- [ ] **Step 7: Run the one final local global gate pass**

Run once after the diff is stable:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/web e2e
```

Expected: all PASS. If a gate fails, fix the cause, rerun the failed gate + directly affected focused tests first, and rerun the whole chain only if the correction plausibly affects other global gates.

- [ ] **Step 8: Perform the required real-world manual smoke test without committing private curves**

Use at least one difficult imported FR/Target pair representative of dense mid/treble behavior and verify:

```text
- visibly closer adherence through mids and treble than v1/problem case
- no special high-frequency relaxation
- final filters <= selected Max Filters
- 5/15/30/60/120 selector behaves as a budget selector
- difficult default-30 s run does not continue past the cooperative budget by more than one bounded primitive
- increasing Time Limit can allow an otherwise unfinished case to reach 0.25/0.75
- Cancel remains immediate/no-partial-apply
- export/import/session/graph behavior has no regression
```

Record only pass/fail observations and non-sensitive metrics; do not commit the source curves.

- [ ] **Step 9: Commit closeout plumbing and documentation**

After all local/holdout/manual evidence is available, change the v2 spec status from `approved design, pending written-spec review` to an implementation-closeout status that accurately reflects the evidence, then commit:

```bash
git add apps/web/e2e/workbench.spec.ts .github/workflows/ci.yml AGENTS.md \
  docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md
git commit -m "test: close Standard AutoEQ v2 integration"
```

- [ ] **Step 10: Push only when explicitly requested, then require exact-SHA CI success as final executable proof**

After push, verify GitHub Actions CI corresponds to the exact implementation HEAD SHA and every verify step passes, including both benchmarks and Playwright E2E. Do not merge/deploy/release unless separately requested.

---

## Plan Self-Review Checklist

Before execution, the implementer should confirm this plan still matches the approved spec at its pinned path. During plan authoring this checklist was applied:

- Spec coverage: settings/version boundary, precision ranking, candidates, cache, hybrid paths, working cap, joint refine, monotonic deliverable, compression, quantization, runtime/timeout, termination reasons, manifest v3, session v2 migration, signature/staleness, benchmark corpus, performance evidence, web integration, E2E, CI, and real-world validation are each mapped to an explicit task.
- Placeholder scan: no task depends on `TBD`, `TODO`, “similar to Task N”, or unspecified future behavior.
- Type consistency: v1 uses `AutoEqSettingsV1`/`StandardAutoEqInputV1`/`AutoEqResultV1`; product v2 uses `AutoEqSettings`/`StandardAutoEqInputV2`/`AutoEqResultV2`; `RunManifest` is the v1|v2 union.
- Workflow efficiency: focused-first tests, one final global pass, single-agent default, explicit coherent session boundaries, holdout only after constants stabilize, no repeated v1/v2 full benchmarks after every micro-change.

## OpenCode Execution Contract

Use this plan and the approved spec as durable context. Do **not** paste their contents into the execution prompt or repeatedly summarize them.

Execution rules:

```text
1. Read AGENTS.md, this plan, and only the spec sections required for the current task.
2. Execute tasks in order with TDD/focused tests.
3. Use one agent by default; no nested subagents; max two concurrent only if genuinely independent.
4. Preserve unrelated WIP; do not reset/clean/stash/overwrite.
5. Do not retune frozen v1 or approved v2 constants without stopping for approval.
6. Do not run global gates repeatedly; focused-first, global-once.
7. Commit at the coherent task boundaries listed above.
8. Stop on a material spec contradiction, benchmark impossibility under approved constants, or unexpected v1 drift and report evidence compactly.
9. Do not merge/deploy/release/publish.
10. Final response format:

Status: PASS | BLOCKED
SHA: <head sha>

Changes:
- 1–5 concise bullets

Verification:
- focused tests used during implementation
- final root gates
- v1 benchmark
- v2 benchmark + holdout
- E2E
- exact-SHA CI status if pushed

Notes:
- only real limitations, manual-validation needs, or blockers
```
