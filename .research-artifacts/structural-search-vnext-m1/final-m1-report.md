# Structural Search VNext M1 final report

## Freeze and campaign

- Frozen implementation: `b735583a0554b6998146ab2fab0c14595cb01649`.
- Evidence SHA-256: `e3adfcac1ae2251e8aa9ce2743558a6c61e9c590427a63dd3ed658a2cda9eb0e`.
- Engines: baseline `runStructuralSearch`; VNext `runStructuralSearchVNext`.
- Fixed envelope: structural ceiling 43, effort 6, nominal checkpoints 5/15/30 seconds, three serial repeats. Synthetic probes use their frozen below/at/above known-generating-complexity envelope; K is not a minimum-complexity claim.
- Corpus/input hashes and the full best/median/worst cells are in `manifest.json` and `aggregate.json`. Raw timing is in the deliberately uncommitted `raw-timing.jsonl`.

## Final real-FR medians (30 s)

| Case | Baseline RMSE / maxAbs | VNext RMSE / maxAbs | Baseline → VNext filters | Diagnosis |
| --- | ---: | ---: | ---: | --- |
| Titan → RSV | 0.5729 / 1.7079 | 1.0583 / 3.1751 | 15 → 8 | useful baseline work displaced by diversification |
| Titan → Mystic 8 | 1.4788 / 4.4380 | 1.2734 / 3.8691 | 11 → 10 | win; retained diversity, not replacement |
| Titan → S12 Ultra | 0.8045 / 2.4236 | 1.2575 / 4.0349 | 18 → 9 | useful baseline work displaced by diversification |
| Titan → Storm | 1.0118 / 3.0382 | 1.5017 / 4.8036 | 13 → 7 | useful baseline work displaced by diversification |
| Titan → U12t | 0.8697 / 2.6162 | 0.8121 / 2.3960 | 15 → 11 | win; retained diversity, not replacement |
| Titan → Trio | 0.5747 / 1.7304 | 0.7281 / 2.2191 | 15 → 10 | useful baseline work displaced by diversification |

The complete 5/15/30 best/median/worst metric, violation, delivered-filter, frontier, elapsed-time, and raw-work summaries are committed in `aggregate.json` and rendered in `summary.md`.

## Synthetic sanity: at known K, final checkpoint

| Case | K | Baseline RMSE / maxAbs | VNext RMSE / maxAbs |
| --- | ---: | ---: | ---: |
| D | 12 | 0.0501 / 0.1303 | 0.2450 / 0.5981 |
| E | 3 | 0.0202 / 0.1211 | 0.2342 / 0.7987 |
| F | 3 | 0.1462 / 0.5841 | 0.2351 / 0.7066 |
| H | 6 | 0.1100 / 0.3495 | 0.1760 / 0.4840 |

The full frozen probe-envelope cells are in `aggregate.json`; no per-family tuning was performed.

## Work and mechanism

At final real checkpoints VNext used more proposal work while generally ending with a smaller frontier: RSV 2,235 vs 1,644 proposals and frontier 10 vs 15; S12 1,974 vs 1,728 and 9 vs 19; Storm 2,827 vs 1,741 and 9 vs 15; Trio 2,186 vs 1,512 and 10 vs 19. This is displacement evidence rather than extra ordinary baseline-equivalent work.

Aggregate VNext telemetry: 68,477 add-PK, 5,860 add-LS, 3,981 add-HS, 71,733 remove, 39,678 split, 7,117 type-mutation, and 3,973 merge proposals; 7,014 residual regions generated/admitted; 71,092 signatures generated/admitted and 21,609 retained; five stall/diversification events; 69 replacement/polish attempts; zero accepted replacements and zero accepted-replacement gain. Final improvement phases were beam (147) and cap-swap (15), never replacement. Thus the two wins are causally compatible with diverse beam retention, while the failed cells have no replacement/basin-escape evidence.

## Quantized delivery and complexity

Only final float wins were delivered. Mystic 8 float/quantized median RMSE remained 1.4788 → 1.2734; U12t remained 0.8697 → 0.8121. All float-to-quantized MAE/RMSE/maxAbs deltas were zero for the recorded filters, recomputed VNext preamp was -8.3 dB (Mystic 8) and -12.3/-12.2 dB across U12t repeats, and both advantages survived. Final quantized filters are in `quantized-delivery.json`.

Representative complexity does not show a systematic pathological increase: all real VNext representatives use fewer filters. The largest real VNext Q p90/Q max is Mystic 8 (8.49/8.97), and the largest absolute gain is 15 dB on S12 (equal to baseline). Full Q, gain, boost, and opposing-pair values are in `complexity-sanity.json`.

## Acceptance and recommendation

**FAIL.** VNext improved only one of three development cases (Mystic 8), one of three holdout cases (U12t), and two of six overall; four real cases are worse in both median RMSE and maxAbs. Although the two wins survive actual V2 delivery and telemetry shows diversity retention, the frozen gate requires 2/3 in each split, four overall, and no such trade.

Primary failure category for RSV, S12 Ultra, Storm, and Trio: **useful baseline work displaced by diversification**. Overall architectural diagnosis: the VNext policy spends much of its fixed elapsed envelope on its broad structural mutation/diversity path, reaches materially smaller ordinary-search frontiers in the failed cells, and never converts its replacement machinery (0/69 accepted). This is a quality failure, not a demonstrated correctness defect; no tuning or algorithm change was made.

Milestone-2 recommendation: do not make VNext the production default. Preserve this failed M1 as the control and, only under a new approved design, validate an explicitly bounded work-allocation architecture that can demonstrate retained ordinary-search progress before another quality campaign.
