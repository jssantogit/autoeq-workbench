# C4c peak-aligned consensus — holdout protocol freeze (Phase 1)

This directory freezes the C4c holdout confirmation protocol.  Phase 1
contains no holdout response outcomes: it does not reacquire raw curves,
construct a consensus, run a leave-one-measurement-out fold, or generate
outcome evidence.  The later runner may execute only after this exact
protocol has been committed and its commit is supplied to the execution gate.

## Immutable boundaries and inputs

- C4a corpus commit: `64f1fa7f8780cf14f87ce6427aaa71edbf686e2d`
- C4a evidence SHA-256:
  `03794a913b873e01df8b5afdd3664e6dc7e40deff9341a449c768ae1f39b73ea`
- C4a classification: `C4_CORPUS_READY`
- C4b protocol-freeze commit: `95d853db76bd456dd66a1b8a60a65039ca095b8b`
- C4b development-evidence commit:
  `01ec92e8c3276b6cb42360e114d71f2ce5bc0d8e`
- C4b evidence SHA-256:
  `c2232862df04d0e90fa86fe7805f2032d2722e381c7d6e08118fcb7c29028d04`
- C4b algorithm source SHA-256:
  `61002d0552c3c8bdc8045355378a1dd40dbfe56845a790d0ccd6f3caef67a2ec`
- C4b algorithm version: `c4-peak-aligned-consensus-dev-v1`
- C4c frozen boundary: the C4b evidence commit above

The implementation imports the C4b module; it does not copy, fork, or modify
its algorithm helpers.  Before any future acquisition, the runner must verify
the C4b source hash, algorithm version, commit objects, C4b evidence SHA, and
the C4a evidence reference.  C4a member provenance must then be reacquired
from immutable raw URLs and checked for Git blob SHA-1, upstream SHA-256,
parsed-point hashes, canonical terminal closure, and 500 Hz normalization.
Raw bytes may be cached only below the ignored
`.research-cache/c4-peak-aligned-consensus-holdout/` directory; no upstream
measurement bytes may be committed.

Upstream is fixed to repository `jaakkopasanen/AutoEq`, commit
`7ae0f56d53074872b028649617a22bbb4232feb7`, tree
`671f0a72499ace671e4b0a293bc1948bb8330c96`.  Moving branch URLs and a full
clone are not permitted.

## Admissible holdout and rejection gate

Exactly these untouched C4a holdout groups are admitted:

| Group ID | Device family | Independent 711-class measurements | LOO folds |
| --- | --- | ---: | ---: |
| `c4g-c5a0b86e1ea4436ca9ce` | Simgot Audio EM6L | 9 | 9 |
| `c4g-043aeb45a50adf964f89` | Simgot Audio EW200 | 8 | 8 |
| `c4g-9f35923d2fa109244435` | Truthear x Crinacle Zero RED | 10 | 10 |

The expected total is exactly 27 leave-one-measurement-out folds.  The three
C4b development IDs are explicitly rejected from holdout decision-making:

- `c4g-95ca9d64e706e94c51e7`
- `c4g-9c1d23845eb5a1d7beef`
- `c4g-35f72baf0cca66570d01`

Fresh Real Corpus V1.2 Batch C is sealed and rejected.  No unknown group,
development group, Batch C identifier, cross-rig substitution, or alternate
corpus may enter the gate.  Development is not rerun for this decision.

## Frozen curve preparation and algorithm

The domain is `form = in-ear`, V2 20–20,000 Hz, normalized exactly at 500 Hz
to the frozen 60 dB reference.  The C4a terminal endpoint closure is reused
unchanged: when the processed grid ends after the penultimate V2 point but
below 20 kHz, append exactly `[20000, lastObservedDb]`; no other extrapolation
or clipping is allowed.  No smoothing, weighting, confidence curve, or
shape-dependent preprocessing is allowed.

The following is the C4b algorithm, reused byte-for-byte:

- Baseline: `POINTWISE_MEDIAN`.
- Candidate: `PEAK_ALIGNED_MEDIAN`.
- Dominant-peak search: maximum normalized dB in inclusive 6–10 kHz;
  exact ties choose the lower frequency.
- Training canonical peak: median in log2 frequency; for even K, average the
  two central log2 values arithmetically before exponentiating.
- Training warp anchors: exactly `6000 -> 6000`,
  `p_canonical -> p_i`, and `14000 -> 14000`.
- Warp interpolation is linear in log2 frequency and identity outside 6–14
  kHz.  A non-monotone map or source-coverage failure rejects the fold rather
  than clipping or extrapolating.
- Evaluation registers each candidate independently to the withheld member's
  peak frame using the identical C4b registration, with no scan,
  optimization, or additional nuisance alignment.

## Leave-one-out and gates

For a K-member group, execute exactly K folds.  The withheld member must not
contribute to canonical-peak estimation, consensus construction, aligned
curves, or training dispersion.  The primary fold metric is
`registeredTrebleMAE` over inclusive 6–14 kHz; an aligned fold wins strictly
when `aligned < pointwise` with no epsilon.  Raw MAE/RMSE remains secondary
and is never described as ordinary pointwise FR improvement.

Each fold retains C4b diagnostics: registered MAE/RMSE/maxAbs, raw MAE/RMSE,
candidate and withheld dominant peaks, raw peak-frequency error, peak-level
error after registration, training peak frequencies, warp anchors, signed and
absolute peak shifts in octaves/cents, and robust-sigma profiles before and
after alignment in 6–8, 8–10, 10–14, and full 6–14 kHz bands.

A group is `PEAK_ALIGNMENT_SIGNAL` iff all of the following hold:

1. aligned wins a strict majority of its K folds (`wins > K/2`);
2. median registeredTrebleMAE aligned is strictly lower than pointwise; and
3. median full-band 6–14 kHz robust sigma after alignment is strictly lower
   than before alignment.

Otherwise valid evidence is `NO_PEAK_ALIGNMENT_SIGNAL`.  A genuine
correctness, provenance, or instrumentation failure is `INCONCLUSIVE` and
must not be repaired after holdout execution by changing the frozen protocol
or rerunning the group.

The final holdout gate is frozen before execution:

- `PEAK_ALIGNMENT_GENERALIZES` iff at least 2 of 3 holdout groups are
  `PEAK_ALIGNMENT_SIGNAL`;
- with valid evidence and fewer than 2 of 3, return
  `PEAK_ALIGNMENT_NOT_CONFIRMED` (1/3 is not partial success);
- use `INCONCLUSIVE` only for a genuine correctness/provenance/instrumentation
  failure.

The combined interpretation is `C4_PEAK_ALIGNMENT_GENERALIZED` only when the
audited C4b development gate is `PEAK_ALIGNMENT_DEV_SIGNAL_SUPPORTED` and
this holdout gate is `PEAK_ALIGNMENT_GENERALIZES`.  Otherwise valid failure
is `C4_CLOSED_HOLDOUT_NOT_CONFIRMED`; an invalid run remains `INCONCLUSIVE`.
If and only if the combined interpretation generalizes, a later artifact may
carry a conceptual C1 handoff distinguishing raw pointwise dispersion,
peak-aligned dispersion, and raw peak-position dispersion.  It must not define
a confidence-weight function, select lambda-U, or execute C1.

## Phase-1 execution boundary and artifacts

The protocol-freeze manifest records the exact holdout IDs, member/fold
counts, C4a/C4b provenance, algorithm source hash, and all execution flags.
`schema.json` describes future outcome records but has
`outcomeValuesAllowed: false`.  `protocol-sha256.txt` hashes the protocol
manifest and schema with the deterministic framed evidence convention.
`protocolFreezeCommit` remains null until the orchestrator commits this
protocol; the post-freeze runner must require the exact resulting commit and
must reject any development or Batch C input.

During this Phase 1 no raw bytes are acquired, no fold or consensus outcome is
calculated, no holdout artifact is emitted, and no solver or production
behavior is run.  Standard V2, Max10, structural search, C2, C3, C1
confidence weighting, C5, and Fresh Real Corpus Batch C remain out of scope.
