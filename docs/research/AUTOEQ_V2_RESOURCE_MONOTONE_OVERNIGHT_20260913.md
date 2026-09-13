# AutoEQ V2 resource-monotone overnight research — 2026-09-13

## Scope and starting point

- Isolated worktree: `/root/projects/autoeq-workbench-resource-monotone-overnight-20260913`.
- Branch: `research/resource-monotone-overnight-20260913`.
- Base and remote scalable-search head: `9d6b432830980d1cc65e9c59d107e7211748ea44`
  (`research: make scalable capacity ladder observable`).
- The declared reference is the remote branch head and is therefore the chosen base;
  there are no later remote commits to assess.
- Node dependencies were installed with `pnpm install --frozen-lockfile`; no dependency
  manifests or versions changed.

The source controller is `packages/core/src/autoeq/v2/scalableStructuralSearch.ts`.
It starts at capacity 10 (or the requested maximum when lower), gives each stage a
five-second wall-clock quantum, geometrically opens capacity, and only then deepens
effort.  It holds an in-memory incumbent, replacing it only when normalized violation,
then RMSE, then max-absolute error improves.  Remove-one reseeds are eligible only at
the requested maximum after stagnation.  The observable real-FR harness is
`packages/core/benchmarks/structuralScalableCapacityLadder.ts`; its approved corpus is
the three sanitized/manual regression cases in `benchmarks/research/manualRegression.ts`.

## Baseline verification

- `pnpm --filter @autoeq-workbench/core typecheck`: passed.
- Focused scalable tests (`scalableStructuralSearch` and
  `structuralScalableCapacityLadder`): 7 passed / 0 failed.
- `git diff --check`: passed before this log was created.
- A broad Vitest invocation exposed the known unrelated Standard-v1 deterministic
  snapshot drift: `test/autoeq/runStandardAutoEq.test.ts` (default-normalization
  deterministic output).  It is out of scope and was not changed.

## Causal diagnosis (evidence to date)

### Hypothesis status

1. **Scheduler abandons low-capacity maturation after one stage when capacity is open**
   — **confirmed by code trace.**  Every stage with `capacity < maximum` unconditionally
   calls `nextScalableCapacity()` and resets effort/stagnation.  Thus Max15 performs
   exactly one capacity-10 stage, whereas Max10 continues at 10 and increases effort.
2. **Higher capacity intrinsically destroys a good incumbent** — **rejected for the
   tested counterfactual.**  A 20-second Max10 RSV seed (violation 6.19512) passed to a
   fresh Max15 controller was returned at 6.17876 after a controlled 10-second run;
   it was preserved and improved under the controller's actual comparator.
3. **The historic 60-second RSV gap is caused solely by this schedule** —
   **inconclusive.**  The environment's per-command execution window prevented a fresh
   complete 60-second trajectory in this session.  The supplied historic evidence is
   retained as prior empirical evidence, not promoted to a guarantee.

### Reproducible short controlled trajectories

The following focused runs use the generic controller and a 20-second deadline.  They
are diagnostic only; they are not substitutes for the requested 60-second experiment.

| RSV run | final violation | RMSE | maxAbs | stages | schedule observation |
|---|---:|---:|---:|---:|---|
| Max10 | 6.19512 | 1.46200 | 4.64634 | 5 | capacities `10,10,10,10,10`; effort `0..4` |
| Max15 | 6.20273 | 1.17441 | 4.65205 | 5 | capacities `10,15,15,15,15`; effort resets after stage 0 |
| Max10 seed → Max15 (10 s) | 6.17876 | 1.45439 | 4.63407 | 4 | seed preserved and improved; returned 11 filters |

The first meaningful policy divergence is immediately after stage 0 (~5 s): Max15
opens 15 and resets effort; Max10 retains capacity 10 and grows effort.  Neither short
run reached violation below 6, so threshold-crossing timing and the historic final
basin require a full-duration rerun in an environment that permits it.

## Resource-monotonicity contract

### Guaranteed by current code

- Within one invocation, a candidate that is worse under `(violation, RMSE, maxAbs)`
  cannot replace the stored incumbent.
- A supplied seed is the initial incumbent and cannot be returned worse under that
  same three-field comparator.
- Capacity passed to a stage never exceeds the requested maximum.
- Opening capacity never deletes the incumbent; it only changes the next candidate's
  capacity/effort configuration and seed strategy.

### Covered by deterministic tests

- Generic geometric capacity progression (`10 → 15 → 23 → 35 → 53 → 64`).
- Monotone effort configuration expansion at fixed requested capacity.
- The normalized-violation formula.

### Empirical, not guaranteed

- Independent equal-wall-clock runs need not satisfy
  `Q(max=15, t) <= Q(max=10, t)`: a one-core budget spent preserving a complete
  low-capacity trajectory leaves no additional work for larger capacity.  Exact nesting
  under equal compute is therefore incompatible with independent higher-capacity
  exploration unless work is shared or the smaller trajectory is deliberately given
  less maturation.
- Desired architecture: preserve the incumbent and expose a schedule whose lower-
  capacity lane receives sufficient maturation before capacity consumes its budget.
  This is a policy/empirical objective, not a free mathematical guarantee.

## Quality-semantics audit

The V2 specification defines primary normalized violation as
`max(rmseDb / 0.25, maxAbsDb / 0.75)`, then specifies a richer deterministic tuple:
RMSE, maxAbs, cancellation, maximum Q, maximum absolute gain, total absolute gain,
filter count, and deterministic list order.  The scalable controller currently uses
only the first three components, whereas `ranking.ts` implements the complete delivered
solution comparison and several benchmarks duplicate the primary formula.  No weights
were invented and no behavior was changed.  A future consolidation must decide whether
the controller intentionally ranks its lightweight structural result differently or
should receive a shared structural-quality abstraction.

## Next evidence needed

1. Run exact 60-second Max10/Max15 RSV trajectories with full stage telemetry and
   threshold-crossing extraction.
2. Add injectable-clock/fake-runner controller tests for incumbent and seed
   preservation, reseed order, deadline, tie behavior, and post-capacity work.
3. Only after (1) and (2), evaluate one generic maturation-before-promotion scheduler
   experiment against RSV 10/15/20 and Mystic/S12 controls.

Artifacts from transient short measurements are intentionally untracked under
`.research-artifacts/resource-monotone-overnight-20260913/`.
