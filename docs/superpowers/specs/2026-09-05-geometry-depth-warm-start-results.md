# Geometry warm starts at matching depths — research batch

## Hypothesis and scope

Starting from observability commit `cb50d0c6519d6f8937353aea9309e2b686655968`,
carry the best observed working checkpoint at each depth from the previous
geometry attempt. Each later attempt still starts from zero. At the end of a
successful expansion layer, its same-depth prior checkpoint joins the existing
global retention operation. Ranking, retention ratio, path cap, joint refinement,
checkpoint construction, and deadlines are unchanged. No prior checkpoint is
injected when that layer fails to expand.

This is an opt-in experiment (`runtime.geometryWarmStart`); the default is cold
search. It does not include either rejected continuation-queue implementation.
Transferred states may displace fresh alternatives under the existing ranking;
there is no guarantee of preserving their future search trajectories.

The branch temporarily points `research:v2` at `warmStartExperiment.ts` to run
paired A/B through the existing Research Bench workflow. The standard workflow
file is unchanged. This package-script override is research-only.

## Local screening

One pair per case, same Node 22 process, 30s / 10 filters. These timings are
screening evidence, not a repeat-balanced performance claim.

| Case | RMSE cold → warm | maxAbs cold → warm | seconds cold → warm | joint trials cold → warm |
| --- | --- | --- | --- | --- |
| Storm | 1.340123 → 1.189424 | 5.461750 → 4.729327 | 18.241 → 23.201 | 184686 → 208788 |
| U12t | 1.286150 → 1.073872 | 4.965306 → 3.387781 | 18.079 → 12.654 | 186210 → 153624 |
| Trio | 1.140682 → 1.140682 | 3.493254 → 3.493254 | 13.571 → 20.672 | 136788 → 194484 |

All six local runs converged. Artifacts: `/tmp/autoeq-warm-start-20260905/results.json`.

## Verification

- RED: synthetic matching-depth test failed with residual RMSE 0.00421675 instead
  of the exact prior checkpoint's zero error. GREEN: 7 search tests passed.
- Focused search, runner, progressive delivery, telemetry: 16 tests passed.
- Root typecheck, build, lint passed.
- Root test: 422/424 core tests passed locally. The frozen v1 exact-float fixture
  differs in its last bits, as already observed at the safe checkpoint. A v2 test
  exceeded its 5s wall timeout under parallel load; all 6 runner tests passed
  again in isolation with no verifier changes.
- Frozen v1 benchmark reports drift locally on both this branch and the safe
  handoff worktree. Baselines and verifiers were not changed.

## Runner experiment

Candidate: `d659e1d69f06686bbbedf4ab1bf2530002a93273`.
Run: https://github.com/jssantogit/autoeq-workbench/actions/runs/33987602951.
Matrix: all three cases, 5/15/30s, 10 filters, paired cold/warm in one process.
Order is reversed at 15s. Artifacts include complete rows, timelines, filters,
counters, Node version, SHA, and run ID. One pair per cell does not establish a
small runtime benefit. Promotion requires stronger coverage and a total-cost win.

Run 33987602951 succeeded, including all core tests and core typecheck. At 30s:

| Case | seconds cold → warm | joint trials cold → warm | working checkpoints cold → warm |
| --- | --- | --- | --- |
| Storm | 9.813 → 12.551 | 184380 → 208800 | 97 → 112 |
| U12t | 9.114 → 6.766 | 186294 → 153624 | 101 → 81 |
| Trio | 7.274 → 11.203 | 136548 → 193968 | 89 → 111 |

Final quality matches local screening. At 5s, Storm and Trio match control;
U12t already improves to 1.073872 / 3.387781. At 15s all runs converge and
match their 30s final quality. No final RMSE/maxAbs regression across these
budgets. This is evidence for quality, not a general diversity guarantee.

Decision: reject as a speed optimization; retain as a promising precision
experiment, with no promotion. Storm and Trio total runtime increases are large.
Next isolated hypothesis: transfer only into sign-crossing, keep mixed cold.
Downloaded artifacts: `/tmp/autoeq-warm-run-33987602951/autoeq-research-33987602951`.
