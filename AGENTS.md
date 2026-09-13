# Repository Guidance

## Repository Layer

- Global Efficient Workflow v2 owns generic task classification, session/context discipline, lazy tooling, delegation limits, handoffs, verification strategy, and reporting.
- This file adds only AutoEQ Workbench-specific architecture, safety, gates, and authorities.
- Make the smallest coherent project change that satisfies the approved task; do not perform unrelated cleanup.

## Architecture And Data Safety

- Keep DSP, parsing, normalization, metrics, optimization, quantization, export math, and other domain logic in `packages/core`, never in React components.
- Keep `packages/core` framework-agnostic; it must not import React, Zustand, Tailwind CSS, or ECharts.
- Standard AutoEQ v1 remains frozen unless a later approved design/version explicitly changes it.
- `vendor/squiglink/` is immutable reference only and must never be runtime-imported.
- Use only synthetic or explicitly sanitized test fixtures by default.
- Approved exception: the four raw measurement files already versioned under `packages/core/benchmarks/research/raw/` are explicitly authorized research benchmark source data under `docs/superpowers/specs/2026-08-30-autoeq-research-bench-raw-corpus-amendment.md`. They may be filename-renamed or moved within the research corpus without content changes. Do not add any other raw/private/user curve data without a new explicit approval.
- Never commit secrets, private curves outside the approved research-corpus exception, user data, credentials, or local environment files.

## Repository Verification Gates

- Start with focused tests for changed behavior.
- Ordinary project change: after the diff stabilizes, run the applicable root `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm lint` once.
- AutoEQ/core behavior change: also run `pnpm --filter @autoeq-workbench/core benchmark`.
- Browser/session/export/UI-flow change: run the relevant focused browser E2E during development when needed; CI remains the full browser acceptance gate.
- Visual change: use Playwright/visual QA only when visual acceptance is part of the task.
- Before commit/push, inspect the directed diff and run `git diff --check`.
- GitHub Actions CI for the exact pushed SHA is the final executable proof; Pages follows only through the configured successful-CI path.

## Delivery Safety

- Do not deploy, merge, release, publish, or otherwise distribute the project without an explicit request.
- Preserve unrelated local WIP; never reset, clean, stash, or overwrite it merely to simplify the task.

## Approved References

- Efficient Workflow v2 design: `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`
- Efficient Workflow v2 plan: `docs/superpowers/plans/2026-08-29-efficient-workflow-v2.md`
- Source-first remake design: `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`
- Standard AutoEQ v1 design: `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`
- Standard AutoEQ v2 design: `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`
- Standard AutoEQ v2 plan: `docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md`
- AutoEQ Research Bench design: `docs/superpowers/specs/2026-08-30-autoeq-research-bench-design.md`
- AutoEQ Research Bench raw-corpus amendment: `docs/superpowers/specs/2026-08-30-autoeq-research-bench-raw-corpus-amendment.md`
- AutoEQ Research Bench implementation plan: `docs/superpowers/plans/2026-08-30-autoeq-research-bench.md`
- Plan 3 integration/visual-closeout design: `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`
- Plan 3A: `docs/superpowers/plans/2026-08-26-plan-03a-normalization-session-exports.md`
- Plan 3B: `docs/superpowers/plans/2026-08-26-plan-03b-validation-diagnostics-e2e.md`
- Plan 3C: `docs/superpowers/plans/2026-08-26-plan-03c-squiglink-visual-alignment.md`
