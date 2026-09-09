# Equalized Seed Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Causally compare one concentrated structural-beam seed with a bounded deterministic distribution over the identical frozen Storm seed pool at exactly equal observed structural candidate work.

**Architecture:** A framework-free research helper freezes, canonicalizes, orders, selects, and allocates an explicit seed pool, then invokes the existing structural beam independently per allocation. A dedicated Storm runner writes a new evidence artifact and report; it never changes MP, structural-beam admission, selector, or production behavior.

**Tech Stack:** TypeScript, Vitest, pnpm, existing research corpus/artifact protocol.

**Spec:** User request dated 2026-09-09, plus `docs/superpowers/specs/2026-09-09-autoeq-mp-reallocation-corrective-results.md`.

## Global Constraints

- Preserve Max10, canonical delivered evaluation, Directed Reference Regret v1, frozen reference/selector, deterministic tie-breaking, cooperative deadline, and provenance.
- Run Storm only; do not run U12t/Trio, holdout, promotion, UI/export, release, deploy, or publish.
- Use observed structural-beam candidate evaluations as the sole equalization unit; mark a run not equalized if either arm misses the target.
- Keep the candidate seed pool, ordering, structural configuration, local polish allowance, quantization, and deadline/admission semantics identical between arms.
- Do not change Standard AutoEQ v1, frozen fixtures, defaults, or solver family.

---

### Task 1: Selection-beam Pareto regression

**Files:**
- Modify: `packages/core/benchmarks/research/matchingPursuit.ts`
- Test: `packages/core/test/autoeq/v2/research/matchingPursuit.test.ts`

**Interfaces:**
- Produce an exported `retainMatchingPursuitSelectionBeam(states, width)` helper using the existing frozen selector only after Pareto filtering.

- [x] Write a failing A/B/C test: two non-dominated metrics remain at width two, the dominated point is excluded, and width one performs deterministic selector trimming.
- [x] Run the focused test and observe the missing/no-trim contract failure.
- [x] Extract the existing selection-beam retention logic without changing traversal behavior.
- [x] Re-run the focused test and preserve the existing traversal/deadline tests.

### Task 2: Frozen seed allocation contract

**Files:**
- Create: `packages/core/benchmarks/research/seedAllocation.ts`
- Test: `packages/core/test/autoeq/v2/research/seedAllocation.test.ts`

**Interfaces:**
- Produce `freezeSeedPool`, `selectConcentratedSeed`, `allocateDistributedSeedWork`, and `runEqualizedSeedAllocation`.
- Input seeds carry immutable provenance, canonical entry metrics, semantic key, and deterministic selection key.
- Output records per-arm observed work, per-seed allocations/outcomes, primary metrics, equalization status, and a no-claim reason when unequal.

- [x] Write failing tests for common frozen pool/order, deterministic concentrated selection, bounded deterministic allocation, exact work equality, per-seed accounting, duplicate rejection, deadline preservation, and no causal claim when a runner under-consumes.
- [x] Run the focused allocation test and observe missing contract failures.
- [x] Implement only the generic framework-free allocation/orchestration contract; require the caller to supply structural execution and canonical outcome values.
- [x] Re-run the focused allocation tests.

### Task 3: Storm fixed-work evidence runner

**Files:**
- Create: `packages/core/benchmarks/research/seedAllocationRun.ts`
- Test: `packages/core/test/autoeq/v2/research/seedAllocationRun.test.ts`
- Create: `packages/core/.research-artifacts/seed-allocation-equalized-20260909/storm-fixed-work/tournament-report.json`

**Interfaces:**
- Produce a CLI that loads the frozen Storm reference and seed provenance before both arms, runs the unchanged structural beam with one shared configuration and fixed target, validates exact observed work, and writes SHA-addressable JSON.

- [x] Write a failing runner-schema test requiring common seed provenance, shared structural config, per-seed work, primary outcomes, and explicit equalization classification.
- [x] Run the runner test and observe the missing runner/path/seed-freezing failures.
- [x] Implement the runner over Task 2 without changing existing tournament variants; select a bounded target and require both arms to consume it.
- [x] Execute the Storm fixed-work control once at target 12; it was retained as not-equalized after the concentrated seed consumed only 5 evaluations.
- [x] Correct the target to 5 and execute the final Storm fixed-work run in a new evidence directory; no anytime checkpoints or controls were run.

### Task 4: Evidence report and gates

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-autoeq-equalized-seed-allocation-results.md`

- [x] Record routing, frozen seed set, configuration, exact target, allocations, artifact hash, metrics, equalization classification, prior `18 vs 120` non-equalization, interpretation, blockers, and next recommendation in the results report.
- [x] Run focused tests, root `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `pnpm --filter @autoeq-workbench/core benchmark`.
- [x] Record known Standard-v1 failures without changing frozen fixtures; inspect directed diff and run `git diff --check`.
