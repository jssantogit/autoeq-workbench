# Structural Search M3b — telemetry fidelity and unique-event closeout

- Frozen boundary: `f5052b2b1bfdf12b013db5c34c5fda65304091c3`
- Evidence SHA-256: `eb2acf8ac2ec1d0102c7cb91c05a78c7f86f56885b5e0dbff560fddf44ac1943`
- Protocol: six real cases, C43, effort 6, 30-second OFF/ON paired trajectories, 3 repeats.
- Search policy: frozen ordinary baseline only; M3/M3b observers cannot affect decisions.
- Synthetic D/E/F/H matrix was not rerun. M1, M2, M3, scheduler/resource policy, and Standard-v1 remain frozen.

## Frozen M3 source and denominator clarification

- M3 aggregate source: `.research-artifacts/structural-search-m3-stagnation-census/aggregate.json` (SHA-256 767e3341dcf69ec6629d65e7a31a5aeee34efd7c3898739ef3d4fec6761b26c4; evidence 9927d848d72069de1255a40a12c672079d43741c1568193c97a342233d4fe703).
- M3 generation source: `.research-artifacts/structural-search-m3-stagnation-census/raw-timing.jsonl` (SHA-256 8d143ac7194ff5ff6b0a37095cf13330f878c28e73e9617d381e45bdbc0b675b; 18 frozen real trajectories parsed).
- Generation-level source for this closeout: the frozen M3 raw real trajectories.
- Existing M3 per-signal values are not rewritten. Per-signal S1–S4 totals are overlapping observations, not independent-event denominators.
- The unique-event table counts each generation with any S1–S4 signal exactly once by exact signal mask; non-plateau generations remain in the completed-generation denominator.

## Deterministic telemetry-fidelity proof

- Imposed boundary: 4 completed generation opportunities (no wall-clock expiration).
- Equivalent: **yes**.
- OFF/ON completed generations: 4/4.
- OFF/ON final results identical: yes.
- OFF/ON retained semantic states/signatures identical: yes.

## Wall-clock paired measurement

| Metric | OFF median | ON median | ON−OFF median | ON−OFF spread |
| --- | ---: | ---: | ---: | ---: |
| completed ordinary beam generations | 23.5 | 24.5 | 0 | 6 |
| generated proposals | 2064 | 1969 | 34.5 | 559 |
| admitted proposals | 2037.5 | 1880 | 30.5 | 540 |
| polished proposals | 2032 | 1860.5 | 21.5 | 538 |
| final RMSE | 0.8377071023207703 | 0.8383896039368337 | 0 | 0.18490122706038664 |
| final maxAbs | 2.5199256184364875 | 2.521625002380528 | 0 | 0.566408490167913 |
| delivered filters | 14.5 | 14.5 | 0 | 2 |
| actual elapsed ms | 30003.329632499983 | 30004.575690000027 | 2.1626539999851957 | 222.30453899998975 |
- Execution order: 9 OFF-first pairs and 9 ON-first pairs. No artificial floating pass threshold is applied; quality deltas are descriptive.
- Wall-clock question: yes, the paired campaign observed ordinary-work path differences inside the same 30-second envelope; the magnitude and direction vary by pair.

## Unique real-generation structural events

- Completed generations: 486; unique S1–S4 event generations: 40.
- Exact masks: S3=30, S1+S2+S3+S4=7, S1=1, S2+S3=2.
| Signal | Occurrences | Cases | Repeats | First generation median | First elapsed median ms | Run median/max | Later topology change | Later novelty | Later RMSE | Later maxAbs | Later delivered filters | Numeric-improving |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S0 | 8 | 5 | 8 | 30.5 | 30003.0 | 1/1 | 0 | 0 | 0 | 0 | 0 | 0 |
| S1 | 8 | 5 | 8 | 30.5 | 30003.0 | 1/1 | 0 | 0 | 0 | 0 | 0 | 0 |
| S2 | 9 | 5 | 9 | 23 | 30003.7 | 1/1 | 0 | 0 | 0 | 0 | 0 | 2 |
| S3 | 39 | 5 | 13 | 15 | 8913.9 | 1/3 | 30 | 30 | 19 | 30 | 29 | 32 |
| S4 | 7 | 5 | 7 | 30 | 30003.2 | 1/1 | 0 | 0 | 0 | 0 | 0 | 0 |
- S0 remains the M2 exact-stall control; its wall-clock observations cluster at the completed 30-second boundary and are not converted into a new trigger result.

### S3-specific diagnostic

- S3-containing unique generations: 39; S3-only: 30; S3 combined with S1/S2/S4: 9.
- S3 persistence runs: 30; median 1; max 3.
- titan-to-rsv: first S3 generation median 15, elapsed median 8978.7 ms.
- titan-to-s12-ultra: first S3 generation median 16, elapsed median 15131.0 ms.
- titan-to-storm: first S3 generation median 0, elapsed median 8.8 ms.
- titan-to-u12t: first S3 generation median 23, elapsed median 30002.6 ms.
- titan-to-trio: first S3 generation median 8, elapsed median 1380.0 ms.
- Future progress fractions (denominator = 39 S3-containing generations): reference topology 30/39; surviving novelty 30/39; RMSE 19/39; maxAbs 30/39; delivered filters 29/39.
- S3 question: the observed S3-only and combined populations do not form a separable predeclared stagnation subset; retrospective progress is mixed, so the classification remains INCONCLUSIVE.

## Required interpretation boundary

1. **M3 telemetry fidelity:** `M3_TELEMETRY_WALLCLOCK_PERTURBATION_MATERIAL`. Deterministic logical equivalence is required; wall-clock work-path differences are reported descriptively and do not authorize a policy change.
2. **S3 classification:** `INCONCLUSIVE`. S3-only versus combined masks and all retrospective outcomes are shown above; no epsilon, fitted subset, or trigger is introduced.
3. **Policy boundary:** M3b implements no search behavior, candidate, admission, beam, comparator, polish, scheduler, resource, quantization, or challenger change.

Raw timing/generation traces are local research data and are intentionally not part of the committed aggregate evidence.
