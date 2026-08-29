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

- Source-first remake design: `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`
- Standard AutoEQ v1 design: `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`
- Plan 3 integration/visual-closeout design: `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`
- Plan 3A: `docs/superpowers/plans/2026-08-26-plan-03a-normalization-session-exports.md`
- Plan 3B: `docs/superpowers/plans/2026-08-26-plan-03b-validation-diagnostics-e2e.md`
- Plan 3C: `docs/superpowers/plans/2026-08-26-plan-03c-squiglink-visual-alignment.md`
