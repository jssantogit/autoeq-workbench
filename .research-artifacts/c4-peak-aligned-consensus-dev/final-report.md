# C4b peak-aligned consensus — development outcome

- Protocol freeze commit: `95d853db76bd456dd66a1b8a60a65039ca095b8b`
- C4b boundary: `64f1fa7f8780cf14f87ce6427aaa71edbf686e2d`
- Algorithm: `c4-peak-aligned-consensus-dev-v1`
- Corpus: the three frozen C4 development groups only (24 members, 24 LOO folds).
- Peak-search band: 6,000–10,000 Hz; alignment/evaluation band: 6,000–14,000 Hz.
- Normalization: frozen 500 Hz / 60 dB; no smoothing or weighting.

## Per-group evidence

### c4g-95ca9d64e706e94c51e7 — blon x hbb z300
- Members: 8; collections: Bakkwatan, Fahryst, Harpo, Hi End Portable, Kazi, RikudouGoku, Super Review, ToneDeafMonk; rig classes: 711-class
- LOO wins/losses: 3/5
- Median registeredTrebleMAE (pointwise/aligned): 0.7902225083718251 / 0.8388851967492585
- Median raw MAE (pointwise/aligned): 0.8795505309232905 / 0.8632693143969115
- Median robust sigma (before/after): 0.8961225598351644 / 0.7012463890332746
- Absolute dominant-peak shift octaves (min/median/max): 0 / 0.015625 / 0.11458333333333215
- Classification: **NO_PEAK_ALIGNMENT_SIGNAL**

### c4g-9c1d23845eb5a1d7beef — kiwi ears quintet
- Members: 8; collections: Harpo, Hi End Portable, Jaytiss, Kazi, Regan Cipher, RikudouGoku, Super Review, ToneDeafMonk; rig classes: 711-class
- LOO wins/losses: 5/3
- Median registeredTrebleMAE (pointwise/aligned): 2.381072620965292 / 2.2751182893962065
- Median raw MAE (pointwise/aligned): 2.54676552453596 / 2.7501046884382583
- Median robust sigma (before/after): 2.7104490598826527 / 2.3636022304113977
- Absolute dominant-peak shift octaves (min/median/max): 0 / 0.07291666666666607 / 0.14583333333333393
- Classification: **PEAK_ALIGNMENT_SIGNAL**

### c4g-35f72baf0cca66570d01 — moondrop chu
- Members: 8; collections: Filk, Harpo, Regan Cipher, Super Review, Ted's Squig Hoard, ToneDeafMonk, freeryder05, kr0mka; rig classes: 711-class
- LOO wins/losses: 5/3
- Median registeredTrebleMAE (pointwise/aligned): 2.0678620404219066 / 1.8579351542444995
- Median raw MAE (pointwise/aligned): 1.7540962913565428 / 1.7797593008043266
- Median robust sigma (before/after): 1.9110259031039787 / 1.6034097076079705
- Absolute dominant-peak shift octaves (min/median/max): 0 / 0.04166666666666785 / 0.44791666666666785
- Classification: **PEAK_ALIGNMENT_SIGNAL**

## Development gate

- Signal groups: 2/3; final classification: **PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED**.
- Registered error, raw/unregistered error, and dispersion are reported as separate quantities; registered improvement is not claimed as ordinary raw pointwise improvement.

## Execution guardrails

- C4a provenance was reacquired from immutable raw URLs and each raw object was verified by Git blob SHA-1 and upstream SHA-256.

- C4 holdout groups remained unexecuted and no holdout curves entered any fold.

- Fresh Real Corpus Batch C remained sealed and unexecuted.

- No AutoEQ solver, confidence weighting, Standard V2, Max10, structural search, C2, or C3 execution ran.

- Evidence files: aggregate-evidence.json, final-report.md, group-c4g-35f72baf0cca66570d01.json, group-c4g-95ca9d64e706e94c51e7.json, group-c4g-9c1d23845eb5a1d7beef.json, manifest.json, schema.json
