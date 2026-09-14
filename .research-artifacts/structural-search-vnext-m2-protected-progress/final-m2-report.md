# Structural Search VNext M2 final report

## Frozen campaign

- Frozen M1 implementation: `b735583a0554b6998146ab2fab0c14595cb01649`.
- Final evidence SHA-256: `2eb204bb143b345a2a842dd83e37ecbc998bdba9a9762272ec5475357840dcdd`.
- Engines: baseline `runStructuralSearch`; M2 `runStructuralSearchVNextM2`; retained M1 control `runStructuralSearchVNext`.
- Fixed envelope: structural ceiling 43, effort 6, three serial repeats, and nominal 5/15/30-second checkpoints on one continuing trajectory per engine/repeat. The raw timing trace remains intentionally uncommitted.
- No M2 algorithm, mechanism, acceptance gate, corpus, envelope, or benchmark protocol was modified after the passed pre-benchmark mechanism gate.

## Final real-case 30-second medians

| Case | Baseline RMSE / maxAbs | M2 RMSE / maxAbs | Baseline observedElapsedMs | M2 observedElapsedMs |
| --- | ---: | ---: | ---: | ---: |
| Titan → RSV | 0.4832 / 1.4524 | 0.4849 / 1.4615 | 30004.2 | 30002.6 |
| Titan → Mystic 8 | 1.4793 / 4.4380 | 1.4793 / 4.4380 | 30004.9 | 30002.9 |
| Titan → S12 Ultra | 0.8057 / 2.4236 | 0.8057 / 2.4236 | 30002.5 | 30003.5 |
| Titan → Storm | 1.0118 / 3.0382 | 1.0118 / 3.0382 | 30003.0 | 30015.6 |
| Titan → U12t | 0.8697 / 2.6173 | 0.8697 / 2.6162 | 30004.1 | 30002.7 |
| Titan → Trio | 0.5751 / 1.7304 | 0.5751 / 1.7304 | 30003.1 | 30000.9 |

Development / holdout / overall wins: **0/3**, **0/3**, **0/6** (gate requires 2/3, 2/3, and 4/6).
Worse in both median RMSE and maxAbs: **titan-to-rsv**.

At the final 30-second real-FR cells, Mystic 8, S12 Ultra, Storm, and Trio are median-identical to baseline on both metrics. U12t has equal median RMSE and a slightly lower median maxAbs. Thus RSV is the only dual-metric median regression: M2 avoided M1's broad displacement failure, but produced no quality improvement.

## Continuing-trajectory checkpoint observations

These are observations at the first trace event at or after each nominal checkpoint, not exact 5.000/15.000-second snapshots. Values are median RMSE / maxAbs; elapsed values are median `observedElapsedMs`.

### Nominal 5s checkpoint

| Case | Baseline RMSE / maxAbs | Baseline observedElapsedMs | M2 RMSE / maxAbs | M2 observedElapsedMs |
| --- | ---: | ---: | ---: | ---: |
| Titan → RSV | 0.9985 / 3.1374 | 5400.9 | 0.9985 / 3.1374 | 5604.0 |
| Titan → Mystic 8 | 1.4904 / 4.4570 | 5063.4 | 1.4904 / 4.4570 | 5040.7 |
| Titan → S12 Ultra | 0.8481 / 2.5690 | 6008.7 | 0.8481 / 2.5690 | 6015.9 |
| Titan → Storm | 1.0311 / 3.3963 | 5831.9 | 1.0311 / 3.3963 | 5907.3 |
| Titan → U12t | 0.9380 / 2.7193 | 6223.0 | 0.9671 / 2.7127 | 5843.5 |
| Titan → Trio | 0.5754 / 1.7354 | 5884.4 | 0.5754 / 1.7354 | 6007.1 |

### Nominal 15s checkpoint

| Case | Baseline RMSE / maxAbs | Baseline observedElapsedMs | M2 RMSE / maxAbs | M2 observedElapsedMs |
| --- | ---: | ---: | ---: | ---: |
| Titan → RSV | 0.9706 / 2.6922 | 15909.6 | 0.9706 / 2.6922 | 16591.0 |
| Titan → Mystic 8 | 1.4785 / 4.4381 | 17936.9 | 1.4785 / 4.4381 | 17394.3 |
| Titan → S12 Ultra | 0.8079 / 2.4241 | 17235.4 | 0.8079 / 2.4241 | 17226.9 |
| Titan → Storm | 1.0116 / 3.0382 | 18028.3 | 1.0116 / 3.0382 | 18482.5 |
| Titan → U12t | 0.8734 / 2.6201 | 16100.4 | 0.8734 / 2.6201 | 15592.5 |
| Titan → Trio | 0.5765 / 1.7304 | 16052.5 | 0.5765 / 1.7304 | 16016.1 |

### Nominal 30s checkpoint

| Case | Baseline RMSE / maxAbs | Baseline observedElapsedMs | M2 RMSE / maxAbs | M2 observedElapsedMs |
| --- | ---: | ---: | ---: | ---: |
| Titan → RSV | 0.4832 / 1.4524 | 30004.2 | 0.4849 / 1.4615 | 30002.6 |
| Titan → Mystic 8 | 1.4793 / 4.4380 | 30004.9 | 1.4793 / 4.4380 | 30002.9 |
| Titan → S12 Ultra | 0.8057 / 2.4236 | 30002.5 | 0.8057 / 2.4236 | 30003.5 |
| Titan → Storm | 1.0118 / 3.0382 | 30003.0 | 1.0118 / 3.0382 | 30015.6 |
| Titan → U12t | 0.8697 / 2.6173 | 30004.1 | 0.8697 / 2.6162 | 30002.7 |
| Titan → Trio | 0.5751 / 1.7304 | 30003.1 | 0.5751 / 1.7304 | 30000.9 |

## Ordinary-work and M2 mechanism

Final real-case ordinary counters are beam generations / proposals generated / admitted / polished. Challenger counters are reported separately and are not credited as baseline-equivalent work.

| Case | Baseline ordinary | M2 ordinary | Delta (M2 − baseline) |
| --- | ---: | ---: | ---: |
| Titan → RSV | 29 / 2255 / 2211 / 2183 | 28 / 2199 / 2155 / 2150 | -1 / -56 / -56 / -33 |
| Titan → Mystic 8 | 27 / 2539 / 2535 / 2524 | 27 / 2567 / 2563 / 2560 | 0 / 28 / 28 / 36 |
| Titan → S12 Ultra | 23 / 2130 / 1898 / 1867 | 23 / 2130 / 1898 / 1866 | 0 / 0 / 0 / -1 |
| Titan → Storm | 33 / 2185 / 2185 / 2167 | 33 / 2185 / 2185 / 2165 | 0 / 0 / 0 / -2 |
| Titan → U12t | 22 / 2052 / 2018 / 2006 | 23 / 2189 / 2146 / 2131 | 1 / 137 / 128 / 125 |
| Titan → Trio | 25 / 2146 / 2132 / 2127 | 25 / 2179 / 2164 / 2161 | 0 / 33 / 32 / 34 |

Aggregate M2 telemetry: **54** stall events; **21** challengers constructed; **21** challenger polish attempts; **0** challengers accepted into beam; **0** challenger incumbent improvements.
Final incumbent phases: beam **45**, cap-swap **9**.
Protected-progress gate: **FAIL** — 18 no-intervention runs and 18 no-accepted-challenger runs diverged from baseline on titan-to-rsv, titan-to-u12t (tolerance 1e-9).

### Interpretation erratum: trigger reachability and protected progress

The aggregate counts above are valid cumulative final-trajectory counts, not checkpoint triple-counting. All stall/challenger activity occurred only in the synthetic probes: all 54 stall events and all 21 challenger construction/polish attempts; none occurred in the real corpus.

At the final 30-second real-FR cells there were 6 cases × 3 repeats = 18 M2 trajectories, with 0 stall events, 0 challengers constructed, 0 challenger polish attempts, 0 challengers accepted into the beam, and 0 challenger incumbent improvements. The real quality result therefore does not test whether a stall-triggered challenger can improve a real case. It is mostly a comparison of the baseline-like M2 ordinary path against baseline under independent wall-clock executions.

The synthetic probes supply the actual challenger-mechanism evidence: challenger opportunities occurred, 21 challengers were constructed and polished, 0 entered the beam, and 0 improved the incumbent. This is negative evidence for the specific current challenger construction/admission mechanism on those probes, not a general conclusion about all possible structural interventions.

The protected-progress gate value remains **FAIL**. It compares independent wall-clock runs by repeat index with tolerance `1e-9`; baseline itself exhibits nonzero wall-clock/run-to-run variation, including RSV and U12t. Consequently, the real campaign cannot distinguish M2 policy-path overhead, ordinary wall-clock trajectory variance, or another timing-sensitive execution difference. Protected-progress equivalence was not demonstrated under real wall-clock execution; the result does not causally prove that M2 structurally altered the ordinary search path. The deterministic mechanism tests remain the appropriate evidence for logical no-stall-path equivalence.

## M1 control

| Case | M1 control 30s median RMSE / maxAbs | observedElapsedMs |
| --- | ---: | ---: |
| Titan → RSV | 0.9729 / 3.0078 | 30002.4 |
| Titan → Mystic 8 | 1.1909 / 3.8662 | 30001.9 |
| Titan → S12 Ultra | 0.9738 / 2.9339 | 30002.0 |
| Titan → Storm | 1.4467 / 4.3913 | 30002.2 |
| Titan → U12t | 0.7671 / 2.2494 | 30003.2 |
| Titan → Trio | 0.5898 / 1.7405 | 30003.5 |

## Quantized delivery and complexity

M2 had no final real float RMSE wins, so `quantized-delivery.json` is intentionally empty (`[]`): there are no final real M2 wins to deliver or assess for survival.
Complexity sanity: no systematic pathology flagged; it is not an optimization threshold. M2 real representatives used Titan → RSV: 12 filters, Q p90/max 7.78/8.2, |gain|max 8.6, 1 opposing-nearby pairs; Titan → Mystic 8: 9 filters, Q p90/max 11.38/11.38, |gain|max 9.9, 0 opposing-nearby pairs; Titan → S12 Ultra: 17 filters, Q p90/max 4.13/4.68, |gain|max 15, 0 opposing-nearby pairs; Titan → Storm: 14 filters, Q p90/max 6.91/12, |gain|max 15, 0 opposing-nearby pairs; Titan → U12t: 15 filters, Q p90/max 9.71/12, |gain|max 15, 0 opposing-nearby pairs; Titan → Trio: 16 filters, Q p90/max 6.04/6.32, |gain|max 9.6, 0 opposing-nearby pairs.

## Synthetic D/E/F/H at known K, 30-second checkpoint

| Case | K | Baseline RMSE / maxAbs | M2 RMSE / maxAbs | Baseline observedElapsedMs | M2 observedElapsedMs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Synthetic D | 12 | 0.0501 / 0.1303 | 0.0501 / 0.1303 | 7326.2 | 7223.6 |
| Synthetic E | 3 | 0.0202 / 0.1211 | 0.0202 / 0.1211 | 140.1 | 132.7 |
| Synthetic F | 3 | 0.1462 / 0.5841 | 0.1462 / 0.5841 | 457.3 | 440.6 |
| Synthetic H | 6 | 0.1100 / 0.3495 | 0.1100 / 0.3495 | 600.7 | 579.2 |

## Acceptance, failure localization, and recommendation

**Overall M2 acceptance gate: FAIL.** The quality component has zero real wins (required 2 development, 2 holdout, 4 total); Titan → RSV is worse in both RMSE and maxAbs. The protected-progress gate also formally fails, but under independent real wall-clock runs it is evidence that equivalence was not demonstrated, not causal proof of an ordinary-path structural change. This is campaign evidence, not a reason to tune the frozen M2 mechanism.

Failure localization: real-corpus trigger reachability was zero, while the synthetic probes reached the trigger but admitted 0/21 challengers. The only real dual-metric median regression is Titan → RSV. No correctness defect was observed in the campaign execution.

Architectural conclusion: M2 rejects the current exact-stall-triggered challenger design as a quality-improving architecture. The real corpus did not reach the intervention trigger, while synthetic probes reached it but accepted 0/21 challengers. The experiment therefore identifies trigger reachability and challenger usefulness as the next structural-search questions. It does not justify reopening resource/scheduler allocation. Keep baseline as production default; retain M1 and M2 as frozen research controls. Do not propose or implement M3 in this commit.
