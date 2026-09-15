# C4c peak-aligned consensus — holdout confirmation outcome

- C4c protocol-freeze commit: `f1f6900c91da4434d2a09085277b8622d7b039a6`
- Frozen protocol SHA-256: `c29e5fe6e7396593297f82567c76e21b31b8791c5106f4fd94b9730bebd81296`
- C4c boundary: `01ec92e8c3276b6cb42360e114d71f2ce5bc0d8e`
- Algorithm: `c4-peak-aligned-consensus-dev-v1` (imported from the frozen C4b implementation)
- Holdout corpus: exactly three groups, 27 members, 27 leave-one-measurement-out folds.
- Peak search: 6,000–10,000 Hz; alignment/evaluation: 6,000–14,000 Hz.
- Normalization: frozen 500 Hz / 60 dB; no smoothing, weighting, or additional nuisance alignment.

## Per-group evidence

### c4g-c5a0b86e1ea4436ca9ce — simgot audio em6l
- Members/folds: 9/9; independent collections: 9; collections: Fahryst, Harpo, Hi End Portable, Jaytiss, Kazi, Regan Cipher, RikudouGoku, Super Review, ToneDeafMonk; rig classes: 711-class
- LOO wins/losses: 3/6
- Median registeredTrebleMAE (pointwise/aligned): 1.8162097429975963 / 1.7315244810712493
- Median raw MAE (pointwise/aligned): 1.8971927759980705 / 1.7818541510141026
- Median robust sigma (before/after): 1.9229477971905542 / 1.421026948566684
- Absolute dominant-peak shift octaves (min/median/max): 0.0052083333333339255 / 0.11979166666666607 / 0.5052083333333339
- Median absolute peak shift: 143.7499999999993 cents
- Classification: **NO_PEAK_ALIGNMENT_SIGNAL**

### c4g-043aeb45a50adf964f89 — simgot audio ew200
- Members/folds: 8/8; independent collections: 8; collections: Fahryst, Harpo, Hi End Portable, Jaytiss, Kazi, Regan Cipher, RikudouGoku, ToneDeafMonk; rig classes: 711-class
- LOO wins/losses: 4/4
- Median registeredTrebleMAE (pointwise/aligned): 2.388822180868414 / 2.4701808972100805
- Median raw MAE (pointwise/aligned): 2.492264047784505 / 2.5010155807720817
- Median robust sigma (before/after): 2.480677452705801 / 2.1064741552373327
- Absolute dominant-peak shift octaves (min/median/max): 0 / 0.046875 / 0.23958333333333393
- Median absolute peak shift: 56.25 cents
- Classification: **NO_PEAK_ALIGNMENT_SIGNAL**

### c4g-9f35923d2fa109244435 — truthear x crinacle zero red
- Members/folds: 10/10; independent collections: 10; collections: Bakkwatan, DHRME, Fahryst, Filk, Harpo, Jaytiss, Kazi, Super Review, ToneDeafMonk, freeryder05; rig classes: 711-class
- LOO wins/losses: 9/1
- Median registeredTrebleMAE (pointwise/aligned): 1.726217137873372 / 1.6383326910704386
- Median raw MAE (pointwise/aligned): 1.9060510948584772 / 1.8135199114603782
- Median robust sigma (before/after): 1.4807302338236221 / 1.38708370050752
- Absolute dominant-peak shift octaves (min/median/max): 0 / 0.02083333333333215 / 0.15625
- Median absolute peak shift: 24.99999999999858 cents
- Classification: **PEAK_ALIGNMENT_SIGNAL**

## Holdout gate

- Signal groups: 1/3; final classification: **PEAK_ALIGNMENT_NOT_CONFIRMED**.
- A signal requires strict-majority registeredTrebleMAE wins, lower median registeredTrebleMAE, and lower median full-band robust sigma.  Raw/unregistered error remains secondary.

## Combined development + holdout diagnostics

- Signal groups: 3/6; aligned registered-MAE wins: 29/51.
- Per-group peak-shift/registered-benefit/sigma observations are descriptive only; no threshold or shift-trigger rule was fit.

- c4g-95ca9d64e706e94c51e7: median shift 0.015625 octaves; registered MAE delta (P−A) -0.04866268837743348; relative sigma reduction 0.21746598014197513
- c4g-9c1d23845eb5a1d7beef: median shift 0.07291666666666607 octaves; registered MAE delta (P−A) 0.10595433156908562; relative sigma reduction 0.12796655528596118
- c4g-35f72baf0cca66570d01: median shift 0.04166666666666785 octaves; registered MAE delta (P−A) 0.20992688617740707; relative sigma reduction 0.16096913966281848
- c4g-c5a0b86e1ea4436ca9ce: median shift 0.11979166666666607 octaves; registered MAE delta (P−A) 0.08468526192634696; relative sigma reduction 0.26101636734870365
- c4g-043aeb45a50adf964f89: median shift 0.046875 octaves; registered MAE delta (P−A) -0.08135871634166669; relative sigma reduction 0.15084722000448128
- c4g-9f35923d2fa109244435: median shift 0.02083333333333215 octaves; registered MAE delta (P−A) 0.08788444680293339; relative sigma reduction 0.06324348026195352

## Combined C4 interpretation

- **C4_CLOSED_HOLDOUT_NOT_CONFIRMED**
- No C1 handoff is authorized because the frozen holdout gate did not generalize.

## Execution guardrails

- C4a provenance was reacquired from immutable raw URLs and every raw object was verified by Git blob SHA-1, upstream SHA-256, parsed-point hashes, terminal closure, and normalization.

- C4b source/helpers, thresholds, gates, and development evidence were not modified; development was not rerun for this decision.

- Fresh Real Corpus Batch C remained sealed and unexecuted.

- No C1 confidence weighting, C5, AutoEQ solver, Standard V2, Max10, structural search, C2, or C3 execution ran.

- Evidence files: aggregate-evidence.json, final-report.md, group-c4g-043aeb45a50adf964f89.json, group-c4g-9f35923d2fa109244435.json, group-c4g-c5a0b86e1ea4436ca9ce.json, manifest.json, schema.json
