# Storm single-blocker bridge causal experiment results

Version: storm-single-blocker-bridge-causal-v1 (schema 1)
Case: titan-to-storm; primary=matching-pursuit-v1:titan-to-storm:0:sparse-0010
Classification: **single-blocker-bridge-causal-impact-supported**
Producer commit: bf48b8e6500aa74bb9fba893adb88a6cf78b98c4

## Executive summary

This experiment tests the causal search value of releasing exactly one blocking decision: hop-1 admission of intermediate rank 16 (split mutation). Under equal evaluation work of 8 descendant evaluations (9 total canonical evaluations) across both arms, the one-time hop-1 admission rescue is sufficient for the unchanged structural search (beam width 2, proposals per parent 4, local polish 24) to naturally retain the intermediate, expand it at hop 2, admit its grandchild (lexical rank 1), evaluate it, and improve the selected best solution over control.

## Experiment design & controls

- Frozen search configuration: beamWidth=2, proposalsPerParent=4, localPolishEvaluations=24, maxFilters=10
- Equal evaluation budget: 9 total canonical evaluations (1 seed-validation + 8 descendant evaluations)
- Predeclared bridge path: parent-intermediate-0016-grandchild-0001
- Hop-1 intermediate: rank 16 (mutation=split)
- Displaced hop-1 slot: rank 4 (replaced in rescue arm only)
- Downstream grandchild: lexical rank 1 (mutation=merge)
- Selection rule: best-selector-winner-by-frozen-census-rmse-among-valid-rank16-grandchildren
- Equal work basis: Smallest fixed budget allowing full hop-1 + hop-2 expansion: 1 seed + 4 hop-1 + 4 hop-2 = 8 descendant evaluations (9 total canonical evaluations) per arm. Exactly 192 local-polish coordinate trials per arm.

## Causal chain verification

| Step | Expected under contract | Control arm observation | Rescue arm observation | Result |
| :--- | :--- | :--- | :--- | :--- |
| 1. Hop-1 admission | Rank 16 excluded in control, admitted in rescue | Admitted ranks: [1, 2, 3, 4] (rank 16 excluded) | Admitted ranks: [1, 2, 3, 16] (rank 16 admitted at slot 4) | PASSED |
| 2. Beam retention | Rank 16 naturally retained by beam-width 2 | Retained: 2 states (frozen-parent, proposal-4-merge) | Retained: 2 states (frozen-parent, proposal-4-split) | PASSED |
| 3. Scheduling | Rank 16 naturally expanded at hop 2 | Expanded: 2 parents | Expanded: 2 parents (including rank 16) | PASSED |
| 4. Hop-2 generation | Grandchild-0001 generated from rank 16 | Generated: false | Generated: true | PASSED |
| 5. Hop-2 admission | Grandchild-0001 admitted (lexical rank 1 <= 4) | Admitted: false | Admitted: true (hop-2 rank 1) | PASSED |
| 6. Evaluation | Grandchild-0001 evaluated under budget | Evaluated: false | Evaluated: true (eval index 6) | PASSED |
| 7. Selected best gain | Rescue selected best improves over control | Selector winner: baseline (no change) | Selector winner: candidate (beats parent & control) | PASSED |

## Work breakdown comparison (Equal Work Accounting)

| Work metric | Control arm | Rescue arm | Delta | Units |
| :--- | :--- | :--- | :--- | :--- |
| Seed/baseline validation | 1 | 1 | 0 | canonical evaluations |
| Hop-1 descendant evaluations | 4 | 4 | 0 | proposals evaluated |
| Hop-2 descendant evaluations | 4 | 4 | 0 | proposals evaluated |
| Total descendant evaluations | 8 | 8 | 0 | descendant evaluations |
| Total canonical evaluations | 9 | 9 | 0 | canonical evaluations |
| Full-polish coordinate trials | 192 | 192 | 0 | coordinate trials |

## Arm outcomes

### Control arm
- Seed validation: RMSE=1.698935, maxAbs=5.850643, regret=1.550990
- hop1AdmittedRanks: [1, 2, 3, 4]
- hop1InterventionApplied: false
- hop1BridgeIntermediateAdmitted: false
- retainedBeamAfterHop1: structural-beam-v1:titan-to-storm:0:matching-pursuit:frozen-parent:0000, structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-merge:0004
- bridgeIntermediateInBeam: false
- hop2ParentsExpanded: structural-beam-v1:titan-to-storm:0:matching-pursuit:frozen-parent:0000, structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-merge:0004
- bridgeExpandedAtHop2: false
- bridgeGrandchildGenerated: false
- bridgeGrandchildAdmitted: false
- bridgeGrandchildEvaluated: false
- bestRmse: 1.698935, bestMaxAbs: 5.850643, bestRegret: 1.550990
- selectedBestCandidateId: structural-beam-v1:titan-to-storm:0:matching-pursuit:frozen-parent:0000
- paretoVsParent: equivalent, selector=baseline
- selectorWinsOverParent: false
- improvementEvaluationIndex: none

### Rescue arm
- Seed validation: RMSE=1.698935, maxAbs=5.850643, regret=1.550990
- hop1AdmittedRanks: [1, 2, 3, 16]
- hop1InterventionApplied: true
- hop1InterventionSlotReplaced: slot 4 (displaced rank 4)
- hop1BridgeIntermediateAdmitted: true
- retainedBeamAfterHop1: structural-beam-v1:titan-to-storm:0:matching-pursuit:frozen-parent:0000, structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-split:0004
- bridgeIntermediateInBeam: true
- hop2ParentsExpanded: structural-beam-v1:titan-to-storm:0:matching-pursuit:frozen-parent:0000, structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-split:0004
- bridgeExpandedAtHop2: true
- bridgeGrandchildGenerated: true
- bridgeGrandchildAdmitted: true
- bridgeGrandchildEvaluated: true
- exactBridgePathFollowed: true
- bridgeGrandchildCanonical: RMSE=1.785598, maxAbs=5.493176, regret=1.789763
- bestRmse: 1.785598, bestMaxAbs: 5.493176, bestRegret: 1.789763
- selectedBestCandidateId: structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-9-merge:0006
- paretoVsParent: tradeoff, selector=candidate
- selectorWinsOverParent: true
- paretoVsBGlobalBest: tradeoff, selector=candidate
- selectorWinsOverBGlobalBest: true
- improvementEvaluationIndex: eval 6

## Classification & interpretation

Classification: **single-blocker-bridge-causal-impact-supported**

The one-time hop-1 admission rescue is sufficient for the normal search mechanism to reach a materially better grandchild, and the rescue arm improves over control under equal evaluation work.

- **Causal isolation**: Exactly one slot in hop-1 lexical admission was replaced. After that single decision, the intervention hook was completely disabled. Beam retention, parent scheduling, proposal generation, lexical top-4 admission at hop 2, local polish, and reference selection all operated naturally.
- **Equal work**: Both arms evaluated exactly 1 seed + 4 hop-1 proposals + 4 hop-2 proposals = 8 descendants, 9 canonical evaluations, and 192 local polish trials.
- **No secondary interventions**: Reaching the grandchild required no retention override, no scheduling intervention, and no hop-2 admission override.

## Predecessor artifact verification

- packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json: before=733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d; after=733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d; unchanged=true.
- Census SHA-256 matches expected (733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d): true.
- Artifact SHA-256: 646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7.

## Verification commands

```bash
pnpm --filter @autoeq-workbench/core research:storm-single-blocker-bridge
pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormSingleBlockerBridgeCausal.test.ts
```
