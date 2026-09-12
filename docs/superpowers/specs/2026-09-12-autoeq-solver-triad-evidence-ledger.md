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


## Phase 1.6 — Isolation of the bundled multi-region commit

All three experiments below start from frozen Q31 behavior and isolate one mechanism.

### Multi-region feature generation only

Run: `34707438548`

| Case | RMSE | maxAbs | violation | elapsed | filters | signatures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Storm | 2.6219 | 9.3438 | 12.4583 | 2.36 s | 9 | 1 |
| U12t | 1.5834 | 6.9536 | 9.2715 | 0.86 s | 6 | 1 |
| Trio | 2.1344 | 9.3598 | 12.4797 | 0.22 s | 3 | 1 |

Verdict: **reject as always-on mechanism**. Merely exposing six separated residual regions causes premature/exhausted poor solutions under the original Q31 admission/refinement behavior.

### Quota inversion only — 2 lexical + 6 RMSE

Run: `34707440184`

| Case | RMSE | maxAbs | violation | elapsed | filters | signatures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Storm | 2.4791 | 7.9690 | 10.6253 | 0.43 s | 3 | 1 |
| U12t | 1.4639 | 4.5317 | 6.0423 | 1.79 s | 10 | 1 |
| Trio | 1.5243 | 4.8277 | 6.4370 | 3.75 s | 10 | 1 |

Verdict: **reject as global replacement**. It preserves much of Q31 behavior on Storm/U12t but worsens Trio and causes premature three-filter Storm exhaustion.

### Filter-count-scaled local polish only

Run: `34707442052`

Rule under test:

`localPolishEvaluations = max(24, filterCount * 8)`

| Case | RMSE | maxAbs | violation | elapsed | filters | signatures | deadline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 1.9667 | 6.1346 | 8.1795 | 5.00 s | 9–10 | 3 | 5/5 |
| U12t | 1.4225 | 4.2963 | 5.7284 | 3.28 s | 10 | 1 | 0/5 |
| Trio | 0.6844 | 2.0179 | 2.7378 | 4.79 s | 10 | 1 | 0/5 |

Verdict: **retain as the strongest mechanism found in this audit so far**.

Key implications:

1. The strong Trio improvement does not require multi-region proposals, new shelf semantics, normalized-violation admission, or cleanup.
2. U12t also improves over frozen Q31 while remaining naturally deterministic before 5 seconds.
3. Storm improves materially but now needs more than the 5-second wall-clock budget; time-limited runs again diverge.
4. Therefore the precision mechanism and the consistency problem are separable:
   - deeper per-candidate local refinement improves the precision frontier;
   - wall-clock truncation reintroduces inconsistency when the deterministic search has not finished.

The next question is no longer whether scaled polish helps. It is whether its **terminal deterministic result** is good enough and how much deterministic work it requires.

### Updated leading architecture hypothesis

The strongest current direction is:

- frozen Q31 structural topology/search semantics;
- original single-region proposal geometry;
- original Q31 admission quota and selector;
- no new semantic-ranking bundle;
- no cleanup;
- local refinement budget scaled with current filter count;
- deterministic completion/work budget as the normal termination condition;
- wall-clock only as a safety fuse.

This hypothesis must now be evaluated at terminal/no-timeout and then tuned for the minimum work multiplier that preserves the quality gain.


## Phase 1.7 — Scaled-polish practical terminal result

Run: `34707686890`  
Solver: frozen Q31 + only `max(24, filterCount * 8)` local polish.

Five repeated runs with a 15-second safety fuse:

| Case | RMSE | maxAbs | violation | median elapsed | filters | signatures | deadline hits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Storm | 1.8787 | 5.8120 | 7.7494 | 9.90 s | 9 | 1 | 0/5 |
| U12t | 1.4225 | 4.2963 | 5.7284 | 3.19 s | 10 | 1 | 0/5 |
| Trio | 0.6844 | 2.0179 | 2.7378 | 4.70 s | 10 | 1 | 0/5 |

### Comparison against converged historical Standard V2

| Case | Standard V2 violation / time | Q31 + scaled polish violation / time | Direction |
| --- | --- | --- | --- |
| Storm | 7.1348 / 21.70 s | 7.7494 / 9.90 s | ~54% less time, modest precision loss |
| U12t | 6.4606 / 16.27 s | 5.7284 / 3.19 s | better precision and ~80% less time |
| Trio | 4.6577 / 12.46 s | 2.7378 / 4.70 s | substantially better precision and ~62% less time |

This is the first candidate in the audit that simultaneously demonstrates:

- exact repeated output once allowed to complete;
- large runtime reduction versus Standard V2;
- precision improvement on two of three adversarial cases;
- only one remaining precision gap, Storm.

The consistency failure seen at the 5-second Storm budget is therefore not intrinsic randomness. It is again a safety-fuse truncation of an otherwise deterministic search.

### Next tuning axis

Keep every other Q31 mechanism frozen and vary only the polish multiplier:

- `4×`
- `6×`
- current `8×`

Goal: find the lowest multiplier whose naturally exhausted result retains most of the U12t/Trio gains and materially closes Storm, while staying inside the desired practical runtime window.


## Phase 1.8 — Polish multiplier sweep

All variants preserve frozen Q31 search topology, proposal geometry, admission, selector, and Max10. Only the local polish multiplier changes.

### 4× polish

Run: `34707867974`

| Case | RMSE | maxAbs | violation | elapsed | filters | repeatability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 2.5306 | 8.0240 | 10.6987 | 3.38 s | 9 | 5/5 exact |
| U12t | 1.4035 | 4.2252 | 5.6336 | 3.14 s | 10 | 5/5 exact |
| Trio | 1.4341 | 2.9767 | 5.7364 | 2.46 s | 7 | 5/5 exact |

### 6× polish

Run: `34707869931`

| Case | RMSE | maxAbs | violation | elapsed | filters | repeatability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 1.8727 | 6.9479 | 9.2639 | 3.97 s | 7 | 5/5 exact |
| U12t | 1.4822 | 4.5059 | 6.0079 | 1.10 s | 9 | 5/5 exact |
| Trio | 0.8855 | 2.3265 | 3.5420 | 5.41 s | 10 | 5/5 exact |

### 8× polish

Run: `34707686890`

| Case | RMSE | maxAbs | violation | elapsed | filters | repeatability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Storm | 1.8787 | 5.8120 | 7.7494 | 9.90 s | 9 | 5/5 exact |
| U12t | 1.4225 | 4.2963 | 5.7284 | 3.19 s | 10 | 5/5 exact |
| Trio | 0.6844 | 2.0179 | 2.7378 | 4.70 s | 10 | 5/5 exact |

### Decision

`8×` is retained as the leading multiplier.

Reasons:

- it has the strongest Storm maxAbs by a wide margin;
- it nearly matches the best U12t result while materially beating `6×`;
- it strongly dominates `4×` and `6×` on Trio precision;
- all three cases finish before the 15-second fuse with one exact signature;
- runtime remains substantially below converged Standard V2 on all three cases.

The multiplier sweep is not monotonic in runtime or quality because local-polish depth changes which structural states survive and therefore changes the search trajectory. This rules out selecting a lower multiplier based only on nominal trial count.

### Deep no-timeout runner note

Run `34707590335` was intentionally stricter than the product-like 15-second validation. It eventually failed during extended terminal exploration because the stored structural result metrics diverged from independent canonical recomputation on Trio.

This does not invalidate the bounded 15-second `8×` evidence, which passed canonical recomputation. It does establish that unbounded “search until absolute exhaustion” is not a safe production contract.

The production research direction remains:

- deterministic bounded work/search;
- canonical recomputation before publication;
- a generous wall-clock safety fuse;
- no dependence on the exact moment the fuse fires during normal operation.


## Phase 2 — Public synthetic V2 corpus generalization

Candidate: frozen Q31 + filter-count-scaled polish x8.  
Run: `34708468207`  
Corpus: all 10 public `V2_BENCHMARK_CASES`.  
Protocol: Standard V2 with its 60 s contract; candidate with 15 s safety fuse and five repeats.

### Aggregate result

- exact candidate repeatability: **10/10 cases**
- candidate cases with any deadline hit: **0/10**
- candidate targets achieved in all repeats: **5/10**
- Standard V2 targets achieved: **9/10**
- candidate normalized-violation wins / losses / ties versus V2: **3 / 7 / 0**

### Per-case result

| Case | MaxF | V2 violation | Q31+8x violation | Candidate time | V2 time | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| bass_mid_mix | 10 | 0.3447 | 0.5172 | 1.71 s | 0.78 s | target met, V2 better/faster |
| alternating_2_8k | 10 | 0.6253 | 0.9942 | 1.23 s | 9.71 s | target met, much faster, lower precision |
| dense_treble | 10 | 0.8778 | 1.1276 | 3.66 s | 9.04 s | target missed narrowly |
| mixed_widths | 10 | 0.8928 | 0.5398 | 3.43 s | 1.98 s | candidate precision win |
| overlap | 10 | 0.8107 | 0.2912 | 5.31 s | 9.08 s | candidate precision + speed win |
| near_budget | 8 | 0.8741 | 1.8648 | 0.46 s | 3.42 s | cap-pressure failure |
| quantization_sensitive | 10 | 0.8537 | 0.1039 | 1.73 s | 0.07 s | major precision win, structural overuse |
| overcomplete_compress | 6 | 0.9754 | 1.3063 | 0.28 s | 2.49 s | cap/compression failure |
| stress_mid_treble | 10 | 2.3310 | 3.2908 | 4.33 s | 27.28 s | much faster, precision loss |
| stress_mixed_edges | 10 | 0.6881 | 1.5167 | 0.90 s | 0.99 s | edge/shelf failure |

### Structural interpretation

The candidate's main remaining failures are not caused by timing or randomness:

- every cell returns one exact signature across five runs;
- every cell naturally exhausts before the 15-second fuse.

The failures therefore belong to search geometry/state management.

Three distinct mechanisms are now implicated:

1. **Target-valid state retention / structural overuse**
   - `bass_mid_mix` returns 10 filters versus V2's 5.
   - `quantization_sensitive` returns 10 filters versus V2's 2 despite a very strong final fit.
   - The selector prefers fewer filters after target achievement, but Pareto retention considers only RMSE/maxAbs and can discard a lower-filter target-valid state when a more precise high-filter state dominates it.

2. **Capacity / slot replacement**
   - `near_budget` (MaxF=8) and `overcomplete_compress` (MaxF=6) terminate very quickly at the cap with poor quality.
   - Q31 cannot add or split when at the cap, so improvement must happen through remove/type/merge trajectories. This is a reachability restriction, not a runtime shortage.

3. **Edge/shelf and dense-feature geometry**
   - `stress_mixed_edges` contains real LS/HS structure and fails badly under the legacy “LS/HS at strongest residual feature” proposal geometry.
   - `dense_treble` and `stress_mid_treble` indicate a separate dense/high-Q candidate geometry limitation.

### Next isolated ablations

All start from frozen Q31 + x8 polish. No ranking/selector rewrite and no cumulative cleanup.

A. evidence-based shelf proposal generation only;  
B. preserve/archive the best target-valid low-filter state independently of Pareto beam survival;  
C. deterministic one-for-one slot replacement when at Max Filters.

Only mechanisms with public-corpus gains and no cross-case material regressions may advance.


## Phase 2.1 — Targeted mechanism ablations on Q31+x8

All rows are one-repeat public-corpus smoke runs after the 5-repeat Q31+x8 baseline established exact determinism.

### A. Semantic shelf geometry bundle

Run: `34708810409`

Changes only proposal geometry for shelves:
- direct PK remains single strongest residual;
- LS/HS direct adds require edge evidence;
- PK is no longer type-mutated into arbitrary shelves;
- shelves are not split.

Result:
- V2 comparison wins/losses: 4/6 versus baseline 3/7;
- target count remains 5/10.

Major gains:
- alternating_2_8k violation: 0.9942 -> 0.5488
- dense_treble: 1.1276 -> 0.6011, target now achieved
- overcomplete_compress: 1.3063 -> 1.1385

Material regressions:
- mixed_widths: 0.5398 -> 1.0327
- overlap: 0.2912 -> 0.4919
- stress_mid_treble: 3.2908 -> 3.5387
- stress_mixed_edges: 1.5167 -> 1.7995

Classification: **promising but too broad; decompose further**.

### B. Best target-valid state archive

Run: `34708813194`

This does not alter the search path. It archives the best target-valid state by the existing selector and returns it even if a later more precise high-filter state dominates it in the RMSE/maxAbs Pareto frontier.

It proves low-filter valid states exist:
- bass_mid_mix: 10 -> 6 filters
- alternating_2_8k: 9 -> 8
- mixed_widths: 8 -> 7
- overlap: 9 -> 6
- quantization_sensitive: 10 -> 3

However quality moves toward the target boundary, e.g.:
- quantization_sensitive violation 0.1039 -> 0.9126
- overlap 0.2912 -> 0.6485
- bass_mid_mix 0.5172 -> 0.9919

Classification: **reject as default precision policy**. It remains useful evidence for a future optional compact-delivery policy, not for the core solver objective.

### C. One-for-one PK replacement at the cap

Run: `34708815431`

At Max Filters, generate direct same-cardinality PK replacements at the strongest residual instead of requiring a remove state to survive before a later add.

Public-corpus quality was non-regressive in every case.

Positive deltas:
- mixed_widths: 0.5398 -> 0.5055
- quantization_sensitive: 0.1039 -> 0.0782
- overcomplete_compress: 1.3063 -> 1.0185

Unchanged:
- near_budget remained 1.8648
- stress_mid_treble remained 3.2908
- all other cells were equal or improved.

Classification: **retain**. This is the cleanest new mechanism after scaled polish, but replacement reachability still needs stronger admission for the hardest cap cases.

## Phase 2.2 — Failure topology evidence

Run: `34708918980`

### dense_treble

Returned 9 filters, including three internal LS filters around 1.4 kHz, 8.3 kHz and 11.1 kHz. Error concentrates in 4-8 kHz and 8-20 kHz. This confirms that legacy shelf/type geometry consumes structure that should be used for dense PK features.

### near_budget (MaxF=8)

Returned:
- LS ~6.7 kHz -1.5 dB;
- PKs near 233, 523, 1165, 2616, 5047, 15454 and 20 kHz.

The intended eight-PK structure includes meaningful features around 90 Hz and 9 kHz, but the delivered state has neither. The solver reaches the hard cap quickly (~0.35-0.46 s) and cannot recover the missing slots. This is a reachability/admission failure, not a runtime failure.

### overcomplete_compress (MaxF=6)

Returned an LS around 1.77 kHz +4.3 dB and five PKs, missing the intended low-frequency shelf and high shelf structure. One-for-one replacement improves the fit strongly but stops just above the RMSE target boundary.

### stress_mid_treble

Two internal LS filters around 5.5 and 6.2 kHz consume slots while the target contains dense PK structure extending through 16.5 kHz. The result concentrates filters below ~4 kHz and leaves presence/treble with very large residual error.

### stress_mixed_edges

The solver approximates the low shelf with a PK around 27 Hz, contains two internal LS filters (~2.2 kHz and ~12.6 kHz), and places an HS near 17.8 kHz. The residual peak remains around 15.9 kHz. The failure is not absence of edge capability alone; it is shelf proposal/type discipline plus slot allocation.

## Next decomposed experiments

1. **evidence-shelf-adds only**:
   replace direct strongest-feature LS/HS adds with evidence-based edge shelf adds, but leave legacy type-mutation and split behavior intact.

2. **shelf type discipline only**:
   preserve legacy direct shelf adds, but prevent PK -> arbitrary shelf type mutation and prevent shelf splitting.

3. **reserved replacement admission**:
   starting from the non-regressive replace-at-cap branch, guarantee one pre-polish replacement proposal survives admission when at the filter cap.

These remain isolated; no combination is promoted before individual evidence.


## Phase 2.3 — Decomposed shelf and replacement admission results

### Evidence-based shelf adds only

Run: `34709072795`

Only direct LS/HS add proposals are replaced by edge-evidence shelves. Legacy type mutation and split behavior remain unchanged.

Aggregate:
- targets achieved: **6/10** versus baseline 5/10;
- exact/no-timeout behavior retained in the smoke pass.

Strong gains:
- dense_treble: violation 1.1276 -> 0.6011; target recovered
- stress_mixed_edges: 1.5167 -> 0.7724; target recovered
- overcomplete_compress: 1.3063 -> 1.0327
- alternating_2_8k: 0.9942 -> 0.9324

Regressions:
- mixed_widths: 0.5398 -> 1.1210; target lost
- stress_mid_treble: 3.2908 -> 3.5875
- near_budget: 1.8648 -> 1.9826
- overlap: 0.2912 -> 0.4907

Classification: **specialist mechanism, reject as unconditional global policy**.

### Shelf type discipline only

Run: `34709074469`

Legacy direct shelf adds are preserved, but PK -> shelf type mutation is disabled and shelves are no longer split.

Result:
- target count falls to 4/10;
- alternating_2_8k loses target;
- dense_treble remains a miss;
- only modest gains on mixed_widths and overlap.

Classification: **reject**.

The large dense/edge gains of the full semantic shelf geometry are therefore driven primarily by evidence-based shelf add geometry, not by type discipline alone.

### Reserved replacement admission

Run: `34709076422`

Starting from the non-regressive direct replacement mechanism, one best pre-polish replacement is forced into the admitted proposal set whenever a parent is at Max Filters.

Gains:
- dense_treble: 1.1276 -> 0.9674; target recovered
- overcomplete_compress: 1.3063 -> 1.0185
- mixed_widths and quantization_sensitive also improve

Regressions:
- stress_mid_treble: 3.2908 -> 3.5461
- stress_mixed_edges: 1.5167 -> 1.5679

near_budget remains unchanged.

Classification: **reject forced admission**. Keep the earlier direct replacement proposal competing normally; do not reserve a global quota slot.

## Updated retained/rejected mechanism list

Retained for further research:
- Q31 B4/P8 structural search semantics;
- filter-count-scaled local polish x8;
- direct one-for-one PK replacement at the cap, normal admission only.

Rejected as global defaults:
- multi-region always-on proposals;
- quota inversion;
- normalized-violation/semantic-ranking bundle;
- cumulative cleanup;
- target-valid archive as default delivery;
- full semantic shelf geometry;
- shelf type discipline alone;
- forced replacement admission.

Specialist evidence, not yet globally usable:
- edge-evidence shelf add proposals.

## Next causal axis: PK width/Q seeding

Standard V2 derives PK Q from residual width using sign-crossing/half-height boundaries and evaluates Q scales 0.5x, 1x and 2x.

Frozen Q31 instead seeds every newly added PK at approximately the geometric-mean Q (~1.095) and relies on local polish to move Q afterward.

The next isolated experiment will keep all Q31+x8 semantics unchanged except for generating width-informed Q variants for the strongest residual PK feature. This directly targets dense_treble/stress_mid_treble without importing Standard V2's expensive global search architecture.


## Phase 2 — Public synthetic V2 corpus generalization

Run: `34710832786`  
Artifact: `q31-x8-v2-corpus-34710832786`

Candidate under test:

- frozen Q31 structural search;
- local polish `max(24, filterCount * 8)`;
- no multi-region patch;
- no semantic-ranking bundle;
- no cleanup;
- case-specific `maxFilters` preserved;
- 15-second safety fuse;
- five repeated candidate runs per case.

### Aggregate result

- public cases: **10**
- exact-repeatability cases: **10/10**
- deadline-free cases: **10/10**
- lower normalized violation than Standard V2: **3/10**
- higher normalized violation than Standard V2: **7/10**

The candidate therefore generalizes its **consistency** and bounded runtime, but not yet V2-level precision across the public corpus.

### Case table

| Case | Category | V2 violation | Q31+8× violation | Delta | V2 time | Q31+8× time | Repeatability |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| bass_mid_mix | solvable | 0.3447 | 0.5172 | +0.1725 | 0.77 s | 1.69 s | exact |
| alternating_2_8k | solvable | 0.6253 | 0.9942 | +0.3689 | 9.51 s | 1.22 s | exact |
| dense_treble | solvable | 0.8778 | 1.1276 | +0.2497 | 8.94 s | 3.64 s | exact |
| mixed_widths | solvable | 0.8928 | **0.5398** | **-0.3530** | 2.00 s | 3.42 s | exact |
| overlap | solvable | 0.8107 | **0.2912** | **-0.5195** | 8.96 s | 5.30 s | exact |
| near_budget | solvable, max=8 | 0.8741 | 1.8648 | +0.9907 | 3.37 s | 0.46 s | exact |
| quantization_sensitive | solvable | 0.8537 | **0.1039** | **-0.7498** | 0.07 s | 1.73 s | exact |
| overcomplete_compress | solvable, max=6 | 0.9754 | 1.3063 | +0.3309 | 2.48 s | 0.29 s | exact |
| stress_mid_treble | stress | 2.3310 | 3.2908 | +0.9598 | 27.06 s | 4.30 s | exact |
| stress_mixed_edges | stress | 0.6881 | 1.5167 | +0.8286 | 0.99 s | 0.89 s | exact |

### Important structural observation

The Q31+8× candidate still manufactures shelves from arbitrary local residual extrema. The public-corpus failures expose this clearly.

Examples from candidate deliverables include:

- `HS 1721 Hz` and `HS 5664 Hz` in an all-PK alternating fixture;
- `LS 6689 Hz` in the all-PK near-budget fixture;
- several high-frequency `LS` filters in dense-treble;
- `LS 2200 Hz` and `LS 12626 Hz` in stress-mixed-edges.

This is independent evidence for a candidate-geometry defect: local extrema are being allowed to express themselves as shelf topology without edge evidence.

The shelf problem is now being isolated separately without changing Q31 ranking, quota, beam, selector, or polish depth.

### Updated status of Q31+8×

Retain:

- exact repeatability;
- bounded deterministic-looking completion before the safety fuse on all 10 public cases;
- strong wins on mixed widths, overlap, and quantization-sensitive cases;
- strong prior wins on U12t and Trio.

Do not promote yet:

- seven public-corpus regressions remain;
- near-budget and stress cases reveal large precision gaps;
- arbitrary shelf topology is a plausible causal mechanism for several of those failures.

Next active ablations:

1. evidence-based shelf additions only;
2. full shelf semantics: evidence-based additions plus no arbitrary PK->shelf mutation and no shelf split.

The holdout corpus remains unopened.


## Phase 2.1 — Shelf semantics isolation on Q31 + 8× polish

All shelf experiments preserve:

- frozen Q31 beam/admission/selector behavior;
- single-region feature selection;
- 8× local polish;
- no cleanup;
- public 10-case corpus only;
- five repeats per case with 15 s safety fuse.

All variants remained **10/10 exactly repeatable** and **10/10 deadline-free**.

### A. Evidence-based shelf additions only

Run: `34711092758`

Rule:

- strongest residual feature still generates PK;
- LS/HS additions are generated only from sustained edge evidence;
- legacy type mutation and split remain enabled.

Notable deltas versus Q31+8×:

| Case | Q31+8× | Shelf-add only | Direction |
| --- | ---: | ---: | --- |
| alternating_2_8k | 0.9942 | 0.9324 | better |
| dense_treble | 1.1276 | 0.6011 | much better |
| overcomplete_compress | 1.3063 | 1.0327 | better |
| stress_mixed_edges | 1.5167 | 0.7724 | much better |
| mixed_widths | 0.5398 | 1.1210 | worse |
| near_budget | 1.8648 | 1.9826 | worse |
| stress_mid_treble | 3.2908 | 3.5875 | worse |

Verdict: promising but incomplete.

### B. Full shelf semantics

Run: `34711095229`

In addition to evidence-based additions:

- PK cannot mutate into shelf;
- shelves cannot split.

This produced:

- alternating_2_8k: **0.5488**
- dense_treble: **0.6011**
- stress_mixed_edges: **1.7995**

The combined policy therefore improves one all-PK alternating case strongly but destroys the mixed-edge stress case.

### C. Evidence-based additions + no PK->shelf, while keeping shelf split

Run: `34711273538`

This isolates the type-mutation restriction.

Key results:

| Case | Violation |
| --- | ---: |
| bass_mid_mix | 0.4808 |
| alternating_2_8k | **0.5488** |
| dense_treble | **0.6011** |
| mixed_widths | 1.1210 |
| overlap | 0.4907 |
| near_budget | 1.9826 |
| quantization_sensitive | **0.0895** |
| overcomplete_compress | 1.0327 |
| stress_mid_treble | 3.5875 |
| stress_mixed_edges | **0.7724** |

This retains the large alternating improvement while preserving the good mixed-edge result from shelf-add-only.

Verdict: **retain as the leading shelf policy**.

### D. Evidence-based additions + no shelf split, while keeping legacy type mutation

Run: `34711275721`

Key results:

- alternating_2_8k: 0.9324
- dense_treble: 0.6011
- mixed_widths: 1.0327
- stress_mixed_edges: 1.7995

This demonstrates that the large mixed-edge regression comes from removing shelf split, while the alternating improvement comes from removing PK->shelf mutation.

Verdict: **reject shelf-split prohibition**.

### Shelf conclusion

Retained mechanisms:

1. shelf additions require sustained edge evidence;
2. PK must not mutate arbitrarily into LS/HS;
3. existing shelf split/refinement remains allowed.

Rejected mechanisms:

- globally forbidding shelf split;
- importing the prior semantic-ranking bundle;
- changing beam/final selector as part of shelf semantics.

This shelf policy improves candidate topology without changing the determinism contract.

## Phase 2.2 — Next causal target: slot replacement / bridge reachability

The public `near_budget` fixture remains poor under every shelf variant.

Target structure uses eight PK bands. Q31 reaches the eight-filter cap but settles on the wrong composition and cannot efficiently exchange a bad slot for a missing useful one.

This matches prior research evidence that a temporarily worse intermediate can be required to reach a better descendant. Current structural search performs remove and add as separate hops, so a seven-filter bridge can be dominated or dropped before the replacement add occurs.

Next experiment:

- add a deterministic single-hop **replace** mutation at capacity;
- for each existing slot, replace that slot with a PK seeded at the current strongest residual feature;
- preserve Q31 admission, beam, selector, 8× polish and the retained shelf policy;
- compare replacement on near-budget first, then the full public corpus if positive.

No holdout cases are opened.


## Phase 2.3 — Near-budget reachability diagnostics

### One-hop strongest-residual swap

Targeted run: `34711479890`

Adding a same-cap `swap-pk` mutation using the current strongest residual feature and default structural Q produced **no output change**.

A direct diagnostic then bypassed admission and polished all eight such swaps independently.

Run: `34711613003`

Result:

- incumbent violation: **1.982598**
- swap proposals evaluated: **8**
- improving swaps: **0**
- best swap violation: **2.174530**

Conclusion: the simple single-feature/default-Q replacement operator is rejected. Its failure is not caused by Q31 admission.

### V2-geometry replacement oracle

Run: `34711687452`

The same incumbent residual was passed through Standard V2's richer PK candidate generator:

- multiple local extrema;
- sign-crossing / half-height width estimation;
- Q-scale variants;
- shortlist ranking.

Results:

- generated PK candidates: **84**
- shortlisted candidates: **8**
- replacement combinations polished directly: **64**
- improving replacements: **4**
- incumbent violation: **1.982598**
- best replacement violation: **1.911585**

The best seed was approximately:

- 15.014 kHz
- -1.487 dB
- Q 5.44

replacing the incumbent's weak ~4.6 kHz slot.

This proves that candidate geometry matters: the structural Max10 default-Q proposal missed a locally useful replacement that the V2 width/Q geometry exposed.

### Iterative rich-replacement oracle

Run: `34711752385`

After accepting the best rich replacement, the residual was recomputed and the entire V2-geometry replacement search repeated.

Result:

- step 0: **1.982598 -> 1.911585**
- subsequent improving steps: **0**

Conclusion: rich single-slot replacement helps, but replacement reachability alone does not explain the full gap to Standard V2 (`0.8741`). The bad basin requires more than successive local slot swaps.

### PK-only near-budget test

Run: `34711837828`

All shelf additions were disabled while preserving Q31 + 8× polish.

Result:

- violation: **1.631808**
- RMSE: **0.407952 dB**
- maxAbs: **1.207166 dB**
- runtime: ~0.37–0.47 s
- exact repeatability: **5/5**

This is materially better than the retained shelf policy (`1.982598`), proving that false-positive shelves consume useful capacity under this pressure case.

However the PK-only deliverable still wastes slots at **28 Hz** and **20 kHz**, and contains a close pair around 5 kHz. The target remains materially better represented by Standard V2.

### Next isolated mechanism: internal-extrema-only PK seeding

The original Q31 `featureFrequency()` treats grid endpoints as local extrema. That allows structural PK additions to be seeded directly at the low/high evaluation boundaries.

Next experiment:

- exclude index 0 and index N-1 from PK feature selection;
- retain evidence-based LS/HS generation at the edges;
- retain no PK->shelf mutation;
- retain shelf split;
- preserve original Q31 beam/quota/selector and 8× polish.

This separates legitimate edge correction (shelves) from illegitimate endpoint PK attraction.


## Phase 2.4 — PK split recursion and dead-slot diagnostics

### No PK split

Run: `34712908182`

Shelves retained split, PK split disabled.

| Case | violation | filters |
| --- | ---: | ---: |
| mixed_widths | 1.1210 | 7 |
| near_budget | 1.9303 | 8 |
| stress_mid_treble | **4.1523** | 2 |
| stress_mixed_edges | 0.9376 | 10 |

Verdict: **reject**. PK split is required for reachability.

### PK split depth cap

Runs:

- depth 1: `34712999193`
- depth 2: `34713001254`

| Case | retained shelf policy | depth 1 | depth 2 |
| --- | ---: | ---: | ---: |
| mixed_widths | 1.1210 | 1.1210 | 1.1210 |
| near_budget | 1.9826 | 1.9826 | 1.9826 |
| stress_mid_treble | 3.5875 | **3.5075** | **3.5025** |
| stress_mixed_edges | 0.7724 | 0.7818 | **0.7724** |

Depth 2 is the leading split policy:

- preserves the mixed-edge result exactly;
- does not regress near-budget/mixed-widths;
- modestly improves stress-mid-treble;
- prevents unbounded recursive PK split chains.

However stress-mid-treble still exhibits severe regional concentration: seven pairs are within 1/6 octave and the highest filter is only ~4.1 kHz.

### All-rich-candidate oracle after depth 2

Run: `34713128578`

Final depth-2 stress state:

- 9 filters
- violation: **3.50254**
- generated rich PK candidates: **54**
- directly improving candidates: **13**

Best one-slot addition:

- ~5.385 kHz
- +2.63 dB
- Q ~6.61
- violation: **3.17017**

A ~12 kHz candidate also improves the state to **3.39043**.

Conclusion: the V2 shortlist is not the primary tunnel cause. Higher-frequency candidates are useful, but the current state still prefers another mid-treble correction when only one slot is available.

### Exact zero-gain canonicalization

Run: `34713250052`

After every polish, filters quantized to exactly 0.0 dB were removed.

Stress-mid-treble changed:

- filter count: **9 -> 7**
- violation: **3.50254 -> 3.50254** (exactly unchanged)

The freed slots were not reused. The search still terminated in the same basin.

Conclusion:

- exact-zero filters are dead capacity and should eventually be canonicalized away;
- but they are a symptom rather than the root cause;
- the next structural add is collapsing back into an already explored local region.

### Next experiment

Use a single novelty-aware PK feature:

- retain one add-PK proposal per state;
- rank residual extrema by magnitude;
- prefer an extremum separated from existing PK centers by a minimum octave distance;
- fall back to the original strongest extremum when no novel feature exists;
- keep depth-2 PK split for local refinement;
- keep retained shelf semantics and 8x polish.

This is intentionally different from rejected always-on multi-region search: proposal count does not increase.
