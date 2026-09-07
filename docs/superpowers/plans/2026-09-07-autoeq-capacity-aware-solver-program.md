# AutoEQ Capacity-Aware Solver Program Implementation Plan

> **For OpenCode:** REQUIRED EXECUTION MODE: execute this plan inline/directly, task-by-task, in one development session or resumed session state. Do **not** use subagent-driven development. If Superpowers skills are available, use `superpowers:executing-plans`, not `superpowers:subagent-driven-development`. Track progress with the `- [ ]` checkboxes in this file.

**Goal:** Implement the approved Capacity-Aware Solver Program: freeze a best-known deliverable reference snapshot, define directed reference regret and corrected QTF, recover fixed-cap Max10 quality with resumable/state-bank search plus sparse/structural methods, test Max20/40 teacher-to-Max10 compression, classify capacity/search failure modes, and run an evidence-backed same-runtime 5/15/30/60-second tournament without changing production behavior.

**Architecture:** Research evidence is split into two contracts: `OracleReferenceSnapshotV1` is the immutable scientific reference used by QTF, screening, and teacher selection; `OracleCalibrationManifestV1` remains a later, stricter promotion-threshold artifact. The runtime-relevant program is narrowed to three mechanisms/components: resumable/state-bank search with known-good/transfer proposals, sparse matching pursuit with teacher compression, and structural beam search. Python remains the laboratory for structural discovery and compression; TypeScript remains the canonical delivered evaluator and the authority for the final same-runtime tournament.

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
- Directed Reference Regret v1 uses positive-part deltas and must return zero when a candidate dominates a reference point. Report that case separately as `referenceImproved=true`.
- QTF is a screening/ranking summary only. Raw canonical RMSE, maxAbs, Pareto/frontier evidence, and 5/15/30/60-second checkpoints remain primary evidence.
- Cross-language screening uses canonical quality versus evaluation/work count. Do not claim product speed from Python-vs-Node wall-clock.
- The final speed comparison is same-runtime Node/TypeScript, same runner/process, with monotonic best-so-far delivery at 5/15/30/60 seconds.
- No new raw/private/user curves may be added. Use only the already approved real corpus plus synthetic cases.
- Use focused TDD. Each numbered task ends in one coherent commit after `git diff --check`.
- Generated large research artifacts stay outside Git history unless repository policy already marks them as approved small fixtures. Commit only small deterministic fixtures, code, manifests/hashes, and results/spec documents.
- Required external evidence input is the existing corrected Oracle campaign directory. At execution start export:

```bash
export AUTOEQ_ORACLE_EVIDENCE_DIR="${AUTOEQ_ORACLE_EVIDENCE_DIR:?point this at the existing corrected Oracle campaign root}"
export AUTOEQ_CAPACITY_OUT_DIR="${AUTOEQ_CAPACITY_OUT_DIR:-$PWD/.research-artifacts/capacity-aware}"
mkdir -p "$AUTOEQ_CAPACITY_OUT_DIR"
```

If `AUTOEQ_ORACLE_EVIDENCE_DIR` is unavailable, do not rerun a broad Oracle campaign merely to satisfy this plan. Implement/test the contracts first and record the missing-evidence blocker before experiment tasks.

---

## File/Responsibility Map

### Python solver lab

- `research/solver-lab/src/autoeq_solver_lab/reference_snapshot.py` — `OracleReferenceSnapshotV1` schema, validation, canonical serialization/hash, freeze from existing case artifacts.
- `research/solver-lab/src/autoeq_solver_lab/reference_regret.py` — Directed Reference Regret v1 plus `reference_improved` detection.
- `research/solver-lab/src/autoeq_solver_lab/quality_time.py` — QTF v1 formula/hash and exact log-time integration.
- `research/solver-lab/src/autoeq_solver_lab/selector.py` — frozen Reference Pareto Selector used for deterministic trimming only.
- `research/solver-lab/src/autoeq_solver_lab/trajectory.py` — language-neutral best-so-far run artifact model.
- `research/solver-lab/src/autoeq_solver_lab/screening.py` — research summaries by evaluation count/reference regret/QTF.
- `research/solver-lab/src/autoeq_solver_lab/solvers/matching_pursuit.py` — fixed-cap sparse structure discovery.
- `research/solver-lab/src/autoeq_solver_lab/teacher_compression.py` — high-cap teacher to <=10-filter student compression.
- `research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py` — structural beam using existing mutation primitives.
- `research/solver-lab/src/autoeq_solver_lab/run_capacity_study.py` — case-focused Max10/high-cap study orchestration.
- `research/solver-lab/src/autoeq_solver_lab/case_classification.py` — evidence-based case classification support.

### TypeScript research/core

- `packages/core/benchmarks/research/referenceSnapshot.ts` — TS validation/lookup for snapshot cells.
- `packages/core/benchmarks/research/referenceRegret.ts` — TS Directed Reference Regret v1 parity implementation.
- `packages/core/benchmarks/research/qualityTime.ts` — TS QTF v1 parity implementation.
- `packages/core/benchmarks/research/referenceSelector.ts` — TS selector parity implementation.
- `packages/core/benchmarks/research/solverRunArtifact.ts` — TS run artifact validator/serializer.
- `packages/core/src/autoeq/v2/jointRefineContinuation.ts` — compatibility-preserving resumable joint refinement.
- `packages/core/benchmarks/research/resumableScheduler.ts` — research-only resumable/state-bank policies.
- `packages/core/benchmarks/research/resumableRun.ts` — state-bank runner emitting the common run artifact.
- `packages/core/benchmarks/research/capacityTournament.ts` — same-runtime 5/15/30/60 tournament orchestration.
- `packages/core/benchmarks/research/capacityTournamentRun.ts` — CLI for final adversarial tournament.
- Conditional survivor ports: `matchingPursuit.ts` and/or `structuralBeam.ts` under `packages/core/benchmarks/research/` only if their Python evidence survives Task 11.

---

### Task 1: Define and freeze `OracleReferenceSnapshotV1`

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/reference_snapshot.py`
- Create: `research/solver-lab/tests/test_reference_snapshot.py`
- Create: `research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json`
- Modify: `research/solver-lab/pyproject.toml`

**Interfaces:**

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

Test exact rejection of duplicate cells, duplicate candidate IDs inside a cell, mismatched problem/hash/cap, delivered counts above cap, non-finite metrics, invalid SHA-256, invalid `reference_state`, and frontier IDs that do not exist in `candidates`.

Use a synthetic control plus two deliverable candidates where one candidate dominates control. Assert the builder admits control to the union, then emits only nondominated frontier IDs while retaining the control candidate in `candidates`.

- [ ] **Step 2: Run RED**

```bash
python -m pytest -q research/solver-lab/tests/test_reference_snapshot.py
```

Expected: FAIL because `reference_snapshot.py` does not exist.

- [ ] **Step 3: Implement canonical payload hashing**

Canonical serialization is UTF-8 JSON with sorted keys and compact separators. `content_sha256` is computed over the full snapshot payload with `contentSha256` omitted, then stored as lowercase hex.

```python
def canonical_snapshot_payload(snapshot_without_hash: Mapping[str, Any]) -> str:
    return json.dumps(
        snapshot_without_hash,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
```

- [ ] **Step 4: Build cells from existing corrected campaign case artifacts**

Reuse `campaign.validate_case_artifact()` and existing `io.py` candidate/evaluation parsers. Do not invent a second Oracle artifact parser.

For deliverable reference points, use each case artifact's `deliverable.json` MaxFilters frontier plus the frozen control from `control.json`; canonical metrics and delivered filter arrays come from the stored canonical evaluations. Continuous fronts are copied only into `continuous_diagnostic_frontier`.

Reference state rule is conservative:

```python
if latest_aggregate_convergence_for_cell is explicitly resolved:
    state = "stable-under-current-search"
else:
    state = "still-moving"
```

Absence of convergence evidence must never be upgraded to stable.

- [ ] **Step 5: Add CLI**

Add:

```toml
autoeq-reference-snapshot = "autoeq_solver_lab.reference_snapshot:main"
```

CLI contract:

```text
autoeq-reference-snapshot \
  --campaign-root <existing corrected campaign root> \
  --repository-sha <git SHA> \
  --corpus-version autoeq-research-corpus-v1 \
  --canonical-evaluator-version standard-v2-canonical-v1 \
  --out <OracleReferenceSnapshotV1.json>
```

The CLI recursively discovers `case-manifest.json`, validates every selected case artifact, keeps the latest valid evidence per `problemId × maxFilters`, and includes every available Max10/20/40 cell for `titan-to-storm`, `titan-to-u12t`, and `titan-to-trio`. Require Max10 for all three cases and at least one of Max20/Max40 per case.

- [ ] **Step 6: Run GREEN and freeze current snapshot**

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
git diff --check
```

- [ ] **Step 7: Commit**

```bash
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

**Interfaces:**

```python
@dataclass(frozen=True)
class ReferenceRegretResult:
    regret: float
    reference_improved: bool


def directed_reference_regret(
    point: ObjectivePoint,
    frontier: Sequence[ObjectivePoint],
    rmse_scale: float = 0.25,
    max_abs_scale: float = 0.75,
) -> ReferenceRegretResult: ...
```

TypeScript:

```ts
export interface ReferenceObjectivePoint {
  candidateId: string
  rmseDb: number
  maxAbsDb: number
  filterCount: number
}

export interface ReferenceRegretResult {
  regret: number
  referenceImproved: boolean
}

export function directedReferenceRegret(
  point: ReferenceObjectivePoint,
  frontier: readonly ReferenceObjectivePoint[],
): ReferenceRegretResult
```

- [ ] **Step 1: Write RED parity vectors**

Fixture cases must cover: worse in both dimensions, worse in RMSE only, worse in maxAbs only, equal to a frontier point, candidate dominating one frontier point, and a multi-point incomparable frontier.

The normative formula is exactly:

```text
min_r sqrt(
  (max(0, candidate.rmse - r.rmse) / 0.25)^2 +
  (max(0, candidate.maxAbs - r.maxAbs) / 0.75)^2
)
```

`referenceImproved=true` iff the candidate strictly Pareto-dominates at least one stored nondominated reference point under the existing epsilon semantics.

- [ ] **Step 2: Implement Python helper and reuse it in calibration**

Replace duplicate directed-distance arithmetic inside `calibration.py` with an import from `reference_regret.py`, but do not change calibration validity/freeze rules.

- [ ] **Step 3: Implement TypeScript parity helper**

Use the same epsilon `1e-12` and finite-input validation. Do not use the old symmetric `normalized_regret` semantics.

- [ ] **Step 4: Verify parity and commit**

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
- Read fixture: `research/solver-lab/tests/fixtures/oracle-reference-snapshot-v1.json`

**Interfaces:**

```ts
export interface OracleReferenceSnapshotV1 { /* exact JSON contract from Task 1 */ }

export function assertOracleReferenceSnapshotV1(
  value: unknown,
): asserts value is OracleReferenceSnapshotV1

export function getReferenceCell(
  snapshot: OracleReferenceSnapshotV1,
  problemId: string,
  inputSha256: string,
  maxFilters: number,
): OracleReferenceSnapshotV1['cells'][number]
```

- [ ] **Step 1: Write RED tests against the shared Python fixture**

Require exact rejection of unknown version, invalid hash, duplicate cells, bad frontier IDs, and wrong cap/hash lookup.

- [ ] **Step 2: Implement validator and lookup**

Keep this module research-only. It may use Node crypto for SHA verification because it is under `benchmarks/research`, not shipping runtime.

- [ ] **Step 3: Verify and commit**

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

**Interfaces:**

```python
QUALITY_TIME_FORMULA_VERSION = 1
QUALITY_TIME_T_MIN_SECONDS = 0.5
QUALITY_TIME_T_MAX_SECONDS = 60.0

@dataclass(frozen=True)
class RegretTimelinePoint:
    elapsed_seconds: float
    regret: float


def quality_from_regret(regret: float) -> float: ...
def quality_time_formula_sha256() -> str: ...
def compute_quality_time_frontier(points: Sequence[RegretTimelinePoint]) -> float: ...
```

Canonical descriptor is exactly:

```json
{"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","reference":"oracle-reference-snapshot-v1:deliverable-frontier","regret":"directed-reference-regret-v1","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}
```

- [ ] **Step 1: Write RED fixture/tests**

Cases: constant regret 0 -> score 1; constant regret 1 -> `exp(-1)`; improvement from regret 1 to 0 at 5 seconds; duplicate timestamps keep last; update at exactly 60 seconds contributes no prior area; final value is held to 60 seconds; invalid timestamps/regrets reject.

- [ ] **Step 2: Implement exact piecewise log-time integration in Python**

```python
active_q = quality_from_regret(last_point_at_or_before_0_5.regret)
left = 0.5
area = 0.0
for point in points_strictly_inside_window:
    area += active_q * math.log(point.elapsed_seconds / left)
    left = point.elapsed_seconds
    active_q = quality_from_regret(point.regret)
area += active_q * math.log(60.0 / left)
return area / math.log(60.0 / 0.5)
```

- [ ] **Step 3: Implement identical TypeScript behavior and formula hash**

Use the exact descriptor string above; hash UTF-8 bytes with SHA-256. The shared fixture stores the expected hash after Python generates it.

- [ ] **Step 4: Verify parity and commit**

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

**Interfaces:**

Selector policy is frozen as:

1. target-achieved (`rmse <= 0.25`, `maxAbs <= 0.75`) beats not achieved;
2. among target-achieved: lower delivered filter count, then lower RMSE, then lower maxAbs;
3. outside target: minimize `sqrt((rmse/0.25)^2 + (maxAbs/0.75)^2)`;
4. tie-break lower RMSE, lower maxAbs, lower cancellation score, lower delivered filter count, stable candidate ID.

Run artifact:

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

- [ ] **Step 1: Write RED selector parity tests**

Use the same JSON vectors in Python/TS and require identical winner IDs.

- [ ] **Step 2: Write RED trajectory invariants**

Require nondecreasing evaluation count/time, exact problem/hash/cap/snapshot identity, finite metrics/regret, and monotonic best-so-far selection. `reference_improved` is informational and never causes a point to be discarded.

- [ ] **Step 3: Implement Python builder and screening summary**

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

Do not add an acceptance threshold from `OracleCalibrationManifestV1` here.

- [ ] **Step 4: Implement TS validator/serializer**

Require canonical key ordering and byte-stable serialization for one shared fixture.

- [ ] **Step 5: Verify and commit**

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

**Interfaces:**

```ts
export interface JointRefineContinuationV2 {
  solution: V2EvaluatedSolution
  completedCycles: number
  coordinateTrials: number
  nextCycleIndex: number
  done: boolean
  expired: boolean
}

export function createJointRefineContinuationV2(
  input: JointRefineInput,
): JointRefineContinuationV2

export function advanceJointRefineContinuationV2(
  continuation: JointRefineContinuationV2,
  input: Omit<JointRefineInput, 'solution'>,
  maxAdditionalCycles: number,
): JointRefineResult & { continuation: JointRefineContinuationV2 }
```

- [ ] **Step 1: Write RED equivalence tests before refactor**

Capture current `jointRefineV2()` outputs for PK-only, shelf-only, and mixed solutions at 1, 2, and 6 configured cycles. Assert exact filters, canonical metrics, completed cycles, coordinate trials, expiration, and cancellation-audit behavior.

- [ ] **Step 2: Extract one completed-cycle unit**

Move cycle state into `JointRefineContinuationV2` without changing `JOINT_REFINEMENT_SCALES`, coordinate order, tie-breaks, deadline checks, lazy cancellation audit, or research trace semantics.

- [ ] **Step 3: Keep `jointRefineV2()` as compatibility wrapper**

The wrapper repeatedly advances until the pre-existing cycle/deadline stop rule. It must not expose new behavior to `runStandardAutoEqV2()`.

- [ ] **Step 4: Verify exact compatibility and commit**

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/jointRefineContinuation.test.ts \
  test/autoeq/v2/runStandardAutoEqV2.test.ts \
  test/autoeq/v2/progressiveDelivery.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/src/autoeq/v2/jointRefine.ts \
  packages/core/src/autoeq/v2/jointRefineContinuation.ts \
  packages/core/test/autoeq/v2/jointRefineContinuation.test.ts
git commit -m "refactor(core): expose resumable v2 joint refinement"
```

Any compatibility drift is a blocker; do not continue to scheduler work until this task is green.

---

### Task 7: Implement resumable/state-bank research scheduling and proposal sources

**Files:**
- Create: `packages/core/benchmarks/research/resumableScheduler.ts`
- Create: `packages/core/benchmarks/research/resumableRun.ts`
- Create: `packages/core/benchmarks/research/proposalSeeds.ts`
- Create: `packages/core/test/autoeq/v2/research/resumableScheduler.test.ts`
- Create: `packages/core/test/autoeq/v2/research/proposalSeeds.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**

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

- [ ] **Step 1: Write RED scheduler tests**

Use fake continuations where a lower-ranked fresh state becomes best after a later slice. Verify pause/resume works. Verify transferred/known-good states are stored in a separate bank and do not reduce the configured fresh-state capacity merely by insertion.

- [ ] **Step 2: Implement two exact policies**

`resumable-beam-v1`: every fresh state receives one completed refinement cycle before additional cycles are allocated one-at-a-time by Pareto/Reference Selector order.

`state-bank-v1`: same fresh queue plus a separate proposal bank. Allocate at most one proposal-bank slice for every two fresh slices while fresh runnable states exist. Proposal-bank states never displace fresh states by array capacity alone.

- [ ] **Step 3: Implement proposal seed import**

The importer accepts already approved known-good/warm-start/v1-derived filter records and validates problem/hash/bounds before scheduling. It does not execute or modify frozen v1.

- [ ] **Step 4: Emit `SolverRunArtifactV1`**

`resumableRun.ts` records coordinate trials as `evaluationCount`, canonical delivered metrics, Directed Reference Regret v1, reference-improvement flag, origin metadata, and snapshot hash. It computes QTF only when an elapsed-time trajectory has a valid point active by 0.5 seconds.

- [ ] **Step 5: Add script and verify**

Add:

```json
"research:resumable": "tsx benchmarks/research/resumableRun.ts"
```

Run:

```bash
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/resumableScheduler.test.ts \
  test/autoeq/v2/research/proposalSeeds.test.ts \
  test/autoeq/v2/jointRefineContinuation.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/resumableScheduler.ts \
  packages/core/benchmarks/research/resumableRun.ts \
  packages/core/benchmarks/research/proposalSeeds.ts \
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

**Interfaces:**

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

class MatchingPursuitSolver:
    algorithm_id = "matching-pursuit"
    def run(...) -> SolverRunResult: ...
```

- [ ] **Step 1: Write RED dictionary/determinism tests**

Require frequencies remain inside problem bounds, PK Q values remain inside bounds, shelf Q equals product shelf Q, atom order is deterministic, and repeated runs with identical input/seed/budget emit the same candidate IDs and filter sequences.

- [ ] **Step 2: Implement cached unit-response dictionary**

Use the existing parity-tested lab DSP. Select atoms by deterministic residual correlation; after each structural selection solve bounded gains with `scipy.optimize.lsq_linear`.

- [ ] **Step 3: Implement bounded nonlinear polish and canonical checkpoints**

After sparse selection, use bounded Powell only as a polish primitive. Every admitted checkpoint is passed through the existing canonical evaluator; laboratory surrogate metrics never become official evidence directly.

- [ ] **Step 4: Add synthetic quality tests**

For a one-peak case, select a PK center within one dictionary step and reduce canonical RMSE versus zero filters. For a two-feature case, require two selected atoms reduce both RMSE and maxAbs versus one atom under the fixed test budget.

- [ ] **Step 5: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_matching_pursuit.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/solvers \
  research/solver-lab/tests/test_matching_pursuit.py
git commit -m "feat(research): add sparse matching pursuit"
```

---

### Task 9: Implement Max20/40 teacher to <=10-filter student compression

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/teacher_compression.py`
- Create: `research/solver-lab/tests/test_teacher_compression.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class TeacherCompressionConfig:
    max_student_filters: int = 10
    matching_pursuit_config: MatchingPursuitConfig
    nonlinear_polish_evaluations: int = 1200
    structural_rounds: int = 3

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

- [ ] **Step 1: Write RED teacher eligibility tests**

Official teacher must come from a deliverable Max20 or Max40 reference frontier in the same snapshot/problem/hash. Reject continuous-only candidates, wrong-case teachers, and Max10 teachers passed as high-cap teachers.

- [ ] **Step 2: Implement teacher-guided proposal extraction**

Teacher response/filter regions may seed atom frequency/Q/type proposals, but final optimization residual is always the original `problem.desiredDb`.

- [ ] **Step 3: Implement compression sequence**

Use this order:

```text
teacher structural regions
-> matching-pursuit atom proposal
-> bounded least-squares gains
-> prune/remove low-value atoms
-> merge nearby redundant same-type atoms
-> split/reallocate only when original-target canonical metrics improve
-> deterministic dedupe
-> bounded nonlinear polish
-> product quantization/delivery
-> canonical evaluation against original target
```

Never admit a student with more than 10 delivered filters.

- [ ] **Step 4: Add tests proving teacher imitation is not the objective**

Construct a synthetic teacher with a deliberate small error. Create two <=10 students where one matches the teacher response better but is worse against the original target. Assert the original-target-better student wins.

- [ ] **Step 5: Verify and commit**

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
- Reuse: `research/solver-lab/src/autoeq_solver_lab/structural.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class StructuralBeamConfig:
    beam_width: int
    proposals_per_parent: int
    local_polish_evaluations: int
    max_filters: int

class StructuralBeamSolver:
    algorithm_id = "structural-beam"
    def run(...) -> SolverRunResult: ...
```

Initial variants:

```text
beam-4:  beam_width=4, proposals_per_parent=8, local_polish_evaluations=120
beam-12: beam_width=12, proposals_per_parent=8, local_polish_evaluations=120
```

- [ ] **Step 1: Write RED beam retention tests**

Use synthetic Pareto-incomparable proposals and prove retention applies nondomination first, then Reference Pareto Selector only to trim beyond beam width.

- [ ] **Step 2: Reuse exact existing structural mutations**

Use `generate_structural_mutations()` for add PK/LS/HS, remove, type mutation, split, and merge. Do not introduce a second mutation library.

- [ ] **Step 3: Add seed injection**

Allow initial seeds from matching pursuit and teacher-compression students so the same beam implementation can test B+C hybrids later without hiding their origin.

- [ ] **Step 4: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_structural_beam.py \
  research/solver-lab/tests/test_structural.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/solvers/structural_beam.py \
  research/solver-lab/tests/test_structural_beam.py
git commit -m "feat(research): add structural beam solver"
```

---

### Task 11: Run case-focused Fixed-Cap and compression studies before broad tournament

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/run_capacity_study.py`
- Create: `research/solver-lab/src/autoeq_solver_lab/case_classification.py`
- Create: `research/solver-lab/tests/test_run_capacity_study.py`
- Create: `research/solver-lab/tests/test_case_classification.py`
- Modify: `research/solver-lab/pyproject.toml`

**Interfaces:**

```python
CaseClassification = Literal[
    "search-recoverable",
    "mixed",
    "capacity-suspected",
    "cap-limited",
]

@dataclass(frozen=True)
class CaseClassificationEvidence:
    problem_id: str
    max10_reference_state: ReferenceState
    high_cap_reference_state: ReferenceState
    high_cap_strict_advantage: bool
    max10_reference_improved_by_fixed_cap_search: bool
    max10_reference_improved_by_compression: bool
    compression_attempt_count: int
    compression_best_reference_regret: float
    classification: CaseClassification
```

- [ ] **Step 1: Write RED orchestration tests**

Require exact cases:

```text
titan-to-storm
titan-to-u12t
titan-to-trio
```

and exact evaluation rounds:

```text
2,000
10,000
50,000
```

Use seeds `11, 29, 47, 71, 101` for randomized Python adapters; deterministic adapters may repeat with a single declared seed while preserving the same budget accounting.

- [ ] **Step 2: Implement fixed-cap study runner**

For Max10 run:

```text
matching-pursuit
structural-beam-4
structural-beam-12
matching-pursuit -> structural-beam-4
```

Import TypeScript `resumable-beam-v1` and `state-bank-v1` artifacts into the same screening summaries. Known-good/transfer/v1 seed sources remain variants of those state-bank mechanisms, not separate families.

- [ ] **Step 3: Implement high-cap teacher selection/compression loop**

For each case choose every nondominated deliverable teacher from the best available stable-or-moving Max20/Max40 snapshot cell and attempt <=10 compression under the same declared compression configuration. Record teacher/student canonical metrics and snapshot hashes.

- [ ] **Step 4: Implement conservative classification rules**

Use:

```python
if high_cap_reference_state == "still-moving" or max10_reference_state == "still-moving":
    classification = "capacity-suspected" if high_cap_strict_advantage else "search-recoverable"
elif max10_reference_improved_by_compression:
    classification = "mixed"
elif max10_reference_improved_by_fixed_cap_search:
    classification = "search-recoverable"
elif high_cap_strict_advantage and compression_attempt_count > 0:
    classification = "cap-limited"
else:
    classification = "search-recoverable"
```

A `cap-limited` result is valid only after the runner confirms all official high-cap teachers were attempted under the frozen compression configuration and no <=10 student improved the stable Max10 reference. Reports must include raw high-cap-vs-Max10 metric deltas so a tiny numerical dominance is not described textually as a material product claim.

- [ ] **Step 5: Add CLI and run studies**

Add:

```toml
autoeq-capacity-study = "autoeq_solver_lab.run_capacity_study:main"
```

Run:

```bash
python -m autoeq_solver_lab.run_capacity_study \
  --snapshot "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json" \
  --cases titan-to-storm,titan-to-u12t,titan-to-trio \
  --evaluation-budgets 2000,10000,50000 \
  --seeds 11,29,47,71,101 \
  --out "$AUTOEQ_CAPACITY_OUT_DIR/case-study"
```

- [ ] **Step 6: Verify and commit runner code**

```bash
python -m pytest -q research/solver-lab/tests/test_run_capacity_study.py \
  research/solver-lab/tests/test_case_classification.py
python -m pytest -q research/solver-lab/tests/test_matching_pursuit.py \
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

### Task 12: Record evidence, classifications, and shortlist at most three mechanisms

**Files:**
- Create: `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-screening-results.md`

**Evidence table must contain for each case/mechanism:**

```text
snapshot SHA
reference state
algorithm/variant
seed(s)
evaluation budget
final canonical RMSE
final canonical maxAbs
final directed reference regret
referenceImproved
QTF when same-runtime elapsed trajectory is available
teacher ID/cap when applicable
student delivered filter count when applicable
artifact SHA-256
```

- [ ] **Step 1: Review Fixed-Cap evidence**

For Storm, U12t, Trio report which of resumable/state-bank, matching pursuit, and structural beam produces unique strict Max10 reference improvements or unique case wins by final directed regret.

- [ ] **Step 2: Review compression evidence**

For each case state whether high-cap advantage exists, whether the reference is stable or moving, how many official teachers were compressed, best <=10 student metrics, and the resulting classification.

- [ ] **Step 3: Apply shortlist rule**

At most three mechanisms/components proceed. Keep a mechanism if it has at least one of:

```text
- a strict canonical improvement of the frozen Max10 reference;
- a unique case win in final directed reference regret at an equal evaluation budget;
- a compression result that recovers a Max10 state not found by the other mechanisms.
```

If none of those apply, eliminate the mechanism and record the artifact-backed reason. Do not retain a mechanism solely because of Python wall-clock.

- [ ] **Step 4: Commit the results document**

```bash
git add docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-screening-results.md
git commit -m "docs: record capacity-aware solver screening"
```

---

### Task 13A: Port matching pursuit to TypeScript only if shortlisted

**Execute this task only when Task 12 shortlists matching pursuit as a runtime mechanism/component. If it is eliminated, mark every checkbox in this task as skipped in the execution log and cite the Task 12 evidence; do not create these files.**

**Files:**
- Create: `packages/core/benchmarks/research/matchingPursuit.ts`
- Create: `packages/core/test/autoeq/v2/research/matchingPursuit.test.ts`

- [ ] **Step 1: Write parity fixture from Python survivor**

Commit one synthetic problem with exact first-N atom choices, bounded gain solution, and canonical delivered checkpoint metrics.

- [ ] **Step 2: Implement deterministic TS dictionary/correlation path**

Use existing core biquad response math and product bounds. Do not port SciPy; use the smallest bounded least-squares routine needed for the selected atom count, with deterministic active-set/clamping tests.

- [ ] **Step 3: Prove canonical parity and commit**

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

**Execute this task only when Task 12 shortlists structural beam as a runtime mechanism/component. If it is eliminated, mark every checkbox in this task as skipped in the execution log and cite the Task 12 evidence; do not create these files.**

**Files:**
- Create: `packages/core/benchmarks/research/structuralBeam.ts`
- Create: `packages/core/test/autoeq/v2/research/structuralBeam.test.ts`

- [ ] **Step 1: Freeze structural proposal parity vectors**

Use exact add/remove/split/merge/type-mutation vectors derived from the Python `structural.py` semantics and product bounds.

- [ ] **Step 2: Implement TS research structural proposals and beam retention**

Retain Pareto-first/Reference Selector trimming and exact max-filter enforcement. Do not alter production candidate generation.

- [ ] **Step 3: Verify and commit**

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

**Interfaces:**

```ts
export const CAPACITY_TOURNAMENT_CHECKPOINTS_MS = [5000, 15000, 30000, 60000] as const

export interface CapacityTournamentVariant {
  id: string
  run(input: CapacityTournamentInput): Promise<SolverRunArtifactV1>
}
```

- [ ] **Step 1: Write RED hard-deadline/monotonicity tests**

Use fake variants to prove one run emits best-so-far checkpoints at all four budgets and that later checkpoints cannot select a delivered preset worse than an earlier selected preset under Pareto/Reference Selector semantics.

- [ ] **Step 2: Register only Task 12 survivors**

The registry may include:

```text
resumable-beam-v1
state-bank-v1
matching-pursuit-v1        # only if Task 13A executed
structural-beam-v1         # only if Task 13B executed
```

If two entries are components of one justified hybrid, include the hybrid only with an ablation for each component.

- [ ] **Step 3: Use the exact real adversarial cases**

```text
titan-to-storm
titan-to-u12t
titan-to-trio
```

Use Max10 only for the product-facing tournament. High-cap teachers are not runtime contestants.

- [ ] **Step 4: Emit canonical evidence**

Every checkpoint stores filters, canonical RMSE/maxAbs, delivered filter count, Directed Reference Regret v1, `referenceImproved`, snapshot hash, QTF v1, termination/deadline metadata, and machine/runner metadata. Run candidates in the same Node process/runner configuration where practical.

- [ ] **Step 5: Add script and execute**

Add:

```json
"research:capacity-tournament": "tsx benchmarks/research/capacityTournamentRun.ts"
```

Run:

```bash
pnpm --filter @autoeq-workbench/core research:capacity-tournament -- \
  --snapshot "$AUTOEQ_CAPACITY_OUT_DIR/OracleReferenceSnapshotV1.json" \
  --cases titan-to-storm,titan-to-u12t,titan-to-trio \
  --checkpoints-ms 5000,15000,30000,60000 \
  --out "$AUTOEQ_CAPACITY_OUT_DIR/same-runtime-tournament"
```

- [ ] **Step 6: Write tournament results document**

Report per case/budget raw RMSE/maxAbs, delivered filter count, directed regret, QTF, reference improvements, control deltas, monotonicity, deadline correctness, and which candidate/component is preferred. Do not call a candidate promotable yet.

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

### Task 15: Re-enter the strict Calibration Manifest gate without deadlocking research

**Files:**
- Modify only if required by corrected QTF hash/reference metadata: `research/solver-lab/src/autoeq_solver_lab/calibration.py`
- Modify corresponding tests: `research/solver-lab/tests/test_calibration.py`
- Create: `docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-calibration-decision.md`

- [ ] **Step 1: Write/confirm RED tests for the corrected boundary**

Require calibration to remain `insufficient` when there is no strict aggregate control improvement or thresholds would be vacuous. Require any valid manifest to carry the implemented QTF formula version/hash but not to be a prerequisite for prior Tasks 1-14.

- [ ] **Step 2: Feed same-runtime tournament evidence into calibration**

Use only development/adversarial evidence. Do not inspect/open holdout.

- [ ] **Step 3: Record one of two legitimate outcomes**

```text
A. valid non-vacuous OracleCalibrationManifestV1 frozen for the next promotion gate
B. calibration remains insufficient; no manifest is manufactured
```

The decision document records exact artifact hashes and reasons.

- [ ] **Step 4: Verify and commit**

```bash
python -m pytest -q research/solver-lab/tests/test_calibration.py \
  research/solver-lab/tests/test_reference_regret.py \
  research/solver-lab/tests/test_quality_time.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/calibration.py \
  research/solver-lab/tests/test_calibration.py \
  docs/superpowers/specs/2026-09-07-autoeq-capacity-aware-calibration-decision.md
git commit -m "docs(research): record capacity-aware calibration decision"
```

If `calibration.py` requires no source change, commit only the decision document; do not create an empty source edit.

---

### Task 16: Coherent endpoint verification and stop before holdout/product promotion

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full solver-lab tests**

```bash
python -m pytest -q research/solver-lab/tests
```

Expected: PASS.

- [ ] **Step 2: Run focused core research/v2 tests**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository gates once the diff is coherent**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Inspect production/default equivalence**

Confirm no default filter cap changed, no UI/session/export behavior changed, no Standard v1 source changed, and `runStandardAutoEqV2()` still follows the compatibility path unless a research-only runner explicitly selects a new mechanism.

- [ ] **Step 5: Stop at the promotion boundary**

Do not open holdout, merge, deploy, release, publish, or convert a research winner into default production behavior under this plan. The next step, if evidence warrants it, is a separate product-distillation design/plan based on the actual tournament and calibration decision.

---

## Plan Completion Gate

This plan is complete only when all of the following are true:

1. `OracleReferenceSnapshotV1` is implemented, validated, content-hashed, and frozen from the existing corrected Oracle evidence for the declared real-case cells.
2. Directed Reference Regret v1 is parity-tested in Python/TypeScript and does not penalize reference domination.
3. QTF v1 is parity-tested, references `OracleReferenceSnapshotV1` deliverable fronts, and has no Calibration Manifest prerequisite.
4. Reference Pareto Selector and the common solver trajectory artifact are parity-tested.
5. `jointRefineV2()` behavior remains exactly compatible after continuation extraction.
6. Resumable/state-bank search is implemented research-only with fresh capacity separate from transfer/known-good capacity.
7. Matching pursuit is implemented and canonically evaluated.
8. High-cap teacher-to-<=10 student compression is implemented and scores students against the original target.
9. Structural beam reuses the existing mutation library and preserves Pareto-first retention.
10. Storm, U12t, and Trio have reproducible Fixed-Cap and teacher-compression evidence plus explicit classifications.
11. No more than three evidence-backed mechanisms/components enter the same-runtime tournament.
12. The final tournament reports canonical 5/15/30/60-second monotonic trajectories in the same TypeScript/Node runtime.
13. Calibration either freezes a non-vacuous manifest or explicitly remains insufficient; zero-regret/reference success never forces a fake freeze.
14. Full repository verification is green at the coherent endpoint.
15. Holdout and production promotion remain unopened/unmodified.

## OpenCode Execution Handoff

Execute this plan directly and sequentially. Do not spawn subagents. Maintain the checkbox state in this file or an equivalent local execution log. At every task boundary:

```bash
git status --short
git diff --check
```

Preserve exact artifact hashes and commit SHAs in the screening/tournament/calibration result documents. When a task contains an evidence-dependent conditional port (Task 13A/13B), follow the Task 12 shortlist rather than implementing eliminated mechanisms “just in case”.
