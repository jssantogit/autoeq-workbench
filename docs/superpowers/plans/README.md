# AutoEQ Workbench — Implementation Plan Index

The approved MVP design is implemented through sequential plans. Do not skip a completion gate and do not start a later plan while the prior plan has unresolved verification failures.

## Source of truth

- Main design/spec: `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`
- Visual closeout spec: `docs/superpowers/specs/2026-08-23-visual-foundation-closeout-design.md`
- Development protocol: repository `AGENTS.md`, following the adopted Noqlen Playbook rules.

## Execution order

Plan 1.5 is a mandatory gate between the manual workbench and Standard AutoEQ work. It freezes the graph, shared dock, and Light/Dark theme foundation while establishing the shared numeric policy and closing partial-derivation gaps so Plan 2 does not repeat visual restructuring or numeric constants.

1. `2026-08-23-01-foundations-manual-workbench.md`
   - pnpm monorepo bootstrap
   - React/Vite/Tailwind/ECharts/Zustand shell
   - framework-independent curve/parser/DSP/metrics core
   - Source/Target import and normalization
   - graph-centered manual PK/LS/HS workbench
   - dense-grid preamp and undo/redo

1.5. `2026-08-23-01-5-visual-foundation-closeout.md`
   - canonical 48 kHz / 20 Hz-20 kHz / 96 ppo evaluation policy
   - PEQ/preamp derivation independent from Target availability
   - Source + EQ derivation with Source alone
   - Squiglink-inspired Light/Dark graph-first shell
   - Light as the default theme with amber/copper/brown UI identity
   - responsive `Curves | Equalizer | Details` dock shared by desktop and mobile
   - independent recolorable measurement-curve colors
   - neutral gray dashed reference Targets
   - responsive filter editing without routine mobile horizontal-table scrolling
   - browser and regression gate before Standard AutoEQ work

2. `2026-08-23-02-autoeq-standard-engine.md`
   - Standard-v1 configuration and objective
   - residual-region candidate generation
   - deterministic greedy + coordinate refinement
   - pruning and cancellation audit
   - quantization and discrete refinement
   - complete finalization pipeline and run manifest
   - cancellable Web Worker execution
   - Run AutoEQ UI/state integration
   - consumes the shared numeric policy established by Plan 1.5

3. `2026-08-23-03-integration-export-benchmarks.md`
   - Poweramp-style enabled-solution text export
   - curve and Workbench session exports/import
   - diagnostics and band metrics
   - synthetic benchmark corpus and Standard-v1 tuning report
   - browser E2E acceptance flow
   - final polish/regression pass on the already-established Squiglink-inspired visual system
   - full MVP acceptance gate

## Agentic execution

For OpenCode or another agentic worker, use `superpowers:subagent-driven-development` when available, or `superpowers:executing-plans` for sequential execution. Each task is intended to be completed test-first, verified, reviewed, and committed before moving to the next task.

Before implementation, read the applicable design spec(s) and the current plan. Do not infer later-plan behavior into earlier tasks unless an interface explicitly requires it.
