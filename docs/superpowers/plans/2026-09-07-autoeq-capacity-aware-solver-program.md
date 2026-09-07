# AutoEQ Capacity-Aware Solver Program Implementation Plan

> **For OpenCode:** REQUIRED EXECUTION MODE: execute this plan inline/directly, task-by-task. Do **not** use subagent-driven development. If Superpowers skills are available, use `superpowers:executing-plans`, not `superpowers:subagent-driven-development`. Track progress with the `- [ ]` checkboxes in this file.

**Goal:** Implement the approved Capacity-Aware Solver Program: freeze a best-known deliverable reference snapshot, define directed reference regret and corrected QTF, recover fixed-cap Max10 quality with resumable/state-bank search plus sparse/structural methods, test Max20/40 teacher-to-Max10 compression, classify capacity/search failure modes, and run an evidence-backed same-runtime 5/15/30/60-second tournament without changing production behavior.

**Architecture:** Research evidence is split into two contracts. `OracleReferenceSnapshotV1` is the immutable scientific reference used by QTF, screening, capacity-gap measurement, and teacher selection. `OracleCalibrationManifestV1` remains a later, stricter promotion-threshold artifact. The runtime-relevant program is narrowed to three mechanisms/components: resumable/state-bank search with known-good/transfer proposals, sparse matching pursuit with teacher compression, and structural beam search. Python remains the laboratory for structural discovery and compression; TypeScript remains the canonical delivered evaluator and the authority for the final same-runtime tournament.

**Tech Stack:** Python 3.12, NumPy 2.x, SciPy 1.14+, pytest 8, TypeScript 6, Vitest 4, Node 22, tsx, pnpm, SHA-256.

**Spec:** `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-solver-program-amendment.md`

**Parent design:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`

**Minimum approved spec commit:** `f14b8cd0a44fa05a7313d2b6d9b31ce077f597da`

## Global Constraints

- Read `AGENTS.md`, the amendment spec, and the parent design before editing code.
- Execute from a branch/worktree that contains this plan and is a descendant of `f14b8cd0a44fa05a7313d2b6d9b31ce077f597da`.
- Preserve unrelated local WIP. Never reset, clean, stash, overwrite, merge, deploy, release, publish, or open holdout data to simplify execution.
- Standard AutoEQ v1 remains frozen. Production Standard v2 behavior remains frozen unless a later explicit product-distillation design approves a change.
- `packages/core` stays framework-agnostic and remains the canonical DSP/delivered-metric authority.
- Max Filters 10 is the primary product problem. Max20/40 are offline teachers/capacity probes only.
- QTF and runtime regret use the best-known **deliverable** reference frontier, never a continuous-only frontier.
- A valid Reference Snapshot may have zero control regret. Do not weaken `OracleCalibrationManifestV1` to manufacture a freeze.
- Directed Reference Regret v1 uses positive-part deltas and returns zero when a candidate dominates a reference point. Report that case separately as `referenceImproved=true`.
- QTF is a screening/ranking summary only. Raw canonical RMSE, maxAbs, Pareto/frontier evidence, and 5/15/30/60-second checkpoints remain primary evidence.
- Cross-language screening uses canonical quality versus evaluation/work count. Do not claim product speed from Python-vs-Node wall-clock.
- The final speed comparison is same-runtime Node/TypeScript, same runner/process, with monotonic best-so-far delivery at 5/15/30/60 seconds.
- No new raw/private/user curves may be added. Use only the already approved real corpus plus synthetic cases.
- Use focused TDD. Each numbered task ends in one coherent commit after `git diff --check`.
- Generated large research artifacts stay outside Git history unless repository policy already marks them as approved small fixtures. Commit only small deterministic fixtures, code, manifests/hashes, and results/spec documents.
- Required external evidence input is the existing corrected Oracle campaign directory. At execution start run exactly:

```bash
export AUTOEQ_ORACLE_EVIDENCE_DIR="${AUTOEQ_ORACLE_EVIDENCE_DIR:?set AUTOEQ_ORACLE_EVIDENCE_DIR to the existing corrected Oracle campaign root}"
export AUTOEQ_CAPACITY_OUT_DIR="${AUTOEQ_CAPACITY_OUT_DIR:-$PWD/.research-artifacts/capacity-aware}"
mkdir -p "$AUTOEQ_CAPACITY_OUT_DIR"
```

If the evidence directory is unavailable, do not rerun a broad Oracle campaign merely to satisfy this plan. Complete the code/test tasks that do not require campaign evidence and record the missing-evidence blocker before experiment tasks.

---

## File/Responsibility Map

### Python solver lab

- `research/solver-lab/src/autoeq_solver_lab/reference_snapshot.py` — snapshot schema, validation, canonical hash, aggregate discovery, and freeze.
- `research/solver-lab/src/autoeq_solver_lab/reference_regret.py` — Directed Reference Regret v1 and reference-improvement detection.
- `research/solver-lab/src/autoeq_solver_lab/quality_time.py` — QTF v1 formula/hash and exact log-time integration.
- `research/solver-lab/src/autoeq_solver_lab/selector.py` — frozen Reference Pareto Selector.
- `research/solver-lab/src/autoeq_solver_lab/trajectory.py` — common best-so-far run artifact model.
- `research/solver-lab/src/autoeq_solver_lab/screening.py` — evaluation-count/reference-regret/QTF summaries.
- `research/solver-lab/src/autoeq_solver_lab/solvers/matching_pursuit.py` — fixed-cap sparse discovery.
- `research/solver-lab/src/autoeq_solver_lab/teacher_compression.py` — high-cap teacher to at-most-10-filter compression.
- `research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py` — structural beam using the existing mutation library.
- `research/solver-lab/src/autoeq_solver_lab/run_capacity_study.py` — case-focused study orchestration.
- `research/solver-lab/src/autoeq_solver_lab/case_classification.py` — evidence-backed case classification.

### TypeScript research/core

- `packages/core/benchmarks/research/referenceSnapshot.ts` — TS snapshot validator and cell lookup.
- `packages/core/benchmarks/research/referenceRegret.ts` — TS Directed Reference Regret v1.
- `packages/core/benchmarks/research/qualityTime.ts` — TS QTF v1.
- `packages/core/benchmarks/research/referenceSelector.ts` — TS selector parity.
- `packages/core/benchmarks/research/solverRunArtifact.ts` — TS run artifact validator/serializer.
- `packages/core/src/autoeq/v2/jointRefineContinuation.ts` — compatibility-preserving resumable joint refinement.
- `packages/core/benchmarks/research/resumableScheduler.ts` — research-only resumable/state-bank policies.
- `packages/core/benchmarks/research/proposalSeeds.ts` — validated transfer/known-good/v1 proposal import.
- `packages/core/benchmarks/research/resumableRun.ts` — state-bank runner emitting the common run artifact.
- `packages/core/benchmarks/research/capacityTournament.ts` — same-runtime 5/15/30/60 tournament orchestration.
- `packages/core/benchmarks/research/capacityTournamentRun.ts` — tournament CLI.
- Conditional survivor ports: `matchingPursuit.ts` and/or `structuralBeam.ts` under `packages/core/benchmarks/research/` only when Task 12 evidence shortlists them.

---

### Task 1: Define and freeze `OracleReferenceSnapshotV1`

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/reference_snapshot.py`
- Create: `research/solver-lab/tests/test_reference_snapshot.py`
- Create: `research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json`
- Modify: `research/solver-lab/pyproject.toml`

**Produces:** `OracleReferenceSnapshotV1`, deterministic JSON serialization, content SHA-256, and CLI `autoeq-reference-snapshot`.

The public dataclasses are exactly:

```python
ReferenceState = Literal["stable-under-current-search", "still-moving"]

@dataclass(frozen=True)
class ReferenceCandidateV1:
    candidate_id: str
    problem_id: str
    input_sha256: str
    max_filters: int
    actual_delivered_filter_count: int
    filters: tuple[LabFilter, ...]
    canonical_rmse_db: float
    canonical_max_abs_db: float
    algorithm_id: str
    seed: int | None
    provenance: str

@dataclass(frozen=True)
class ReferenceCellV1:
    problem_id: str
    input_sha256: str
    max_filters: int
    reference_state: ReferenceState
    control_candidate_id: str
    candidates: tuple[ReferenceCandidateV1, ...]
    deliverable_frontier_candidate_ids: tuple[str, ...]
    continuous_diagnostic_frontier: tuple[ObjectivePoint, ...]

@dataclass(frozen=True)
class OracleReferenceSnapshotV1:
    version: Literal[1]
    created_from_repository_sha: str
    corpus_version: str
    canonical_evaluator_version: str
    cells: tuple[ReferenceCellV1, ...]
    content_sha256: str
```

- [ ] **Step 1: Write RED schema/hash tests**

Test rejection of duplicate cells, duplicate candidate IDs, problem/hash/cap mismatches, delivered counts above cap, non-finite metrics, invalid SHA-256 strings, invalid reference states, and frontier IDs absent from `candidates`. Add a synthetic control plus two deliverable candidates where one candidate dominates control; assert control stays in `candidates` but may disappear from the final nondominated frontier.

- [ ] **Step 2: Run RED**

```bash
python -m pytest -q research/solver-lab/tests/test_reference_snapshot.py
```

Expected: import failure for `autoeq_solver_lab.reference_snapshot`.

- [ ] **Step 3: Implement canonical snapshot payload/hash**

Use exactly:

```python
def canonical_snapshot_payload(value: Mapping[str, Any]) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def snapshot_content_sha256(value_without_content_hash: Mapping[str, Any]) -> str:
    return hashlib.sha256(
        canonical_snapshot_payload(value_without_content_hash).encode("utf-8")
    ).hexdigest()
```

The hash input excludes only the top-level `contentSha256` field.

- [ ] **Step 4: Implement aggregate discovery and best-known union**

Recursively discover directories under `AUTOEQ_ORACLE_EVIDENCE_DIR` containing all of:

```text
campaign-manifest.json
control-aggregate.json
continuous-aggregate.json
deliverable-aggregate.json
continuous-aggregate.json.candidates.jsonl
deliverable-aggregate.json.candidates.jsonl
```

Validate aggregate artifacts with the existing campaign/calibration/io helpers rather than defining a second parser. For each `problemId × maxFilters`, union every valid deliverable frontier candidate from every discovered aggregate plus the frozen control candidate before calling `nondominated()`. Retain every union candidate with provenance and source aggregate hash; store only the nondominated candidate IDs in `deliverable_frontier_candidate_ids`.

- [ ] **Step 5: Implement conservative reference-state selection**

For each cell, sort aggregate evidence by campaign stage rank:

```python
stage_rank = {"smoke": 0, "screen": 1, "confirm": 2, "deep": 3, "full": 4}
```

Among the highest-rank complete aggregates containing the case/cap, set `stable-under-current-search` only when `campaign-manifest.json["convergence"][problemId]["unresolved"] is False`. Otherwise set `still-moving`. Missing convergence evidence never implies stability.

- [ ] **Step 6: Add CLI and GREEN test**

Add to `pyproject.toml`:

```toml
autoeq-reference-snapshot = "autoeq_solver_lab.reference_snapshot:main"
```

Run exactly:

```bash
python -m pytest -q research/solver-lab/tests/test_reference_snapshot.py
python -m autoeq_solver_lab.reference_snapshot \
  --campaign-root "$AUTOEQ_ORACLE_EVIDENCE_DIR" \
  --repository-sha "$(git rev-parse HEAD)" \
  --corpus-version autoeq-research-corpus-v1 \
  --canonical-evaluator-version standard-v2-canonical-v1 \
  --out "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json"
python -m autoeq_solver_lab.reference_snapshot \
  --validate "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json"
```

The freeze command must require Max10 for `titan-to-storm`, `titan-to-u12t`, and `titan-to-trio`, plus at least one available high-cap cell from Max20/Max40 for each case. It includes all additional valid cells it discovers.

- [ ] **Step 7: Commit**

```bash
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/reference_snapshot.py \
  research/solver-lab/tests/test_reference_snapshot.py \
  research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json \
  research/solver-lab/pyproject.toml
git commit -m "feat(research): add best-known reference snapshots"
```

---

### Task 2: Implement Directed Reference Regret v1 in Python and TypeScript

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/reference_regret.py`
- Create: `research/solver-lab/tests/test_reference_regret.py`
- Create: `research/solver-lab/tests/fixtures/reference-regret-v1.json`
- Create: `packages/core/benchmarks/research/referenceRegret.ts`
- Create: `packages/core/test/autoeq/v2/research/referenceRegret.test.ts`
- Modify: `research/solver-lab/src/autoeq_solver_lab/calibration.py`

**Produces:** Python function `directed_reference_regret(...) -> ReferenceRegretResult` and TypeScript function `directedReferenceRegret(...) -> ReferenceRegretResult`.

```python
@dataclass(frozen=True)
class ReferenceRegretResult:
    regret: float
    reference_improved: bool
```

- [ ] **Step 1: Write RED parity vectors**

Fixture cases cover worse in both dimensions, RMSE-only regression, maxAbs-only regression, equality, domination of one frontier point, and a multi-point incomparable frontier.

- [ ] **Step 2: Implement exact formula in Python**

```python
regret = min(
    math.hypot(
        max(0.0, point.rmse_db - ref.rmse_db) / rmse_scale,
        max(0.0, point.max_abs_db - ref.max_abs_db) / max_abs_scale,
    )
    for ref in frontier
)
reference_improved = any(dominates(point, ref) for ref in frontier)
```

Default scales are `0.25` and `0.75`; input validation matches `pareto.py` finite/positive rules.

- [ ] **Step 3: Reuse the helper from calibration without changing calibration policy**

Replace duplicate directed-distance arithmetic in `calibration.py` with `directed_reference_regret(...).regret`. Keep every existing `valid`/`insufficient`, strict-control-improvement, and non-vacuous-threshold rule unchanged.

- [ ] **Step 4: Implement TypeScript parity**

Use epsilon `1e-12` for dominance and the same positive-part distance. Validate nonempty frontier and finite metrics/scales.

- [ ] **Step 5: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_reference_regret.py research/solver-lab/tests/test_calibration.py
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/referenceRegret.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/reference_regret.py \
  research/solver-lab/src/autoeq_solver_lab/calibration.py \
  research/solver-lab/tests/test_reference_regret.py \
  research/solver-lab/tests/fixtures/reference-regret-v1.json \
  packages/core/benchmarks/research/referenceRegret.ts \
  packages/core/test/autoeq/v2/research/referenceRegret.test.ts
git commit -m "feat(research): add directed reference regret"
```

---

### Task 3: Add TypeScript snapshot validation and exact cell lookup

**Files:**
- Create: `packages/core/benchmarks/research/referenceSnapshot.ts`
- Create: `packages/core/test/autoeq/v2/research/referenceSnapshot.test.ts`
- Read: `research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json`

**Produces:** TypeScript interfaces mirroring every Task 1 JSON field, `assertOracleReferenceSnapshotV1(value)`, and `getReferenceCell(snapshot, problemId, inputSha256, maxFilters)`.

- [ ] **Step 1: Write RED tests against the Python fixture**

Reject wrong version/hash, duplicate cells, invalid candidate/frontier references, and lookup with mismatched problem/hash/cap.

- [ ] **Step 2: Implement full TypeScript interfaces**

Mirror `ReferenceCandidateV1`, `ReferenceCellV1`, and `OracleReferenceSnapshotV1` field-for-field using JSON camelCase names. No `any` in public interfaces.

- [ ] **Step 3: Verify content hash**

Canonicalize with recursively sorted object keys and compact JSON. Remove only top-level `contentSha256` before SHA-256 comparison. Keep Node crypto confined to `benchmarks/research`.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/referenceSnapshot.test.ts \
  test/autoeq/v2/research/referenceRegret.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/referenceSnapshot.ts \
  packages/core/test/autoeq/v2/research/referenceSnapshot.test.ts
git commit -m "feat(research): validate reference snapshots in TypeScript"
```

---

### Task 4: Implement corrected QTF v1 with cross-language parity

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/quality_time.py`
- Create: `research/solver-lab/tests/test_quality_time.py`
- Create: `research/solver-lab/tests/fixtures/quality-time-frontier-v1.json`
- Create: `packages/core/benchmarks/research/qualityTime.ts`
- Create: `packages/core/test/autoeq/v2/research/qualityTime.test.ts`

**Produces:** `quality_from_regret`, `compute_quality_time_frontier`, `quality_time_formula_sha256` and exact TypeScript equivalents.

Constants:

```python
QUALITY_TIME_FORMULA_VERSION = 1
QUALITY_TIME_T_MIN_SECONDS = 0.5
QUALITY_TIME_T_MAX_SECONDS = 60.0
```

Canonical formula descriptor is exactly:

```json
{"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","reference":"oracle-reference-snapshot-v1:deliverable-frontier","regret":"directed-reference-regret-v1","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}
```

- [ ] **Step 1: Write RED shared fixture**

Cases: constant regret 0, constant regret 1, improvement from 1 to 0 at 5 seconds, duplicate timestamp keep-last, update at exactly 60 seconds, early finish held through 60 seconds, and invalid timestamp/regret inputs.

- [ ] **Step 2: Implement Python quality transform**

```python
def quality_from_regret(regret: float) -> float:
    if not math.isfinite(regret) or regret < 0:
        raise ValueError("regret must be finite and non-negative")
    return math.exp(-regret)
```

- [ ] **Step 3: Implement exact piecewise log-time integration**

```python
active_q = quality_from_regret(last_point_at_or_before_t_min.regret)
left = 0.5
area = 0.0
for point in points_strictly_inside_window:
    area += active_q * math.log(point.elapsed_seconds / left)
    left = point.elapsed_seconds
    active_q = quality_from_regret(point.regret)
area += active_q * math.log(60.0 / left)
score = area / math.log(60.0 / 0.5)
```

Stable-sort by timestamp plus original index and collapse equal timestamps by keeping the later original item.

- [ ] **Step 4: Implement identical TypeScript behavior/hash**

Use the exact one-line descriptor above and Node SHA-256. Read the same JSON fixture and require score parity to `1e-12` absolute error and exact formula-hash equality.

- [ ] **Step 5: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_quality_time.py
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/qualityTime.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/quality_time.py \
  research/solver-lab/tests/test_quality_time.py \
  research/solver-lab/tests/fixtures/quality-time-frontier-v1.json \
  packages/core/benchmarks/research/qualityTime.ts \
  packages/core/test/autoeq/v2/research/qualityTime.test.ts
git commit -m "feat(research): define reference-based QTF v1"
```

---

### Task 5: Freeze Reference Pareto Selector and common solver trajectory artifact

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/selector.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/trajectory.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/screening.py`
- Create: `research/solver-lab/tests/test_selector.py`
- Create: `research/solver-lab/tests/test_trajectory.py`
- Create: `research/solver-lab/tests/test_screening.py`
- Create: `research/solver-lab/tests/fixtures/reference-selector-v1.json`
- Create: `packages/core/benchmarks/research/referenceSelector.ts`
- Create: `packages/core/benchmarks/research/solverRunArtifact.ts`
- Create: `packages/core/test/autoeq/v2/research/referenceSelector.test.ts`
- Create: `packages/core/test/autoeq/v2/research/solverRunArtifact.test.ts`

**Selector policy:**

1. target achieved (`rmse <= 0.25`, `maxAbs <= 0.75`) beats not achieved;
2. among target-achieved points: lower delivered filter count, lower RMSE, lower maxAbs;
3. outside target: minimize `sqrt((rmse / 0.25)^2 + (maxAbs / 0.75)^2)`;
4. tie-break lower RMSE, lower maxAbs, lower cancellation score, lower delivered filter count, stable candidate ID.

**Run artifact dataclasses:**

```python
@dataclass(frozen=True)
class SolverTrajectoryPoint:
    evaluation_count: int
    elapsed_ms: float
    candidate_id: str
    actual_delivered_filter_count: int
    canonical_rmse_db: float
    canonical_max_abs_db: float
    reference_regret: float
    reference_improved: bool

@dataclass(frozen=True)
class SolverRunResult:
    schema_version: Literal[1]
    algorithm_id: str
    variant_id: str
    problem_id: str
    input_sha256: str
    max_filters: int
    reference_snapshot_sha256: str
    seed: int | None
    evaluation_budget: int
    trajectory: tuple[SolverTrajectoryPoint, ...]
    quality_time_frontier_v1: float | None
    metadata: dict[str, str | int | float | bool]
```

- [ ] **Step 1: Write RED selector parity vectors**

Cover target-achieved, RMSE-heavy, maxAbs-heavy, Pareto-incomparable, filter-count preference, cancellation tie, and exact candidate-ID tie-break.

- [ ] **Step 2: Implement selector in both languages**

Require identical winner candidate IDs for every shared fixture group.

- [ ] **Step 3: Write RED trajectory invariants**

Require nondecreasing evaluation count/time, exact problem/hash/cap/snapshot identity, finite metrics/regret, and monotonic best-so-far selection. A later point may replace the stored best only when it Pareto-dominates the current best or wins the frozen selector among nondominated candidates.

- [ ] **Step 4: Implement screening summary without calibration thresholds**

```python
@dataclass(frozen=True)
class ScreeningSummary:
    algorithm_id: str
    variant_id: str
    median_final_reference_regret: float
    median_qtf_v1: float | None
    reference_improvement_count: int
    unique_case_win_count: int
```

Do not consult `OracleCalibrationManifestV1` in this module.

- [ ] **Step 5: Implement TypeScript artifact validator/serializer**

Mirror the Python schema in camelCase, reject unknown version and non-finite numeric fields, and serialize with deterministic recursively sorted keys.

- [ ] **Step 6: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_selector.py \
  research/solver-lab/tests/test_trajectory.py \
  research/solver-lab/tests/test_screening.py
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/referenceSelector.test.ts \
  test/autoeq/v2/research/solverRunArtifact.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/selector.py \
  research/solver-lab/src/autoeq_solver_lab/trajectory.py \
  research/solver-lab/src/autoeq_solver_lab/screening.py \
  research/solver-lab/tests/test_selector.py \
  research/solver-lab/tests/test_trajectory.py \
  research/solver-lab/tests/test_screening.py \
  research/solver-lab/tests/fixtures/reference-selector-v1.json \
  packages/core/benchmarks/research/referenceSelector.ts \
  packages/core/benchmarks/research/solverRunArtifact.ts \
  packages/core/test/autoeq/v2/research/referenceSelector.test.ts \
  packages/core/test/autoeq/v2/research/solverRunArtifact.test.ts
git commit -m "feat(research): add capacity screening trajectory contract"
```

---

### Task 6: Extract resumable joint refinement with exact compatibility

**Files:**
- Modify: `packages/core/src/autoeq/v2/jointRefine.ts`
- Create: `packages/core/src/autoeq/v2/jointRefineContinuation.ts`
- Create: `packages/core/test/autoeq/v2/jointRefineContinuation.test.ts`

**Produces:** `JointRefineContinuationV2`, `createJointRefineContinuationV2`, and `advanceJointRefineContinuationV2`; `jointRefineV2` remains the compatibility wrapper.

```ts
export interface JointRefineContinuationV2 {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  nextCycleIndex: number
  done: boolean
  expired: boolean
}
```

- [ ] **Step 1: Write RED equivalence tests before refactor**

Capture current `jointRefineV2()` outputs for PK-only, shelf-only, and mixed solutions at 1, 2, and 6 configured cycles. Assert filters, metrics, completed cycles, coordinate trials, expiration, and cancellation-audit counts exactly.

- [ ] **Step 2: Move one completed-cycle execution into continuation code**

Preserve `JOINT_REFINEMENT_SCALES`, filter order, coordinate order, tie-breaks, deadline checks, replacement-trial materialization, cancellation-audit laziness, and research trace cycle accounting.

- [ ] **Step 3: Implement compatibility wrapper**

`jointRefineV2(input, trace)` creates a continuation and repeatedly advances by one cycle until `done`, `expired`, or the original configured maximum cycle count is reached. Return the same `JointRefineResult` shape as before.

- [ ] **Step 4: Verify exact compatibility**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/jointRefineContinuation.test.ts \
  test/autoeq/v2/runStandardAutoEqV2.test.ts \
  test/autoeq/v2/progressiveDelivery.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Any deterministic result/counter drift is a blocker.

- [ ] **Step 5: Commit**

```bash
git diff --check
git add packages/core/src/autoeq/v2/jointRefine.ts \
  packages/core/src/autoeq/v2/jointRefineContinuation.ts \
  packages/core/test/autoeq/v2/jointRefineContinuation.test.ts
git commit -m "refactor(core): expose resumable v2 joint refinement"
```

---

### Task 7: Implement resumable/state-bank scheduling and proposal sources

**Files:**
- Create: `packages/core/benchmarks/research/resumableScheduler.ts`
- Create: `packages/core/benchmarks/research/proposalSeeds.ts`
- Create: `packages/core/benchmarks/research/resumableRun.ts`
- Create: `packages/core/test/autoeq/v2/research/resumableScheduler.test.ts`
- Create: `packages/core/test/autoeq/v2/research/proposalSeeds.test.ts`
- Modify: `packages/core/package.json`

**State contract:**

```ts
export type ResearchStateOrigin =
  | 'fresh'
  | 'resumed'
  | 'transferred'
  | 'known-good'
  | 'v1-seeded'

export interface ProposalSeedV1 {
  version: 1
  problemId: string
  inputSha256: string
  sourceKind: 'transfer' | 'known-good' | 'v1'
  sourceId: string
  filters: Filter[]
}

export interface ScheduledResearchState {
  key: string
  origin: ResearchStateOrigin
  continuation: JointRefineContinuationV2
  slicesReceived: number
}
```

- [ ] **Step 1: Write RED pause/resume tests**

Use fake continuations where a state ranked third after one slice becomes best after a later slice. Require the scheduler to preserve and resume it rather than recreate it.

- [ ] **Step 2: Write RED fresh-vs-bank capacity tests**

Insert more proposal-bank states than fresh capacity. Assert the fresh queue size/order is unchanged and bank states never displace fresh states merely by insertion.

- [ ] **Step 3: Implement exact policies**

`resumable-beam-v1`: every fresh state receives one completed cycle, then runnable states receive one additional cycle at a time in Pareto/Reference Selector order.

`state-bank-v1`: same fresh queue plus separate proposal bank. While fresh runnable states exist, schedule no more than one proposal-bank slice after every two fresh slices. When fresh states are exhausted, proposal-bank states may consume remaining budget.

- [ ] **Step 4: Implement proposal-seed validation**

Reject wrong version/problem/hash, unsupported filter type, out-of-bound frequency/gain/Q, or more than the active Max10 cap. Import only filter state; do not execute or modify v1.

- [ ] **Step 5: Implement exact research CLI**

Add:

```json
"research:resumable": "tsx benchmarks/research/resumableRun.ts"
```

CLI flags are `--snapshot`, `--case`, `--policy`, `--max-filters`, `--evaluation-budget`, `--seed`, `--proposal-seeds`, and `--out`. `--proposal-seeds` may be omitted. The runner emits `SolverRunArtifactV1` with coordinate trials as evaluation count, canonical delivered metrics, directed regret, reference-improvement flag, origin counts, and snapshot hash.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/resumableScheduler.test.ts \
  test/autoeq/v2/research/proposalSeeds.test.ts \
  test/autoeq/v2/jointRefineContinuation.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/resumableScheduler.ts \
  packages/core/benchmarks/research/proposalSeeds.ts \
  packages/core/benchmarks/research/resumableRun.ts \
  packages/core/test/autoeq/v2/research/resumableScheduler.test.ts \
  packages/core/test/autoeq/v2/research/proposalSeeds.test.ts \
  packages/core/package.json
git commit -m "feat(research): add resumable state-bank search"
```

---

### Task 8: Implement fixed-cap sparse matching pursuit

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/__init__.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/matching_pursuit.py`
- Create: `research/solver-lab/tests/test_matching_pursuit.py`

**Config:**

```python
@dataclass(frozen=True)
class DictionaryConfig:
    frequencies_per_octave: int = 24
    pk_q_values: tuple[float, ...] = (0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0)
    include_shelves: bool = True

@dataclass(frozen=True)
class MatchingPursuitConfig:
    dictionary: DictionaryConfig
    max_filters: int
    checkpoint_every_evaluations: int
    nonlinear_polish_evaluations: int
```

Public solver method signature is `MatchingPursuitSolver.run(problem, seed, evaluation_budget, reference_frontier, reference_snapshot_sha256, canonical_evaluator) -> SolverRunResult`.

- [ ] **Step 1: Write RED dictionary/determinism tests**

Require 24 log-spaced frequency positions per octave inside bounds, canonical PK-Q order filtered to product bounds, one LS and one HS atom per frequency when shelves are enabled, fixed shelf Q, and byte-identical candidate sequence for repeated same-seed runs.

- [ ] **Step 2: Build cached unit-response matrix**

Use the existing parity-tested lab DSP. Store one unit-gain response column per atom and calculate deterministic correlation `abs(dot(atom, residual)) / max(dot(atom, atom), 1e-30)`.

- [ ] **Step 3: Select one atom and solve bounded gains**

After each selected atom, solve all selected gains with `scipy.optimize.lsq_linear(A, desired_db, bounds=(minGainDb, maxGainDb), method="trf", lsmr_tol="auto")`. Keep atom order stable when correlations tie by dictionary index.

- [ ] **Step 4: Add bounded nonlinear polish**

Use existing bounded Powell primitives on selected filter parameters for exactly `nonlinear_polish_evaluations`; then quantize/deliver and evaluate canonically before adding a trajectory point.

- [ ] **Step 5: Add synthetic quality tests**

One-peak: selected center within one dictionary step and canonical RMSE below zero-filter RMSE. Two-feature: two selected atoms must reduce both canonical RMSE and maxAbs relative to the first selected-atom checkpoint.

- [ ] **Step 6: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_matching_pursuit.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/solvers \
  research/solver-lab/tests/test_matching_pursuit.py
git commit -m "feat(research): add sparse matching pursuit"
```

---

### Task 9: Implement Max20/40 teacher to at-most-10-filter student compression

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/teacher_compression.py`
- Create: `research/solver-lab/tests/test_teacher_compression.py`

**Config/result:**

```python
@dataclass(frozen=True)
class TeacherCompressionConfig:
    max_student_filters: int
    matching_pursuit_config: MatchingPursuitConfig
    nonlinear_polish_evaluations: int
    structural_rounds: int

@dataclass(frozen=True)
class CompressionResult:
    teacher_candidate_id: str
    teacher_max_filters: int
    teacher_actual_delivered_filter_count: int
    teacher_rmse_db: float
    teacher_max_abs_db: float
    student: SolverLabCandidate
    student_evaluation: SolverLabEvaluation
    max10_reference_regret: float
    reference_improved: bool
    operations: tuple[str, ...]
```

The production study config is exactly `max_student_filters=10`, `nonlinear_polish_evaluations=1200`, `structural_rounds=3`, using Task 8's default dictionary.

- [ ] **Step 1: Write RED teacher eligibility tests**

Accept only candidates whose IDs belong to the same snapshot/problem/hash deliverable Max20/Max40 frontier. Reject continuous-only candidates, wrong-case/hash candidates, and Max10 candidates passed as high-cap teachers.

- [ ] **Step 2: Extract teacher structural regions**

For each enabled teacher filter, emit one proposal region containing type, center frequency, Q, and gain sign. Add response-residual extrema not already within `1/24` octave of a teacher region. Sort regions by descending absolute teacher contribution, then frequency, then filter ID.

- [ ] **Step 3: Build student against the original target**

Run matching pursuit with region-biased atom ordering but calculate correlations and bounded gains against `problem.desiredDb`, not teacher response.

- [ ] **Step 4: Apply deterministic compression operations**

After sparse selection: remove the lowest absolute-gain filter if more than 10; merge same-type filters within `1/12` octave using the existing structural merge rule; test existing split proposals only when filter count remains at most 10; accept remove/merge/split only when canonical original-target metrics Pareto-improve or win the Reference Selector. Run three structural rounds, then bounded nonlinear polish and final delivery.

- [ ] **Step 5: Prove teacher imitation is diagnostic only**

Construct two synthetic students where student A matches teacher response more closely but student B has better original-target canonical metrics. Assert student B is selected.

- [ ] **Step 6: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_teacher_compression.py \
  research/solver-lab/tests/test_matching_pursuit.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/teacher_compression.py \
  research/solver-lab/tests/test_teacher_compression.py
git commit -m "feat(research): add high-cap teacher compression"
```

---

### Task 10: Implement structural beam on existing mutation primitives

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py`
- Create: `research/solver-lab/tests/test_structural_beam.py`
- Reuse unchanged mutation definitions from: `research/solver-lab/src/autoeq_solver_lab/structural.py`

**Config:**

```python
@dataclass(frozen=True)
class StructuralBeamConfig:
    beam_width: int
    proposals_per_parent: int
    local_polish_evaluations: int
    max_filters: int
```

Variants are exactly:

```text
beam-4: beam_width=4, proposals_per_parent=8, local_polish_evaluations=120
beam-12: beam_width=12, proposals_per_parent=8, local_polish_evaluations=120
```

- [ ] **Step 1: Write RED Pareto-retention tests**

Create proposals trading RMSE against maxAbs; assert nondominated proposals survive before selector trimming.

- [ ] **Step 2: Generate proposals only through `generate_structural_mutations()`**

Use existing add PK/LS/HS, remove, type mutation, split, and merge semantics. Stable-sort by mutation enum value plus canonical filter tuple before applying `proposals_per_parent`.

- [ ] **Step 3: Polish and deliver each retained proposal**

Allocate exactly `local_polish_evaluations` surrogate evaluations, re-quantize, then call the canonical evaluator before Pareto admission.

- [ ] **Step 4: Add seed injection**

Accept zero/default seeds plus matching-pursuit and teacher-compression seeds with explicit origin metadata. Never erase seed origin in run artifacts.

- [ ] **Step 5: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_structural_beam.py \
  research/solver-lab/tests/test_structural.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py \
  research/solver-lab/tests/test_structural_beam.py
git commit -m "feat(research): add structural beam solver"
```

---

### Task 11: Run case-focused Fixed-Cap and compression studies

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/run_capacity_study.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/case_classification.py`
- Create: `research/solver-lab/tests/test_run_capacity_study.py`
- Create: `research/solver-lab/tests/test_case_classification.py`
- Modify: `research/solver-lab/pyproject.toml`

**Cases:** `titan-to-storm`, `titan-to-u12t`, `titan-to-trio`.

**Evaluation rounds:** `2000`, `10000`, `50000`.

**Randomized Python seeds:** `11`, `29`, `47`, `71`, `101`.

**Classifications:** `search-recoverable`, `mixed`, `capacity-suspected`, `cap-limited`.

- [ ] **Step 1: Write RED orchestration tests**

Reject any case outside the explicit case list for the real-case study mode, any evaluation budget outside the three configured rounds, or a run whose snapshot cell hash/cap differs from the problem.

- [ ] **Step 2: Generate TypeScript state-bank artifacts at equal work budgets**

For each case and evaluation budget run both policies with seed `0`:

```bash
for case_id in titan-to-storm titan-to-u12t titan-to-trio; do
  for budget in 2000 10000 50000; do
    for policy in resumable-beam-v1 state-bank-v1; do
      pnpm --filter @autoeq-workbench/core research:resumable -- \
        --snapshot "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json" \
        --case "$case_id" \
        --policy "$policy" \
        --max-filters 10 \
        --evaluation-budget "$budget" \
        --seed 0 \
        --out "$AUTOEQ_CAPACITY_OUT_DIR/resumable/${case_id}-${policy}-${budget}.json"
    done
  done
done
```

When known-good/transfer proposal artifacts already exist from the diagnosis branch, run an additional `state-bank-v1` variant with `--proposal-seeds` and record its source artifact hash. Absence of such an artifact is recorded as `proposal-seed-evidence-unavailable`, not recreated by changing v1.

- [ ] **Step 3: Implement Python fixed-cap study matrix**

At each evaluation round run `matching-pursuit`, `structural-beam-4`, `structural-beam-12`, and `matching-pursuit -> structural-beam-4`, importing Task 7 artifacts into the same `ScreeningSummary` table.

- [ ] **Step 4: Implement official teacher loop**

For each case, select every candidate ID on every available deliverable Max20/Max40 frontier in the frozen snapshot. Attempt Task 9 compression with the frozen production study config and record teacher/student metrics, delivered counts, operations, directed Max10 regret, reference-improvement flag, and artifact hash.

- [ ] **Step 5: Implement conservative classification rules**

Compute `high_cap_strict_advantage` only when a high-cap deliverable candidate strictly dominates at least one stable/moving Max10 frontier point by existing Pareto epsilon. Then classify exactly:

```python
if max10_reference_state == "still-moving" or high_cap_reference_state == "still-moving":
    classification = "capacity-suspected"
elif max10_reference_improved_by_compression:
    classification = "mixed"
elif max10_reference_improved_by_fixed_cap_search:
    classification = "search-recoverable"
elif high_cap_strict_advantage and all_official_teachers_attempted and compression_attempt_count > 0:
    classification = "cap-limited"
else:
    classification = "capacity-suspected"
```

A textual claim of “material high-cap advantage” must include raw RMSE/maxAbs deltas; strict numerical dominance alone is not described as materially important.

- [ ] **Step 6: Add CLI and run**

Add:

```toml
autoeq-capacity-study = "autoeq_solver_lab.run_capacity_study:main"
```

Run exactly:

```bash
python -m autoeq_solver_lab.run_capacity_study \
  --snapshot "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json" \
  --typescript-run-dir "$AUTOEQ_CAPACITY_OUT_DIR/resumable" \
  --cases titan-to-storm,titan-to-u12t,titan-to-trio \
  --evaluation-budgets 2000,10000,50000 \
  --seeds 11,29,47,71,101 \
  --out "$AUTOEQ_CAPACITY_OUT_DIR/case-study"
```

- [ ] **Step 7: Verify and commit code**

```bash
python -m pytest -q research/solver-lab/tests/test_run_capacity_study.py \
  research/solver-lab/tests/test_case_classification.py \
  research/solver-lab/tests/test_matching_pursuit.py \
  research/solver-lab/tests/test_teacher_compression.py \
  research/solver-lab/tests/test_structural_beam.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/run_capacity_study.py \
  research/solver-lab/src/autoeq_solver_lab/case_classification.py \
  research/solver-lab/tests/test_run_capacity_study.py \
  research/solver-lab/tests/test_case_classification.py \
  research/solver-lab/pyproject.toml
git commit -m "feat(research): add capacity-aware case studies"
```

---

### Task 12: Record classifications and shortlist at most three mechanisms

**Files:**
- Create: `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-screening-results.md`

- [ ] **Step 1: Build the evidence table**

For each case/mechanism include snapshot SHA, reference state, algorithm/variant, seed set, evaluation budget, final canonical RMSE/maxAbs, delivered filter count, final directed regret, reference-improvement flag, QTF when elapsed-time data is comparable, teacher ID/cap for compression, and source artifact SHA-256.

- [ ] **Step 2: Record case classifications**

For each of Storm/U12t/Trio include high-cap-vs-Max10 raw metric deltas, all official teacher attempts, best at-most-10 student, and the exact Task 11 classification inputs/output.

- [ ] **Step 3: Apply shortlist rule**

Keep a mechanism/component only if it has at least one of:

```text
strict canonical improvement of the frozen Max10 reference
unique case win in final directed reference regret at equal evaluation budget
compression result that finds a Max10 state not found by the other mechanisms
```

Eliminate mechanisms that satisfy none of these. Do not retain a mechanism solely because of Python wall-clock. Keep no more than three mechanisms/components.

- [ ] **Step 4: Commit results**

```bash
git add docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-screening-results.md
git commit -m "docs: record capacity-aware solver screening"
```

---

### Task 13A: Port matching pursuit to TypeScript only if shortlisted

**Execute only if Task 12 shortlists matching pursuit. Otherwise record this task as skipped in the execution log with the Task 12 evidence hash and create no matching-pursuit TypeScript files.**

**Files when executed:**
- Create: `packages/core/benchmarks/research/matchingPursuit.ts`
- Create: `packages/core/test/autoeq/v2/research/matchingPursuit.test.ts`

- [ ] **Step 1: Freeze Python survivor parity fixture**

Use one synthetic problem and record exact dictionary atom order, first three selected atom IDs, bounded gain vector, and canonical delivered checkpoint metrics.

- [ ] **Step 2: Implement deterministic TS dictionary/correlation**

Use core biquad response math, 24 frequencies/octave, the Task 8 PK-Q list, shelves, stable dictionary ordering, and the same normalized correlation formula.

- [ ] **Step 3: Implement deterministic bounded gain solver**

Use cyclic projected coordinate least squares for at most 10 selected atoms. Initialize all gains to zero. Perform at most 32 sweeps in atom order. For each atom `j`, calculate the target residual excluding atom `j`, update:

```ts
const unconstrained = denominator === 0 ? 0 : numerator / denominator
const next = Math.min(maxGainDb, Math.max(minGainDb, unconstrained))
```

where `numerator = dot(columnJ, residualWithoutJ)` and `denominator = dot(columnJ, columnJ)`. Stop early only when the maximum absolute gain change in one complete sweep is at most `1e-10`. Test bounds and deterministic convergence explicitly.

- [ ] **Step 4: Prove structural/canonical parity**

Require the same first three atom IDs as Python. Gain values may differ from SciPy but must satisfy bounds and produce canonical metrics no worse than the parity fixture by more than `1e-6 dB` RMSE and `1e-6 dB` maxAbs on the synthetic fixture.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/matchingPursuit.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/matchingPursuit.ts \
  packages/core/test/autoeq/v2/research/matchingPursuit.test.ts
git commit -m "feat(research): port shortlisted matching pursuit"
```

---

### Task 13B: Port structural beam to TypeScript only if shortlisted

**Execute only if Task 12 shortlists structural beam. Otherwise record this task as skipped in the execution log with the Task 12 evidence hash and create no structural-beam TypeScript files.**

**Files when executed:**
- Create: `packages/core/benchmarks/research/structuralBeam.ts`
- Create: `packages/core/test/autoeq/v2/research/structuralBeam.test.ts`

- [ ] **Step 1: Freeze structural proposal parity fixture**

Record one input filter set plus exact add-PK/LS/HS, remove, type-mutation, split, and merge proposals from Python `structural.py`.

- [ ] **Step 2: Implement exact TS proposal rules**

Mirror bounds projection, `1/24`-octave split ratio, same-type merge threshold of `1/12` octave, gain-weighted log-frequency merge center, summed merge gain, and averaged Q.

- [ ] **Step 3: Implement beam retention**

Apply Pareto nondomination first and Reference Selector trimming second. Enforce Max10 before local polish and after delivery.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/structuralBeam.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/structuralBeam.ts \
  packages/core/test/autoeq/v2/research/structuralBeam.test.ts
git commit -m "feat(research): port shortlisted structural beam"
```

---

### Task 14: Run the same-runtime 5/15/30/60-second adversarial tournament

**Files:**
- Create: `packages/core/benchmarks/research/capacityTournament.ts`
- Create: `packages/core/benchmarks/research/capacityTournamentRun.ts`
- Create: `packages/core/test/autoeq/v2/research/capacityTournament.test.ts`
- Modify: `packages/core/package.json`
- Create: `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-tournament-results.md`

**Checkpoints:**

```ts
export const CAPACITY_TOURNAMENT_CHECKPOINTS_MS = [5000, 15000, 30000, 60000] as const
```

- [ ] **Step 1: Write RED hard-deadline and monotonicity tests**

Use fake variants to prove checkpoint capture at 5/15/30/60 seconds and that the selected delivered best-so-far never regresses under Pareto/Reference Selector semantics.

- [ ] **Step 2: Register only Task 12 survivors**

Eligible IDs are `resumable-beam-v1`, `state-bank-v1`, `matching-pursuit-v1` when Task 13A ran, and `structural-beam-v1` when Task 13B ran. If a justified hybrid is included, include each component ablation in the same tournament.

- [ ] **Step 3: Run only Max10 real adversarial cases**

Use `titan-to-storm`, `titan-to-u12t`, and `titan-to-trio`. Max20/40 teachers do not enter the runtime tournament.

- [ ] **Step 4: Emit complete canonical checkpoint evidence**

Every checkpoint stores filters, canonical RMSE/maxAbs, delivered filter count, Directed Reference Regret v1, `referenceImproved`, snapshot hash, termination/deadline metadata, and machine/runner metadata. Compute QTF from the same run trajectory.

- [ ] **Step 5: Add CLI and run**

Add:

```json
"research:capacity-tournament": "tsx benchmarks/research/capacityTournamentRun.ts"
```

Run exactly:

```bash
pnpm --filter @autoeq-workbench/core research:capacity-tournament -- \
  --snapshot "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json" \
  --cases titan-to-storm,titan-to-u12t,titan-to-trio \
  --checkpoints-ms 5000,15000,30000,60000 \
  --out "$AUTOEQ_CAPACITY_OUT_DIR/same-runtime-tournament"
```

- [ ] **Step 6: Write results document**

For every case/budget report raw RMSE/maxAbs, delivered filter count, directed regret, QTF, reference improvements, control deltas, monotonicity, and deadline correctness. Do not label a winner product-ready.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/capacityTournament.test.ts \
  test/autoeq/v2/research/solverRunArtifact.test.ts \
  test/autoeq/v2/research/qualityTime.test.ts \
  test/autoeq/v2/research/referenceRegret.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/capacityTournament.ts \
  packages/core/benchmarks/research/capacityTournamentRun.ts \
  packages/core/test/autoeq/v2/research/capacityTournament.test.ts \
  packages/core/package.json \
  docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-tournament-results.md
git commit -m "feat(research): run capacity-aware same-runtime tournament"
```

---

### Task 15: Re-enter the strict Calibration Manifest gate

**Files:**
- Modify only when tests demonstrate corrected QTF/reference metadata requires code change: `research/solver-lab/src/autoeq_solver_lab/calibration.py`
- Modify when source changes: `research/solver-lab/tests/test_calibration.py`
- Create: `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-calibration-decision.md`

- [ ] **Step 1: Confirm strict calibration tests**

Require `insufficient` when there is no strict aggregate control improvement or thresholds would be vacuous. Require any valid manifest to carry the implemented QTF formula version/hash. Confirm Tasks 1-14 do not require a manifest.

- [ ] **Step 2: Run calibration from same-runtime development/adversarial evidence**

Do not inspect/open holdout. Preserve current calibration formula/threshold derivation except for metadata needed to identify the implemented QTF formula.

- [ ] **Step 3: Record exactly one outcome**

Outcome A: a valid non-vacuous `OracleCalibrationManifestV1` is frozen for the next promotion gate. Outcome B: calibration remains insufficient and no manifest is manufactured. Record artifact hashes and reasons in the decision document.

- [ ] **Step 4: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_calibration.py \
  research/solver-lab/tests/test_reference_regret.py \
  research/solver-lab/tests/test_quality_time.py
git diff --check
```

If `calibration.py` changed:

```bash
git add research/solver-lab/src/autoeq_solver_lab/calibration.py \
  research/solver-lab/tests/test_calibration.py \
  docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-calibration-decision.md
git commit -m "feat(research): align capacity-aware calibration metadata"
```

If no source change was needed:

```bash
git add docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-calibration-decision.md
git commit -m "docs(research): record capacity-aware calibration decision"
```

---

### Task 16: Coherent endpoint verification and stop before holdout/product promotion

**Files:** no source changes expected.

- [ ] **Step 1: Run full solver-lab tests**

```bash
python -m pytest -q research/solver-lab/tests
```

- [ ] **Step 2: Run focused core research/v2 tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
pnpm --filter @autoeq-workbench/core typecheck
```

- [ ] **Step 3: Run repository gates once**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
git diff --check
```

- [ ] **Step 4: Inspect production/default equivalence**

Confirm no default Max Filters value changed, no UI/session/export behavior changed, no Standard v1 source changed, and `runStandardAutoEqV2()` still uses the compatibility path unless a research-only runner explicitly selects a research mechanism.

- [ ] **Step 5: Stop at promotion boundary**

Do not open holdout, merge, deploy, release, publish, or make a research winner the default solver under this plan. If evidence warrants promotion, write a separate product-distillation design/plan from the actual tournament and calibration decision.

---

## Plan Completion Gate

This plan is complete only when:

1. `OracleReferenceSnapshotV1` is implemented, validated, content-hashed, and frozen from existing corrected Oracle evidence for the declared real-case cells.
2. Directed Reference Regret v1 is parity-tested in Python/TypeScript and never penalizes reference domination.
3. QTF v1 is parity-tested, references deliverable snapshot fronts, and has no Calibration Manifest prerequisite.
4. Reference Pareto Selector and common run artifact are parity-tested.
5. `jointRefineV2()` behavior remains exactly compatible after continuation extraction.
6. Resumable/state-bank search is research-only and keeps fresh capacity separate from proposal-bank capacity.
7. Matching pursuit is implemented and canonically evaluated.
8. High-cap teacher-to-Max10 compression scores students against the original target.
9. Structural beam reuses the existing mutation library and preserves Pareto-first retention.
10. Storm, U12t, and Trio have reproducible fixed-cap/compression evidence and explicit classifications.
11. No more than three evidence-backed mechanisms/components enter the same-runtime tournament.
12. Final tournament evidence contains canonical monotonic 5/15/30/60-second trajectories in TypeScript/Node.
13. Calibration either freezes a non-vacuous manifest or explicitly remains insufficient.
14. Full repository verification is green at the coherent endpoint.
15. Holdout and production promotion remain unopened/unmodified.

## OpenCode Execution Handoff

Execute sequentially and directly; do not spawn subagents. At each task boundary run:

```bash
git status --short
git diff --check
```

Preserve exact artifact hashes and commit SHAs in the screening, tournament, and calibration decision documents. For Tasks 13A/13B, follow the Task 12 shortlist and do not implement eliminated mechanisms “just in case”.
