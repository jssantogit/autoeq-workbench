# AutoEQ MP Reallocation Corrective — Storm Results

## Scope and routing

Research-only Storm corrective run from `659ad4ceb272b74bec35e4366b845200b9b86670`.
Terra Medium performed routing and review; no worker, Sol, or Astra escalation
occurred. Standard v1, Max10, canonical delivered evaluation, frozen selector,
frozen reference, continuation, and cooperative deadline were unchanged.

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

Scheduler accounting: one-shot observed 869 MP evaluations, 857 MP
replacements, 18 structural-beam evaluations, and zero state-bank evaluations.
Feedback observed 2,726 MP evaluations, 2,715 replacements, 120
structural-beam evaluations, and 112 state-bank evaluations; it had 42
handoffs, 102 descendants, 19 seed improvements, zero selected-global-best
improvements, zero reference improvements, and four useful handoffs.
`usefulHandoff` means at least one seed-improving descendant. Configured polish
allowance was 432; observed polish work was explicitly measured as zero.

## Interpretation

The beam was effectively exercised: retention and promotion were incremental,
an alternate parent generated descendants, and depth exceeded one. Additional
multi-parent traversal did not improve Storm in this configuration; this is not
a representational-limit or general architecture claim.

The scheduler arms are **not equalized** (18 versus 120 observed structural
beam evaluations), so no causal scheduler-quality claim is made. Raw feedback
results are retained only as descriptive evidence. U12t and Trio were not run.

## Validation and next recommendation

Focused matching-pursuit, anytime-composition, and tournament tests passed;
core typecheck passed. The root-wide test/benchmark gates remain to run before
commit. Next work, if authorized, is a preallocated structural-only paired
phase that reaches the same observed structural evaluation target in both arms.
