# Storm two-hop reachability census results

Version: storm-two-hop-reachability-census-v1 (schema 1)
Case: titan-to-storm; primary=matching-pursuit-v1:titan-to-storm:0:sparse-0010
Classification: **temporary-worsening-bridge-supported**
Producer commit: 206196ece12582fe4ed90ce0a68ab84e2ccc9150

## Scope, frozen parent, and controls

This is a deterministic offline oracle for exactly `parent → intermediate → grandchild` (2 structural edges). It freezes the single semantic post-initial B parent and all 31 predecessor outcomes before any hop-2 outcome is evaluated.

- Frozen B census: total occurrences=20; initial excluded=12; post-initial=8; unique parent=1; repeats removed=7.
- Parent: structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004; occurrences=8; proposals=31; lexical top-4=[1,2,3,4]; cheap top-4=[14,15,21,22]; overlap=0.
- Controls: Storm, Max10, current structural mutation generator, lexical order, local polish 24, standard-v2 quantization, canonical delivered evaluator, frozen selector/reference; no MP dictionary, teacher/Max20/40/64, or normal beam/search execution.
- Cheap ranking is reconstructed from canonical pre-polish metrics only. Full-polish labels are excluded from both lexical and cheap admission ranks.
- Hop-2 residuals are derived from each intermediate canonical delivered state, never from the original parent; future outcomes do not feed generation or ranking.

## Primary table: every frozen intermediate

| Hop 1 rank | Mutation | Lexical rank/top-4 | Cheap rank/top-4 | Intermediate RMSE/maxAbs/regret | Direct vs parent/B | Retention | Hop-2 proposals | > intermediate | > parent | > B global | Improve frozen reference | Best grandchild path / metrics | Mechanism signals |
| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | add-hs | 1/yes | 21/no | RMSE 2.738102, maxAbs 9.742054, regret 8.034154 | no/no | beam-retention-blocked | 21 | 7 | 1 | 0 | 0 | parent-intermediate-0001-grandchild-0005; RMSE 1.698935, maxAbs 5.850643, regret 1.550990 | beam-retention-blocked
| 2 | add-ls | 2/yes | 24/no | RMSE 3.919517, maxAbs 7.739735, regret 10.776419 | no/no | beam-retention-blocked | 21 | 13 | 0 | 0 | 0 | parent-intermediate-0002-grandchild-0002; RMSE 1.726422, maxAbs 5.835896, regret 1.646863 | beam-retention-blocked
| 3 | add-pk | 3/yes | 20/no | RMSE 2.273446, maxAbs 8.320833, regret 5.379893 | no/no | beam-retention-blocked | 22 | 5 | 0 | 0 | 0 | parent-intermediate-0003-grandchild-0002; RMSE 1.951133, maxAbs 5.853011, regret 2.516541 | beam-retention-blocked
| 4 | merge | 4/yes | 10/no | RMSE 1.879664, maxAbs 5.702461, regret 2.196019 | no/no | beam-retention-blocked | 27 | 4 | 0 | 0 | 0 | parent-intermediate-0004-grandchild-0014; RMSE 1.864827, maxAbs 5.607885, regret 2.118941 | beam-retention-blocked
| 5 | remove | 5/no | 9/no | RMSE 1.856456, maxAbs 5.707300, regret 2.105798 | no/no | hop1-admission-blocked | 27 | 0 | 0 | 0 | 0 | parent-intermediate-0005-grandchild-0014; RMSE 1.882799, maxAbs 5.633924, regret 2.194595 | hop1-admission-blocked
| 6 | remove | 6/no | 18/no | RMSE 2.182171, maxAbs 8.714713, regret 5.539502 | no/no | hop1-admission-blocked | 27 | 5 | 0 | 0 | 0 | parent-intermediate-0006-grandchild-0003; RMSE 1.703271, maxAbs 6.010304, regret 1.657118 | hop1-admission-blocked
| 7 | remove | 7/no | 14/no | RMSE 1.908622, maxAbs 6.721047, regret 2.864822 | no/no | hop1-admission-blocked | 28 | 1 | 0 | 0 | 0 | parent-intermediate-0007-grandchild-0001; RMSE 1.982143, maxAbs 6.104778, regret 2.730738 | hop1-admission-blocked
| 8 | remove | 8/no | 19/no | RMSE 2.178245, maxAbs 9.015184, regret 5.853336 | no/no | hop1-admission-blocked | 28 | 8 | 0 | 0 | 0 | parent-intermediate-0008-grandchild-0004; RMSE 2.163796, maxAbs 7.789100, regret 4.568717 | hop1-admission-blocked
| 9 | remove | 9/no | 13/no | RMSE 1.924196, maxAbs 6.462762, regret 2.723627 | no/no | hop1-admission-blocked | 28 | 0 | 0 | 0 | 0 | parent-intermediate-0009-grandchild-0014; RMSE 2.070605, maxAbs 6.458900, regret 3.238714 | hop1-admission-blocked
| 10 | remove | 10/no | 26/no | RMSE 2.643332, maxAbs 18.461692, regret 18.155886 | no/no | hop1-admission-blocked | 28 | 19 | 0 | 0 | 0 | parent-intermediate-0010-grandchild-0003; RMSE 3.803792, maxAbs 11.869482, regret 13.083622 | hop1-admission-blocked
| 11 | remove | 11/no | 15/no | RMSE 1.920700, maxAbs 5.825694, regret 2.389712 | no/no | hop1-admission-blocked | 28 | 10 | 1 | 1 | 0 | parent-intermediate-0011-grandchild-0016; RMSE 1.816387, maxAbs 5.213348, regret 1.910203 | hop1-admission-blocked
| 12 | remove | 12/no | 12/no | RMSE 1.927610, maxAbs 5.521402, regret 2.359030 | no/no | hop1-admission-blocked | 28 | 9 | 2 | 2 | 0 | parent-intermediate-0012-grandchild-0014; RMSE 1.801596, maxAbs 5.274474, regret 1.851039 | hop1-admission-blocked
| 13 | remove | 13/no | 11/no | RMSE 1.931759, maxAbs 5.762997, regret 2.415569 | no/no | hop1-admission-blocked | 28 | 8 | 0 | 0 | 0 | parent-intermediate-0013-grandchild-0019; RMSE 1.883277, maxAbs 5.707627, regret 2.211445 | hop1-admission-blocked
| 14 | split | 14/no | 1/yes | RMSE 1.841046, maxAbs 5.718743, regret 2.048143 | no/no | hop1-admission-blocked | 22 | 3 | 0 | 0 | 0 | parent-intermediate-0014-grandchild-0011; RMSE 1.774130, maxAbs 5.697117, regret 1.780153 | hop1-admission-blocked
| 15 | split | 15/no | 2/yes | RMSE 1.836532, maxAbs 5.712418, regret 2.028792 | no/no | hop1-admission-blocked | 21 | 1 | 0 | 0 | 0 | parent-intermediate-0015-grandchild-0010; RMSE 1.851811, maxAbs 5.667263, regret 2.078374 | hop1-admission-blocked
| 16 | split | 16/no | 6/no | RMSE 1.820593, maxAbs 5.518654, regret 1.931580 | no/no | hop1-admission-blocked | 21 | 3 | 2 | 2 | 0 | parent-intermediate-0016-grandchild-0001; RMSE 1.785598, maxAbs 5.493176, regret 1.789763 | hop1-admission-blocked
| 17 | split | 17/no | 16/no | RMSE 1.935588, maxAbs 7.439870, regret 3.599473 | no/no | hop1-admission-blocked | 22 | 7 | 0 | 0 | 0 | parent-intermediate-0017-grandchild-0002; RMSE 1.780901, maxAbs 5.807420, regret 1.842443 | hop1-admission-blocked
| 18 | split | 18/no | 5/no | RMSE 1.804824, maxAbs 5.716077, regret 1.905503 | no/no | hop1-admission-blocked | 22 | 0 | 0 | 0 | 0 | parent-intermediate-0018-grandchild-0011; RMSE 1.890979, maxAbs 5.554370, regret 2.215907 | hop1-admission-blocked
| 19 | split | 19/no | 8/no | RMSE 1.827520, maxAbs 5.721040, regret 1.995719 | no/no | hop1-admission-blocked | 22 | 0 | 0 | 0 | 0 | parent-intermediate-0019-grandchild-0002; RMSE 1.868389, maxAbs 5.718335, regret 2.155419 | hop1-admission-blocked
| 20 | split | 20/no | 7/no | RMSE 1.818281, maxAbs 5.717849, regret 1.958666 | no/no | hop1-admission-blocked | 22 | 0 | 0 | 0 | 0 | parent-intermediate-0020-grandchild-0002; RMSE 1.868016, maxAbs 5.718098, regret 2.153896 | hop1-admission-blocked
| 21 | split | 21/no | 3/yes | RMSE 1.796918, maxAbs 5.713792, regret 1.873937 | no/no | hop1-admission-blocked | 23 | 0 | 0 | 0 | 0 | parent-intermediate-0021-grandchild-0012; RMSE 1.915945, maxAbs 5.516026, regret 2.312036 | hop1-admission-blocked
| 22 | split | 22/no | 4/yes | RMSE 1.802051, maxAbs 5.719956, regret 1.895740 | no/no | hop1-admission-blocked | 23 | 0 | 0 | 0 | 0 | parent-intermediate-0022-grandchild-0012; RMSE 1.920631, maxAbs 5.522190, regret 2.331221 | hop1-admission-blocked
| 23 | type-mutation | 23/no | 23/no | RMSE 3.292537, maxAbs 8.589249, regret 8.884576 | no/no | hop1-admission-blocked | 31 | 21 | 0 | 0 | 0 | parent-intermediate-0023-grandchild-0003; RMSE 1.887790, maxAbs 5.718458, regret 2.231758 | hop1-admission-blocked
| 24 | type-mutation | 24/no | 22/no | RMSE 2.632006, maxAbs 10.480396, regret 8.502619 | no/no | hop1-admission-blocked | 30 | 6 | 0 | 0 | 0 | parent-intermediate-0024-grandchild-0003; RMSE 1.964320, maxAbs 5.996565, regret 2.617664 | hop1-admission-blocked
| 25 | type-mutation | 25/no | 17/no | RMSE 2.260509, maxAbs 8.037993, regret 5.077722 | no/no | hop1-admission-blocked | 30 | 5 | 2 | 2 | 0 | parent-intermediate-0025-grandchild-0003; RMSE 1.890836, maxAbs 5.116518, regret 2.207997 | hop1-admission-blocked
| 26 | type-mutation | 26/no | 25/no | RMSE 4.211690, maxAbs 8.439092, regret 12.176407 | no/no | hop1-admission-blocked | 31 | 23 | 0 | 0 | 0 | parent-intermediate-0026-grandchild-0005; RMSE 1.881519, maxAbs 5.603374, regret 2.184568 | hop1-admission-blocked
| 27 | type-mutation | 27/no | 28/no | RMSE 7.301166, maxAbs 12.139142, regret 25.476827 | no/no | hop1-admission-blocked | 31 | 25 | 0 | 0 | 0 | parent-intermediate-0027-grandchild-0005; RMSE 2.008147, maxAbs 5.838927, regret 2.735092 | hop1-admission-blocked
| 28 | type-mutation | 28/no | 31/no | RMSE 11.751589, maxAbs 16.839307, regret 44.347038 | no/no | hop1-admission-blocked | 31 | 27 | 0 | 0 | 0 | parent-intermediate-0028-grandchild-0005; RMSE 2.699150, maxAbs 18.572935, regret 18.362918 | hop1-admission-blocked
| 29 | type-mutation | 29/no | 27/no | RMSE 5.204626, maxAbs 10.111007, regret 16.680605 | no/no | hop1-admission-blocked | 31 | 27 | 0 | 0 | 0 | parent-intermediate-0029-grandchild-0005; RMSE 1.799733, maxAbs 6.485948, regret 2.328432 | hop1-admission-blocked
| 30 | type-mutation | 30/no | 29/no | RMSE 7.801276, maxAbs 12.888015, regret 27.701600 | no/no | hop1-admission-blocked | 31 | 26 | 0 | 0 | 0 | parent-intermediate-0030-grandchild-0031; RMSE 2.117369, maxAbs 7.186118, regret 3.904822 | hop1-admission-blocked
| 31 | type-mutation | 31/no | 30/no | RMSE 7.877029, maxAbs 13.332555, regret 28.200924 | no/no | hop1-admission-blocked | 31 | 29 | 0 | 0 | 0 | parent-intermediate-0031-grandchild-0005; RMSE 1.792890, maxAbs 6.723320, regret 2.514333 | hop1-admission-blocked

The primary table remains populated for all 31 intermediates even when no bridge exists.

## Hop-2 mutation and rank evidence

- Hop-1 mutation counts: add-pk=1, add-ls=1, add-hs=1, remove=9, type-mutation=9, split=9, merge=1.
- Hop-2 mutation counts: add-pk=19, add-ls=19, add-hs=19, remove=281, type-mutation=281, split=161, merge=36.
- Each intermediate artifact row contains every hop-2 path with mutation, lexical rank, cheap rank, pre-polish metrics, full-polish labels, canonical delivered filters, and provenance.

## Best path and decision criteria

- Best two-hop path by frozen selector: parent-intermediate-0011-grandchild-0016; hop-1 rank=11 (remove); hop-2 lexical rank=16, cheap rank=4, mutation=split.
- Original parent: RMSE 1.698935, maxAbs 5.850643, regret 1.550990.
- Intermediate: RMSE 1.920700, maxAbs 5.825694, regret 2.389712.
- Grandchild: RMSE 1.816387, maxAbs 5.213348, regret 1.910203; vs parent selector=candidate, Pareto=tradeoff; vs B global selector=candidate, Pareto=tradeoff; referenceImproved=false.
- Totals: intermediates=31; hop-2 proposal paths=816; unique semantic grandchildren=803; duplicate semantic paths=13.
- Intermediate counts with at least one grandchild: > intermediate=24; > parent=5; > B global=4; improve frozen reference=0.
- Direct improvement fidelity: 0 of 31 intermediates improve parent/B global materially after reconstructed canonical delivery.
- Material definition: A candidate is materially better when frozen selector prefers it to the baseline or it dominates the baseline in RMSE and maxAbs; Directed Reference Regret v1 is additional evidence, not a requirement.

## Mechanism attribution

- Bridge paths=8; blocked by current mechanism=8; reachable under current mechanism=0; unresolved=0.
- parent-intermediate-0001-grandchild-0005: hop-1 lexical=1/top4, cheap=21/excluded; hop-2 lexical=5/excluded, cheap=1/top4; blocker=beam-retention-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0011-grandchild-0016: hop-1 lexical=11/excluded, cheap=15/excluded; hop-2 lexical=16/excluded, cheap=4/top4; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0012-grandchild-0005: hop-1 lexical=12/excluded, cheap=12/excluded; hop-2 lexical=5/excluded, cheap=8/excluded; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0012-grandchild-0014: hop-1 lexical=12/excluded, cheap=12/excluded; hop-2 lexical=14/excluded, cheap=7/excluded; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0016-grandchild-0001: hop-1 lexical=16/excluded, cheap=6/excluded; hop-2 lexical=1/top4, cheap=3/top4; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0016-grandchild-0003: hop-1 lexical=16/excluded, cheap=6/excluded; hop-2 lexical=3/top4, cheap=2/top4; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0025-grandchild-0003: hop-1 lexical=25/excluded, cheap=17/excluded; hop-2 lexical=3/top4, cheap=3/top4; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- parent-intermediate-0025-grandchild-0004: hop-1 lexical=25/excluded, cheap=17/excluded; hop-2 lexical=4/top4, cheap=4/top4; blocker=hop1-admission-blocked; evidence=inferred-offline-oracle.
- Direct evidence covers frozen B/C admitted ranks and child-to-parent identities. Reconstructed Pareto/frozen-selector retention is explicitly inference from the frozen competitive set; it is not inferred from candidate names.
- `hop1-admission-blocked`, `beam-retention-blocked`, and `hop2-admission-blocked` describe where the current contracts would stop a path. `reachable-under-current-mechanism` means investigate budget/scheduling/visited/execution semantics before calling it a temporary-worsening barrier.

## Duplicate handling and cost accounting

- Intermediate count=31; hop-2 proposal paths=816; pre-polish canonical evaluations=816; full-polish coordinate trials=20328; canonical labels=847; duplicate semantic states=13; unique semantic grandchildren=803; parent baseline canonical evaluations=1.
- Every convergent path remains in provenance; semantic deduplication is used only for quantity metrics. Duplicate groups:
- semantic-grandchild-0068: 2 paths converge on the same semantic state; provenance=parent-intermediate-0004-grandchild-0004, parent-intermediate-0005-grandchild-0004.
- semantic-grandchild-0080: 2 paths converge on the same semantic state; provenance=parent-intermediate-0004-grandchild-0016, parent-intermediate-0018-grandchild-0001.
- semantic-grandchild-0081: 2 paths converge on the same semantic state; provenance=parent-intermediate-0004-grandchild-0017, parent-intermediate-0019-grandchild-0001.
- semantic-grandchild-0082: 2 paths converge on the same semantic state; provenance=parent-intermediate-0004-grandchild-0018, parent-intermediate-0020-grandchild-0001.
- semantic-grandchild-0106: 2 paths converge on the same semantic state; provenance=parent-intermediate-0005-grandchild-0016, parent-intermediate-0018-grandchild-0004.
- semantic-grandchild-0107: 2 paths converge on the same semantic state; provenance=parent-intermediate-0005-grandchild-0017, parent-intermediate-0019-grandchild-0004.
- semantic-grandchild-0108: 2 paths converge on the same semantic state; provenance=parent-intermediate-0005-grandchild-0018, parent-intermediate-0020-grandchild-0004.
- semantic-grandchild-0109: 2 paths converge on the same semantic state; provenance=parent-intermediate-0005-grandchild-0019, parent-intermediate-0021-grandchild-0005.
- semantic-grandchild-0152: 2 paths converge on the same semantic state; provenance=parent-intermediate-0007-grandchild-0008, parent-intermediate-0009-grandchild-0007.
- semantic-grandchild-0194: 2 paths converge on the same semantic state; provenance=parent-intermediate-0008-grandchild-0022, parent-intermediate-0024-grandchild-0007.
- semantic-grandchild-0267: 2 paths converge on the same semantic state; provenance=parent-intermediate-0011-grandchild-0012, parent-intermediate-0013-grandchild-0011.
- semantic-grandchild-0465: 2 paths converge on the same semantic state; provenance=parent-intermediate-0020-grandchild-0002, parent-intermediate-0021-grandchild-0003.
- semantic-grandchild-0508: 2 paths converge on the same semantic state; provenance=parent-intermediate-0022-grandchild-0003, parent-intermediate-0022-grandchild-0006.
- exhaustive two-hop evaluation is diagnostic oracle work, not runtime cost or deployable search behavior.

## Interpretation and boundaries

- A grandchild improves the parent/B global-best while its intermediate does not; this supports a two-edge temporary-worsening bridge in the frozen neighborhood.
- The blocker attribution is based on frozen lexical admission and reconstructed beam evidence; it does not authorize a worsening allowance, wider beam, or ranking-policy change.
- Terra should design the smallest equal-budget causal intervention for the identified bridge before any policy decision.
- This is an exhaustive offline oracle over exactly two structural edges from one frozen post-initial B parent; it is not a competitive runtime trajectory.
- The 31 hop-1 outcomes are reconstructed from the prior census and checked against its canonical delivered metrics; no future outcome enters generation or ranking.
- Retention is directly evidenced only where frozen B/C trajectories expose a child/parent relationship; local competitive-set reconstruction is marked inference and may not prove the complete historical beam context.
- Directed Reference Regret v1 is reported separately as additional evidence and is not required for relative material improvement.
- Directed Reference Regret v1 is reported separately as additional evidence, not a requirement for relative improvement.
- This round does not implement worsening allowance, tabu/search temperature, wider beam, simulated annealing, dominated-state acceptance, new ranking policy, causal intervention, policy audit, MP audit, holdout, promotion, merge, release, deploy, or publish.

## Frozen predecessor hashes and gates

- packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json: before=fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920; after=fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920; unchanged=true.
- packages/core/.research-artifacts/storm-cheap-admission-dynamic-all-parents-20260910/sparse-0010/dynamic-all-parents-report.json: before=c97d7f764923cdb50ac2a097732b74a96c84e797568e8d0842294753ea6aa3a1; after=c97d7f764923cdb50ac2a097732b74a96c84e797568e8d0842294753ea6aa3a1; unchanged=true.
- packages/core/.research-artifacts/storm-cheap-admission-causal-20260910/sparse-0010/cheap-admission-report.json: before=6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc; after=6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc; unchanged=true.
- packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json: before=930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba; after=930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba; unchanged=true.
- external:OracleReferenceSnapshotV1.json: before=a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd; after=a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd; unchanged=true.
- Validation incidents: none recorded.
- Artifact SHA-256: 733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d.
- Non-timing deterministic reproduction: true.
- focused_test: PASS_THIS_RUN.
- runner_reproduction: PASS_THIS_RUN.
- predecessor_hashes: PASS_THIS_RUN.
- pnpm_test: FAIL.
- pnpm_typecheck: PASS_THIS_RUN.
- pnpm_build: PASS_THIS_RUN.
- pnpm_lint: PASS_THIS_RUN.
- core_benchmark: NOT_RUN.
- git_diff_check: PASS_THIS_RUN.
- routing_policy: PASS_THIS_RUN.
- depth_limit: PASS_THIS_RUN.
- no_normal_search: PASS_THIS_RUN.
- deterministic_reproduction: PASS_THIS_RUN.
- Focused test: pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormTwoHopReachabilityCensus.test.ts.
- Generation: pnpm --filter @autoeq-workbench/core research:storm-two-hop-reachability.
- Required gates: pnpm test; pnpm typecheck; pnpm build; pnpm lint; pnpm --filter @autoeq-workbench/core benchmark; git diff --check; node --test .agents/skills/astra-orchestra/routing-policy.test.mjs.

The artifact stops after Luna IMPLEMENTATION_COMPLETE → Terra acceptance of this two-hop census.
