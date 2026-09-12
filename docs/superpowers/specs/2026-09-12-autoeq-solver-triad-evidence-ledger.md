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
