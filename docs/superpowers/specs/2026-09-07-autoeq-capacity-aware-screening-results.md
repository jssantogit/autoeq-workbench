# AutoEQ Capacity-Aware Solver Screening Results

> Historical blocked endpoint. The directed campaign completed afterward;
> see `2026-09-08-autoeq-capacity-aware-directed-results.md` for the current
> evidence and classification.

Status: blocked pending the existing corrected Oracle campaign evidence.

This document records the Task 11 endpoint on branch
`research/capacity-aware-solver-plan-2026-09-07`. It is a screening decision
record, not a calibration or production-promotion decision.

## Evidence provenance

- Required architectural baseline: `f14b8cd0a44fa05a7313d2b6d9b31ce077f597da`.
- Approved implementation plan baseline: `b6ee1bb6433733bd5346acfecdc20f1abe2ae531`.
- Task 11 implementation: `b8d08606dbc70b0d2444c69cb50a72cf7dcac0f7`.
- High-cap gate follow-up: `87122ac` additionally blocks a `cap-limited`
  classification when an already-present Max64 observation is unresolved.
- Corrected Oracle evidence variable: `AUTOEQ_ORACLE_EVIDENCE_DIR` was not
  set in the execution environment. The required corrected campaign root was
  therefore not available.
- Generated blocked report:
  `.research-artifacts/capacity-aware/case-study/capacity-study-report.json`
- Generated report SHA-256:
  `d5f301cda251ec8c5ea963f1dd608cd16e14a14fd726db944ea1b024c4537f1f`.
- Snapshot content hash: unavailable. No Oracle campaign was rerun.

The report explicitly contains these blockers:

1. `oracle-reference-snapshot-unavailable`;
2. `python-fixed-cap-study-not-run` because canonical problem/evidence inputs
   are unavailable;
3. `teacher-compression-study-not-run` because canonical high-cap teacher
   inputs are unavailable.

No numeric result below is inferred from synthetic tests or from an
unavailable campaign.

## Declared study matrix

The implementation freezes the directed case study to:

| Dimension | Declared values |
| --- | --- |
| Cases | `titan-to-storm`, `titan-to-u12t`, `titan-to-trio` |
| Python budgets | `2000`, `10000`, `50000` evaluations |
| Python seeds | `11`, `29`, `47`, `71`, `101` |
| TypeScript policies | `resumable-beam-v1`, `state-bank-v1` |
| Product study capacity | Max10 |
| Teacher/probe capacities | Max20, Max40 |
| High-cap sanity capacities | Max40, Max64 |

Python wall-clock is not compared with Node/TypeScript runtime timing. The
future runtime tournament, if evidence permits it, remains Node/TypeScript at
5, 15, 30, and 60 seconds with Max10 only.

## Max10/20/40/64 evidence table

All four capacity columns are intentionally explicit. `N/A` means that no
canonical delivered result exists in the available evidence; it is not a
zero, an estimate, or a failed solver result.

| Case | Capacity | Canonical delivered RMSE | Canonical delivered maxAbs | Actual delivered count | Raw delta vs Max10 | Pareto/reference relationship | Reference state | Provenance/config/hash | High-cap solvability |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Storm | 10 | N/A | N/A | N/A | N/A | N/A | unavailable | snapshot unavailable | insufficient-evidence |
| Storm | 20 | N/A | N/A | N/A | N/A | N/A | unavailable | teacher evidence unavailable | not evaluated |
| Storm | 40 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; blocks `cap-limited` |
| Storm | 64 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; diagnostic only |
| U12t | 10 | N/A | N/A | N/A | N/A | N/A | unavailable | snapshot unavailable | insufficient-evidence |
| U12t | 20 | N/A | N/A | N/A | N/A | N/A | unavailable | teacher evidence unavailable | not evaluated |
| U12t | 40 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; blocks `cap-limited` |
| U12t | 64 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; diagnostic only |
| Trio | 10 | N/A | N/A | N/A | N/A | N/A | unavailable | snapshot unavailable | insufficient-evidence |
| Trio | 20 | N/A | N/A | N/A | N/A | N/A | unavailable | teacher evidence unavailable | not evaluated |
| Trio | 40 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; blocks `cap-limited` |
| Trio | 64 | N/A | N/A | N/A | N/A | not-compared | unavailable | reference cell unavailable | insufficient-evidence; diagnostic only |

The Task 11 report records Max40 and Max64 observations for every case, even
when the snapshot is absent. An available snapshot cell alone would still not
prove high-cap solvability: the gate requires an explicit, stable,
canonical-delivered resolution conclusion. A moving or unresolved Max40/64
reference blocks a strong `cap-limited` interpretation. Max64 is an offline
sanity check and is not a runtime product configuration.

## Task 11 classification inputs and outputs

The exact conservative inputs emitted for each case are equivalent:

```text
max10_reference_state = unavailable / not established
high_cap_reference_state = unavailable / not established
high_cap_check.conclusion = insufficient-evidence
high_cap_check.blocks_cap_limited = true
high_cap_strict_advantage = false
max10_reference_improved_by_compression = false
max10_reference_improved_by_fixed_cap_search = false
all_official_teachers_attempted = false
compression_attempt_count = 0
```

The recorded fallback output is `capacity-suspected` for Storm, U12t, and
Trio. This is an evidence-blocked provisional classification, not evidence
that the cases are capacity-limited. In particular, no case receives the
strong `cap-limited` classification and no high-cap failure is hidden behind
that label.

The classifier has no new numerical “strong” threshold. Strict advantage is
computed only from existing Pareto dominance over raw canonical RMSE/maxAbs;
any later claim of material advantage must include the raw deltas.

## Mechanism screen and shortlist

No mechanism passed the Task 12 shortlist rule because no canonical case
matrix was available. The shortlist is therefore empty.

The following mechanisms remain implemented as research-lab components but
are not evidence-backed survivors:

- resumable refinement + separate state bank;
- sparse matching pursuit + teacher compression;
- structural beam.

Python wall-clock, teacher imitation quality, continuous-only solutions, and
synthetic fixture wins are not used to promote a mechanism. Hybrids are not
opened without component evidence.

## Conditional and downstream work

Tasks 13A and 13B are skipped because the shortlist is empty. No matching
pursuit or structural beam TypeScript port files are created. The skip is
recorded with a null Task 12 evidence hash in the execution log generated for
the research output directory.

The same-runtime Node/TypeScript tournament is not run: there are no Task 12
survivors to register, and no Max10 canonical adversarial artifacts exist.
Max20/40/64 do not enter that tournament regardless of future evidence.

No Calibration Manifest is created. The calibration decision remains
`insufficient` until same-runtime canonical development/adversarial evidence
exists and passes the existing strict non-vacuous gate. Holdout inspection,
promotion, deployment, merge, release, and publish remain unopened.

## Safety invariants

This screening endpoint changes research-lab code and documentation only. It
does not change the production/default cap, React UI, session or export
behavior, Standard AutoEQ v1, or the production runner. The existing
canonical-delivery path, cancellation/deadline contracts, deterministic
ordering, and monotonic best-so-far contracts are tested independently of the
missing Oracle evidence.
