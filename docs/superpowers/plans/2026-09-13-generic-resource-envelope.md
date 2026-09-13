# Generic Resource Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scalable-search research and its fast controller coverage generic for every positive `maxFilters` ceiling, rather than treating selected capacities as modes.

**Architecture:** Preserve the existing controller policy and comparator.  The controller already accepts a numeric ceiling; strengthen its invariant tests using deterministic generated maxima.  Make the research CLI accept arbitrary valid capacities and make its defaults a small representative sample, while a research note records the resource-envelope model, audit, sampling tiers, and reinterpretation of the existing RSV evidence.

**Tech Stack:** TypeScript, Vitest, pnpm, existing core benchmark harnesses.

**Spec:** User-approved AutoEQ V2 generic-resource-envelope direction, 2026-09-13.

## Global Constraints

- Do not change scheduler heuristics, the quality comparator, frontend/site code, or Standard AutoEQ v1.
- `maxFilters` is a positive integer ceiling; capacities are diagnostic samples only.
- Do not introduce capacity-name branches, presets, or a long benchmark matrix.
- Preserve the immutable `vendor/squiglink/` and all existing historical evidence.

---

### Task 1: Generic controller invariant tests

**Files:**
- Modify: `packages/core/test/autoeq/v2/scalableStructuralSearch.test.ts`

**Interfaces:**
- Consumes: `nextScalableCapacity(current, maximum, growth?)` and `runScalableStructuralSearch(input)`.
- Produces: deterministic regression coverage for arbitrary integer resource ceilings.

- [ ] **Step 1: Write the failing tests**

Add a deterministic loop over representative irregular maxima (including below the base capacity and non-ladder values).  For each maximum, repeatedly call `nextScalableCapacity` from `min(SCALABLE_BASE_CAPACITY, maximum)` and assert every value is positive and at most the maximum, every pre-terminal transition is strictly increasing, and the sequence reaches the exact maximum in fewer than the existing controller stage guard.  Add a mocked-search test demonstrating the same seed incumbent is retained independently of two irregular maxima.

- [ ] **Step 2: Run the focused test to verify the intended failure**

Run: `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/scalableStructuralSearch.test.ts`

Expected: the new generic-capacity assertions fail before their supporting controller test setup exists.

- [ ] **Step 3: Make only test-support changes needed for the existing generic controller**

If tests expose no product gap, do not alter `scalableStructuralSearch.ts`.  If test setup needs an exported existing constant, use the current public export rather than creating a capacity preset or policy branch.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/scalableStructuralSearch.test.ts`

Expected: all focused scalable controller tests pass.

### Task 2: Generic benchmark capacity configuration

**Files:**
- Modify: `packages/core/benchmarks/research/run.ts`
- Modify: `packages/core/test/autoeq/v2/research/runner.test.ts`
- Modify: `packages/core/benchmarks/structuralScalableCapacityLadder.ts`
- Modify: `packages/core/test/autoeq/v2/structuralScalableCapacityLadder.test.ts`
- Modify: `packages/core/benchmarks/structuralScalabilityMatrix.ts`

**Interfaces:**
- Consumes: `parseResearchCliArgs(args)` and `parseScalableCapacityLadderArgs(args)`.
- Produces: arbitrary positive capacity inputs and small representative default sampling; explicit CLI values remain hypothesis-driven.

- [ ] **Step 1: Write failing parser/default tests**

Add tests that `--capacity 17,43,64` is accepted, retains caller order or documented deterministic order, and rejects only invalid/duplicate values.  Add ladder-default assertions that defaults are described as representative final ceilings, not a named matrix.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/research/runner.test.ts test/autoeq/v2/structuralScalableCapacityLadder.test.ts`

Expected: arbitrary capacities are rejected by the former `20`/`40` allowlist or tests expose the old default matrix name.

- [ ] **Step 3: Implement the minimal generic configuration refactor**

Remove the `20`/`40` capacity allowlist from `parseCapacity`.  Rename ladder default terminology from `FINAL_CAPS`/matrix language to representative capacity ceilings where safe for callers, retaining explicit `--capacity` selection.  Replace the standalone scalability-matrix fixed arrays with CLI-selected case/time/capacity inputs or mark it historical-only; do not add an exhaustive default.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pnpm --filter @autoeq-workbench/core test -- --reporter=dot test/autoeq/v2/research/runner.test.ts test/autoeq/v2/structuralScalableCapacityLadder.test.ts`

Expected: all focused benchmark harness tests pass.

### Task 3: Architecture note and audit

**Files:**
- Create: `docs/research/AUTOEQ_V2_GENERIC_RESOURCE_ENVELOPE_20260913.md`

**Interfaces:**
- Consumes: controller signals in `packages/core/src/autoeq/v2/scalableStructuralSearch.ts`, current benchmark harnesses, and historical overnight evidence in `docs/research/AUTOEQ_V2_RESOURCE_MONOTONE_OVERNIGHT_20260913.md`.
- Produces: the capacity audit, generic resource model, tiered validation methodology, scheduler signal inventory, RSV/Mystic/S12 reinterpretation, and one generic next experiment.

- [ ] **Step 1: Write the architecture note**

Document every capacity-specific occurrence as acceptable diagnostic/historical data or suspicious policy/tooling.  State that the resource envelope currently has deadline and `maxFilters`; future work/evaluation, memory, and parallelism budgets are conceptual only.  Describe scheduler state/actions and distinguish current signals from missing signals.  Define tiers 1–4, sparse anchors/irregular probes, and non-Cartesian experiments.  Reinterpret previous named-capacity trajectories as non-nested resource allocations and variance evidence, without declaring any ceiling intrinsically good or bad.

- [ ] **Step 2: Review for scope and factual boundaries**

Check the note makes no empirical claim beyond the cited prior report, labels historical benchmark capacity samples, and names no new scheduler heuristic.

### Task 4: Validation and commits

**Files:**
- Modify only the files from Tasks 1–3.

- [ ] **Step 1: Run focused affected tests**

Run the three focused Vitest files with the dot reporter.

- [ ] **Step 2: Run required core validation**

Run `pnpm --filter @autoeq-workbench/core test -- --reporter=dot`, `pnpm --filter @autoeq-workbench/core typecheck`, and `pnpm --filter @autoeq-workbench/core benchmark`.

- [ ] **Step 3: Inspect the directed diff**

Run `git diff --check`, `git diff --stat`, and `git diff --name-only`; confirm no frontend, comparator, or scheduler-policy changes.

- [ ] **Step 4: Commit independently reviewable changes**

Commit controller tests, benchmark configuration/tests, and architecture documentation as small conceptual commits after their validation evidence is available.
