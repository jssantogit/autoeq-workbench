# AutoEQ V2 natural structural-capacity causality

Status: **research result; no scheduler policy change** (2026-09-13).

## Predeclared protocol

This report keeps earlier reconstructed full-state experiments separate.  All
states below are **natural** pre-decision snapshots from the unchanged legacy
controller.  The local JSONL artifact is
`.research-artifacts/natural-structural-demand-20260913.jsonl`; it is not a
committed corpus fixture.

Exactly two envelopes were used, before this run was inspected:

| Envelope | Live time | Generic ceiling | Stage / arm quantum | Arms |
| --- | ---: | ---: | ---: | --- |
| short-reference | 1,000 ms | 17 | 250 / 250 ms | one invocation each |
| long-natural-search | 10,000 ms | 43 | 250 / 250 ms | one invocation each |

The short envelope preserves the prior reference probe.  The longer envelope
is exactly 10x the live time and uses one irregular generic ceiling (43),
rather than a duration or capacity sweep.  Its purpose was to give the live
trajectory enough time to mature after it reached its ceiling; it is not a
new named capacity mode.

Capture was outcome-blind and retained only the first occurrence of each:
initial state; pre-live-expansion; frontier count greater than incumbent
count; frontier count at the current ceiling; non-zero blocked-capacity
pressure; a ceiling-reaching frontier while headroom remains; and the first
pre-decision state at or after 80% of the envelope.  Non-occurrence is
recorded as absence.  Each capture cloned the live state into control (same
capacity/effort), effort-only (same capacity, effort +1), and capacity-only
(next generic capacity, same effort).  No capacity-only arm reset effort.

## Natural trajectories and time to demand

The short trajectories completed 3--4 stages; the long trajectories completed
33 (RSV), 40 (Mystic 8), and 36 (S12 Ultra).  Long trajectories reached the
43 ceiling by stage 4 (about 1.0--1.4 s), then continued at effort 6 through
the 10 s envelope.

| Case / envelope | first incumbent increase | first frontier growth | high-utilization / pressure / productive capacity |
| --- | --- | --- | --- |
| RSV / 1 s | 265 ms, stage 1, 4 filters | 518 ms, stage 2 (6 vs 5) | not observed |
| Mystic 8 / 1 s | 523 ms, stage 1, 4 | 523 ms, stage 1 (6 vs 4) | not observed |
| S12 Ultra / 1 s | 254 ms, stage 1, 5 | 254 ms, stage 1 (6 vs 5) | not observed |
| RSV / 10 s | 260 ms, stage 1, 5 | 511 ms, stage 2 (6 vs 3) | not observed |
| Mystic 8 / 10 s | 253 ms, stage 1, 4 | 253 ms, stage 1 (6 vs 4) | not observed |
| S12 Ultra / 10 s | 252 ms, stage 1, 6 | 794 ms, stage 3 (11 vs 10) | not observed |

No trajectory produced a frontier at its current ceiling, a non-zero blocked
capacity event, or the newly-slot-relevant landmark.  The largest long-run
frontiers were 17/43 (RSV), 14/43 (Mystic 8), and 15/43 (S12); corresponding
incumbent counts stayed at or below 16, 13, and 14.  Thus structural demand
was not observed even after the longer envelope reached its late-budget
snapshot (about 8.0--8.2 s).

## Factorized causal and actual-slot results

There were 15 natural captures: six short and nine long.  Every capacity-only
arm was **available but unused**: generated, admitted, polished, and final
filter counts all remained at or below the old capacity.  No accepted or
polished candidate exceeded its old ceiling, and no final improvement depended
on a structural state unavailable at that ceiling.  Therefore zero of 15 arms
were `explored` or `productively-used`.

Representative control / effort-only / capacity-only gains (quality-key
improvement) show the descriptive first-order result:

| Natural capture | Control | Effort-only | Capacity-only | label |
| --- | ---: | ---: | ---: | --- |
| RSV, short initial | 2.628 | 2.911 | 2.628 | early effort-dominant |
| RSV, long frontier-growth | 0.003 | 0.055 | 0.051 | early effort-dominant; capacity unused |
| Mystic 8, short initial | 3.057 | 4.331 | 3.057 | early effort-dominant |
| Mystic 8, long late | 0.000 | 0.000 | 0.000 | neither useful |
| S12 Ultra, short frontier-growth | 1.848 | 1.848 | 2.634 | neither useful; capacity unused |
| S12 Ultra, long late | 0.001 | 0.001 | 0.001 | neither useful |

The complete artifact also preserves the less decisive rows and their raw
work.  An effort increment sometimes helped early (notably RSV and Mystic 8)
and exhausted its marginal return by the late states.  It consumed different
raw proposal counts because the deeper resolved configuration changes the
search, but this is not an effort-tuning result.  Capacity-only numerical
differences without a new slot are explicitly not causal capacity evidence.

Gate A is **NO**.  No additional-ceiling check was run, and no interaction arm
was added: neither could answer a first-order structural question when no
capacity-only continuation consumed a new slot.

## Legacy progression counterfactual

The short line made six legacy expansions (two per case), all before a
ceiling-reaching frontier or blocked pressure.  The long line made twelve
expansions (four per case), progressing 10 -> 15 -> 23 -> 35 -> 43 by about
0.8--1.1 s.  Every one preceded observed usable new-slot demand.  No
expansion was followed by observed use of the newly opened range, so elapsed
time from expansion to first such use is **not observed**.  This describes the
recorded trajectory; it does not create a production utilization threshold.

## Complexity sanity

There are no capacity-only material improvements to audit.  Accordingly no
claim is made about Q extrema, gain extrema, cancellation, combined boost, or
quantization sensitivity for a purported capacity benefit.  The existing
oracle still preserves those checks as a future requirement if a productive
new-slot arm appears.

## Architecture decision and final answers

**Gate B outcome 3 — Capacity rarely binding.**  Within these practical
natural envelopes, structural capacity was measurable but was not a binding
resource.  It should remain conceptually distinct from effort in telemetry and
the oracle, but the evidence is insufficient to implement a resource
allocator or dynamic capacity scheduler now.

1. Natural capacity-only value did not appear.
2. No naturally reached stage/resource level produced productive structural
   demand; the long late points were at 8.0--8.2 s after reaching 43 by stage
   4.
3. No new slot caused an improvement: all 15 capacity-only arms were unused.
4. Extra effort was the only repeatable early first-order help, with
   diminishing/no benefit at late states.
5. Legacy expansion preceded observed structural demand in all 18 recorded
   expansions across the two envelopes.
6. Capacity and effort should remain separate architectural concepts for
   observability and causal testing, not allocation policy.
7. There is not enough evidence to implement an allocator now.

Recommendation: retain the natural-state telemetry and factorized oracle;
prioritize effort/search-quality research over dynamic capacity allocation.
The one major next task, if pursued, is a separately predeclared natural
trajectory study on a broader approved synthetic/sanitized corpus, retaining
the same no-sweep causal protocol.
