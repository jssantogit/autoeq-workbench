# AutoEQ Equalized Seed Allocation — Storm Results

## Scope and routing

This is a new Storm-only causal phase following the closed MP reallocation
corrective round. Astra Orchestra routed the specified implementation to Luna
Max. The worker executed the bounded implementation and verification directly;
no Sol or GPT-6 Astra escalation was requested or used. The previous corrective
result remains historical evidence, including the scheduler comparison of 18
versus 120 structural-beam evaluations as **not equalized**.

The hypothesis was: with one frozen seed source, identical Max10 structural
configuration, and exactly equal observed structural-beam candidate work,
does concentrating work on one seed outperform distributing that work over
multiple seeds?

No solver family, production/default behavior, Standard-v1 fixture, holdout,
U12t, Trio, anytime checkpoint, promotion, merge, release, deploy, or publish
was introduced.

## Frozen source and provenance

The pre-arm source was the `matching-pursuit-selection-beam-v2` run in
`packages/core/.research-artifacts/mp-reallocation-corrective-20260909/storm-rerun1/tournament-report.json`.
Its SHA-256 is
`c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351`.
The frozen Oracle Reference Snapshot is
`/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json`,
SHA-256
`0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3`.
The source report does not contain a repository commit field, so the new
artifact records `sourceCommit: null` rather than inventing one. The audited
pre-arm repository commit was `5f252d270be08b2d2180c5bcde8cf5fbb0e5a80b`.

The source yielded ten distinct eligible, Pareto-novel, selected-change seeds.
They were deduplicated by source candidate ID, then frozen and ordered by the
source selection key, semantic key, and seed ID:

| order | seed | selection key | entry canonical RMSE / maxAbs |
| ---: | --- | --- | ---: |
| 1 | `sparse-0007` | `2133,2277,2469,2805,2841,2867,2879` | 2.0409828863 / 6.4471321227 |
| 2 | `sparse-0006` | `2133,2277,2469,2805,2867,2879` | 2.0830202178 / 6.3865182010 |
| 3 | `sparse-0005` | `2277,2469,2805,2867,2879` | 2.2539075106 / 6.3831856382 |
| 4 | `sparse-0004` | `2277,2469,2867,2879` | 2.3644518552 / 8.9074503442 |
| 5 | `sparse-0003` | `2469,2867,2879` | 2.6395014899 / 8.9135205660 |
| 6 | `sparse-0002` | `2469,2879` | 2.7568432481 / 9.7867172616 |
| 7 | `sparse-0001` | `2879` | 3.3551539403 / 19.7496076060 |
| 8 | `sparse-0010` | `909,2037,2133,2277,2469,2697,2805,2841,2867,2879` | 1.6944365617 / 6.0250191462 |
| 9 | `sparse-0009` | `909,2133,2277,2469,2697,2805,2841,2867,2879` | 1.8069840739 / 6.0291594855 |
| 10 | `sparse-0008` | `909,2133,2277,2469,2805,2841,2867,2879` | 1.8938941990 / 6.4471425786 |

The source pool and its ordering are identical inputs to both arms. The
concentrated selector deterministically chose pool entry 1 (`sparse-0007`).

## Common configuration and equalization

Both arms used the unchanged structural beam with:

- beam width 2;
- four proposals per parent;
- Max10;
- local polish allowance 24 evaluations per proposal;
- the existing canonical delivered evaluator and quantization;
- the frozen reference and selector;
- cooperative 60,000 ms deadline/admission semantics.

Observed structural-beam candidate evaluations are the only causal work unit.
Configured polish allowance remains explicit; observed polish work was not
instrumented and is therefore `null` (`polishWorkObservation: not-measured`).

An initial control attempt with target 12 is retained at
`packages/core/.research-artifacts/seed-allocation-equalized-20260909/storm-fixed-work/tournament-report.json`,
SHA-256
`8c8dd52736d4484e9b0284097f93b98f48e3976e1e5a0f145ebee44fb73d2f4d`.
The selected concentrated seed exhausted admissible proposals after 5
observed evaluations, so that attempt is explicitly **not equalized** and
supports no causal claim.

The corrected target was therefore fixed at 5 before the final run. The final
allocation was:

| arm | seed work allocation | observed total |
| --- | --- | ---: |
| concentrated | `sparse-0007`: 5 | 5 |
| distributed | `sparse-0007`: 2; `sparse-0006`: 2; `sparse-0005`: 1 | 5 |

The corrected artifact is
`packages/core/.research-artifacts/seed-allocation-equalized-20260909/storm-fixed-work-target5/tournament-report.json`,
SHA-256
`7db06ec16923954b3ad112225bfbd0d83eaf26cc67ff182bc819acf6446be0e4`.
Its classification is `equalized`, with `causalClaimAllowed: true`.

## Fixed-work outcomes

The selected-best canonical result was identical in both arms:

| arm | canonical RMSE | canonical maxAbs | Directed Reference Regret v1 | referenceImproved | selected-best changes |
| --- | ---: | ---: | ---: | --- | ---: |
| concentrated | 2.0409828863 | 6.4471321227 | 3.1251258508 | false | 0 |
| distributed | 2.0409828863 | 6.4471321227 | 3.1251258508 | false | 0 |

Both arms produced zero Pareto-novel descendants, zero useful seed
improvements, zero reference improvements, and zero selected-best changes.
There was no first useful-improvement evaluation. The best result was the
initial seed evaluation in each allocated run, so `bestResultEvaluation` was
1 and improvement per observed structural evaluation was 0 for both RMSE and
maxAbs.

Per-seed work and outcomes were:

| arm / seed | target / observed | descendants | Pareto-novel | useful improvements | best evaluation |
| --- | ---: | ---: | ---: | ---: | ---: |
| concentrated / `sparse-0007` | 5 / 5 | 4 | 0 | 0 | 1 |
| distributed / `sparse-0007` | 2 / 2 | 1 | 0 | 0 | 1 |
| distributed / `sparse-0006` | 2 / 2 | 1 | 0 | 0 | 1 |
| distributed / `sparse-0005` | 1 / 1 | 0 | 0 | 0 | 1 |

## Interpretation

Because the corrected arms consumed exactly the same five observed structural
candidate evaluations, this is a valid fixed-work comparison for this
configuration and target. The result is practical equivalence: seed diversity
did not explain an improvement within this small equalized budget, and
concentrating work did not improve the selected result either. This is not a
general claim that one allocation strategy always wins.

Both arms remained weak on Storm. Per the interpretation contract, this does
not establish a representation limit. The next recommended scientific
question is whether proposal quality, bounded/dictionary solve quality, or
residual-aware allocation can produce a signal under a separately preallocated
and equally observed-work-controlled experiment.

No anytime or wall-clock comparison was run, so no speed claim is made.

## Implementation, tests, and gates

The implementation adds a project-root-aware Storm runner, frozen seed-pool
and deterministic allocation contracts, strict per-seed observed-work
accounting, aggregate selected-best reporting, and the MP selection-beam
Pareto retention regression. It does not alter candidate admission, canonical
selection, beam traversal, search order, deadline behavior, solver state, or
the metrics used by the preceding scientific campaign.

Focused research validation passed: 27 tests across Matching Pursuit seed
selection, seed allocation, and the Storm artifact runner. The Astra policy
suite passed 15/15 tests when run from the repository root. Root
`pnpm typecheck`, `pnpm build`, `pnpm lint`, and `git diff --check` passed.

Root `pnpm test` completed with 538/540 tests passing. The two failures are the
known frozen Standard-v1 drifts: deterministic mixed-filter parity fixture
values and default-normalization output/schema values. The required
`pnpm --filter @autoeq-workbench/core benchmark` also failed only at the known
`Standard-v1 benchmark drift detected` guard. No fixture or baseline was
changed, and no new focused regression was observed.

Measured facts, corrected telemetry semantics, and known gate failures are
kept distinct above. Remaining blockers are the known Standard-v1 drift and
the limited five-evaluation Storm signal; neither invalidates the equalization
classification. Final Git commit and push provenance is supplied with the
handoff for this report.
