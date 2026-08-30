# AutoEQ Workbench — Research Bench Design

**Status:** approved design  
**Date:** 2026-08-30  
**Branch:** `research/autoeq-research-bench-design`  
**Product baseline:** `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`  
**Related design:** `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`

## 1. Authority and scope

This document defines the research and benchmarking infrastructure used to study and improve Standard AutoEQ v2 without changing Standard v2 behavior as part of the same change.

The immediate purpose is to make optimizer research measurable from GitHub Actions so implementation work can be delegated to Codex while analysis, comparison, and design decisions can be performed from repository artifacts and workflow results.

The first delivery covered by this design is **observability and benchmarking only**. It does not retune the optimizer, change Standard v2 ranking, change candidate generation, alter delivery/compression rules, or change product UI behavior.

`standard-v1` remains frozen. Existing Standard v1 deterministic baselines and existing Standard v2 correctness gates remain authoritative.

## 2. Research goals

The Research Bench must answer five questions for any candidate optimizer commit:

1. **Precision:** how close is the delivered quantized cascade to the requested correction?
2. **Speed:** how quickly does the optimizer reach useful quality levels, rather than merely how long the whole run lasts?
3. **Stability:** does the same real-time run produce similar practical quality across repeated executions?
4. **Efficiency:** where is CPU/search work spent, and how much internal work is required to obtain the delivered result?
5. **Regression:** is the candidate better or worse than a fixed known baseline on both ordinary and adversarial cases?

The product-level direction is that 30 s and 60 s are maximum budgets, not desired durations. A run that reaches sufficient quality earlier should finish earlier. Research reporting must therefore emphasize **time-to-quality** and quality-over-time.

## 3. Explicit non-goals

This work does not:

- add a new optimizer version;
- change `runStandardAutoEqV2()` numerical decisions;
- change `STANDARD_V2_CONFIG` constants;
- change Standard v2 target thresholds (`RMSE <= 0.25 dB`, `maxAbs <= 0.75 dB`);
- add regional weighting to the solver objective;
- add smoothing to candidate generation;
- change `workingMaxFilters` behavior;
- make 120 s part of the routine research matrix;
- make long research runs a required gate for every repository commit;
- upload or commit the original third-party/user-provided FR measurement files;
- replace existing synthetic benchmark and holdout cases.

Any later change to solver behavior requires a separate approved design or an explicit amendment to the Standard v2 design.

## 4. Real-world-derived adversarial corpus

The permanent real-world-derived corpus has one fixed conceptual source and three target shapes:

```text
source: Dunu Titan S2

titan-to-storm -> Subtonic Storm target shape
titan-to-u12t  -> 64 Audio U12t target shape
titan-to-trio  -> 64 Audio Trio target shape
```

These cases are intentionally adversarial. They contain broad response differences together with multiple peaks, dips, sign changes, and difficult upper-mid/treble structures. They are research stress cases, not a claim that every narrow measurement feature should be perceptually corrected at arbitrary cost.

### 4.1 Repository representation

The original FR files are **source material only** and must not be committed.

The repository stores a sanitized, derived representation of the mathematical correction problem. The preferred representation is the normalized desired correction on the canonical Workbench evaluation grid:

```text
desiredDb[f] = normalizedTargetDb[f] - normalizedTitanDb[f]
```

The derived fixture contains no original absolute SPL scale and no original free-form file payload.

Each fixture must use the same canonical numerical domain as Standard v2:

```text
sample rate:              48,000 Hz
frequency domain:         20–20,000 Hz
evaluation density:       96 points/octave
normalization reference:  current default Workbench normalization
```

The derivation utility is a development/research tool. Raw input paths are local arguments and are never stored in repository metadata.

### 4.2 Fixture precision

Derived desired-correction samples must retain sufficient precision that sanitization does not materially change the optimization problem.

The committed fixture values must round-trip through the research loader with an absolute per-sample error of at most:

```text
1e-6 dB
```

relative to the sanitized output produced by the derivation command.

### 4.3 Fixture manifest

Every committed research fixture has a manifest containing only research-safe metadata:

```ts
export interface ResearchFixtureManifest {
  schemaVersion: 1
  caseId: 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'
  fixtureKind: 'real-world-derived-adversarial'
  sourceConcept: 'Dunu Titan S2'
  targetConcept: 'Subtonic Storm' | '64 Audio U12t' | '64 Audio Trio'
  sampleRateHz: 48_000
  minFrequencyHz: 20
  maxFrequencyHz: 20_000
  evaluationPointsPerOctave: 96
  normalization: {
    mode: 'hz'
    frequencyHz: 500
    levelDb: 60
  }
  desiredDbSha256: string
}
```

The manifest must not contain local file paths, upload IDs, user identifiers, timestamps, or original absolute-SPL vectors.

## 5. Research case model

Research code consumes the sanitized desired correction directly so the benchmark isolates optimizer behavior from file parsing and curve-import overhead.

The research fixture loader produces:

```ts
export interface ResearchDesiredFixture {
  manifest: ResearchFixtureManifest
  frequenciesHz: number[]
  desiredDb: number[]
}
```

The runner creates a Standard v2 optimization problem equivalent to that desired correction without changing production `runStandardAutoEqV2()` semantics. The adapter must use core numerical authority and must not duplicate biquad or error-metric formulas in benchmark code.

Research case IDs are stable API-like identifiers. Do not rename them casually; baseline files and historical artifacts refer to them.

## 6. Measurement dimensions

### 6.1 Final quality

Every measured run records at least:

```ts
interface ResearchFinalQuality {
  maeDb: number
  rmseDb: number
  maxAbsDb: number
  maxAbsFrequencyHz: number
  targetAchieved: boolean
  terminationReason: 'target-reached' | 'converged' | 'time-limit'
  deliveredFilterCount: number
  preampDb: number
}
```

The exact delivered quantized cascade remains the authority for these metrics.

### 6.2 Regional quality

Regional metrics are observational only in the first delivery. They must not affect ranking or optimizer decisions.

Use these fixed inclusive bands:

```text
bass:          20–200 Hz
low-mid:       200–1,000 Hz
mid:           1,000–4,000 Hz
presence:      4,000–8,000 Hz
treble:        8,000–20,000 Hz
```

For every band, record MAE, RMSE, maxAbs, and maxAbsFrequencyHz using the existing core band-metric implementation.

### 6.3 Quality timeline

The Research Bench records the best safe delivered quality over time. A timeline sample is not merely an internal continuous working solution; it must represent a deliverable that could safely be returned at that point under the current delivered-filter constraints.

Use these observation marks for reports:

```text
0.5 s
1 s
2 s
3 s
5 s
10 s
15 s
20 s
30 s
45 s
60 s
```

A run only emits marks up to its configured budget or termination time.

Instrumentation may capture more internal events than these marks. Report generation projects the monotonic best-deliverable history onto the fixed marks above.

### 6.4 Time-to-quality thresholds

Calculate first-crossing time, or `null` when never reached, for:

```text
RMSE <= 1.00 dB
RMSE <= 0.75 dB
RMSE <= 0.50 dB
RMSE <= 0.35 dB
RMSE <= 0.25 dB

maxAbs <= 2.00 dB
maxAbs <= 1.50 dB
maxAbs <= 1.00 dB
maxAbs <= 0.75 dB

joint target:
RMSE <= 0.25 dB AND maxAbs <= 0.75 dB
```

First-crossing time is based on the best safe delivered checkpoint history, not on an unquantized internal state.

### 6.5 Search-efficiency counters

When telemetry is enabled, collect at minimum:

```ts
export interface StandardV2ResearchCounters {
  boundaryModeAttempts: number
  candidatesGenerated: number
  candidatesShortlisted: number
  workingCheckpoints: number
  deliverablesBuilt: number
  peakWorkingFilterCount: number
  jointRefinementCount: number
  jointCoordinateTrials: number
  discreteTrials: number
  discreteAcceptedMoves: number
  compressionRemovalTrials: number
}
```

Counters are descriptive. They do not participate in solution ranking.

### 6.6 Phase timing

Deep profiling records wall-clock duration spent in coarse phases:

```ts
export interface StandardV2ResearchPhaseTimingMs {
  prepare: number
  candidateScoring: number
  jointRefine: number
  deliverable: number
  discreteRefine: number
  compression: number
  other: number
}
```

Phase timings are approximate profiling data and are not part of deterministic result contracts.

## 7. Instrumentation boundary

Production numerical code may expose optional trace hooks, but research telemetry must remain opt-in.

Use one optional trace object instead of global mutable instrumentation:

```ts
export interface StandardV2ResearchTrace {
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  onCandidatesGenerated?(count: number): void
  onCandidatesShortlisted?(count: number): void
  onJointRefineCompleted?(coordinateTrials: number): void
  onWorkingCheckpoint?(solution: V2EvaluatedSolution): void
  onDeliverableBuilt?(deliverable: V2Deliverable): void
  onDiscreteTrial?(): void
  onDiscreteAcceptedMove?(): void
  onCompressionRemovalTrial?(): void
}
```

Exact hook placement may be split into smaller typed trace interfaces if that better follows existing module boundaries, but the public research collector must provide the counters and checkpoint history specified above.

### 7.1 No behavior drift

With a fake clock, the following must be exactly equal with and without telemetry enabled:

```text
filters
metrics
preampDb
cancellationAudit
manifest
```

Telemetry callbacks must not call the optimizer's injected `nowMs()` and must not modify filters, arrays, caches, or solution objects received from core.

Production runs do not enable deep research telemetry.

### 7.2 Light telemetry versus deep profile

Two measurement modes exist:

```text
light  -> counters + safe deliverable checkpoints + final metrics
deep   -> light data + phase timing + detailed internal counts
```

`light` is the mode used for comparative runtime measurements.

`deep` exists to locate bottlenecks and may add measurable overhead. Deep-profile wall-clock results must never be presented as equivalent to production runtime.

## 8. Stability measurement

Real-time timeout behavior is allowed to be best-effort deterministic across machines under the existing Standard v2 contract. Research therefore measures **quality stability**, not byte-identical filters, for real-clock repeated runs.

For repeated runs of the same case/settings/budget, report:

```text
run count
best / median / worst RMSE
best / median / worst maxAbs
targetAchieved count and percentage
terminationReason distribution
median and worst time-to-quality per threshold
RMSE spread = worst - best
maxAbs spread = worst - best
```

The full research preset uses five repeated real-clock runs per selected cell unless explicitly overridden by a workflow input.

Exact determinism remains required for non-timeout/fake-clock tests already covered by Standard v2.

## 9. Runtime and filter matrices

### 9.1 Primary time budgets

The routine research budgets are:

```text
5 s
15 s
30 s
60 s
```

`120 s` is an optional diagnostic/oracle budget and is not part of the default matrix.

### 9.2 Filter budgets

The default product-representative filter budget is:

```text
Max Filters = 10
```

Selected capacity experiments may additionally use:

```text
Max Filters = 20
Max Filters = 40
```

The full default matrix must not multiply every time budget by every filter budget automatically. `20/40` are explicit capacity experiments because their runtime cost can be large.

Reports always record both delivered filter count and peak internal working filter count.

## 10. Benchmark presets

### 10.1 Research Quick

`Research Quick` is designed for reasonably fast feedback and does not block ordinary CI by default.

Run:

```text
cases:       titan-to-storm, titan-to-u12t, titan-to-trio
budgets:     15 s, 30 s
maxFilters:  10
repeats:     1
telemetry:   light
```

It produces baseline comparison and the same artifact schema as Full, with fewer samples.

### 10.2 Research Full

`Research Full` is a manually dispatched research job.

Run:

```text
cases:       titan-to-storm, titan-to-u12t, titan-to-trio
budgets:     5 s, 15 s, 30 s, 60 s
maxFilters:  10
repeats:     5
telemetry:   light
```

Optional workflow inputs allow:

```text
includeCapacityExperiment = true
capacityMaxFilters = 20,40
includeOracle120 = true
profileCase = one case ID or none
profileBudgetSeconds = one approved timeout
```

Deep profiling is limited to an explicitly selected case/budget, not the entire matrix.

## 11. Baseline comparison

The first baseline is the published Standard v2 product commit:

```text
7c9ebbbe6eefeb131c6c698055c737b429f5b0c6
```

Research comparison must not rely on checking out and executing arbitrary untrusted code inside the same process as a candidate workflow. Instead, commit a versioned baseline result file generated from the approved baseline implementation and sanitized fixture version.

Baseline identity includes:

```ts
interface ResearchBaselineIdentity {
  schemaVersion: 1
  implementationCommit: string
  fixtureSchemaVersion: 1
  fixtureHashes: Record<string, string>
  runnerSchemaVersion: 1
}
```

If fixture hashes or runner schema are incompatible, comparison must clearly report `baseline-incompatible` rather than producing misleading deltas.

### 11.1 Comparison outputs

For every comparable cell report candidate minus baseline and percentage delta where meaningful for:

```text
median/final RMSE
median/final maxAbs
targetAchieved rate
time-to-RMSE-0.50
time-to-joint-target
actual elapsed time
peak working filter count
joint refinement count
```

Lower is better for errors, elapsed time, work counters, and time-to-quality. Higher is better for target-achieved rate.

## 12. Monotonic practical-quality checks

The Research Bench initially treats these as reported research checks, not hard product CI gates:

```text
30 s should not be materially worse than 15 s
60 s should not be materially worse than 30 s
```

For a fixed case/maxFilters run with compatible measurement conditions, define a material regression as either:

```text
RMSE > shorter-budget RMSE + 0.05 dB
OR
maxAbs > shorter-budget maxAbs + 0.10 dB
```

Because real-clock runs can vary, Full uses median values for the check.

The report highlights violations prominently. Promotion to a blocking gate requires a later explicit decision after baseline data exists.

## 13. Workflow architecture

Add a separate GitHub Actions workflow:

```text
.github/workflows/autoeq-research.yml
```

It must not replace `.github/workflows/ci.yml`.

Initial triggers:

```text
workflow_dispatch
```

After the infrastructure proves reliable, a later change may add targeted PR/path triggers. That is not required for the first implementation.

The workflow must:

1. checkout the selected candidate commit;
2. install with the repository's pinned Node/pnpm setup;
3. run focused validation for the research runner;
4. execute the selected research preset;
5. render Markdown and JSON artifacts;
6. upload the research artifact even when a research comparison check reports a regression;
7. fail only for infrastructure/data-integrity errors in the initial version, not because a candidate is slower or less accurate than baseline.

## 14. Artifact contract

Every Research Bench run uploads one artifact directory containing:

```text
autoeq-research/
  summary.md
  results.json
  timeline.json
  profile.json
  metadata.json
```

`profile.json` is a valid empty-profile object when no deep profile is requested; consumers never need to guess whether the file exists.

### 14.1 `metadata.json`

Contains:

```ts
interface ResearchRunMetadata {
  schemaVersion: 1
  candidateCommit: string
  baselineCommit: string
  runnerSchemaVersion: 1
  fixtureHashes: Record<string, string>
  preset: 'quick' | 'full'
  requestedAtIso?: string
}
```

`requestedAtIso` is workflow/report metadata only and never appears in Standard v2 manifests or deterministic result comparisons.

### 14.2 `results.json`

Contains one row per actual run plus aggregate records. Raw run rows include exact settings and final metrics. Aggregates use stable case/budget/maxFilters keys.

### 14.3 `timeline.json`

Contains monotonic best-safe-deliverable checkpoints and projected fixed observation marks. It must be possible to recompute time-to-quality thresholds from this file.

### 14.4 `profile.json`

Contains deep-profile counters/timing only for explicitly profiled cells plus an `enabled` boolean.

### 14.5 `summary.md`

Human-readable summary prioritizes:

1. baseline deltas;
2. target-achieved rate;
3. 30 s and 60 s quality;
4. time-to-quality;
5. instability/worst-run outliers;
6. monotonicity warnings;
7. phase/counter hotspots when deep profile exists.

Do not dump every filter parameter into the top summary. Detailed filters remain in structured JSON.

## 15. Repository file boundaries

Preferred new research structure:

```text
packages/core/benchmarks/research/
  types.ts
  fixtures/
    titan-to-storm.json
    titan-to-u12t.json
    titan-to-trio.json
  fixtureLoader.ts
  deriveFixture.ts
  telemetry.ts
  runner.ts
  report.ts
  baseline-standard-v2.json

packages/core/test/autoeq/v2/research/
  fixtureLoader.test.ts
  telemetry.test.ts
  runner.test.ts
  report.test.ts

.github/workflows/
  autoeq-research.yml
```

Existing v2 production modules may receive minimal optional trace plumbing where necessary. Keep research-only orchestration and reporting out of `src/autoeq/v2/` whenever possible.

No React/UI file is part of the first Research Bench implementation.

## 16. Testing requirements

### 16.1 Fixture integrity

Tests prove:

- exactly three expected fixture IDs load;
- frequency grid equals the canonical evaluation grid;
- every desired sample is finite;
- manifest hash matches the committed desired vector;
- fixture metadata contains no path/user/upload fields;
- serialization precision respects the `1e-6 dB` requirement.

### 16.2 Telemetry equivalence

With injected fake clock, run representative Standard v2 cases with telemetry disabled and enabled and assert deep equality of the complete `AutoEqResultV2`.

### 16.3 Timeline correctness

Given deterministic synthetic checkpoint events, tests prove:

- best-safe quality never regresses in the emitted timeline;
- fixed marks select the latest best checkpoint available at or before the mark;
- first-crossing thresholds are correct;
- a threshold never reached is represented as `null`.

### 16.4 Aggregation correctness

Use small synthetic run rows to prove median, best, worst, spread, achieved-rate, termination distribution, and monotonicity-warning calculations.

### 16.5 Baseline compatibility

Tests prove comparison succeeds only when runner schema and fixture hashes match, and otherwise produces explicit incompatibility metadata.

### 16.6 Workflow smoke

The runner must support a tiny test preset/fake-clock mode suitable for unit/CI validation without sleeping for real 15–60 s budgets.

The GitHub workflow itself uses real clocks for actual research presets.

## 17. Baseline-generation procedure

Baseline data is generated only after the research runner and sanitized fixtures stabilize.

Procedure:

1. verify the fixture hashes;
2. run focused research tests;
3. run `Research Full` against the published baseline implementation or an equivalent isolated checkout;
4. inspect artifact integrity;
5. commit the resulting baseline aggregate/raw data with identity `implementationCommit = 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`;
6. rerun the candidate branch using the committed baseline file to verify comparison output.

Do not fabricate baseline values manually.

## 18. Existing benchmark relationship

The following remain intact:

```text
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/core benchmark:v2:holdout
```

The research runner is additive. It does not weaken existing known-solvable gates, fake-clock determinism checks, Max Filters enforcement, or frozen Standard v1 drift checks.

The adversarial real-world-derived corpus is **not** a substitute for the holdout set. Optimizer changes must continue to be evaluated against both known research cases and independent/synthetic cases to reduce benchmark overfitting.

## 19. Initial acceptance criteria

The Research Bench infrastructure is complete when all of the following are true:

1. the three sanitized fixtures are committed and integrity-tested;
2. no original measurement file is present in the repository diff;
3. light telemetry does not alter Standard v2 deterministic output under fake clock;
4. Research Quick produces all five artifact files;
5. Research Full supports 5/15/30/60 s and five repeats by default;
6. regional metrics and time-to-quality are present;
7. stability aggregates and monotonicity warnings are present;
8. optional 20/40-filter capacity experiments are supported without being part of the default full Cartesian matrix;
9. one-case deep profiling produces counters and phase timings;
10. baseline compatibility is hash/schema guarded;
11. a baseline file for `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6` is generated from the runner rather than hand-authored;
12. existing core tests, Standard v1 benchmark, Standard v2 benchmark, build, typecheck, and lint remain green;
13. `.github/workflows/ci.yml` remains semantically unchanged unless a separately justified small integration hook is required;
14. no product deploy or solver tuning is performed as part of this work.

## 20. Follow-on research after this infrastructure

Once baseline evidence exists, optimizer work should proceed in separate measured stages:

```text
A. equivalent-computation optimizations
   - reuse candidate responses
   - reduce response/cache recomputation
   - reduce allocations
   - reuse cancellation-response data where safe
   - accelerate deliverable/discrete work without changing decisions

B. progressive-search architecture
   - stronger early solution
   - less repeated restart work
   - alternatives only when useful
   - protected finalization budget
   - fast early termination when quality is sufficient

C. objective/ranking changes only if measurements justify them
   - regional protection
   - shortlist/ranking alignment
   - other perceptual or geometric changes
```

Every follow-on optimizer candidate is evaluated against the Research Bench baseline and the existing Standard v2 correctness/holdout corpus before product promotion.
