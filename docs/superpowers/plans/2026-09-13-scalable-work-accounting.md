# Scalable Work Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose behavior-neutral, deterministic per-stage work and incumbent-gain telemetry for the existing scalable structural-search controller, and stream it through a generic research harness.

**Architecture:** Keep the controller's current ordering, effort progression, capacity progression, and comparator intact. `runStructuralSearch` will emit existing cheap structural trace events; a small adapter accumulates raw counters into a `SearchWorkDelta` and the scalable controller snapshots before/candidate/after quality around each existing stage. The benchmark harness will write one JSONL record per stage plus a final record, without mapping capacities to named modes.

**Tech Stack:** TypeScript, Vitest, pnpm, existing core research fixtures and JSONL reporting.

**Spec:** User-approved AutoEQ V2 generic scheduler work-accounting direction, 2026-09-13; `docs/research/AUTOEQ_V2_GENERIC_RESOURCE_ENVELOPE_20260913.md`.

## Global Constraints

- Do not alter scheduler actions, stage ordering, comparator semantics, quality weights, quantization, or Standard-v1.
- `maxFilters` remains a numeric ceiling; no capacity-specific branches, modes, matrices, or frontend changes.
- Record raw deterministic counters and elapsed wall-clock independently; do not create a weighted compute score.
- Use only actual current actions: capacity expansion, current-capacity search, and removal reseed where the controller performs them.
- Preserve JSONL streaming and do not commit transient benchmark artifacts.

---

### Task 1: Define and accumulate structural work

**Files:**
- Modify: `packages/core/src/autoeq/v2/structuralSearch.ts:712-750,906-1400`
- Modify: `packages/core/src/autoeq/v2/scalableStructuralSearch.ts:18-45,144-245`
- Modify: `packages/core/src/index.ts:169-184`
- Test: `packages/core/test/autoeq/v2/scalableStructuralSearch.test.ts`

**Interfaces:**
- Produces `SearchWorkDelta` raw counters: structural invocations, beam generations, proposals generated/admitted/polished, duplicate states, rescue/pair-add/cap-swap attempts, and reseed attempts.
- Produces `ScalableSearchStage.workDelta`, `cumulativeWork`, quality snapshots, and actual action label.

- [ ] **Step 1: Write failing controller telemetry tests** asserting deltas sum to cumulative counters, non-improving stages have zero gain, improving injected results have positive gain, capacity expansion is an action event, and repeated injected runs yield identical telemetry.
- [ ] **Step 2: Run** `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/scalableStructuralSearch.test.ts` **and verify failure because the new fields/types do not exist.**
- [ ] **Step 3: Implement the smallest trace-to-counter adapter.** Pass an `onTrace` callback only through the scalable controller; count proposal and phase work from actual trace events, keeping values zero when the lower-level mock emits no trace. Snapshot the incumbent before calling search, candidate result, and incumbent after existing replacement logic. Classify actions from actual branches only.
- [ ] **Step 4: Re-run the focused test and commit** `feat(core): add scalable work accounting telemetry`.

### Task 2: Add generic JSONL scalable-run reporting

**Files:**
- Create: `packages/core/benchmarks/research/scalableWorkAccounting.ts`
- Create: `packages/core/benchmarks/research/runScalableWorkAccounting.ts`
- Create: `packages/core/test/autoeq/v2/research/scalableWorkAccounting.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Consumes a case id, time budget, capacity ceiling, and optional output stream.
- Produces newline-delimited envelope, stage, and final records containing raw work, marginal gain, action, seed strategy, final filters/metrics/current quality key, elapsed time, and stage count.

- [ ] **Step 1: Write failing tests** for a controlled injected run verifying stream order, required stage/final fields, arbitrary capacity preservation, and no mutation of the controller decision trace when telemetry is enabled.
- [ ] **Step 2: Run** `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/research/scalableWorkAccounting.test.ts` **and verify the missing module failure.**
- [ ] **Step 3: Implement a narrow standalone CLI/harness.** Reuse approved research corpus preparation and controller configuration; accept explicit single-envelope options rather than expanding a matrix. Write JSONL incrementally to stdout or an explicitly selected file.
- [ ] **Step 4: Re-run focused tests and commit** `feat(research): stream scalable work and gain telemetry`.

### Task 3: Audit, sparse probes, and scheduler recommendation

**Files:**
- Create: `docs/research/AUTOEQ_V2_SCALABLE_WORK_ACCOUNTING_20260913.md`

**Interfaces:**
- Consumes committed telemetry schema and sparse real-FR JSONL results (not committed unless repository convention requires it).
- Produces a measurable-counter audit, action/work/gain tables, sparse RSV/Mystic/S12 Ultra observations, minimal future scheduler state, and one falsifiable generic next experiment.

- [ ] **Step 1: Run short focused RSV, Mystic, and S12 Ultra envelopes**, using a small deliberate sample including one irregular ceiling; store outputs outside tracked source and summarize only observed records.
- [ ] **Step 2: Write the audit and analysis.** Distinguish currently exposed, easy, invasive, and unavailable counters; do not infer a policy from one run or collapse counter types into a score.
- [ ] **Step 3: Commit** `docs(research): analyze scalable work and marginal gain`.

### Task 4: Validate scope and repository health

**Files:**
- Modify only files listed above.

- [ ] **Step 1: Run affected tests, core typecheck, relevant benchmark test, and `git diff --check`.**
- [ ] **Step 2: Run root test/typecheck/build/lint and core benchmark when practical; record the pre-existing Standard-v1 failure separately if it remains.**
- [ ] **Step 3: Inspect `git diff --name-only` and `git status --short`; verify no frontend/site or policy/comparator changes.**
