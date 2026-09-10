# Storm cheap-admission cost-aware results

Version: storm-cheap-admission-cost-aware-v1 (schema 1)
Case: titan-to-storm; dataset: sparse-0010; primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010.
Source commit observed: 3e10e230f6f8be0c0eb3bcc8ce3c8f90c4683bf8; expected: 3e10e230f6f8be0c0eb3bcc8ce3c8f90c4683bf8.

## Scope contract

- taskAction=IMPLEMENT; taskDomain=RESEARCH; criticality=MAJOR.
- retry budget: max 3, attempt 3, remaining 0.
- allowed paths: packages/core/benchmarks/research/stormStructuralAdmissionCostAware.ts; packages/core/test/autoeq/v2/research/stormStructuralAdmissionCostAware.test.ts; packages/core/package.json (only a single research script); packages/core/.research-artifacts/storm-cheap-admission-cost-aware-20260910/sparse-0010/*; docs/superpowers/specs/2026-09-10-storm-cheap-admission-cost-aware-results.md.
- forbidden paths: packages/core/src/**; packages/core/benchmarks/research/stormStructuralAdmissionCheapAdmission.ts; packages/core/benchmarks/research/structuralBeam.ts; all previous experiment sources/artifacts/reports; fixtures/baselines; UI/export/product code; vendor/**.
- doNotChange: normal solver policy; frozen selector/reference, Max10, beam width 2, local polish 24, mutation generator, quantization; Standard-v1/parity baselines and previous evidence.
- stop conditions: stop after IMPLEMENTATION_COMPLETE and Terra acceptance; return CROSS_DOMAIN_REQUEST for any required path or domain expansion; do not run all-parent admission, MP rank audit, U12t/Trio, holdout, promotion, merge, release, deploy, or publish.

## Predeclared timing protocol

- repetitions=4; fixed order=["control","cheap-admission","cheap-admission","control","control","cheap-admission","cheap-admission","control"]; same process=true.
- cooperative deadline=60000 ms; evaluationBudget=100000; horizons=5000, 15000, 30000, 60000 ms.
- clock=process.hrtime.bigint; synthetic clock evidence=false; cherry-picking=prohibited.
- machine/runtime: PID 11827, Node v24.20.0, linux/arm64, CPUs 8, model Cortex-A55.

## Causal invariants and signal fidelity

- Control: generate -> lexical order -> top-4 -> full polish -> beam.
- Candidate: initial parent: generate -> canonical pre-polish all 21 -> frozen-selector rank -> top-4 -> full polish -> beam; later parents lexical.
- Invariants: Max10, beam 2, proposals admitted 4, local polish 24, mutation generator structural-mutation-library-v1, quantization standard-v2-quantized.
- Control runtime top-4=[1,2,3,4]; candidate runtime top-4=[3,1,10,9]; fidelity=valid.
- Candidate ranking=3, 1, 10, 9, 11, 6, 4, 8, 13, 2, 5, 14, 12, 15, 16, 7, 19, 17, 20, 21, 18; top-4 audit check=3, 1, 10, 9; match=true.
- Candidate pre-polish canonical evaluations=21; ranking coordinate trials=0; partial refinement coordinate trials=0.
- Oracle inputs used=none.
- Fidelity flags: intervention exactly once=true; lexical restored=true; same initial proposal set=true; reference unchanged=true; normal solver unchanged=true.
- Fidelity mismatches=none.

## Work accounting (raw counts; units are not equated)

| Run | Arm | proposals generated | pre-polish canonical evals | full-polish coordinate trials | descendant evals | canonical delivered evals | parent expansions | admission ms | total ms | stop |
|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|:---|
| 0 | control | 123 | 0 | 192 | 8 | 9 | 5 | 0.000 | 290.149 | no-admissible-proposals |
| 1 | cheap-admission | 125 | 21 | 240 | 10 | 11 | 5 | 98.531 | 338.389 | no-admissible-proposals |
| 2 | cheap-admission | 125 | 21 | 240 | 10 | 11 | 5 | 108.532 | 340.869 | no-admissible-proposals |
| 3 | control | 123 | 0 | 192 | 8 | 9 | 5 | 0.000 | 195.869 | no-admissible-proposals |
| 4 | control | 123 | 0 | 192 | 8 | 9 | 5 | 0.000 | 188.834 | no-admissible-proposals |
| 5 | cheap-admission | 125 | 21 | 240 | 10 | 11 | 5 | 96.927 | 329.457 | no-admissible-proposals |
| 6 | cheap-admission | 125 | 21 | 240 | 10 | 11 | 5 | 103.266 | 340.208 | no-admissible-proposals |
| 7 | control | 123 | 0 | 192 | 8 | 9 | 5 | 0.000 | 174.593 | no-admissible-proposals |

Admission/downstream/total work are retained separately in the JSON artifact. A canonical evaluation and a coordinate trial are deliberately not treated as equivalent units.

## Real phase timing distributions

- Control total elapsed: median=192.351443, min=174.593269, max=290.148692, spread=115.555423, n=4.
- Cheap-admission total elapsed: median=339.298596, min=329.456769, max=340.869230, spread=11.412461, n=4.
- Cheap-admission admission scoring: median=100.898461, min=96.927192, max=108.531884, spread=11.604692, n=4; canonical pre-polish eval time: median=98.824982, min=92.863384, max=107.047693, spread=14.184309, n=4.
- Control phase medians (generation/full-polish/canonical/done/best transition): 40.710442 / 41.462365 / 41.661558 / 0.457404 / 0.001423 ms.
- Cheap-admission phase medians (generation/full-polish/canonical/done/best transition): 50.812155 / 69.118731 / 151.318943 / 0.941289 / 0.009288 ms.

## Best-so-far outcomes

| Pair | Control best RMSE / maxAbs / regret | Candidate best RMSE / maxAbs / regret | Candidate time to control quality | Candidate time to candidate best | Control time to candidate best | Control reaches candidate quality |
|---:|:---|:---|---:|---:|---:|:---|
| 0 | 1.694437 / 6.025019 / 1.635716 | 1.698935 / 5.850643 / 1.550990 | 5.124038 ms | 172.020384 ms | n/a ms | false |
| 1 | 1.694437 / 6.025019 / 1.635716 | 1.698935 / 5.850643 / 1.550990 | 4.484192 ms | 174.123654 ms | n/a ms | false |
| 2 | 1.694437 / 6.025019 / 1.635716 | 1.698935 / 5.850643 / 1.550990 | 4.804846 ms | 160.059615 ms | n/a ms | false |
| 3 | 1.694437 / 6.025019 / 1.635716 | 1.698935 / 5.850643 / 1.550990 | 4.846154 ms | 173.278154 ms | n/a ms | false |

- Control final best distribution: median=1.635716, min=1.635716, max=1.635716, spread=0, n=4 regret; RMSE median=1.694437, min=1.694437, max=1.694437, spread=0, n=4; maxAbs median=6.025019, min=6.025019, max=6.025019, spread=0, n=4.
- Cheap-admission final best distribution: median=1.550990, min=1.550990, max=1.550990, spread=0, n=4 regret; RMSE median=1.698935, min=1.698935, max=1.698935, spread=0, n=4; maxAbs median=5.850643, min=5.850643, max=5.850643, spread=0, n=4.
- Reference improvement indices are recorded per run; reference improvement is not required for temporal recognition.

## Best-so-far at elapsed horizons

| Horizon | Control regret (informative n) | Candidate regret (informative n) | Control RMSE | Candidate RMSE |
|---:|:---|:---|:---|:---|
| 5s | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 |
| 15s | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 |
| 30s | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 |
| 60s | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 (0) | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 | median=n/a, min=n/a, max=n/a, spread=n/a, n=0 |

A horizon is included in aggregate statistics only when the run reached that elapsed time. If a run ended earlier, its terminal state is retained in the raw per-run `horizonStates` with `informative=false`, never promoted to a truthful deadline summary.

## Quality-Time Frontier

- Formula version=1; descriptor={"integration":"left-continuous-piecewise-constant-log-time","qualityTransform":"exp(-max(0,regret))","reference":"oracle-reference-snapshot-v1:deliverable-frontier","regret":"directed-reference-regret-v1","tMaxSeconds":60,"tMinSeconds":0.5,"version":1}; SHA-256=10d387db6ea37b2cbdf6a5c6c614c5d3f0a790046e45cbadfa931b32471d9965.
- Applicability=some-runs-did-not-reach-60s; control=median=n/a, min=n/a, max=n/a, spread=n/a, n=0; cheap-admission=median=n/a, min=n/a, max=n/a, spread=n/a, n=0.

## Raw elapsed best-so-far trajectories

- Run 0 (control, pair 0): 0@12.415ms=1.694437 / 6.025019 / 1.635716
- Run 1 (cheap-admission, pair 0): 0@5.124ms=1.694437 / 6.025019 / 1.635716; 4@172.020ms=1.698935 / 5.850643 / 1.550990
- Run 2 (cheap-admission, pair 1): 0@4.484ms=1.694437 / 6.025019 / 1.635716; 4@174.124ms=1.698935 / 5.850643 / 1.550990
- Run 3 (control, pair 1): 0@5.147ms=1.694437 / 6.025019 / 1.635716
- Run 4 (control, pair 2): 0@4.810ms=1.694437 / 6.025019 / 1.635716
- Run 5 (cheap-admission, pair 2): 0@4.805ms=1.694437 / 6.025019 / 1.635716; 4@160.060ms=1.698935 / 5.850643 / 1.550990
- Run 6 (cheap-admission, pair 3): 0@4.846ms=1.694437 / 6.025019 / 1.635716; 4@173.278ms=1.698935 / 5.850643 / 1.550990
- Run 7 (control, pair 3): 0@4.467ms=1.694437 / 6.025019 / 1.635716

## Variability and classification

- pairedTotalElapsedDeltaMs: median=142.811557, min=48.240077, max=165.615154, spread=117.375077, n=4.
- pairedAdmissionScoringDeltaMs: median=100.898461, min=96.927192, max=108.531884, spread=11.604692, n=4.
- pairedBestRegretDelta: median=-0.084726, min=-0.084726, max=-0.084726, spread=0, n=4.
- pairedBestRmseDeltaDb: median=0.004499, min=0.004499, max=0.004499, spread=0, n=4.
- pairedBestMaxAbsDeltaDb: median=-0.174376, min=-0.174376, max=-0.174376, spread=0, n=4.
- cheapAdmissionTimeToControlQualityMs: median=4.825500, min=4.484192, max=5.124038, spread=0.639846, n=4.
- cheapAdmissionTimeToCandidateBestQualityMs: median=172.649269, min=160.059615, max=174.123654, spread=14.064039, n=4.
- controlTimeToCandidateBestQualityMs: median=n/a, min=n/a, max=n/a, spread=n/a, n=0.
- Classification: **cost-aware-admission-supported**.

### Facts

- Runtime control top-4=[1,2,3,4]; candidate frozen-selector top-4=[3,1,10,9].
- Candidate initial admission charged 21 canonical pre-polish evaluations per run; partial-refinement coordinate trials=0.
- The protocol executed 8 runs in one process with fixed order ["control","cheap-admission","cheap-admission","control","control","cheap-admission","cheap-admission","control"] and 4 paired repetitions.
- Cooperative deadline reached: control 0/4; cheap-admission 0/4. Remaining runs terminated naturally with no-admissible-proposals, and no run bound on the evaluation budget.
- Median final Directed Reference Regret v1 was control 1.6357158771757774 versus cheap-admission 1.5509895845764776; paired median delta (candidate-control)=-0.08472629259929976.
- Median paired total elapsed delta (candidate-control)=142.811557 ms; candidate admission scoring median=100.8984615 ms.
- At 5/15/30/60 seconds, informative runs were 5s:0/0, 15s:0/0, 30s:0/0, 60s:0/0; all four horizons are non-applicable because the naturally completed runs ended before 1 second.
- Control reached candidate terminal quality in 0/4 paired runs.
- Median QTF was control not applicable versus cheap-admission not applicable.
- Frozen proposal inventory contains 21 initial proposals and was reproduced from the approved census/replay inputs.

### Interpretation

- Under the predeclared paired protocol, the candidate retains a material terminal-quality/time-to-quality advantage after charging admission; median paired elapsed delta was 142.811557 ms and median regret delta was -0.08472629259929976. The runs naturally completed before 1 second, so 5/15/30/60-second summaries and QTF are not applicable yet.

### Boundaries and next step

- This result is limited to the Storm sparse-0010 frozen parent and Max10/beam-2/local-polish-24 configuration.
- It does not authorize changing normal solver policy, applying cheap admission to all parents, generalizing to U12t/Trio, promotion, merge, release, deploy, or publish.
- The previous oracle rescue is diagnostic only and is not a competitive arm in this cost-aware comparison.
- The signal is outcome-blind: no full-polish outcomes, oracle labels, or future-parent outcomes enter the initial ranker.
- Next causal experiment: apply the same signal outcome-blind to every structural parent of Storm, still separately from U12t/Trio and promotion.

## Artifacts, hashes, and exact gate status

- Artifact SHA-256 (file as written): d645d4a7af10a1630d4cb136eef87b9d5e3943b3800b1dce01da43536678145f. Self-hash field is null to avoid circular hashing.
- Source artifact: c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351; census: 62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0; replay: 930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba; signal audit: 8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc; semantic set: 1db7e2cbb3a1542c97666757a9e4cac09f223294035d78d18be3c5c500e69f99; reference snapshot: 0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3.
- Deterministic reproduction summary SHA-256: 276828067791c608f23ac22945d0652c89819e8b4e4d3d3422f36dc56fe8550e. Timing values are intentionally nondeterministic and are not used by the reproduction hash.
- focused: PASS_THIS_RUN.
- rootTest: NOT_RUN.
- typecheck: PASS_THIS_RUN.
- build: NOT_RUN.
- lint: NOT_RUN.
- benchmark: NOT_RUN.
- diffCheck: PASS_THIS_RUN.
- routingPolicy: PASS_PREVIOUSLY_VERIFIED.
- Focused test: pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionCostAware.test.ts.
- Generation: pnpm --filter @autoeq-workbench/core research:storm-structural-admission-cost-aware.
- Required gates: pnpm test; pnpm typecheck; pnpm build; pnpm lint; pnpm --filter @autoeq-workbench/core benchmark; git diff --check; node --test .agents/skills/astra-orchestra/routing-policy.test.mjs.

This evidence stops at the cost-aware Storm experiment and does not change normal solver policy or authorize promotion, merge, release, deployment, or publication.
