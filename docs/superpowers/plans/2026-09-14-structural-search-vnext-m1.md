# Structural Search VNext M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicitly selected experimental structural-search engine that retains diverse structural hypotheses and can replace weak topology without changing V2 production defaults.

**Architecture:** Keep `runStructuralSearch` frozen. Add VNext helpers in the V2 structural-search module and route only an explicit research selector to them. Candidate metadata, coarse geometry-derived signatures, deterministic diversity admission/beam retention, and bounded marginal-removal replacement use existing candidate generation, delivered evaluation, comparator, polishing, and quantization.

**Tech Stack:** TypeScript, Vitest, pnpm, existing AutoEQ V2 core/research runners.

**Spec:** User-approved Milestone 1 request (2026-09-14).

## Global Constraints

- Standard-v1, scheduler/resource policy, comparator, quantization, preamp, preparation, normalization, and frontend remain unchanged.
- Baseline `runStructuralSearch` behavior remains explicitly selectable and byte-for-byte unmodified.
- VNext uses existing bounds and fixed resource configuration; no parameter sweep or production default change.
- Raw timing JSONL is uncommitted; commit plan, implementation, deterministic tests, aggregate evidence, hashes, and report.

---

### Task 1: Isolated baseline and research contract
**Files:** Create `.research-artifacts/structural-search-vnext-m1/benchmark-plan.md`, `algorithm-design.md`; Modify none.
- [ ] Record start SHA, six real cases, D/E/F/H, 43/e6, checkpoints 5/15/30, three serial repeats, metrics and acceptance gate.
- [ ] Commit the plan artifacts.

### Task 2: Deterministic VNext primitives
**Files:** Modify `packages/core/src/autoeq/v2/structuralSearch.ts`; Test `packages/core/test/autoeq/v2/structuralSearch.test.ts`.
- [ ] Write failing tests for ID-independent coarse signatures and deterministic region/family-preserving admission.
- [ ] Run focused Vitest and observe failure.
- [ ] Add metadata, signature, candidate-pool and admission helpers based exclusively on existing residual features, shelf evidence, candidate bounds and quantization.
- [ ] Run focused Vitest and commit.

### Task 3: Diverse beam and bounded replacement
**Files:** Modify `packages/core/src/autoeq/v2/structuralSearch.ts`; Test `packages/core/test/autoeq/v2/structuralSearch.test.ts`.
- [ ] Write failing tests proving a distinct viable signature survives, ordering is deterministic, beam width is bounded, and below-cap one-for-one replacement is bounded.
- [ ] Run tests and observe failure.
- [ ] Add explicit VNext path, diversity beam retention, marginal-removal victim selection, stall diversification, trace/work counters and final-phase attribution; retain old rescue phases unchanged.
- [ ] Run focused tests and commit.

### Task 4: Research runner and evidence
**Files:** Create `packages/core/benchmarks/research/structuralSearchVnext.ts`, aggregate artifacts and report; Modify package script only if required.
- [ ] Implement one fixed baseline/VNext runner with serial three-repeat checkpoints and no tuning controls.
- [ ] Execute predeclared corpus, calculate aggregate/quantized/complexity output, retain raw JSONL uncommitted, commit aggregate hashes/report.

### Task 5: Validation and delivery
**Files:** Modify only artifacts as needed.
- [ ] Run affected structural candidates/refine/cancellation/scalable tests, core typecheck, root checks required by repository guidance, benchmark, and `git diff --check`.
- [ ] Commit final report and provide SHA/commits, results, acceptance classification and recommendation.
