# M4 Causal Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add research-only selected-generation evidence that causally localizes every historical M4 oracle win without altering frozen baseline behavior.

**Architecture:** Extend the opt-in baseline snapshot with immutable pre-generation visited keys, parent-local Q31 inputs, accepted next states, and exact beam input. Re-evaluate existing O1–O4 candidates shadow-only against those captured facts and emit a compact committed audit artifact plus provenance hashes.

**Tech Stack:** TypeScript, Vitest, pnpm, Node SHA-256.

**Spec:** User-provided M4 causal-closeout request dated 2026-09-14.

## Global Constraints

- Observer-only; no additional baseline evaluations.
- Do not alter scheduler, allocation, defaults, q31 semantics, comparator, Pareto, O1–O4 construction, Standard-v1, or M5.
- Preserve historical M4 conclusion `STRUCTURAL_CANDIDATE_SIGNAL_SUPPORTED`.
- Commit only research observer, focused tests, compact evidence/audit/report artifacts.

---

### Task 1: Capture exact selected-generation baseline state

**Files:**
- Modify: `packages/core/src/autoeq/v2/structuralSearch.ts`
- Test: `packages/core/test/autoeq/v2/research/structuralSearchVnextM4.test.ts`

- [ ] **Step 1: Write failing snapshot-shape assertions**
- [ ] **Step 2: Run the focused M4 test and verify it fails because fields are absent**
- [ ] **Step 3: Add immutable observer-only snapshot fields sourced from existing generation work**
- [ ] **Step 4: Run the focused test and verify it passes**

### Task 2: Evaluate causal online feasibility

**Files:**
- Modify: `packages/core/benchmarks/research/structuralSearchVnextM4.ts`
- Test: `packages/core/test/autoeq/v2/research/structuralSearchVnextM4.test.ts`

- [ ] **Step 1: Write failing tests for ordinary duplicate, parent-local Q31, visited novelty, and actual-nextState beam population classification**
- [ ] **Step 2: Run focused tests and verify expected failures**
- [ ] **Step 3: Implement exact selector reuse and ordered causal classes with shadow-only equal-work polish**
- [ ] **Step 4: Run focused tests and verify they pass**

### Task 3: Aggregate and persist closeout evidence

**Files:**
- Modify: `packages/core/benchmarks/research/structuralSearchVnextM4.ts`
- Modify/Create: `.research-artifacts/structural-search-m4-candidate-oracle/**`
- Test: `packages/core/test/autoeq/v2/research/structuralSearchVnextM4.test.ts`

- [ ] **Step 1: Write failing audit/decision coverage assertions**
- [ ] **Step 2: Run focused tests and verify expected failures**
- [ ] **Step 3: Add protocol and de-duplicated deterministic aggregation, compact candidate-win audit, and report**
- [ ] **Step 4: Run focused tests and verify they pass**

### Task 4: Execute campaign and verify

- [ ] **Step 1: Run focused M4 tests, core typecheck, core benchmark, and observer-only equivalence evidence**
- [ ] **Step 2: Run `git diff --check`**
- [ ] **Step 3: Run the deterministic closeout campaign and inspect compact output**
- [ ] **Step 4: Commit and push only intended paths**
