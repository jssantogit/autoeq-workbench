# AutoEQ Research Bench — Codex Implementation Plan

> **For Codex:** REQUIRED PROCESS: execute this plan **one task at a time** with `superpowers:executing-plans`. Efficient Workflow v2 overrides generic fan-out defaults: use one agent unless a closed independent subtask has clear positive net value; never nest subagents and never exceed two concurrent. Every task ends in focused verification and one coherent commit. Do not start the next task in the same run unless the current task is complete, committed, the worktree is clean, and the next task is trivially small.

**Goal:** Build a reproducible GitHub-Actions research benchmark for Standard AutoEQ v2 using the raw Titan S2/Storm/U12t/Trio corpus, convergence/stability metrics, optional deep profiling, and comparison against the published v2 baseline, without changing solver decisions.

**Architecture:** Keep numerical authority in `packages/core`. Research-only loaders, aggregation, reporting, baseline handling, and CLI code live under `packages/core/benchmarks/research/`; only minimal opt-in trace contracts/hooks enter `packages/core/src/autoeq/v2/`. A separate manual GitHub Actions workflow executes expensive real-time research runs. The first delivery measures the current solver only.

**Tech Stack:** TypeScript 6, Vitest 4, Node 22, tsx, pnpm 10.34.5, GitHub Actions.

**Specs:**
- `docs/superpowers/specs/2026-08-30-autoeq-research-bench-design.md`
- `docs/superpowers/specs/2026-08-30-autoeq-research-bench-raw-corpus-amendment.md` — wins on any raw-corpus conflict.

**Workflow authority:**
- `AGENTS.md`
- `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`

---

## Codex execution contract

This project is intentionally larger than one good Codex task. Treat each numbered task below as a separate issue-sized execution unit.

At the start of every Codex run:

1. `git status --short` and `git log -1 --oneline`.
2. Read `AGENTS.md`.
3. Read only the spec section(s) and numbered plan task needed for the current task. Do not preload the entire repository or all specs.
4. Search symbols before opening large files.
5. If current HEAD already contains part of the task, inspect the directed diff first and continue from durable state; do not redo completed work.

During implementation:

- single-agent execution by default;
- smallest coherent change only; no unrelated cleanup;
- TDD/focused regression first where behavior or contracts change;
- use existing core math instead of duplicating parsing, interpolation, normalization, biquad, or metric formulas;
- do not run global gates after every micro-edit;
- do not retune Standard v2 while building the benchmark;
- do not change Standard v1 numerics;
- preserve unrelated WIP; never reset/clean/stash it for convenience.

At the end of every task:

1. run only that task's focused verification;
2. inspect `git diff --check` and the task-directed diff;
3. make one coherent commit;
4. verify `git status --short` is clean;
5. stop and report in this compact form:

```text
Status: PASS | BLOCKED
SHA: <exact commit SHA>

Changes:
- up to 5 bullets

Verification:
- focused commands and pass/fail only

Notes:
- only real risks/blockers/next prerequisite
```

Do not push, merge, deploy, release, or publish unless the invoking prompt explicitly authorizes that action.

### First Codex prompt

Use this exact prompt for the first implementation run:

```text
Implement Task 1 only from docs/superpowers/plans/2026-08-30-autoeq-research-bench.md on the current branch.

Read AGENTS.md first, then the raw-corpus amendment, then only Task 1 of the plan. The four raw measurement files are already present in packages/core/benchmarks/research/raw/; do not recreate them from external sources. Follow Efficient Workflow v2: directed reads, single-agent execution, TDD/focused tests, one coherent commit, clean worktree, and compact final report.

Do not change Standard v1/v2 solver behavior, UI, ordinary CI, or any unrelated files. Stop after Task 1 is committed. Do not push or merge.
```

For later runs, the minimal prompt is: `Implement Task N only from docs/superpowers/plans/2026-08-30-autoeq-research-bench.md. Follow the Codex execution contract in that plan. Stop after the task is committed.`

---

## Global constraints

- Product numerical baseline is exactly `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`.
- `standard-v1` is frozen.
- Do not change `STANDARD_V2_CONFIG`, ranking semantics, candidate geometry/ordering, target thresholds, working-filter policy, compression acceptance, product UI, session schema, or export behavior.
- Raw corpus exception is limited to the four already-approved files under `packages/core/benchmarks/research/raw/`; no additional raw/private/user curve data.
- Fixed research source: Dunu Titan S2.
- Fixed targets: Subtonic Storm, 64 Audio U12t, 64 Audio Trio.
- Stable case IDs: `titan-to-storm`, `titan-to-u12t`, `titan-to-trio`.
- Routine budgets: `5 | 15 | 30 | 60`; `120` is optional diagnostic/oracle only.
- Research Quick: all 3 cases × `15/30 s` × Max Filters 10 × 1 repeat × light telemetry.
- Research Full: all 3 cases × `5/15/30/60 s` × Max Filters 10 × 5 repeats × light telemetry.
- Max Filters 20/40 are opt-in capacity experiments, never part of the default Full Cartesian matrix.
- Deep profiling is opt-in for exactly one selected case/budget; deep-profile wall time must not be compared as production-equivalent runtime.
- `.github/workflows/ci.yml` remains semantically unchanged.
- Initial Research Bench regressions are reported, not blocking; infrastructure/data-integrity failures do fail.
- No browser E2E is required unless implementation unexpectedly touches browser/session/UI code; such a touch is itself a scope warning.

## Planned file boundary

```text
packages/core/benchmarks/research/
  types.ts
  corpus.ts
  telemetry.ts
  timeline.ts
  aggregate.ts
  baseline.ts
  report.ts
  run.ts
  raw/
    dunu-titan-s2.txt
    subtonic-storm.txt
    64-audio-u12t.txt
    64-audio-trio.txt
  baseline-standard-v2.json        # added only after external baseline capture

packages/core/src/autoeq/v2/
  researchTrace.ts
  runtime.ts
  candidates.ts
  jointRefine.ts
  search.ts
  discreteRefine.ts
  deliverable.ts
  runStandardAutoEqV2.ts

packages/core/test/autoeq/v2/research/
  corpus.test.ts
  telemetry.test.ts
  timeline.test.ts
  aggregate.test.ts
  runner.test.ts
  baseline.test.ts
  report.test.ts

.github/workflows/
  autoeq-research.yml
```

Research orchestration stays out of `src/`; only trace contracts/hooks belong beside production v2 code.

---

### Task 1: Stabilize and load the raw adversarial corpus

**Codex task objective:** turn the four already-versioned raw files into a stable research corpus and prove the benchmark uses the normal core parser/preparation path.

**Files:**
- Rename only:
  - `packages/core/benchmarks/research/raw/Dunu Titan S2.txt` → `packages/core/benchmarks/research/raw/dunu-titan-s2.txt`
  - `packages/core/benchmarks/research/raw/Subtonic Storm [1].txt` → `packages/core/benchmarks/research/raw/subtonic-storm.txt`
  - `packages/core/benchmarks/research/raw/64 Audio U12t [1].txt` → `packages/core/benchmarks/research/raw/64-audio-u12t.txt`
  - `packages/core/benchmarks/research/raw/64 Audio Trio [1].txt` → `packages/core/benchmarks/research/raw/64-audio-trio.txt`
- Create: `packages/core/benchmarks/research/types.ts`
- Create: `packages/core/benchmarks/research/corpus.ts`
- Create: `packages/core/test/autoeq/v2/research/corpus.test.ts`

**Consumes:** existing `parseCurveText`, `createEvaluationGrid`, `prepareCurve`, `desiredCorrection`, `DEFAULT_AUTOEQ_SETTINGS`, `Curve`.

**Produces:**

```ts
export type ResearchCaseId = 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'

export interface ResearchCase {
  id: ResearchCaseId
  source: Curve
  target: Curve
}

export const RESEARCH_NORMALIZATION = {
  mode: 'hz',
  frequencyHz: 500,
  levelDb: 60,
} as const

export const RESEARCH_CORPUS_SHA256: Readonly<Record<string, string>>

export function loadResearchCases(): ResearchCase[]

export function prepareResearchDesired(caseId: ResearchCaseId): {
  frequenciesHz: number[]
  desiredDb: number[]
}
```

- [ ] **Step 1: Verify the existing raw bytes before any rename**

Run:

```bash
sha256sum \
  'packages/core/benchmarks/research/raw/Dunu Titan S2.txt' \
  'packages/core/benchmarks/research/raw/Subtonic Storm [1].txt' \
  'packages/core/benchmarks/research/raw/64 Audio U12t [1].txt' \
  'packages/core/benchmarks/research/raw/64 Audio Trio [1].txt'
```

Expected exact hashes:

```text
baa46f7ff6516597d6483a50739a32d0484fea1a509797e717e32b7f39305e7f  Dunu Titan S2.txt
13b3c259cb3b5c106eacac80aa5180c0ffb42d15196ff5e2bcce7d31aae6ed1a  Subtonic Storm [1].txt
593b25ea63fd02e886dd9f1892df9d9d4e17c41ce95fdfbc52492979c61c769e  64 Audio U12t [1].txt
d172c28fd5884ecb40338eb43b75a486c09842abfac185b16be7e56122c90f20  64 Audio Trio [1].txt
```

If any hash differs, stop and report `BLOCKED`. Do not normalize line endings or reconstruct data.

- [ ] **Step 2: Rename with `git mv`, then verify hashes again**

```bash
git mv 'packages/core/benchmarks/research/raw/Dunu Titan S2.txt' \
  packages/core/benchmarks/research/raw/dunu-titan-s2.txt
git mv 'packages/core/benchmarks/research/raw/Subtonic Storm [1].txt' \
  packages/core/benchmarks/research/raw/subtonic-storm.txt
git mv 'packages/core/benchmarks/research/raw/64 Audio U12t [1].txt' \
  packages/core/benchmarks/research/raw/64-audio-u12t.txt
git mv 'packages/core/benchmarks/research/raw/64 Audio Trio [1].txt' \
  packages/core/benchmarks/research/raw/64-audio-trio.txt
sha256sum packages/core/benchmarks/research/raw/*.txt
```

Expected hashes are unchanged.

- [ ] **Step 3: Write the RED corpus test**

Test exact case order and canonical preparation:

```ts
const cases = loadResearchCases()
expect(cases.map(({ id }) => id)).toEqual([
  'titan-to-storm',
  'titan-to-u12t',
  'titan-to-trio',
])

for (const researchCase of cases) {
  expect(researchCase.source.kind).toBe('fr')
  expect(researchCase.target.kind).toBe('target')
  const prepared = prepareResearchDesired(researchCase.id)
  expect(prepared.frequenciesHz).toEqual(createEvaluationGrid())
  expect(prepared.desiredDb).toHaveLength(prepared.frequenciesHz.length)
  expect(prepared.desiredDb.every(Number.isFinite)).toBe(true)
}
```

Also hash the loaded raw file bytes in the test and compare to `RESEARCH_CORPUS_SHA256`.

- [ ] **Step 4: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/corpus.test.ts
```

Expected: FAIL because research corpus modules are not implemented.

- [ ] **Step 5: Implement only through existing core numerical paths**

Read files with `readFileSync(new URL('./raw/<stable-name>.txt', import.meta.url), 'utf8')`; parse Titan as `kind: 'fr'`, each target as `kind: 'target'`.

`prepareResearchDesired()` must use:

```ts
const frequenciesHz = createEvaluationGrid()
const source = prepareCurve(researchCase.source, RESEARCH_NORMALIZATION, frequenciesHz)
const target = prepareCurve(researchCase.target, RESEARCH_NORMALIZATION, frequenciesHz)
return {
  frequenciesHz,
  desiredDb: desiredCorrection(source.db, target.db),
}
```

Do not add research-only interpolation, normalization, smoothing, or desired-correction math.

- [ ] **Step 6: GREEN, diff sanity, commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/corpus.test.ts
git diff --check
git diff -- packages/core/benchmarks/research packages/core/test/autoeq/v2/research/corpus.test.ts
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research/corpus.test.ts
git commit -m "test(core): add real-world AutoEQ research corpus"
git status --short
```

Stop after this commit.

---

### Task 2: Add opt-in Standard v2 trace plumbing with exact no-drift proof

**Codex task objective:** expose research events needed for measurement while proving the exact solver result is unchanged when tracing is enabled.

**Files:**
- Create: `packages/core/src/autoeq/v2/researchTrace.ts`
- Modify: `packages/core/src/autoeq/v2/runtime.ts`
- Modify: `packages/core/src/autoeq/v2/candidates.ts`
- Modify: `packages/core/src/autoeq/v2/jointRefine.ts`
- Modify: `packages/core/src/autoeq/v2/search.ts`
- Modify: `packages/core/src/autoeq/v2/discreteRefine.ts`
- Modify: `packages/core/src/autoeq/v2/deliverable.ts`
- Modify: `packages/core/src/autoeq/v2/runStandardAutoEqV2.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/autoeq/v2/research/telemetry.test.ts`

**Produces:**

```ts
export type StandardV2ResearchPhase =
  | 'prepare'
  | 'candidateScoring'
  | 'jointRefine'
  | 'deliverable'
  | 'discreteRefine'
  | 'compression'

export interface StandardV2SafeCheckpoint {
  metrics: ErrorMetrics
  filters: Filter[]
  preampDb: number
}

export interface StandardV2ResearchTrace {
  onPhaseStart?(phase: StandardV2ResearchPhase): void
  onPhaseEnd?(phase: StandardV2ResearchPhase): void
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  onCandidatesGenerated?(count: number): void
  onCandidatesShortlisted?(count: number): void
  onJointRefineCompleted?(coordinateTrials: number): void
  onWorkingCheckpoint?(): void
  onDeliverableBuilt?(): void
  onBestDeliverableUpdated?(checkpoint: StandardV2SafeCheckpoint): void
  onDiscreteTrial?(): void
  onDiscreteAcceptedMove?(): void
  onCompressionRemovalTrial?(): void
  onPeakWorkingFilterCount?(count: number): void
}
```

Extend runtime additively:

```ts
export interface StandardV2Runtime {
  nowMs(): number
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void
  researchTrace?: StandardV2ResearchTrace
}
```

- [ ] **Step 1: Write the RED exact-equivalence test before trace plumbing**

Use a deterministic existing v2 synthetic case and a fake clock that never advances:

```ts
const withoutTrace = runStandardAutoEqV2(input, { nowMs: () => 0 })
const counters = createCountingTestTrace()
const withTrace = runStandardAutoEqV2(input, {
  nowMs: () => 0,
  researchTrace: counters.trace,
})
expect(withTrace).toEqual(withoutTrace)
expect(counters.snapshot().bestDeliverableUpdates).toBeGreaterThan(0)
expect(counters.snapshot().jointRefines).toBeGreaterThan(0)
```

The callback assertions prevent a false pass from unused trace plumbing.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/telemetry.test.ts
```

Expected: type/module failure because `researchTrace` does not exist.

- [ ] **Step 3: Implement minimum hooks without changing decisions**

Rules:

- callback return values are ignored;
- callbacks never call the optimizer's injected `runtime.nowMs()`;
- callback payloads are cloned/simple values when mutation could affect solver state;
- no trace condition changes candidate ordering, comparisons, deadline checks, loop counts, accepted moves, compression rules, or delivered filters;
- preserve existing `runtime.onBoundaryModeAttempt` behavior and additionally fire the research trace callback;
- `onBestDeliverableUpdated` fires only after the initial zero-filter deliverable and when `bestDeliverable` is actually replaced by a better safe delivered solution; do not emit worse throwaway deliverables as quality checkpoints;
- `onDeliverableBuilt` counts every successfully materialized deliverable, independently of whether it becomes best.

Hook boundaries:

```text
generateV2Candidates result size         -> onCandidatesGenerated
rankV2CandidateShortlist result size     -> onCandidatesShortlisted
jointRefineV2 return                     -> onJointRefineCompleted(coordinateTrials)
accepted search checkpoint               -> onWorkingCheckpoint
buildDeliverableV2 successful return     -> onDeliverableBuilt
accepted best delivered solution         -> onBestDeliverableUpdated
cyclic discrete trial                    -> onDiscreteTrial
accepted discrete move                   -> onDiscreteAcceptedMove
compression removal evaluation           -> onCompressionRemovalTrial
search peak growth                       -> onPeakWorkingFilterCount
```

Deep phase hooks may wrap repeated phase invocations; use `try/finally` where an exception could otherwise leave an open phase.

- [ ] **Step 4: Focused GREEN suite**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/telemetry.test.ts \
  test/autoeq/v2/candidates.test.ts \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/search.test.ts \
  test/autoeq/v2/discreteRefine.test.ts \
  test/autoeq/v2/deliverable.test.ts \
  test/autoeq/v2/runStandardAutoEqV2.test.ts
```

Expected: all PASS and exact traced/untraced deterministic result equality.

- [ ] **Step 5: Directed diff + commit**

```bash
git diff --check
git diff -- packages/core/src/autoeq/v2 packages/core/src/index.ts \
  packages/core/test/autoeq/v2/research/telemetry.test.ts
git add packages/core/src/autoeq/v2 packages/core/src/index.ts \
  packages/core/test/autoeq/v2/research/telemetry.test.ts
git commit -m "feat(core): expose opt-in Standard v2 research trace"
git status --short
```

Stop after this commit. Do not run the full benchmark chain yet.

---

### Task 3: Implement light telemetry, safe quality timeline, regional metrics, and time-to-quality

**Codex task objective:** convert trace events into stable research measurements without adding wall-clock overhead to solver decisions.

**Files:**
- Modify: `packages/core/benchmarks/research/types.ts`
- Create: `packages/core/benchmarks/research/telemetry.ts`
- Create: `packages/core/benchmarks/research/timeline.ts`
- Create: `packages/core/test/autoeq/v2/research/timeline.test.ts`

**Produces:**

```ts
export const RESEARCH_BANDS: readonly MetricBand[]
export const RESEARCH_TIMELINE_MARKS_MS: readonly number[]

export interface ResearchCheckpoint {
  elapsedMs: number
  metrics: ErrorMetrics
  filterCount: number
}

export interface ResearchTimeToQuality {
  rmse100Ms: number | null
  rmse075Ms: number | null
  rmse050Ms: number | null
  rmse035Ms: number | null
  rmse025Ms: number | null
  maxAbs200Ms: number | null
  maxAbs150Ms: number | null
  maxAbs100Ms: number | null
  maxAbs075Ms: number | null
  jointTargetMs: number | null
}

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

export function createResearchTelemetry(options: {
  mode: 'light' | 'deep'
  nowMs?: () => number
}): {
  trace: StandardV2ResearchTrace
  snapshot(): ResearchTelemetrySnapshot
}

export function projectTimeline(
  checkpoints: readonly ResearchCheckpoint[],
  marksMs?: readonly number[],
): ResearchCheckpoint[]

export function calculateTimeToQuality(
  checkpoints: readonly ResearchCheckpoint[],
): ResearchTimeToQuality
```

- [ ] **Step 1: Write RED tests for marks and first crossing**

Pin marks:

```ts
expect(RESEARCH_TIMELINE_MARKS_MS).toEqual([
  500, 1_000, 2_000, 3_000, 5_000, 10_000,
  15_000, 20_000, 30_000, 45_000, 60_000,
])
```

Use synthetic safe checkpoints at 400/900/1800 ms. Prove each report mark selects the latest **best safe** checkpoint available at or before the mark. Include a deliberately worse checkpoint and prove it cannot regress the projected history according to `compareV2PrimaryMetrics`.

Pin `null` for thresholds never reached.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/timeline.test.ts
```

- [ ] **Step 3: Implement the light/deep collector**

Use a measurement clock owned by the collector (`performance.now` by default), never the optimizer deadline clock.

Light mode:

- records counters;
- timestamps `onBestDeliverableUpdated` only;
- does not call the measurement clock for phase events.

Deep mode:

- includes all light data;
- measures `onPhaseStart/onPhaseEnd` pairs into coarse phase totals;
- is explicitly marked non-production-equivalent timing.

- [ ] **Step 4: Use fixed observational bands**

```ts
export const RESEARCH_BANDS = [
  { id: 'bass', minHz: 20, maxHz: 200 },
  { id: 'low-mid', minHz: 200, maxHz: 1_000 },
  { id: 'mid', minHz: 1_000, maxHz: 4_000 },
  { id: 'presence', minHz: 4_000, maxHz: 8_000 },
  { id: 'treble', minHz: 8_000, maxHz: 20_000 },
] as const
```

These bands are reporting-only. Do not feed them back into ranking or candidate scoring.

- [ ] **Step 5: GREEN + commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/timeline.test.ts
git diff --check
git add packages/core/benchmarks/research/types.ts \
  packages/core/benchmarks/research/telemetry.ts \
  packages/core/benchmarks/research/timeline.ts \
  packages/core/test/autoeq/v2/research/timeline.test.ts
git commit -m "feat(core): collect AutoEQ research convergence telemetry"
git status --short
```

Stop after this commit.

---

### Task 4: Implement research run rows and real-clock stability aggregation

**Codex task objective:** execute one research cell through the real v2 runner, independently verify delivered metrics, and aggregate repeated runs without hiding failures.

**Files:**
- Modify: `packages/core/benchmarks/research/types.ts`
- Create: `packages/core/benchmarks/research/aggregate.ts`
- Create: `packages/core/benchmarks/research/run.ts`
- Create: `packages/core/test/autoeq/v2/research/aggregate.test.ts`
- Create: `packages/core/test/autoeq/v2/research/runner.test.ts`

**Produces:**

```ts
export interface ResearchRunRow {
  caseId: ResearchCaseId
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  maxFilters: number
  repeatIndex: number
  elapsedMs: number
  final: ResearchFinalQuality
  bands: BandMetric[]
  counters: StandardV2ResearchCounters
  timeToQuality: ResearchTimeToQuality
  timeline: ResearchCheckpoint[]
  filters: Filter[]
}

export interface ResearchAggregateRow {
  caseId: ResearchCaseId
  budgetSeconds: number
  maxFilters: number
  runCount: number
  rmseDb: { best: number; median: number; worst: number; spread: number }
  maxAbsDb: { best: number; median: number; worst: number; spread: number }
  targetAchievedCount: number
  targetAchievedRate: number
  terminationReasons: Record<string, number>
  timeToQualityMedian: ResearchTimeToQuality
  timeToQualityWorst: ResearchTimeToQuality
}

export async function runResearchCell(options: {
  caseId: ResearchCaseId
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  maxFilters: number
  repeatIndex: number
  telemetryMode: 'light' | 'deep'
  run?: (input: StandardAutoEqInputV2, runtime: StandardV2Runtime) => AutoEqResultV2
}): Promise<ResearchRunRow>

export function aggregateResearchRuns(rows: readonly ResearchRunRow[]): ResearchAggregateRow[]
```

- [ ] **Step 1: RED aggregation test**

For RMSE `[0.4, 0.2, 0.8]`, assert best `0.2`, median `0.4`, worst `0.8`, spread `0.6`.

For time-to-quality aggregation, treat `null` as `+Infinity` while ordering. If the selected median/worst item is failure, serialize it back to `null`; successful runs must not hide unstable failures.

Pin target-achieved rate and termination distribution.

- [ ] **Step 2: RED runner test with injected fake runner**

Inject a fake `run` that returns typed `AutoEqResultV2` and fires deterministic trace events. Prove row assembly, band IDs, counters, time-to-quality, filters, and timeline without waiting real seconds.

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/aggregate.test.ts \
  test/autoeq/v2/research/runner.test.ts
```

Expected: RED until implementation exists.

- [ ] **Step 3: Implement one real research cell**

Build the v2 input from `loadResearchCases()` using `DEFAULT_AUTOEQ_SETTINGS` with only `timeLimitSeconds` and `maxFilters` overridden. Use `RESEARCH_NORMALIZATION`.

Measure total wall time with `performance.now()` around the production `runStandardAutoEqV2()` call.

After the solver returns, independently compute the delivered residual using the prepared canonical desired vector plus existing `cascadeMagnitudeDb()` and `calculateErrorMetrics()`. Require global RMSE/maxAbs agreement with the result within `1e-5 dB`; throw an infrastructure/data-integrity error if not.

Calculate regional metrics with existing `calculateBandMetrics()`; never duplicate its math.

- [ ] **Step 4: GREEN + commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/aggregate.test.ts \
  test/autoeq/v2/research/runner.test.ts
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(core): run and aggregate AutoEQ research cells"
git status --short
```

Stop after this commit. Do not run a real 15/30/60-second matrix yet.

---

### Task 5: Add baseline compatibility, deltas, monotonicity warnings, and artifact reports

**Codex task objective:** turn run/aggregate data into stable machine-readable artifacts and comparison logic, without requiring a baseline file to exist yet.

**Files:**
- Create: `packages/core/benchmarks/research/baseline.ts`
- Create: `packages/core/benchmarks/research/report.ts`
- Create: `packages/core/test/autoeq/v2/research/baseline.test.ts`
- Create: `packages/core/test/autoeq/v2/research/report.test.ts`

**Produces:**

```ts
export const RESEARCH_RUNNER_SCHEMA_VERSION = 1 as const
export const RESEARCH_CORPUS_SCHEMA_VERSION = 1 as const
export const RESEARCH_PARSER_PREPARATION_SCHEMA_VERSION = 1 as const

export interface ResearchBaselineIdentity {
  schemaVersion: 1
  implementationCommit: string
  corpusSchemaVersion: 1
  corpusHashes: Record<string, string>
  parserPreparationSchemaVersion: 1
  runnerSchemaVersion: 1
}

export function compareWithBaseline(
  candidate: readonly ResearchAggregateRow[],
  baseline: ResearchBaselineFile,
): ResearchComparison

export function findPracticalMonotonicityWarnings(
  aggregates: readonly ResearchAggregateRow[],
): ResearchWarning[]
```

- [ ] **Step 1: RED baseline compatibility tests**

Comparison is compatible only when all four raw corpus hashes, parser/preparation schema, and runner schema match.

Any identity mismatch returns exactly:

```ts
{ compatible: false, reason: 'baseline-incompatible', deltas: [] }
```

Do not partially compare a subset under incompatible identity.

- [ ] **Step 2: RED practical-monotonicity tests**

For the same case/maxFilters, warn when:

```text
RMSE(longer) > RMSE(shorter) + 0.05 dB
OR
maxAbs(longer) > maxAbs(shorter) + 0.10 dB
```

Check `15→30` and `30→60` only when both aggregate cells exist. Full uses aggregate medians.

- [ ] **Step 3: Implement artifact/report rendering**

Write exactly:

```text
summary.md
results.json
timeline.json
profile.json
metadata.json
```

`summary.md` order:

1. run metadata + baseline compatibility;
2. compact case/budget quality/runtime table;
3. baseline deltas;
4. time-to-quality;
5. stability spreads/outliers;
6. monotonicity warnings;
7. optional deep-profile hotspots.

Do not dump full filter lists into Markdown; `results.json` may retain filters for research inspection.

When deep profile is disabled, `profile.json` must be exactly equivalent to:

```json
{"enabled":false,"profiles":[]}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/baseline.test.ts \
  test/autoeq/v2/research/report.test.ts
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(core): report AutoEQ research regressions"
git status --short
```

Stop after this commit.

---

### Task 6: Add CLI presets, cheap end-to-end smoke, and manual GitHub Actions workflow

**Codex task objective:** make the research system runnable locally and in GitHub Actions while keeping expensive real-time runs out of ordinary CI.

**Files:**
- Modify: `packages/core/benchmarks/research/run.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/test/autoeq/v2/research/runner.test.ts`
- Create: `.github/workflows/autoeq-research.yml`

**Produces:**

```text
pnpm --filter @autoeq-workbench/core research:v2 -- <options>
pnpm --filter @autoeq-workbench/core research:v2:quick
pnpm --filter @autoeq-workbench/core research:v2:full
```

CLI options:

```text
--preset quick|full
--capacity 20,40
--oracle-120
--repeats N
--profile titan-to-storm:30
--output-dir <path>
--write-baseline
--baseline-implementation-commit <sha>
--test-mode
```

- [ ] **Step 1: RED CLI parser tests**

Pin presets:

```text
quick => cases all, budgets [15,30], maxFilters [10], repeats 1, light
full  => cases all, budgets [5,15,30,60], maxFilters [10], repeats 5, light
```

Rules:

- `--capacity 20,40` adds explicit capacity cells; it does not multiply the entire default matrix by all filter counts unless the runner explicitly defines those selected cells;
- `--oracle-120` adds diagnostic 120 s cells;
- `--profile` accepts exactly one approved `case:budget` and enables deep telemetry only for that cell;
- unsupported time limits, case IDs, nonpositive repeats, or malformed filter counts exit nonzero;
- `--test-mode` is incompatible with `--write-baseline`;
- `--write-baseline` requires `--baseline-implementation-commit` and produces baseline JSON from actual measured rows, never hand-authored metrics.

- [ ] **Step 2: Add package scripts**

```json
"research:v2": "tsx benchmarks/research/run.ts",
"research:v2:quick": "tsx benchmarks/research/run.ts --preset quick",
"research:v2:full": "tsx benchmarks/research/run.ts --preset full"
```

Default output directory: `./autoeq-research`.

- [ ] **Step 3: Implement `--test-mode` for cheap full-pipeline verification**

`--test-mode` must use fake/injected execution so it never waits for 15/30/60 real seconds. It must exercise corpus metadata, row assembly, aggregation, baseline-compatible/incompatible rendering paths, and artifact writing.

Mark test mode explicitly in `metadata.json`.

- [ ] **Step 4: GREEN local smoke**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
rm -rf /tmp/autoeq-research-smoke
pnpm --filter @autoeq-workbench/core research:v2 -- \
  --test-mode --output-dir /tmp/autoeq-research-smoke
find /tmp/autoeq-research-smoke -maxdepth 1 -type f -print | sort
```

Expected exactly the five artifact files.

- [ ] **Step 5: Create `.github/workflows/autoeq-research.yml`**

Use manual trigger only initially:

```yaml
name: AutoEQ Research Bench

on:
  workflow_dispatch:
    inputs:
      purpose:
        description: Compare candidate or capture baseline
        required: true
        default: compare
        type: choice
        options: [compare, baseline]
      preset:
        description: Research preset
        required: true
        default: quick
        type: choice
        options: [quick, full]
      repeats:
        description: Override repeat count (0 = preset default)
        required: true
        default: '0'
        type: string
      include_capacity:
        description: Include Max Filters 20 and 40 experiments
        required: true
        default: false
        type: boolean
      include_oracle_120:
        description: Include optional 120 second diagnostic
        required: true
        default: false
        type: boolean
      profile_cell:
        description: Optional case:budget, e.g. titan-to-storm:30
        required: false
        default: ''
        type: string
```

Permissions: `contents: read` only.

Use current CI environment exactly:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4
  with:
    version: 10.34.5
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: pnpm
- run: pnpm install --frozen-lockfile
- run: pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
- run: pnpm --filter @autoeq-workbench/core typecheck
```

For `purpose=baseline`, require/force the Full preset and pass:

```text
--write-baseline
--baseline-implementation-commit 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6
```

For `purpose=compare`, use the selected preset and optional inputs.

Upload artifacts with `actions/upload-artifact@v4`, `if: always()`, `if-no-files-found: error`, retention 30 days. Research quality regressions remain warnings; malformed corpus/baseline, runner exceptions, or missing artifacts fail.

- [ ] **Step 6: Prove ordinary CI was not changed**

```bash
git diff --exit-code 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6 -- .github/workflows/ci.yml
```

Expected exit 0.

- [ ] **Step 7: Directed diff + commit**

```bash
git diff --check
git diff -- packages/core/package.json packages/core/benchmarks/research \
  packages/core/test/autoeq/v2/research .github/workflows/autoeq-research.yml
git add packages/core/package.json packages/core/benchmarks/research \
  packages/core/test/autoeq/v2/research .github/workflows/autoeq-research.yml
git commit -m "ci: add AutoEQ research benchmark runner"
git status --short
```

Stop after this commit. Do **not** run Research Full locally in the Codex VM.

---

## External checkpoint A — capture the published-v2 baseline in GitHub Actions

This checkpoint is intentionally **not** a normal Codex implementation task. It prevents a Codex VM from spending a long session running the 5× repeated real-time Full matrix and follows Efficient Workflow v2's rule to avoid expensive repeated work when CI is the intended execution environment.

After Task 6 is pushed by an authorized operator:

1. dispatch `AutoEQ Research Bench` with `purpose=baseline`, `preset=full`, no capacity, no 120 s, no profile;
2. require workflow infrastructure success;
3. download the artifact;
4. inspect `metadata.json`, `summary.md`, and generated `baseline-standard-v2.json`;
5. verify baseline identity says implementation commit `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`, all four raw hashes match the amendment, and runner/parser schemas are `1`;
6. place the generated `baseline-standard-v2.json` at `packages/core/benchmarks/research/baseline-standard-v2.json` on the implementation branch.

If this external artifact is not available, **do not substitute a hand-written baseline and do not burn hours reproducing Full locally**. Stop with a compact handoff containing the exact implementation SHA that needs the baseline-capture workflow.

---

### Task 7: Pin the generated baseline and verify comparison plumbing

**Codex task objective:** commit only the baseline artifact generated by External checkpoint A and prove it is compatible with the current corpus/runner schema.

**Prerequisite:** `packages/core/benchmarks/research/baseline-standard-v2.json` must come from the successful baseline-capture workflow. If it is absent, stop `BLOCKED` and do not fabricate it.

**Files:**
- Add: `packages/core/benchmarks/research/baseline-standard-v2.json`
- Modify tests only if exact committed-path loading is not already covered.

- [ ] **Step 1: Verify baseline identity and data shape**

Run the baseline loader test and inspect the file identity. Require:

```text
implementationCommit = 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6
corpusSchemaVersion = 1
parserPreparationSchemaVersion = 1
runnerSchemaVersion = 1
all four corpus hashes match the raw-corpus amendment
```

- [ ] **Step 2: Prove trace plumbing has not become solver tuning**

```bash
git diff 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6 -- \
  packages/core/src/autoeq/v2/config.ts \
  packages/core/src/autoeq/v2/ranking.ts
```

Expected: no diff.

Run exact trace equivalence again:

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/telemetry.test.ts
```

- [ ] **Step 3: Test baseline loader/comparison and cheap smoke**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/baseline.test.ts \
  test/autoeq/v2/research/report.test.ts \
  test/autoeq/v2/research/runner.test.ts
rm -rf /tmp/autoeq-research-baseline-smoke
pnpm --filter @autoeq-workbench/core research:v2 -- \
  --test-mode --output-dir /tmp/autoeq-research-baseline-smoke
```

- [ ] **Step 4: Commit**

```bash
git diff --check
git add packages/core/benchmarks/research/baseline-standard-v2.json \
  packages/core/test/autoeq/v2/research
git commit -m "test(core): pin published Standard v2 research baseline"
git status --short
```

Stop after this commit.

---

### Task 8: Final code verification and implementation handoff

**Codex task objective:** verify the stabilized implementation exactly once at repository scope and leave a clean, reviewable branch. Do not make feature changes unless verification exposes a concrete defect.

**Files:** no expected product-code changes.

- [ ] **Step 1: Directed base→head review before expensive gates**

```bash
git diff --stat 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6...HEAD
git diff --check 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6...HEAD
git diff --name-only 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6...HEAD
```

Expected scope:

- research corpus/runner/report/baseline/workflow;
- research tests;
- opt-in v2 trace plumbing;
- already-approved research docs/AGENTS guidance.

Unexpected browser/session/UI/export changes are a blocker until explained or removed.

- [ ] **Step 2: Focused research suite**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
```

- [ ] **Step 3: Existing numerical gates once**

```bash
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/core benchmark:v2:holdout
```

Do not reinterpret known stress cases as newly required target-achieved cases; preserve existing benchmark acceptance semantics.

- [ ] **Step 4: Root global gates once**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
```

If a gate fails, fix the cause and rerun the failed gate + directly affected focused tests first. Repeat the entire global chain only if the correction plausibly affects multiple gates.

- [ ] **Step 5: Final cheap artifact smoke**

```bash
rm -rf /tmp/autoeq-research-final
pnpm --filter @autoeq-workbench/core research:v2 -- \
  --test-mode --output-dir /tmp/autoeq-research-final
find /tmp/autoeq-research-final -maxdepth 1 -type f -print | sort
```

Expected exactly:

```text
metadata.json
profile.json
results.json
summary.md
timeline.json
```

- [ ] **Step 6: Commit only if verification required a correction**

If no corrections were needed, do not create an empty verification commit. If a concrete defect was fixed, commit the smallest coherent fix after its focused test and relevant failed gate pass.

- [ ] **Step 7: Clean handoff**

```bash
git status --short
git log --oneline --decorate -8
```

Report exact HEAD SHA and the applicable verification results. Do not push unless the invoking prompt explicitly authorizes push.

---

## External checkpoint B — first Research Quick evidence

After an authorized push of the final implementation SHA:

1. require ordinary CI success for that exact SHA;
2. dispatch `AutoEQ Research Bench` with `purpose=compare`, `preset=quick`, no capacity, no 120 s, no profile;
3. inspect the uploaded artifact;
4. require all three case IDs and both 15/30 s cells;
5. confirm baseline compatibility, regional metrics, time-to-quality, stability fields, raw hashes, and readable `summary.md`;
6. record any monotonicity or baseline-regression warnings as research findings, not infrastructure failures.

This evidence closes the Research Bench infrastructure delivery. It does **not** authorize merging, deployment, or solver tuning.

---

## Acceptance checklist

The implementation is complete only when all are true:

- [ ] four approved raw files exist with stable names and exact approved SHA-256 values;
- [ ] Titan is the fixed source for Storm/U12t/Trio cases through the existing parser + canonical preparation + normalization path;
- [ ] tracing is opt-in and exact traced/untraced fake-clock output equality is proven;
- [ ] safe delivered quality timeline uses best accepted deliverables, not unquantized working states;
- [ ] time-to-quality thresholds and five fixed regional bands are reported;
- [ ] repeated real-clock runs aggregate best/median/worst/spread, target rate, termination distribution, and failure-aware threshold times;
- [ ] baseline compatibility is keyed by raw hashes + parser/preparation schema + runner schema;
- [ ] `summary.md`, `results.json`, `timeline.json`, `profile.json`, `metadata.json` are generated;
- [ ] Quick/Full/capacity/oracle/profile semantics match the approved spec;
- [ ] manual Research workflow is separate from ordinary CI and quality regressions are nonblocking initially;
- [ ] published-v2 baseline is generated by the research workflow, not handwritten;
- [ ] `.github/workflows/ci.yml` is unchanged;
- [ ] Standard v1 is numerically unchanged and Standard v2 decision logic/constants were not retuned;
- [ ] final focused, numerical, root, diff, and CI evidence is green for the exact reviewed SHA;
- [ ] first Research Quick artifact is readable and baseline-compatible.

## Self-review result

- **Spec coverage:** raw-corpus amendment, fixed Titan cases, 5/15/30/60 budgets, 120 diagnostic, opt-in 20/40 capacity, safe quality timeline, regional metrics, time-to-quality, stability aggregation, baseline compatibility, light/deep telemetry, artifacts, manual workflow, and no-solver-drift all map to explicit tasks/checkpoints.
- **Efficient Workflow v2:** one issue-sized task per Codex run; minimal context loading; single-agent default; focused-first/global-once; no local Full baseline burn; compact handoff; no routine E2E/visual tooling.
- **Prompt quality:** persistent rules stay in `AGENTS.md`; task prompts reference durable specs/plan instead of repeating them; objectives, paths, constraints, acceptance, and verification are explicit; first prompt is ready to paste into Codex.
- **Placeholder scan:** no implementation placeholder or hand-authored baseline metric remains. The only intentionally external inputs are workflow-generated baseline evidence and exact CI/Research run IDs, which are produced after implementation rather than invented in advance.
- **Type/order consistency:** research IDs, trace contracts, telemetry types, run rows, aggregates, baseline identity, and report outputs are defined before downstream use.
