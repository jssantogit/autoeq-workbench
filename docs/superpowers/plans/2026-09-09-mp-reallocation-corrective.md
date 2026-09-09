# MP Reallocation Corrective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce valid Storm evidence for incremental width-two traversal and equal-work scheduler feedback.

**Architecture:** Keep the research-only MP solver's canonical evaluator and selector unchanged. Replace pass-boundary beam promotion with a deterministic incremental parent queue, and replace aggregate composition accounting with typed component counters and observable handoff outcomes.

**Tech Stack:** TypeScript, Vitest, pnpm research benchmark runner.

**Spec:** `docs/superpowers/specs/2026-09-09-autoeq-mp-reallocation-corrective-amendment.md`

## Global Constraints

- Preserve Max10, canonical delivered evaluation, Directed Reference Regret v1, frozen selector/reference, continuation, cooperative cancellation, and global visited selections.
- Do not modify production, Standard AutoEQ v1, defaults, UI/session/export, frozen fixtures, prior reports, or existing evidence artifacts.
- Create a new evidence root and run Storm only unless its result meets the positive-control criterion.

---

### Task 1: Incremental selection beam

**Files:**
- Modify: `packages/core/benchmarks/research/matchingPursuit.ts`
- Test: `packages/core/test/autoeq/v2/research/matchingPursuit.test.ts`

**Interfaces:**
- Produces: deterministic per-parent/depth telemetry and an incremental width-two parent scheduler.

- [ ] **Step 1: Write failing tests**

Add fixtures where two RMSE/maxAbs tradeoffs are nondominated, a third is
dominated, and an alternate retained parent emits a depth-two descendant before
the original pass could finish.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @autoeq-workbench/core test -- matchingPursuit.test.ts`

- [ ] **Step 3: Implement the minimum queue/promotion change**

Update the Pareto frontier immediately after canonical recording; enqueue each
retained unexpanded parent in frozen-selector order; expand one deterministic
replacement at a time; retain global visited keys.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2 and confirm continuation, late-candidate, deadline,
and visited-selection tests remain green.

### Task 2: Component accounting and useful handoffs

**Files:**
- Modify: `packages/core/benchmarks/research/anytimeComposition.ts`
- Modify: `packages/core/benchmarks/research/capacityTournamentRun.ts`
- Test: `packages/core/test/autoeq/v2/research/anytimeComposition.test.ts`

**Interfaces:**
- Produces: observed MP, MP replacement, structural-beam, state-bank, and
polish accounting plus descendant/seed/global/reference handoff outcomes.

- [ ] **Step 1: Write failing tests**

Assert a structural counter excludes MP replacement work; assert a local best
equal to its seed is not useful; assert configured allowance differs from
observed work.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @autoeq-workbench/core test -- anytimeComposition.test.ts`

- [ ] **Step 3: Implement typed work/outcome records**

Return component-local observed counts from each phase, use the structural beam
candidate list only for the structural metric, and derive usefulness from an
observed seed-improving descendant.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2 and retain deterministic deadline behavior.

### Task 3: Storm campaign and report

**Files:**
- Modify: `packages/core/benchmarks/research/capacityTournamentRun.ts`
- Create: `.research-artifacts/mp-reallocation-corrective-20260909/...`
- Create: `docs/superpowers/specs/2026-09-09-autoeq-mp-reallocation-corrective-results.md`

- [ ] **Step 1: Add failing artifact-schema tests**

Assert per-depth beam fields, separate component counters, and equalization
classification are present.

- [ ] **Step 2: Run red tests**

Run focused tournament tests and verify schema failures identify absent fields.

- [ ] **Step 3: Implement reporting fields and execute Storm**

Use a fresh root, continuous 5/15/30/60-second checkpoints, a corrected beam,
and paired one-shot/feedback structural targets.

- [ ] **Step 4: Interpret only measured conditions**

Mark non-exercised beam `inconclusive-by-scheduling`; mark unequal observed
structural work `not equalized`; do not run controls without a Storm signal.

### Task 4: Verification

- [ ] Run focused research tests, then `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `pnpm --filter @autoeq-workbench/core benchmark`.
- [ ] Record pre-existing frozen Standard-v1 fixture failures separately; do not alter fixtures.
- [ ] Inspect the directed diff and run `git diff --check`.
