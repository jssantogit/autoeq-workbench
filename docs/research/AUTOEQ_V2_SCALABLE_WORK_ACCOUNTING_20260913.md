# AutoEQ V2 scalable work accounting and marginal-gain telemetry

Status: measurement and scheduler-state research note (2026-09-13)

## Scope and non-decisions

This note records behavior-neutral instrumentation around the existing scalable
structural-search controller.  It does **not** change its stage order,
capacity-growth rule, effort rule, quality comparator, quality weights,
quantization, or product/UI behavior.  A capacity is still only the
`maxFilters` resource-envelope ceiling, not a target or a named mode.

The telemetry answers a narrower question: for each existing controller stage,
what raw deterministic work occurred and what happened to the incumbent?  It
intentionally does not combine counter types into a weighted compute score;
elapsed wall-clock is reported separately.

## Work-accounting audit

| Area | Existing signal | Accounting decision |
| --- | --- | --- |
| Scalable controller | Stage index, capacity, effort, incumbent/reseed seed strategy, and improvement result were already known. | Expose structural-search invocation count, removal-reseed attempts, actual scheduler action, quality snapshots, and cumulative raw totals per stage. |
| Beam search | Existing trace already exposed generation, proposals generated/admitted/polished, duplicate states, and next-state count. | Accumulate generation, generated, admitted, polished, and duplicate counts. |
| Rescue / pair-add / cap-swap | Existing phase trace exposed only accepted steps. | Add behavior-neutral counters for actual candidate-polish attempts.  Accepted steps remain a separate existing trace fact. |
| Proposal generation | Beam mutations were measurable; the rescue-family shortlist generation was not independently counted. | Use beam proposal generation and phase candidate-polish attempts; do not pretend that these are identical. |
| Local polish / filter evaluation | Beam polish call count is measurable. Individual coordinate trials and all filter/metric evaluations inside polish are not available at this boundary. | Report `proposalsPolished` and phase attempts.  Do not add invasive evaluator hooks in this round. |
| Deduplication | Beam trace already records duplicate semantic states. | Accumulate `duplicateStates`; this is a rejection/work signal, not an objective. |
| Capacity expansion | The controller's post-stage branch was implicit. | Emit a generic action label where the existing stage transitions toward more headroom. |

### Deliberately not measured now

The following are either expensive/invasive or ambiguous without changing a
lower-level contract: every filter-response/metric evaluation, coordinate
trials inside every local polish call, rescue candidate generation before its
shortlist, beam retention comparisons, and memory/parallelism pressure.
Their absence is explicit rather than silently represented by a synthetic
score.

## Instrumentation model

`SearchWorkDelta` is an unweighted raw counter record:

```text
structuralSearchInvocations
beamGenerations
proposalsGenerated / proposalsAdmitted / proposalsPolished
duplicateStates
rescueAttempts / pairAddAttempts / capSwapAttempts
reseedAttempts
```

Each `ScalableSearchStage` now contains a delta and monotonic cumulative total,
plus these incumbent measurements using the existing normalized-violation
semantics:

- `qualityBefore`, `candidateQuality`, and `qualityAfter`;
- lexicographic quality keys `[violation, rmseDb, maxAbsDb]` for each point;
- `qualityDelta = qualityBefore - qualityAfter` (zero if the incumbent is not
  replaced); and
- a relative delta only when the before value is nonzero.

The controller action labels describe only branches it already takes:
`explore-current-capacity`, `deepen`, `expand-capacity`, and `reseed`.
There is no artificial `polish` action: local polishing is work performed
inside structural stages, not an independent controller allocation decision.
Likewise rescue/pair-add/cap-swap are counted lower-level work, not falsely
presented as top-level scheduler choices.

## JSONL research output

The existing generic `structuralScalableCapacityLadder` CLI remains
single-envelope/caller-selected.  In JSONL mode it streams, in order:

1. an `envelope` record (case, deadline budget, and capacity ceiling);
2. one `stage` record as each stage completes (action, current capacity,
   effort, seed strategy, quality snapshots/delta, raw work delta and
   cumulative work, and stage/total elapsed wall-clock);
3. a `final` record (filters, RMSE, maxAbs, current quality value/key, total
   deterministic work, elapsed wall-clock, and completed-stage count); then
4. the pre-existing compatibility `cell` and `summary` records.

No predefined capacity matrix is required.  `--case`, `--budget-seconds`, and
`--capacity` remain explicit resource-envelope probes.

## Deterministic coverage

Injected controller tests prove that deltas sum to cumulative totals, counters
are monotonic, an unchanged incumbent has zero gain, an improving incumbent has
positive gain, a removal reseed is represented and counted, arbitrary ceilings
preserve accounting semantics, and identical controlled runs produce identical
stage telemetry.  The structural trace test also proves that phase attempts
can exceed accepted steps.  Harness tests verify streamed envelope/stage/final
order and fields while preserving the controller's input/output behavior.

## Sparse real-FR diagnostic probes

All runs used a six-second deadline and raw approved manual-regression cases.
The selected envelopes were deliberate samples, not modes: RSV at the modest
ceiling 10, RSV at irregular ceiling 17, RSV at supported ceiling 64, Mystic
8 at 17, and S12 Ultra at 64.  Each run completed two stages; the second stage
therefore reached current capacity 15 but not every ceiling.  That boundary is
itself important: a ceiling merely permits later actions; it does not force
the controller to consume it.

| Case / ceiling | Stage action @ current capacity | Work observed | Incumbent delta | Observation |
| --- | --- | --- | ---: | --- |
| RSV / 10 | explore @ 10 | 25 beam generations; 1,078 generated; 615 polished; 8 rescue and 12 pair-add attempts | 2.95070 | Most early improvement came from the first structural stage. |
| RSV / 10 | deepen @ 10 | 3 generations; 161 generated; 92 polished | 0.01973 | Clear near-term diminishing marginal gain after the first stage. |
| RSV / 17 | expand @ 10 | 25 generations; 1,078 generated; 615 polished; 8 rescue and 31 pair-add attempts | 2.96635 | Initial work resembles the modest-ceiling run; the ceiling did not change this current regime. |
| RSV / 17 | expand @ 15 | 4 generations; 244 generated; 64 polished | 0.02149 | Opening the next capacity gave a small immediate improvement in this short sample. |
| RSV / 64 | expand @ 15 | 4 generations; 228 generated; 77 polished | 0.01973 | Same reachable regime as the irregular probe; no evidence here about capacities beyond 15. |
| Mystic 8 / 17 | expand @ 10 | 16 generations; 791 generated; 363 polished; 16 rescue and 96 pair-add attempts | 4.73626 | The initial stage bought substantial gain and substantial pair-add work. |
| Mystic 8 / 17 | expand @ 15 | 4 generations; 206 generated; 62 polished | 2.34031 | Unlike RSV, the next opened regime produced material immediate gain. |
| S12 Ultra / 64 | expand @ 10 | 12 generations; 411 generated; 194 polished; 135 cap-swap attempts | 25.65995 | Early work was dominated by cap-swap attempts yet yielded a large improvement. |
| S12 Ultra / 64 | expand @ 15 | 3 generations; 153 generated; 35 polished | 0.04552 | Strong local saturation signal after the first stage in this sample. |

Final diagnostics were: RSV/10 RMSE 1.54577, maxAbs 4.63798, 8 filters;
RSV/17 RMSE 1.53180, maxAbs 4.62492, 10 filters; RSV/64 RMSE 1.53469,
maxAbs 4.63797, 8 filters; Mystic/17 RMSE 1.66903, maxAbs 5.01870, 13
filters; and S12/64 RMSE 1.18038, maxAbs 3.81888, 13 filters.  Wall-clock was
approximately 6.00 seconds in each run and is not equated with counter work.

### What the probes support—and do not support

The data exposes qualitatively different patterns without inventing an
efficiency scalar: high early work/high gain; low follow-on work/very low gain
(RSV and S12); and a second current-capacity regime with material gain
(Mystic).  It also shows that capacity expansion can have delayed opportunity:
within these budgets, a 64 ceiling had not yet opened capacity beyond 15.

These are single real-time observations, so run-to-run deadline variation and
search-path variation remain relevant.  They do not rank ceilings, tune RSV,
or establish that expansion/diversification is generally superior.  Reseed was
not reached in this sparse set, so its marginal return remains unmeasured.

## Minimal future scheduler state

The smallest evidence-backed state for one next experiment is:

1. **Current capacity and remaining headroom.** Distinguishes whether
   expansion is available; the probes show a large ceiling alone has no effect
   until the controller reaches a new regime.
2. **Stages since incumbent improvement and cumulative raw work since that
   improvement.** Captures repeated stagnation without converting unlike work
   counters into one score.
3. **Recent incumbent quality deltas with their action labels.** Separates the
   RSV/S12 low-gain follow-on pattern from Mystic's useful second stage.
4. **Remaining wall-clock budget.** The product constraint decides whether an
   action has time to realize the opportunity it opens.

Filter count, full diversification history, and detailed residual features are
not recommended for the first experiment: the current evidence does not yet
show that they add a decision-relevant signal beyond these four items.

## One next scheduler experiment (proposal only)

For a fixed `{deadline, maxFilters}` envelope, compare the unchanged controller
with exactly one generic rule: after at least two current-regime stages with no
incumbent improvement, or with only negligible recorded incumbent deltas after
a declared minimum raw-work observation, permit capacity expansion when
headroom and a minimum remaining-time reserve exist.

The state is the four signals above; the only decision changed is whether to
continue the current regime or expand capacity.  Expected benefit: avoid
spending another stage in observed stagnation while retaining headroom for a
new opportunity.  Trade-off: an early expansion can forgo a later useful
deepen stage, as the differing RSV/Mystic patterns warn.

Falsify it with sparse repeated envelopes: choose one case with observed early
saturation and one with useful follow-on gain, plus an irregular ceiling.
Predeclare equal deadlines, repeats, and a minimum remaining-time reserve.
The rule fails if it does not reduce repeated no-gain work without degrading
final current-comparator quality or if it fires where a control's next stage
still gives material incumbent improvement.  No capacity name or policy tree
is needed.
