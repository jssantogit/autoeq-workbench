# AutoEQ V2 generic resource envelope

Status: architecture and research-method note (2026-09-13)

This note reframes scalable-search research.  A filter capacity is an input
constraint and an experimental sample point; it is not an algorithm name, a
preset, or a reason to select a different scheduler.

## Decision

The conceptual interface is:

```text
search(problem, resourceEnvelope)
```

`problem` contains the FR correction target and structural-search constraints.
The current resource envelope contains:

- `deadline`: a time/deadline resource.  The current controller receives the
  existing deadline callback; research runners translate a time budget into it.
- `maxFilters`: a positive integer ceiling.  It bounds the capacity available
  to the search but is not an objective to reach.  The current product ceiling
  is 64; no engine mode is introduced for any particular value.

Deterministic work/evaluation, memory, and parallelism budgets are useful future
dimensions, but this change does not add those APIs.  They should be added only
when a concrete scheduler experiment needs them.

The controller policy and quality comparator are deliberately unchanged.

## Capacity-assumption audit

The audit searched the scalable controller, its tests, research runners,
benchmark harnesses, and the overnight/design notes.

| Occurrence | Classification | Interpretation |
| --- | --- | --- |
| `SCALABLE_BASE_CAPACITY` (currently 10) and the geometric growth factor | Acceptable current controller policy | This is the controller's generic starting/progression rule, not a branch on the requested maximum.  Changing it would be scheduler tuning and is outside this task. |
| `nextScalableCapacity` vectors such as `10, 15, 23, 35, 53, 64` in tests | Acceptable diagnostic/regression vectors | They verify the mathematical progression and boundary handling.  Generated tests now exercise every ceiling from 1 through 64 plus irregular probes. |
| Existing `MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET` references | Acceptable historical search configuration | It is an existing lower-level structural-search preset, not a family of scalable `MaxN` algorithms.  No new capacity preset was added. |
| `maxFilters: 10` in the research runner default | Acceptable diagnostic baseline | The default is one small baseline sample.  Explicit capacity probes are no longer restricted to 20/40, and the default does not imply a product mode. |
| Research profile/deep telemetry selection | Acceptable measurement policy | Deep profiling is attached to the selected baseline cell through the cell key; it no longer branches on a literal `maxFilters === 10` condition. |
| Former research CLI `20/40` allowlist | Suspicious, removed | `--capacity` now accepts arbitrary positive safe integer probes, rejects malformed/duplicate values, and retains deterministic ordering. |
| Former ladder default `[10, 15, 20]` | Suspicious, refactored | The default is now a small derived sample of the base, first natural growth point, and product ceiling.  Explicit `--capacity` remains the caller's choice. |
| Former standalone matrix arrays `[5, 15, 60]` and `[10, 15, 20]` | Suspicious, refactored | The script now accepts caller-selected case, deadline, and capacity lists.  Its defaults are a small smoke set (one envelope per approved case), and its time/capacity views are separate rather than a complete Cartesian matrix. |
| Overnight tables and filenames containing `Max10`, `Max15`, or `Max20` | Acceptable historical/reporting labels | These preserve prior evidence and identify the sampled experimental envelope.  They are not runtime policy and are not used to select an algorithm. |
| Legacy design-spec examples mentioning `20/40` | Acceptable historical documentation, follow-up candidate | The old specification remains immutable in this bounded change and has no runtime authority.  New research documentation must not present those values as an allowlist. |

No production/search code was found to select a different algorithm for
`maxFilters === 15`, `20`, `30`, or `40`.  Capacity-dependent behavior that is
mathematical or state-dependent (current capacity, remaining headroom, effort,
or filter count) remains distinct from named capacity modes.

## Scheduler model

The current controller can be understood as maintaining this state:

- current capacity and requested ceiling;
- effort level and stage index;
- consecutive no-improvement count;
- reseed cursor and whether diversification used removal/reseed;
- incumbent filters and its normalized violation/RMSE/max-absolute metrics;
- elapsed/deadline state exposed by the deadline callback.

Its conceptual actions are `deepen`, `widen`, `polish`, `diversify`,
`expand capacity`, and `continue current regime`.  Today those actions are
implemented by the existing fixed stage policy: effort configuration expands
at a capacity, geometric capacity expansion resets effort while headroom
exists, and removal reseeds become eligible after stagnation at the ceiling.
This description is explanatory; no new adaptive heuristic is being added.

The actual future question is therefore:

> Given remaining compute and a capacity ceiling, should the next unit of work
> deepen the current structural search or open additional degrees of freedom?

Signals already available include incumbent improvements, candidate and
incumbent violation, effort level, current capacity relative to the ceiling,
filter count, no-improvement count, reseed history, seed strategy, and stage
timing/deadline state.  Signals that are missing or only indirectly available
include deterministic evaluations/work count, proposal exhaustion, residual
structure/features, marginal improvement per unit of work, action-specific
cost, memory/parallelism pressure, and a full diversification history.  Those
gaps explain why a sophisticated adaptive scheduler is not claimed here.

## Validation tiers and sampling

The benchmark plan is deliberately tiered rather than a capacity × time × case
Cartesian product:

1. **Tier 1 — deterministic invariants (every relevant change).**  Use mocked
   lower-level search and controlled deadlines.  Exercise generated maxima
   cheaply, including lower-than-base and irregular values, and assert bounds,
   strict progression, termination, repeatability, and incumbent preservation.
2. **Tier 2 — short real-FR smoke runs.**  Run only a few approved cases and
   envelope samples: a small/base anchor, an intermediate natural progression
   anchor, the ceiling, and an occasional irregular probe.  These detect broad
   regressions; they are not monotonicity proofs.
3. **Tier 3 — long research runs.**  Run 60-second (or longer) cells only for
   a concrete scheduler hypothesis.  Choose capacities and cases relevant to
   that hypothesis, use declared repeats/seeds, and report the actions and
   work consumed.  Do not run the complete Cartesian product.
4. **Tier 4 — occasional broad validation.**  Before a major architectural
   conclusion, use a sparse, explicitly recorded sample and repeat design.
   Treat its results as empirical evidence, not an invariant.

Per-commit checks use a small representative set.  A research experiment
supplies only the capacities relevant to its question.  The historical matrix
probe accepts explicit lists when a focused comparison is useful, but does not
silently expand them across every dimension.  Periodic sweeps can
sample values near the controller's natural geometric progression, while
deterministic irregular probes (for example, generated values not on that
progression) test for hidden assumptions.  The values are sampling choices,
not permanent product magic numbers; callers can request any supported ceiling
without adding a mode or benchmark family.

The scalable ladder harness defaults to the derived anchor sample and accepts
an explicit comma-separated `--capacity` list.  The research runner keeps one
baseline diagnostic cell by default and adds only explicit capacity probes.
The historical matrix probe accepts `--case`, `--budget`/`--budget-seconds`,
and `--capacity`/`--max-filters`; its default is a small smoke set with one
envelope per approved case, while
caller-selected lists support focused time and capacity views.  None of these
CLI values selects a different search algorithm.

## Reinterpretation of RSV, Mystic, and S12 evidence

The overnight report's `Max10`, `Max15`, and `Max20` labels are retained as
historical sample-point labels only.  Under the resource-envelope framing:

- In the controlled short RSV traces, the lower ceiling spent successive
  stages at capacity 10 while increasing effort; the larger-ceiling trace
  opened capacity after the first stage and reset effort.  The trajectories
  therefore consumed the same wall-clock budget through different action
  schedules.  This is non-nested resource allocation, not evidence that a
  named ceiling is intrinsically good or bad.
- The seeded counterfactual preserved and slightly improved its incumbent
  under the existing comparator.  This supports incumbent preservation as a
  controller property; it does not show that extra capacity is always useful.
- The repeated 60-second RSV observations varied materially across independent
  runs (the report records, for the three sampled ceilings, baseline
  violations `2.037639 / 1.517708 / 0.889446` and repeat violations
  `1.968780 / 5.980341 / 1.685790`).  The large run-to-run spread, especially
  on the intermediate sample, is evidence about search-path variance and
  schedule allocation, not a stable capacity ranking.
- The Mystic and S12 control rows likewise contain reversals across sampled
  ceilings.  They reinforce that equal-wall-clock independent runs are noisy
  and non-nested; they do not justify a capacity-specific policy.

Negative findings remain important: no maturation-before-promotion heuristic
was implemented, no quality comparator was changed, no exhaustive capacity
monotonicity claim was made, and the evidence does not establish a causal
regression attributable to any one ceiling.  Future reports should state the
resource schedule, actions, work consumed, and variance before interpreting a
quality difference.

## Recommended next experiment

Test one generic scheduler hypothesis without naming capacity modes:

> For a fixed `{ deadline, maxFilters }` envelope, recording deterministic work
> and marginal incumbent gain can identify whether the next unit of work should
> continue the current effort regime or expand capacity; a gain-per-work gate
> may reduce trajectory variance without making maximum capacity an objective.

Use the current scheduler as the control, add only instrumentation for action
and work accounting, and compare the two schedules on a small set of generated
anchors plus irregular probes with repeated controlled seeds.  The experiment
should first measure proposal exhaustion, marginal gain, and variance.  It must
not tune a named ceiling, introduce a preset, or claim monotonicity from a
single wall-clock run.  Only after those measurements should a bounded heuristic
be considered.

## Decision-oracle experiment (2026-09-13)

The research-only harness is `packages/core/src/autoeq/v2/decisionOracle.ts`,
with the sparse real-FR probe in
`packages/core/benchmarks/research/decisionOracle.ts`.  The probe uses the
approved manual-regression fixtures for RSV, Mystic 8, and S12 Ultra.  It does
a warmup (three controlled invocations for the RSV saturation sample, one for
the other samples), captures the resulting state, and then
branches that state into one deepen and one expand continuation.  Both arms
receive one structural-search invocation and a 100 ms deadline quantum.  The
irregular requested ceiling is 17, so the expansion arm moves from 10 to 15
through the generic progression rather than a named capacity path.

### Snapshot semantics and fairness

The cloned search state contains the prepared target and evaluation grid,
sample rate, base structural-search configuration, incumbent filters and
quality, current/requested maximum capacity, effort level, consecutive
no-improvement count, recent gain history, cumulative raw `SearchWorkDelta`,
and remaining decision quantum.  Telemetry-only fields are carried for
analysis but do not choose an action.  Each arm receives a fresh filter clone;
the comparator guard keeps the starting incumbent when a candidate is worse.

Structural-search invocation count and the per-invocation deadline are the
fairness boundary.  Proposal/beam/polish/phase counters remain unweighted raw
dimensions.  They can differ because capacity and effort are the action under
test; those differences are reported rather than hidden in a compute score.

### Paired results

The table uses `i/g/p/a/l/d/r/pa/c/rs` for invocations, beam generations,
proposals generated/admitted/polished, duplicates, rescue, pair-add,
cap-swap, and reseed attempts.  Values are normalized-violation gains; the
oracle reports the full quality keys, relative gains, elapsed time, and
cumulative work in JSONL.

| Case (warmup) | Repeat | State class | Start V | Deepen gain / raw work | Expand gain / raw work | Preference |
| --- | ---: | --- | ---: | --- | --- | --- |
| RSV (3×100 ms) | 0 | saturating | 6.672 | 0.000 / `i1/g1/p8/a8/l7/d0/r0/pa0/c0/rs0` | 0.000 / `i1/g2/p27/a24/l17/d8/r0/pa0/c0/rs0` | tied |
| RSV (3×100 ms) | 1 | saturating | 6.672 | 0.000 / `i1/g2/p16/a16/l9/d0/r0/pa0/c0/rs0` | 0.000 / `i1/g2/p27/a24/l17/d8/r0/pa0/c0/rs0` | tied |
| Mystic 8 (1×100 ms) | 0 | productive current regime | 10.891 | 0.149 / `i1/g2/p17/a17/l17/d0/r0/pa0/c0/rs0` | 0.129 / `i1/g3/p31/a23/l16/d0/r0/pa0/c0/rs0` | deepen |
| Mystic 8 (1×100 ms) | 1 | productive current regime | 10.891 | 0.149 / `i1/g2/p17/a17/l17/d0/r0/pa0/c0/rs0` | 0.158 / `i1/g3/p31/a23/l19/d0/r0/pa0/c0/rs0` | tied |
| S12 Ultra (1×100 ms) | 0 | expansion-friendly | 12.368 | 2.163 / `i1/g2/p27/a24/l12/d0/r0/pa0/c0/rs0` | 3.357 / `i1/g2/p27/a16/l10/d0/r0/pa0/c0/rs0` | expand |
| S12 Ultra (1×100 ms) | 1 | productive current regime | 12.368 | 2.163 / `i1/g2/p27/a24/l12/d0/r0/pa0/c0/rs0` | 2.163 / `i1/g2/p27/a16/l8/d0/r0/pa0/c0/rs0` | tied |

The state class is descriptive: “saturating” means the latest warmup gain was
at or below the report-only 0.05 normalized-violation threshold; an
“expansion-friendly” label means expansion won that paired sample.  The
preference threshold is a report-only 0.01 gain difference.  No row was
inconclusive on invocation budget: both arms observed `i1`; mismatched raw
dimensions are shown in the JSONL evidence and are not treated as equivalent
work.

### Variance and candidate signals

RSV's saturated state was stable: both repeats were effectively tied despite
the expand arm generating more proposals.  Mystic 8 was near the boundary:
one repeat slightly favored deepen and the other was tied.  S12 Ultra produced
the clearest expansion opportunity (expand won once and tied once), but the
quality gain and polished-count path still varied.  These reversals are why a
single wall-clock trajectory is not a scheduler rule.

The smallest state subset supported by these probes is (1) capacity headroom,
(2) the most recent same-capacity marginal gain rather than cumulative quality,
and (3) a residual/opportunity indicator such as proposal exhaustion or
unresolved structural error.  Filter count, effort level, and elapsed time
remain useful context but are not independently predictive in this sparse
sample.  Raw invocation equality is a validity gate; it is not a predictive
feature.

### Falsifiable scheduler hypothesis

> When capacity headroom exists, expand after the current-capacity marginal
> gain has diminished over the invested controlled work **unless** the current
> residual/opportunity signal is still clearly productive; otherwise deepen.

The next package should operationalize exactly one measurable definition of
“diminished” and “clearly productive,” then compare that intervention with the
current fixed controller.  This package does not make that production choice.

### Limitations

The warmup states are explicit one- or three-invocation snapshots rather than
full controller checkpoints, and action-specific effort/capacity settings
produce unequal proposal and polish counts.  The 100 ms probes are short and
the real structural path has wall-clock variance; two repeats are enough to
expose the Mystic/S12 boundary reversal but not to estimate a population
effect.  No third diversification arm, comparator change, quality-weight
tuning, or named capacity mode was introduced.

## First adaptive scheduler intervention (2026-09-13)

### Policy and parameters

The first intervention is selectable only through the internal
`ScalableStructuralSearchInput.schedulerPolicy` field.  The omitted/default
value is `legacy`, which retains the existing geometric capacity progression;
`adaptive-resource` is the research arm.  No product caller selects the
adaptive arm by default.

The adaptive decision is deliberately one rule over generic resource state:

1. If there is no capacity headroom, continue the current regime and report
   `no-capacity-headroom`.
2. If a remaining-budget callback is supplied and less than one current
   quantum plus one follow-up quantum remains, continue and report
   `insufficient-time-reserve`.
3. If the latest same-regime normalized-violation gain is at least `0.05`,
   continue and report `productive-current-regime`.
4. If fewer than `2` structural-search invocations (or stages) have been
   invested since the last meaningful gain, continue and report
   `insufficient-work-to-judge`.
5. Otherwise expand through `nextScalableCapacity` and report
   `stagnated-with-headroom`.

The predeclared central parameters are `minimumInvocationsBeforeExpansion=2`,
`meaningfulGainThreshold=0.05`, and `followUpQuanta=1`.  One scheduler quantum
is the existing stage work boundary.  The research runner uses a 100 ms quantum
for a short probe; its reserve is therefore 200 ms.  This quantum override is a
research control, not a named capacity mode.  Raw work counters remain
unweighted.  Regime-local work/gain counters reset when capacity expands.

### Validation boundary

The adaptive policy is covered by injected deterministic tests for productive
current-regime work, insufficient work, stagnation, headroom, reserve,
arbitrary ceilings, comparator preservation, legacy equivalence, and repeated
runs.  The comparison harness is
`packages/core/benchmarks/research/adaptiveSchedulerComparison.ts`.  It emits
one compact JSONL record per run and one summary per policy/envelope, including
quality keys, RMSE, max-absolute error, filter count, action traces with
capacity/effort/reason, raw work dimensions, regime-local work, gains, elapsed
runtime, and deadline use.

### Sparse repeated design

A single generic envelope was selected before looking at results: ceiling `17`,
1,000 ms total budget, and 100 ms stage quantum.  Ceiling 17 is irregular with
respect to the product ceiling and exercises generic progression (`10 -> 15 ->
17`) without introducing a capacity-specific path.  All three approved,
sanitary manual-regression cases were run: RSV, Mystic 8, and S12 Ultra.  The
repeat count was predeclared as `3` (the harness accepts only 3–5), giving six
runs per case: three unchanged legacy controls and three adaptive runs.  This
is a sparse case/envelope comparison, not a capacity/time Cartesian sweep.

Command:

```text
pnpm --filter @autoeq-workbench/core exec tsx benchmarks/research/adaptiveSchedulerComparison.ts --capacity 17 --budget-ms 1000 --stage-ms 100 --repeats 3 --jsonl
```

The command exited `0` and emitted 25 JSONL records (18 runs, 6 summaries,
and one completion record).  Every run used ten structural-search invocations
and reached the one-second deadline; small elapsed overages are normal
process/deadline-check overhead.

### Paired distributions

Values below are normalized structural violation; lower is better.  `best`,
`median`, `worst`, and `spread` are across the three declared repeats.

| Case | Policy | Violation best | Median | Worst | Spread | RMSE median | maxAbs median | Filters median | Expansions median | Deepens median | Explore median | Reseeds median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RSV | legacy | 5.791 | 5.810 | 6.507 | 0.716 | 1.435 | 4.357 | 7 | 2 | 7 | 1 | 0 |
| RSV | adaptive-resource | 5.994 | 6.150 | 6.157 | 0.163 | 1.537 | 4.612 | 7 | 1 | 7 | 2 | 0 |
| Mystic 8 | legacy | 6.700 | 9.958 | 9.960 | 3.260 | 2.488 | 7.469 | 7 | 2 | 7 | 1 | 0 |
| Mystic 8 | adaptive-resource | 9.960 | 9.960 | 10.688 | 0.728 | 2.489 | 7.470 | 7 | 1 | 7 | 2 | 0 |
| S12 Ultra | legacy | 5.374 | 5.713 | 5.713 | 0.340 | 1.428 | 4.282 | 9 | 2 | 6 | 1 | 1 |
| S12 Ultra | adaptive-resource | 5.212 | 5.402 | 5.402 | 0.190 | 1.264 | 4.052 | 10 | 0 | 9 | 1 | 0 |

The legacy control's first two stages expand immediately (`10 -> 15 -> 17`),
then deepen at the ceiling.  Adaptive generally spends additional quanta at
the current capacity before expansion.  RSV adaptive expanded once (versus
legacy twice) and had a worse median violation by `0.340`, but its spread was
smaller by `0.553`.  Mystic adaptive likewise expanded once (versus twice), was
effectively tied at the median (`+0.002` violation), and substantially reduced
spread (`0.728` versus `3.260`), while its best run was worse.  S12 adaptive
never expanded in these repeats, spent nine deepens at the base capacity, and
improved median violation by `0.311` while reducing spread by `0.150`.  The
result is mixed: lower variance did not imply uniformly better quality.

### Work allocation

Each policy consumed a median of ten structural invocations.  Median raw work
(`proposalsGenerated / proposalsAdmitted / proposalsPolished`) was:

| Case | Legacy | Adaptive | Allocation change |
| --- | ---: | ---: | --- |
| RSV | `181 / 171 / 130` | `222 / 199 / 138` | More proposals and polishing while deepening; one fewer expansion |
| Mystic 8 | `246 / 189 / 119` | `273 / 205 / 125` | More proposals/admissions/polishing; one fewer expansion |
| S12 Ultra | `264 / 210 / 96` | `214 / 205 / 96` | Fewer generated proposals; no expansion and more deepening |

Other median raw counters remained small in this probe: duplicate states were
`5/4/4` (legacy/adaptive) for RSV, `5/5/5` for Mystic, and `4/4/4` for S12;
rescue, pair-add, and cap-swap attempts were zero.  Legacy S12 used one median
reseed attempt; adaptive used none.  These are raw dimensions, not a combined
compute score.  Full per-run work and trace records preserve all ten counters.

### Decision traces and oracle agreement

Adaptive decisions were explainable on every stage.  Across cases the common
trace was `insufficient-work-to-judge` at a new capacity, followed by
`productive-current-regime` when the latest gain cleared 0.05, then either
additional deepening while evidence accumulated or `stagnated-with-headroom`
when two invocations had produced little gain.  Near the deadline the reserve
reason prevented a new expansion.  At ceiling 17, all later decisions were
`no-capacity-headroom`; existing reseed behavior remained available but was
never selected by the adaptive policy in the median traces.

The earlier paired oracle found RSV effectively tied, Mystic 8 deepen/tie, and
S12 Ultra expand/tie.  The adaptive traces agree with the RSV saturation result
in not claiming expansion benefit, and they agree with the Mystic evidence in
retaining current-regime work initially.  They disagree with the S12 expansion
opportunity: the adaptive gate kept deepening at capacity 10, yet S12 quality
was better in this short sample.  This disagreement is useful evidence that the
one-snapshot oracle is noisy and that the 0.05 gain gate is not a sufficient
opportunity model.  No oracle outcome was promoted to a golden assertion.

### Decision and limitations

Classification: **mixed; keep `adaptive-resource` experimental**.  The policy
reduced action/path variance in these runs and improved the S12 median, but
regressed RSV and did not improve Mystic's central tendency.  It is not
recommended for broader product adoption or as the default scheduler yet.

This experiment does not establish a causal quality advantage.  It uses one
short envelope, three repeats, a 100 ms stage quantum, and independent search
trajectories rather than paired identical random streams.  The structural
search's proposal and polish counts differ by action, so invocation equality is
the fairness boundary and raw counter mismatches are reported explicitly.  A
remaining-time reserve is unavailable to callers that do not provide the
optional callback.  The policy uses marginal normalized-violation gain only;
it has no residual-shape or proposal-exhaustion model.  The report therefore
supports one falsifiable next experiment, not a scheduler rule for production.

## Capacity-pressure instrumentation (2026-09-13)

### Suppression architecture

The instrumentation observes only existing capacity predicates in
`packages/core/src/autoeq/v2/structuralSearch.ts`:

1. The beam mutation generator's `current.length < bounds.maxFilters` gate
   skips additive PK/shelf paths at a full parent. The split path has the same
   capacity predicate. The trace records one **additive mutation gate blocked
   by capacity** per full parent whose existing mutation pass reaches that
   gate; it does not construct or score the skipped proposal.
2. The rescue loop requires `rescued.filters.length < config.maxFilters`. When
   its existing step/error conditions hold but the filter count is full, the
   phase-end trace records one **rescue add gate blocked by capacity**.
3. Pair-add requires `rescued.filters.length <= config.maxFilters - 2`. When
   its existing error condition holds but fewer than two slots remain, the
   phase-end trace records one **pair-add gate blocked by capacity**.

No duplicate, invalid-bounds, gain/Q, quality, shortlist/proposal-limit,
pruning, beam-retention, or comparator rejection contributes to these fields.
Cap-swap/recycle phases are replacement work, not additive capacity suppression,
and are intentionally excluded.

### Measurement semantics and neutrality

`CapacityPressureDelta` carries four unweighted raw fields:

- `additiveProposalsGenerated`: actual additive proposals already constructed
  by the beam mutation path (an available-work numerator/context, not a
  quality claim);
- `additiveMutationGatesBlockedByCapacity`: full-parent beam gates reached;
- `rescueAddGatesBlockedByCapacity`: full-filter rescue gates reached; and
- `pairAddGatesBlockedByCapacity`: pair-add gates reached with fewer than two
  slots available.

The blocked fields count reached gates rather than hypothetical candidates;
the suppressed candidates are deliberately unscored. Consequently no ratio or
weighted pressure score is reported. A caller that forms a future ratio must
retain these raw fields and define a denominator for the exact gate population.

The counters are produced solely while executing existing branches, then
copied through `ScalableSearchStage.capacityPressure`,
`cumulativeCapacityPressure`, and `SchedulerDecisionSnapshot.capacityPressure`.
They are never read by the legacy or adaptive scheduler, comparator, admission,
or beam logic. Deterministic observer/no-observer testing produced identical
search results; the instrumentation does not call the deadline callback or
construct blocked candidate state.

### Sparse paired evidence

Predeclared probe: RSV, Mystic 8, and S12 Ultra; requested irregular ceiling
17; current capacity 10; one 250 ms warmup and two paired 250 ms repeats.
Both arms began from the same cloned snapshot and received one structural
search invocation. Raw output was recorded locally at
`packages/core/.research-artifacts/capacity-pressure-20260913/paired-oracle.jsonl`.

| Case | Recent gain | Residual extrema / max dB | Filters / capacity | Generated additive proposals | Blocked beam / rescue / pair | Oracle outcome |
| --- | ---: | --- | --- | ---: | --- | --- |
| RSV | 2.628 | 13 / 4.895 | 4 / 10 (ceiling 17) | 27 | 0 / 0 / 0 | tie (both repeats) |
| Mystic 8 | 3.046 | 18 / 7.638 | 5 / 10 (ceiling 17) | 29 | 0 / 0 / 0 | tie (both repeats) |
| S12 Ultra | 21.805 | 37 / 6.274 | 6 / 10 (ceiling 17) | 42 | 0 / 0 / 0 | tie (both repeats) |

This sample does distinguish residual from capacity pressure: S12 has the
largest residual signal but no capacity-blocked additive gate, because four
filter slots remained within the current capacity. RSV and Mystic likewise
had high residual structure and no observed current-capacity suppression.
However it does **not** establish that pressure predicts expand value: every
paired outcome was tied under this declared probe, and pressure was zero in
every snapshot. This is a weak/inconclusive result, not a scheduler input.

### Limitations and next experiment

A blocked gate says only that an additive path was suppressed; it cannot say
that its unbuilt candidate would have improved the incumbent. The sparse
states also did not reach the current capacity, so they cannot test separation
among nonzero pressure values. Do not add a shadow evaluation yet: first run
one additional predeclared paired snapshot protocol that deliberately records
states after the existing controller reaches its current capacity while keeping
its paired action boundary unchanged. If nonzero raw gate counts still fail to
separate outcomes, reject raw pressure and only then consider a separately
budgeted research-only shadow candidate evaluation.

## Full-current-capacity decision-state experiment (2026-09-13)

### Protocol

`benchmarks/research/fullCapacityDecisionStates.ts` runs the unchanged legacy
scalable controller over the predeclared RSV, Mystic 8, and S12 Ultra cases
with irregular maximum capacity 17. It records every existing `onStage` event,
including a cloned pre-action incumbent. A natural snapshot would be selected
at the first stage whose incumbent is full or whose raw blocked-pressure delta
is nonzero. No such event occurred. The approved fallback therefore cloned the
last live incumbent and set *only the research oracle snapshot's*
`currentCapacity` to its existing filter count. These records are explicitly
`reconstructed-from-live-incumbent`, not live scheduler states; no filters,
residuals, quality, proposals, or comparator values were changed.

### Live utilization

| Case | Live expansions (filter/capacity) | Naturally full/pressured? |
| --- | --- | --- |
| RSV | 0/10, 4/15 | no |
| Mystic 8 | 0/10, 5/15 | no |
| S12 Ultra | 0/10, 5/15 | no |

All six observed live expansion actions occurred below 100% utilization (four
were from an empty incumbent). Naturally full states were zero of the 12 live
stages, and no blocked-add counter was nonzero. Thus the controller's capacity
progression in this sparse trace is stage/time-policy driven rather than a
response to exhausted structural slots. This is a first-class architectural
finding; it is not a behavior defect claim and no scheduler change follows.

### Reconstructed full-state paired evidence

| Case | Full reconstructed filters/capacity | Recent gain | Residual extrema / max dB | Generated additive / blocked beam-rescue-pair | Deepen / expand gain | Outcome |
| --- | --- | ---: | --- | --- | --- | --- |
| RSV | 6 / 6 | 0.000009 | 26 / 4.751 | 13 / 0-0-0 | 0.004987 / 0.003546 | deepen |
| Mystic 8 | 6 / 6 | 0.001859 | 18 / 7.586 | 14 / 0-0-0 | 0.724617 / 0.001859 | deepen |
| S12 Ultra | 9 / 9 | 1.447189 | 21 / 5.509 | 11 / 0-0-0 | 0.082019 / 1.447189 | expand |

Fullness and pressure remain separate: each reconstructed snapshot is 100%
utilized but has zero raw blocked pressure because its source live stage was
not itself full. Consequently this experiment cannot test whether *nonzero*
pressure predicts expansion; it only shows that fullness alone does not do so
(two deepen outcomes and one expand outcome). Shadow evaluation is not
justified: condition (1), naturally saturated/high-pressure states, was not
met. The next experiment, if approved, should extend the live envelope only to
observe first natural saturation—not tune a scheduler or evaluate shadows.

## Search-frontier capacity utilization (2026-09-13)

### Frontier model and coupling audit

Structural trace now records already-existing beam parents, generated proposals,
admitted proposals, and polished candidates: raw maximum filter counts plus
counts at capacity and within one slot. It does not create candidates or copy
candidate populations. Incumbent utilization, this frontier telemetry, and
capacity-pressure gates remain separate fields.

`maxFilters` directly bounds structural additions, split, rescue, and pair-add.
It does not directly set beam width, proposals per parent, or polish budget.
However the oracle's actions are confounded: deepen increments `effortLevel`,
while expand changes capacity **and resets effort to zero**;
`resolveScalableEffortConfig` derives beam width, proposals per parent, and
local polish evaluations from effort. Thus expand/deepen compare structural
allowance plus different search intensity, not slots alone.

### Live expansion frontier evidence

| Case | Live expansion incumbent/capacity | Generated frontier max/capacity | At-capacity generated | Interpretation |
| --- | --- | --- | ---: | --- |
| RSV | 0/10; 3/15 | 3/10; 5/15 | 0; 0 | incumbent low, frontier low |
| Mystic 8 | 0/10; 4/15 | 5/10; 6/15 | 0; 0 | incumbent low, frontier low |
| S12 Ultra | 0/10; 4/15 | 4/10; 7/15 | 0; 0 | incumbent low, frontier low |

All observed expansions remained below both incumbent and generated-frontier
capacity; pressure was zero. The sparse live evidence therefore supports
premature stage progression rather than demonstrated structural exhaustion.

### Paired-arm slot use

From the reconstructed states, deepen/expand generated maxima were RSV 5/7,
Mystic 8/9, and S12 9/11 filters respectively (old capacities 6, 6, 9).
The expand arm did explore candidates above the old capacity in every row, so
its different result cannot be claimed to arise without newly available slots.
It still cannot be attributed solely to slots because the effort-derived beam,
proposal, and polish configuration differs between arms.

**Conclusion:** capacity currently conflates structural degrees of freedom with
search-effort intensity at the decision-oracle action boundary. The single next
experiment should decouple oracle action configuration: hold effort-derived
beam/proposal/polish settings constant while varying only `maxFilters`, then
repeat the same sparse paired probe. No scheduler rule or shadow evaluation is
justified first.

## Factorized structural-capacity and effort oracle (2026-09-13)

A research-only `evaluateConfiguredContinuation(snapshot, { capacity,
effortLevel }, budget)` now evaluates independent resource axes. Legacy
deepen/expand wrappers retain their prior mappings. The three-arm probe uses:
control `{currentCapacity, currentEffort}`, effort-only `{currentCapacity,
effort+1}`, and capacity-only `{nextCapacity, currentEffort}`.

Configuration proof: control and capacity-only have identical effort-derived
`beamWidth`, `proposalsPerParent`, and `localPolishEvaluations`; only
`maxFilters` differs. Control and effort-only retain identical `maxFilters`.
All arms preserve the comparator guard and cloned incumbent.

| Case | Control gain | Effort-only gain | Capacity-only gain | Capacity-only new slot? |
| --- | ---: | ---: | ---: | --- |
| RSV | 0.0000 | 0.0477 | 0.1163 | yes (frontier 6 > old 4) |
| Mystic 8 | 1.4856 | 1.4856 | 2.1775 | yes (frontier 9 > old 8) |
| S12 Ultra | 0.0000 | 0.0000 | 1.3875 | yes (frontier 10 > old 8) |

In this one sparse, reconstructed-state sample, capacity-only exceeds
effort-only and actually consumes newly available slots in all rows. This is
not a scheduler rule: wall-clock search remains variable and the states are
reconstructed. It does establish that previous expand/deepen comparisons were
confounded by the effort reset, while showing independent structural capacity
value under held effort. The next experiment should repeat this exact
factorized protocol from naturally captured live states; production scheduling
should eventually treat structural capacity and search effort as independent
resource axes.
