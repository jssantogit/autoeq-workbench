# AutoEQ V2 integrated resource allocator — natural-state checkpoint

Status: **research checkpoint; no allocator policy adopted** (2026-09-13).

## Protocol and invariant

The controller now emits a cloned, observational pre-decision snapshot.  The
callback neither returns a decision nor participates in legacy/adaptive policy
selection.  A snapshot contains the incumbent, current and maximum capacity,
effort, resolved config, recent gains, work since improvement, incumbent and
frontier utilization, raw capacity pressure, residual telemetry, cumulative
work, and remaining time when exposed.

The predeclared outcome-blind capture rule was: first post-initial state,
first state before a legacy live expansion, first state after an improvement,
and first low-gain state.  The sparse probe used RSV, Mystic 8, and S12 Ultra;
maximum capacity 17; a 1,000 ms live trajectory; 250 ms stage and arm quanta;
and one structural-search invocation per arm.  Its raw JSONL was retained as
a local research artifact, not committed.

Each natural snapshot was cloned into: control (same capacity and effort),
effort-only (+1 effort at same capacity), and capacity-only (next generic
capacity at same effort).  Every arm reports its resolved config, quality,
gain, raw work, frontier utilization, and whether it actually used a filter
count above the pre-action capacity.  No interaction arm was added: the
first-order capacity arm did not use a new structural slot, so an interaction
would not identify a structural-capacity interaction.

## Natural-state observations

The nine captured rows were all natural controller states.  Compact gains
(control / effort / capacity) were:

| Case | Landmark | Capacity | Incumbent utilization | Gains | Interpretation |
| --- | --- | --- | ---: | --- | --- |
| RSV | initial/live-expand | 10/17 | 0.00 | 2.628 / 2.911 / 2.455 | effort slightly best |
| RSV | low gain | 15/17 | 0.13 | 0.901 / 0.929 / 0.967 | near tie |
| RSV | after improvement | 17/17 | 0.24 | 0.118 / 0.305 / 0.118 | effort best |
| Mystic 8 | initial/live-expand | 10/17 | 0.00 | 3.056 / 4.117 / 3.055 | effort best |
| Mystic 8 | low gain | 15/17 | 0.33 | 0.013 / 0.013 / 0.013 | tied |
| Mystic 8 | after improvement | 17/17 | 0.29 | 0.016 / 0.016 / 0.016 | tied |
| S12 Ultra | initial/live-expand | 10/17 | 0.00 | 21.805 / 20.218 / 20.592 | control best |
| S12 Ultra | low gain | 15/17 | 0.40 | 0.635 / 0.635 / 0.408 | control/effort tied |
| S12 Ultra | after improvement | 17/17 | 0.53 | 0.000 / 1.490 / 1.490 | effort/capacity tied at ceiling |

Critically, the capacity-only arm used **no additional structural slot in all
nine rows**.  Its frontier also did not reach a count above the original
capacity.  Consequently an apparent quality difference in that arm is not
evidence that opened structural capacity caused it.  This natural result does
not reproduce the reconstructed-state claim of independent capacity value.

## Gate A and expansion telemetry

Classification: **inconclusive for structural capacity; effort is the only
observed first-order axis with repeatable benefit in this short protocol.**
This is not a production threshold or an effort policy recommendation.

There were six legacy expansions before reaching the 17 ceiling: three from
0/10 utilization and three from 13%, 33%, and 40% utilization at capacity 15.
Thus all six occurred below full incumbent utilization; raw capacity pressure
was zero at every expansion landmark.  Later captured live states remained at
24%, 29%, and 53% incumbent utilization at capacity 17.  The observed
frontier did not use newly opened slots.  The descriptive evidence supports
the established hypothesis that legacy expansion is stage-progress-driven,
not a response to structural fullness; it does not establish a universal
utilization threshold.

## Architecture and decision

Packages 1, 2, 4, 6, 8, and 9 completed as research instrumentation/evidence
work.  Package 3 was correctly skipped.  Packages 5, 7, and 10--13 are not
entered: Gate A does not justify an independent-axis controller refactor or
allocator intervention.  Existing `adaptive-resource` remains historical,
research-selectable work and is not promoted.  Legacy remains the default and
its capacity/effort/reset sequence is unchanged.

Packages 14--16 remain open.  In particular, this short 17-capacity probe is
not a 64-capacity observability study, a time-scaling study, or broader-corpus
generalization evidence.  No comparator, Standard-v1 behavior, quantization,
or frontend behavior changed.

## Recommendation and next falsifiable experiment

Model structural capacity and effort as *measurable candidate resources* in
research telemetry, but do not yet make structural capacity an independently
allocated scheduler axis.  The highest-value next experiment is a predeclared
longer natural trajectory that captures a state whose capacity-only arm
actually constructs or admits a filter above the old capacity.  It should use
the same cloned-state, equal-invocation boundary and a sparse second budget;
if such states remain absent, record that high ceilings are rarely needed
rather than force a 64-capacity target.
