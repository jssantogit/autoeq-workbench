# AutoEQ Oracle Diagnosis v2 Implementation Plan

> **For agentic workers:** Execute inline in this session; subagent-driven-development is explicitly prohibited by the task.

**Goal:** Produce a deterministic, canonical-evidence Oracle Diagnosis v2 campaign that separates local-search, discovery/seeding, scalarization, and filter-capacity gaps without changing production AutoEQ behavior.

**Architecture:** Keep the existing weighted-sum Continuous Oracle path unchanged by adding an optional objective callable to the DE, CMA-ES, and Powell optimizer boundary. Extend the existing Python diagnostics module with strict reference provenance, canonical frontier movement, convergence, capacity, and causal-classification primitives. Add a case-scoped Python diagnosis runner that consumes the frozen SCREEN/CONFIRM/DEEP artifacts, historical result artifacts, exact Standard-v2 controls, and canonical TypeScript evaluation, then emits a machine-readable `OracleDiagnosisReportV1`. The workflow will verify on normal branch pushes and run the selective campaign only for an explicit `[oracle-diagnosis]` push marker, with case-matrix fan-out and deterministic aggregation.

**Tech Stack:** Python 3.12, NumPy/SciPy/CMA-ES, pytest, TypeScript/tsx, Vitest, GitHub Actions, canonical `@autoeq-workbench/core` lab evaluator.

**Spec:** The Oracle Diagnosis v2 requirements in the task request plus the existing reviewed branch contracts and approved repository guidance.

## Global Constraints

- Use only `research/solver-lab` and research benchmark/workflow files; do not modify production/default AutoEQ behavior.
- Keep canonical TypeScript evaluation authoritative for every official point.
- Keep `calibrationFrozen = false` unless the existing strict calibration rule is genuinely satisfied; do not open holdout.
- Reuse SCREEN run `34110098435` artifact `10014165079`, CONFIRM run `34110901484` artifact `10014731506`, and DEEP run `34112286380` artifact `10016580986`.
- Reuse historical coherent run `33987922969`/artifact `9975764396`, general run `33987602951`, and v1 run `33960904540`/artifact `9967947984` with exact-filter provenance checks.
- Use seeds `11,29,47,83` for control-seeded refinement, `11,29` for alternative-objective screening, and `11,29,47,83` only for targeted confirmation.
- Use alternative-objective N=10 topologies only; do not rerun the broad N=1..10 campaign.
- Run focused RED→GREEN tests before broader verification and review the final diff for scope, secrets, and generated user data.

---

### Task 1: Complete diagnostic domain contracts

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/diagnostics.py`
- Test: `research/solver-lab/tests/test_diagnostics.py`

**Interfaces:**
- Produce `diagnostic_objective_callable(problem, layout, spec)`, strict `reference_candidates_from_artifact`, `compare_frontier_snapshots`, `classify_practical_convergence`, `classify_causal_mechanisms`, and deterministic report helpers.
- Preserve `DiagnosticObjective`, `objective_value`, `build_reference_candidate`, and `summarize_capacity_gap` behavior already covered by existing tests.

- [x] Write failing tests for objective adapter metric evaluation, malformed reference rejection, source SHA/artifact mismatch, frontier movement counts, practical-convergence labels, and multi-label classification.
- [x] Run the focused diagnostics tests and confirm failures are caused by missing contracts.
- [x] Implement the smallest pure helpers with explicit versioned thresholds and raw values.
- [x] Run the focused diagnostics tests to green and refactor only after green.

### Task 2: Integrate diagnostic objectives without changing normal optimization

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/optimizers/base.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/optimizers/differential_evolution.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/optimizers/cma_es.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/optimizers/powell.py`
- Test: `research/solver-lab/tests/test_optimizers.py`

**Interfaces:**
- Add an optional `objective: Callable[[np.ndarray], float] | None` keyword after `initial_candidate` on the optimizer protocol and implementations.
- When `objective` is `None`, retain the existing `scalarized_objective` weighted-sum path byte-for-byte in semantics; when provided, track that callable instead.

- [x] Add RED tests proving DE and CMA use a diagnostic callable and that exact initial candidates remain the start point for Powell/CMA.
- [x] Run those tests and observe the expected signature/behavior failures.
- [x] Add the optional callable and route it through `ObjectiveTracker` with no production-path default change.
- [x] Run optimizer and existing continuous-oracle focused tests to green.

### Task 3: Build the selective diagnosis runner

**Files:**
- Create: `research/solver-lab/src/autoeq_solver_lab/oracle_diagnosis.py`
- Modify: `research/solver-lab/pyproject.toml`
- Test: `research/solver-lab/tests/test_oracle_diagnosis.py`

**Interfaces:**
- Define `OracleDiagnosisConfig`, `run_oracle_diagnosis_case`, `aggregate_oracle_diagnosis_reports`, and `main` with explicit paths, run IDs, artifact IDs, SHA, seeds, budgets, and canonical command.
- Consume problem JSONL, frozen control aggregate, previous canonical aggregates, historical raw result artifacts, and optional cap control artifacts.
- Emit one deterministic per-case report and one deterministic aggregate `OracleDiagnosisReportV1`.

- [x] Add RED tests for exact control topology/start records, canonical reference re-evaluation, alternative-objective extension detection, CAP10/20/40 frontier gains, deterministic aggregation, and SHA/source artifact mismatch rejection.
- [x] Run the new focused tests and verify missing-runner failures.
- [x] Implement case phases: SCREEN→CONFIRM→DEEP reuse; control-seeded Powell/CMA; historical extraction/rebinding; alternative N=10 search with selective confirmation; and capacity probe with exact product controls plus fixed-topology local polish.
- [x] Canonically evaluate every admitted candidate, preserve candidate/provenance metadata, union new points with the DEEP best-known frontier, and carry calibration status without weakening the existing gate.
- [x] Run the new focused tests, then a local synthetic end-to-end smoke using small budgets.

### Task 4: Extend deterministic campaign workflow

**Files:**
- Modify: `.github/workflows/autoeq-oracle-diagnosis.yml`
- Test: `research/solver-lab/tests/test_oracle_diagnosis.py` and workflow-driven local CLI smoke checks

**Interfaces:**
- Keep `verify-diagnosis` on normal pushes.
- Add explicit marker-gated `prepare-inputs`, a four-case matrix with bounded parallelism, and deterministic `aggregate-diagnosis` jobs.
- Download the three existing aggregate artifacts and three historical artifacts with `actions: read`; record the exact `github.sha` in every generated artifact.

- [x] Add RED tests for campaign selection, missing input rejection, and deterministic case aggregation.
- [x] Implement marker-gated preparation, case fan-out, artifact upload/download, and final aggregate upload without modifying `main`.
- [x] Run YAML-independent local preparation/aggregation checks and the focused Python/TypeScript tests.

### Task 5: Verify, push, and execute the diagnosis campaign

**Files:**
- Modify: only files from Tasks 1–4
- Generated outside git: runner temporary directories and downloaded GitHub artifacts

- [x] Run `python -m pytest -q research/solver-lab/tests`, core research tests, and core typecheck.
- [x] Run one endpoint verification: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check`.
- [x] Review the actual diff, confirm no holdout/production/default changes, commit the implementation with the explicit campaign marker, and push only `research/solver-oracles-2026-09-06`.
- [ ] Wait for exact-SHA verification and diagnosis workflow runs, download the final diagnosis artifact, and record run/artifact IDs and wall-clock evidence.
- [ ] Report per-case frontier movement, convergence, local refinement, historical recovery, alternative scalarization, capacity, causal labels, calibration state, SHA/state of `main`, and the single research recommendation; do not execute that recommendation.
