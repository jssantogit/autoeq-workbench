# AutoEQ Workbench — Implementation Plan Index

The approved MVP design is implemented through sequential plans. Do not skip a completion gate and do not start a later plan while the prior plan has unresolved verification failures.

## Source of truth

- Main design/spec: `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`
- Original visual closeout spec: `docs/superpowers/specs/2026-08-23-visual-foundation-closeout-design.md`
- **Final Plan 1.5 closeout contract (authoritative for current architecture):** `docs/superpowers/specs/2026-08-24-plan-1-5-final-closeout.md`
- **Plan 2 amendment (wins where the original Plan 2 conflicts):** `docs/superpowers/plans/2026-08-24-02-standard-engine-amendment.md`
- Development protocol: repository `AGENTS.md`, following the adopted Noqlen Playbook rules.

## Execution order

Plan 1.5 is a mandatory gate between the manual workbench and Standard AutoEQ work. It freezes the graph, shared dock, Light/Dark theme foundation, curve/selection model, shared numeric policy, and effective AutoEQ run-settings contract so Plan 2 does not repeat visual restructuring or invent parallel configuration semantics.

1. `2026-08-23-01-foundations-manual-workbench.md`
   - pnpm monorepo bootstrap
   - React/Vite/Tailwind/Zustand shell
   - framework-independent curve/parser/DSP/metrics core
   - initial curve import/normalization workflow
   - graph-centered manual PK/LS/HS workbench
   - dense-grid preamp and undo/redo

1.5. `2026-08-23-01-5-visual-foundation-closeout.md` + final closeout contract
   - canonical 48 kHz / 20 Hz-20 kHz / 96 ppo evaluation policy
   - PEQ/preamp derivation independent from Target availability
   - FR + EQ derivation with FR alone
   - specialized Squiglink-inspired React/SVG FR renderer
   - no graph zoom/pan/Reset View
   - Light/Dark graph-first shell with Light default and amber/copper/brown UI identity
   - responsive `Curves | Equalizer | Details` dock shared by desktop and mobile
   - curve kinds simplified to `fr | target`
   - active AutoEQ pair represented by `activeFrId` / `activeTargetId`
   - one global non-destructive normalization edited in the utility rail
   - independent recolorable FR colors and neutral gray dashed Targets
   - compact filter table with inline units and scalable mobile density
   - validated AutoEQ effective settings for Frequency/Gain/PK-Q/maxFilters
   - hard product bounds exposed separately from effective run settings

2. `2026-08-23-02-autoeq-standard-engine.md` + `2026-08-24-02-standard-engine-amendment.md`
   - Standard-v1 immutable algorithm/profile configuration
   - resolve current validated `AutoEqSettings` into the effective run config
   - effective optimization range may narrow inside the 20 Hz-20 kHz product domain
   - effective Gain/PK-Q ranges may narrow inside hard ±15 dB / Q 0.1-12 bounds
   - effective `maxFilters` default 10, valid 0-64, ceiling rather than fill target
   - residual-region candidate generation
   - deterministic greedy + coordinate refinement
   - pruning and cancellation audit
   - quantization and discrete refinement
   - complete finalization pipeline and run manifest including effective run settings
   - cancellable Web Worker execution
   - wire the existing Equalizer FR/Target/settings/Auto EQ surface instead of adding a parallel control panel
   - consumes the shared numeric policy and product limits established by Plan 1.5

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

Before implementation, read the applicable design spec(s), the final Plan 1.5 closeout contract, the current plan, and any listed amendment. Do not infer later-plan behavior into earlier tasks unless an interface explicitly requires it.
