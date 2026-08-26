# AutoEQ Workbench — Standard AutoEQ v1 Design

**Status:** approved design, pending written-spec review  
**Date:** 2026-08-25  
**Branch:** `remake/squiglink-base`  
**Baseline:** Remake 04 closed at `c3497ae35ef6080febfd292b6d73e8758f55a584`

## 1. Authority and scope

This document is the authoritative design for implementing the first production AutoEQ engine after the source-first remake.

Read it together with:

- `docs/superpowers/plans/2026-08-23-02-autoeq-standard-engine.md`;
- `docs/superpowers/plans/2026-08-24-02-standard-engine-amendment.md`;
- `docs/superpowers/specs/2026-08-24-plan-1-5-final-closeout.md`;
- `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`;
- `docs/superpowers/specs/2026-08-25-remake-04-tools-and-closeout-design.md`.

Where this design conflicts with the older Plan 2 or its amendment, this design wins. The implementation plan remains an execution map, not a behavioral authority.

The goal is a deterministic, local-only **Standard v1** AutoEQ engine that produces a small useful PK/LS/HS cascade, quantizes the delivered result, computes final diagnostics from that exact delivered cascade, and integrates into the existing Equalizer workflow without introducing a parallel product architecture.

### Explicitly out of scope

Standard v1 does **not** include:

- Same-Rig Literal;
- Cross-Rig Conservative;
- Consensus 711;
- rig-confidence weighting;
- uncertainty weighting;
- alternate optimization profiles;
- algorithm tuning from benchmark data;
- WASM;
- server-side optimization;
- background/cloud processing;
- a second AutoEQ configuration surface;
- graph series for Desired correction, PEQ transfer, selected-filter response, or filter markers.

Those belong to later benchmark/profile work. They must not be smuggled into `standard-v1` as hidden behavior.

## 2. Existing product contracts remain authoritative

The implementation must consume existing product contracts rather than recreate them.

Current hard product bounds come from `AUTOEQ_PRODUCT_LIMITS` and `MVP_NUMERIC_POLICY`:

```text
sample rate:             48,000 Hz
Workbench domain:        20–20,000 Hz
evaluation density:      96 points/octave
filter gain:             -15..+15 dB
PK Q:                    0.1..12
default maxFilters:      10
hard maxFilters:         64
shelf Q:                 0.7
```

`AutoEqSettings` owns the effective envelope for one run:

```ts
interface AutoEqSettings {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  maxFilters: number
}
```

A run may narrow frequency, gain, Q, and filter count, but never widen beyond product limits. Invalid settings are rejected; they are never silently clamped or widened into validity.

`maxFilters` is a ceiling, never a fill target. `0` is valid and returns zero generated filters. Every AutoEQ run starts from zero generated filters regardless of the current editor contents.

## 3. Architecture

The numerical engine lives entirely in `packages/core`.

```text
packages/core
└─ autoeq/
   ├─ config / types / objective
   ├─ candidates
   ├─ optimize / refine
   ├─ prune / cancellation
   ├─ quantize / discrete refine
   └─ runStandardAutoEq()
            ↓
apps/web Web Worker
            ↓
autoeq client / run controller
            ↓
workspaceStore
            ↓
Equalizer / Graph / Tools / Sound Tools
```

### 3.1 Core ownership

`packages/core` is the sole authority for:

- run-config resolution;
- objective calculation;
- residual-region detection;
- PK/LS/HS candidate generation;
- whole-cascade optimization;
- pruning;
- cancellation audit;
- quantization;
- discrete refinement;
- final metrics;
- final preamp;
- reproducible manifest construction.

React, Zustand, and Worker code must not contain alternate optimization formulas.

### 3.2 Browser ownership

The browser owns only:

- immutable capture of current run inputs;
- Worker lifecycle;
- run/cancel/error UI state;
- stale/obsolete-result rejection;
- atomic application of a successful result;
- workspace history/provenance integration.

## 4. Standard v1 numerical contract

### 4.1 Versioned algorithm constants

`STANDARD_V1_CONFIG` owns only versioned algorithm behavior, not product bounds.

Initial `standard-v1` seeds are:

```ts
{
  algorithmVersion: 'standard-v1',
  algorithm: {
    deadbandDb: 0.1,
    huberDeltaDb: 1.0,
    candidateThresholdDb: 0.5,
    minObjectiveImprovement: 0.005,
    pruneTolerance: 0.002,
    filterCountWeight: 0.01,
    highQWeight: 0.002,
    gainWeight: 0.0005,
    cancellationWeight: 0.01,
  },
}
```

These are initial production seeds. They must be benchmarked later; they must not be silently retuned during implementation.

### 4.2 Config resolution

Provide one core resolver:

```ts
resolveStandardAutoEqConfig(settings: AutoEqSettings): AutoEqConfig
```

It must:

1. reject invalid settings with structured `CoreError('validation', ...)`;
2. preserve the requested valid effective envelope exactly;
3. use fixed sample rate 48 kHz;
4. use 96 points/octave;
5. use shelf Q 0.7;
6. attach `algorithmVersion = 'standard-v1'`;
7. never duplicate hard bounds into a competing source of truth.

### 4.3 Preparation and fit grid

The run uses the current active FR, active Target, and global normalization captured at click time.

Prepare both curves on the canonical 96-ppo logarithmic Workbench grid. The optimization samples are the subset satisfying:

```text
config.minFrequencyHz <= f <= config.maxFrequencyHz
```

The full Workbench domain remains authoritative for graphing and final preamp policy.

Desired correction is:

```text
desired(f) = target(f) - source(f)
```

No current manual filters participate in optimizer initialization.

## 5. Objective

The Standard objective is:

```text
J = fit + filterCount + highQ + gain + cancellation
```

The fit component is the **mean** deadbanded Huber loss over fit samples, not a raw sum. This keeps structural-penalty weights comparable when effective frequency ranges contain different numbers of samples.

For each residual sample:

```ts
magnitude = max(0, abs(errorDb) - deadbandDb)

huber = magnitude <= huberDeltaDb
  ? 0.5 * magnitude * magnitude
  : huberDeltaDb * (magnitude - 0.5 * huberDeltaDb)
```

Then:

```text
fit = mean(huber)
filterCount = filters.length * filterCountWeight
highQ = Σ max(0, log2(q / 2))² * highQWeight
gain = Σ max(0, abs(gainDb) - 6)² * gainWeight
cancellation = cancellationAudit.totalScore * cancellationWeight
```

The objective always evaluates the complete enabled cascade. Isolated-filter gain heuristics are not an optimization authority.

## 6. Candidate generation

Residual regions are contiguous fit-grid runs where:

- `abs(residual) >= candidateThresholdDb`;
- residual sign is consistent;
- a sub-threshold sample or sign change closes the region.

### 6.1 PK candidates

For each material region:

```ts
centerHz = sqrt(startHz * endHz)
qEstimate = centerHz / max(1e-9, endHz - startHz)
```

Clamp candidate frequency, gain, and PK Q to the **resolved effective run config**, not merely to product hard bounds.

Initial gain is the residual interpolated at the geometric center, clamped to the effective gain range.

### 6.2 Shelf candidates

Low- and high-shelf candidates require broad evidence, not a single residual peak.

Use the Plan 2 rule as the initial Standard v1 behavior:

- at least 70% of eligible samples in the shelf region share the same residual sign;
- median absolute residual is at least the candidate threshold;
- LS nominal frequency 105 Hz;
- HS nominal frequency 10 kHz;
- Q fixed at 0.7;
- gain from clamped median residual.

Shelf evidence and the shelf frequency itself must respect the effective run frequency envelope. Do not inspect excluded frequencies to justify a shelf.

### 6.3 Stable ordering and deduplication

Candidate ordering is deterministic:

1. broader region first;
2. larger absolute initial gain;
3. lower frequency;
4. type order `LS`, `PK`, `HS`.

Near-duplicate candidates of the same type within 1/48 octave are deduplicated deterministically.

## 7. Greedy optimization and continuous refinement

Start with:

```text
filters = []
```

Then repeatedly:

1. compute the complete-cascade residual;
2. generate deterministic candidates;
3. append each candidate to the current solution independently;
4. refine that complete candidate cascade;
5. select the lowest-objective result with deterministic tie-breakers;
6. accept it only when improvement is at least `minObjectiveImprovement`;
7. stop when no candidate is material, improvement is insufficient, or `maxFilters` is reached.

Accepted objective values must never increase.

### 7.1 Coordinate refinement

Use the three existing deterministic pass scales:

```ts
[
  { fcOctaveStep: 1 / 6,  gainStepDb: 1.0,  qOctaveStep: 1 / 2 },
  { fcOctaveStep: 1 / 24, gainStepDb: 0.25, qOctaveStep: 1 / 8 },
  { fcOctaveStep: 1 / 96, gainStepDb: 0.1,  qOctaveStep: 1 / 32 },
]
```

For PK, refine frequency, gain, and Q. Frequency and Q moves are multiplicative powers of two. For shelves, refine frequency and gain while keeping Q at 0.7.

Every tested parameter stays inside the resolved effective envelope.

Exact-objective ties resolve deterministically by:

1. lower absolute gain;
2. lower Q;
3. lower frequency;
4. stable list order when still tied.

## 8. Cancellation audit and pruning

Cancellation scoring follows the existing Plan 2 contract for nearby opposite-sign filters. Opposite-sign pairs farther than one octave are ignored. Severity remains `moderate` and `strong` at the documented thresholds.

The audit may be computed repeatedly as an internal objective component during optimization.

Pruning is iterative:

1. remove filters with `abs(gainDb) < 0.05` before delivery refinement;
2. test removing each remaining filter in stable order;
3. remove it when `objectiveWithout <= currentObjective + pruneTolerance`;
4. restart from index 0 after each removal;
5. stop after a complete pass with no removal;
6. run a final continuous refinement pass.

The **reported** cancellation audit is not frozen before quantization. It must be recalculated from the exact final delivered filters after quantization, discrete refinement, and final cleanup.

## 9. Quantization and discrete refinement

Use one explicit manual-entry delivery precision policy:

```ts
POWERAMP_MANUAL_ENTRY_POLICY = {
  frequencyStepHz: 1,
  gainStepDb: 0.1,
  qStep: 0.01,
  preampStepDb: 0.1,
}
```

This is a Workbench manual-entry/export precision policy, not a claim about Poweramp backup-file schema.

Quantization must:

- clamp first;
- round to nearest policy step;
- normalize floating artifacts;
- normalize `-0` to `0`;
- keep shelves at Q 0.7.

Discrete refinement runs on the quantized parameter grid and may test current and ±1 policy step for eligible coordinates. It must never return an objective worse than the raw quantized candidate selected as its starting point.

After discrete refinement, remove any filter whose delivered gain is exactly `0 dB`. A structurally dead filter must not survive merely because it was non-zero before quantization.

## 10. Final ordering, IDs, metrics, preamp, and manifest

### 10.1 Deterministic final filter identity

The core result must not depend on workspace IDs.

After final cleanup, sort filters by:

1. frequency ascending;
2. type order `LS`, `PK`, `HS`;
3. deterministic parameter tie-breakers.

Assign deterministic IDs:

```text
autoeq-1
autoeq-2
...
```

Same numerical inputs + same settings + same algorithm version must produce the same filter list, order, IDs, metrics, audit, preamp, and manifest.

### 10.2 Final metrics

Final stored run metrics describe the exact delivered, quantized/discretely-refined filters over the effective optimization interval captured for that run.

Do not compute stored result metrics from the continuous pre-quantized solution.

The live `Tools → Analysis` metrics remain derived from the current workspace FR, Target, and filters. Historical run metrics are provenance, not the live analysis authority after later manual edits.

### 10.3 Final preamp

Preamp is recalculated from the exact final filter list using the existing dense-grid full-band policy over the supported Workbench domain. It is not restricted to a narrower optimization range.

### 10.4 Reproducible manifest

The core manifest contains no timestamp, random UUID, or browser `runId`.

It records at least:

```text
schemaVersion
algorithmVersion
profile = Standard
sampleRateHz
fitPointsPerOctave
effective AutoEqSettings
normalization
source name
target name
versioned algorithm parameters
final quantized filters
final metrics
preamp
final cancellation audit/summary
```

The manifest itself must be deeply reproducible for identical input data and settings. Names and normalization are captured provenance inputs; browser lifecycle identifiers are not.

## 11. Worker lifecycle and obsolete-result safety

Each execution owns a disposable Web Worker.

### 11.1 Run

On `Run AutoEQ`:

1. validate that active FR + Target are usable and settings are valid;
2. capture an immutable run-input snapshot;
3. create a new Worker;
4. assign a browser-only `runId`;
5. post the captured input;
6. enter `running`.

There is no fake percentage progress in Standard v1. UI may show `Running…` plus `Cancel` only.

### 11.2 Cancel

Cancel:

1. terminates the active Worker;
2. invalidates the active `runId`;
3. returns transient state to `idle`;
4. preserves the current filters, provenance, solution state, and prior AutoEQ run record;
5. does not surface a failure banner.

The next run creates a fresh Worker.

### 11.3 Error

Worker errors serialize only structured public information such as:

```ts
{
  category: 'validation' | 'optimization' | 'numeric'
  message: string
}
```

No stack trace is required in product UI.

Failure is non-destructive. Partial optimizer state is never applied.

### 11.4 Obsolete result

A run executes against the immutable input snapshot captured at click time. If active FR, active Target, normalization, or AutoEQ settings change before the Worker result is committed, that result is **obsolete** and must not be applied.

The controller compares the captured run-input signature to the current workspace before commit. A mismatch discards the result and preserves the current solution.

Late messages from terminated/replaced workers are ignored by `runId`.

## 12. Workspace state and history

The existing workspace semantics remain the model:

```ts
type SolutionState = 'clean' | 'modified' | 'stale'
type FilterProvenance = 'manual' | 'autoeq'
```

### 12.1 AutoEqRunRecord

Introduce a persistent record associated with the current filter solution, conceptually:

```ts
interface AutoEqRunRecord {
  manifest: RunManifest
  metrics: AutoEqMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
}
```

The exact type may avoid redundant fields if the manifest already contains them, but there must be one coherent stored run record, not disconnected copies.

Transient Worker status is **not** part of undo/redo.

### 12.2 Successful application

A valid success is applied atomically in one workspace action, conceptually:

```ts
applyAutoEqResult(result)
```

It must:

- create exactly one undo point;
- replace the full filter list;
- clear selected filter unless the implementation has an explicit safe replacement rule;
- set `filterProvenance = 'autoeq'`;
- set `solutionState = 'clean'`;
- store the associated AutoEQ run record.

### 12.3 Manual edits and stale state

After AutoEQ success:

- manual filter edit/add/remove/reorder/toggle → `modified`;
- changing active FR → `stale`;
- changing active Target → `stale`;
- changing normalization → `stale`;
- changing AutoEQ settings → `stale`.

The run record remains attached in `modified` and `stale` states so the user can tell which optimizer result the current solution descended from.

Importing/replacing filters manually clears the AutoEQ run association and establishes manual provenance.

### 12.4 Undo/redo

The run record must be included in workspace history alongside filters, provenance, and solution state. Undoing a successful AutoEQ restores the entire prior solution context; redoing restores the AutoEQ result and its run record.

### 12.5 Compare A/B

Compare snapshots must also preserve the associated AutoEQ run record together with:

- filters;
- filter provenance;
- solution state.

Applying A/B must never restore filters from one solution while leaving provenance/manifest from another.

Snapshot matching should continue to be based on canonical solution state, not transient run status.

## 13. Equalizer UI contract

The existing `EqualizerTab` remains the only Standard AutoEQ control surface.

Do not add a second profile/settings panel.

The current controls remain authoritative:

- active FR selector;
- active Target selector;
- existing AutoEQ constraints;
- AutoEQ button.

### 13.1 Availability

`AutoEQ` is enabled only when:

- active FR exists and is valid for the Workbench;
- active Target exists and is valid for the Workbench;
- current AutoEQ settings are valid;
- no AutoEQ run is already active.

### 13.2 Running

During a run:

- expose `Cancel` clearly;
- show `Running…` or equivalent compact status;
- do not invent percentage progress;
- do not block unrelated app interaction unnecessarily.

Changing inputs during the run is permitted, but makes the captured result obsolete as defined above.

### 13.3 Success / modified / stale

On success, the existing filter editor immediately reflects generated filters. Graph, Tools metrics, Sound Tools EQ, export, and Compare all observe the same canonical workspace filters automatically.

Existing `clean`, `modified`, and `stale` semantics remain visible where the product already surfaces solution state; do not introduce a second status vocabulary.

## 14. Graph and audio invariants

Implementing AutoEQ must not regress the source-first remake contract.

The graph continues to render only:

- imported FRs;
- imported Targets;
- exactly one derived `<active FR name> EQ` response from the complete enabled cascade.

Do not add Desired correction, isolated PEQ transfer, selected-filter response, or filter-frequency markers to the graph.

Sound Tools continues to consume canonical workspace filters and core-derived preamp. A successful AutoEQ therefore changes local listening automatically without special AutoEQ audio code.

## 15. Error model

Reuse existing `CoreError` categories.

Standard v1 may surface:

- `validation` for invalid effective config or invalid/missing run inputs;
- `optimization` for optimizer-level failure to produce a valid deterministic result;
- `numeric` for non-finite/invalid DSP state.

Do not create a parallel AutoEQ-only error hierarchy unless implementation discovers a concrete need that cannot be represented safely by the existing contract.

All failures are non-destructive.

## 16. Testing strategy

Implementation is TDD by layer.

### 16.1 Core unit tests

Cover:

- config resolution and rejection;
- mean deadbanded Huber objective;
- structural penalties;
- candidate region splitting;
- PK candidate parameters;
- shelf evidence rules;
- deterministic candidate ordering/deduplication;
- continuous coordinate refinement;
- monotonic accepted greedy objective;
- stopping below material improvement;
- cancellation scoring;
- iterative pruning;
- quantization precision and `-0` cleanup;
- discrete refinement non-regression;
- zero-gain post-quantization cleanup;
- deterministic final ordering/IDs.

### 16.2 Core integration tests

Required properties include:

- a one-PK synthetic recovery case reaches final MAE `< 0.25 dB` with `maxFilters <= 5`;
- identical runs are deeply equal;
- `maxFilters=0` returns zero filters;
- `maxFilters=64` is accepted but not filled unnecessarily;
- narrower valid envelopes are honored exactly;
- no generated/refined/delivered filter exceeds effective frequency/gain/Q bounds;
- final metrics correspond to final delivered filters;
- final cancellation audit corresponds to final delivered filters;
- final preamp corresponds to final delivered filters and full-band policy;
- manifest has no nondeterministic field.

### 16.3 Worker/controller tests

Use a fake Worker adapter and prove:

```text
idle → running → success → idle
idle → running → cancel → idle
idle → running → error
idle → running → obsolete result discarded
late old-run message ignored
```

Every path other than a valid success must preserve the prior workspace filter solution exactly.

### 16.4 Workspace integration tests

Prove the complete state sequence:

```text
manual solution
→ AutoEQ success = autoeq / clean
→ manual edit = autoeq / modified
→ Undo = autoeq / clean
→ context/settings change = stale
→ Undo/Redo preserves run record
→ Compare A/B restores matching run record
```

Also verify manual filter import clears AutoEQ provenance/run association as designed.

### 16.5 UI integration tests

Verify:

- AutoEQ disabled without valid FR + Target;
- existing settings are the only visible Standard config surface;
- run exposes Cancel;
- success atomically replaces filters;
- cancellation preserves filters;
- obsolete result cannot commit;
- graph remains within the remake curve contract;
- Tools Analysis updates from live workspace state;
- Sound Tools receives generated filters through canonical state.

## 17. Completion gate

Standard v1 / Plan 2 is complete only when all of the following are verified:

1. deterministic repeated synthetic runs produce the same final filters, IDs, metrics, audit, preamp, and manifest;
2. known one-PK synthetic case reaches MAE `< 0.25 dB` with at most five allowed filters;
3. all final filters lie on the delivery precision grid;
4. no delivered zero-gain filters remain;
5. narrower effective envelopes are honored;
6. `maxFilters=0` returns zero filters;
7. `maxFilters=64` remains a ceiling rather than a target;
8. final metrics/audit/preamp are recomputed from the final delivered cascade;
9. cancellation preserves prior solution;
10. optimization/numeric failure preserves prior solution;
11. obsolete run result preserves current solution;
12. successful run creates one undo point;
13. manual edits produce `modified`;
14. FR/Target/normalization/settings changes produce `stale`;
15. Undo/Redo and Compare A/B preserve the correct run record with the filters;
16. graph still exposes only semantic FR/Target/derived FR EQ curves;
17. Sound Tools follows canonical generated filters without duplicate AutoEQ audio logic;
18. `pnpm test` passes;
19. `pnpm typecheck` passes;
20. `pnpm build` passes;
21. `pnpm lint` passes;
22. `pnpm --filter @autoeq-workbench/web build:pages` passes;
23. `git diff --check` passes;
24. CI is green on the exact final implementation SHA;
25. Pages builds and publishes that implementation SHA through the existing workflow-run checkout model;
26. public smoke verifies Run/Cancel, successful result, manual edit, Undo/Redo, Compare A/B, Tools/Sound Tools integration, and Light/Dark behavior.

After this gate, stop. Benchmark tuning and specialized Same-Rig/Cross-Rig/Consensus profiles are separate work and must not begin implicitly.
