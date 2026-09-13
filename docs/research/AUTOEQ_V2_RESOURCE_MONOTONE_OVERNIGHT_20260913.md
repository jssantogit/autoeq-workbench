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

## Accepted deterministic-test strengthening

Commit `8fd0e2e` (`test: strengthen scalable search controller invariants`) adds
sub-second controller tests with a Vitest-mocked lower-level structural runner.  The
tests exercise actual `runScalableStructuralSearch()` scheduling and prove the current
controller's bounded contract: seed/incumbent preservation under its comparator,
generic capacity bounds/progression, continued stages after maximum capacity, effort
progression, deterministic remove-one reseeding, deadline stopping, and repeatability.
They do not claim that a real wall-clock structural search is deterministic across
machines; that exception remains explicit in the V2 specification.

Focused validation: 8 tests passed, core typecheck passed, and `git diff --check`
passed for the test commit.

## Package status at session cutoff

Completed: bootstrap, starting-state record, focused causal code trace and short
counterfactual, resource-monotonicity definition, quality-semantics audit, corpus
inventory, and deterministic controller-test strengthening.  Not completed: a valid
60-second trajectory capture, scheduler-policy experiment, anytime-harness migration,
full time×capacity matrix, quantization pathology measurements, and a 64-filter profile.
Those items were deliberately not represented as completed: exact 60-second commands
cannot be observed to completion through this execution environment's command window,
and changing a scheduler before those observations would violate the causal gate.

## Next evidence needed

1. Run exact 60-second Max10/Max15 RSV trajectories with full stage telemetry and
   threshold-crossing extraction.
2. Add injectable-clock/fake-runner controller tests for incumbent and seed
   preservation, reseed order, deadline, tie behavior, and post-capacity work.
3. Only after (1) and (2), evaluate one generic maturation-before-promotion scheduler
   experiment against RSV 10/15/20 and Mystic/S12 controls.

## Continuation — CI-observed 60-second evidence

### Measurement path

Commit `170ce5b` changes the small research-only scalable-search workflow to target
this branch, emit one JSONL cell per independent case/capacity job, and upload the
complete telemetry artifact.  `0922ecc` corrects its matrix gate after the initial
zero-job workflow failure.  `0407289` and `05d04f7` add a generic validated seed-file
input and repository-relative resolution for the controlled counterfactual.  These are
measurement facilities only: `scalableStructuralSearch.ts` and its comparator were not
changed.

The first successful full baseline matrix is Actions run
`34752259505` (commit `0922ecc`); the raw JSONL artifacts are named
`scalable-search-<case>-max-<capacity>-34752259505`.  A targeted independent RSV
repeat is run `34752375742`.  All timings below are telemetry elapsed milliseconds,
not an assumption about a nominal five-second stage.

### Exact RSV trajectories — baseline run 34752259505

Max10 ended at violation **2.037639**, RMSE **0.449358**, maxAbs **1.528229**, and
10 filters after 60,006.8 ms.  Its exact stage record is:

|stage|elapsed ms|capacity|effort|seed / removed id|candidate|incumbent|improved|
|---:|---:|---:|---:|---|---:|---:|---|
|0|5008.0|10|0|incumbent|6.168648|6.168648|yes|
|1|7732.8|10|1|incumbent|6.168583|6.168583|yes|
|2|9704.1|10|2|incumbent|6.168583|6.168583|no|
|3|11790.3|10|3|remove `struct-add-ls`|6.168583|6.168583|no|
|4|16802.0|10|4|remove `struct-add-ls-split-low-split-low`|6.129220|6.129220|yes|
|5|21807.0|10|5|incumbent|6.100073|6.100073|yes|
|6|26807.7|10|6|incumbent|3.325366|3.325366|yes|
|7|31809.0|10|6|incumbent|3.310859|3.310859|yes|
|8|35817.9|10|6|incumbent|3.310859|3.310859|no|
|9|40818.5|10|6|remove `struct-late-pk`|3.310891|3.310859|no|
|10|45820.0|10|6|remove merge filter|3.310825|3.310825|yes|
|11|48284.4|10|6|incumbent|3.310825|3.310825|yes|
|12|49987.8|10|6|incumbent|3.310825|3.310825|no|
|13|54989.0|10|6|remove `struct-late-pk-1`|3.148691|3.148691|yes|
|14|59990.4|10|6|incumbent|2.037639|2.037639|yes|
|15|60006.7|10|6|incumbent|2.037639|2.037639|no|

Max15 ended at violation **1.517708**, RMSE **0.376465**, maxAbs **1.138281**, and
15 filters after 60,001.5 ms.  Its exact stage record is:

|stage|elapsed ms|capacity|effort|seed|candidate / incumbent|improved|
|---:|---:|---:|---:|---|---:|---|
|0|5002.3|10|0|incumbent|6.029240|yes|
|1|6511.5|15|0|incumbent|5.976536|yes|
|2|9642.7|15|1|incumbent|5.976536|yes|
|3|14659.4|15|2|incumbent|5.975298|yes|
|4|19661.1|15|3|incumbent|5.975298|yes|
|5|24662.3|15|4|incumbent|5.975298|yes|
|6|29663.8|15|5|incumbent|5.975297|yes|
|7|34665.8|15|6|incumbent|5.975297|yes|
|8|39667.8|15|6|incumbent|5.975297|yes|
|9|44668.1|15|6|incumbent|5.952207|yes|
|10|49669.2|15|6|incumbent|1.921248|yes|
|11|54670.8|15|6|incumbent|1.550273|yes|
|12|59671.7|15|6|incumbent|1.518969|yes|
|13|60001.4|15|6|incumbent|1.517708|yes|

Full final filters (including IDs and parameters) are retained in the JSONL artifacts;
the Max10 final list is also the sanitized checked-in seed fixture
`packages/core/benchmarks/research/resourceMonotoneSeeds/titan-to-rsv-max10-60s.json`.

### Threshold crossing and schedule alignment

In the Max10 trajectory, the incumbent first crossed **<6, <5, and <4 together** at
stage 6 / 26,807.7 ms (3.325366).  It never crossed **<3, <2, or <1.5** in this
reproduction; its final best is stage 14 / 59,990.4 ms (2.037639).  The immediate
predecessor of the first large improvement was an ordinary incumbent-seeded,
effort-5 stage (stage 5), not a removal reseed.  The key transition is therefore
effort reaching its generic maximum and the following effort-6 capacity-10 work.

The two runs are materially similar only in the policy sense at stage 0: both start
capacity 10, effort 0, incumbent seed.  Their numeric candidates differ (6.168648 vs
6.029240), so they are not bit-identical real-search trajectories.  Their schedules
diverge immediately after stage 0: Max10 stays at 10 and deepens effort, while Max15
promotes to 15 and resets effort to 0.  Consequently Max15 never performs Max10's
capacity-10 effort 1–6 stages or its capacity-10 removal reseeds.  It is at maximum
capacity from stage 1; the removal rule could first be used at effort 2 with a prior
non-improvement (stage 3), but this run never has that condition because tiny numerical
improvements reset stagnation.  Thus it uses all later budget deepening at 15.

Accordingly, `Work(max=10, 60s) subset Work(max=15, 60s)` is **false as a scheduler
trace**: Max15 abandons the low-capacity effort/reseed lane after one stage.  This is a
code-and-telemetry fact, not a claim that the abandoned lane necessarily wins every
real run.

### Repeat and causal decision (Gate A)

The targeted repeat (run `34752375742`) demonstrates substantial wall-clock/search
path variability:

|RSV 60 s run|Max10|Max15|Max20|
|---|---:|---:|---:|
|baseline `34752259505`|2.037639|1.517708|0.889446|
|repeat `34752375742`|1.968780|5.980341|1.685790|

The historical Max10-better-than-Max15 result therefore did not reproduce as a stable
causal result on this branch.  One baseline has Max15 better than Max10; the repeat has
Max15 much worse.  The scheduler remains non-nested, but this two-run evidence is not
sufficient to attribute a reliable RSV regression to premature promotion.

**Gate A outcome: C.**  No maturation-before-promotion policy was implemented and no
scheduler benchmark comparison is claimed.  This avoids conflating an uncharacterized
timing/search variance with a scheduler fix.

### Full-duration seeded counterfactual

Actions run `34752972994` initializes real Max15 controller work with the exact
baseline-Max10 final filters and runs for 60 seconds.  The supplied seed violation is
**2.037639**.  The returned solution has violation **2.037430**, RMSE **0.468274**,
maxAbs **1.528072**, 15 filters, and 18 stages.  It therefore preserves and slightly
improves the seed under the controller's existing comparator; there is no observed
incumbent/comparator correctness defect.  Its material reseed stages occur at 11.59 s,
41.79 s, 48.38 s, 53.39 s, and 58.44 s; only the final one improves the incumbent.

### Control baseline and current decision

The same first CI matrix supplies an unmodified-controller control baseline:

|case|Max10|Max15|Max20|
|---|---:|---:|---:|
|Mystic|5.396478|3.122022|6.194550|
|S12 Ultra|4.035083|4.675382|4.727986|

These values are baseline observations, not scheduler-experiment results.  The failed
monotonicity examples (Mystic Max20 and S12 Max15/20) reinforce that equal wall-clock
capacity comparisons are noisy/non-nested and conserve compute; extra low-capacity
maturation would move time away from high-capacity work.  No claim of free exact
independent-run capacity monotonicity is made.

**Decision: isolate measurement infrastructure; reject/no-op the proposed scheduler
experiment for this work package.**  The next focused package should run a predefined
multi-repeat RSV/Mystic/S12 design with per-stage deterministic work counters (not
wall-clock alone), quantify variance, and only then decide whether a single generic
maturation policy merits implementation.

Artifacts from transient short measurements are intentionally untracked under
`.research-artifacts/resource-monotone-overnight-20260913/`.
