# AutoEQ Workbench — Standard AutoEQ v2 Design

**Status:** approved design, pending written-spec review  
**Date:** 2026-08-29  
**Branch:** `remake/squiglink-base`  
**Baseline:** `3975792b03dde9496e8c87f87e361945dba13a65`

## 1. Authority and scope

This document is the authoritative behavioral and architectural design for **Standard AutoEQ v2**.

Read it together with:

- `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`;
- `docs/superpowers/plans/2026-08-25-autoeq-standard-v1.md`;
- `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`;
- `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`.

Where this design conflicts with Standard v1 behavior for the **new algorithm only**, this design wins. `standard-v1` itself remains frozen and must not be silently retuned or rewritten.

The product goal is to replace the current UI execution path with a more accurate and substantially more efficient **Standard v2** optimizer while preserving the existing local-only Worker architecture and the existing Equalizer workflow.

The three priorities, in order, are:

1. **precision** — make the delivered EQ adhere to the requested Target across the effective fit interval, including mids and treble;
2. **filter efficiency** — use the smallest practical delivered cascade without sacrificing the required precision;
3. **speed** — avoid the combinatorial cost pattern that can make difficult real-world runs take tens of seconds or longer.

Standard v2 is a new versioned algorithm. It is not an in-place mutation of Standard v1.

### 1.1 User-visible target

For a final quantized deliverable, Standard v2 considers the fit target achieved only when both are true:

```text
RMSE   <= 0.25 dB
maxAbs <= 0.75 dB
```

There is no special treble relaxation. Within the effective fit interval, frequencies are treated uniformly on the canonical logarithmic grid. With default settings the interval is the full Workbench domain, 20 Hz–20 kHz.

### 1.2 Explicitly out of scope

Standard v2 does **not** include:

- new filter types beyond PK/LS/HS;
- frequency-dependent treble de-weighting;
- a v1/v2 selector in the product UI;
- fake percentage progress;
- a visible precision/timeout warning badge;
- new export destinations;
- changes to graph appearance or graph series;
- cloud/server optimization;
- WASM as a requirement;
- changes to the frozen `standard-v1` numerical contract;
- widening existing product hard bounds for frequency, gain, Q, or delivered filter count.

## 2. Product integration rule

The existing AutoEQ button remains the sole user entry point. The product UI runs **Standard v2** by default after this work lands.

The historical core entry point remains available for reproducibility:

```ts
runStandardAutoEq(input)   // frozen standard-v1
runStandardAutoEqV2(input) // new standard-v2
```

The browser Worker must call `runStandardAutoEqV2()` explicitly. Do not alias or redefine `runStandardAutoEq()` to mean v2.

The existing Worker/client/controller responsibilities remain unchanged:

```text
immutable run-input capture
        ↓
disposable Web Worker
        ↓
standard-v2 core engine
        ↓
runId / input-signature guard
        ↓
atomic workspace apply
```

React, Zustand, Worker code, and export code do not become numerical authorities.

## 3. Existing hard product bounds remain authoritative

Standard v2 continues to use the existing Workbench product bounds:

```text
sample rate:           48,000 Hz
Workbench domain:      20–20,000 Hz
fit grid density:      96 points/octave
filter gain:           -15..+15 dB
PK Q:                  0.1..12
shelf Q:               0.7
default Max Filters:   10
hard Max Filters:      64
```

The user's effective `minFrequencyHz`, `maxFrequencyHz`, `minGainDb`, `maxGainDb`, `minQ`, `maxQ`, and `maxFilters` remain hard constraints on the delivered result.

A valid setting may narrow an envelope but never widen beyond product limits.

## 4. AutoEqSettings v2 and Time Limit

Standard v2 extends the settings contract with a discrete runtime budget:

```ts
export type AutoEqTimeLimitSeconds = 5 | 15 | 30 | 60 | 120

export interface AutoEqSettings {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  maxFilters: number
  timeLimitSeconds: AutoEqTimeLimitSeconds
}
```

The default is:

```text
timeLimitSeconds = 30
```

Only the five approved values are valid. Arbitrary numeric timeout values are rejected rather than clamped.

`timeLimitSeconds` is part of:

- the captured run input;
- AutoEQ settings validation;
- the input signature used to reject obsolete results;
- session persistence;
- the Standard v2 run manifest.

Changing Time Limit after a run is a relevant settings change and therefore makes the existing AutoEQ result stale under the same rules as other relevant AutoEQ setting changes.

### 4.1 UI

Add one compact row below `Max Filters` in `AutoEQ Settings`:

```text
Time Limit       [30 s ▾]
```

Use a native/select-style control consistent with the existing export-format selector used for Equalizer APO / Poweramp / Wavelet.

Options, in order:

```text
5 s
15 s
30 s
60 s
120 s
```

Do not add a second AutoEQ settings surface.

## 5. Precision model

### 5.1 Evaluation grid

Prepare source and target using the existing normalization and canonical 96-points-per-octave logarithmic grid.

Desired correction remains:

```text
desired(f) = target(f) - source(f)
```

Evaluate fit on the subset satisfying the user's effective frequency interval:

```text
minFrequencyHz <= f <= maxFrequencyHz
```

All fit-grid samples inside that interval carry equal weight. Standard v2 does not down-weight higher frequencies merely because they are high frequencies.

### 5.2 Target envelope

The final delivered solution is target-achieved iff:

```ts
metrics.rmseDb <= 0.25 && metrics.maxAbsDb <= 0.75
```

These metrics are computed from the **final quantized, discretely refined, delivered cascade**, not from a continuous intermediate solution.

The thresholds are sufficient. Once a deliverable inside the envelope has been found and compressed successfully, the optimizer does not spend remaining runtime chasing smaller RMSE/maxAbs values for their own sake.

### 5.3 Ranking solutions outside the target envelope

While a solution is outside the target envelope, its primary normalized violation is:

```text
violation = max(
  rmseDb / 0.25,
  maxAbsDb / 0.75
)
```

Lower is better.

This prevents an excellent global average from hiding a bad local residual region.

For numerically meaningful ties, use this ordering:

1. lower normalized violation;
2. lower RMSE;
3. lower maxAbs;
4. lower cancellation severity/score;
5. lower filter aggressiveness;
6. lower filter count;
7. stable deterministic parameter/list ordering.

Filter count is therefore not allowed to trade away primary fit accuracy during the fit phase.

### 5.4 Aggressiveness tie-break

Aggressiveness is secondary only. It may prefer, among essentially equivalent fits:

- lower absolute gain;
- lower Q;
- fewer nearby opposite-sign cancellations.

It must not reject a materially more accurate solution merely to reduce Q, gain, cancellation score, or filter count while the target envelope has not been achieved.

## 6. Standard v2 architecture

Standard v2 uses a **deterministic hybrid residual search**:

```text
FR + Target
    ↓
prepared residual
    ↓
multi-scale feature detection
    ↓
PK / LS / HS seed generation
    ↓
cheap candidate scoring
    ↓
small exact shortlist
    ↓
main greedy path + bounded alternatives
    ↓
iterative joint cascade refinement
    ↓
final-cap compression
    ↓
quantization + discrete refinement
    ↓
final metrics / preamp / audit / manifest
```

The search is intentionally not a broad beam search and not a randomized global optimizer.

### 6.1 Determinism

Outside wall-clock timeout, identical numerical inputs, settings, and algorithm version must produce the exact same:

- filters;
- order and IDs;
- metrics;
- preamp;
- cancellation audit;
- manifest.

Search ordering, candidate ordering, tie-breaking, and refinement ordering are deterministic.

A wall-clock deadline is the only approved exception to strict cross-machine output identity: two machines may complete a different number of safe checkpoints before the same time limit. Timeout output is therefore **best-effort deterministic**.

Tests must use an injected deterministic clock so timeout behavior itself is reproducible under test.

## 7. Multi-scale candidate generation

Standard v1's single broad same-sign-region seed is not sufficient for v2. Standard v2 must identify local residual structure at multiple widths.

### 7.1 PK feature seeds

For material residual structure:

1. identify deterministic local extrema of the signed residual;
2. locate surrounding sign crossings and/or half-height boundaries where available;
3. estimate a characteristic bandwidth in log-frequency space;
4. seed frequency at the local residual extremum, clamped to the effective frequency envelope;
5. seed gain from the signed residual at the extremum, clamped to the effective gain envelope;
6. derive a base Q estimate from the feature width;
7. create a small deterministic family around that Q estimate to represent broader, nominal, and narrower interpretations.

The initial v2 family is:

```text
Q scale multipliers: 0.5, 1.0, 2.0
```

Each resulting Q is constrained to the user's effective PK-Q envelope.

Near-duplicate seeds must be deduplicated deterministically.

### 7.2 Edge/shelf seeds

LS and HS candidates use broad edge structure rather than fixed nominal frequencies only.

For each edge:

- require consistent signed residual evidence across a broad edge region;
- estimate shelf transition frequency from the residual transition geometry;
- use shelf Q = 0.7;
- seed gain from a robust signed statistic of the edge residual;
- clamp frequency and gain to the effective run envelope.

No excluded frequency may be inspected to justify a shelf outside the user's fit interval.

### 7.3 Candidate threshold

Candidate detection must remain sensitive below the final maxAbs target so the optimizer can close residuals before they become final failures.

The initial versioned detection floor is:

```text
candidateResidualFloorDb = 0.15
```

This is an algorithm parameter, not a UI setting.

## 8. Fast candidate scoring and response caching

Standard v2 must remove the v1 cost pattern of repeatedly rebuilding the complete cascade for every cheap trial.

The engine maintains:

- the current sum of per-filter dB responses on the fit grid;
- each accepted filter's individual fit-grid response;
- the current delivered/residual arrays;
- reusable candidate response buffers where beneficial.

When testing a coordinate change to one filter, update the cascade as:

```text
candidateCascade = currentCascade - oldFilterResponse + newFilterResponse
```

Do not recompute all unchanged filters for that trial.

### 8.1 Two-stage candidate evaluation

Each iteration uses two stages:

1. **cheap ranking** — estimate residual improvement using the candidate's standalone response against the current residual;
2. **exact shortlist** — only the best candidates enter complete-cascade refinement/evaluation.

The initial versioned exact shortlist cap is:

```text
maxExactCandidatesPerIteration = 8
```

Candidate ordering after scores are equal must remain deterministic.

## 9. Hybrid search and bounded alternatives

The primary search remains residual pursuit/greedy because it is efficient and naturally incremental.

Unlike v1, Standard v2 may preserve a very small number of alternate cascades when:

- candidate scores are materially close; or
- the main path stagnates outside the target envelope.

The branch width is fixed and bounded:

```text
maxActiveSearchPaths = 3
```

This means one main path plus at most two alternatives. Alternatives use the same deterministic candidate and refinement rules. There is no unbounded queue and no nested beam expansion.

When paths exceed the cap, retain the best paths according to the Standard v2 solution ranking and deterministic tie-breaks.

## 10. Working filter budget versus delivered Max Filters

`Max Filters` changes meaning from a v1 search ceiling to a **hard delivered-solution ceiling**.

The optimizer may temporarily use more filters internally to discover a better decomposition, but the user must never receive more than `settings.maxFilters`.

### 10.1 Working oversubscription cap

The internal working cap is deterministic:

```ts
workingMaxFilters = maxFilters === 0
  ? 0
  : min(
      AUTOEQ_PRODUCT_LIMITS.hardMaxFilters,
      maxFilters + max(4, ceil(maxFilters / 2)),
    )
```

Examples:

```text
Max Filters  5 → working cap  9
Max Filters 10 → working cap 15
Max Filters 20 → working cap 30
Max Filters 64 → working cap 64
```

This allows temporary over-completeness without allowing search size to grow without bound.

A `Max Filters` value of `0` still means the delivered and working solution both contain zero generated filters.

## 11. Iterative joint refinement

After an accepted candidate materially improves a path, refine the **whole cascade**, not only the newly added filter.

Use deterministic coordinate refinement with the established coarse-to-fine scales:

```ts
[
  { fcOctaveStep: 1 / 6,  gainStepDb: 1.0,  qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1,  qOctaveStep: 1 / 32 },
]
```

The difference from v1 is control flow: v2 cycles through coarse → medium → fine and may repeat the sequence while material improvement continues.

The initial hard cap is:

```text
maxJointRefinementCycles = 6
```

Stop refinement early when:

- a target-achieved deliverable has been established and the fit phase can transition to compression;
- a complete cycle makes no material improvement;
- the search path is dominated by another retained path;
- the runtime deadline has been reached.

For shelves, Q remains fixed at 0.7. For PK filters, Fc/gain/Q remain within the user's effective envelope.

## 12. Best deliverable checkpoint

The engine maintains two distinct concepts throughout the run:

```text
working solution
best deliverable checkpoint
```

The **working solution** may be continuous and may temporarily exceed `Max Filters` up to `workingMaxFilters`.

The **best deliverable checkpoint** must always be:

- at or below `Max Filters`;
- representable on the delivery/manual-entry grid;
- fully quantized;
- discretely refined;
- valid under all effective gain/Q/frequency constraints;
- fully scored with final-style metrics.

A valid zero-filter checkpoint exists from the beginning, so a timeout never leaves the engine without something valid to return.

The best deliverable checkpoint is monotonic according to the v2 solution ranking: later work may replace it only with an equal-or-better deliverable.

This monotonic checkpoint rule guarantees that increasing Time Limit cannot make the best available result worse, provided the longer run follows the same deterministic search prefix.

## 13. Precision-first compression

Once a working path can produce a delivered cascade inside the `0.25 / 0.75` target envelope, optimization switches from fit acquisition to filter compression.

Compression uses deterministic backward elimination:

1. estimate the impact of removing each delivered filter;
2. try the least-important removal first;
3. remove one filter;
4. jointly refit the remaining filters;
5. quantize and discrete-refine the reduced cascade;
6. keep the removal only when the reduced **delivered** result remains inside the target envelope;
7. repeat until no single-filter removal can remain inside the envelope.

If a simple removal loses the envelope, a short refit under the final cap may allow the remaining filters to absorb its work before the removal is rejected.

The final target-achieved cascade should therefore be **one-filter locally minimal**: no remaining single filter can be removed and re-refined while keeping the final delivered solution inside both target limits.

If the target envelope was never reached, compression still enforces `Max Filters` and retains the best deliverable available according to the normalized-violation ranking.

## 14. Quantization and discrete refinement

Standard v2 keeps the approved manual-entry delivery precision:

```ts
{
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1,
}
```

Projection remains constrained to:

```text
manual-entry grid ∩ effective user envelope
```

The v1 rule that an unrepresentable coordinate may cause that candidate filter to be omitted remains valid.

### 14.1 Iterative discrete refinement

V2 replaces the fixed two-pass discrete refinement with cyclic deterministic refinement.

For each adjustable coordinate, evaluate current and neighboring representable manual-grid values. Continue cycling while a full cycle produces a material improvement.

Do not start a new discrete cycle after the deadline.

Discrete refinement must never replace the current best delivered checkpoint with a worse result.

After discrete refinement:

- remove exact `0 dB` filters;
- sort deterministically;
- assign deterministic IDs `autoeq-1`, `autoeq-2`, ...;
- recompute metrics, preamp, and cancellation audit from the exact delivered list.

## 15. Runtime budget and timeout semantics

### 15.1 Deadline source

The core v2 runner accepts an injected monotonic clock dependency for testability:

```ts
interface StandardV2Runtime {
  nowMs(): number
}
```

Production uses a monotonic browser/JS runtime clock. Unit tests use a controlled fake clock.

The deadline is:

```text
startMs + timeLimitSeconds * 1000
```

The clock begins when the Worker starts executing the core algorithm, not when the user first clicks the button.

### 15.2 Cooperative hard timeout

The approved `Time Limit` is a hard optimizer budget with safe-checkpoint semantics.

The runner must check the deadline before starting each primitive expensive action, including:

- exact candidate evaluation;
- coordinate/refinement trial;
- new refinement cycle;
- compression removal/refit attempt;
- discrete-refinement trial/cycle.

Once the deadline has been reached, the engine must not start another expensive optimizer action. It returns the best complete deliverable checkpoint already available.

The currently executing primitive numerical evaluation may complete before the next check. Therefore wall-clock completion may exceed the selected limit only by one bounded primitive evaluation; the engine must never intentionally begin another iteration or phase after the deadline.

### 15.3 Timeout is not an error

Expiration returns a normal `AutoEqResult` with:

```text
terminationReason = time-limit
```

The UI applies it normally if the captured input signature still matches.

No timeout warning/banner/badge is added to normal product UI.

### 15.4 Cancel remains different

User Cancel:

- terminates the Worker;
- invalidates the run;
- applies no partial or timeout checkpoint;
- preserves the prior workspace solution and prior AutoEQ run record;
- is not treated as optimization failure.

## 16. Termination rules

Standard v2 terminates normally for one of three manifest reasons:

```ts
type StandardV2TerminationReason =
  | 'target-reached'
  | 'converged'
  | 'time-limit'
```

Use `target-reached` only when the final delivered checkpoint satisfies both precision thresholds and compression has reached one-filter local minimality, or no further safe compression attempt can be started before an already-reached deadline.

Use `converged` when the deterministic search/refinement has no material improvement path remaining before the time limit.

Use `time-limit` when the deadline prevents further search or required fit/compression work before normal convergence.

The manifest also records:

```ts
targetAchieved: boolean
```

This is diagnostic/provenance data. It is not a requirement to add visible UI status.

## 17. Preamp and cancellation audit

Preamp remains computed from the exact final delivered cascade using the existing dense full-band policy over the supported Workbench domain.

The final cancellation audit is likewise computed only from the exact final delivered filters after quantization, discrete refinement, zero-gain cleanup, and final sorting.

Cancellation is a secondary structural preference while fitting. It must not override a materially better fit outside the precision envelope.

## 18. Manifest versioning

Historical Standard v1 manifests remain valid and unchanged.

Define explicit versioned unions instead of widening the existing v1 interface in place:

```ts
type RunManifest = RunManifestV1 | RunManifestV2
```

### 18.1 RunManifestV1

`RunManifestV1` remains:

```text
schemaVersion = 2
algorithmVersion = standard-v1
```

Its historical settings shape remains the v1 shape and must not be retroactively given a Time Limit field.

### 18.2 RunManifestV2

Standard v2 uses:

```text
schemaVersion = 3
algorithmVersion = standard-v2
profile = Standard
```

It records at least:

```text
schemaVersion
algorithmVersion
profile
sampleRateHz
fitPointsPerOctave
AutoEqSettings including timeLimitSeconds
normalization
source name
target name
versioned Standard v2 algorithm parameters
final quantized filters
final metrics
preamp
final cancellation audit
terminationReason
targetAchieved
```

Do **not** store:

- wall-clock timestamp;
- random/browser runId;
- `elapsedMs`;
- machine identifier.

`elapsedMs` belongs to benchmarks/diagnostics, not the reproducible run manifest.

Names remain provenance only and do not become numerical input-signature data.

## 19. Session schema evolution

The Workbench session schema evolves explicitly from v1 to v2.

### 19.1 WorkbenchSessionV2

New session exports use:

```ts
interface WorkbenchSessionV2 {
  schemaVersion: 2
  curves: Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  filterProvenance: 'manual' | 'autoeq' | null
  solutionState: 'clean' | 'modified' | 'stale'
  autoEqRun: AutoEqRunRecord | null
}
```

The inclusion/exclusion policy for session state otherwise remains the approved Plan 3 policy.

### 19.2 Importing WorkbenchSessionV1

A valid v1 session migrates deterministically on import:

```text
old AutoEQ settings
      ↓
add timeLimitSeconds = 30
      ↓
WorkbenchSessionV2 in memory
```

Any historical `standard-v1` run manifest inside `autoEqRun` is preserved as `RunManifestV1`. Do not rewrite it to schema 3, do not inject a fake timeout, and do not relabel it as Standard v2.

After migration, any new session export uses schema 2.

Invalid sessions remain non-mutating failures under the existing parse/validate-then-apply rule.

## 20. Input signature and staleness

The Standard v2 input signature includes the same numerical authorities as before plus `timeLimitSeconds`:

- active FR identity and raw numerical points;
- active Target identity and raw numerical points;
- normalization;
- all effective AutoEQ settings, including Time Limit.

Names remain provenance only.

Theme, open tab, graph appearance, labels, smoothing, audio transport, Compare A/B, and unrelated UI state remain excluded.

A result is applied only if the current workspace signature still matches the signature captured at run start.

## 21. Benchmark design

The existing Standard v1 benchmark remains the frozen comparison baseline. Standard v2 adds a broader corpus and reports v1/v2 side by side where meaningful.

### 21.1 Known-solvable cases

Create deterministic synthetic/sanitized cases whose desired correction is generated from a known valid, quantized PK/LS/HS cascade within product constraints. The corpus must include:

- broad bass shelf plus midrange structure;
- alternating peaks/valleys in roughly 2–8 kHz;
- dense irregular structure in roughly 6–20 kHz;
- mixed broad and narrow features;
- partially overlapping filters;
- a case requiring close to the final `Max Filters` cap;
- quantization-sensitive features;
- a case where a larger working cascade must compress back under the final cap.

Because these cases have a known feasible delivered solution, failure to reach the precision envelope under a reasonable budget is optimizer evidence rather than proof of mathematical impossibility.

### 21.2 Adversarial/stress cases

Add cases designed to create many residual extrema and candidate conflicts, especially in mids and treble. These cases need not have a known perfect solution.

They verify:

- bounded runtime;
- stability;
- valid timeout result;
- candidate-count control;
- quality of the best checkpoint under pressure.

### 21.3 Holdout cases

Reserve part of the synthetic corpus as holdout validation. Internal algorithm constants may not be tuned by repeatedly targeting only the holdout outputs.

The holdout is used to detect overfitting to the development fixtures.

## 22. Benchmark metrics

For every benchmark case record at least:

```text
algorithmVersion
elapsedMs
terminationReason
targetAchieved
maeDb
rmseDb
maxAbsDb
filterCount
maxQ
maxFilterBoostDb
preampDb
moderateCancellations
strongCancellations
final filters
```

Benchmark runtime is diagnostic evidence and is intentionally separate from the reproducible manifest.

## 23. Acceptance gates

### 23.1 Correctness

For every known-solvable case that is configured with sufficient final `Max Filters` and budget, the delivered result must satisfy:

```text
RMSE   <= 0.25 dB
maxAbs <= 0.75 dB
```

The result used for the assertion must already be quantized, discretely refined, and at/below final `Max Filters`.

### 23.2 Final cap

At every normal termination, including timeout:

```text
finalFilters.length <= settings.maxFilters
```

This invariant must hold independently of the larger internal working cap.

### 23.3 Determinism

For non-time-limited completion, repeated runs with identical numerical inputs/settings must produce identical numerical result and manifest content.

Timeout tests with an injected deterministic clock must likewise be exactly reproducible.

### 23.4 Monotonic Time Limit

For the same input and settings other than Time Limit, a longer budget must never replace the best deliverable checkpoint with a worse one according to the Standard v2 ranking.

The search strategy itself must not change because the selected timeout is larger; the timeout controls how long the same deterministic search prefix may continue.

### 23.5 Performance target

On the project reference benchmark environment at the default 30-second setting:

```text
typical cases: target <= 3 s
stress cases:  target <= 10 s
```

The hard user budget remains the selected `5 / 15 / 30 / 60 / 120 s` value.

Absolute timing may be reported rather than asserted in a flaky unit test when CI hardware variability makes a millisecond hard gate unreliable. The implementation may not claim the performance goal without benchmark evidence from a consistent reference environment.

### 23.6 No material regression on easy v1 successes

Cases where Standard v1 already comfortably satisfies the v2 target envelope must continue to satisfy the same envelope under Standard v2.

V2 is not required to produce numerically lower RMSE than v1 once both are already inside the approved envelope; after target achievement, filter compression and runtime are more relevant than chasing smaller residual metrics.

### 23.7 Filter efficiency

A final target-achieved v2 solution must be one-filter locally minimal under the approved compression procedure.

The benchmark must report filter count against v1, but lower filter count never justifies leaving the precision envelope.

## 24. Real-world validation

Synthetic benchmarks are necessary but not sufficient.

Before Standard v2 is considered closed, perform manual product smoke tests with real imported FR/Target pairs, including at least one difficult pair that produces dense mid/treble residual structure and is representative of the long-running behavior observed in actual use.

These private/user-provided curves do not need to be committed to the repository. Repository fixtures remain synthetic or sanitized.

Manual validation should confirm:

- visibly closer adherence through mids and treble;
- no unexpected high-frequency relaxation;
- sensible filter count;
- selected Time Limit behavior;
- responsive Cancel;
- no result above `Max Filters`;
- no regression in import/export or graph integration.

## 25. Testing strategy

Implementation must be test-driven at the numerical boundaries.

Core tests must cover at least:

- v1 remains unchanged and callable;
- v2 config/settings validation;
- allowed Time Limit values and default 30 s;
- multi-scale deterministic candidate generation;
- candidate deduplication and ordering;
- response-cache equivalence to full cascade recomputation;
- exact shortlist cap;
- bounded search-path width;
- iterative joint refinement monotonicity;
- working oversubscription cap formula;
- final `Max Filters` invariant;
- best-deliverable monotonicity;
- target-envelope detection from delivered metrics;
- backward-elimination compression;
- one-filter local minimality for target-achieved solutions;
- quantization and cyclic discrete refinement;
- timeout at safe checkpoints with fake clock;
- `target-reached`, `converged`, and `time-limit` manifest reasons;
- manifest schema 2 v1 compatibility and schema 3 v2 validation;
- Workbench Session v1 → v2 migration;
- `timeLimitSeconds` in signatures/staleness;
- deterministic final IDs/order.

Web tests must cover at least:

- Time Limit selector renders exactly `5/15/30/60/120 s`;
- 30 s is default;
- settings changes flow into captured Worker input;
- timeout result applies normally;
- Cancel still applies nothing partial;
- obsolete result rejection still works;
- old session import migrates to 30 s;
- new session export uses schema 2;
- historical Standard v1 provenance survives session migration;
- the UI does not add a v1/v2 selector or timeout warning.

Relevant browser E2E must cover the real AutoEQ run flow and session round-trip.

## 26. CI and verification

The implementation is not complete until the exact implementation SHA passes the repository gates.

At minimum:

```text
focused core tests
focused web tests
pnpm test
pnpm typecheck
pnpm build
pnpm lint
Standard v1 benchmark
Standard v2 benchmark
relevant Playwright E2E
git diff --check
exact-SHA CI success
```

Visual/manual validation is required only where the acceptance criteria are visual or real-data product smoke tests.

## 27. Implementation boundaries

Prefer focused v2 modules under `packages/core/src/autoeq/` rather than turning existing v1 files into mixed-version conditionals.

Shared numerical primitives may be reused only when their behavior is genuinely version-neutral. Anything whose behavior is part of Standard v1's frozen numerical contract must not be modified in a way that changes v1 output.

Recommended separation is conceptually:

```text
autoeq/
  v1 or existing frozen modules
  v2/
    config
    score/ranking
    candidates
    response cache
    search paths
    refine
    deliverable/compress
    discrete refine
    runtime/deadline
    runStandardAutoEqV2
```

Exact filenames are an implementation-plan concern, but version boundaries must remain explicit.

## 28. Final approved behavior summary

Standard v2 is the product-default AutoEQ algorithm while Standard v1 remains frozen and reproducible.

The v2 engine:

- treats the effective logarithmic fit interval uniformly, including treble;
- seeks a delivered `RMSE <= 0.25 dB` and `maxAbs <= 0.75 dB`;
- does not trade primary precision for filter count during fit acquisition;
- uses deterministic multi-scale residual candidates;
- uses cached response updates and cheap candidate triage for speed;
- follows a greedy main path with at most two bounded alternatives;
- repeatedly jointly refines the whole cascade;
- may temporarily exceed the user's final Max Filters under a deterministic working cap;
- compresses precision-first back to the user's hard delivered cap;
- evaluates success only on the final quantized/discretely-refined deliverable;
- keeps a monotonic valid deliverable checkpoint throughout the run;
- exposes a compact `5 / 15 / 30 / 60 / 120 s` Time Limit selector, default 30 s;
- returns the best valid checkpoint on timeout without a new UI warning;
- keeps Cancel destructive only to the Worker, never to the prior workspace solution;
- records versioned diagnostic provenance without timestamps or elapsed wall time;
- migrates old Workbench Session v1 files deterministically to Session v2 with a 30 s default;
- validates against known-solvable, adversarial, holdout, and real-world smoke cases before closeout.
