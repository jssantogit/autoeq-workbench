# Structural Search M3 — diagnostic structural-stagnation census

- Frozen boundary: `f5052b2b1bfdf12b013db5c34c5fda65304091c3`
- Evidence SHA-256: `9927d848d72069de1255a40a12c672079d43741c1568193c97a342233d4fe703`
- Protocol: C43, effort 6, one continuing 30-second baseline trajectory, 3 serial repeats.
- Search policy: frozen ordinary baseline only; M3 telemetry is shadow-only and cannot affect decisions.
- M1/M2 controls and the Standard-v1 floating baseline are unchanged.
- Synthetic probes: D/E/F/H at below, at, and above known generating complexity (never minimum complexity).

## Required aggregate observations

| Family | Signal | Cases | Repeats | Trajectories | Occurrences | Run median | Run max | First generation median | First elapsed ms median | Later reference signature changes | Later surviving novelty | Final RMSE improves | Final maxAbs improves | Additional filters delivered |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| real | S0 | 5 | 8 | 8 | 8 | 1 | 1 | 30.5 | 30003.0 | 0 | 0 | 0 | 0 | 0 |
| real | S1 | 5 | 8 | 8 | 8 | 1 | 1 | 30.5 | 30003.0 | 0 | 0 | 0 | 0 | 0 |
| real | S2 | 5 | 9 | 9 | 9 | 1 | 1 | 23 | 30003.7 | 0 | 0 | 0 | 0 | 0 |
| real | S3 | 5 | 13 | 13 | 39 | 1 | 3 | 15 | 8913.9 | 30 | 30 | 19 | 30 | 29 |
| real | S4 | 5 | 7 | 7 | 7 | 1 | 1 | 30 | 30003.2 | 0 | 0 | 0 | 0 | 0 |
| synthetic | S0 | 3 | 9 | 15 | 27 | 2 | 2 | 2 | 99.4 | 3 | 3 | 21 | 21 | 3 |
| synthetic | S1 | 3 | 9 | 15 | 27 | 2 | 2 | 2 | 99.4 | 3 | 3 | 21 | 21 | 3 |
| synthetic | S2 | 3 | 9 | 12 | 24 | 2 | 2 | 2.5 | 142.3 | 0 | 0 | 18 | 18 | 0 |
| synthetic | S3 | 3 | 9 | 12 | 24 | 2 | 2 | 2.5 | 142.3 | 0 | 0 | 18 | 18 | 0 |
| synthetic | S4 | 3 | 9 | 12 | 24 | 2 | 2 | 2.5 | 142.3 | 0 | 0 | 18 | 18 | 0 |

Counts in the retrospective columns are per-occurrence observations, not trigger outcomes.

## Coverage by case

- Titan → RSV (real): S0 1/1 cases, 2 repeats, 2 generations; S1 1/1 cases, 2 repeats, 2 generations; S2 1/1 cases, 1 repeats, 1 generations; S3 1/1 cases, 3 repeats, 7 generations; S4 1/1 cases, 1 repeats, 1 generations
- Titan → Mystic 8 (real): S0 0/1 cases, 0 repeats, 0 generations; S1 0/1 cases, 0 repeats, 0 generations; S2 0/1 cases, 0 repeats, 0 generations; S3 0/1 cases, 0 repeats, 0 generations; S4 0/1 cases, 0 repeats, 0 generations
- Titan → S12 Ultra (real): S0 1/1 cases, 1 repeats, 1 generations; S1 1/1 cases, 1 repeats, 1 generations; S2 1/1 cases, 3 repeats, 3 generations; S3 1/1 cases, 3 repeats, 6 generations; S4 1/1 cases, 1 repeats, 1 generations
- Titan → Storm (real): S0 1/1 cases, 3 repeats, 3 generations; S1 1/1 cases, 3 repeats, 3 generations; S2 1/1 cases, 3 repeats, 3 generations; S3 1/1 cases, 3 repeats, 9 generations; S4 1/1 cases, 3 repeats, 3 generations
- Titan → U12t (real): S0 1/1 cases, 1 repeats, 1 generations; S1 1/1 cases, 1 repeats, 1 generations; S2 1/1 cases, 1 repeats, 1 generations; S3 1/1 cases, 1 repeats, 1 generations; S4 1/1 cases, 1 repeats, 1 generations
- Titan → Trio (real): S0 1/1 cases, 1 repeats, 1 generations; S1 1/1 cases, 1 repeats, 1 generations; S2 1/1 cases, 1 repeats, 1 generations; S3 1/1 cases, 3 repeats, 16 generations; S4 1/1 cases, 1 repeats, 1 generations
- Synthetic D (synthetic, known K=12, ceilings 11/12/13): S0 0/1 cases, 0 repeats, 0 generations; S1 0/1 cases, 0 repeats, 0 generations; S2 0/1 cases, 0 repeats, 0 generations; S3 0/1 cases, 0 repeats, 0 generations; S4 0/1 cases, 0 repeats, 0 generations
- Synthetic E (synthetic, known K=3, ceilings 2/3/4): S0 1/1 cases, 3 repeats, 6 generations; S1 1/1 cases, 3 repeats, 6 generations; S2 1/1 cases, 3 repeats, 6 generations; S3 1/1 cases, 3 repeats, 6 generations; S4 1/1 cases, 3 repeats, 6 generations
- Synthetic F (synthetic, known K=3, ceilings 2/3/4): S0 1/1 cases, 3 repeats, 15 generations; S1 1/1 cases, 3 repeats, 15 generations; S2 1/1 cases, 3 repeats, 12 generations; S3 1/1 cases, 3 repeats, 12 generations; S4 1/1 cases, 3 repeats, 12 generations
- Synthetic H (synthetic, known K=6, ceilings 5/6/7): S0 1/1 cases, 3 repeats, 6 generations; S1 1/1 cases, 3 repeats, 6 generations; S2 1/1 cases, 3 repeats, 6 generations; S3 1/1 cases, 3 repeats, 6 generations; S4 1/1 cases, 3 repeats, 6 generations

## Required conclusions

1. **Why S0 failed to trigger in real M2:** M3 observed 8 S0 occurrence(s), but every one was emitted at or after the 30-second boundary. M2 requires its exact-stall intervention to be reached while the deadline is still live, so these completed-boundary observations were ineligible for the M2 trigger.
2. **Structural stagnation while numeric quality improves:** Yes; S1–S4 co-occurred with numeric reference improvement 34 time(s).
3. **Signal with meaningful six-case coverage:** S1, S2, S3, and S4 tied for greatest real-case coverage (5/6); coverage remains diagnostic, not a policy choice.
4. **Transient or persistent:** Per-signal consecutive-run medians were 1, 1, 1, 1 generations (overall maximum 3); events were predominantly transient and no persistence trigger is selected.
5. **Baseline escape after a structural plateau:** 30/63 real structural-plateau occurrences were followed by a reference-signature change; quality and delivered-filter outcomes are reported above.
6. **Worth testing a bounded multi-step intervention:** Evidence is inconclusive: Structural signals did not occur in all 6 real cases; broader or repeated real trajectories are needed before selecting an intervention.

## Decision: **INCONCLUSIVE**

Predeclared boundary rule: `mixed-real-coverage`. S0 is the M2 exact-stall control; structural-plateau support considers S1–S4 only.

Synthetic coverage is 36 trajectories across 4 cases; synthetic signals validate telemetry reachability only and do not establish a real-search intervention policy.
