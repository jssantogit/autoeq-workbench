# Repository Guidance

## Operating Workflow

- Follow Noqlen `Inspect -> Implement -> Verify -> Review` for every change.
- Inspect the relevant code and requirements before editing.
- Make the smallest coherent change that satisfies the current task.
- Write and run targeted tests before broader verification where meaningful.
- Review the actual diff for scope, regressions, secrets, and unrelated cleanup.

## Architecture And Data Safety

- Keep DSP, parsing, normalization, metrics, optimization, quantization, export math, and other domain logic in `packages/core`, never in React components.
- Keep `packages/core` framework-agnostic; it must not import React, Zustand, Tailwind CSS, or ECharts.
- Use only synthetic or explicitly sanitized test fixtures.
- Never commit secrets, private curves, user data, credentials, or local environment files.

## Delivery Safety

- Run targeted checks first, then the applicable root `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm lint` commands.
- Do not deploy, merge, release, publish, or otherwise distribute the project without an explicit request.

## Approved References

- Design: `docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`
- Foundations/manual workbench plan: `docs/superpowers/plans/2026-08-23-01-foundations-manual-workbench.md`
- AutoEQ Standard engine plan: `docs/superpowers/plans/2026-08-23-02-autoeq-standard-engine.md`
- Integration/export/benchmarks plan: `docs/superpowers/plans/2026-08-23-03-integration-export-benchmarks.md`
