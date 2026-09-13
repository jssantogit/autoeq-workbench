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
