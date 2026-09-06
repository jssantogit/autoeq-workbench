# AutoEQ Solver Research Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Standard v2 research telemetry, establish a versioned research artifact contract, add layered synthetic corpus support, and create a canonical TypeScript↔laboratory interchange boundary without changing production solver decisions.

**Architecture:** Keep all canonical DSP, parsing, product bounds, quantization, and final metric authority in `packages/core`. Research orchestration remains under `packages/core/benchmarks/research/`; only low-overhead trace contracts/hooks live beside Standard v2 code. The laboratory receives explicit versioned JSON problems/candidates and every frontier candidate is canonically re-evaluated by TypeScript before research claims are accepted.

**Tech Stack:** TypeScript 6, Vitest 4, Node 22, tsx, pnpm 10.34.5, GitHub Actions, JSON/JSONL interchange.

**Spec:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`

## Global Constraints

- Frozen production control baseline: `5dafaa50410b9fa3157c28a1f7757d676b33152a`.
- Research instrumentation starting point: `cb50d0c6519d6f8937353aea9309e2b686655968`.
- Standard v1 remains frozen.
- Do not change Standard v2 candidate/ranking/refinement/deliverable decisions in this plan; trace-only changes must be behavior-neutral.
- Deep telemetry is opt-in and must have negligible allocation/computation overhead when disabled.
- Existing approved raw research files are the only raw measurement data allowed; do not add new raw/private/user curves.
- Synthetic cases may be added under research-only paths.
- Canonical TypeScript evaluation is authoritative for every stored comparison/frontier point.
- Do not change browser UI, session schema, export behavior, default branch behavior, production deployment, or release configuration.
- Use focused tests first; run root/global gates only at the coherent endpoint.

---

## Execution Contract

At the start of each task:

```bash
git status --short
git log -1 --oneline
```

Read `AGENTS.md`, this task only, and the exact source files listed under **Files**. Use one agent by default. Every task ends with focused verification, `git diff --check`, a coherent commit, and a clean worktree. Do not push, merge, deploy, release, or publish unless separately authorized.

---

### Task 1: Make deep joint-refinement tracing semantically precise and near-zero-cost when disabled

**Files:**
- Modify: `packages/core/src/autoeq/v2/researchTrace.ts`
- Modify: `packages/core/src/autoeq/v2/jointRefine.ts`
- Modify: `packages/core/src/autoeq/v2/search.ts`
- Modify: `packages/core/src/autoeq/v2/deliverable.ts`
- Modify: `packages/core/benchmarks/research/telemetry.ts`
- Modify: `packages/core/benchmarks/research/types.ts`
- Test: `packages/core/test/autoeq/v2/jointRefine.test.ts`
- Test: `packages/core/test/autoeq/v2/search.test.ts`
- Test: `packages/core/test/autoeq/v2/research/telemetry.test.ts`

**Interfaces:**
- Consumes: existing `StandardV2ResearchTrace`, `StandardV2JointRefineRecord`, `createV2SolutionKey`, `createV2FilterKey`.
- Produces:

```ts
export type StandardV2JointRefineRetentionStage = 'staged-candidate' | 'active-path'

export interface StandardV2JointRefineRecord extends StandardV2JointRefineContext {
  resultKey: string
  resultMetrics: ErrorMetrics
  cycles: StandardV2JointRefineCycle[]
  completedCycles: number
  coordinateTrials: number
  expired: boolean
}

export interface ResearchJointRefineRecord extends StandardV2JointRefineRecord {
  equivalentStatePreviouslyAttempted: boolean
  equivalentStatePreviouslyCompleted: boolean
  survivedStagedCandidateRetention: boolean
  survivedActivePathRetention: boolean
  contributedToBestDeliverable: boolean
}
```

- Stable-state correlation uses `resultKey`/solution keys, not object identity, wherever logical equivalence is intended.

- [ ] **Step 1: Write RED tests for disabled-trace allocation/computation gating**

Add a focused test that invokes `jointRefineV2()` with `researchTrace` absent and with a trace object that has only counter callbacks, then verifies no detailed trace callback fires and result filters/metrics are identical.

```ts
const plain = jointRefineV2(baseInput)
const light = jointRefineV2({
  ...baseInput,
  researchTrace: { onJointRefineCompleted: () => { completed += 1 } },
})
expect(light.solution.filters).toEqual(plain.solution.filters)
expect(light.solution.metrics).toEqual(plain.solution.metrics)
expect(completed).toBe(1)
```

Also expose a test-only `JointRefineTrace` callback already supported by `jointRefineV2` and assert its coordinate-trial count remains identical; the RED condition is the source still allocates detailed cycle structures unconditionally.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/jointRefine.test.ts test/autoeq/v2/research/telemetry.test.ts
```

Expected: FAIL on the new semantic field names/attempt-vs-completion assertions.

- [ ] **Step 3: Gate detailed cycle bookkeeping behind the detailed callback**

Use one boolean at function entry:

```ts
const detailedJointTrace =
  input.researchContext !== undefined &&
  input.researchTrace?.onJointRefineTrace !== undefined

const cycles: StandardV2JointRefineCycle[] | undefined = detailedJointTrace ? [] : undefined
let cycleStartingSolution: V2EvaluatedSolution | undefined
let cycleTrialStart = 0
```

`recordCycle()` must return immediately when `cycles === undefined`; do not clone metrics or call `calculateV2NormalizedViolation()` outside detailed mode. Preserve `onJointRefineCompleted` as the cheap counter callback.

- [ ] **Step 4: Rename retention stages and update correlation**

Change the stage union and callback mapping exactly:

```ts
export type StandardV2JointRefineRetentionStage =
  | 'staged-candidate'
  | 'active-path'
```

At search call sites, emit `'staged-candidate'` for the pre-global staged candidate set and `'active-path'` for global active path retention. In telemetry, map directly to `survivedStagedCandidateRetention` and `survivedActivePathRetention`.

- [ ] **Step 5: Split attempted and completed equivalent-state bookkeeping**

Replace the single paid-key set with two sets:

```ts
const attemptedRefinementKeys = new Set<string>()
const completedRefinementKeys = new Set<string>()

const previouslyAttempted = attemptedRefinementKeys.has(record.refinementKey)
const previouslyCompleted = completedRefinementKeys.has(record.refinementKey)
attemptedRefinementKeys.add(record.refinementKey)
if (!record.expired) completedRefinementKeys.add(record.refinementKey)
```

Store both booleans on `ResearchJointRefineRecord`. An expired earlier attempt must never imply `equivalentStatePreviouslyCompleted === true`.

- [ ] **Step 6: Replace any logical retention object-identity check with solution-key membership**

Build retained-key sets from `createV2SolutionKey(path.solution.filters)` and compare traced `resultKey` against those sets. Keep object identity only where the code is intentionally checking the exact same object instance for performance internals.

- [ ] **Step 7: Run focused tests**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/search.test.ts \
  test/autoeq/v2/research/telemetry.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 8: Verify behavior-neutrality and commit**

Run the existing deterministic v2 search/progressive tests:

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/runStandardAutoEqV2.test.ts \
  test/autoeq/v2/progressiveDelivery.test.ts \
  test/autoeq/v2/searchProgress.test.ts
git diff --check
git add packages/core/src/autoeq/v2 packages/core/benchmarks/research packages/core/test/autoeq/v2
git commit -m "fix(research): harden Standard v2 refinement tracing"
```

---

### Task 2: Version the research artifact and provenance contract

**Files:**
- Create: `packages/core/benchmarks/research/artifactSchema.ts`
- Modify: `packages/core/benchmarks/research/types.ts`
- Modify: `packages/core/benchmarks/research/report.ts`
- Modify: `packages/core/benchmarks/research/run.ts`
- Test: `packages/core/test/autoeq/v2/research/report.test.ts`
- Test: `packages/core/test/autoeq/v2/research/runner.test.ts`

**Interfaces:**
- Consumes: existing `ResearchRunRow`, `ResearchAggregateRow`, timeline checkpoints, phase timing, filters.
- Produces:

```ts
export const RESEARCH_ARTIFACT_SCHEMA_VERSION = 2 as const

export interface ResearchProvenanceV2 {
  schemaVersion: 2
  repositorySha: string
  algorithmId: string
  algorithmVersion: string
  configurationId: string
  seed: number | null
  corpusVersion: string
  caseInputSha256: string
  nodeVersion: string
  pythonVersion: string | null
  runnerLabel: string | null
  timeBudgetSeconds: number
  maxFilters: number
}

export interface ResearchTrajectoryPointV2 {
  elapsedMs: number
  rmseDb: number
  maxAbsDb: number
  filterCount: number
  sourceSolutionKey: string | null
}
```

- [ ] **Step 1: Write RED schema tests**

Test that serialized JSON contains `schemaVersion: 2`, exact algorithm/config IDs, seed, corpus/input hashes, runtime versions, budget/filter cap, and ordered best-so-far trajectory.

```ts
expect(artifact.provenance).toMatchObject({
  schemaVersion: 2,
  algorithmId: 'standard-v2-control',
  algorithmVersion: '5dafaa50410b9fa3157c28a1f7757d676b33152a',
  seed: null,
  timeBudgetSeconds: 5,
  maxFilters: 10,
})
expect(artifact.trajectory.every((point, index, all) =>
  index === 0 || point.elapsedMs >= all[index - 1]!.elapsedMs,
)).toBe(true)
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/report.test.ts \
  test/autoeq/v2/research/runner.test.ts
```

Expected: FAIL because schema v2/provenance do not exist.

- [ ] **Step 3: Implement artifact schema helpers**

Create pure functions:

```ts
export function assertResearchProvenanceV2(value: ResearchProvenanceV2): void
export function normalizeBestSoFarTrajectory(
  points: readonly ResearchTrajectoryPointV2[],
): ResearchTrajectoryPointV2[]
```

`normalizeBestSoFarTrajectory` sorts by `elapsedMs`, removes exact duplicate timestamps by keeping the later/better point, and never invents new measurements.

- [ ] **Step 4: Populate provenance from the runner**

`run.ts` must accept explicit metadata instead of reading mutable global state deep inside reporting:

```ts
export interface ResearchRunMetadata {
  repositorySha: string
  algorithmId: string
  algorithmVersion: string
  configurationId: string
  seed: number | null
  corpusVersion: string
  caseInputSha256: string
  pythonVersion?: string | null
  runnerLabel?: string | null
}
```

Default control values are set only at the CLI boundary, not inside reusable runner functions.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/report.test.ts \
  test/autoeq/v2/research/runner.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(research): version solver research artifacts"
```

---

### Task 3: Add layered corpus registry and deterministic synthetic stress cases

**Files:**
- Create: `packages/core/benchmarks/research/syntheticCorpus.ts`
- Modify: `packages/core/benchmarks/research/corpus.ts`
- Modify: `packages/core/benchmarks/research/types.ts`
- Test: `packages/core/test/autoeq/v2/research/corpus.test.ts`
- Create: `packages/core/test/autoeq/v2/research/syntheticCorpus.test.ts`

**Interfaces:**
- Consumes: canonical evaluation grid and `Curve` shape; existing approved real cases.
- Produces:

```ts
export type ResearchCorpusLayer = 'development' | 'adversarial' | 'holdout'

export interface ResearchCaseDescriptor {
  id: string
  layer: ResearchCorpusLayer
  kind: 'real' | 'synthetic'
  source: Curve
  target: Curve
  inputSha256: string
  tags: readonly string[]
}

export function loadLayeredResearchCases(
  layer: Exclude<ResearchCorpusLayer, 'holdout'>,
): ResearchCaseDescriptor[]
```

Holdout loading is intentionally absent until separately approved real holdout data exists.

Synthetic IDs are exact and stable:

```text
synthetic-narrow-peak
synthetic-strong-shelf
synthetic-resonance-cluster
synthetic-alternating-sign
synthetic-irregular-hf
synthetic-boundary-pressure
synthetic-filter-saturation
synthetic-quantization-sensitive
```

- [ ] **Step 1: Write RED tests for stable layer membership and determinism**

```ts
const first = loadLayeredResearchCases('development')
const second = loadLayeredResearchCases('development')
expect(second).toEqual(first)
expect(first.every((entry) => entry.layer === 'development')).toBe(true)
expect(first.every((entry) => /^[a-f0-9]{64}$/.test(entry.inputSha256))).toBe(true)
```

For each synthetic case, assert finite samples across the canonical 20 Hz–20 kHz grid and verify a case-specific structural property; e.g. narrow-peak residual maximum occurs inside the configured narrow region and irregular-HF energy is concentrated above 4 kHz.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/corpus.test.ts \
  test/autoeq/v2/research/syntheticCorpus.test.ts
```

Expected: FAIL because layered/synthetic corpus APIs do not exist.

- [ ] **Step 3: Implement pure synthetic generators**

Use analytic log-frequency functions only; no random source unless a fixed numeric seed is passed and stored. Example helper shape:

```ts
function gaussianLogFeature(
  frequencyHz: number,
  centerHz: number,
  widthOctaves: number,
  gainDb: number,
): number {
  const x = Math.log2(frequencyHz / centerHz) / widthOctaves
  return gainDb * Math.exp(-0.5 * x * x)
}
```

Construct synthetic source as a 0 dB FR and target as the desired correction encoded as a target curve, then route both through the same preparation path as real cases.

- [ ] **Step 4: Register layers without adding holdout data**

Development contains a small balanced subset of synthetic cases plus one approved real diagnostic case. Adversarial contains the three Titan→Storm/U12t/Trio cases plus all eight synthetic stress cases. Do not expose a fake holdout.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/corpus.test.ts \
  test/autoeq/v2/research/syntheticCorpus.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(research): add layered synthetic solver corpus"
```

---

### Task 4: Define the versioned laboratory problem/candidate protocol

**Files:**
- Create: `packages/core/benchmarks/research/labProtocol.ts`
- Create: `packages/core/benchmarks/research/labInterop.ts`
- Test: `packages/core/test/autoeq/v2/research/labInterop.test.ts`

**Interfaces:**
- Consumes: prepared desired response, Standard v2/product bounds, canonical band metrics, cancellation audit, `Filter`.
- Produces:

```ts
export const SOLVER_LAB_PROTOCOL_VERSION = 1 as const

export interface SolverLabProblemV1 {
  protocolVersion: 1
  problemId: string
  inputSha256: string
  sampleRateHz: 48000
  frequenciesHz: number[]
  desiredDb: number[]
  allowedFilterTypes: ['PK', 'LS', 'HS']
  bounds: {
    minFrequencyHz: number
    maxFrequencyHz: number
    minGainDb: number
    maxGainDb: number
    minPkQ: number
    maxPkQ: number
    shelfQ: number
    maxFilters: number
  }
  quantization: {
    frequencyStepHz: 1
    gainStepDb: 0.1
    qStep: 0.01
  }
}

export interface SolverLabCandidateV1 {
  protocolVersion: 1
  problemId: string
  inputSha256: string
  candidateId: string
  algorithmId: string
  seed: number | null
  filters: Filter[]
}

export interface SolverLabEvaluationV1 {
  protocolVersion: 1
  candidateId: string
  valid: boolean
  rejectionReason: string | null
  continuous: {
    rmseDb: number
    maxAbsDb: number
    bandRmseDb: Record<string, number>
  } | null
  deliverable: {
    filters: Filter[]
    rmseDb: number
    maxAbsDb: number
    bandRmseDb: Record<string, number>
    cancellationTotalScore: number
  } | null
}

export function createSolverLabProblem(
  researchCase: ResearchCaseDescriptor,
  maxFilters: number,
): SolverLabProblemV1

export function evaluateSolverLabCandidate(
  problem: SolverLabProblemV1,
  candidate: SolverLabCandidateV1,
): SolverLabEvaluationV1
```

- [ ] **Step 1: Write RED protocol round-trip tests**

Test JSON stringify/parse stability, wrong hash rejection, unsupported type rejection, bounds rejection, and canonical metric calculation for a known one-filter candidate.

```ts
const problem = createSolverLabProblem(caseDescriptor, 10)
const candidate = makeCandidate(problem, [{
  id: 'lab-1', enabled: true, type: 'PK', frequencyHz: 1000, gainDb: 2, q: 1,
}])
const evaluation = evaluateSolverLabCandidate(problem, candidate)
expect(evaluation.valid).toBe(true)
expect(evaluation.continuous?.rmseDb).toBeGreaterThanOrEqual(0)
expect(evaluation.deliverable?.filters[0]?.frequencyHz).toBe(1000)
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/labInterop.test.ts
```

Expected: FAIL because protocol modules do not exist.

- [ ] **Step 3: Implement problem creation using existing product constants**

Import the actual `POWERAMP_MANUAL_ENTRY_POLICY` and Standard v2 config/settings conversion. Do not duplicate numeric policy values except in literal protocol type assertions that are verified against the imported authority.

- [ ] **Step 4: Implement canonical evaluation**

Continuous evaluation uses exact cascade response on `problem.frequenciesHz`. Deliverable evaluation applies the existing product quantization path and existing deliverable/cancellation metric helpers. Reject malformed/foreign candidates before numeric evaluation.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/labInterop.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(research): add canonical solver lab protocol"
```

---

### Task 5: Add a JSONL CLI for exporting problems and canonically evaluating laboratory candidates

**Files:**
- Create: `packages/core/benchmarks/research/labCli.ts`
- Modify: `packages/core/package.json`
- Test: `packages/core/test/autoeq/v2/research/labCli.test.ts`

**Interfaces:**
- Consumes: `createSolverLabProblem`, `evaluateSolverLabCandidate`, layered corpus registry.
- Produces CLI commands:

```text
pnpm --filter @autoeq-workbench/core research:lab -- export-problems --layer development --max-filters 10 --out <file>
pnpm --filter @autoeq-workbench/core research:lab -- evaluate-jsonl --problems <file> --candidates <file> --out <file>
```

Package script:

```json
"research:lab": "tsx benchmarks/research/labCli.ts"
```

- [ ] **Step 1: Write RED CLI tests using a temporary directory**

Spawn the CLI through Node/tsx, export development problems, then evaluate one valid candidate and one wrong-hash candidate. Assert one JSON object per line, deterministic ordering by `problemId`, and exit code `0` for valid batch processing.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/labCli.test.ts
```

Expected: FAIL because command does not exist.

- [ ] **Step 3: Implement strict argument parsing without adding a CLI dependency**

Accept only the documented subcommands/options. Missing/duplicate/unknown options exit nonzero with a concise stderr message. Write output atomically via `<out>.tmp` then rename.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/labCli.test.ts
pnpm --filter @autoeq-workbench/core typecheck
pnpm --filter @autoeq-workbench/core research:lab -- export-problems --layer development --max-filters 10 --out /tmp/autoeq-lab-problems.jsonl
wc -l /tmp/autoeq-lab-problems.jsonl
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json
git commit -m "feat(research): add solver lab interchange CLI"
```

---

### Task 6: Extend Research Bench with fine checkpoints and Round-0 diagnostic summaries

**Files:**
- Modify: `packages/core/benchmarks/research/timeline.ts`
- Modify: `packages/core/benchmarks/research/aggregate.ts`
- Modify: `packages/core/benchmarks/research/report.ts`
- Modify: `packages/core/benchmarks/research/run.ts`
- Test: `packages/core/test/autoeq/v2/research/timeline.test.ts`
- Test: `packages/core/test/autoeq/v2/research/aggregate.test.ts`
- Test: `packages/core/test/autoeq/v2/research/report.test.ts`

**Interfaces:**
- Fine diagnostic checkpoints:

```ts
export const RESEARCH_FINE_CHECKPOINTS_SECONDS = [
  0.5, 1, 2, 3, 5, 10, 15, 30, 60,
] as const
```

- Diagnostic aggregate:

```ts
export interface ResearchWorkEfficiencySummary {
  jointRefineRecords: number
  expiredJointRefines: number
  previouslyAttemptedEquivalent: number
  previouslyCompletedEquivalent: number
  retainedAfterStaging: number
  retainedAsActivePath: number
  contributedToBestDeliverable: number
  coordinateTrials: number
  coordinateTrialsContributingToBest: number
  medianNormalizedViolationGainPerCompletedCycle: number | null
  timeToBestMs: number | null
  timeSinceLastImprovementMs: number | null
}
```

- [ ] **Step 1: Write RED timeline and aggregate tests**

Use synthetic telemetry records with known cycle gains/retentions and assert exact counts plus monotonic best-so-far projection at the fine checkpoints.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/timeline.test.ts \
  test/autoeq/v2/research/aggregate.test.ts \
  test/autoeq/v2/research/report.test.ts
```

Expected: FAIL on missing checkpoint/efficiency fields.

- [ ] **Step 3: Implement diagnostics as pure aggregation over stored trace data**

Do not add new solver callbacks in this task. The report must distinguish `0` from unavailable (`null`), especially for time-to-best and cycle-gain medians.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(research): report solver work efficiency"
```

---

### Task 7: Coherent foundation verification and control artifact capture

**Files:**
- Modify only if required by verification: `.github/workflows/autoeq-research.yml`
- No solver behavior changes allowed.

**Interfaces:**
- Produces one reproducible Round-0 artifact set for the frozen control with schema v2 and deep telemetry on a selected adversarial cell.

- [ ] **Step 1: Run the full focused core research suite**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 2: Run a local Quick control smoke**

```bash
pnpm --filter @autoeq-workbench/core research:v2:quick
```

Expected: completes and emits schema-v2 artifacts with control algorithm/version metadata.

- [ ] **Step 3: Compare control quality against the frozen baseline**

Use the existing baseline comparison path. Any delivered-filter or metric drift attributable to Task 1 trace changes is a blocker; telemetry/report schema changes are expected.

- [ ] **Step 4: Run repository endpoint gates**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit any workflow-only adjustment and stop**

If `.github/workflows/autoeq-research.yml` needed an explicit `research:lab`/artifact upload adjustment, commit only that change:

```bash
git add .github/workflows/autoeq-research.yml
git commit -m "ci(research): publish solver research foundation artifacts"
```

Otherwise do not create an empty commit.

The exact pushed SHA and its GitHub Actions result are the final executable evidence for the Research Foundation milestone.

---

## Plan Completion Gate

This plan is complete only when:

1. disabled/light telemetry preserves solver decisions and avoids detailed cycle bookkeeping;
2. equivalent-state telemetry distinguishes attempted from completed work;
3. retention semantics are named correctly and key-correlated;
4. research artifacts carry schema-v2 provenance and fine best-so-far trajectories;
5. development/adversarial layered corpus loading is deterministic with eight synthetic stress cases and no fake holdout;
6. the solver-lab JSON protocol and canonical TypeScript evaluator are tested and usable from CLI;
7. Round-0 control artifacts are reproducible and quality-identical to the frozen control.

Do not start oracle implementation until this gate passes.