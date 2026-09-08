# AutoEQ Capacity-Aware Solver — High-Cap Search Recovery Results

Date: 2026-09-08
Branch: `research/capacity-aware-solver-plan-2026-09-07`

## Outcome

The recovery campaign falsified the old Max40/64 plateau as evidence of
representational saturation. The previous deliverable search accumulated
pending candidates for ten generations but did not merge them until the last
generation, so each generation expanded an unchanged archive. The recovered
search merges each generation, retains a semantic state bank, generates
residual structural proposals after local polish, and keeps canonical Pareto
selection authoritative.

All nine high-cap runs ended at their declared evaluation budget while their
frontiers were still updating. Max40 reached 40 observed and official filters
for all three cases. Diagnostic Max64 reached 44 filters for Storm, 42 for
U12t, and 45 for Trio. There is no implicit truncation at 40 or at the current
delivered count.

This is strong evidence of a prior **search limitation**. It is not evidence
of a representational limit, and it does not open the `cap-limited` gate. All
12 reference cells remain `still-moving`.

## Provenance and immutable inputs

- Previous approved evidence root:
  `/tmp/autoeq-oracle-directed-20260907-HhCqru`
- Previous approved snapshot:
  `/tmp/autoeq-capacity-directed-20260908/OracleReferenceSnapshotV1.json`
- Previous snapshot content SHA-256:
  `17508c12aad31a7cc6466ab4297870529e91c04fd479e177be5b53c02466f287`
- Previous snapshot file SHA-256:
  `70b8ea09c15b73d7ff861eae53c4a037ab2d77f76fa8f1815e065e2ae13492c0`
- New campaign root:
  `/tmp/autoeq-oracle-highcap-recovery-20260908-r1OFKA`
- New validated evidence root:
  `/tmp/autoeq-oracle-highcap-recovery-20260908-r1OFKA/evidence`
- New snapshot:
  `/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json`
- New snapshot content SHA-256:
  `0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3`
- New snapshot file SHA-256:
  `a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd`
- Campaign repository SHA:
  `576dd7442091ac6da76c90f18d78646a1cdfb5b8`
- Corpus/evaluator:
  `autoeq-research-corpus-v1` / `standard-v2-canonical-v1`
- Toolchain: Node `22.22.2`, pnpm `10.34.5`, Python `3.12.13`

The old screen/confirm/deep artifacts were not modified. Investigation of the
control collision found a real identity conflict: the same time-limited
control candidate ID could denote radically different filter topologies on
different executions. It was not last-bit drift and was not normalized away.
The recovery root instead re-canonicalizes the approved old continuous
candidate pools, excludes the conflicting old control points, and inserts the
current canonical controls. The continuous provenance is explicitly
`continuous-recanonicalized-seeds-v1`.

Each cap validation reports `campaignValidation.valid=true`, no errors, and
exactly the three approved cases. Max10 uses the narrow screen effort. Max20,
Max40, and Max64 use the bounded recovery-full deliverable effort; the
continuous seed stage retains the protocol's `screen` campaign mode, while
the deliverable aggregate records the full `25` generation / `12000`
candidate / `80` Powell-evaluation configuration.

## Aggregate hashes

| Cap | Manifest | Control aggregate | Continuous aggregate | Deliverable aggregate | Continuous JSONL | Deliverable JSONL |
| ---: | --- | --- | --- | --- | --- | --- |
| 10 | `2456abb911c7f1dfe5474563bd349054be45338627d53731466e4b06f5b256dc` | `99a033e90eedd95188e560fe9c8c98d2afc324c0c09efcc1295666b8eceb4cd4` | `2cbdb221e5f151a16bc73d99ebefafb6e90aba6ebf396223a94c34c6f8f18cf6` | `28d9678aff971970c5c97476880b62ce14009b31f19ff949c66bd2c20dd11d75` | `21d8c50965c29dab6874749408d493662aac68f05c0cf2738bcb8fed60c71d8a` | `59e1f0ee33dd56765cbb895fafb6b0a07323d25e371937339124986dd5fa0b7d` |
| 20 | `8fa0f9c650b69469757f97ffe050b48bb2edbf39bc0a6801d54acb4c1e166eaf` | `fcaf8b5a21f42240421c989707fa3e1d2ed7feea1f28aa0efa47a5e64e31d702` | `81f28d1b5f920fdc6853726a039f69d4fa3a794c3fa52ee683c1032faa7c0e37` | `5f50935aa62238dbbad06948931f06d95d908690b9bbabf5384de3c3737c1ca2` | `29a5d53c29695d87ce640313db03eec01402e9f79dfddd9f1c82518e0f7a5769` | `5bc9f8dd9b194b7ea3f55bbb837a157aa264d8577f07c09773cd975c2b15b5da` |
| 40 | `1f7ab8856527d37a79cbe01097a2e8d538adcbb075dce623cfc4c190cb5adb81` | `382fa4f15d1b0fdf9651e84c042d95332160dd5f328a3616fb2a732f7a8316eb` | `6de29654b5accfc474bea112ee990f444e73ffbbb8a983a0cf80e67216db1c7b` | `174a5347d98bc3475b01617049319edc8c4c3e401f66b18634293f6482fbb489` | `f5faced14184de16c3b9e954901f28989d385ff75a2d4985adeae1fdacea2b53` | `1dc27b09ffb56d0e40d4b8806ddb5e91651dc153f9e8451c403d3d64f0df21e6` |
| 64 | `3bd7da6dad5dd638a2f7be51000fdfd8f16fc70c68d8822d7591b5d885697123` | `a3cded8bbc3cd2aae51c4a95a76eae32d7fd7109dc913efd7be8a4206f7194e9` | `d79230c619a1d74b3f0715df9a3ebd28bd103817fd1aa325c394847de62d47c4` | `3178b9f2a307a36e6772b1e299cb4317d8a768702cfdacf0d230160d85422eb1` | `6a63991eaa2a128881d2dc10af03630fce2b512b19c31a29a5fc7a0765d6d32d` | `21fd19fbb1d19d7d84237bb6463e3d16dada213c29d1a093e0534009097b42a3` |

## High-cap audit

`Ops` is `remove/split/merge/type-mutation`. Counts are generated proposals,
accepted proposals, rejected proposals, ADD proposed/accepted/rejected,
canonical evaluations, executed generations, and refinement rounds.

| Case | Cap | Available/official/observed filters | Frontier | Proposals g/a/r | ADD p/a/r | Structural proposals; ops | Evals; gen; refine | Dedup | Stop reason | Unused-cap reason |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |
| Storm | 10 | 10/10/10 | 9 | 1556/1455/101 | 0/0/0 | 397; 190/0/17/190 | 1458; 5; 19 | 101 | generation-budget | capacity-fully-used |
| U12t | 10 | 10/10/10 | 12 | 1580/1496/84 | 0/0/0 | 400; 200/0/0/200 | 1500; 5; 20 | 80 | generation-budget | capacity-fully-used |
| Trio | 10 | 10/10/10 | 8 | 1620/1495/125 | 0/0/0 | 400; 200/0/0/200 | 1500; 5; 20 | 73 | generation-budget | capacity-fully-used |
| Storm | 20 | 20/20/20 | 34 | 13271/11988/1283 | 0/0/0 | 3591; 1600/0/391/1600 | 12000; 20; 80 | 685 | evaluation-budget | capacity-fully-used |
| U12t | 20 | 20/20/20 | 12 | 12640/11991/649 | 0/0/0 | 3440; 1600/0/240/1600 | 12000; 20; 80 | 420 | evaluation-budget | capacity-fully-used |
| Trio | 20 | 20/20/20 | 24 | 12502/11992/510 | 0/0/0 | 3306; 1520/0/266/1520 | 12000; 19; 76 | 425 | evaluation-budget | capacity-fully-used |
| Storm | 40 | 40/40/40 | 7 | 12473/11985/488 | 48/48/0 | 4061; 1397/597/622/1397 | 12000; 9; 36 | 248 | evaluation-budget | capacity-fully-used |
| U12t | 40 | 40/40/40 | 24 | 13040/11993/1047 | 96/96/0 | 4666; 1456/1136/522/1456 | 12000; 10; 40 | 201 | evaluation-budget | capacity-fully-used |
| Trio | 40 | 40/40/40 | 11 | 12208/11993/215 | 48/48/0 | 3994; 1399/599/549/1399 | 12000; 9; 36 | 190 | evaluation-budget | capacity-fully-used |
| Storm | 64 | 64/44/44 | 13 | 13333/11993/1340 | 108/102/6 | 4905; 1399/1399/600/1399 | 12000; 9; 36 | 210 | evaluation-budget | capacity-unused-budget-exhausted |
| U12t | 64 | 64/42/42 | 34 | 13427/11993/1434 | 120/111/9 | 5029; 1460/1460/529/1460 | 12000; 10; 40 | 219 | evaluation-budget | capacity-unused-budget-exhausted |
| Trio | 64 | 64/45/45 | 7 | 13502/11993/1509 | 108/99/9 | 5048; 1439/1439/623/1439 | 12000; 9; 36 | 213 | evaluation-budget | capacity-unused-budget-exhausted |

In every high-cap audit, scheduler runnable states reached `12000`, evaluation
budget remaining was `0`, `noMutationRemainedAdmissible=false`, and
`implicitActualDeliveredFilterCountCap=false`. There was no time budget in the
offline Oracle runs. This distinguishes unused Max64 capacity due to the
bounded campaign budget from absence of admissible structural work.

## Canonical delivered references: before versus after

Each row selects the RMSE-best point on that cell's canonical deliverable
frontier. A positive maxAbs delta can therefore be a legitimate Pareto
tradeoff rather than a regression of the whole frontier.

| Case | Cap | Old RMSE | New RMSE | Delta | Old maxAbs | New maxAbs | Delta | Old/new filters | New frontier | New RMSE-best regret vs old / improved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 10 | 1.246700 | 1.220573 | -0.026127 | 5.448039 | 5.477613 | +0.029574 | 10/10 | 9 | 0.039431 / false |
| Storm | 20 | 1.149689 | 1.000252 | -0.149438 | 5.277186 | 5.325181 | +0.047996 | 20/20 | 34 | 0.063994 / false |
| Storm | 40 | 1.157562 | 1.021069 | -0.136493 | 5.320637 | 4.457419 | -0.863217 | 22/39 | 7 | 0 / true |
| Storm | 64 | 1.157562 | 1.041417 | -0.116145 | 5.320637 | 4.466726 | -0.853910 | 22/42 | 13 | 0 / true |
| U12t | 10 | 1.175854 | 1.156463 | -0.019391 | 4.966805 | 4.986637 | +0.019832 | 10/10 | 12 | 0.026442 / false |
| U12t | 20 | 0.704355 | 0.615084 | -0.089271 | 2.850540 | 2.917226 | +0.066687 | 20/20 | 12 | 0.088916 / false |
| U12t | 40 | 0.686220 | 0.614705 | -0.071514 | 2.850285 | 3.011161 | +0.160876 | 31/39 | 24 | 0.214501 / false |
| U12t | 64 | 0.686220 | 0.612729 | -0.073490 | 2.850285 | 3.012512 | +0.162227 | 31/40 | 34 | 0.216303 / false |
| Trio | 10 | 0.890264 | 0.873284 | -0.016980 | 3.493282 | 3.560643 | +0.067361 | 10/10 | 8 | 0.089815 / false |
| Trio | 20 | 0.926706 | 0.868255 | -0.058451 | 4.332371 | 4.343049 | +0.010677 | 20/20 | 24 | 0.014237 / false |
| Trio | 40 | 0.927975 | 0.711311 | -0.216664 | 4.332406 | 4.188482 | -0.143924 | 22/39 | 11 | 0 / true |
| Trio | 64 | 0.927975 | 0.726268 | -0.201707 | 4.332406 | 4.040036 | -0.292370 | 22/44 | 7 | 0 / true |

At least one new point canonically dominates an old reference in every cell.
For Storm and Trio all old frontier points are dominated at every cap. For
U12t the counts are 4/4 at Max10, 8/9 at Max20, 6/6 at Max40, and 6/6 at
Max64. The RMSE-best point itself does not always dominate because it can
trade maxAbs; the complete frontier, not a single scalar choice, is official.

Raw deltas between the new RMSE-best points are:

| Case | Max10→20 RMSE/maxAbs | Max20→40 RMSE/maxAbs | Max40→64 RMSE/maxAbs |
| --- | ---: | ---: | ---: |
| Storm | -0.220321 / -0.152432 | +0.020817 / -0.867762 | +0.020348 / +0.009307 |
| U12t | -0.541379 / -2.069410 | -0.000379 / +0.093935 | -0.001976 / +0.001351 |
| Trio | -0.005029 / +0.782406 | -0.156944 / -0.154567 | +0.014957 / -0.148446 |

All reference states at Max10, Max20, Max40, and Max64 are `still-moving`.
Zero or adverse scalar deltas between two RMSE-selected points are not treated
as saturation while the Pareto frontier continues to change.

## Teacher → Max10 compression

Artifact:
`/tmp/autoeq-capacity-recovery-20260908/teacher-compression/teacher-compression-study.json`

SHA-256:
`095b0dc5bdb5f3c342812f7fc3173e679ad569f2fc71d777908d7240badd3eac`

The study used two representatives per case/cap (RMSE-best and maxAbs-best),
Max20 and Max40 teachers, Max10 students, matching pursuit, three structural
rounds, and bounded nonlinear polish of 1200 evaluations. All 12 attempts
completed. Results were deterministic across the two representatives whenever
they produced the same student.

| Case | Attempts preserving a reference improvement | Student RMSE/maxAbs | Filters | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Storm | 0/4 | 1.613451 / 5.517595 | 10 | teacher gain not preserved |
| U12t | 4/4 | 1.128244 / 4.412945 | 10 | valid Max10 improvement; high-cap gain is compressible under this attempt |
| Trio | 0/4 | 1.546113 / 4.268560 | 10 | direct compression did not preserve the gain |

No numerical retention threshold was invented. `referenceImproved` and the
paired canonical metrics are the recorded gates.

## Genuine 5/15/30/60 second tournament

Definitive artifact:
`/tmp/autoeq-capacity-recovery-20260908/same-runtime-tournament-pure-structural/tournament-report.json`

SHA-256:
`e9f686b2d77454f14ff8d86fba3a19e7f35eeca1b8dd30f9da8f9acc8cbe2ce3`

The run is fixed at Max10. Each table cell is
`RMSE/maxAbs; n; regret; improved; cumulative candidates/structural ops`.
The QTF is per continuous run. A repeated terminal point after early
exhaustion is explicitly marked and is not presented as 60 seconds of work.

| Case/mechanism | 5 s | 15 s | 30 s | 60 s | QTF; termination |
| --- | --- | --- | --- | --- | --- |
| Storm state-bank+teacher | 1.787642/5.497997; 10; 1.798289; F; 6/0 | same | same | same | 0.165582; exhausted-current-mechanism at 140 ms |
| Storm matching pursuit | 1.576605/5.852472; 10; 1.112735; F; 561/550 | 1.347370/6.021387; 10; 0.803558; F; 1567/1556 | 1.587142/5.396137; 10; 0.993223; F; 2754/2743 | 1.587142/5.396137; 10; 0.993223; F; 4586/4575 | 0.356444; deadline |
| Storm structural pure | 1.683100/5.032532; 5; 1.377056; F; 81/80 | same | same | same | 0.238699; no-admissible-proposals at 968 ms |
| U12t state-bank+teacher | 1.062808/3.178085; 10; 0; T; 7/0 | same | same | same | 1.000000; exhausted-current-mechanism at 102 ms |
| U12t matching pursuit | 1.308516/4.410812; 10; 0.342457; F; 310/299 | same; 1151/1140 | same; 2394/2383 | 1.256646/3.544907; 10; 0.134980; F; 4934/4923 | 0.727455; deadline |
| U12t structural pure | 0.977549/2.913091; 8; 0; T; 201/200 | same | same | same | 0.961056; no-admissible-proposals at 2855 ms |
| Trio state-bank+teacher | 1.191948/2.853694; 10; 1.241686; F; 8/0 | same | same | same | 0.288897; exhausted-current-mechanism at 106 ms |
| Trio matching pursuit | 1.602783/4.269812; 10; 3.065604; F; 426/415 | 1.259124/4.722497; 10; 2.186731; F; 1315/1304 | same; 2241/2230 | same; 4456/4445 | 0.074958; deadline |
| Trio structural pure | 1.144779/3.304229; 7; 1.053008; F; 125/124 | same | same | same | 0.304112; no-admissible-proposals at 2270 ms |

Matching pursuit performed genuine additional work through all four
checkpoints in all three cases. Its best Pareto-selected point need not have
monotonic RMSE alone: for example Storm switches at 30 s to a point with worse
RMSE but substantially better maxAbs. The selected best-so-far never becomes
Pareto-dominated. State-bank and structural beam terminate early only after
their defined runnable state/proposal spaces are exhausted, with explicit
counts and no busy-loop.

## Component ablations

The component shortlist remains exactly three: state bank, matching pursuit,
and structural beam. Compositions below are ablations, not additional solver
families.

- State-bank pure artifact:
  `/tmp/autoeq-capacity-recovery-20260908/ablation-state-bank-pure/tournament-report.json`
  (`ba256a185f7d1b468eb82f0c5fe91483e1d0bff1b67099b5cc6388e02b33dee6`)
- MP → structural artifact:
  `/tmp/autoeq-capacity-recovery-20260908/ablation-mp-structural/tournament-report.json`
  (`94ebfe7a617f58685db98c24eb54cc9b77beb7fb4bdb47ec20e095da23861bd1`)
- Teacher → structural artifact retained separately from the definitive pure
  tournament:
  `/tmp/autoeq-capacity-recovery-20260908/same-runtime-tournament/tournament-report.json`
  (`cb0b1fe6c0fe78cc2b809831f2e6b0a98f1a4cb5af4fa84cc4390bd113ccb3d9`)

| Ablation | Storm RMSE/maxAbs; n; regret; improved | U12t | Trio |
| --- | --- | --- | --- |
| state-bank pure | 3.608406/19.731539; 0; 21.132378; F | 2.714685/12.870304; 0; 12.198867; F | 3.531936/14.134149; 0; 17.659239; F |
| state-bank+teacher | 1.787642/5.497997; 10; 1.798289; F | 1.062808/3.178085; 10; 0; T | 1.191948/2.853694; 10; 1.241686; F |
| matching pursuit pure | 1.587142/5.396137; 10; 0.993223; F | 1.256646/3.544907; 10; 0.134980; F | 1.259124/4.722497; 10; 2.186731; F |
| structural pure | 1.683100/5.032532; 5; 1.377056; F | 0.977549/2.913091; 8; 0; T | 1.144779/3.304229; 7; 1.053008; F |
| MP → structural | 1.587142/5.396137; 10; 0.993223; F | 1.108809/3.277273; 8; 0; T | 1.421354/4.154964; 9; 2.331100; F |
| teacher → structural | 1.613451/5.517595; 10; 1.106257; F | 1.049870/3.145749; 7; 0; T | 0.844990/2.447990; 10; 0; T |

State-bank pure evaluates the empty fresh state twice and cannot add a filter;
teacher transfer is therefore causal, not incidental, for its useful results.
Structural beam pure independently improves U12t. MP → structural also
improves U12t, but does not beat its MP seed in Storm and regresses the
selected Pareto point in Trio. Teacher → structural supplies the strongest
Trio Max10 evidence and dominates the frozen Max10 reference there.

## Diagnosis and classification

| Case | High-cap diagnosis | Fixed-cap/compression evidence | Classification |
| --- | --- | --- | --- |
| Storm | Search still improving at the 12000-evaluation budget; Max40/64 dominate the old frontiers and grow to 40/44 filters | No shortlisted Max10 run improves the new reference; direct teacher compression fails | `search/representation unresolved`; prior search limitation confirmed |
| U12t | Search still improving at budget; Max64 grows to 42 filters, with a broad 34-point frontier | Teacher students improve the reference in 4/4 attempts; state-bank+teacher, structural pure, and MP→structural also improve it | `search unresolved`; high-cap benefit is at least partly compressible, so not `cap-limited` |
| Trio | Search still improving at budget; Max40/64 strongly dominate the old plateau and grow to 40/45 filters | Direct compression fails, but teacher→structural produces a dominating Max10 point | `search/representation unresolved`; high-cap and fixed-cap search limitations confirmed |

No case is classified as `cap-limited`. No representational-limit claim is
made. The Oracle mechanism did not exhaust its own search space; the bounded
campaign exhausted its evaluation budget. The TS state-bank and structural
components did exhaust their narrower current mechanisms, which is an
architectural limitation rather than global convergence.

## Architecture assessment and shortlist

The shortlist remains:

1. `state-bank-v1` with teacher → student transfer;
2. `matching-pursuit-v1`;
3. `structural-beam-v1`, measured both alone and in approved compositions.

Current evidence by role:

- Final Max10 quality: teacher → structural is strongest for Trio;
  structural pure is strongest for U12t; no survivor beats the Storm
  reference.
- Initial speed: state-bank transfer and structural beam produce terminal
  points in less than three seconds, but state-bank quality is case-dependent.
- Continued improvement: matching pursuit is the only TS component that keeps
  generating admissible work to 60 seconds; the increasing cumulative counts
  prove continuation, although quality gains are sparse.
- High-cap search: the recovered generation-wise state bank plus residual
  structural ADD/SPLIT proposals is the only mechanism here with direct
  evidence of useful growth beyond 40.
- Max10 runtime: structural beam plus a provenance-controlled seed source has
  the best overall evidence, but Storm remains a blocker and no promotion is
  justified.

## Calibration Manifest outcome

Every cap's calibration report remains `status=insufficient`, with no decision,
recommendation, or Calibration Manifest. This is the honest outcome: all
reference cells are still moving, optimizer-family agreement remains
insufficient, Storm has no reference-improving Max10 survivor, and no holdout
was authorized. No thresholds or missing data were fabricated.

## Code changes and commits

- `0a70b92` — recover residual search continuation;
- `53a464d` — audit anytime recovery work;
- `cf2bc90` — record recovery campaign provenance;
- `576dd74` — recanonicalize recovery seed pools;
- `df58e50` — preserve lazy deadline accounting;
- `e9b0e33` — separate pure and seeded tournament ablations.

The changes are research-only. Production, UI, session/export, Standard
AutoEQ v1, and the default cap were not changed. Large artifacts remain under
`/tmp` and outside Git.

## Verification

- `python3.12 -m pytest -q research/solver-lab/tests`: `131 passed`, one
  non-blocking CMA/matplotlib warning.
- Focused TS research suite: `24 files`, `90 passed`.
- Full AutoEQ v2 suite, serial rerun: `41 files`, `170 passed`.
- The first concurrent v2 run had one 5-second test timeout; that exact file
  passed alone (`6/6`) and the full serial rerun passed.
- Core typecheck: passed.
- Root `pnpm typecheck`: passed.
- Root `pnpm build`: passed.
- Root `pnpm lint`: passed.
- Root `pnpm test`: `503 passed`, one known Standard-v1 last-bit drift failure:
  MAE expected `0.05190838449315958`, observed `0.05190838449315954`; RMSE
  expected `0.061293683388416766`, observed `0.06129368338841673`.
- Core benchmark: stopped at the matching Standard-v1 drift guard. The frozen
  fixture was not changed.
- `git diff --check`: passed after the report's final review.

## Remaining blockers and stop boundary

- Oracle frontiers remain `still-moving`; stronger canonical references would
  require another explicitly bounded campaign.
- The current TS matching-pursuit continuation spends 60 seconds but does not
  consistently convert additional work into a better selected frontier point.
- Structural and state-bank mechanisms exhaust narrow spaces early and need
  approved work-generation composition to be genuinely anytime.
- Storm has no reference-improving Max10 survivor.
- Calibration evidence is insufficient and no holdout has been run.
- The pre-existing Standard-v1 last-bit drift remains separate.

Work stops here before holdout, production promotion, merge, release, publish,
or deploy.
