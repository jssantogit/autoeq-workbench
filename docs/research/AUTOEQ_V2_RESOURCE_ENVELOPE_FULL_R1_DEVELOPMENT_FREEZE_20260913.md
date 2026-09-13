# AutoEQ V2 full-r1 development freeze

Status: frozen before holdout. This artifact contains development evidence and pre-registered qualitative holdout expectations only; it does not include holdout results.

## Evidence

Development raw campaign aggregate: `.research-artifacts/resource-envelope-generic-20260913-full-r1/development-aggregate.json` (SHA-256 `727f957af85103c871979d9308c94b9d5d9ce4bd437925d0c8a617f21bda5b6b`).

- Fixed-capacity evidence covers Titan → RSV, Titan → Mystic 8, and Titan → S12 Ultra at the programmatic ladder 10/15/23/35/43, three repeats, and nominal checkpoints 5/15/30.
- Effort evidence covers capacities 10/23/43, effort levels 0–6 inclusive, three repeats, with independent work counters and measured elapsed time.
- Legacy evidence covers unchanged trajectories at horizons 5/15/30, three repeats, with every expansion and matched fixed-capacity diagnosis.

Fixed-capacity quantitative summaries at the 30-second checkpoint (best/median/worst):

| Case | Ceiling | Violation | RMSE | Blocked pressure | Frontier max |
| --- | --- | --- | --- | --- | --- |
| titan-to-rsv | 10 | 6.165/6.165/6.165 | 1.249/1.312/1.447 | 25.0/27.0/30.0 | 10.0/10.0/10.0 |
| titan-to-rsv | 15 | 4.666/4.666/4.666 | 1.167/1.167/1.167 | 0.0/0.0/0.0 | 13.0/13.0/13.0 |
| titan-to-rsv | 23 | 1.292/6.156/6.156 | 0.323/1.223/1.333 | 0.0/0.0/0.0 | 13.0/14.0/15.0 |
| titan-to-rsv | 35 | 6.166/6.166/6.166 | 1.363/1.363/1.381 | 0.0/0.0/0.0 | 15.0/15.0/15.0 |
| titan-to-rsv | 43 | 6.105/6.166/6.169 | 1.351/1.381/1.514 | 0.0/0.0/0.0 | 11.0/12.0/15.0 |
| titan-to-mystic-8 | 10 | 6.491/6.491/6.534 | 1.446/1.446/1.611 | 63.0/65.0/66.0 | 10.0/10.0/10.0 |
| titan-to-mystic-8 | 15 | 3.890/4.500/6.418 | 0.964/0.968/1.512 | 23.0/36.0/43.0 | 15.0/15.0/15.0 |
| titan-to-mystic-8 | 23 | 4.529/6.237/6.237 | 1.132/1.474/1.474 | 0.0/0.0/0.0 | 16.0/16.0/18.0 |
| titan-to-mystic-8 | 35 | 4.529/5.877/6.374 | 1.132/1.469/1.520 | 0.0/0.0/0.0 | 15.0/16.0/18.0 |
| titan-to-mystic-8 | 43 | 4.529/4.933/5.006 | 1.132/1.224/1.241 | 0.0/0.0/0.0 | 16.0/18.0/20.0 |
| titan-to-s12-ultra | 10 | 5.137/5.137/5.137 | 1.257/1.257/1.257 | 26.0/26.0/26.0 | 10.0/10.0/10.0 |
| titan-to-s12-ultra | 15 | 4.614/4.623/5.024 | 0.983/1.081/1.139 | 21.0/25.0/50.0 | 15.0/15.0/15.0 |
| titan-to-s12-ultra | 23 | 4.637/4.698/5.024 | 1.002/1.048/1.174 | 0.0/0.0/0.0 | 15.0/17.0/20.0 |
| titan-to-s12-ultra | 35 | 4.688/4.698/4.698 | 1.161/1.174/1.174 | 0.0/0.0/0.0 | 16.0/17.0/17.0 |
| titan-to-s12-ultra | 43 | 4.591/4.632/4.651 | 1.143/1.151/1.162 | 0.0/0.0/0.0 | 17.0/17.0/17.0 |

Effort endpoint quantitative summaries (median RMSE at q30; Δ is e0−e6, positive favors e6):

| Case | Capacity | e0 RMSE | e6 RMSE | Δ RMSE |
| --- | --- | --- | --- | --- |
| titan-to-rsv | 10 | 1.350 | 0.410 | 0.940 |
| titan-to-rsv | 23 | 1.110 | 0.650 | 0.461 |
| titan-to-rsv | 43 | 1.015 | 0.602 | 0.413 |
| titan-to-mystic-8 | 10 | 1.095 | 1.448 | -0.353 |
| titan-to-mystic-8 | 23 | 1.431 | 1.479 | -0.048 |
| titan-to-mystic-8 | 43 | 1.543 | 1.186 | 0.357 |
| titan-to-s12-ultra | 10 | 1.257 | 0.761 | 0.496 |
| titan-to-s12-ultra | 23 | 1.256 | 0.855 | 0.401 |
| titan-to-s12-ultra | 43 | 1.238 | 0.850 | 0.388 |

Legacy classification counts:

| Case | Expansions | Clearly premature | Demand-aligned | Ambiguous |
| --- | --- | --- | --- | --- |
| titan-to-rsv | 25 | 17 | 8 | 0 |
| titan-to-mystic-8 | 24 | 9 | 15 | 0 |
| titan-to-s12-ultra | 24 | 9 | 15 | 0 |

## Frozen hypotheses

1. **Effort-first tendency, not a universal law:** In development data, increasing generic effort more often improves quality before unused higher ceilings are consumed, but case/capacity variation prevents a universal allocator claim.
2. **Conditional capacity-on-demand:** Structural capacity is useful when matched pressure/saturation evidence exists, but opening an unused ceiling is not repeatedly productive in these real-FR cases.
3. **Search-engine bottleneck after resource saturation:** When effort is exhausted or saturated and structural headroom remains, poor quality can persist; remaining failures are candidate structural-search limitations rather than proof of a scheduler defect.

## Frozen candidate rule

**no allocator rule proposed**

The cross-case repeat distributions do not support a simple rule without selecting a numeric boundary or tuning against holdout. No rule is implemented.

## Parameters

- Frozen research capacities: 10, 23, 43 effort-curve levels; full fixed ladder 10, 15, 23, 35, 43.
- Frozen effort levels: 0 through existing maximum inclusive (0–6).
- Frozen repeats: three for development cells; no additional repeats are authorized by this boundary.
- No scheduler threshold, comparator, capacity, or effort maximum is changed.

## Holdout expectations (qualitative predictions made before holdout)

- Blocked pressure should precede productive expansion more often than incumbent utilization alone.
- Effort should help more frequently than early capacity when the new structural range is not yet demanded.
- The unchanged legacy scheduler should show some expansions before matched evidence of structural demand, with a nonzero ambiguous fraction.
- Some holdout failures should remain after effort and capacity are available, consistent with a search-engine bottleneck.

These are predictions, not pass criteria; no holdout result may change the frozen hypotheses or parameters.

## Hashes

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| plan | docs/research/AUTOEQ_V2_RESOURCE_ENVELOPE_FULL_R1_PLAN_20260913.json | d44062287ef5e910fd362271debe33d4a4c8dfe2b5f10958d4ef81af8e69a686 |
| syntheticManifest | .research-artifacts/resource-envelope-generic-20260913-full-r1/manifest.json | e36bc66b44902496046aaec2b5497de1a7e616c15857b314e57e5c0a27dc88b1 |
| syntheticRuns | .research-artifacts/resource-envelope-generic-20260913-full-r1/runs.jsonl | 15314e04b7e5529e5ede16d3f658c4e6cd6f5b5a513721c27afa570f87b222f9 |
| syntheticAggregate | .research-artifacts/resource-envelope-generic-20260913-full-r1/aggregate.json | 6889861a3b822dba7e815ddc182d61ba0d2dd90f47ce14841fc2e0b016950fc5 |
| multiManifest | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-b-c-multi-quantum/manifest.json | 9d7556668cd44fbafca79b8fb9d7e9d395bf33568e5749084c0272d0b71caf59 |
| multiRuns | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-b-c-multi-quantum/runs.jsonl | ec041b0fe529622ec58f5f16a7f721bfa79ae528222282f63dd390c132f1a4b2 |
| multiCampaignAggregate | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-b-c-multi-quantum/aggregate.json | 1f4614eca902f55771036f49ad91914c433836f8fb6aa3848f4b4e1f650a0384 |
| fixedManifest | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/fixed-capacity/manifest.json | 86c249a1841f6f7c22ec77aff67098ced7c571794ae7682fe8e359872821e61c |
| fixedRuns | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/fixed-capacity/runs.jsonl | d38b60e00eaef7351733108aead4d97a7a3c6cd8de734e52a6b16194102cbb36 |
| effortManifest | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/effort-curve/manifest.json | 2b64e57395e2a5d1391b953fd237ed1f05f52d0ffd34fc1b0535750cf71c651c |
| effortRuns | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/effort-curve/runs.jsonl | 6c1b4362c6acd5a67c61dbeff01270ab4c6b6e877cb7a32c8c316f9206dcfe82 |
| legacyManifest | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/legacy/manifest.json | 52b82c8dc54b509a9e9342f13abb61563626d0418cdf3fcf8f643f80b714b864 |
| legacyRuns | .research-artifacts/resource-envelope-generic-20260913-full-r1/phase-e-i-development/legacy/runs.jsonl | 75dd6d729fd5ee38cc97bf3393221470789cc8bc995c35782f82ec9a429509f0 |
| developmentAggregate | .research-artifacts/resource-envelope-generic-20260913-full-r1/development-aggregate.json | 727f957af85103c871979d9308c94b9d5d9ce4bd437925d0c8a617f21bda5b6b |
| multiAggregate | .research-artifacts/resource-envelope-generic-20260913-full-r1/multi-quantum-aggregate.json | c9e669f75c71207c9bc07f152330d80a2aaccf8d0179da8aadcb46391dbd8c4b |

Next phase: **holdout and closing evidence campaign**
