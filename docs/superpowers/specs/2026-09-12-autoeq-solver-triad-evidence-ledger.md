# AutoEQ Solver Triad Audit — Evidence Ledger

**Date:** 2026-09-12  
**Status:** Phase 1 in progress

## Frozen references

| Reference | Frozen solver SHA | Audit branch |
| --- | --- | --- |
| Standard V2 historical baseline | `5dafaa50410b9fa3157c28a1f7757d676b33152a` (research baseline file was generated from published `7c9ebbbe...`) | historical committed Research Bench evidence |
| Q31-B4-P8 research candidate | `e7656a8ade3b7fa9239f40e7ff9d1dc1d1a2ad76` | `research/audit-q31-frozen-20260912` |
| Current live Max10 experiment | `17d3a60b8cff0ce7b4b2ebe98d83f0c25c3a42b4` | `research/audit-live-frozen-20260912` |

The audit instrumentation is additive. It does not change product defaults or solver ranking/search rules.

## Phase 1 protocol

Structural candidates:

- official sanitized cases: Storm, U12t, Trio;
- zero seed;
- Max10 Q31 preset as implemented at each frozen SHA;
- terminal/no-timeout execution: 10 repeats;
- real-clock 5 s: 5 repeats;
- real-clock 15 s: 5 repeats;
- exact filter/result signature recorded.

Historical V2 values come from the committed Research Bench baseline and use five real-clock repeats.

## Standard V2 historical evidence

### 5-second median

| Case | RMSE | maxAbs | normalized violation | exact filter sets across 5 repeats |
| --- | ---: | ---: | ---: | ---: |
| Storm | 1.4331 | 5.4045 | 7.2060 | 2 |
| U12t | 1.2862 | 4.9653 | 6.6204 | 1 |
| Trio | 1.2886 | 4.5798 | 6.1064 | 2 |

The distinct 5-second Storm and Trio results are materially different filter topologies/parameters, not last-bit noise.

### Converged/terminal median

| Case | RMSE | maxAbs | normalized violation | median elapsed | filter sets across 5 repeats |
| --- | ---: | ---: | ---: | ---: | ---: |
| Storm | 1.6397 | 5.3511 | 7.1348 | 21.70 s | 1 |
| U12t | 1.6151 | 4.8458 | 6.4606 | 16.27 s | 1 |
| Trio | 1.1407 | 3.4933 | 4.6577 | 12.46 s | 1 |

This supports the working hypothesis that practical V2 inconsistency is primarily deadline/scheduling dependent. Once a case reaches deterministic convergence, repeated outputs collapse to one exact filter set.

## Frozen Q31-B4-P8 Phase 1

GitHub Actions run: `34706929305`  
Artifact: `frozen-structural-audit-34706929305`

### Terminal/no-timeout

| Case | RMSE | maxAbs | violation | median elapsed | filters | exact repeatability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 2.4811 | 7.9301 | 10.5735 | 3.55 s | 6 | 10/10 |
| U12t | 1.4403 | 4.4266 | 5.9022 | 2.38 s | 10 | 10/10 |
| Trio | 1.4267 | 3.1625 | 5.7069 | 2.50 s | 8 | 10/10 |

The same exact signatures were returned in all five 5-second and all five 15-second runs because the search exhausted before either deadline.

### Interpretation

Q31 strongly solves the speed/consistency problem relative to Standard V2, but it is not a universal precision replacement:

- Storm is materially worse than V2;
- U12t improves peak-error balance relative to the 5-second V2 result but has higher RMSE;
- Trio is competitive on maxAbs and faster, but the fully converged V2 remains better on normalized violation.

The prior `FINAL_CANDIDATE_SUPPORTED` result therefore remains correctly scoped: Q31 was supported against the narrow structural Arm A, not proven as a complete replacement for Standard V2.

## Current live Max10 Phase 1

GitHub Actions run: `34706931711`  
Artifact: `frozen-structural-audit-34706931711`

### Terminal/no-timeout

| Case | RMSE | maxAbs | violation | median elapsed | filters | exact repeatability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 2.5139 | 8.0631 | 10.7508 | 0.90 s | 6 | 10/10 |
| U12t | 1.5907 | 5.3487 | 7.1317 | 1.07 s | 6 | 10/10 |
| Trio | 2.7105 | 9.2446 | 12.3262 | 0.60 s | 6 | 10/10 |

The same exact signatures were returned at 5 s and 15 s; every run exhausted naturally well before 5 seconds.

### Interpretation

The live solver is highly repeatable but its early exit is not an efficiency win. It is premature structural exhaustion with severe precision loss. Trio is the clearest failure: bass remains good while mid/presence/treble error becomes very large.

The final live commit changed cleanup from one marginal prune at Max10 to cumulative merge/remove cleanup starting at 8 filters, up to three steps per cleanup call. Although each call compares against its own fixed anchor, cleaned states become parents of later generations, creating a new anchor and permitting cumulative tolerance ratcheting across generations.

## Live commit lineage under active ablation

The live path after the exposed Q31 integration is:

1. `c4d9557` — multi-region residual features + filter-count-scaled polish + metric-prioritized proposals;
2. `aad727f` — evidence-based shelves + normalized-violation deterministic ranking;
3. `4fc2fc2` — near-duplicate merge + one marginal slot recycle at the cap;
4. `17d3a60` — cumulative structural cleanup from 8 filters, up to three steps.

Active audit runs:

- multi-region: `34707086701`;
- semantic shelves/ranking: `34707088984`;
- cap-only cleanup: `34707090411`.

These runs are intended to locate the first commit where quality/reachability changes materially.

## Current decision status

No production candidate is selected yet.

What is already supported:

1. Standard V2 precision cost is real and convergence can require roughly 12–22 seconds on the official adversarial cases.
2. Standard V2 real-clock inconsistency is tied to incomplete search prefixes; terminal convergence is repeatable.
3. Q31 removes this timing-driven inconsistency by exhausting quickly and deterministically.
4. Q31 does not preserve V2 precision universally, especially on Storm.
5. The current live cleanup is rejected as a production direction based on official-corpus precision, despite excellent repeatability.
6. The next useful candidate should preserve Q31-style deterministic structural search while importing only mechanisms that improve the precision frontier without reintroducing wall-clock-dependent depth.


## Phase 1.5 — Live lineage 5-second ablation

All cells below use five repeated real-clock runs at 5 seconds on the official Storm/U12t/Trio corpus.

### A. Multi-region patch — `c4d9557`

Run: `34707250683`

| Case | RMSE | maxAbs | violation | median elapsed | filters | signatures | deadline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 1.5696 | 6.1878 | 8.2504 | 5.01 s | 10 | 2 | 5/5 |
| U12t | 1.6628 | 7.2381 | 9.6508 | 0.47 s | 4 | 1 | 0/5 |
| Trio | 1.9527 | 9.3299 | 12.4399 | 1.33 s | 10 | 1 | 0/5 |

Interpretation:

- This is the only tested live-lineage patch that materially closes the Storm gap against Standard V2.
- It reintroduces deadline-dependent output on Storm: two result signatures across five repeats.
- It severely regresses U12t and Trio.
- The commit bundled three mechanisms and therefore cannot be interpreted as “multi-region alone”:
  1. six separated residual regions;
  2. Q31 quota changed from 6 lexical + 2 RMSE to 2 lexical + 6 RMSE;
  3. local polish budget scales with filter count instead of staying at 24 trials.

These mechanisms require separate ablation before retaining any of them.

### B. Semantic shelves + normalized-violation ranking — `aad727f`

Run: `34707252426`

| Case | RMSE | maxAbs | violation | median elapsed | filters | signatures | deadline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 2.6816 | 8.0629 | 10.7506 | 2.72 s | 9 | 1 | 0/5 |
| U12t | 1.7493 | 5.3482 | 7.1310 | 2.47 s | 10 | 1 | 0/5 |
| Trio | 2.7112 | 9.2446 | 12.3262 | 2.00 s | 7 | 1 | 0/5 |

Interpretation:

- Exact repeatability is restored because the search exhausts before 5 seconds.
- Precision collapses on Storm and Trio and regresses U12t relative to frozen Q31.
- The final live solver's characteristic maxAbs values are already present here; later cleanup is not the origin of the main precision failure.
- This commit also bundled three causally distinct changes:
  1. semantic/evidence-based shelf generation;
  2. metric-only admission ranked by normalized violation;
  3. beam/final selector switched from the previous hypot-style policy to normalized violation.

Do not retain the combined patch without separating these mechanisms.

### C. Cap-only merge/prune — `4fc2fc2`

Run: `34707257234`

| Case | RMSE | maxAbs | violation | median elapsed | filters | signatures | deadline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 2.2929 | 8.0629 | 10.7506 | 3.56 s | 10 | 1 | 0/5 |
| U12t | 1.7633 | 5.3482 | 7.1310 | 5.02 s | 8 | 1 | 5/5 |
| Trio | 2.7112 | 9.2446 | 12.3262 | 2.03 s | 7 | 1 | 0/5 |

Interpretation:

- Recycling a marginal slot at the cap improves Storm RMSE relative to the semantic-ranking predecessor, but does not repair maxAbs.
- It does not repair U12t/Trio precision.
- It can consume enough additional work to hit the 5-second deadline on U12t.
- The dominant precision regression therefore predates this commit.

### D. Final cumulative cleanup — `17d3a60`

Already recorded above.

Relative to `4fc2fc2`, the final cleanup:

- reduces all three terminal results to six filters;
- cuts runtime to roughly 0.6–1.1 seconds;
- further worsens RMSE/structure;
- preserves the already-bad Storm/Trio maxAbs regime inherited from semantic-ranking.

Classification: **rejected**.

## Updated causal picture

The live lineage is not one monotonic improvement path.

1. Frozen Q31 is fast and exactly repeatable, with good U12t/Trio peak-error behavior but a severe Storm single-region blind spot.
2. The bundled multi-region patch demonstrates that Storm can be improved substantially inside Max10, but its quota/polish changes simultaneously destroy U12t/Trio and make Storm deadline-dependent again.
3. The semantic-ranking bundle restores early deterministic exhaustion but moves the search to a much worse precision basin on all three cases.
4. Cap-only cleanup cannot recover the lost peak-error frontier.
5. Cumulative cleanup then converts the already-poor frontier into premature six-filter exhaustion.

The next research target is therefore **not** “fix cleanup.” It is:

> preserve frozen Q31 search/selection semantics, then isolate the smallest multi-region proposal mechanism that fixes Storm without changing admission balance, selector semantics, or normal deterministic exhaustion.

### Next mandatory ablations

Starting from frozen Q31:

1. multi-region features only, preserving original 6 lexical + 2 RMSE quota and fixed 24-trial polish;
2. quota flip only (2 lexical + 6 RMSE), single-region, fixed polish;
3. filter-count-scaled polish only, single-region, original quota;
4. if (1) is positive, test multi-region as a stagnation fallback rather than always-on behavior.

Starting from the positive multi-region-only result, if any:

5. evidence-based shelves only;
6. normalized-violation admission only;
7. normalized-violation beam/final selector only.

No cleanup or slot recycling enters these ablations.
