# AutoEQ Workbench — Implementation Plan Index

The approved MVP design is implemented through three sequential plans. Do not skip a completion gate and do not start a later plan while the prior plan has unresolved verification failures.

## Source of truth

- Design/spec: `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`
- Development protocol: repository `AGENTS.md` once created by Plan 1, following the adopted Noqlen Playbook rules.

## Execution order

1. `2026-08-23-01-foundations-manual-workbench.md`
   - pnpm monorepo bootstrap
   - React/Vite/Tailwind/ECharts/Zustand shell
   - framework-independent curve/parser/DSP/metrics core
   - Source/Target import and normalization
   - graph-centered manual PK/LS/HS workbench
   - dense-grid preamp and undo/redo

2. `2026-08-23-02-autoeq-standard-engine.md`
   - Standard-v1 configuration and objective
   - residual-region candidate generation
   - deterministic greedy + coordinate refinement
   - pruning and cancellation audit
   - quantization and discrete refinement
   - complete finalization pipeline and run manifest
   - cancellable Web Worker execution
   - Run AutoEQ UI/state integration

3. `2026-08-23-03-integration-export-benchmarks.md`
   - Poweramp-style enabled-solution text export
   - curve and Workbench session exports/import
   - diagnostics and band metrics
   - synthetic benchmark corpus and Standard-v1 tuning report
   - browser E2E acceptance flow
   - final CrinGraph/Squiglink-oriented visual pass
   - full MVP acceptance gate

## Agentic execution

For OpenCode or another agentic worker, use `superpowers:subagent-driven-development` when available, or `superpowers:executing-plans` for sequential execution. Each task is intended to be completed test-first, verified, reviewed, and committed before moving to the next task.

Before implementation, read both the design spec and the current plan. Do not infer later-plan behavior into earlier tasks unless an interface explicitly requires it.
