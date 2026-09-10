# Storm cheap-admission causal results

Version: storm-cheap-admission-causal-v1 (schema 1)
Case: titan-to-storm
Primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010
Source commit observed: 6d4bd2f966860362a87e29cdea9c859cd6683c87
Frozen source commit: 6d4bd2f966860362a87e29cdea9c859cd6683c87

## Scope contract

- taskAction: IMPLEMENT; taskDomain: RESEARCH; criticality: MAJOR.
- retry budget: max 3, attempt 1, remaining 2.
- allowed paths: packages/core/benchmarks/research/stormStructuralAdmissionCheapAdmission.ts; packages/core/test/autoeq/v2/research/stormStructuralAdmissionCheapAdmission.test.ts; packages/core/package.json (one research script only); packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/*; docs/superpowers/specs/2026-09-10-storm-cheap-admission-causal-results.md.
- forbidden paths: packages/core/src/**; packages/core/benchmarks/research/structuralBeam.ts; packages/core/benchmarks/research/stormStructuralAdmissionOracle.ts; packages/core/benchmarks/research/stormStructuralAdmissionSignalAudit.ts; historic evidence roots and reports; fixtures/baselines; UI/export/product code; vendor/**.
- dependencies: frozen source commit 6d4bd2f966860362a87e29cdea9c859cd6683c87; frozen census/replay/signal-audit hashes; frozen reference selector and snapshot; canonical delivered evaluator and structural beam.
- doNotChange: normal solver admission policy; mutation library, frozen selector, frozen reference, Max10, Standard-v1 fixtures/baselines; UI, export, product behavior, and historical artifacts.
- stop conditions: stop after IMPLEMENTATION_COMPLETE and Terra acceptance decision; return CROSS_DOMAIN_REQUEST for any required path/domain expansion; do not run time-to-quality, other parents/datasets, promotion, merge, release, deploy, or publish.

## Experimental causal contract

The normal solver admission policy is unchanged. The control arm is generate → lexical order → top-4 → full polish → beam. The cheap-admission arm computes canonical pre-polish delivered metrics for all 21 proposals only while expanding the frozen initial parent, ranks them with the frozen reference-selector-v1 key, admits four, and returns to lexical admission for later parents.

Configuration: Max10, beam width 2, 4 proposals admitted per parent, local polish 24, exactly 8 descendants per arm.
Frozen inputs: audit 8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc; census 62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0; replay 930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba; source c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351; reference snapshot 0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3.

## Signal definition and fidelity

The runtime signal uses only proposal structure, canonical delivered pre-polish metrics, and lexical rank as a deterministic tie-break. It does not read full-polish outcomes, census labels, oracle rank, or rank-9 identity. Candidate ranking performs no partial refinement.

- Runtime ranking: 3, 1, 10, 9, 11, 6, 4, 8, 13, 2, 5, 14, 12, 15, 16, 7, 19, 17, 20, 21, 18.
- Runtime top-4: 3, 1, 10, 9; audit acceptance check: 3, 1, 10, 9; match=true.
- Canonical pre-polish evaluations: 21; ranking coordinate trials: 0; partial-refinement coordinate trials: 0.
- Oracle inputs used: none.
- Fidelity status: valid; mismatches: none.

## Work accounting

- Generated proposals: control 21, cheap-admission 21; same initial set=true.
- Descendant evaluations: control 8, cheap-admission 8; equal downstream work=true.
- Admission overhead control: 0 canonical pre-polish evaluations + 0 ranking coordinate trials; elapsed admission=0 ms.
- Admission overhead cheap-admission: 21 canonical pre-polish evaluations + 0 ranking coordinate trials; elapsed admission=0 ms.
- Full-polish coordinate trials: control 192, cheap-admission 192; elapsed total observed: control 0 ms, cheap-admission 0 ms.

## Arm outcomes

| Arm | Selected-best RMSE / maxAbs / regret | Selected-best changes | First useful change | Best evaluation index | Pareto novel vs seed | Pareto novel descendants-only | Reference improvements | Parent transitions | Final beam |
|:---|:---|---:|---:|---:|---:|---:|---:|:---|:---|
| control | 1.69443656174349 / 6.025019146179327 / 1.6357158771757774 | 0 | none | 0 | 2 | 2 | 0 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 → matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000, matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 |
| cheap-admission | 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776 | 1 | 4 | 4 | 4 | 4 | 0 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 → matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000, matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 |

### Control trajectory by evaluation

| Evaluation | Candidate | Parent | Mutation | Lexical proposal rank | RMSE / maxAbs / regret | Reference improved |
|---:|:---|:---|:---|---:|:---|:---:|
| 0 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | seed | seed-validation | - | 1.69443656174349 / 6.025019146179327 / 1.6357158771757774 | no |
| 1 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-merge:0001 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | merge | 1 | 1.8600490806256555 / 5.899909013582937 / 2.1811260718628063 | no |
| 2 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-2-remove:0002 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 2 | 2.1878625643339666 / 8.715501215505615 / 5.554226132480243 | no |
| 3 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 3 | 1.8367740125912453 / 5.904748612556391 / 2.094299508592714 | no |
| 4 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 4 | 2.0487535434545334 / 6.720068525948621 / 3.327445720248407 | no |
| 5 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-add-hs:0005 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | add-hs | 1 | 2.935908327489881 / 10.748055358688767 / 9.55468848854771 | no |
| 6 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-10-add-ls:0006 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | add-ls | 2 | 4.114570305309717 / 7.760580508377698 / 11.53345442621294 | no |
| 7 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-11-add-pk:0007 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | add-pk | 3 | 2.3550607370740586 / 8.42771244108759 / 5.7108370285344625 | no |
| 8 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-12-remove:0008 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | remove | 4 | 2.3565191091696174 / 13.995917754598986 / 12.138469628359433 | no |

### Cheap-admission trajectory by evaluation

| Evaluation | Candidate | Parent | Mutation | Lexical proposal rank | RMSE / maxAbs / regret | Reference improved |
|---:|:---|:---|:---|---:|:---|:---:|
| 0 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | seed | seed-validation | - | 1.69443656174349 / 6.025019146179327 / 1.6357158771757774 | no |
| 1 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-remove:0001 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 3 | 1.8367740125912453 / 5.904748612556391 / 2.094299508592714 | no |
| 2 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-2-merge:0002 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | merge | 1 | 1.8600490806256555 / 5.899909013582937 / 2.1811260718628063 | no |
| 3 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 10 | 1.8775808187066088 / 5.803573701724353 / 2.21506257426515 | no |
| 4 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 9 | 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776 | no |
| 5 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-6-remove:0005 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 2 | 2.1878625643339666 / 8.715501215505615 / 5.554226132480243 | no |
| 6 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-8-remove:0006 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 4 | 2.0487535434545334 / 6.720068525948621 / 3.327445720248407 | no |
| 7 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-add-hs:0007 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | add-hs | 1 | 2.7381023902574424 / 9.742054277385389 / 8.034154198353427 | no |
| 8 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-10-add-ls:0008 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | add-ls | 2 | 3.9195168227441246 / 7.739734891765611 / 10.776419279311305 | no |

## Classification

Classification: **cheap-admission-causal-impact-supported**.

### Measured facts

- Control initial lexical top-4: 1, 2, 3, 4; runtime candidate pre-polish frozen-selector top-4: 3, 1, 10, 9.
- The candidate ranked 21 generated proposals with zero partial-refinement coordinate trials.
- Control and cheap-admission arms evaluated 8 and 8 descendants respectively; equal downstream work=true.
- Control selected-best RMSE/maxAbs/regret: 1.69443656174349 / 6.025019146179327 / 1.6357158771757774.
- Cheap-admission selected-best RMSE/maxAbs/regret: 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776.
- Candidate admission overhead: 21 canonical pre-polish evaluations, 0 ranking coordinate trials, elapsed admission=0 ms under injected clock.

### Interpretation

- Neste parent/configuração Storm, admission outcome-blind baseado no frozen selector pre-polish recupera parte do headroom perdido pela ordem lexical sob o mesmo downstream budget.

### Boundaries and next step

- O oracle rescue anterior é somente teto diagnóstico, não terceiro braço competitivo.
- A conclusão cobre somente este parent/configuração Storm e equal downstream work; não implica equal total compute, wall-clock, time-to-quality ou política final.
- Não houve execução em outros parents, U12t/Trio, holdout, MP rank audit, promotion ou default change.
- Reference improvement é reportado, mas não é requisito para reconhecer melhoria relativa.
- Recomendação: próximo experimento cost-aware/time-to-quality incorporando o overhead real; não executar automaticamente nesta rodada.

## Oracle ceiling (diagnostic only)

The previous oracle rescue is not a competitive third arm. Its diagnostic control regret was 1.6357158772; oracle rescue regret was 1.5509895846.

## Hashes, tests, and gates

- New artifact SHA-256: 6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc.
- pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionCheapAdmission.test.ts test/autoeq/v2/research/stormStructuralAdmissionOracle.test.ts test/autoeq/v2/research/stormStructuralAdmissionSignalAudit.test.ts test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts test/autoeq/v2/research/structuralBeam.test.ts.
- focused: PASS (focused cheap-admission test: 6/6; focused research cross-suite: 35/35).
- rootTest: BLOCKED / not rerun in retry: known pre-existing parityFixture and runStandardAutoEq failures.
- typecheck: PASS (core typecheck previously verified; root gate not rerun in retry).
- build: NOT RUN in retry.
- lint: NOT RUN in retry.
- benchmark: BLOCKED / not rerun in retry: known pre-existing Standard-v1 benchmark drift.
- diffCheck: PASS (git diff --check exit 0; each directed git diff --no-index --check exited 1 with no whitespace diagnostics; exit 1 is the expected content difference).
- routingPolicy: WORKTREE BLOCKED / .agents absent in linked worktree; passes from /root/projects/autoeq-workbench.
- Required commands: pnpm test, pnpm typecheck, pnpm build, pnpm lint, pnpm --filter @autoeq-workbench/core benchmark, git diff --check, node --test .agents/skills/astra-orchestra/routing-policy.test.mjs.
- Generation command: pnpm --filter @autoeq-workbench/core research:storm-structural-admission-cheap.

This evidence is bounded to the frozen Storm sparse-0010 parent. It does not authorize a policy change, promotion, merge, release, deployment, or publication.
