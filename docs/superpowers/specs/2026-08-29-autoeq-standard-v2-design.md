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

The product goal is to replace the current UI execution path with a more accurate and substantially more efficient Standard v2 optimizer while preserving the existing local-only Worker architecture and Equalizer workflow.

Priorities, in order:

1. **precision** — adhere to the requested Target across the effective fit interval, including mids and treble;
2. **filter efficiency** — minimize the delivered cascade without sacrificing required precision;
3. **speed** — remove the v1 cost pattern that can make difficult real-world runs take tens of seconds or longer.

### 1.1 Final precision target

A final quantized deliverable is target-achieved only when both are true:

```text
RMSE   <= 0.25 dB
maxAbs <= 0.75 dB
```

There is no special treble relaxation. Within the effective fit interval, samples are treated uniformly on the canonical logarithmic grid. With default settings the interval is the full Workbench domain, 20 Hz–20 kHz.

### 1.2 Explicitly out of scope

Standard v2 does not add:

- filter types beyond PK/LS/HS;
- frequency-dependent treble de-weighting;
- a v1/v2 UI selector;
- fake percentage progress;
- visible precision/timeout warning badges;
- new export destinations;
- graph-series or graph-appearance changes;
- cloud/server optimization;
- WASM as a requirement;
- wider frequency/gain/Q/filter-count product bounds;
- any numerical change to frozen `standard-v1`.

## 2. Product integration and version boundary

The existing AutoEQ button remains the sole entry point. After this work lands, the product runs Standard v2 by default.

The historical core entry point remains frozen:

```ts
runStandardAutoEq(input)   // standard-v1
runStandardAutoEqV2(input) // standard-v2
```

The Worker calls `runStandardAutoEqV2()` explicitly. Do not alias or redefine `runStandardAutoEq()` to mean v2.

The existing browser lifecycle remains:

```text
immutable run-input capture
        ↓
disposable Web Worker
        ↓
standard-v2 core engine
        ↓
runId + input-signature guard
        ↓
atomic workspace apply
```

`packages/core` remains the sole numerical authority. React, Zustand, Worker orchestration, and export code do not contain alternate optimization formulas.

## 3. Existing product constraints

Standard v2 preserves the approved Workbench bounds:

```text
sample rate:           48,000 Hz
Workbench domain:      20–20,000 Hz
fit density:           96 points/octave
filter gain:           -15..+15 dB
PK Q:                  0.1..12
shelf Q:               0.7
default Max Filters:   10
hard Max Filters:      64
```

The user's effective frequency, gain, Q, and final filter-count envelopes remain hard delivered-result constraints. Valid settings may narrow product bounds but never widen them.

## 4. AutoEqSettings v2 and Time Limit

Extend the settings contract with a discrete runtime budget:

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

Default:

```text
timeLimitSeconds = 30
```

Only `5 | 15 | 30 | 60 | 120` is valid. Arbitrary timeout numbers are rejected, not clamped.

`timeLimitSeconds` participates in settings validation, captured run input, input signature, session persistence, staleness, and the Standard v2 manifest.

### 4.1 UI

Add one compact row below `Max Filters` in `AutoEQ Settings`:

```text
Time Limit       [30 s ▾]
```

Use the same native/select-style visual vocabulary as the existing Equalizer APO / Poweramp / Wavelet export selector. Options, in order, are `5 s`, `15 s`, `30 s`, `60 s`, `120 s`.

Do not create a second AutoEQ settings surface.

## 5. Precision and solution ranking

Prepare source and target with the existing normalization on the canonical 96-ppo logarithmic grid.

Desired correction remains:

```text
desired(f) = target(f) - source(f)
```

Fit samples satisfy:

```text
minFrequencyHz <= f <= maxFrequencyHz
```

All fit samples in that interval carry equal weight.

### 5.1 Target envelope

Target achievement is evaluated only from the exact final delivered cascade:

```ts
metrics.rmseDb <= 0.25 && metrics.maxAbsDb <= 0.75
```

A continuous or over-budget working solution does not count as success.

The thresholds are sufficient. Once a delivered solution is inside the envelope and compression is complete, the optimizer does not spend remaining runtime pursuing lower RMSE/maxAbs for their own sake.

### 5.2 Ranking outside the envelope

Primary normalized violation is:

```text
violation = max(rmseDb / 0.25, maxAbsDb / 0.75)
```

Lower is better. This prevents low average error from hiding a bad local region.

The deterministic comparison tuple is:

1. lower normalized violation;
2. lower RMSE;
3. lower maxAbs;
4. lower cancellation `totalScore`;
5. lower maximum Q;
6. lower maximum absolute filter gain;
7. lower sum of absolute filter gains;
8. lower filter count;
9. deterministic parameter/list ordering.

Filter count and aggressiveness are therefore secondary. They cannot trade away materially better fit while the target envelope is unmet.

## 6. Core architecture: deterministic hybrid residual search

Standard v2 uses:

```text
FR + Target
    ↓
prepared residual
    ↓
multi-scale feature detection
    ↓
PK / LS / HS seeds
    ↓
cheap candidate scoring
    ↓
small exact shortlist
    ↓
main greedy path + bounded alternatives
    ↓
iterative joint refinement
    ↓
final-cap compression
    ↓
quantization + cyclic discrete refinement
    ↓
final metrics / preamp / audit / manifest
```

It is not a broad beam search and not a randomized optimizer.

Outside wall-clock timeout, identical numerical inputs, settings, and algorithm version must produce identical filters, order/IDs, metrics, audit, preamp, and manifest.

The wall-clock deadline is the only approved exception to strict cross-machine identity because different machines may finish a different number of safe checkpoints. Timeout output is best-effort deterministic. Tests inject a controlled clock so timeout behavior is exactly reproducible in tests.

## 7. Versioned v2 search constants

The initial Standard v2 search contract includes:

```text
targetRmseDb                    0.25
targetMaxAbsDb                  0.75
candidateResidualFloorDb        0.15
PK Q scale multipliers          0.5, 1.0, 2.0
maxExactCandidatesPerIteration  8
maxActiveSearchPaths            3
alternateRetentionRatio         1.02
maxJointRefinementCycles         6
```

`alternateRetentionRatio = 1.02` means an alternate candidate/path may be retained only when its primary normalized violation is no worse than 2% above the current best at that branch point, or when it is the best deterministic escape from an otherwise stagnant main path. At most three active paths exist at once.

These values are versioned Standard v2 behavior. Any later tuning after v2 closeout requires a new approved algorithm version or an explicit spec amendment before closeout.

## 8. Multi-scale candidate generation

### 8.1 PK seeds

For material signed residual structure:

1. find deterministic local extrema;
2. locate surrounding sign crossings and/or half-height boundaries when available;
3. estimate characteristic bandwidth in log-frequency space;
4. seed Fc at the local extremum, clamped to the effective frequency envelope;
5. seed gain from the signed residual at Fc, clamped to the effective gain envelope;
6. derive a base Q from feature width;
7. create Q variants at `0.5×`, `1×`, and `2×` base Q, constrained to the effective PK-Q envelope;
8. deduplicate near-equivalent seeds deterministically.

The `0.15 dB` candidate floor is deliberately below the final `0.75 dB` maxAbs target so refinement can close residual structure before it becomes a final failure.

### 8.2 Shelf seeds

LS/HS candidates use broad edge evidence rather than only fixed nominal frequencies:

- require consistent signed residual evidence across a broad edge region;
- estimate transition frequency from residual geometry;
- use Q `0.7`;
- seed gain from a robust signed statistic of the edge residual;
- constrain Fc/gain to the effective run envelope.

Excluded frequencies cannot justify a shelf outside the user's fit interval.

## 9. Response caching and two-stage candidate evaluation

V2 must not rebuild unchanged filter responses for every trial.

Maintain the current sum of per-filter dB responses and individual accepted-filter responses on the fit grid. A one-filter coordinate trial updates the cascade as:

```text
candidateCascade = currentCascade - oldFilterResponse + newFilterResponse
```

Each search iteration has two stages:

1. cheap candidate ranking against the current residual;
2. exact whole-cascade evaluation/refinement only for the best eight candidates.

Equal cheap scores resolve by stable frequency/type/parameter ordering.

## 10. Hybrid search and bounded alternatives

The main path is deterministic residual pursuit/greedy search.

When alternatives fall within `alternateRetentionRatio` or the main path stagnates outside the envelope, retain deterministic alternate cascades, but never more than:

```text
maxActiveSearchPaths = 3
```

That is one main path plus at most two alternatives. There is no unbounded queue or nested beam expansion.

When pruning paths back to the cap, use the solution-ranking tuple from Section 5.

## 11. Working budget versus delivered Max Filters

`Max Filters` is a **hard delivered-solution ceiling**, not necessarily the internal working ceiling.

Internal working cap:

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

`Max Filters = 0` means both working and delivered generated-filter counts are zero.

The user must never receive more filters than `settings.maxFilters`.

## 12. Iterative joint refinement

After an accepted candidate materially improves a retained path, refine the entire cascade, not only the new filter.

Use the established deterministic scales:

```ts
[
  { fcOctaveStep: 1 / 6,  gainStepDb: 1.0,  qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1,  qOctaveStep: 1 / 32 },
]
```

Unlike v1's one fixed sequence, v2 may repeat coarse → medium → fine for up to six joint cycles while the ranking tuple improves.

A cycle stops/restarts only at deterministic boundaries. Stop early when a full cycle yields no better tuple, the path is dominated/pruned, or the runtime deadline is reached.

Shelves keep Q `0.7`. PK Fc/gain/Q remain inside the effective user envelope.

## 13. Monotonic best-deliverable checkpoint

The engine maintains two concepts:

```text
working solution
best deliverable checkpoint
```

The working solution may be continuous and may contain up to `workingMaxFilters`.

The best deliverable checkpoint must always be:

- at/below `Max Filters`;
- representable on the delivery/manual-entry grid;
- fully quantized;
- discretely refined;
- valid under all effective constraints;
- fully scored with final-style metrics.

A zero-filter checkpoint exists from the start, so timeout always has a valid result.

The checkpoint is monotonic: replace it only with an equal-or-better deliverable according to Section 5. A longer Time Limit follows the same deterministic search prefix and therefore cannot make the best available deliverable worse.

## 14. Precision-first compression

Once a working path can produce a delivered cascade inside `0.25 / 0.75`, fit acquisition gives way to compression.

Compression uses deterministic backward elimination:

1. estimate removal impact for each delivered filter;
2. test least-important removals first;
3. remove one filter;
4. jointly refit the remainder;
5. quantize and discrete-refine the reduced cascade;
6. keep removal only if the reduced delivered result remains inside both precision limits;
7. repeat until no remaining single filter can be removed and re-refined while preserving the envelope.

A normally completed `target-reached` result is therefore **one-filter locally minimal**.

If a simple removal loses the envelope, a bounded refit of the remaining filters may absorb the removed filter's work before the removal is rejected.

If the envelope is never reached, final-cap compression still produces the best valid deliverable according to Section 5.

## 15. Quantization and cyclic discrete refinement

Keep the approved delivery precision:

```ts
{
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1,
}
```

Projection remains:

```text
manual-entry grid ∩ effective user envelope
```

An unrepresentable required coordinate may omit that candidate filter under the existing rule.

V2 replaces fixed two-pass discrete refinement with deterministic cyclic refinement. For each coordinate, test current and neighboring representable grid values. Continue while a complete cycle improves the ranking tuple and the deadline allows another cycle.

Never replace the current best deliverable checkpoint with a worse result.

After discrete refinement, remove exact `0 dB` filters, sort deterministically, assign `autoeq-1`, `autoeq-2`, …, and recompute metrics, preamp, and cancellation audit from the exact delivered list.

## 16. Runtime budget and timeout

The v2 runner accepts an injectable monotonic clock:

```ts
interface StandardV2Runtime {
  nowMs(): number
}
```

Production uses a monotonic JS runtime clock; tests use a controlled fake clock.

Deadline:

```text
startMs + timeLimitSeconds * 1000
```

The clock starts when the Worker starts executing the core algorithm.

### 16.1 Cooperative hard budget

Check the deadline before starting each primitive expensive action, including exact candidate evaluation, coordinate trial, new refinement cycle, compression/refit attempt, and discrete-refinement trial/cycle.

Once the deadline is reached, start no further expensive optimizer action. Return the best complete deliverable checkpoint already available.

A primitive already executing may finish before the next check, so wall-clock completion may exceed the selected limit only by one bounded primitive evaluation. No new iteration/phase begins after deadline.

### 16.2 Timeout is a normal result

Timeout returns a normal `AutoEqResult` with `terminationReason = 'time-limit'`. If the input signature still matches, the UI applies it normally. No timeout warning/banner/badge is added.

### 16.3 Cancel remains distinct

User Cancel terminates the Worker, invalidates the run, applies no partial checkpoint, preserves the prior workspace solution/run record, and is not an optimization failure.

## 17. Termination reasons

Standard v2 records exactly one:

```ts
type StandardV2TerminationReason =
  | 'target-reached'
  | 'converged'
  | 'time-limit'
```

Use `target-reached` only when the final delivered checkpoint satisfies both precision thresholds **and** compression has completed one-filter local-minimality checking before the deadline.

Use `converged` when deterministic search/refinement has no improving path remaining before the deadline.

Use `time-limit` whenever the deadline prevents further required fit or compression work. A timeout result may still have `targetAchieved = true` if its best delivered checkpoint already lies inside the precision envelope; it simply means compression/convergence was not fully completed before time expired.

The manifest records:

```ts
targetAchieved: boolean
```

This is diagnostic provenance only; no new visible status is required.

## 18. Preamp and cancellation

Preamp remains computed from the exact final delivered cascade using the existing dense full-band Workbench policy.

The final cancellation audit is also recomputed from the exact final delivered filters after quantization, discrete refinement, zero-gain cleanup, and sorting.

Cancellation is a secondary preference and cannot override materially better fit while the target envelope is unmet.

## 19. Manifest versioning

Historical v1 manifests remain unchanged. Define explicit unions:

```ts
type RunManifest = RunManifestV1 | RunManifestV2
```

`RunManifestV1` remains:

```text
schemaVersion = 2
algorithmVersion = standard-v1
```

Its historical settings shape remains the v1 shape without Time Limit.

`RunManifestV2` uses:

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

Do not persist timestamps, random/browser run IDs, `elapsedMs`, or machine identifiers. Runtime belongs to benchmarks, not the reproducible manifest.

Names remain provenance only, not numerical signature data.

## 20. Workbench Session v2 migration

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

The previously approved include/exclude policy for session state otherwise remains unchanged.

A valid Workbench Session v1 migrates deterministically:

```text
v1 settings
   ↓
add timeLimitSeconds = 30
   ↓
WorkbenchSessionV2 in memory
```

Any embedded historical `standard-v1` run manifest stays a `RunManifestV1`. Do not inject a fake timeout, rewrite its schema, or relabel its algorithm.

After migration, new exports use session schema 2. Invalid imports remain fully non-mutating.

## 21. Input signature and staleness

The v2 input signature includes active FR/Target IDs and numerical raw points, normalization, and every effective AutoEQ setting including `timeLimitSeconds`.

Names remain provenance only. Theme, tab, graph appearance, labels, smoothing, audio transport, Compare A/B, and unrelated UI state remain excluded.

Changing Time Limit after a run therefore makes the prior AutoEQ result stale under the existing relevant-settings rule.

## 22. Benchmark corpus

The frozen Standard v1 benchmark remains the comparison baseline. V2 adds a broader deterministic corpus.

### 22.1 Known-solvable cases

Create synthetic/sanitized cases whose desired correction comes from a known valid quantized PK/LS/HS cascade within product constraints. Include:

- broad bass plus midrange structure;
- alternating peaks/valleys around 2–8 kHz;
- dense irregular structure around 6–20 kHz;
- mixed broad/narrow features;
- partially overlapping filters;
- a case close to final `Max Filters`;
- quantization-sensitive structure;
- a case requiring an over-complete working cascade before final-cap compression.

These cases must reach the precision envelope with sufficient `Max Filters` under the default 30-second budget.

### 22.2 Adversarial/stress cases

Add deterministic cases with many residual extrema/candidate conflicts, especially in mids and treble. They need not have a known perfect solution. They verify bounded runtime, stability, valid timeout delivery, candidate-count control, and checkpoint quality.

### 22.3 Holdout

Reserve part of the synthetic corpus as holdout validation. Do not repeatedly tune algorithm constants against holdout outputs. Use holdout to detect fixture overfitting before closeout.

## 23. Benchmark output and acceptance gates

Record at least:

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

Acceptance:

- known-solvable cases with adequate `Max Filters` pass `RMSE <= 0.25` and `maxAbs <= 0.75` at the default 30 s;
- every normal result, including timeout, satisfies `finalFilters.length <= settings.maxFilters`;
- non-time-limited repeated runs are exactly reproducible;
- fake-clock timeout runs are exactly reproducible;
- longer Time Limit never produces a worse best-deliverable checkpoint than a shorter prefix-equivalent run;
- cases where v1 already comfortably passes the v2 envelope also pass it under v2;
- a normally completed `target-reached` result is one-filter locally minimal;
- lower filter count never justifies leaving the precision envelope.

### 23.1 Performance target

On a consistent project reference benchmark environment with default 30 s:

```text
typical cases: <= 3 s target
stress cases:  <= 10 s target
```

The selected `5 / 15 / 30 / 60 / 120 s` value remains the hard optimizer budget.

Because shared CI timing can vary, absolute millisecond targets may be reported rather than encoded as flaky unit-test assertions. The implementation may not claim the performance target without evidence from a consistent reference environment.

## 24. Real-world validation

Synthetic benchmarks are necessary but not sufficient. Before closeout, manually smoke-test real imported FR/Target pairs, including at least one difficult pair representative of the long-running, dense mid/treble behavior observed in actual use.

Private/user-provided curves need not be committed. Repository fixtures remain synthetic or sanitized.

Manual validation must confirm closer mid/treble adherence, no high-frequency relaxation, sensible filter count, correct Time Limit behavior, responsive Cancel, no result above Max Filters, and no import/export/graph regression.

## 25. Testing strategy

Core tests cover at least:

- frozen v1 behavior remains callable and unchanged;
- v2 settings validation and exact Time Limit domain/default;
- deterministic multi-scale candidate generation/dedup/order;
- response-cache equivalence to full-cascade recomputation;
- exact shortlist cap `8`;
- active search-path cap `3` and 2% alternate-retention rule;
- iterative joint-refinement monotonicity and six-cycle cap;
- working oversubscription formula;
- final Max Filters invariant;
- monotonic best-deliverable checkpoint;
- target-envelope detection from delivered metrics;
- backward elimination and one-filter local minimality;
- quantization and cyclic discrete refinement;
- fake-clock timeout checkpoints;
- all three termination reasons plus `targetAchieved`;
- RunManifestV1 schema 2 compatibility and RunManifestV2 schema 3 validation;
- Workbench Session v1 → v2 migration;
- Time Limit in signatures/staleness;
- deterministic final IDs/order.

Web tests cover at least:

- Time Limit selector exactly `5/15/30/60/120 s`;
- 30 s default;
- setting captured into Worker input;
- timeout result applies normally;
- Cancel still applies nothing partial;
- obsolete-result rejection still works;
- old session import migrates to 30 s;
- new session export uses schema 2;
- historical v1 provenance survives migration;
- no v1/v2 selector or timeout warning is added.

Relevant Playwright E2E covers the real AutoEQ run flow and session round-trip.

## 26. CI and verification

Implementation is not complete until the exact implementation SHA passes repository gates. At minimum:

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

Visual/manual validation is required where acceptance is visual or based on real-data smoke testing.

## 27. Implementation boundaries

Prefer focused v2 modules under `packages/core/src/autoeq/` instead of mixing version branches throughout frozen v1 files.

Shared numerical primitives may be reused only when behavior is genuinely version-neutral. Any behavior that participates in the frozen v1 numerical contract must remain output-stable.

Conceptual separation:

```text
autoeq/
  existing/frozen v1 modules
  v2/
    config
    ranking
    candidates
    response cache
    search paths
    joint refine
    deliverable/compress
    discrete refine
    runtime/deadline
    runStandardAutoEqV2
```

Exact filenames are an implementation-plan decision; the version boundary is not.

## 28. Final approved behavior

Standard v2 becomes the product-default AutoEQ while Standard v1 remains frozen and reproducible.

V2:

- treats the effective logarithmic fit interval uniformly, including treble;
- seeks delivered `RMSE <= 0.25 dB` and `maxAbs <= 0.75 dB`;
- does not trade primary precision for filter count during fit acquisition;
- uses deterministic multi-scale residual candidates;
- uses response caching and cheap candidate triage for speed;
- follows one greedy main path with at most two bounded alternatives;
- iteratively jointly refines the whole cascade;
- may temporarily exceed final Max Filters under the deterministic working cap;
- compresses precision-first back to the hard delivered cap;
- counts success only on the final quantized/discretely-refined deliverable;
- keeps a monotonic valid deliverable checkpoint throughout the run;
- exposes `5 / 15 / 30 / 60 / 120 s` Time Limit, default 30 s;
- returns the best valid checkpoint on timeout without a new UI warning;
- preserves Cancel as no-partial-apply;
- records versioned diagnostic provenance without timestamps or elapsed wall time;
- migrates Workbench Session v1 to v2 with a 30-second default while preserving historical v1 manifests;
- must pass known-solvable, adversarial, holdout, and real-world validation before closeout.
