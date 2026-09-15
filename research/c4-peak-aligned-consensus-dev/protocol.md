# C4b peak-aligned consensus — protocol freeze (Phase 1)

This directory freezes the C4b development protocol only. It contains no
response outcomes and does not execute a development group. A later run may
execute only after this protocol is committed and the exact commit is supplied
to the post-freeze execution gate.

## Immutable inputs

- C4b boundary: `64f1fa7f8780cf14f87ce6427aaa71edbf686e2d`
- C4a evidence SHA-256: `03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea`
- C4a classification: `C4_CORPUS_READY`
- Repository: `jaakkopasanen/AutoEq`
- Commit: `7ae0f56d53074872b028649617a22bbb4232feb7`
- Tree: `671f0a72499ace671e4b0a293bc1948bb8330c96`
- Raw bytes are reacquired by immutable raw URL and cached only below
  `.research-cache/c4-peak-aligned-consensus-dev/`; they are never committed.

Only these development groups are admissible:

- `c4g-95ca9d64e706e94c51e7`
- `c4g-9c1d23845eb5a1d7beef`
- `c4g-35f72baf0cca66570d01`

The three C4a holdout IDs are rejected by the runner. Fresh Real Corpus Batch
C is sealed and rejected; it is not a C4b input.

## Curve preparation

Every C4a provenance member is reacquired from its immutable raw URL. Git blob
SHA-1 and upstream SHA-256 are checked before parsing. The C4a terminal closure
is reused unchanged: if the terminal point is below 20,000 Hz but at or above
the penultimate V2 grid point, append exactly `[20000, lastObservedDb]`; no
other extrapolation is permitted. Curves are sampled on the normal V2 grid
from 20–20,000 Hz and normalized at 500 Hz with the frozen 60 dB reference.
No smoothing or shape-dependent preprocessing is performed.

## Frozen algorithm

- Peak-search band: inclusive `[6000, 10000]` Hz.
- Alignment/evaluation band: inclusive `[6000, 14000]` Hz.
- `POINTWISE_MEDIAN` is the unweighted, unsmoothed pointwise median on the
  common V2 grid.
- `dominantPeakFrequency` chooses the maximum normalized dB in 6–10 kHz;
  exact ties choose the lower frequency.
- `p_canonical` is the median of `log2(p_i)`, with the arithmetic mean of the
  two central log values for even K, transformed back with `2**`.
- Each training member maps canonical/output to member/input with exactly
  `6000 -> 6000`, `p_canonical -> p_i`, and `14000 -> 14000`. Segments are
  linear in log2 frequency, and the map is identity outside 6–14 kHz.
- A non-monotone map or source-coverage failure rejects the fold; invalid
  mappings are neither clipped nor extrapolated.
- `PEAK_ALIGNED_MEDIAN` is the pointwise median after warping every training
  member into the canonical frame. It is identity outside the alignment band.

## Leave-one-out and evaluation

Each development group runs K folds. Exactly one member is withheld. The
withheld member is absent from peak estimation, consensus construction, and
training dispersion. Both candidates are evaluated under the same deterministic
candidate-to-withheld registration: detect each candidate and the withheld
peak with the same rule, then use anchors `6000 -> 6000`,
`withheldPeak -> candidatePeak`, `14000 -> 14000` and compare to the unwarped
withheld curve. Registration is evaluation-only; no shift scan or error
optimization is permitted.

The primary fold metric is `registeredTrebleMAE` over 6–14 kHz. A fold wins
only when aligned MAE is strictly less than pointwise MAE. Secondary metrics
are registered RMSE/maxAbs, raw MAE/RMSE, both peak frequencies, absolute raw
peak error in octaves, both peak dB values, and absolute registered peak-level
error. Raw/unregistered error is kept separate from registered error.

For each fold, peak diagnostics include every training peak, signed log2 shift
from `p_canonical`, absolute shifts in octaves, and cents (`1200 * abs(log2)`),
with minimum/median/maximum absolute shift. Robust dispersion is
`1.4826 * median_i(abs(x_i - median_j(x_j)))`, reported before and after
alignment in 6–8, 8–10, 10–14, and full 6–14 kHz bands. Dispersion is
mechanism evidence only and never tunes the warp.

A group is `PEAK_ALIGNMENT_SIGNAL` only if aligned wins a strict majority
(`wins > K/2`), has strictly lower median registered MAE, and has strictly
lower median full-band training robust sigma. Otherwise it is
`NO_PEAK_ALIGNMENT_SIGNAL`. The development gate is
`PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED` only for at least two of the three
signal groups. With valid evidence and fewer signals it is
`PEAK_ALIGNMENT_DEV_SIGNAL_NOT_SUPPORTED`; genuine data, instrumentation, or
correctness failure is `INCONCLUSIVE`.

## Execution and artifact gate

Phase 1 writes only the protocol manifest and outcome schema. It does not
reacquire members, execute development groups, calculate real outcomes, or
write `aggregate-evidence.json`, per-group/fold outcome files,
`evidence-sha256.txt`, or `final-report.md`. `schema.json` describes those
later records without values. The post-freeze runner requires the exact
protocol-freeze commit and rejects holdout and Batch C identifiers.

No confidence weighting, AutoEQ solver, Standard V2, Max10, structural search,
C2, C3, or Batch C path is reachable from this protocol.
