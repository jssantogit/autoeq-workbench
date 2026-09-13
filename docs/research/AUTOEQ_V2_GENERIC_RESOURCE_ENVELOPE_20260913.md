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
