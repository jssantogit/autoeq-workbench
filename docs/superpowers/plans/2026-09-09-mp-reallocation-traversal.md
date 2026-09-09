# MP Reallocation Traversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether bounded MP parent rebasing or a width-two selection beam traverses useful multi-step Max10 reallocations, with Storm as the falsification case.

**Architecture:** Extend the research-only TypeScript MP state machine with explicit selection lineage while retaining its canonical Pareto and frozen-selector selection contract. Add independently selectable traversal policies, then expose them as tournament variants. Equalize composition arms by observed structural candidate evaluations.

**Tech Stack:** TypeScript, Vitest, pnpm, Node research tournament CLI.

**Spec:** `docs/superpowers/specs/2026-09-09-autoeq-capacity-aware-max10-anytime-results.md` plus the approved 2026-09-09 campaign brief.

## Global Constraints

- Max10, canonical delivered metrics, Directed Reference Regret v1, frozen selector/reference snapshot, cooperative deadline, provenance, and production defaults remain unchanged.
- Parent admission uses only the existing canonical selected-best-so-far contract: dominance, then frozen `referenceSelectorKey` for non-dominated tradeoffs.
- The beam is Pareto-first and trimmed deterministically with the frozen selector; initial width is exactly two.
- Scheduler equalization is measured structural candidate evaluations actually executed; nominal budgets are diagnostic only.
- All campaign outputs use a new, explicit `.research-artifacts/mp-reallocation-20260909` root; no holdout, promotion, deploy, merge, or publish.

---

### Task 1: MP traversal state and telemetry contracts

**Files:**
- Modify: `packages/core/benchmarks/research/matchingPursuit.ts`
- Test: `packages/core/test/autoeq/v2/research/matchingPursuit.test.ts`

- [ ] Write failing tests for canonical rebase descendants, depth tracking, global visited selection prevention, deterministic sliced continuation, and non-admission of a late candidate.
- [ ] Add policy identifiers for baseline, immediate canonical rebase, and selection beam width two.
- [ ] Add parent selection/candidate lineage, depth, rebase/beam transition counters, and semantically named continuous improvement field. Preserve the old field only as an explicit alias if artifact compatibility requires it.
- [ ] Implement immediate rebase exclusively when `record()` reports the existing selected-best-so-far transition; restart replacement enumeration from that parent without deleting global visited state.
- [ ] Implement a deterministic width-two parent frontier: retain non-dominated selections first and trim remaining parents by frozen selector key.
- [ ] Run focused MP tests.

### Task 2: Tournament variants and equal-work scheduler accounting

**Files:**
- Modify: `packages/core/benchmarks/research/capacityTournamentRun.ts`
- Modify: `packages/core/benchmarks/research/anytimeComposition.ts`
- Test: `packages/core/test/autoeq/v2/research/anytimeComposition.test.ts`
- Test: `packages/core/test/autoeq/v2/research/capacityTournament.test.ts`

- [ ] Write failing tests for observed structural-evaluation accounting, equal-work cutoff, useful handoff accounting, and deterministic cancellation/deadline behavior.
- [ ] Expose isolated MP traversal variants without combining ranking with rebase/beam.
- [ ] Implement paired one-shot and multi-seed scheduler configurations that stop structural execution at the same observed candidate-evaluation allowance; record configured budget, polish work, handoffs, seeds processed, useful handoffs, best improvement per handoff, and wall-clock.
- [ ] Run focused composition/tournament tests.

### Task 3: Storm-first experiment and control validation

**Files:**
- Modify: `packages/core/benchmarks/research/capacityTournamentRun.ts` only if CLI selection/serialization is needed
- Create: `docs/superpowers/specs/2026-09-09-autoeq-mp-reallocation-results.md`

- [ ] Create a new campaign evidence root and record immutable source/snapshot hashes.
- [ ] Run MP baseline, ranked traversal control, isolated immediate-rebase, and isolated width-two beam on Storm at 5/15/30/60 seconds.
- [ ] Shortlist only variants with measured useful Storm traversal; run those on U12t and Trio.
- [ ] Run paired equal-work structural scheduler ablation.
- [ ] Record original failures and reruns separately, artifacts/hashes, canonical metrics/regret/reference improvement, all requested traversal counters, facts versus interpretation, unresolved hypotheses, and no-promotion boundary.
- [ ] Run focused tests, root gates, core benchmark, and `git diff --check`.
