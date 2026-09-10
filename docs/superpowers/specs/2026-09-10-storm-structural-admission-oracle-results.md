# Storm structural admission oracle results

Version: storm-structural-admission-oracle-v1 (schema 1)  
Case: titan-to-storm  
Primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010  
Source commit: 26ba86bdb17e0b5d365fd51590dd6abdb4636b96  
Census producer commit: 989832ea9f6aca047433b64107d07cc61ada1bea  
Producer commit: 853722fbf7784f9983de8e3a963ba8456ae06ccd

## Scope and causal contract

This is experimental evidence only. It compares an unmodified control with an oracle rescue of the frozen census rank-9 proposal for the initial parent. The census's 21 offline evaluations are not charged to either arm; the intervention is oracle knowledge and cannot infer a deployable ranking signal.

Both arms use the current generator, current ordering, top-4 admission, localPolish=24, canonical delivered evaluation, standard-v2 quantization, frozen reference selector, Max10, beam width 2, and cooperative deadline semantics. The rescue is active only during expansion of the frozen initial parent; all later parent expansions use the normal policy. U12t and Trio are excluded.

Current admission contract: generate -> current orderStructuralProposals -> slice(0,4) -> polish -> beam.
Intervention scope: rescue only during expansion of frozen initial parent.
A current rank is solver ordering only; the first proposal is rank-1 by current lexical ordering.

## Frozen inputs and rescue identity

- Census: repo:packages/core/.research-artifacts/storm-structural-proposal-census-20260910/sparse-0010/census-report.json (62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0)
- Diagnostic replay: repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json (930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba)
- Reference snapshot: external:OracleReferenceSnapshotV1.json (0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3)
- Frozen parent: matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000
- Rescue mutation/rank/ordinal: remove / 9 / 5
- Rescue semantic structure SHA-256: d43a7b6632ea1acd1d98a3fa26bdc70471529564a74a7786d200486343ff09b8
- Provenance and current generated/ordered semantic structure validated: true.

## Work accounting

- Descendant budget: exactly 8 new evaluations per arm; seed validation is separate (run input total 9).
- Control descendants: 8; rescue descendants: 8; equal work: true.
- Census offline evaluations charged to either arm: false (count 21).

## Intervention and fidelity

- Rescue applied exactly once: true; initial-parent-only: true; no later hook effect: true.
- Normal admitted count: 4; effective initial admission: [{"mutation":"merge","filters":[{"id":"autoeq-1","enabled":true,"type":"PK","frequencyHz":174,"gainDb":-6.3,"q":8},{"id":"autoeq-2","enabled":true,"type":"PK","frequencyHz":2635,"gainDb":-5.6,"q":8},{"id":"autoeq-3","enabled":true,"type":"PK","frequencyHz":3320,"gainDb":-6.3,"q":8},{"id":"autoeq-4","enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-9.3,"q":8},{"id":"autoeq-5","enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"id":"autoeq-6","enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"id":"autoeq-7","enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"id":"autoeq-8","enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"id":"merge-autoeq-9-autoeq-10","enabled":true,"type":"HS","frequencyHz":19562.082350226,"gainDb":15,"q":0.7}]},{"mutation":"remove","filters":[{"id":"autoeq-1","enabled":true,"type":"PK","frequencyHz":174,"gainDb":-6.3,"q":8},{"id":"autoeq-2","enabled":true,"type":"PK","frequencyHz":2635,"gainDb":-5.6,"q":8},{"id":"autoeq-3","enabled":true,"type":"PK","frequencyHz":3320,"gainDb":-6.3,"q":8},{"id":"autoeq-4","enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-9.3,"q":8},{"id":"autoeq-5","enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"id":"autoeq-6","enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"id":"autoeq-7","enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"id":"autoeq-8","enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"id":"autoeq-10","enabled":true,"type":"HS","frequencyHz":19897,"gainDb":10.5,"q":0.7}]},{"mutation":"remove","filters":[{"id":"autoeq-1","enabled":true,"type":"PK","frequencyHz":174,"gainDb":-6.3,"q":8},{"id":"autoeq-2","enabled":true,"type":"PK","frequencyHz":2635,"gainDb":-5.6,"q":8},{"id":"autoeq-3","enabled":true,"type":"PK","frequencyHz":3320,"gainDb":-6.3,"q":8},{"id":"autoeq-4","enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-9.3,"q":8},{"id":"autoeq-5","enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"id":"autoeq-6","enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"id":"autoeq-7","enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"id":"autoeq-8","enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"id":"autoeq-9","enabled":true,"type":"HS","frequencyHz":19331,"gainDb":15,"q":0.7}]},{"mutation":"remove","filters":[{"id":"autoeq-1","enabled":true,"type":"PK","frequencyHz":174,"gainDb":-6.3,"q":8},{"id":"autoeq-2","enabled":true,"type":"PK","frequencyHz":2635,"gainDb":-5.6,"q":8},{"id":"autoeq-4","enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-9.3,"q":8},{"id":"autoeq-5","enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"id":"autoeq-6","enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"id":"autoeq-7","enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"id":"autoeq-8","enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"id":"autoeq-9","enabled":true,"type":"HS","frequencyHz":19331,"gainDb":15,"q":0.7},{"id":"autoeq-10","enabled":true,"type":"HS","frequencyHz":19897,"gainDb":10.5,"q":0.7}]}].
- Control fidelity: valid; initial parent matched: true; initial top-4 matched: true; canonical metrics within tolerance: true; selected best matched: true.
- Fidelity mismatches: none.

## Arm results

| Arm | Seed evals | Descendant evals | Selected best RMSE / maxAbs / regret | First useful change | Best eval index | Pareto novel vs seed baseline | Descendant-only Pareto novel | Layers | Stop |
|:---|---:|---:|:---|---:|---:|---:|---:|---:|:---|
| control | 1 | 8 | 1.69443656174349 / 6.025019146179327 / 1.6357158771757774 | none | none | 2 | 2 | 2 | evaluation-budget |
| rescue | 1 | 8 | 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776 | 4 | 4 | 3 | 3 | 2 | evaluation-budget |

### Full control trajectory

| Evaluation | Candidate | Parent | Mutation | Rank | RMSE / maxAbs / regret | Reference improved |
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

### Full rescue trajectory

| Evaluation | Candidate | Parent | Mutation | Rank | RMSE / maxAbs / regret | Reference improved |
|---:|:---|:---|:---|---:|:---|:---:|
| 0 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | seed | seed-validation | - | 1.69443656174349 / 6.025019146179327 / 1.6357158771757774 | no |
| 1 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-merge:0001 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | merge | 1 | 1.8600490806256555 / 5.899909013582937 / 2.1811260718628063 | no |
| 2 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-2-remove:0002 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 2 | 2.1878625643339666 / 8.715501215505615 / 5.554226132480243 | no |
| 3 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 3 | 1.8367740125912453 / 5.904748612556391 / 2.094299508592714 | no |
| 4 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 4 | 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776 | no |
| 5 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-8-remove:0005 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000 | remove | 4 | 2.0487535434545334 / 6.720068525948621 / 3.327445720248407 | no |
| 6 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-add-hs:0006 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | add-hs | 1 | 2.7381023902574424 / 9.742054277385389 / 8.034154198353427 | no |
| 7 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-10-add-ls:0007 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | add-ls | 2 | 3.9195168227441246 / 7.739734891765611 / 10.776419279311305 | no |
| 8 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-11-add-pk:0008 | matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004 | add-pk | 3 | 2.273446386146832 / 8.320833081552841 / 5.379893302151267 | no |

## Classification

Classification: **admission-causal-impact-supported**.

- Control evaluated 8 new descendants; rescue evaluated 8.
- Rescue rank 9 was restored only for the frozen initial parent after the first three current admissions.
- Rescue selected-best metrics/regret are materially better at the budget end.
- The census 21 offline evaluations are not charged to either arm; this is oracle knowledge and cannot infer a deployable ranking signal.

Guards:

- This is experimental evidence only; it does not change production ranking or admission policy.
- No U12t or Trio arm was run.
- Absence of reference improvement cannot negate a relatively better arm.
- The phrase rank-1 by current lexical ordering describes the first current proposal only; it is not a claim of overall quality.

## Facts, hashes, and gates

- Control final selected best: {"candidateId":"matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000","evaluationIndex":0,"metrics":{"rmseDb":1.69443656174349,"maxAbsDb":6.025019146179327,"filterCount":10,"cancellationScore":0,"referenceRegret":1.6357158771757774,"referenceImproved":false}}
- Rescue final selected best: {"candidateId":"matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004","evaluationIndex":4,"metrics":{"rmseDb":1.6989353408590506,"maxAbsDb":5.850643387777495,"filterCount":9,"cancellationScore":0,"referenceRegret":1.5509895845764776,"referenceImproved":false}}
- Rescue final regret better: true; final metrics better: false; prefix advantage: true.
- Selected-best changed between arms: true; work equal: true; fidelity valid: true.
- Artifact SHA-256: ba0dcd1c68682726e274af4db82567785d8c95b18cf8701ee35a2147398d2aeb
- Focused tests: pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionOracle.test.ts test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts test/autoeq/v2/research/structuralBeam.test.ts
- Focused oracle/census/replay/beam tests: PASS (23 tests).
- pnpm typecheck: PASS.
- pnpm build: PASS.
- pnpm lint: PASS.
- pnpm test: BLOCKED by two unrelated pre-existing floating-point/parity fixture failures (Standard-v1 metrics and solver-lab canonical response).
- pnpm --filter @autoeq-workbench/core benchmark: BLOCKED by existing Standard-v1 benchmark drift; no baseline update was made.
- git diff --check: PASS.
- routing-policy.test.mjs from the repository checkout owning .agents: PASS (28 tests).
- Required gates: pnpm test, pnpm typecheck, pnpm build, pnpm lint, pnpm --filter @autoeq-workbench/core benchmark, git diff --check, node --test .agents/skills/astra-orchestra/routing-policy.test.mjs
- Generation: pnpm --filter @autoeq-workbench/core research:storm-structural-admission-oracle

The JSON artifact contains full per-descendant filters, canonical metrics, trajectory points, selected-best changes, Pareto frontier, parent transitions, final beam, provenance, and contract hashes.

## Machine-readable arm detail

```json
{
  "control": {
    "trajectory": [
      {
        "evaluationCount": 0,
        "elapsedMs": 0,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "actualDeliveredFilterCount": 10,
        "canonicalRmseDb": 1.69443656174349,
        "canonicalMaxAbsDb": 6.025019146179327,
        "referenceRegret": 1.6357158771757774,
        "referenceImproved": false
      }
    ],
    "selectedBest": {
      "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
      "evaluationIndex": 0,
      "metrics": {
        "rmseDb": 1.69443656174349,
        "maxAbsDb": 6.025019146179327,
        "filterCount": 10,
        "cancellationScore": 0,
        "referenceRegret": 1.6357158771757774,
        "referenceImproved": false
      }
    },
    "selectedBestChanges": [],
    "paretoNoveltyVsSeedBaseline": {
      "againstSeedBaselines": 2,
      "descendantsOnly": 2,
      "frontier": [
        {
          "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
          "evaluationIndex": 0,
          "rmseDb": 1.69443656174349,
          "maxAbsDb": 6.025019146179327,
          "filterCount": 10
        },
        {
          "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-merge:0001",
          "evaluationIndex": 1,
          "rmseDb": 1.8600490806256555,
          "maxAbsDb": 5.899909013582937,
          "filterCount": 9
        },
        {
          "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
          "evaluationIndex": 3,
          "rmseDb": 1.8367740125912453,
          "maxAbsDb": 5.904748612556391,
          "filterCount": 9
        }
      ]
    },
    "firstUsefulChange": null,
    "bestEvaluationIndex": null,
    "layersExpanded": 2,
    "parentTransitions": [
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003"
    ],
    "finalBeam": [
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003"
    ],
    "descendants": [
      {
        "evaluationIndex": 1,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-merge:0001",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "merge",
        "proposalRank": 1,
        "proposalOrdinal": 1,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "merge-autoeq-9-autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19562.082350226,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19562,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 1.8600490806256555,
          "maxAbsDb": 5.899909013582937,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 2.1811260718628063,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 2,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-2-remove:0002",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 2,
        "proposalOrdinal": 2,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 155,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2348,
            "gainDb": -4.6,
            "q": 11.31
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -8.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.1878625643339666,
          "maxAbsDb": 8.715501215505615,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 5.554226132480243,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 3,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 3,
        "proposalOrdinal": 3,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 1.8367740125912453,
          "maxAbsDb": 5.904748612556391,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 2.094299508592714,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 4,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 4,
        "proposalOrdinal": 4,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 155,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2348,
            "gainDb": -4.6,
            "q": 11.31
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -8.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.0487535434545334,
          "maxAbsDb": 6.720068525948621,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 3.327445720248407,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 5,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-add-hs:0005",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "mutation": "add-hs",
        "proposalRank": 1,
        "proposalOrdinal": 9,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "struct-add-hs",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.904748612556391,
            "q": 0.7
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 7561,
            "gainDb": -5.9,
            "q": 0.7
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.935908327489881,
          "maxAbsDb": 10.748055358688767,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 9.55468848854771,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 6,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-10-add-ls:0006",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "mutation": "add-ls",
        "proposalRank": 2,
        "proposalOrdinal": 10,
        "filtersBeforePolish": [
          {
            "id": "struct-add-ls",
            "enabled": true,
            "type": "LS",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.904748612556391,
            "q": 0.7
          },
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "LS",
            "frequencyHz": 6736,
            "gainDb": -4.9,
            "q": 0.7
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 4.114570305309717,
          "maxAbsDb": 7.760580508377698,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 11.53345442621294,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 7,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-11-add-pk:0007",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "mutation": "add-pk",
        "proposalRank": 3,
        "proposalOrdinal": 11,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "struct-add-pk",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.904748612556391,
            "q": 1.0954451150103324
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7561,
            "gainDb": -5.9,
            "q": 1.1
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.3550607370740586,
          "maxAbsDb": 8.42771244108759,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 5.7108370285344625,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 8,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-12-remove:0008",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "mutation": "remove",
        "proposalRank": 4,
        "proposalOrdinal": 12,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          }
        ],
        "metrics": {
          "rmseDb": 2.3565191091696174,
          "maxAbsDb": 13.995917754598986,
          "filterCount": 8,
          "cancellationScore": 0,
          "referenceRegret": 12.138469628359433,
          "referenceImproved": false
        }
      }
    ]
  },
  "rescue": {
    "trajectory": [
      {
        "evaluationCount": 0,
        "elapsedMs": 0,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "actualDeliveredFilterCount": 10,
        "canonicalRmseDb": 1.69443656174349,
        "canonicalMaxAbsDb": 6.025019146179327,
        "referenceRegret": 1.6357158771757774,
        "referenceImproved": false
      },
      {
        "evaluationCount": 4,
        "elapsedMs": 0,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "actualDeliveredFilterCount": 9,
        "canonicalRmseDb": 1.6989353408590506,
        "canonicalMaxAbsDb": 5.850643387777495,
        "referenceRegret": 1.5509895845764776,
        "referenceImproved": false
      }
    ],
    "selectedBest": {
      "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
      "evaluationIndex": 4,
      "metrics": {
        "rmseDb": 1.6989353408590506,
        "maxAbsDb": 5.850643387777495,
        "filterCount": 9,
        "cancellationScore": 0,
        "referenceRegret": 1.5509895845764776,
        "referenceImproved": false
      }
    },
    "selectedBestChanges": [
      {
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "evaluationIndex": 4,
        "metrics": {
          "rmseDb": 1.6989353408590506,
          "maxAbsDb": 5.850643387777495,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 1.5509895845764776,
          "referenceImproved": false
        }
      }
    ],
    "paretoNoveltyVsSeedBaseline": {
      "againstSeedBaselines": 3,
      "descendantsOnly": 3,
      "frontier": [
        {
          "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
          "evaluationIndex": 0,
          "rmseDb": 1.69443656174349,
          "maxAbsDb": 6.025019146179327,
          "filterCount": 10
        },
        {
          "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
          "evaluationIndex": 4,
          "rmseDb": 1.6989353408590506,
          "maxAbsDb": 5.850643387777495,
          "filterCount": 9
        }
      ]
    },
    "firstUsefulChange": 4,
    "bestEvaluationIndex": 4,
    "layersExpanded": 2,
    "parentTransitions": [
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004"
    ],
    "finalBeam": [
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
      "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004"
    ],
    "descendants": [
      {
        "evaluationIndex": 1,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-1-merge:0001",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "merge",
        "proposalRank": 1,
        "proposalOrdinal": 1,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "merge-autoeq-9-autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19562.082350226,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19562,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 1.8600490806256555,
          "maxAbsDb": 5.899909013582937,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 2.1811260718628063,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 2,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-2-remove:0002",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 2,
        "proposalOrdinal": 2,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 155,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2348,
            "gainDb": -4.6,
            "q": 11.31
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -8.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.1878625643339666,
          "maxAbsDb": 8.715501215505615,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 5.554226132480243,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 3,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-3-remove:0003",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 3,
        "proposalOrdinal": 3,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3727,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 1.8367740125912453,
          "maxAbsDb": 5.904748612556391,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 2.094299508592714,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 4,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 4,
        "proposalOrdinal": 4,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 1.6989353408590506,
          "maxAbsDb": 5.850643387777495,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 1.5509895845764776,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 5,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-8-remove:0005",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000",
        "mutation": "remove",
        "proposalRank": 4,
        "proposalOrdinal": 8,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 3320,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 155,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2348,
            "gainDb": -4.6,
            "q": 11.31
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -5.3,
            "q": 11.31
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -8.3,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.0487535434545334,
          "maxAbsDb": 6.720068525948621,
          "filterCount": 9,
          "cancellationScore": 0,
          "referenceRegret": 3.327445720248407,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 6,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-add-hs:0006",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "mutation": "add-hs",
        "proposalRank": 1,
        "proposalOrdinal": 9,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 5.66
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "struct-add-hs",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.850643387777495,
            "q": 0.7
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4183,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -14,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 7561,
            "gainDb": -5.9,
            "q": 0.7
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.7381023902574424,
          "maxAbsDb": 9.742054277385389,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 8.034154198353427,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 7,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-10-add-ls:0007",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "mutation": "add-ls",
        "proposalRank": 2,
        "proposalOrdinal": 10,
        "filtersBeforePolish": [
          {
            "id": "struct-add-ls",
            "enabled": true,
            "type": "LS",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.850643387777495,
            "q": 0.7
          },
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 5.66
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "LS",
            "frequencyHz": 6736,
            "gainDb": -4.9,
            "q": 0.7
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 3.9195168227441246,
          "maxAbsDb": 7.739734891765611,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 10.776419279311305,
          "referenceImproved": false
        }
      },
      {
        "evaluationIndex": 8,
        "candidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-11-add-pk:0008",
        "parentCandidateId": "matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004",
        "mutation": "add-pk",
        "proposalRank": 3,
        "proposalOrdinal": 11,
        "filtersBeforePolish": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 195,
            "gainDb": -7.3,
            "q": 5.66
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2958,
            "gainDb": -6.6,
            "q": 5.66
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -10.3,
            "q": 5.66
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -15,
            "q": 8
          },
          {
            "id": "struct-add-pk",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7561.349867210237,
            "gainDb": -5.850643387777495,
            "q": 1.0954451150103324
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "canonicalFilters": [
          {
            "id": "autoeq-1",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 174,
            "gainDb": -6.3,
            "q": 8
          },
          {
            "id": "autoeq-2",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 2635,
            "gainDb": -5.6,
            "q": 8
          },
          {
            "id": "autoeq-3",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 4695,
            "gainDb": -9.3,
            "q": 8
          },
          {
            "id": "autoeq-4",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7453,
            "gainDb": -14,
            "q": 8
          },
          {
            "id": "autoeq-5",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 7561,
            "gainDb": -5.9,
            "q": 1.1
          },
          {
            "id": "autoeq-6",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 12902,
            "gainDb": 6.3,
            "q": 8
          },
          {
            "id": "autoeq-7",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 16731,
            "gainDb": -9.7,
            "q": 8
          },
          {
            "id": "autoeq-8",
            "enabled": true,
            "type": "PK",
            "frequencyHz": 18246,
            "gainDb": 9,
            "q": 8
          },
          {
            "id": "autoeq-9",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19331,
            "gainDb": 15,
            "q": 0.7
          },
          {
            "id": "autoeq-10",
            "enabled": true,
            "type": "HS",
            "frequencyHz": 19897,
            "gainDb": 10.5,
            "q": 0.7
          }
        ],
        "metrics": {
          "rmseDb": 2.273446386146832,
          "maxAbsDb": 8.320833081552841,
          "filterCount": 10,
          "cancellationScore": 0,
          "referenceRegret": 5.379893302151267,
          "referenceImproved": false
        }
      }
    ]
  }
}
```
