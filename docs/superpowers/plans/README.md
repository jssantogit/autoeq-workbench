# AutoEQ Workbench — Implementation Plan Index

The approved product design is implemented through sequential plans. Do not skip a completion gate and do not start a later plan while the prior plan has unresolved verification failures.

## Source of truth

- Main product design/spec: `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`
- Original visual closeout spec: `docs/superpowers/specs/2026-08-23-visual-foundation-closeout-design.md`
- Final Plan 1.5 numerical/domain closeout contract: `docs/superpowers/specs/2026-08-24-plan-1-5-final-closeout.md`
- **Source-first remake design (authoritative for current web architecture/UI where it conflicts with older visual decisions):** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`
- Plan 2 amendment: `docs/superpowers/plans/2026-08-24-02-standard-engine-amendment.md`
- Development protocol: repository `AGENTS.md`, following the adopted Noqlen Playbook rules.

The remake changes web composition/rendering/tooling but does not supersede the established core numerical contracts. `packages/core`, the 48 kHz / 20 Hz-20 kHz / 96 ppo policy, hard product limits, graph semantic curve contract, and future Standard AutoEQ methodology remain authoritative unless an approved later spec explicitly changes them.

## Execution order

### 1. Foundations/manual workbench

`2026-08-23-01-foundations-manual-workbench.md`

- pnpm monorepo bootstrap
- React/Vite/Tailwind/Zustand shell
- framework-independent curve/parser/DSP/metrics core
- initial curve import/normalization workflow
- graph-centered manual PK/LS/HS workbench
- dense-grid preamp and undo/redo

### 1.5. Numerical/domain and first visual closeout

`2026-08-23-01-5-visual-foundation-closeout.md` plus `2026-08-24-plan-1-5-final-closeout.md`

- canonical 48 kHz / 20 Hz-20 kHz / 96 ppo evaluation policy
- PEQ/preamp derivation independent from Target availability
- FR + EQ derivation with FR alone
- curve kinds `fr | target`
- active AutoEQ pair `activeFrId` / `activeTargetId`
- one global non-destructive normalization
- validated AutoEQ effective settings for Frequency/Gain/PK-Q/maxFilters
- hard product bounds exposed separately from effective run settings
- graph semantic contract limited to imported FR(s), Target(s), and the active full-cascade FR EQ

The specialized React/SVG renderer and old `Curves | Equalizer | Details` visual composition created in this phase are intentionally superseded by the approved source-first remake below. Their domain/numerical contracts remain in force.

### Remake gate — mandatory before Plan 2

The source-first remake is implemented as four sequential public-functional plans on `remake/squiglink-base`. The public GitHub Pages site is used as the continuous preview after each green checkpoint, while `main` remains the rollback application baseline during the remake.

#### Remake 01 — Public preview and vendor setup

`2026-08-24-remake-01-public-preview-and-vendor.md`

- run CI for remake pushes
- make Pages publish only successful remake-branch push CI results during the remake
- retain exact-SHA CI -> Pages deployment semantics
- vendor immutable Squiglink Lab commit `9ff842c539b058cc726207b689c904c9efff75fd`
- preserve 0BSD license/provenance
- prove the vendor tree is runtime-inert

#### Remake 02 — Shell, graph, and Curves

`2026-08-24-remake-02-shell-graph-curves.md`

- port the whole Squiglink-derived shell/layout/style language while keeping the Workbench palette
- keep Light + Dark with Light default
- change IA to `Curves | Equalizer | Tools`
- install/bundle D3 through pnpm/Vite
- port the actual Squiglink D3 graph behind a TypeScript lifecycle adapter
- replace UtilityRail with source-derived Zoom/Normalize/Smooth/Inspect/Label/Screenshot/Recolor toolbar
- preserve semantic graph curves only: FR(s), Target(s), active full-cascade FR EQ
- migrate Curves to source-derived manager composition with local FR/Target import, visibility, recolor, baseline, offset, rename/remove

#### Remake 03 — Equalizer and EQ I/O

`2026-08-24-remake-03-equalizer-and-io.md`

- port the Squiglink Parametric Equalizer composition
- keep canonical Workbench `PK | LS | HS` filters and hard limits
- add atomic Sort and filter import state transitions
- add Equalizer APO-style PEQ import/export in `packages/core`
- add GraphicEQ/Wavelet export using source grid/bin conventions but Workbench cascade math
- use Workbench dense-grid preamp in export
- port AutoEQ constraints/settings presentation while keeping the AutoEQ button inert
- do not port any Squiglink AutoEQ optimizer runtime

#### Remake 04 — Tools and closeout

`2026-08-24-remake-04-tools-and-closeout.md`

- record exact additional MIT source provenance for approved Music Player/Compare A/B behavior where pinned Squiglink Lab lacks the implementation
- add local Web Audio Sound Tools
- add Tone Generator
- add local Music Player with current EQ/preamp playback chain
- add bounded session Compare A/B EQ snapshots with deterministic undoable application
- replace old Details with secondary Analysis containing MAE/RMSE/max error/max-error frequency/preamp only
- remove transitional/dead pre-remake UI where superseded
- finish mobile/desktop Light/Dark parity and public deployed-SHA verification

**Do not start Plan 2 until Remake 04 completion gate passes and the user explicitly approves resuming AutoEQ engine work.**

### 2. Standard AutoEQ engine

`2026-08-23-02-autoeq-standard-engine.md` plus `2026-08-24-02-standard-engine-amendment.md`

- Standard-v1 immutable algorithm/profile configuration
- resolve validated `AutoEqSettings` into effective run config
- effective optimization range may narrow inside the 20 Hz-20 kHz product domain
- effective Gain/PK-Q ranges may narrow inside hard ±15 dB / Q 0.1-12 bounds
- effective `maxFilters` default 10, valid 0-64, ceiling rather than fill target
- residual-region candidate generation
- deterministic greedy + coordinate refinement
- pruning and cancellation audit
- quantization and discrete refinement
- complete finalization pipeline and run manifest including effective run settings
- cancellable Web Worker execution
- connect the already-positioned remake Equalizer AutoEQ surface rather than creating a parallel control panel
- consume shared numeric policy/product limits without duplication

### 3. Integration, export, and benchmarks

`2026-08-23-03-integration-export-benchmarks.md`

This plan must be re-read after the remake and Plan 2 because portions of its older UI/export assumptions may already have been fulfilled or superseded by Remake 03-04. Preserve its remaining product goals but do not reintroduce old visual architecture.

Remaining intended scope includes:

- Poweramp-style enabled-solution text export
- curve and Workbench session export/import
- diagnostics and band metrics beyond the remake Analysis baseline
- synthetic benchmark corpus and Standard-v1 tuning report
- browser E2E acceptance flow
- final MVP acceptance gate

## Agentic execution

For OpenCode or another agentic worker, use `superpowers:subagent-driven-development` when available, or `superpowers:executing-plans` for sequential execution. Every task should follow Inspect -> Implement -> Verify -> Review, use targeted tests before broad verification, and commit a coherent checkpoint before moving to the next task.

Before implementation, read the applicable design spec(s), the final Plan 1.5 numerical/domain contract, the current remake plan, and any listed amendment. Do not infer later-plan behavior into earlier tasks unless an interface explicitly requires it.
