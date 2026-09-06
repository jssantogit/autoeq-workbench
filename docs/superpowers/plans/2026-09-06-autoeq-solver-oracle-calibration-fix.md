# AutoEQ Solver Oracle Calibration Fix Implementation Plan

> **For agentic workers:** Execute inline in the current session; subagent-driven development is explicitly prohibited for this task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct solver-oracle frontier semantics, include the frozen Standard-v2 control in every best-known cap frontier, reject vacuous calibration freezes, and rerun MaxFilters=10 calibration with reproducible real compute and exact-SHA remote evidence.

**Architecture:** Keep exact-N Continuous Oracle results as diagnostic frontiers and derive one canonical cap frontier per case/cap from their union plus known control candidates. Pass that cap frontier once into one Deliverable Oracle search per case/cap; preserve actual candidate counts and provenance independently from cap labels. Make calibration consume only cap frontiers, validate all artifact invariants, and emit an explicit insufficient status instead of freezing permissive thresholds.

**Tech Stack:** Python 3.12, NumPy/SciPy/CMA-ES, pytest, TypeScript 6, Node 22, pnpm, Vitest, GitHub Actions.

**Spec:** User-provided Oracle Calibration correction requirements; `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`.

## Global Constraints

- Canonical TypeScript evaluation remains authoritative for every stored official point.
- `packages/core` remains production/default-compatible; no solver implementation is merged into production.
- Exact-N and cap frontiers use distinct artifact fields: `exactFilterCount` versus `maxFilters`.
- Every candidate has `len(filters) <= maxFilters`; every official point records actual delivered filter count separately.
- Frozen Standard-v2 control filters are included in Continuous and Deliverable best-known cap unions with `standard-v2-control` provenance.
- Calibration never converts uninformative recommendations into replacement thresholds.
- Development calibration uses at least eight explicit seeds and real convergence-pilot compute; `60` evaluations is smoke-only.
- No holdout or Quality-Time Frontier work begins.
- Only synthetic or explicitly sanitized fixtures are used; no secrets or private curves are committed.

---

### Task 1: Lock the corrected artifact and control schemas with failing tests

**Files:**
- Modify: `packages/core/benchmarks/research/oracleReport.ts`
- Modify: `packages/core/test/autoeq/v2/research/oracleReport.test.ts`
- Modify: `research/solver-lab/tests/test_io.py`
- Modify: `research/solver-lab/tests/test_continuous_oracle.py`
- Modify: `research/solver-lab/tests/test_deliverable_oracle.py`
- Modify: `research/solver-lab/tests/test_calibration.py`
- Create: `research/solver-lab/tests/test_frontier_invariants.py`

**Interfaces:**
- Control points expose `maxFilters`, `deliveredFilterCount`, and frozen filters; they do not expose a cap as `filterCount`.
- Oracle frontier records use `{ frontierType: "exactFilterCount", exactFilterCount: N }` or `{ frontierType: "maxFilters", maxFilters: cap }`.
- Frontier point records retain candidate/evaluation payloads and explicit `actualFilterCount` / `actualDeliveredFilterCount` metadata.

- [x] **Step 1: Write tests that reject a cap encoded as `filterCount` and require exact/cap discriminators.**
- [x] **Step 2: Write tests proving control filters are represented as a canonical `standard-v2-control` candidate and that empty/mismatched/hash-invalid artifacts fail validation.**
- [x] **Step 3: Run the focused Python and Vitest tests and observe the expected failures.**
- [x] **Step 4: Update the TypeScript control artifact interface/serializer and Python parser-facing fixtures to use the corrected field names.**
- [x] **Step 5: Run the focused tests again and commit the schema/control correction.**

### Task 2: Implement exact-N plus aggregate cap Continuous Oracle frontiers

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/continuous_oracle.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/io.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/types.py`
- Modify: `research/solver-lab/tests/test_continuous_oracle.py`
- Modify: `research/solver-lab/tests/test_io.py`

**Interfaces:**
- `build_continuous_exact_frontier(problem, filter_count, config, evaluator)` returns only candidates with exactly `filter_count` filters.
- `build_continuous_cap_frontier(problem, exact_frontiers, max_filters, evaluator, known_candidates=())` returns the canonically evaluated nondominated union of all valid candidates with `len(filters) <= max_filters`.
- `load_control_candidates(control_artifact, problem, max_filters)` returns a validated `standard-v2-control` candidate for the matching case/cap.

- [x] **Step 1: Add a failing test showing exact-N results remain diagnostic while the cap union contains N=1 and N=2 candidates plus the control.**
- [x] **Step 2: Add a failing test showing candidate hashes/problem IDs and max-filter bounds are checked before cap admission.**
- [x] **Step 3: Implement exact-N runner extraction and cap-union admission with deterministic vector deduplication and canonical re-evaluation.**
- [x] **Step 4: Update the CLI artifact to emit all requested `exactFilterCount` fronts and one `maxFilters` front per requested cap, with optimizer configurations/seeds recorded.**
- [x] **Step 5: Run focused Continuous Oracle tests and verify no exact-N field appears on a cap frontier.**
- [x] **Step 6: Commit the Continuous Oracle semantic fix.**

### Task 3: Run one Deliverable Oracle search per case/cap and union the control

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/deliverable_oracle.py`
- Modify: `research/solver-lab/src/autoeq_solver_lab/structural.py`
- Modify: `research/solver-lab/tests/test_deliverable_oracle.py`
- Modify: `research/solver-lab/tests/test_frontier_invariants.py`

**Interfaces:**
- `build_deliverable_frontier(problem, continuous_cap_candidates, config, evaluator, known_deliverable_candidates=())` performs one search for one cap and returns one nondominated deliverable frontier labelled by `maxFilters` outside the function.
- Initial seeds consist of quantized Continuous cap candidates plus already-delivered known candidates, deduplicated before evaluation.
- Structural mutation and Powell proposals reject or project any candidate that would exceed `problem.bounds["maxFilters"]`; stored points include actual delivered counts.

- [x] **Step 1: Write a failing regression where weak oracle candidates would previously displace the control; assert the resulting best-known frontier keeps the control.**
- [x] **Step 2: Write a failing regression where a discovered candidate strictly dominates the control; assert nondominated selection removes the control and `normalized_regret(control, frontier) > 0`.**
- [x] **Step 3: Write a failing regression proving a single Deliverable call receives the aggregate cap seed set, not one call per exact-N front.**
- [x] **Step 4: Implement control/seed union, provenance-preserving candidate construction, cap validation, and one-search-per-cap CLI orchestration.**
- [x] **Step 5: Run focused Deliverable Oracle and invariant tests.**
- [x] **Step 6: Commit the Deliverable Oracle semantic fix.**

### Task 4: Add complete oracle validity gates and refuse vacuous calibration freezes

**Files:**
- Modify: `research/solver-lab/src/autoeq_solver_lab/calibration.py`
- Modify: `research/solver-lab/tests/test_calibration.py`
- Modify: `research/solver-lab/tests/test_frontier_invariants.py`
- Delete: `research/solver-lab/calibration/OracleCalibrationManifestV1.json`

**Interfaces:**
- `validate_oracle_campaign(control, continuous, deliverable)` returns structured validity errors for missing cells, invalid evaluations, hash mismatches, cap/count confusion, missing control coverage, over-cap candidates, and missing optimizer seed/config provenance.
- `build_calibration_report(...)` reports `status: "valid"` or `status: "insufficient"`, includes reasons, and never writes a manifest when evidence is uninformative.
- Final threshold mode raises a non-zero `oracle calibration insufficient` error when the development/adversarial evidence has no strict control improvement or yields effectively vacuous recommendations.

- [x] **Step 1: Write failing tests for every listed invariant and for the old recommendation triple `(0, 1, 0.8181818181818182)`.**
- [x] **Step 2: Write failing tests proving calibration consumes only `maxFilters` frontiers and stores `maxFilters`, `actualFilterCount`, and `actualDeliveredFilterCount`.**
- [x] **Step 3: Implement strict artifact validation and structured insufficient reports.**
- [x] **Step 4: Implement final-freeze refusal without inventing replacement thresholds.**
- [x] **Step 5: Run focused calibration tests and verify the deleted manifest is not used by the workflow.**
- [x] **Step 6: Commit the invalidation and calibration-gate fix.**

### Task 5: Update the research workflow for real convergence-pilot calibration

**Files:**
- Modify: `.github/workflows/autoeq-oracle-research.yml`
- Modify: `docs/superpowers/plans/2026-09-06-autoeq-solver-oracle-calibration-fix.md`

**Interfaces:**
- Workflow inputs make the exact Continuous evaluation budget explicit and reject `60` as a claimed calibration budget unless an orchestration-smoke mode is selected.
- Development Wave 1 uses MaxFilters 10 and at least eight explicit seeds; convergence pilots record budget/config, seed, optimizer, and artifact IDs.
- Wave 2 runs the adversarial MaxFilters 10 corpus; MaxFilters 20/40 are not launched unless Max10 evidence shows a meaningful capacity gap.

- [x] **Step 1: Add workflow validation/tests or shell checks for seed count, cap, and real budget.**
- [x] **Step 2: Pass the frozen control artifact into both Continuous and Deliverable Oracle commands.**
- [x] **Step 3: Add convergence-pilot metadata and make calibration status visible in the uploaded artifact bundle.**
- [x] **Step 4: Run the workflow-local command sequence with a synthetic smoke budget and verify the machine-readable output shape.**
- [x] **Step 5: Commit the workflow orchestration correction.**

### Task 6: Execute corrected campaign, remote exact-SHA evidence, and final verification

**Files:**
- Create locally ignored: `research/solver-lab/.artifacts/` campaign outputs only
- Create after evidence review: `research/solver-lab/calibration/OracleCalibrationManifestV1.json` only if freeze gates pass
- Modify only temporarily on default branch: research workflow registration/trigger if GitHub requires it; restore/remove afterward

- [ ] **Step 1: Run focused local tests, TypeScript research tests, and a convergence pilot on approved synthetic cases.**
- [ ] **Step 2: Run development MaxFilters=10 with at least eight explicit seeds and increased real budgets until DE/CMA overlap is meaningful or additional compute stops improving the frontier.**
- [ ] **Step 3: Review control position, DE/CMA agreement, convergence, and Continuous→Deliverable gap; do not freeze if status is insufficient.**
- [ ] **Step 4: Run adversarial MaxFilters=10 with the same corrected semantics; investigate Max20/40 only if the Max10 capacity-gap criterion is evidenced.**
- [ ] **Step 5: Temporarily register only the research workflow on the default branch if required, dispatch exact Oracle branch SHA runs, record exact workflow run IDs/SHA/artifact IDs, then restore default contents.**
- [ ] **Step 6: Freeze a new manifest only when the corrected development/adversarial evidence explicitly supports selected thresholds; record manifest SHA-256, repository SHA, budgets, seeds, cases, caps, and all three gap summaries.**
- [ ] **Step 7: Run `pytest -q research/solver-lab/tests`, the requested pnpm test/typecheck/test/typecheck/build/lint sequence, and `git diff --check`.**
- [ ] **Step 8: Review the final diff, commit/push the corrected Oracle branch, and report exact HEAD plus remote evidence without starting Quality-Time Frontier.**
