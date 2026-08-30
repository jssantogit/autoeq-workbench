# AutoEQ Research Bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible GitHub-Actions research benchmark for Standard AutoEQ v2 using the raw Titan S2/Storm/U12t/Trio corpus, real-time convergence/stability metrics, optional deep telemetry, and comparison against the published v2 baseline without changing solver behavior.

**Architecture:** Keep production numerical authority in `packages/core`. Add research-only corpus loading, metrics aggregation, reporting, and CLI code under `packages/core/benchmarks/research/`; add minimal opt-in trace plumbing through existing v2 modules; add a separate manually dispatched GitHub Actions workflow. The first delivery measures the current solver only and must prove telemetry does not change deterministic output.

**Tech Stack:** TypeScript 6, Vitest 4, Node 22, tsx, pnpm 10.34.5, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-30-autoeq-research-bench-design.md` plus the approved override `docs/superpowers/specs/2026-08-30-autoeq-research-bench-raw-corpus-amendment.md`

## Global Constraints

- Product baseline is exactly `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`.
- `standard-v1` remains frozen; no numerical v1 changes.
- This plan must not retune Standard v2, change `STANDARD_V2_CONFIG`, alter ranking/candidate logic, change target thresholds, or change UI behavior.
- The four raw measurement text files are approved repository benchmark data; filename-only renames must preserve byte content and SHA-256.
- Fixed source is Dunu Titan S2; targets are Subtonic Storm, 64 Audio U12t, and 64 Audio Trio.
- Stable case IDs are `titan-to-storm`, `titan-to-u12t`, `titan-to-trio`.
- Routine research budgets are `5 | 15 | 30 | 60`; 120 s is optional diagnostic only.
- Research Quick is `15/30 s`, Max Filters 10, one repeat, light telemetry.
- Research Full is `5/15/30/60 s`, Max Filters 10, five repeats, light telemetry.
- 20/40-filter capacity runs are opt-in and are not part of the default Full Cartesian matrix.
- Deep profile is opt-in for one selected case/budget and its wall time is never compared as production-equivalent runtime.
- `.github/workflows/ci.yml` must remain semantically unchanged.
- No deploy, release, solver tuning, or product promotion is part of this plan.

## Planned File Boundary

```text
packages/core/benchmarks/research/
  corpus.ts
  types.ts
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
  baseline-standard-v2.json

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
  baseline.test.ts
  report.test.ts
  runner.test.ts

.github/workflows/
  autoeq-research.yml
```

Research-only orchestration stays out of `src/`; only trace contracts/hooks belong beside production v2 code.

---

### Task 1: Commit and load the raw adversarial corpus

**Files:**
- Create: `packages/core/benchmarks/research/raw/dunu-titan-s2.txt`
- Create: `packages/core/benchmarks/research/raw/subtonic-storm.txt`
- Create: `packages/core/benchmarks/research/raw/64-audio-u12t.txt`
- Create: `packages/core/benchmarks/research/raw/64-audio-trio.txt`
- Create: `packages/core/benchmarks/research/types.ts`
- Create: `packages/core/benchmarks/research/corpus.ts`
- Test: `packages/core/test/autoeq/v2/research/corpus.test.ts`

**Interfaces:**
- Consumes: existing `parseCurveText`, `createEvaluationGrid`, `prepareCurve`, `desiredCorrection`, `DEFAULT_AUTOEQ_SETTINGS`.
- Produces:

```ts
export type ResearchCaseId = 'titan-to-storm' | 'titan-to-u12t' | 'titan-to-trio'

export interface ResearchCase {
  id: ResearchCaseId
  source: Curve
  target: Curve
}

export const RESEARCH_CORPUS_SHA256: Readonly<Record<string, string>>
export function loadResearchCases(): ResearchCase[]
export function prepareResearchDesired(caseId: ResearchCaseId): {
  frequenciesHz: number[]
  desiredDb: number[]
}
```

- [ ] **Step 1: Add the four raw files byte-for-byte**

Use the user-provided files. Rename only the filenames to the stable names above. Verify before committing:

```bash
sha256sum packages/core/benchmarks/research/raw/*.txt
```

Expected mapping:

```text
baa46f7ff6516597d6483a50739a32d0484fea1a509797e717e32b7f39305e7f  dunu-titan-s2.txt
13b3c259cb3b5c106eacac80aa5180c0ffb42d15196ff5e2bcce7d31aae6ed1a  subtonic-storm.txt
593b25ea63fd02e886dd9f1892df9d9d4e17c41ce95fdfbc52492979c61c769e  64-audio-u12t.txt
d172c28fd5884ecb40338eb43b75a486c09842abfac185b16be7e56122c90f20  64-audio-trio.txt
```

If any hash differs, stop; do not normalize line endings or reconstruct the data.

- [ ] **Step 2: Write the failing corpus test**

Pin exact IDs, parser coverage, canonical preparation, and finite desired values:

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

Also hash the raw file bytes in the test and compare with `RESEARCH_CORPUS_SHA256`.

- [ ] **Step 3: Run the test and observe RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/corpus.test.ts
```

Expected: FAIL because corpus modules/files do not exist.

- [ ] **Step 4: Implement the loader using existing core math**

Use `readFileSync(new URL('./raw/<name>.txt', import.meta.url), 'utf8')` and `parseCurveText()`.

Create Titan once per load as `kind: 'fr'`; create each target as `kind: 'target'`. `prepareResearchDesired()` must use:

```ts
const frequenciesHz = createEvaluationGrid()
const normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 } as const
const source = prepareCurve(researchCase.source, normalization, frequenciesHz)
const target = prepareCurve(researchCase.target, normalization, frequenciesHz)
return {
  frequenciesHz,
  desiredDb: desiredCorrection(source.db, target.db),
}
```

Do not create research-specific interpolation or normalization.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/corpus.test.ts
git add packages/core/benchmarks/research/raw packages/core/benchmarks/research/types.ts \
  packages/core/benchmarks/research/corpus.ts packages/core/test/autoeq/v2/research/corpus.test.ts
git commit -m "test(core): add real-world AutoEQ research corpus"
```

---

### Task 2: Add opt-in Standard v2 research trace plumbing with no behavior drift

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
- Test: `packages/core/test/autoeq/v2/research/telemetry.test.ts`

**Interfaces:**

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
  onSafeDeliverable?(checkpoint: StandardV2SafeCheckpoint): void
  onDiscreteTrial?(): void
  onDiscreteAcceptedMove?(): void
  onCompressionRemovalTrial?(): void
  onPeakWorkingFilterCount?(count: number): void
}
```

Extend runtime only additively:

```ts
export interface StandardV2Runtime {
  nowMs(): number
  onBoundaryModeAttempt?(mode: V2CandidateBoundaryMode): void // preserve compatibility
  researchTrace?: StandardV2ResearchTrace
}
```

- [ ] **Step 1: Write exact-output equivalence RED test**

Use a deterministic existing v2 benchmark-style synthetic case and a fake clock that never expires:

```ts
const withoutTrace = runStandardAutoEqV2(input, { nowMs: () => 0 })
const withTrace = runStandardAutoEqV2(input, {
  nowMs: () => 0,
  researchTrace: createCountingTestTrace(),
})
expect(withTrace).toEqual(withoutTrace)
```

Also verify callbacks fire (`safeDeliverables > 0`, `jointRefines > 0`) so equality is not passing because the trace is unused.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/telemetry.test.ts
```

Expected: type/module failure because `researchTrace` is not implemented.

- [ ] **Step 3: Add trace contracts and minimum hooks**

Rules:

- callbacks receive cloned/simple data where mutation could otherwise affect solver state;
- callbacks never call injected `runtime.nowMs()`;
- no trace callback return value is read;
- no trace branch changes candidate ordering, comparison, deadline checks, or loop counts;
- preserve existing `runtime.onBoundaryModeAttempt` behavior while also firing `researchTrace?.onBoundaryModeAttempt`.

Hook counts at these boundaries:

```text
generateV2Candidates result size         -> onCandidatesGenerated
rankV2CandidateShortlist result size     -> onCandidatesShortlisted
jointRefineV2 return                     -> onJointRefineCompleted(coordinateTrials)
accepted search checkpoint               -> onWorkingCheckpoint
buildDeliverableV2 successful return     -> onSafeDeliverable
cyclic discrete trial                    -> onDiscreteTrial
accepted discrete move                   -> onDiscreteAcceptedMove
compression removal candidate evaluation -> onCompressionRemovalTrial
search peak growth                       -> onPeakWorkingFilterCount
```

Wrap coarse phase calls with `onPhaseStart/onPhaseEnd` using `try/finally` where an exception could skip the end event.

- [ ] **Step 4: Run focused v2 tests**

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

Expected: PASS with exact deterministic output preserved.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/autoeq/v2 packages/core/src/index.ts \
  packages/core/test/autoeq/v2/research/telemetry.test.ts
git commit -m "feat(core): expose opt-in Standard v2 research trace"
```

---

### Task 3: Build light telemetry, quality timeline, regional metrics, and time-to-quality

**Files:**
- Create: `packages/core/benchmarks/research/telemetry.ts`
- Create: `packages/core/benchmarks/research/timeline.ts`
- Test: `packages/core/test/autoeq/v2/research/timeline.test.ts`

**Interfaces:**

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

- [ ] **Step 1: Write timeline RED tests with synthetic checkpoints**

Pin the marks and first-crossing behavior:

```ts
expect(RESEARCH_TIMELINE_MARKS_MS).toEqual([
  500, 1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000, 45000, 60000,
])
```

Use checkpoints at 400/900/1800 ms and prove the projected 500/1000/2000 marks select the latest safe best checkpoint available at or before each mark. Include an intentionally worse checkpoint and prove it is not allowed to regress the best-quality timeline according to `compareV2PrimaryMetrics`.

Pin `null` for never-reached thresholds.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/timeline.test.ts
```

- [ ] **Step 3: Implement collector**

Light collector uses its own monotonic measurement clock (`performance.now` by default) and never the optimizer deadline clock. On `onSafeDeliverable`, record elapsed time and cloned metrics/filter count.

Counters must expose at least:

```ts
{
  boundaryModeAttempts,
  candidatesGenerated,
  candidatesShortlisted,
  workingCheckpoints,
  deliverablesBuilt,
  peakWorkingFilterCount,
  jointRefinementCount,
  jointCoordinateTrials,
  discreteTrials,
  discreteAcceptedMoves,
  compressionRemovalTrials,
}
```

Deep mode additionally times `onPhaseStart/onPhaseEnd` pairs. Light mode must not call `performance.now()` for phase events.

- [ ] **Step 4: Add regional metric helper**

Use exactly:

```ts
export const RESEARCH_BANDS = [
  { id: 'bass', minHz: 20, maxHz: 200 },
  { id: 'low-mid', minHz: 200, maxHz: 1_000 },
  { id: 'mid', minHz: 1_000, maxHz: 4_000 },
  { id: 'presence', minHz: 4_000, maxHz: 8_000 },
  { id: 'treble', minHz: 8_000, maxHz: 20_000 },
] as const
```

Runner code later must call existing `calculateBandMetrics`; do not reimplement error math here.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/timeline.test.ts
git add packages/core/benchmarks/research/telemetry.ts \
  packages/core/benchmarks/research/timeline.ts \
  packages/core/test/autoeq/v2/research/timeline.test.ts
git commit -m "feat(core): collect AutoEQ research convergence telemetry"
```

---

### Task 4: Implement research run rows and stability aggregation

**Files:**
- Modify: `packages/core/benchmarks/research/types.ts`
- Create: `packages/core/benchmarks/research/aggregate.ts`
- Create: `packages/core/benchmarks/research/run.ts`
- Test: `packages/core/test/autoeq/v2/research/aggregate.test.ts`
- Test: `packages/core/test/autoeq/v2/research/runner.test.ts`

**Interfaces:**

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

export function aggregateResearchRuns(rows: readonly ResearchRunRow[]): ResearchAggregateRow[]
```

- [ ] **Step 1: Write RED aggregation tests**

Use three handcrafted run rows with RMSE values `[0.4, 0.2, 0.8]` and assert best `0.2`, median `0.4`, worst `0.8`, spread `0.6`. Pin target-achieved rate and termination distribution.

For time-to-quality, median ignores neither `null` nor failure. Define ordering for aggregation as `null = +Infinity`; if the median or worst selected value is failure, emit `null`. This prevents successful runs from hiding an unstable failure.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/aggregate.test.ts
```

- [ ] **Step 3: Implement one actual research run**

Create a pure callable function before CLI parsing:

```ts
export async function runResearchCell(options: {
  caseId: ResearchCaseId
  budgetSeconds: 5 | 15 | 30 | 60 | 120
  maxFilters: number
  repeatIndex: number
  telemetryMode: 'light' | 'deep'
  run?: typeof runStandardAutoEqV2
}): Promise<ResearchRunRow>
```

Build the v2 input from the raw corpus with `DEFAULT_AUTOEQ_SETTINGS` overrides. Measure total elapsed with `performance.now()` around `runStandardAutoEqV2()`.

After the result, independently compute delivered residual on the canonical prepared desired vector using existing `cascadeMagnitudeDb`, then calculate bands with `calculateBandMetrics`. Assert the independently computed global metrics agree with the result within `1e-5 dB`; throw an infrastructure error otherwise.

- [ ] **Step 4: Add fake runner test without real waits**

Inject a fake `run` that returns a typed `AutoEqResultV2` and fires deterministic trace/checkpoint events. Prove row assembly, band IDs, timeline, counters, and elapsed fields without executing a 15-second wall-clock run.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/aggregate.test.ts \
  test/autoeq/v2/research/runner.test.ts
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(core): run and aggregate AutoEQ research cells"
```

---

### Task 5: Add baseline compatibility, deltas, monotonicity warnings, and reports

**Files:**
- Create: `packages/core/benchmarks/research/baseline.ts`
- Create: `packages/core/benchmarks/research/report.ts`
- Test: `packages/core/test/autoeq/v2/research/baseline.test.ts`
- Test: `packages/core/test/autoeq/v2/research/report.test.ts`

**Interfaces:**

```ts
export const RESEARCH_RUNNER_SCHEMA_VERSION = 1 as const
export const RESEARCH_CORPUS_SCHEMA_VERSION = 1 as const

export interface ResearchBaselineIdentity {
  schemaVersion: 1
  implementationCommit: string
  corpusSchemaVersion: 1
  corpusHashes: Record<string, string>
  runnerSchemaVersion: 1
}

export function compareWithBaseline(
  candidate: ResearchAggregateRow[],
  baseline: ResearchBaselineFile,
): ResearchComparison

export function findPracticalMonotonicityWarnings(
  aggregates: readonly ResearchAggregateRow[],
): ResearchWarning[]
```

- [ ] **Step 1: Write baseline compatibility RED test**

Pin compatibility only when all raw corpus hashes and runner schema match. Any mismatch returns:

```ts
{ compatible: false, reason: 'baseline-incompatible', deltas: [] }
```

Do not partially compare a subset of cases under incompatible corpus identity.

- [ ] **Step 2: Write monotonicity RED tests**

For the same case/maxFilters, report a warning when:

```text
RMSE(longer) > RMSE(shorter) + 0.05
OR
maxAbs(longer) > maxAbs(shorter) + 0.10
```

Compare 15→30 and 30→60 only when both aggregate cells exist.

- [ ] **Step 3: Implement report rendering**

`summary.md` order:

1. run metadata and baseline compatibility;
2. compact case/budget table with RMSE/maxAbs/target rate/elapsed;
3. baseline deltas;
4. time-to-quality table;
5. stability outliers/spreads;
6. monotonicity warnings;
7. optional deep-profile hotspots.

Never put the full filter list in the Markdown summary.

- [ ] **Step 4: Pin artifact JSON shape in tests**

Report writer produces exactly:

```text
summary.md
results.json
timeline.json
profile.json
metadata.json
```

When deep profile is off, `profile.json` must serialize:

```json
{"enabled":false,"profiles":[]}
```

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/baseline.test.ts \
  test/autoeq/v2/research/report.test.ts
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(core): report AutoEQ research regressions"
```

---

### Task 6: Add CLI presets and package scripts

**Files:**
- Modify: `packages/core/benchmarks/research/run.ts`
- Modify: `packages/core/package.json`
- Test: `packages/core/test/autoeq/v2/research/runner.test.ts`

**Produces:**

```text
pnpm --filter @autoeq-workbench/core research:v2:quick
pnpm --filter @autoeq-workbench/core research:v2:full
pnpm --filter @autoeq-workbench/core research:v2 -- <explicit options>
```

- [ ] **Step 1: Add CLI parser tests**

Pin defaults:

```ts
quick => cases all, budgets [15,30], maxFilters [10], repeats 1, light
full  => cases all, budgets [5,15,30,60], maxFilters [10], repeats 5, light
```

Pin explicit optional flags:

```text
--capacity 20,40
--oracle-120
--repeats N
--profile titan-to-storm:30
--output-dir <path>
--write-baseline
```

Reject unsupported time limits and profile case IDs with a clear nonzero exit.

- [ ] **Step 2: Implement scripts**

In `packages/core/package.json` add:

```json
"research:v2": "tsx benchmarks/research/run.ts",
"research:v2:quick": "tsx benchmarks/research/run.ts --preset quick",
"research:v2:full": "tsx benchmarks/research/run.ts --preset full"
```

The runner writes to `./autoeq-research` by default and creates the directory recursively.

- [ ] **Step 3: Add a tiny test mode**

For CI/unit smoke only, support:

```text
--test-mode
```

It must not sleep or run real 15/30/60-second budgets. It runs one synthetic/fake-clock cell through the complete artifact writer. This flag must be visibly marked in `metadata.json` and must be rejected together with `--write-baseline`.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core research:v2 -- --test-mode --output-dir /tmp/autoeq-research-smoke
test -f /tmp/autoeq-research-smoke/summary.md
test -f /tmp/autoeq-research-smoke/results.json
test -f /tmp/autoeq-research-smoke/timeline.json
test -f /tmp/autoeq-research-smoke/profile.json
test -f /tmp/autoeq-research-smoke/metadata.json
git add packages/core/package.json packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(core): add AutoEQ research benchmark CLI"
```

---

### Task 7: Generate and pin the published-v2 baseline

**Files:**
- Create: `packages/core/benchmarks/research/baseline-standard-v2.json`
- Modify tests only if baseline loader needs exact committed path.

**Consumes:** research runner with telemetry equivalence already proven; raw corpus hashes.

- [ ] **Step 1: Verify no solver tuning has entered the branch**

Compare v2 algorithm constants/decision code against product baseline before generating data:

```bash
git diff 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6 -- \
  packages/core/src/autoeq/v2/config.ts \
  packages/core/src/autoeq/v2/ranking.ts
```

Expected: no diff.

Inspect trace-plumbed modules separately and confirm edits are instrumentation-only.

- [ ] **Step 2: Run focused equivalence tests again**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/telemetry.test.ts
```

Expected: PASS exact result equality.

- [ ] **Step 3: Generate baseline from the current research-enabled but numerically equivalent product solver**

Run the full matrix and write baseline identity as the published implementation commit:

```bash
pnpm --filter @autoeq-workbench/core research:v2:full -- \
  --write-baseline \
  --baseline-implementation-commit 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6 \
  --output-dir /tmp/autoeq-v2-baseline
```

`--write-baseline` must write `/tmp/autoeq-v2-baseline/baseline-standard-v2.json` from actual measured rows; never hand-edit metrics.

- [ ] **Step 4: Copy the generated baseline and verify identity**

```bash
cp /tmp/autoeq-v2-baseline/baseline-standard-v2.json \
  packages/core/benchmarks/research/baseline-standard-v2.json
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/baseline.test.ts
```

Test must assert `implementationCommit` equals the exact published SHA and corpus hashes equal Task 1.

- [ ] **Step 5: Run Quick against the committed baseline**

```bash
pnpm --filter @autoeq-workbench/core research:v2:quick -- --output-dir /tmp/autoeq-research-quick
```

Expected: baseline compatibility is true. Because solver behavior is equivalent, precision deltas should be close; real-clock elapsed/stability may naturally differ across runs.

- [ ] **Step 6: Commit generated baseline**

```bash
git add packages/core/benchmarks/research/baseline-standard-v2.json
git commit -m "test(core): pin published Standard v2 research baseline"
```

---

### Task 8: Add the manual GitHub Actions Research Bench workflow

**Files:**
- Create: `.github/workflows/autoeq-research.yml`
- Test indirectly with local CLI smoke plus workflow syntax review.

- [ ] **Step 1: Create workflow_dispatch inputs**

Use:

```yaml
name: AutoEQ Research Bench

on:
  workflow_dispatch:
    inputs:
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
        description: Include Max Filters 20 and 40 capacity experiments
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

- [ ] **Step 2: Match repository setup exactly**

Use the same versions as current CI:

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
```

- [ ] **Step 3: Validate before long execution**

Run:

```yaml
- run: pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
- run: pnpm --filter @autoeq-workbench/core typecheck
```

Then construct CLI flags from workflow inputs and run the selected preset with output directory `${{ runner.temp }}/autoeq-research`.

- [ ] **Step 4: Upload artifacts unconditionally after runner execution**

Use `actions/upload-artifact@v4` with:

```yaml
if: always()
with:
  name: autoeq-research-${{ github.sha }}
  path: ${{ runner.temp }}/autoeq-research
  if-no-files-found: error
  retention-days: 30
```

Research regressions do not cause failure in v1. Infrastructure exceptions, invalid corpus hashes, malformed baseline, or runner crashes do fail.

- [ ] **Step 5: Do not edit ordinary CI**

Verify:

```bash
git diff --exit-code 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6 -- .github/workflows/ci.yml
```

Expected: exit 0.

- [ ] **Step 6: Commit workflow**

```bash
git add .github/workflows/autoeq-research.yml
git commit -m "ci: add manual AutoEQ research benchmark"
```

---

### Task 9: Final verification and first Research Quick evidence

**Files:** no expected product-code changes; fix only defects discovered by verification.

- [ ] **Step 1: Directed diff review**

```bash
git diff --stat 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6...HEAD
git diff --check 7c9ebbbe6eefeb131c6c698055c737b429f5b0c6...HEAD
```

Expected scope: research corpus/runner/report/workflow, tests, optional v2 trace plumbing, docs. No web/UI or solver tuning files beyond trace plumbing.

- [ ] **Step 2: Focused tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
```

Expected: PASS.

- [ ] **Step 3: Frozen/current numerical gates**

```bash
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter @autoeq-workbench/core benchmark:v2
pnpm --filter @autoeq-workbench/core benchmark:v2:holdout
```

Expected: existing acceptance behavior remains green; do not reinterpret known stress cases as newly required target-achieved cases.

- [ ] **Step 4: Repository global gates**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
```

Expected: all PASS.

- [ ] **Step 5: Local artifact smoke**

```bash
rm -rf /tmp/autoeq-research-final
pnpm --filter @autoeq-workbench/core research:v2 -- --test-mode --output-dir /tmp/autoeq-research-final
find /tmp/autoeq-research-final -maxdepth 1 -type f -print | sort
```

Expected exactly the five artifact files defined by the spec.

- [ ] **Step 6: Push feature branch and dispatch Research Quick**

Push the implementation branch. Manually dispatch `.github/workflows/autoeq-research.yml` with `preset=quick`, no capacity, no 120 s, no profile.

Download the resulting artifact and verify:

```text
three case IDs present
15 s and 30 s cells present
baseline compatible
regional metrics present
time-to-quality present
raw corpus hashes match
summary.md renders without missing-data placeholders
```

Do not merge based only on the workflow starting; require completed/success infrastructure status and inspect the artifact.

- [ ] **Step 7: Record evidence in PR description or implementation handoff**

Record exact head SHA, workflow run ID, artifact name, test counts/gates, and any observed baseline/monotonicity warnings. Warnings are research findings, not blockers in this first infrastructure delivery.

Do not merge, deploy, or release unless separately authorized.

---

## Self-review result

- **Spec coverage:** raw-corpus override, three fixed Titan cases, 5/15/30/60 presets, 120 diagnostic, 10/20/40 capacity model, safe-deliverable timeline, regional metrics, time-to-quality, stability aggregation, baseline compatibility, light/deep telemetry, artifacts, manual workflow, and no-solver-drift requirements all map to tasks above.
- **Placeholder scan:** no `TBD`, `TODO`, unnamed handler, or unspecified test step remains. Baseline numeric values are deliberately generated by the runner in Task 7 rather than hand-authored.
- **Type consistency:** `ResearchCaseId`, `ResearchRunRow`, `ResearchAggregateRow`, `ResearchTimeToQuality`, `StandardV2ResearchTrace`, and baseline identities are introduced before downstream use.
- **Scope:** solver behavior changes are explicitly excluded; any optimization discovered from the benchmark requires a follow-on approved design/plan.
