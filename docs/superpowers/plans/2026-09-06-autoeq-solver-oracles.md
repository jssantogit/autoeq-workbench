# AutoEQ Solver Oracles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reproducible Continuous and Deliverable Oracles that estimate best-known Pareto frontiers for the solver research corpus while preserving canonical TypeScript evaluation as the final authority.

**Architecture:** A research-only Python package under `research/solver-lab/` performs high-compute optimization using NumPy/SciPy and CMA-ES. It consumes `SolverLabProblemV1` JSONL exported by TypeScript, uses a parity-tested surrogate DSP for fast inner loops, emits candidate JSONL, and submits all frontier admissions back through the canonical TypeScript evaluator. Oracle frontiers are stored as versioned artifacts with optimizer/seed provenance rather than as production code.

**Tech Stack:** Python 3.12, NumPy 2.x, SciPy 1.14+, `cma` 4.x, pytest 8.x, TypeScript 6, Node 22, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`

## Global Constraints

- Prerequisite: `docs/superpowers/plans/2026-09-06-autoeq-solver-research-foundation.md` is complete and its exact SHA is green.
- Canonical TypeScript DSP/evaluation remains authoritative for stored oracle points.
- Python DSP/metrics are surrogate acceleration only and must be parity-tested against TypeScript before any optimizer result is trusted.
- Continuous Oracle and Deliverable Oracle remain distinct.
- Oracle fronts are multiobjective; global RMSE and global maxAbs are mandatory Pareto axes.
- Standard v1 and production Standard v2 remain frozen.
- Offline compute may be aggressive; product 5/15/30/60-second budgets do not constrain oracle runtime.
- All randomized runs record explicit numeric seeds.
- Do not add new raw/private/user measurement data.
- Do not merge/deploy/release/publish production behavior from this plan.

---

## Execution Contract

Each task uses one coherent branch/worktree, TDD first, focused verification, one coherent commit, and a clean worktree before moving on. Python result files belong under ignored local/artifact directories unless a small deterministic fixture is intentionally versioned.

---

### Task 1: Create the isolated Python solver-lab package and deterministic protocol types

**Files:**
- Create: `research/solver-lab/pyproject.toml`
- Create: `research/solver-lab/src/autoeq_solver_lab/__init__.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/types.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/io.py`
- Create: `research/solver-lab/tests/test_io.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: JSONL produced by `packages/core/benchmarks/research/labCli.ts`.
- Produces:

```python
@dataclass(frozen=True)
class LabFilter:
    id: str
    enabled: bool
    type: Literal["PK", "LS", "HS"]
    frequencyHz: float
    gainDb: float
    q: float

@dataclass(frozen=True)
class SolverLabProblem:
    protocolVersion: Literal[1]
    problemId: str
    inputSha256: str
    sampleRateHz: int
    frequenciesHz: tuple[float, ...]
    desiredDb: tuple[float, ...]
    allowedFilterTypes: tuple[str, ...]
    bounds: dict[str, float | int]
    quantization: dict[str, float]

@dataclass(frozen=True)
class SolverLabCandidate:
    protocolVersion: Literal[1]
    problemId: str
    inputSha256: str
    candidateId: str
    algorithmId: str
    seed: int | None
    filters: tuple[LabFilter, ...]

@dataclass(frozen=True)
class CanonicalMetricSet:
    rmseDb: float
    maxAbsDb: float
    bandRmseDb: dict[str, float]

@dataclass(frozen=True)
class SolverLabEvaluation:
    protocolVersion: Literal[1]
    candidateId: str
    valid: bool
    rejectionReason: str | None
    continuous: CanonicalMetricSet | None
    deliverable: CanonicalMetricSet | None
    deliverableFilters: tuple[LabFilter, ...]
    cancellationTotalScore: float | None
```

- [ ] **Step 1: Write RED parser tests**

```python
def test_problem_round_trip_rejects_wrong_protocol(tmp_path):
    path = tmp_path / "problem.jsonl"
    path.write_text('{"protocolVersion":2}\n', encoding="utf-8")
    with pytest.raises(ValueError, match="protocolVersion"):
        list(read_problems(path))
```

Also test finite numeric arrays, SHA-256 shape, filter-type validation, deterministic JSON output ordering, seed preservation, and parsing of valid/invalid canonical evaluations.

- [ ] **Step 2: Run RED**

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e 'research/solver-lab[test]'
pytest -q research/solver-lab/tests/test_io.py
```

Expected: FAIL because package does not exist.

- [ ] **Step 3: Create exact package metadata**

`pyproject.toml` must declare:

```toml
[project]
name = "autoeq-solver-lab"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "numpy>=2.1,<3",
  "scipy>=1.14,<2",
  "cma>=4,<5",
]

[project.optional-dependencies]
test = ["pytest>=8,<9"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Do not add Jupyter, pandas, plotting, ML, or workflow libraries in this task.

- [ ] **Step 4: Implement strict typed readers/writers**

Unknown required enum values and malformed non-finite numeric data raise `ValueError`. Protocol v1 stays strict; do not silently preserve unknown fields.

- [ ] **Step 5: Ignore local heavy artifacts**

Add only:

```gitignore
research/solver-lab/.venv/
research/solver-lab/.artifacts/
research/solver-lab/.cache/
```

Do not ignore versioned fixtures/tests/source.

- [ ] **Step 6: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_io.py
git diff --check
git add research/solver-lab .gitignore
git commit -m "feat(research): scaffold Python solver lab"
```

---

### Task 2: Implement a parity-tested Python biquad/cascade surrogate

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/dsp.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/metrics.py`
- Create: `research/solver-lab/tests/fixtures/canonical-response-v1.json`
- Create: `research/solver-lab/tests/test_dsp_parity.py`
- Create: `packages/core/benchmarks/research/parityFixture.ts`
- Create: `packages/core/test/autoeq/v2/research/parityFixture.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Consumes: product RBJ biquad/cascade formulas and canonical evaluation grid.
- Produces Python functions:

```python
def biquad_magnitude_db(
    frequencies_hz: np.ndarray,
    sample_rate_hz: float,
    filter_: LabFilter,
) -> np.ndarray

def cascade_response_db(
    frequencies_hz: np.ndarray,
    sample_rate_hz: float,
    filters: Sequence[LabFilter],
) -> np.ndarray

def error_metrics(desired_db: np.ndarray, actual_db: np.ndarray) -> tuple[float, float]
```

- TypeScript fixture command:

```text
pnpm --filter @autoeq-workbench/core research:parity-fixture
```

- [ ] **Step 1: Write RED TypeScript fixture-generation test**

The fixture generator must produce deterministic cases containing PK, LS, HS, mixed cascades, product-boundary values, and frequency samples across 20 Hz–20 kHz. Test two consecutive serializations are byte-identical.

- [ ] **Step 2: Implement the TypeScript fixture generator and commit fixture bytes**

Fixture schema:

```ts
interface CanonicalResponseFixtureV1 {
  version: 1
  sampleRateHz: 48000
  frequenciesHz: number[]
  cases: Array<{
    id: string
    filters: Filter[]
    responseDb: number[]
  }>
}
```

Generate the versioned JSON file through the canonical core DSP path. Do not hand-author expected response numbers.

- [ ] **Step 3: Write RED Python parity tests**

```python
assert np.max(np.abs(actual - expected)) <= 1e-9
```

Use `1e-9 dB` for the committed deterministic fixture. If platform math proves this too strict, stop and document measured drift before changing the threshold; do not loosen silently.

- [ ] **Step 4: Implement RBJ surrogate formulas in Python**

Mirror the TypeScript coefficient formulas and complex frequency-response evaluation exactly enough to satisfy the fixture. Keep each filter type in one small function; avoid optimizer logic in `dsp.py`.

- [ ] **Step 5: Verify metrics parity**

Add cases where expected RMSE/maxAbs are generated canonically by TypeScript and require Python absolute error `<= 1e-10 dB` for those scalar metrics.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/parityFixture.test.ts
pnpm --filter @autoeq-workbench/core research:parity-fixture
pytest -q research/solver-lab/tests/test_dsp_parity.py
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json
git commit -m "feat(research): add canonical DSP parity fixture"
```

---

### Task 3: Implement deterministic Pareto archive and regret utilities

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/pareto.py`
- Create: `research/solver-lab/tests/test_pareto.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class ObjectivePoint:
    candidate_id: str
    rmse_db: float
    max_abs_db: float
    filter_count: int


def dominates(a: ObjectivePoint, b: ObjectivePoint, eps: float = 1e-12) -> bool

def nondominated(points: Sequence[ObjectivePoint]) -> tuple[ObjectivePoint, ...]

def normalized_regret(
    point: ObjectivePoint,
    frontier: Sequence[ObjectivePoint],
    rmse_scale: float = 0.25,
    max_abs_scale: float = 0.75,
) -> float
```

`normalized_regret` is a diagnostic distance to the nearest frontier point in normalized RMSE/maxAbs space; it is not a production selector.

- [ ] **Step 1: Write RED dominance tests**

Cover equal points, one-axis improvements, strict domination, epsilon behavior, deterministic output ordering by `(rmse_db, max_abs_db, filter_count, candidate_id)`.

- [ ] **Step 2: Run RED**

```bash
pytest -q research/solver-lab/tests/test_pareto.py
```

- [ ] **Step 3: Implement pure Pareto utilities**

No NumPy dependency is required in `pareto.py`; keep it deterministic and easy to audit.

- [ ] **Step 4: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_pareto.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): add Pareto oracle utilities"
```

---

### Task 4: Build the Continuous Oracle optimizer adapters

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/objectives.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/optimizers/base.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/optimizers/differential_evolution.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/optimizers/cma_es.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/optimizers/powell.py`
- Create: `research/solver-lab/tests/test_objectives.py`
- Create: `research/solver-lab/tests/test_optimizers.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class ContinuousVectorLayout:
    filter_count: int
    filter_types: tuple[str, ...]


def enumerate_oracle_layouts(filter_count: int) -> tuple[ContinuousVectorLayout, ...]: ...

def decode_vector(problem: SolverLabProblem, layout: ContinuousVectorLayout, x: np.ndarray) -> tuple[LabFilter, ...]

def scalarized_objective(
    problem: SolverLabProblem,
    layout: ContinuousVectorLayout,
    x: np.ndarray,
    rmse_weight: float,
    max_abs_weight: float,
) -> float

class ContinuousOptimizer(Protocol):
    algorithm_id: str
    def optimize(self, problem: SolverLabProblem, layout: ContinuousVectorLayout, seed: int, objective_weights: tuple[float, float], evaluation_budget: int) -> SolverLabCandidate: ...
```

Exact outer topology ensemble for every `filter_count = N`:

```text
N PK
1 LS + (N-1) PK
(N-1) PK + 1 HS
1 LS + (N-2) PK + 1 HS   # only when N >= 2
```

Filter order is canonicalized as LS first, then PK ordered by frequency, then HS. The Continuous Oracle is explicitly best-known rather than a proof of all possible repeated-shelf topologies; Deliverable Oracle structural mutation is responsible for testing additional type structure.

- [ ] **Step 1: Write RED vector-decoding and topology tests**

Require exactly the four layouts above where legal, no duplicate layout for `N=1`, log-frequency coordinates, bounded linear gain coordinates, and log-Q coordinates for PK. Shelves always decode with `problem.bounds["shelfQ"]`.

- [ ] **Step 2: Implement vector layout/decoding**

Do not let optimizers produce out-of-bound filters. Stable candidate IDs use:

```python
f"{algorithm_id}:{problem.problemId}:{seed}:{layout.filter_count}:{run_index}"
```

- [ ] **Step 3: Write RED optimizer smoke tests**

Use a tiny synthetic one-peak problem and `evaluation_budget=200`; require each adapter to improve over a zero-filter baseline in RMSE, not to reach a fragile exact numeric optimum.

- [ ] **Step 4: Implement Differential Evolution adapter**

Use SciPy `differential_evolution`, explicit `seed`, `workers=1`, `updating="immediate"`, `polish=False`; enforce the evaluation budget through an objective-call counter and terminate cleanly when exhausted.

- [ ] **Step 5: Implement CMA-ES adapter**

Use `cma.CMAEvolutionStrategy` with explicit `seed`, fixed normalized bounds `[0, 1]`, `verbose=-9`, and stop when the shared evaluation counter reaches budget.

- [ ] **Step 6: Implement Powell polishing adapter**

Powell is local polish only: it consumes an explicit seed candidate and cannot initialize itself from zero. Use SciPy `minimize(method="Powell")` with bounded normalized coordinates and the remaining evaluation budget.

- [ ] **Step 7: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_objectives.py research/solver-lab/tests/test_optimizers.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): add continuous oracle optimizers"
```

---

### Task 5: Implement the Continuous Oracle ensemble runner and canonical frontier admission

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/continuous_oracle.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/canonical.py`
- Create: `research/solver-lab/tests/test_continuous_oracle.py`
- Create: `research/solver-lab/tests/test_canonical.py`
- Modify: `research/solver-lab/pyproject.toml`

**Interfaces:**

```python
@dataclass(frozen=True)
class OracleRunConfig:
    seeds: tuple[int, ...]
    filter_counts: tuple[int, ...]
    objective_weights: tuple[tuple[float, float], ...]
    evaluation_budget_per_run: int

class CanonicalEvaluator:
    def evaluate(self, problem: SolverLabProblem, candidates: Sequence[SolverLabCandidate]) -> tuple[SolverLabEvaluation, ...]: ...

def build_continuous_frontier(
    problem: SolverLabProblem,
    config: OracleRunConfig,
    canonical_evaluator: CanonicalEvaluator,
) -> tuple[SolverLabCandidate, ...]
```

`CanonicalEvaluator` calls the TypeScript `research:lab -- evaluate-jsonl` command in batches; it never starts one Node process per candidate.

- [ ] **Step 1: Write RED batch canonical-evaluator tests**

Use a fake executable/script in tests to verify request grouping, deterministic candidate order, nonzero exit handling, and candidate-ID matching.

- [ ] **Step 2: Implement batch evaluator**

Write candidates to a temporary JSONL file, call the canonical CLI once per batch, parse `SolverLabEvaluation`, and require candidate-ID set equality. Any missing/extra ID fails the batch.

- [ ] **Step 3: Write RED ensemble test**

Stub optimizers with overlapping points and prove only canonically validated non-dominated points survive.

- [ ] **Step 4: Implement ensemble schedule**

For each configured `filter_count`, each exact layout from `enumerate_oracle_layouts`, each seed, and each objective-weight pair, run DE and CMA-ES independently, then Powell-polish each result. Canonically evaluate all unique candidate filter vectors after deduplication. Preserve optimizer/seed/layout provenance for every frontier point.

Default calibration weights are exact:

```python
((1.0, 0.0), (0.75, 0.25), (0.5, 0.5), (0.25, 0.75), (0.0, 1.0))
```

These weights sample the front; they do not define the stored Pareto objective.

- [ ] **Step 5: Add console entry point**

`pyproject.toml`:

```toml
[project.scripts]
autoeq-continuous-oracle = "autoeq_solver_lab.continuous_oracle:main"
```

CLI accepts `--problems`, `--out`, `--seeds`, `--filter-counts`, `--eval-budget`, and `--canonical-command`. Every argument is explicit in the output manifest.

- [ ] **Step 6: Verify and commit**

```bash
pytest -q research/solver-lab/tests/test_canonical.py research/solver-lab/tests/test_continuous_oracle.py
git diff --check
git add research/solver-lab
git commit -m "feat(research): build continuous oracle ensemble"
```

---

### Task 6: Implement the Deliverable Oracle mixed discrete/continuous search

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/quantization.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/structural.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/deliverable_oracle.py`
- Create: `research/solver-lab/tests/fixtures/canonical-quantization-v1.json`
- Create: `research/solver-lab/tests/test_quantization_parity.py`
- Create: `research/solver-lab/tests/test_structural.py`
- Create: `research/solver-lab/tests/test_deliverable_oracle.py`
- Create: `packages/core/benchmarks/research/quantizationFixture.ts`
- Create: `packages/core/test/autoeq/v2/research/quantizationFixture.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Surrogate quantization must reproduce `POWERAMP_MANUAL_ENTRY_POLICY`: 1 Hz frequency, 0.1 dB gain, 0.01 PK Q, shelf Q fixed by problem bounds.
- Structural mutation operations are explicit:

```python
class StructuralMutation(Enum):
    ADD_PK = "add-pk"
    ADD_LS = "add-ls"
    ADD_HS = "add-hs"
    REMOVE = "remove"
    TYPE_MUTATION = "type-mutation"
    SPLIT = "split"
    MERGE = "merge"
```

- [ ] **Step 1: Generate canonical quantization fixtures in TypeScript**

Include half-step ties, negative/positive gains, min/max bounds, PK/shelf Q, and values just inside/outside grid boundaries. Test fixture generation is byte-deterministic.

- [ ] **Step 2: Write and satisfy Python quantization parity tests**

Require exact numeric equality after JSON decoding for all fixture fields; quantized values are decimal grid values and should not need a tolerance.

- [ ] **Step 3: Write RED structural mutation invariants**

Every mutation must preserve supported filter types, max filter count, finite parameters, product bounds after projection, and deterministic output for the same RNG state.

- [ ] **Step 4: Implement structural neighborhood generation**

Generate bounded proposal sets using local extrema of the current residual on log frequency. Split duplicates one filter into two centers offset by `±1/24` octave with half initial gain; merge applies only to same-type filters within `1/12` octave and uses gain-magnitude-weighted log-frequency center plus summed gain before projection.

- [ ] **Step 5: Write RED Deliverable Oracle test**

On a small synthetic case, start from a Continuous Oracle seed, quantize it, run a small deterministic mixed search, and assert the final canonical Pareto archive still contains the plain one-shot quantization unless another point dominates it.

- [ ] **Step 6: Implement mixed search**

Use an explicit archive plus three proposal mechanisms per generation:

1. quantized local ±1 grid-step parameter neighbors;
2. structural mutations from Step 4;
3. continuous Powell polish around selected archive points followed by re-quantization.

Use seeded stochastic selection only for choosing among proposal parents, record the seed, and canonically validate the current surrogate non-dominated archive in batches after every 10 generations and at the final generation.

- [ ] **Step 7: Add console entry point**

```toml
autoeq-deliverable-oracle = "autoeq_solver_lab.deliverable_oracle:main"
```

CLI consumes the Continuous Oracle frontier plus problem JSONL, emits canonical Deliverable Oracle frontier JSONL and manifest.

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/quantizationFixture.test.ts \
  test/autoeq/v2/research/labInterop.test.ts
pytest -q research/solver-lab/tests/test_quantization_parity.py \
  research/solver-lab/tests/test_structural.py \
  research/solver-lab/tests/test_deliverable_oracle.py
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json
git commit -m "feat(research): build deliverable oracle search"
```

---

### Task 7: Add oracle calibration reporting and acceptance-policy freeze artifacts

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/calibration.py`
- Create: `research/solver-lab/tests/test_calibration.py`
- Create: `packages/core/benchmarks/research/oracleReport.ts`
- Create: `packages/core/test/autoeq/v2/research/oracleReport.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Produces per case/filter cap:

```text
Continuous Oracle Pareto front
Deliverable Oracle Pareto front
control → Continuous regret
control → Deliverable regret
Continuous → Deliverable gap
independent-family frontier agreement summary
```

- Produces a frozen calibration manifest:

```ts
export interface OracleCalibrationManifestV1 {
  version: 1
  createdFromRepositorySha: string
  corpusVersion: string
  continuousOracleVersion: string
  deliverableOracleVersion: string
  qualityTimeFormulaVersion: 1
  materialImprovementThresholds: {
    minimumAggregateFrontierGainFraction: number
    maximumPerCaseQualityRegressionFraction: number
    maximumCatastrophicCaseRate: number
  }
}
```

- [ ] **Step 1: Write RED calibration tests**

Use small synthetic frontiers and assert correct regret/gap direction, stable ordering, and explicit rejection of a manifest with negative, NaN, or >1 fractional thresholds.

- [ ] **Step 2: Implement reports without inventing unavailable holdout thresholds**

Calibration derives threshold recommendations from development/adversarial distributions, but final manifest values are supplied explicitly to the command after review. The command must not auto-open holdout or mutate the manifest later.

- [ ] **Step 3: Add CLI/report scripts**

Package script:

```json
"research:oracle-report": "tsx benchmarks/research/oracleReport.ts"
```

Python entry point:

```toml
autoeq-oracle-calibrate = "autoeq_solver_lab.calibration:main"
```

- [ ] **Step 4: Run small deterministic oracle smoke**

Export development problems at Max Filters 10, run Continuous Oracle with seeds `11,29` and a deliberately small test evaluation budget, then Deliverable Oracle, then generate report. This smoke proves orchestration only; it is not promotion evidence.

- [ ] **Step 5: Verify and commit**

```bash
pytest -q research/solver-lab/tests
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab packages/core/benchmarks/research packages/core/test/autoeq/v2/research packages/core/package.json
git commit -m "feat(research): add oracle calibration reports"
```

---

### Task 8: Add manual oracle workflow and execute the first full calibration campaign

**Files:**
- Create: `.github/workflows/autoeq-oracle-research.yml`
- Modify only if required by the tested entry points: `research/solver-lab/pyproject.toml`

**Interfaces:**
- Manual `workflow_dispatch` inputs:

```text
corpus_layer: development | adversarial
max_filters: 10 | 20 | 40
seeds: string
continuous_eval_budget: integer
mixed_generations: integer
```

- Artifact bundle includes problems, candidate manifests, canonical evaluations, continuous/deliverable fronts, calibration report, environment metadata, and exact repository SHA.

- [ ] **Step 1: Write workflow with no production trigger**

Only `workflow_dispatch` is allowed. Use Node 22 and Python 3.12. Install pnpm with repository-pinned version, run core typecheck/research focused tests, install solver-lab editable package, then run exported problems → Continuous Oracle → Deliverable Oracle → report.

- [ ] **Step 2: Add artifact upload even on oracle-command failure**

Use `if: always()` for the artifact step so partial manifests/logs survive failed long runs. Do not mark a failed optimizer command successful.

- [ ] **Step 3: Local endpoint verification**

```bash
pytest -q research/solver-lab/tests
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core typecheck
pnpm test
pnpm typecheck
pnpm build
pnpm lint
git diff --check
```

- [ ] **Step 4: Commit workflow**

```bash
git add .github/workflows/autoeq-oracle-research.yml
git commit -m "ci(research): add manual solver oracle workflow"
```

- [ ] **Step 5: Run calibration in two waves**

First wave: development corpus, Max Filters 10, at least 8 distinct recorded seeds, enough evaluations for DE and CMA frontier regions to overlap materially on simple synthetic cases.

Second wave: adversarial corpus, Max Filters 10; add Max Filters 20/40 only where the Max10 frontier shows a substantial capacity gap worth diagnosing.

Do not choose numerical promotion thresholds until these artifacts are reviewed.

- [ ] **Step 6: Freeze Oracle Calibration manifest**

After reviewing development/adversarial results, write explicit values for all three `materialImprovementThresholds` fields, store the manifest with the calibration artifacts, and record its SHA-256. This frozen manifest becomes a prerequisite input to the algorithm-family screening plan.

---

## Plan Completion Gate

This plan is complete only when:

1. Python surrogate DSP and quantization pass committed canonical parity fixtures;
2. DE, CMA-ES, and Powell adapters are deterministic from recorded seeds/configuration;
3. Continuous Oracle explores the exact documented topology ensemble and stores only canonically validated non-dominated points;
4. Deliverable Oracle uses the real product quantization/bounds contract and canonically validates its frontier;
5. search/product/deliverability gaps are reported per case and filter cap;
6. independent optimizer provenance is preserved for every frontier point;
7. a versioned Oracle Calibration manifest with all three acceptance-threshold fields is frozen before algorithm-family screening;
8. no production solver/UI/session/export behavior has changed.

The next plan may use the oracle frontiers and frozen calibration manifest for algorithm-family screening. Do not create a product solver rewrite directly from this plan.