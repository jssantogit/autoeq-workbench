# AutoEQ Solver Family Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a common solver-trajectory screening harness, run counterfactual diagnostics, prototype the approved algorithm families under comparable evaluation budgets, and select the small set of families that justify a later same-runtime adversarial/product-distillation plan.

**Architecture:** Screening stays research-only. Python solver adapters share the parity-tested surrogate DSP, Pareto/oracle data, canonical batch evaluator, and a common trajectory artifact. Current-v2-specific scheduling experiments that require exact internal semantics live in TypeScript research modules and must prove equivalence when used as wrappers around existing refinement. Cross-language screening ranks algorithmic efficiency primarily by canonical quality versus evaluation count/oracle regret; wall-clock is diagnostic only until a surviving family is implemented in the same Node/TypeScript runtime for the later 5/15/30/60-second tournament.

**Tech Stack:** Python 3.12, NumPy, SciPy, CMA-ES, pytest, TypeScript 6, Vitest 4, Node 22, tsx, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`

## Global Constraints

- Prerequisites: Research Foundation and Solver Oracles plans are complete and green.
- The frozen Oracle Calibration manifest is immutable input to this plan.
- Screening may allow isolated regressions; it is not product promotion evidence.
- Cross-language wall-clock numbers are not used to claim product speed wins.
- Primary screening comparison is canonical quality/oracle regret versus evaluation budget, with wall-clock as a secondary diagnostic.
- Every randomized adapter records an explicit seed.
- No new holdout data is opened or added in this plan.
- Standard v1 remains frozen and is used only as a seed/reference source.
- Production/default behavior, UI, session/export code, merge/deploy/release remain untouched.
- Previously rejected micro-optimizations are not repeated unless a new oracle/counterfactual result specifically justifies them.

---

## Execution Contract

Each numbered task is independently reviewable. Use focused tests and one coherent commit. Stop a family early if the plan's explicit screening gate says it is dominated; record the elimination artifact rather than extending it with ad-hoc tuning.

---

### Task 1: Define the common solver trajectory and screening result contract

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/trajectory.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/screening.py`
- Create: `research/solver-lab/tests/test_trajectory.py`
- Create: `research/solver-lab/tests/test_screening.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class SolverTrajectoryPoint:
    evaluation_count: int
    elapsed_ms: float
    candidate: SolverLabCandidate
    canonical_rmse_db: float
    canonical_max_abs_db: float
    oracle_regret: float

@dataclass(frozen=True)
class SolverRunResult:
    algorithm_id: str
    variant_id: str
    problem_id: str
    seed: int | None
    evaluation_budget: int
    trajectory: tuple[SolverTrajectoryPoint, ...]
    metadata: dict[str, str | int | float | bool]

class SolverAdapter(Protocol):
    algorithm_id: str
    def run(
        self,
        problem: SolverLabProblem,
        seed: int,
        evaluation_budget: int,
        oracle_frontier: Sequence[ObjectivePoint],
        canonical_evaluator: CanonicalEvaluator,
    ) -> SolverRunResult: ...
```

- [ ] **Step 1: Write RED trajectory invariant tests**

Require nondecreasing `evaluation_count`, nondecreasing `elapsed_ms`, matching problem/hash, and best-so-far canonical trajectory: a new point is recorded only if it is non-dominated relative to prior recorded points or improves the frozen reference selector result.

- [ ] **Step 2: Implement trajectory builder**

Provide:

```python
class TrajectoryBuilder:
    def consider(self, evaluation_count: int, elapsed_ms: float, candidate: SolverLabCandidate, evaluation: SolverLabEvaluation, regret: float) -> None: ...
    def finish(self) -> tuple[SolverTrajectoryPoint, ...]: ...
```

Candidate canonicalization is batched by adapters; the builder never evaluates DSP itself.

- [ ] **Step 3: Implement screening summary**

```python
@dataclass(frozen=True)
class ScreeningSummary:
    algorithm_id: str
    variant_id: str
    median_final_regret: float
    median_auc_regret: float
    solved_fraction: float
    catastrophic_regression_fraction: float
```

`median_auc_regret` integrates best-so-far normalized regret over log10 evaluation count, starting at evaluation 1. It is a screening metric only.

- [ ] **Step 4: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_trajectory.py research/solver-lab/tests/test_screening.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): add solver family screening contract"
```

---

### Task 2: Freeze the Reference Pareto Selector independently from solver generation

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/selector.py`
- Create: `research/solver-lab/tests/test_selector.py`
- Create: `packages/core/benchmarks/research/referenceSelector.ts`
- Create: `packages/core/test/autoeq/v2/research/referenceSelector.test.ts`

**Interfaces:**

Reference selector policy is exact and frozen for screening:

1. delivered target achieved (`rmse <= 0.25` and `maxAbs <= 0.75`) beats not achieved;
2. among target-achieved points, lower filter count, then lower RMSE, then lower maxAbs;
3. outside target, minimize normalized Euclidean violation:

```text
sqrt((rmse / 0.25)^2 + (maxAbs / 0.75)^2)
```

4. tie-break lower RMSE, lower maxAbs, lower cancellation score, lower filter count, stable candidate ID.

- [ ] **Step 1: Write identical RED selector test vectors in TS and Python**

Commit a small JSON fixture under `research/solver-lab/tests/fixtures/reference-selector-v1.json` with target-achieved, RMSE-heavy, maxAbs-heavy, and exact tie cases.

- [ ] **Step 2: Implement selector in both languages**

The Python implementation is for screening; TypeScript is the reference policy authority for later same-runtime studies. Both must select the same candidate ID for every fixture group.

- [ ] **Step 3: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_selector.py
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/referenceSelector.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab packages/core/benchmarks/research packages/core/test/autoeq/v2/research
git commit -m "feat(research): freeze reference Pareto selector"
```

---

### Task 3: Build current-v2 counterfactual work-allocation diagnostics before changing scheduling

**Files:**
- Create: `packages/core/benchmarks/research/counterfactual.ts`
- Create: `packages/core/benchmarks/research/counterfactualRun.ts`
- Create: `packages/core/test/autoeq/v2/research/counterfactual.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**

```ts
export interface CounterfactualRefinementNode {
  traceId: string
  parentKey: string
  resultKey: string
  origin: string
  cycleIndex: number
  coordinateTrials: number
  startRmseDb: number
  startMaxAbsDb: number
  endRmseDb: number
  endMaxAbsDb: number
  survivedStaging: boolean
  survivedActivePath: boolean
  contributedToBestDeliverable: boolean
}

export interface CounterfactualSummary {
  totalCoordinateTrials: number
  trialsOnNeverRetainedStates: number
  trialsOnNeverContributingStates: number
  positiveGainCycles: number
  zeroOrNegativeGainCycles: number
  bestObservedGainPer1000Trials: number | null
}
```

- [ ] **Step 1: Write RED pure-analysis tests**

Create a hand-built trace graph and assert exact trial accounting. Expired partial cycles are counted as attempted work but are never classified as completed positive/negative cycles.

- [ ] **Step 2: Implement trace-to-node conversion and summary**

Do not change solver code. This task consumes the hardened deep telemetry from the Foundation plan.

- [ ] **Step 3: Add research CLI**

```json
"research:counterfactual": "tsx benchmarks/research/counterfactualRun.ts"
```

CLI reads an existing deep artifact file and writes machine-readable summary plus a compact Markdown table.

- [ ] **Step 4: Run against the frozen control deep trace**

Capture at least Storm Max10 and U12t Max10 deep traces. Record the fraction of joint coordinate trials spent on states that never become active and never contribute to best deliverable.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/counterfactual.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json
git commit -m "feat(research): add v2 counterfactual allocation analysis"
```

---

### Task 4: Prototype Family B — sparse dictionary / matching pursuit

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/__init__.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/matching_pursuit.py`
- Create: `research/solver-lab/tests/test_matching_pursuit.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class DictionaryConfig:
    frequencies_per_octave: int
    pk_q_values: tuple[float, ...]
    include_shelves: bool

class MatchingPursuitSolver:
    algorithm_id = "matching-pursuit"
    def run(...)-> SolverRunResult: ...
```

Initial exact dictionary configuration:

```python
DictionaryConfig(
    frequencies_per_octave=24,
    pk_q_values=(0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0),
    include_shelves=True,
)
```

- [ ] **Step 1: Write RED atom/determinism tests**

Verify dictionary frequencies stay inside problem bounds, shelf Q is fixed, atom order is deterministic, and two runs with the same problem/seed/budget yield identical candidate sequences.

- [ ] **Step 2: Implement atom response matrix cache per problem**

Atoms are unit-gain responses. Use matrix correlation with current residual to select structural candidates. For selected atoms, solve bounded gains using SciPy `lsq_linear`, then nonlinear Powell polish and canonicalize checkpoints.

- [ ] **Step 3: Write one-peak and two-feature quality tests**

Within a fixed small evaluation budget, matching pursuit must identify a center within one dictionary step of the synthetic peak and reduce canonical RMSE versus zero filters.

- [ ] **Step 4: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_matching_pursuit.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): prototype matching pursuit solver"
```

---

### Task 5: Prototype Family C — time-limited global continuous search as a runtime family

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/global_continuous.py`
- Create: `research/solver-lab/tests/test_global_continuous.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class GlobalContinuousConfig:
    optimizer: Literal["de", "cma"]
    filter_count: int
    topology: tuple[str, ...]
    checkpoint_every_evaluations: int

class GlobalContinuousSolver:
    algorithm_id = "global-continuous"
    def run(...)-> SolverRunResult: ...
```

- [ ] **Step 1: Write RED budget/checkpoint tests**

Require no more than the declared evaluation budget and canonical checkpoints at deterministic evaluation-count boundaries.

- [ ] **Step 2: Implement adapter using Oracle optimizer primitives**

Unlike the oracle, this adapter gets one seed, one topology, and one strict evaluation budget. It may emit intermediate optimizer best points but may not use future/oracle information during the run.

- [ ] **Step 3: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_global_continuous.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): prototype bounded global solver"
```

---

### Task 6: Prototype Family D — structural beam search

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py`
- Create: `research/solver-lab/tests/test_structural_beam.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class StructuralBeamConfig:
    beam_width: int
    proposals_per_parent: int
    local_polish_evaluations: int

class StructuralBeamSolver:
    algorithm_id = "structural-beam"
    def run(...)-> SolverRunResult: ...
```

Initial screen variants are exactly:

```text
beam-4:  beam_width=4,  proposals_per_parent=8
beam-12: beam_width=12, proposals_per_parent=8
```

- [ ] **Step 1: Write RED beam retention tests**

Use synthetic candidate states where some proposals trade RMSE for maxAbs. Verify beam retention uses Pareto non-domination first, then the frozen Reference Pareto Selector only to trim beyond width.

- [ ] **Step 2: Implement structural proposals using the Deliverable Oracle mutation library**

No new mutation semantics are introduced here. Each retained state gets a bounded local polish budget and re-quantization before canonical checkpoint admission.

- [ ] **Step 3: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_structural_beam.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): prototype structural beam solver"
```

---

### Task 7: Export frozen v1 solutions as Family E seed proposals

**Files:**
- Create: `packages/core/benchmarks/research/v1SeedExport.ts`
- Create: `packages/core/test/autoeq/v2/research/v1SeedExport.test.ts`
- Modify: `packages/core/package.json`
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/v1_seeded.py`
- Create: `research/solver-lab/tests/test_v1_seeded.py`

**Interfaces:**

TypeScript CLI:

```text
pnpm --filter @autoeq-workbench/core research:v1-seeds -- --layer development --out <jsonl>
```

Seed record:

```ts
interface V1SeedRecordV1 {
  version: 1
  problemId: string
  inputSha256: string
  filters: Filter[]
  canonicalRmseDb: number
  canonicalMaxAbsDb: number
}
```

- [ ] **Step 1: Write RED v1 seed export tests**

Stub/small synthetic cases must prove the exporter calls the existing frozen `runStandardAutoEq()` entry point and does not mutate inputs. Do not modify v1 source.

- [ ] **Step 2: Implement exporter**

Normalize IDs into lab candidate IDs while preserving exact v1 filter parameters as seed values.

- [ ] **Step 3: Implement v1-seeded adapter**

`V1SeededSolver` consumes a seed record, canonicalizes it at evaluation count 0, then applies bounded Powell polish and optional structural beam proposals within the declared budget. It must also run a no-v1-seed control with identical polish/proposal budget for ablation.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/v1SeedExport.test.ts
pytest -q research/solver-lab/tests/test_v1_seeded.py
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json research/solver-lab
git commit -m "feat(research): add frozen v1 seed experiments"
```

---

### Task 8: Prototype Family A/F together as resumable refinement plus separate state-bank scheduling

**Files:**
- Modify: `packages/core/src/autoeq/v2/jointRefine.ts`
- Create: `packages/core/src/autoeq/v2/jointRefineContinuation.ts`
- Create: `packages/core/benchmarks/research/resumableScheduler.ts`
- Create: `packages/core/benchmarks/research/resumableRun.ts`
- Create: `packages/core/test/autoeq/v2/jointRefineContinuation.test.ts`
- Create: `packages/core/test/autoeq/v2/research/resumableScheduler.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**

```ts
export interface JointRefineContinuationV2 {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  nextCycleIndex: number
  done: boolean
}

export function createJointRefineContinuationV2(input: JointRefineInput): JointRefineContinuationV2

export function advanceJointRefineContinuationV2(
  continuation: JointRefineContinuationV2,
  input: Omit<JointRefineInput, 'solution'>,
  maxAdditionalCycles: number,
): JointRefineResult & { continuation: JointRefineContinuationV2 }
```

The existing `jointRefineV2()` becomes a compatibility wrapper that advances until the existing configured cycle limit/deadline and must remain bit-for-bit behavior equivalent on deterministic tests.

Research scheduler state:

```ts
export type ResearchStateOrigin = 'fresh' | 'resumed' | 'transferred' | 'v1-seeded'

export interface ScheduledResearchState {
  key: string
  origin: ResearchStateOrigin
  continuation: JointRefineContinuationV2
  lastCanonicalScore: number
  slicesReceived: number
}
```

- [ ] **Step 1: Write RED equivalence test before refactoring**

Capture existing `jointRefineV2` result fixtures for multiple PK/shelf/mixed solutions and 1/2/6-cycle configs. The future wrapper must return identical filters, metrics, completed cycles, coordinate trials, and expiration semantics.

- [ ] **Step 2: Extract continuation state with no behavior change**

Move one completed-cycle unit into `advanceJointRefineContinuationV2`; keep scale order, filter order, coordinate order, tie-breaks, cancellation-audit laziness, and deadline checks unchanged.

- [ ] **Step 3: Prove wrapper equivalence**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/jointRefineContinuation.test.ts
```

Any filter/metric/counter drift is a blocker.

- [ ] **Step 4: Write RED scheduler tests**

Construct fake continuations where rank-3 becomes best after later slices. Verify the scheduler can pause/resume states and that transferred/state-bank states do not consume the same fresh-state capacity before allocation.

- [ ] **Step 5: Implement two explicit policies**

Policy `resumable-beam-v1`: every fresh state receives one cycle, then global allocation gives one additional cycle at a time to the best selector-ranked/Pareto-useful states.

Policy `state-bank-v1`: identical fresh queue plus a separate transferred bank with at most one transfer slice for every two fresh slices; state-bank states never displace fresh states merely by being inserted into the same bounded array.

- [ ] **Step 6: Add research-only runner**

```json
"research:resumable": "tsx benchmarks/research/resumableRun.ts"
```

The runner emits the same schema-v2 provenance/trajectory contract and never changes `runStandardAutoEqV2()` default behavior.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefineContinuation.test.ts \
  test/autoeq/v2/research/resumableScheduler.test.ts \
  test/autoeq/v2/runStandardAutoEqV2.test.ts \
  test/autoeq/v2/progressiveDelivery.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/src/autoeq/v2 packages/core/benchmarks/research packages/core/test/autoeq/v2 packages/core/package.json
git commit -m "feat(research): prototype resumable v2 scheduling"
```

---

### Task 9: Add Family G oracle-distillation analysis without production ML

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/distillation.py`
- Create: `research/solver-lab/tests/test_distillation.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class DistilledRuleSummary:
    frequency_region: str
    filter_type: str
    median_q: float
    median_abs_gain_db: float
    frontier_support_fraction: float


def summarize_oracle_filters(frontier_candidates: Sequence[SolverLabCandidate]) -> tuple[DistilledRuleSummary, ...]
```

Frequency regions are exact:

```text
20-200
200-1000
1000-4000
4000-8000
8000-20000
```

- [ ] **Step 1: Write RED aggregation tests**

Use hand-built oracle candidates and assert region/type counts, medians, and support fractions exactly.

- [ ] **Step 2: Implement descriptive distillation only**

No learned model, training dependency, classifier, or production inference path is added. Produce machine-readable rule summaries that can inform later seed hypotheses.

- [ ] **Step 3: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_distillation.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): summarize oracle filter structure"
```

---

### Task 10: Implement successive-halving development screening across families

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/run_screening.py`
- Create: `research/solver-lab/tests/test_run_screening.py`
- Modify: `research/solver-lab/pyproject.toml`

**Interfaces:**

Entry point:

```toml
autoeq-screen-solvers = "autoeq_solver_lab.run_screening:main"
```

Exact evaluation-budget rounds:

```text
Round 1: 2,000 evaluations/case/seed
Round 2: 10,000 evaluations/case/seed
Round 3: 50,000 evaluations/case/seed
```

Initial seeds:

```text
11, 29, 47, 71, 101
```

- [ ] **Step 1: Write RED elimination tests**

Feed synthetic result tables where one variant is strictly dominated and one has a catastrophic case. Verify survivor selection is deterministic and uses the frozen Oracle Calibration manifest.

- [ ] **Step 2: Implement screening gate**

At each round, eliminate a variant only when both are true:

1. its median AUC regret is worse than the round median by at least the frozen `minimumAggregateFrontierGainFraction` margin in the wrong direction; and
2. it has no unique case where it is the best variant by final oracle regret.

Any variant with catastrophic-regression fraction above the frozen allowed per-case regression threshold is also eliminated.

- [ ] **Step 3: Run development screening**

Include at minimum:

```text
matching-pursuit
bounded-global-de
bounded-global-cma
structural-beam-4
structural-beam-12
v1-seeded
v1-seeded-ablation
resumable-beam-v1   # imported TypeScript results into the common artifact schema
state-bank-v1       # imported TypeScript results into the common artifact schema
```

For TypeScript research variants, use their recorded evaluation/trial counts for screening; do not compare raw Python/Node wall-clock as primary evidence.

- [ ] **Step 4: Produce explicit elimination report**

For every eliminated variant record:

```text
round
reason
median AUC regret
final regret distribution
catastrophic count
unique-win count
artifact hashes
```

Do not tune an eliminated variant further in this plan.

- [ ] **Step 5: Verify and commit screening runner**

```bash
pytest -q research/solver-lab/tests/test_run_screening.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): add successive-halving solver screening"
```

---

### Task 11: Select the families eligible for the later same-runtime adversarial tournament

**Files:**
- Create: `docs/superpowers/specs/2026-09-06-autoeq-solver-family-screening-results.md`
- No solver code changes in this task.

**Interfaces:**
- Produces a frozen screening decision with at most three surviving algorithmic families/components.

- [ ] **Step 1: Review screening artifacts against oracle gaps**

For each family report:

```text
quality vs evaluation frontier
final oracle regret
AUC regret
case-wise wins/losses
sensitivity across five seeds
canonicalization gap
wall-clock diagnostic only
implementation complexity
```

- [ ] **Step 2: Apply the selection rule**

Select at most three families/components that satisfy both:

1. materially different evidence of value on development cases, not merely a <1% noisy aggregate change;
2. a plausible path to Node/TypeScript/browser implementation if later adversarial evidence remains positive.

A family may survive as a component (for example matching-pursuit seeding) rather than as a complete solver.

- [ ] **Step 3: Commit the results document**

```bash
git add docs/superpowers/specs/2026-09-06-autoeq-solver-family-screening-results.md
git commit -m "docs: record AutoEQ solver family screening results"
```

- [ ] **Step 4: Stop at the research decision gate**

Do not write or implement the same-runtime adversarial winner here. The selected family is not knowable before screening, so the next implementation plan must be written from the actual results. That next plan will cover:

```text
selected-family TypeScript distillation
5/15/30/60 same-runner adversarial tournament
cross-family hybrid ablations where justified
frozen acceptance policy
holdout machinery and execution after explicit real-data approval
```

This stop is mandatory; inventing the winner in advance would invalidate the research design.

---

## Plan Completion Gate

This plan is complete only when:

1. all solver variants emit one common canonical trajectory contract;
2. the Reference Pareto Selector is frozen and parity-tested in Python/TypeScript;
3. current-v2 wasted-work/counterfactual diagnostics are quantified before scheduler changes;
4. sparse matching pursuit, bounded global search, structural beam, v1 seeding, resumable scheduling/state bank, and oracle-distillation evidence have been produced or explicitly eliminated by the defined gate;
5. screening uses comparable evaluation budgets rather than misleading cross-language timing claims;
6. every elimination is artifact-backed and reproducible;
7. at most three families/components are selected for the later same-runtime adversarial tournament;
8. no holdout is opened and no production behavior is promoted.

After this plan, write a new implementation plan from the actual screening-results document. Do not pre-commit to a production architecture before that evidence exists.