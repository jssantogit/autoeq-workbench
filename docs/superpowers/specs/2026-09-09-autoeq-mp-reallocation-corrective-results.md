# AutoEQ MP Reallocation Corrective — Storm Results

## Scope and routing

Research-only Storm corrective run from `659ad4ceb272b74bec35e4366b845200b9b86670`,
followed by this accounting-only closeout. The deterministic routing policy
selected Terra Medium orchestration. The active session executed directly
because the collaboration policy forbade delegation; no Luna, Sol, or Astra
escalation occurred. Standard v1, Max10, candidate admission, canonical
selection, beam traversal, search order, deadline behavior, solver state, and
the metrics used for the scientific conclusions were unchanged.

The prior width-two run was **not effectively exercised** in Storm: it ended
with zero beam transitions because retention waited for a completed pass. The
previously reported `762` was **not** pure structural-beam candidate
evaluations; it included MP replacement accounting.

## Artifacts and measured facts

`packages/core/.research-artifacts/mp-reallocation-corrective-20260909/storm-rerun1/tournament-report.json`
has SHA-256 `c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351`.
The rerun beam artifact is `storm-beam-rerun2/tournament-report.json`, SHA-256
`8ab90a4e9db832d9d3e9d35fecdd85b222dfd20551f0adbfbff92170d701f024`.

| Arm | 5 s | 15 s | 30 s | 60 s | regret / ref improved |
| --- | --- | --- | --- | --- | --- |
| MP baseline | 1.576605/5.852472 | 1.347370/6.021387 | same | 1.587142/5.396137 | 0.993223 / false |
| immediate rebase | 1.692284/6.022927 | same | same | same | 1.626853 / false |
| incremental width-2 | 1.694437/6.025019 | same | same | same | 1.635716 / false |
| one-shot MP→structural | 1.576605/5.852472 | 1.350240/6.020622 | 1.581012/5.265902 | same | 0.968701 / false |
| feedback composition | 1.740019/4.765690 | 1.542366/5.036947 | same | same | 0.814120 / false |

The corrected beam recorded two incremental promotions, two transitions, one
alternate parent expanded, zero completed replacement passes, depth two, and
2,348 globally unique selections. It produced 12 Pareto-novel candidates,
2,336 dominated candidates, and zero equivalent-metric candidates. No
reference improvement occurred. Its trace records each parent/descendant,
depth, novelty, and selector transition.

The historical artifact's scheduler accounting remains: one-shot observed 869
MP evaluations, 857 MP replacements, 18 structural-beam evaluations, and zero
state-bank evaluations. Feedback observed 2,726 MP evaluations, 2,715 MP
replacements, 120 structural-beam evaluations, and 112 state-bank evaluations.
Thus MP replacement work is not structural-beam work.

The historical `handoffs=42` field meant **feedback items consumed**, not 42
executed structural handoffs. The old artifact does not separately record the
number that actually executed structural work or the number that produced
descendants, so those values are intentionally not retroactively inferred.
It records 102 descendants, zero selected-global-best improvements, and zero
reference improvements. Its legacy 19 `seedImprovements` and four
`usefulHandoffs` are retained as historical fields only: the old predicate
could count selector tie-breaking between canonically equivalent metrics.

New telemetry names the distinct facts explicitly: `feedbackSeedsConsumed`,
`structuralHandoffsExecuted`, `handoffsProducingDescendants`, and
`usefulHandoffs`. A useful handoff requires at least one descendant that the
frozen selector prefers to its seed **and** whose canonical RMSE/max-absolute
metric pair differs from the seed beyond the canonical epsilon. It may still
be a valid tradeoff rather than a strict dominance relation.

Configured polish allowance remains explicit. The old
`configuredPolishAllowance=432` is a configuration fact; its
`observedPolishWork=0` was not measured and is corrected to **not measured**.
The new metadata emits numeric observed polish work only when the structural
component measures it; otherwise it emits `null`.

## Interpretation

The beam was effectively exercised: retention and promotion were incremental,
an alternate parent generated descendants, and depth exceeded one. Additional
multi-parent traversal did not improve Storm in this configuration; this is not
a representational-limit or general architecture claim.

The scheduler arms are **not equalized** (18 versus 120 observed structural
beam evaluations), so no causal scheduler-quality claim is made. Raw feedback
results are retained only as descriptive evidence. U12t and Trio were not run.

## Validation and next recommendation

Focused research tests now cover: real width-two Pareto retention (two
non-dominated parents survive and a dominated parent is discarded before
selector trimming); unmeasured polish; feedback consumption without structural
execution; canonical-equivalent seed/descendant handling; and the real
feedback-composition metadata path, including MP replacement versus
structural-beam accounting. The root gates and final commit provenance are
recorded below after they run.

## Closeout provenance and gates

This section is updated by the accounting closeout only; it does not replace
the measured Storm results above. No Storm 5/15/30/60 campaign was rerun,
because this change does not modify the scientific execution path. Remaining
scientific blocker: the scheduler ablation is still not equalized (18 versus
120 observed structural-beam evaluations). The next authorized question is a
preallocated structural-only paired phase with equal observed structural work.

Focused validation passed: 21 tests across `anytimeComposition`,
`structuralBeam`, and `capacityTournament`, including the real composition
integration test; the latter also passed in isolated serial execution after its
real-work timeout was made explicit. Root `pnpm typecheck`, `pnpm build`, and
`pnpm lint` passed. `git diff --check` passed.

Root `pnpm test` still failed only on the pre-existing frozen Standard-v1
drifts: `parityFixture.test.ts` deterministic mixed-filter responses and
`runStandardAutoEq.test.ts` default-normalization output/schema. The required
core benchmark also failed with the pre-existing `Standard-v1 benchmark drift
detected` guard. No frozen fixture or benchmark baseline was changed. The
focused accounting tests demonstrate no new regression from this closeout.

Commit provenance: the closeout is committed as
`fix(research): correct MP reallocation telemetry semantics`; no deployment,
merge, release, or scientific rerun occurred.
