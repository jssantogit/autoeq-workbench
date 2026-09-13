# Capacity-Pressure Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure raw, capacity-caused suppression of existing additive structural paths without changing search behavior, then expose it in scalable-stage and paired-oracle research evidence.

**Architecture:** Keep suppression accounting beside the existing structural gates. Candidate generation will return existing proposals plus a typed, raw pressure delta derived only from gates already reached; phase-level rescue and pair-add gates will emit their own blocked counters without evaluating blocked candidates. The scalable controller and decision oracle only copy/sum that telemetry; no scheduler or comparator reads it.

**Tech Stack:** TypeScript, Vitest, pnpm workspace scripts, existing AutoEQ V2 research benchmark runner.

**Spec:** `docs/research/AUTOEQ_V2_GENERIC_RESOURCE_ENVELOPE_20260913.md`

## Global Constraints

- Work only in `research/resource-envelope-generic-20260913` at the dedicated worktree.
- Do not change scheduler decisions, adaptive parameters, comparator, stage budgets, proposal ordering, candidate admission, RNG, or beam behavior.
- Count only capacity-gate suppression; duplicate, invalid, quality, pruning, proposal-limit, and beam rejection remain outside the signal.
- Do not create candidate state or evaluate blocked candidates solely for telemetry.
- Preserve numerator and denominator/raw component counts; do not add a score or threshold.
- Use RSV, Mystic 8, and S12 Ultra only for sparse paired empirical evidence; report negative/inconclusive findings.

---

### Task 1: Structural capacity-suppression accounting

**Files:**
- Modify: `packages/core/src/autoeq/v2/structuralSearch.ts`
- Test: `packages/core/test/autoeq/v2/structuralSearch.test.ts` or the nearest V2 structural-search test file

**Interfaces:**
- Produces `CapacityPressureDelta`, `createCapacityPressureDelta`, `addCapacityPressureDelta`, and trace fields carrying per-search raw counts.
- Consumes existing `generateStructuralMutations*`, rescue, and pair-add capacity conditions.

- [ ] **Step 1: Write failing accounting tests** for an irregular ceiling: below capacity has zero blocked counters; full-capacity beam add/split gates increment only blocked counters; full-capacity rescue/pair gates increment only their own counters; non-capacity duplicate and invalid/proposal-limit paths do not increment them.
- [ ] **Step 2: Run the focused Vitest file** with the corrected invocation `pnpm --filter @autoeq-workbench/core exec vitest run <test-file>` and confirm failures identify absent accounting.
- [ ] **Step 3: Add a zero-valued typed delta** with named fields for actual beam additive proposals, beam add gates blocked by capacity, split gates blocked by capacity, rescue add attempts blocked by capacity, and pair-add phase gates blocked by capacity. Define the denominator semantics in comments.
- [ ] **Step 4: Refactor mutation generation minimally** so it returns its unchanged proposal array plus accounting from currently reached branch conditions. Reuse already-computed feature data; do not calculate shelves/shortlists in a branch which previously skipped them.
- [ ] **Step 5: Emit the delta through existing trace events** and count rescue/pair-add only when their pre-existing non-capacity conditions are true but the capacity predicate prevents entering their loop.
- [ ] **Step 6: Run focused accounting tests** and `git diff --check`.
- [ ] **Step 7: Commit** only the source accounting change with `git commit -m "feat(research): account capacity-suppressed structure"`.

### Task 2: Deterministic accounting and behavior-neutrality tests

**Files:**
- Modify: `packages/core/test/autoeq/v2/structuralSearch.test.ts` or nearest V2 structural-search test file

**Interfaces:**
- Consumes trace capacity-pressure fields and `runStructuralSearch`.
- Proves result equality with and without an observer.

- [ ] **Step 1: Add a failing behavior-neutrality test** that invokes identical deterministic search inputs with no trace and with trace collection, comparing filters and quality exactly.
- [ ] **Step 2: Add a failing delta-aggregation test** that sums trace deltas and verifies independently expected component totals.
- [ ] **Step 3: Run the focused test file** and confirm the new expectations are meaningful.
- [ ] **Step 4: Make only test corrections required by actual counter semantics**; do not alter production decision logic.
- [ ] **Step 5: Run the focused test file and `git diff --check`.**
- [ ] **Step 6: Commit** only deterministic test changes with `git commit -m "test(research): verify capacity pressure accounting"`.

### Task 3: Scalable and oracle telemetry propagation

**Files:**
- Modify: `packages/core/src/autoeq/v2/scalableStructuralSearch.ts`
- Modify: `packages/core/src/autoeq/v2/decisionOracle.ts`
- Modify: `packages/core/benchmarks/research/decisionOracle.ts`
- Test: `packages/core/test/autoeq/v2/scalableStructuralSearch.test.ts`
- Test: `packages/core/test/autoeq/v2/decisionOracle.test.ts`
- Test: `packages/core/test/autoeq/v2/research/decisionOracle.test.ts`

**Interfaces:**
- `ScalableSearchStage.capacityPressure` is the stage delta and `cumulativeCapacityPressure` is the summed raw state.
- `SchedulerDecisionSnapshot.capacityPressure` is a cloned analysis-only state field.

- [ ] **Step 1: Add failing stage/oracle tests** that verify capacity, filter count, headroom, recent gain, residual opportunity, raw pressure delta, and cumulative pressure are present and summed without action changes.
- [ ] **Step 2: Thread trace deltas into a stage-local accumulator** alongside existing `SearchWorkDelta`; sum it after each stage and add no scheduler reads.
- [ ] **Step 3: Clone/recompute only existing-snapshot capacity-pressure telemetry** for paired oracle arms and include it in compact JSONL/Markdown output with the raw fields preserved.
- [ ] **Step 4: Run the three focused test files** using corrected Vitest invocation.
- [ ] **Step 5: Commit** only propagation and its direct tests with `git commit -m "feat(research): expose capacity pressure telemetry"`.

### Task 4: Sparse evidence and documentation

**Files:**
- Modify: `docs/research/AUTOEQ_V2_GENERIC_RESOURCE_ENVELOPE_20260913.md`
- Create: tracked research artifact/report only if the existing runner convention requires it

**Interfaces:**
- Consumes JSONL from `packages/core/benchmarks/research/decisionOracle.ts` for RSV, Mystic 8, and S12 Ultra with irregular ceiling 17.

- [ ] **Step 1: Run the predeclared sparse paired probe once per selected state/repeat configuration only** using the existing runner and record its exact command/output artifact.
- [ ] **Step 2: Classify each outcome empirically** as deepen, expand, tie, or inconclusive; compare raw blocked counters and their denominators without a derived scheduler score.
- [ ] **Step 3: Extend the resource-envelope note** with exact suppression paths, counter semantics, behavior-neutrality evidence, compact paired table, residual-vs-pressure conclusion, limitations of unscored blocked actions, and one evidence-backed next experiment.
- [ ] **Step 4: Run focused accounting/scalable/oracle tests, core typecheck, `git diff --check`, and required project checks appropriate to the changed core research behavior. Record every exit code.**
- [ ] **Step 5: Commit** documentation/evidence with `git commit -m "docs(research): report capacity pressure evidence"`.
