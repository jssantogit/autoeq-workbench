# AutoEQ MP Reallocation Traversal — Results

## Routing and scope

Terra High was selected by the repository routing policy for the deep optimizer
investigation.  Implementation then used the specified Luna-High-sized work
packet.  No Sol or Astra escalation, holdout, promotion, Calibration Manifest,
merge, release, deploy, or publish occurred.  All work is research-only and
Max10/canonical delivered evaluation/frozen selector/reference remain intact.

## Measured facts — Storm

Source commit: `d5a459e8e642d02b60897686c69a7d7bf415ecc1`.  Snapshot:
`/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json`.
The corrected isolated artifact is
`.research-artifacts/mp-reallocation-20260909/storm-isolated-rerun1/tournament-report.json`
SHA-256 `5f7cca86bc6b30ee8b0ef3e6856f5b4467fce3ce61cb66570117e03f968af95a`.

| Variant | 5s | 15s | 30s | 60s | depth | transitions | regret / ref improved |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| MP current | 1.576605/5.852472 | 1.350240/6.020622 | 1.347370/6.021387 | 1.587142/5.396137 | 1 | 0 | 0.993223 / false |
| ranked traversal | 1.661535/5.926713 | 1.648811/5.469847 | 1.640028/5.282105 | 1.640028/5.282105 | 1 | 0 | 1.204767 / false |
| immediate rebase | 1.692284/6.022927 | same | same | 1.692284/6.022927 | 2 | 1 rebase | 1.626853 / false |
| width-2 beam | 1.576605/5.852472 | 1.356889/6.020951 | 1.347370/6.021387 | 1.587142/5.396137 | 1 | 0 beam | 0.993223 / false |

Depth counts only replacement edges: greedy construction has depth zero. Thus
the immediate-rebase run genuinely traversed a descendant replacement, but it
did not improve the canonical selected point, regret, or reference. The beam
had no retained second parent transition under this Storm trajectory.

## Scheduler equal-work ablation

The first paired run artifact is
`.research-artifacts/mp-reallocation-20260909/storm-scheduler-equal-work/tournament-report.json`
SHA-256 `ccf61edc2bbcefccc2c7b44a99b6f6bd3445fa2cce10ee1638640cbf7b98dff6`.
It falsified nominal-budget equalization: one-shot measured 762 structural
candidate evaluations while feedback stopped at 120.  The rerun feedback target
was set to the observed 762 unit, artifact
`storm-scheduler-feedback-762/tournament-report.json`, SHA-256
`51d3be72f22a55091b34da5486a6a466445dd8d861dd597a5f85312ff607e5e9`;
the deadline still stopped it at 256 structural evaluations (43 handoffs, 43
useful handoffs, configured cumulative budget 516, polish work 1032). It reached
1.436592/5.034090 and regret 0.391025, but is **not comparable** to the
one-shot 762-evaluation arm. No scheduler advantage is claimed.

## Interpretation and blockers

Facts support: (1) the prior depth barrier was real and rebase crosses it;
(2) added depth did not create useful Storm novelty in this bounded run; and
(3) this width-two beam did not preserve a useful alternate Storm parent.
They do not support a representational-limit conclusion, a general rejection
of beam diversity, or a scheduler-quality claim.  Because neither new MP arm
was promising on Storm, U12t/Trio controls were intentionally not run under
the approved Storm-first shortlist rule.  The equal-work scheduler experiment
remains blocked by its ability to consume structurally measured work before the
shared deadline; future work needs a paired preallocated structural-work phase
or a budget unit enforced inside structural candidate emission.

## Verification

Focused MP/anytime/tournament tests and core typecheck passed before the final
campaign. `pnpm --filter @autoeq-workbench/core benchmark` and the broad test
script both reproduce the pre-existing frozen Standard-v1 drift; fixtures were
not changed. `git diff --check` passed.
