# AutoEQ Quality-Time Frontier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and freeze Quality-Time Frontier v1 as a deterministic, cross-language summary of best-so-far delivered quality over log-scaled time, normalized against the Deliverable Oracle, without replacing the raw 5/15/30/60-second evidence.

**Architecture:** Quality-Time Frontier is a research-only metric shared by the Python solver lab and TypeScript Research Bench. Both implementations consume the same normalized oracle-regret timeline, use one committed parity fixture, and must produce numerically equivalent scores. The metric is frozen during Oracle Calibration by version plus a canonical formula SHA-256 and is used only for screening/ranking; raw canonical RMSE, maxAbs, band metrics, Pareto fronts, and fixed-budget checkpoints remain authoritative evidence.

**Tech Stack:** Python 3.12, pytest 8, TypeScript 6, Vitest 4, Node 22, pnpm, SHA-256.

**Spec:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`

## Global Constraints

- Prerequisites: `docs/superpowers/plans/2026-09-06-autoeq-solver-research-foundation.md` and `docs/superpowers/plans/2026-09-06-autoeq-solver-oracles.md` are complete and green.
- QTF is a summary/ranking metric only; it never replaces raw RMSE, maxAbs, band metrics, Pareto fronts, or 5/15/30/60-second tables.
- QTF uses best-so-far **delivered canonical** quality, never a continuous-only working solution.
- QTF normalization uses the frozen Deliverable Oracle frontier for the exact case/filter-cap contract being scored.
- Standard v1 and production Standard v2 remain frozen.
- No production solver, UI, session, export, merge, deploy, release, or publication behavior changes are authorized by this plan.
- A runtime candidate that canonically dominates the frozen Deliverable Oracle indicates a stale oracle; refresh/recalibrate the oracle before using QTF for promotion claims.

---

## QTF v1 Mathematical Contract

For a best-so-far delivered trajectory, let `r(t)` be normalized regret to the frozen Deliverable Oracle frontier at time `t`. Regret is the exact `normalized_regret`/oracle-regret definition frozen by the Solver Oracles plan.

Convert regret to bounded quality:

```text
q(t) = exp(-max(0, r(t)))
```

Thus `q(t) ∈ (0, 1]`, and an oracle-equivalent point has `q = 1`.

The scoring interval is fixed:

```text
t_min = 0.5 s
t_max = 60 s
```

QTF v1 is the normalized area under the left-continuous best-so-far quality curve in log time:

```text
QTF_v1 = 1 / ln(t_max / t_min)
         × ∫[t_min,t_max] q(t) d(ln t)
```

Implementation is exact piecewise-constant integration. For a segment `[a,b)` whose active best-so-far quality is `q`:

```text
contribution = q × ln(b / a)
```

Contract details:

- the trajectory includes an initial product-safe empty deliverable at `elapsedSeconds = 0`;
- updates at the same timestamp are collapsed by keeping the last supplied best-so-far point;
- updates before `0.5 s` determine the quality active at `t_min`;
- updates after `60 s` are ignored;
- if search ends before `60 s`, its final best-so-far quality is held through `t_max`;
- missing/NaN/negative regret or non-finite timestamps are invalid input, not silently repaired;
- score output is clamped only for floating-point epsilon to `[0,1]`, never rescaled per corpus.

Canonical formula descriptor, serialized with lexicographically sorted object keys, is exactly:

```json
{
  "integration":"left-continuous-piecewise-constant-log-time",
  "qualityTransform":"exp(-max(0,regret))",
  "regret":"deliverable-oracle-normalized-regret",
  "tMaxSeconds":60,
  "tMinSeconds":0.5,
  "version":1
}
```

`qualityTimeFormulaSha256` is the lowercase SHA-256 hex digest of that canonical one-line JSON UTF-8 byte sequence.

---

### Task 1: Implement and test Python QTF v1

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/quality_time.py`
- Create: `research/solver-lab/tests/fixtures/quality-time-frontier-v1.json`
- Create: `research/solver-lab/tests/test_quality_time.py`

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

def compute_quality_time_frontier(
    points: Sequence[RegretTimelinePoint],
) -> float: ...
```

- [ ] **Step 1: Write the RED fixture and tests**

Commit fixture cases with explicit input and expected score formulas rather than hand-wavy tolerances. Include:

```json
{
  "version":1,
  "cases":[
    {
      "id":"oracle-from-start",
      "points":[{"elapsedSeconds":0,"regret":0}],
      "expected":1
    },
    {
      "id":"constant-regret-one",
      "points":[{"elapsedSeconds":0,"regret":1}],
      "expected":0.36787944117144233
    },
    {
      "id":"improves-at-five-seconds",
      "points":[
        {"elapsedSeconds":0,"regret":1},
        {"elapsedSeconds":5,"regret":0}
      ]
    }
  ]
}
```

For `improves-at-five-seconds`, calculate the expected value inside the test from the contract:

```python
expected = (
    math.exp(-1.0) * math.log(5.0 / 0.5)
    + 1.0 * math.log(60.0 / 5.0)
) / math.log(60.0 / 0.5)
```

Also test duplicate timestamps keep the last point, a point at exactly 60 s does not change prior area, convergence before 60 s holds the final value, and invalid finite/range inputs raise `ValueError`.

- [ ] **Step 2: Run RED**

```bash
pytest -q research/solver-lab/tests/test_quality_time.py
```

Expected: FAIL because `quality_time.py` does not exist.

- [ ] **Step 3: Implement canonical formula descriptor and SHA-256**

Use `json.dumps(descriptor, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` and SHA-256 of UTF-8 bytes. Assert the generated one-line descriptor exactly matches the Mathematical Contract above.

- [ ] **Step 4: Implement exact piecewise log-time integration**

Sort points by `(elapsed_seconds, original_index)`, collapse equal timestamps keeping the later original item, require at least one point with `elapsed_seconds <= 0.5`, determine the active point at `t_min`, and integrate only change points strictly inside `(0.5, 60)`.

Pseudocode must be implemented directly:

```python
active_q = quality_from_regret(last_point_at_or_before_t_min.regret)
left = 0.5
area = 0.0
for point in points_inside_window:
    area += active_q * math.log(point.elapsed_seconds / left)
    left = point.elapsed_seconds
    active_q = quality_from_regret(point.regret)
area += active_q * math.log(60.0 / left)
score = area / math.log(60.0 / 0.5)
```

Clamp only values within `1e-12` of 0 or 1; otherwise reject an out-of-range result as an implementation error.

- [ ] **Step 5: Run GREEN and commit**

```bash
pytest -q research/solver-lab/tests/test_quality_time.py
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/quality_time.py \
  research/solver-lab/tests/fixtures/quality-time-frontier-v1.json \
  research/solver-lab/tests/test_quality_time.py
git commit -m "feat(research): define Quality-Time Frontier v1"
```

---

### Task 2: Implement TypeScript QTF v1 and prove cross-language parity

**Files:**
- Create: `packages/core/benchmarks/research/qualityTime.ts`
- Create: `packages/core/test/autoeq/v2/research/qualityTime.test.ts`
- Read fixture: `research/solver-lab/tests/fixtures/quality-time-frontier-v1.json`

**Interfaces:**

```ts
export const QUALITY_TIME_FORMULA_VERSION = 1 as const
export const QUALITY_TIME_T_MIN_SECONDS = 0.5 as const
export const QUALITY_TIME_T_MAX_SECONDS = 60 as const

export interface RegretTimelinePoint {
  elapsedSeconds: number
  regret: number
}

export function qualityFromRegret(regret: number): number
export function qualityTimeFormulaSha256(): string
export function computeQualityTimeFrontier(
  points: readonly RegretTimelinePoint[],
): number
```

- [ ] **Step 1: Write RED TypeScript tests against the shared fixture**

Read the committed JSON fixture and test the same cases as Python. Add exact descriptor serialization test and require SHA-256 parity with a fixture field generated in Task 1.

For floating values:

```ts
expect(actual).toBeCloseTo(expected, 14)
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/qualityTime.test.ts
```

Expected: FAIL because `qualityTime.ts` does not exist.

- [ ] **Step 3: Implement canonical descriptor hashing**

Do not rely on JavaScript insertion order. Build the exact canonical one-line JSON string with keys in lexicographic order:

```ts
const canonical = '{"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","regret":"deliverable-oracle-normalized-regret","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}'
```

Hash with Node `createHash('sha256').update(canonical, 'utf8').digest('hex')` in research-only code.

- [ ] **Step 4: Implement the same piecewise integration semantics as Python**

Preserve original order for duplicate timestamp resolution by sorting indexed points. Validate finite nonnegative timestamps/regrets and require an initial point active by `t_min`.

- [ ] **Step 5: Run parity verification and commit**

```bash
pytest -q research/solver-lab/tests/test_quality_time.py
pnpm --filter @autoeq-workbench/core test -- test/autoeq/v2/research/qualityTime.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add packages/core/benchmarks/research/qualityTime.ts \
  packages/core/test/autoeq/v2/research/qualityTime.test.ts
git commit -m "feat(research): add TypeScript Quality-Time Frontier"
```

---

### Task 3: Integrate QTF v1 into oracle reports and freeze it in Oracle Calibration

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/calibration.py`
- Modify: `research/solver-lab/tests/test_calibration.py`
- Modify: `packages/core/benchmarks/research/oracleReport.ts`
- Modify: `packages/core/test/autoeq/v2/research/oracleReport.test.ts`

**Interfaces:**

Extend the calibration manifest defined by the Solver Oracles plan:

```ts
export interface OracleCalibrationManifestV1 {
  version: 1
  createdFromRepositorySha: string
  corpusVersion: string
  continuousOracleVersion: string
  deliverableOracleVersion: string
  qualityTimeFormulaVersion: 1
  qualityTimeFormulaSha256: string
  materialImprovementThresholds: {
    minimumAggregateFrontierGainFraction: number
    maximumPerCaseQualityRegressionFraction: number
    maximumCatastrophicCaseRate: number
  }
}
```

Add per run/case report field:

```ts
qualityTimeFrontierV1: number
```

- [ ] **Step 1: Write RED calibration/report tests**

Require the manifest hash equals `qualityTimeFormulaSha256()`. Reject a manifest whose formula version is not `1`, whose hash is not 64 lowercase hex chars, or whose hash differs from the local implementation.

Construct a synthetic best-so-far trajectory plus frozen Deliverable Oracle frontier and assert the report QTF equals direct `computeQualityTimeFrontier()` output.

- [ ] **Step 2: Build regret timelines from canonical delivered checkpoints**

For each report trajectory point, compute oracle regret using the exact Deliverable Oracle regret helper. Prepend the canonical empty-deliverable point at `elapsedSeconds=0` if the run artifact does not already contain it. Never use continuous-only candidate metrics.

- [ ] **Step 3: Add QTF to calibration summaries without changing primary evidence**

Reports continue to emit raw fixed-budget and Pareto data. Add median/per-case QTF only as an additional screening summary field. Do not add a QTF-only promotion gate.

- [ ] **Step 4: Run GREEN and commit**

```bash
pytest -q research/solver-lab/tests/test_quality_time.py research/solver-lab/tests/test_calibration.py
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/qualityTime.test.ts \
  test/autoeq/v2/research/oracleReport.test.ts
pnpm --filter @autoeq-workbench/core typecheck
git diff --check
git add research/solver-lab/src/autoeq_solver_lab/calibration.py \
  research/solver-lab/tests/test_calibration.py \
  packages/core/benchmarks/research/oracleReport.ts \
  packages/core/test/autoeq/v2/research/oracleReport.test.ts
git commit -m "feat(research): integrate QTF into oracle calibration"
```

---

### Task 4: Endpoint verification and screening handoff

**Files:**
- No source changes expected.
- Modify only if a verified documentation mismatch exists: `docs/superpowers/plans/2026-09-06-autoeq-solver-family-screening.md`

**Interfaces:**
- Produces one frozen QTF v1 formula version/hash that the Family Screening plan must consume unchanged.

- [ ] **Step 1: Run all QTF/oracle focused tests**

```bash
pytest -q research/solver-lab/tests/test_quality_time.py research/solver-lab/tests/test_calibration.py
pnpm --filter @autoeq-workbench/core test -- \
  test/autoeq/v2/research/qualityTime.test.ts \
  test/autoeq/v2/research/oracleReport.test.ts
pnpm --filter @autoeq-workbench/core typecheck
```

Expected: PASS.

- [ ] **Step 2: Run one deterministic QTF smoke from stored development artifacts**

Use a previously generated development control trajectory and its exact frozen Deliverable Oracle frontier. Compute QTF independently through Python and TypeScript and require absolute difference `<= 1e-12`.

- [ ] **Step 3: Verify manifest freeze semantics**

Re-running calibration with identical oracle/corpus inputs must reproduce the same `qualityTimeFormulaVersion` and `qualityTimeFormulaSha256`. Changing the formula descriptor in a temporary test must produce a different hash and fail manifest validation.

- [ ] **Step 4: Run coherent repository gates**

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

Expected: PASS.

- [ ] **Step 5: Stop at the screening prerequisite gate**

Record the exact formula version/hash in the Oracle Calibration artifact. Do not modify the formula during Family Screening. If a future formula change is scientifically justified, introduce `QUALITY_TIME_FORMULA_VERSION = 2`; never silently reinterpret v1 artifacts.

No empty commit is required when verification produces no source diff.

---

## Plan Completion Gate

This plan is complete only when:

1. Python and TypeScript implement the exact same QTF v1 mathematical contract;
2. the shared fixture passes in both languages and QTF scores agree within `1e-12` on a real stored development trajectory;
3. QTF uses canonical delivered best-so-far checkpoints and the exact frozen Deliverable Oracle frontier;
4. formula version and canonical SHA-256 are embedded in Oracle Calibration artifacts;
5. raw RMSE/maxAbs/Pareto/fixed-budget evidence remains unchanged and primary;
6. Family Screening consumes QTF v1 unchanged;
7. no production behavior has changed.

After this gate, execute `docs/superpowers/plans/2026-09-06-autoeq-solver-family-screening.md`.