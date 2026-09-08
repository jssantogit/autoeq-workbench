# AutoEQ Capacity-Aware Directed Campaign Results

Status: completed through the research/runtime-tournament boundary. No
holdout, production promotion, merge, release, or publish was performed.

This document supersedes the blocked endpoint recorded in the 2026-09-07
screening, tournament, and calibration notes. The old Oracle campaigns were
not modified or merged.

## Evidence roots and identity

- Directed Oracle campaign:
  `/tmp/autoeq-oracle-directed-20260907-HhCqru`
- Consolidated research output:
  `/tmp/autoeq-capacity-directed-20260908`
- Oracle snapshot:
  `/tmp/autoeq-capacity-directed-20260908/OracleReferenceSnapshotV1.json`
- Snapshot content SHA-256:
  `17508c12aad31a7cc6466ab4297870529e91c04fd479e177be5b53c02466f287`
- Snapshot file SHA-256:
  `70b8ea09c15b73d7ff861eae53c4a037ab2d77f76fa8f1815e065e2ae13492c0`
- Repository SHA recorded in the campaign/snapshot:
  `c8375b531f50b59603d9aa6ee7ede67444fac990`
- Corpus: `autoeq-research-corpus-v1`
- Canonical evaluator: `standard-v2-canonical-v1`
- Toolchain: Node `22.22.2`, pnpm `10.34.5`, Python `3.12.13`

Each directed stage used only the three approved cases, screen seeds
`11,29`, seed pool `11,29,47,83,101,131,167,197`, and canonical delivered
candidate evaluation. The Max64 stage is diagnostic-only.

The six required-file hashes are listed in the order
`campaign-manifest`, `control-aggregate`, `continuous-aggregate`,
`deliverable-aggregate`, `continuous-candidates`, `deliverable-candidates`:

| Capacity | Required-file SHA-256 bundle |
| --- | --- |
| Max10 | `0fefdd9bfb71fad2a5f170165611749b7a5271393f49a7e9a1cf7cbf2b795f1f`, `82fe13b2dc35c0f0b2958cde159bde1bd3ffe671fd2bdace59c4e5aa4f43c`, `4580a062374d9c68280eea797f778837ef41a2c74e324db28d8adc04bec36ea9`, `b34e71a5e4b6cd795f019149fda19448c8193721b905127bac2c48b442b92685`, `4205174d3a2c9f9f96f8918eb72b3e8504f7b9590423ec6c92ec674023fdc3cd`, `65fb8930de62522b2ead7f2bcc92e86afa0844618b0422f4ffbb1449b2b14e99` |
| Max20 | `f670f507728968773a8b1f883be8bf9bf3d28d0e67063fe4ed470cbf567f32f0`, `3cf692ee1f00039f56626973915170f1239cc82676648db5a03a022d2ce7c6a0`, `aa6d085875abb2d0458a3e22f5c6f81c8fc498ec8b5ba43e04d5272bcff9a073`, `2495f590e85bbc7ce3dbd321d0b7c86ab6fadb464ba93605a283128c5e24a760`, `20a0980d67c64d9c3b804fe7272d8e48856cfe0feb6b98a5bfb2e03be2c0ebff`, `a85031502d0e409c46e4b74f10408cadc085bdc7416b8129603cf2b062dceb4b` |
| Max40 | `609ead8c97c5f35dba29b014d3eb00bf9bb43f4a09c2130c0f33be3d10f44c75`, `c61c1a7270931c946116aa22f98ab91abcb9fd0b18da9ef80cb7a4eb8740e952`, `ec443cd3514776749bec5bc3a4bcc4eaedbdc555f17e6bcc686e0211bb7b623b`, `ae18a3c3d4ca34b95e598dc79e5454db0d6ae7a1e80ccb81d930087575573aa5`, `cf147d2f260da33d891801419c91b64a4464e641cdcb537e3b788e2493a25c89`, `31a3c424df3f63303f1994fd3ab8fe70e0967976e4ee331afac15957c6f3c7c3` |
| Max64 diagnostic | `a90194366f665f39d2eb68bb1bc3eedb63780495769eb803b6605cb503fd6463`, `bebd55b88fac38abd369b9b5aa49786108fedc2d30a4e2b547c0e48dd22aabf2`, `e90c3aab08e7e18674448f5f31d98eab8a677ca216b4f332df40b2470fcbe712`, `34ebc659954d9b642915bd91a8b69fd7ea7da3b1e041fa6f2df31e310e49520d`, `d0678c03ff0f525049728bde3f080bf7191e4b81015862d13a48e7ec166acd4b`, `9d0a9429bb0eb44120c5bd479aaffa7e24e39c6da4278c4fda315086404fe185` |

The old screen/confirm/deep control conflict was checked without changing the
artifacts: the control contents and candidate metrics are identical under
control hash `d8307201a3ba696fdc46041f8f389eef99c7c88c698d95145cb8cfd44c0dbbef`;
only provenance/source aggregate hashes differ. It is semantic duplication,
not a real metric conflict. The new root is independent and self-consistent.

## Canonical delivered high-cap evidence

The metric pair below is the point with the lowest canonical RMSE in the
cell; `n` is the actual delivered filter count. The minimum-maxAbs point can
be a different Pareto point and is reported afterward.

| Case | Max10 RMSE/maxAbs (`n`) | Max20 RMSE/maxAbs (`n`) | Max40 RMSE/maxAbs (`n`) | Max64 RMSE/maxAbs (`n`) |
| --- | ---: | ---: | ---: | ---: |
| Storm | `1.246699673 / 5.448039420` (`10`) | `1.149689368 / 5.277185710` (`20`) | `1.157561719 / 5.320636628` (`22`) | `1.157561719 / 5.320636628` (`22`) |
| U12t | `1.175853676 / 4.966804885` (`10`) | `0.704355081 / 2.850539606` (`20`) | `0.686219664 / 2.850285310` (`31`) | `0.686219664 / 2.850285310` (`31`) |
| Trio | `0.890264246 / 3.493281905` (`10`) | `0.926705763 / 4.332371219` (`20`) | `0.927975089 / 4.332405721` (`22`) | `0.927975089 / 4.332405721` (`22`) |

All 12 cells have reference state `still-moving`. Frontier sizes by
capacity are:

| Case | Max10 | Max20 | Max40 | Max64 |
| --- | ---: | ---: | ---: | ---: |
| Storm | 2 | 1 | 7 | 7 |
| U12t | 4 | 9 | 6 | 6 |
| Trio | 5 | 9 | 2 | 2 |

Minimum maxAbs points (showing why RMSE and maxAbs must not be conflated) are:

- Storm: Max10 `1.338735159 / 5.442528841`; Max20 `1.149689368 / 5.277185710`; Max40/64 `1.286751210 / 5.310817899`.
- U12t: Max10 `1.286150191 / 4.965305863`; Max20 `0.762535795 / 2.846690472`; Max40/64 `0.735020590 / 2.847019736`.
- Trio: Max10 `1.140682163 / 3.493254363`; Max20 `0.990283609 / 4.326401965`; Max40/64 `0.954658104 / 4.195632364`.

Raw deltas use the paired lowest-RMSE points in the first table:

| Case | Max10 → Max20 (`ΔRMSE`, `ΔmaxAbs`) | Max20 → Max40 | Max40 → Max64 |
| --- | ---: | ---: | ---: |
| Storm | `-0.097010304`, `-0.165343132` | `+0.007872350`, `+0.033632189` | `0`, `0` |
| U12t | `-0.471498595`, `-2.118615391` | `-0.018135417`, `+0.000329265` | `0`, `0` |
| Trio | `+0.036441517`, `+0.833147601` | `+0.001269326`, `-0.130769600` | `0`, `0` |

The RMSE-best delivered point in every cell is
`deliverable-oracle:<case>:41:powell:0`. The Max40/64 minimum-maxAbs
provenance is `...:titan-to-storm:0:local:standard-v2-control:<case>:40|64:30:122`
for Storm, `...:titan-to-u12t:0:local:standard-v2-control:<case>:40|64:30:171`
for U12t, and
`...:titan-to-trio:0:structural:standard-v2-control:<case>:40|64:30:65`
for Trio. All official references are delivered/canonicalized; the old
diagnosis report was not copied into this evidence.

## Fixed-Cap Max10

Artifact:
`/tmp/autoeq-capacity-directed-20260908/fixed-cap/python-fixed-cap-study.json`

SHA-256:
`a68d2f3509834f41ca655d3642c47f1053e8de61012b31ff08a202a292c8fb67`

The study completed 45 bundles, 180 runs, zero errors, budgets `2000`,
`10000`, `50000`, and seeds `11,29,47,71,101`. Every listed configuration
was deterministic across those budgets and seeds. Values are
`RMSE/maxAbs; regret; n; referenceImproved`.

| Case | Matching pursuit | Structural beam 4/12 | MP → structural beam 4 |
| --- | --- | --- | --- |
| Storm | `1.694436562/6.025019146; 1.620977123; 10; false` | `3.110242246/14.333255818; 13.810730927; 1; false` | `1.457437910/5.103567471; 0.474811004; 9; false` |
| U12t | `1.308515585/4.410812001; 0.089461574; 10; false` | `2.547266238/7.548706790; 6.108308877; 1; false` | `1.174452936/4.413161341; 0; 9; true` |
| Trio | `1.602782773/4.269811817; 2.118647052; 10; false` | `3.067253109/9.406172473; 11.024633513; 1; false` | `1.602782773/4.269811817; 2.118647052; 10; false` |

QTF derived from the available matching-pursuit trajectories is Storm
`0.148659152`, U12t `0.698604251`, and Trio `0.089212275`. Structural bundle
records have no comparable elapsed-time trajectory, so no structural QTF was
fabricated.

## High-cap teacher → Max10 compression

Artifact:
`/tmp/autoeq-capacity-directed-20260908/teacher-compression/teacher-compression-study.json`

SHA-256:
`74d18ea7c5ea54485f3358ee292d90efa5fa81f3c5ffa21d32f6aef456633165`

All 34 official teacher attempts completed with zero rejects: Storm `1`
Max20 + `7` Max40, U12t `9` Max20 + `6` Max40, and Trio `9` Max20 + `2`
Max40. Student results are all actual Max10 delivered states.

| Case | Best student RMSE/maxAbs (`n`) | Reference improved | Raw student delta vs representative Max20 teacher | Raw student delta vs representative Max40 teacher |
| --- | ---: | --- | ---: | ---: |
| Storm | `1.613451146 / 5.517594933` (`10`) | false | `+0.463761777`, `+0.240409223` | `+0.326699936`, `+0.206777034` |
| U12t | `1.128243783 / 4.412944625` (`10`) | true for all 15 attempts | `+0.365707989`, `+1.566254153` | `+0.401944136`, `+1.563572534` |
| Trio | `1.546113170 / 4.268560059` (`10`) | false | `+0.555829560`, `-0.057841906` | `+0.591455069`, `+0.072927694` |

The paired teacher/student metrics above and the complete attempt artifact
are authoritative; no numerical “sufficient retention” threshold was
introduced.

## Classification and shortlist

The high-cap solvability check is `insufficient-evidence` for all three cases
because every Max40/64 reference remains `still-moving`; therefore the
`cap-limited` gate is closed. Final classifications are:

| Case | Classification | Basis |
| --- | --- | --- |
| Storm | `capacity-suspected` | Max40/64 moving; no fixed-cap or compression reference improvement |
| U12t | `capacity-suspected` | Max40/64 moving despite fixed-cap/compression improvements over Max10 |
| Trio | `capacity-suspected` | Max40/64 moving; no fixed-cap or compression reference improvement |

The provisional shortlist contains three components:

1. `state-bank-v1` with teacher-transfer proposal seeds;
2. `matching-pursuit-v1`;
3. `structural-beam-v1` as the ablation/component required by the observed
   MP → structural-beam-4 hybrid win.

This is a research shortlist, not a production recommendation. The
teacher-compression mechanism remains a diagnostic input generator and is not
registered as a runtime tournament variant.

## Same-runtime Node/TypeScript tournament

Artifact:
`/tmp/autoeq-capacity-directed-20260908/same-runtime-tournament/tournament-report.json`

SHA-256:
`7c185457cc8d0595efa6d64a139c58890f24cf52df4171af14de26c76d3be249`

The tournament registered exactly the three shortlisted IDs, used Max10 and
seed `0`, and emitted canonical delivered checkpoints at 5/15/30/60 seconds.
All runs terminated as `converged` before 1.27 seconds; consequently each
later checkpoint reuses the last best point from that same run. This is not a
claim of 60 seconds of active search.

| Case | Variant | Observed ms | Checkpoint RMSE/maxAbs; regret; n; improved | QTF |
| --- | --- | ---: | --- | ---: |
| Storm | state-bank | `179.379` | `1.787641618/5.497997472; 1.797148284; 10; false` | `0.165770947` |
| Storm | matching pursuit | `1267.642` | `1.694436562/6.025019146; 1.620977123; 10; false` | `0.197705422` |
| Storm | structural beam | `209.672` | `1.613451146/5.517594933; 1.103412707; 10; false` | `0.331737028` |
| U12t | state-bank | `119.073` | `1.062808498/3.178085030; 0; 10; true` | `1.000000000` |
| U12t | matching pursuit | `586.626` | `1.308515585/4.410812001; 0.089461574; 10; false` | `0.914423402` |
| U12t | structural beam | `176.224` | `1.253938104/3.499574298; 0; 9; true` | `1.000000000` |
| Trio | state-bank | `111.589` | `1.191948207/2.853694400; 0.205064176; 10; false` | `0.814595038` |
| Trio | matching pursuit | `536.044` | `1.602782773/4.269811817; 2.118647052; 10; false` | `0.120194135` |
| Trio | structural beam | `141.006` | `1.460167611/3.548456956; 1.280059645; 9; false` | `0.278020718` |

## Calibration outcome

Recommendation artifact:
`/tmp/autoeq-capacity-directed-20260908/calibration-recommendation.json`

SHA-256:
`b86b48bae547ceb7ae3a1cd2366acda374ca311171fa293f54dccfa7fb2048a`

Outcome: `insufficient`. The existing strict recommendation found no
strict control improvement (`maxCatastrophicRate=0`, `maxPerCaseRegression=0`,
`minAggregateGain=0`, holdout `false`). No `OracleCalibrationManifestV1` was
created or fabricated. QTF formula v1 remains unchanged; its SHA-256 is
`10d387db6ea37b2cbdf6a5c6c614c5d3f0a790046e45cbadfa931b32471d9965`.

## Commits and verification

Commits produced after the original branch head:

- `705c1f1` — align capacity snapshot cell identity and teacher lookup;
- `130d2d5` — port shortlisted matching pursuit and structural beam;
- `432cf43` — execute the same-runtime capacity tournament.

Focused TypeScript research tests passed: 18 tests across six research
suites. Core typecheck passed, and `git diff --check` passed. The independent
Python validator accepted all four directed aggregate campaigns and the
12-cell snapshot. The existing full-root verification still has the known
Standard-v1 last-bit metric drift and the pre-existing V2 test timeout; those
are kept separate from this research and no Standard-v1 fixture was changed.

Remaining blockers are scientific, not missing artifacts: the three
high-cap reference cells remain `still-moving`, so no case can be promoted to
strong `cap-limited`; calibration remains insufficient; and the process stops
before holdout and production promotion as required.
