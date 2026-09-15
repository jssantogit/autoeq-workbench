# C1c confidence-targeting holdout — protocol freeze

This directory freezes the C1c holdout confirmation protocol before any
holdout response is reacquired or evaluated.  It contains protocol metadata
and an eventual outcome schema only.  It contains no raw measurement bytes,
response-derived values, consensus, profile, weight, loss, gain, or group
classification outcome.

The post-freeze runner may execute only when the exact protocol-freeze commit,
the protocol hash, and the immutable development model hash below are supplied
to the execution gate.  The runner must fail closed on a missing, malformed,
or mismatched pin.

## Frozen provenance and boundaries

- Repaired C1 V1.1 corpus commit:
  `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`
- Repaired C1 V1.1 evidence SHA-256:
  `a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43`
- C1 V1.1 classification: `C1_CORPUS_V1_1_READY`
- C1b protocol-freeze commit:
  `6e8dba547bc9f12a072e0660ce35c89a3d502455`
- C1b development-evidence commit:
  `458f95642b6a0880311d48afdfc54409c1e8b34a`
- C1b evidence SHA-256:
  `a962156d1203a243740c909e464399e0fd84d4fc92ffeaa23fa514d8129b4004`
- Immutable final C1b development model SHA-256:
  `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`
- Model path: `.research-artifacts/c1-confidence-targeting-dev/confidence-model.json`
- Model hash definition: the serialized model's `modelSha256` field, computed
  as SHA-256 of stable key-sorted JSON with `modelSha256` omitted.
- Inherited frozen boundary:
  `be4280512d36ad406fbebb63e49d5df51ce57a46`
- Upstream repository: `jaakkopasanen/AutoEq`
- Upstream commit: `7ae0f56d53074872b028649617a22bbb4232feb7`
- Upstream tree: `671f0a72499ace671e4b0a293bc1948bb8330c96`

The upstream repository, strict metadata resolver, exact literal `711`,
non-711 rig classes, eligibility, ranking tuple, selection seeds, and
cross-study exclusions are inherited unchanged from C1 V1.1.  C1c does not
reselect or replace groups.

## Admissible holdout and rejection gate

Exactly these six untouched C1 V1.1 holdout groups are admissible:

| Group ID | Device family | Members | Exact `711` | Non-`711` | Non-`711` rig classes |
| --- | --- | ---: | ---: | ---: | --- |
| `c1g-ebdb284a8c7563a12c5f` | `moondrop aria` | 6 | 5 | 1 | `gras-43ac` |
| `c1g-3f4de360d87a28aea240` | `truthear hexa` | 9 | 7 | 2 | `gras-43ac`, `gras-ra0045` |
| `c1g-f2a43144c5936389d89d` | `7hz salnotes zero` | 9 | 7 | 2 | `gras-43ac`, `gras-ra0045` |
| `c1g-8bd11cb5d7772ff2165b` | `moondrop quarks` | 6 | 5 | 1 | `gras-43ac` |
| `c1g-6c369c990dd73512951b` | `epz q5` | 7 | 6 | 1 | `kb501x-711` |
| `c1g-dc1ade324d0c4b3192d6` | `7hz timeless` | 7 | 6 | 1 | `gras-43ac` |

The six C1b development IDs are rejected from holdout decision-making:

- `c1g-c4cd2c0381c89a1e9911`
- `c1g-106abf02ed8b580831bd`
- `c1g-5fe954a9babbe4c5cda0`
- `c1g-0a8d256822943d659136`
- `c1g-20fa430247872858b84b`
- `c1g-3579b4e7c8f794efd07a`

The runner rejects development group IDs, development response data, and a
development classification/decision argument.  A prior C1b result is an
external orchestration prerequisite for the *combined interpretation* only;
it is not an input to holdout profile selection, reference construction,
observation metrics, group gates, or the four-of-six holdout gate.

Fresh Real Corpus V1.2 Batch C is sealed and rejected using the exact token
`fresh-real-corpus-v1.2:Batch C`.  No Batch C identifier, device, response, or
derived value may enter this protocol or its execution.  Unknown groups,
alternate corpus versions, cross-rig substitutions, and alternate model files
are rejected.

## Immutable model and curve preparation

The only permitted weights are those serialized in the pinned C1b final
development model (`65cc495b…`).  The model was trained from all six C1b
development groups before this freeze.  For each holdout rig class, use its
serialized class-specific profile when present; otherwise use the serialized
global profile fallback.  Never derive, smooth, refit, normalize, or retrain a
profile using holdout data.  No holdout response may alter the model hash.

For every selected holdout measurement, the runner must:

1. reacquire immutable bytes from the pinned upstream commit;
2. verify both the Git blob SHA-1 and SHA-256 against C1 V1.1 provenance;
3. parse with the frozen C1 V1.1 semantics;
4. apply terminal endpoint closure exactly as `terminal-flat-hold-to-v2-max`;
5. sample the normal V2 grid from 20 through 20,000 Hz; and
6. normalize by subtracting the interpolated 500 Hz value using the frozen
   60 dB anchor.

No smoothing, peak alignment, C4 preprocessing, response-derived filtering,
extrapolation, alternate grid, or response-dependent selection is allowed.
Raw bytes may be cached only below the ignored
`.research-cache/c1-confidence-targeting-holdout/` directory and must never be
committed.

## Holdout reference and targeting evaluation

The frozen model is selected before reading a holdout response.  After that
selection, a withheld group may use its own exact-`711` normalized members to
calculate its same-IEM reference:

`C_g(f) = pointwise median of exact-711 normalized curves`

For each eligible non-`711` member `r` of rig class `k`, calculate only the
same-IEM disagreement observation:

`D_g,r(f) = R_g,r(f) - C_g(f)` and `A_g,r(f) = abs(D_g,r(f))`.

This is a measurement-system disagreement reference, not an AutoEQ target.
The holdout response may enter only its own consensus, disagreement, and final
diagnostic metrics.  It must not enter any model profile, class membership,
weight, selection, or threshold decision.

Use exactly the frozen C1b confidence candidate and no alternative model:

- `w_base(f) = 1`;
- `w_repeatability(f) = c(R_dev(f))`;
- `w_rig,k(f) = c(G_k,dev(f))`, using the frozen class profile or frozen global
  fallback;
- `w_conf,k(f) = w_repeatability(f) * w_rig,k(f)`; and
- `c(u) = 0.75 / (0.75 + u)`.

The model's finite, nonnegative uncertainty and `0 < w <= 1` invariants are
validated; there is no clipping, smoothing, exponent, lambda, frequency
threshold, or psychoacoustic/base-frequency weighting.

The primary evaluation band is inclusive `[4000, 14000]` Hz and contains only
normal V2 grid points satisfying `4000 <= f <= 14000`; no synthetic boundary
interpolation is introduced.  For each observation:

1. `w_bar = mean_primary(w_conf(f))`;
2. `E_conf = mean_primary(abs(w_conf(f) * D(f)))`;
3. `E_const = mean_primary(abs(w_bar * D(f)))`;
4. if `E_const == 0`, mark the observation non-informative and omit it from
   win/loss and median-gain counts; otherwise
5. `gain = (E_const - E_conf) / E_const`; and
6. classify exactly `CONFIDENCE_TARGETING_WIN` when `gain >= 0.05`.

The equal-authority control is constant over the primary band:
`w_const(f) = w_bar`.  The control and candidate therefore have exactly the
same mean weighting authority.  The five-percent threshold is fixed and may
not be tuned after observing holdout values.

Retain the same non-gating diagnostics as C1b: raw cross-rig MAE/RMSE,
`E_conf`, `E_const`, gain, mean/min/max confidence, repeatability-only,
rig-only, and full-product candidates, Spearman correlation between
`1 - w_conf` and `abs(D)`, confidence quartile medians, and the nine inclusive
bands `20–500`, `500–1k`, `1–2k`, `2–4k`, `4–6k`, `6–8k`, `8–10k`, `10–14k`,
and `14–20k` Hz.  These diagnostics never create additional gates.

## Frozen gates and interpretation

For each holdout group, evaluate every eligible non-`711` observation.  The
group is `CONFIDENCE_TARGETING_SIGNAL` exactly when a strict majority of its
informative observations are wins and their median gain is at least `0.05`.
With zero informative observations, classify `INCONCLUSIVE`; with valid
evidence and no signal, classify `NO_CONFIDENCE_TARGETING_SIGNAL`.

The holdout gate is:

- `CONFIDENCE_TARGETING_GENERALIZES` iff at least 4 of 6 groups are signals;
- `CONFIDENCE_TARGETING_NOT_CONFIRMED` with valid evidence and fewer than 4 of
  6 signals; and
- `INCONCLUSIVE` only for a genuine correctness, provenance, instrumentation,
  or data-integrity failure.

Three of six is not partial success.  The combined interpretation is
`C1_CONFIDENCE_MODEL_GENERALIZED` only when the independently audited C1b
development gate is `CONFIDENCE_TARGETING_DEV_SUPPORTED` *and* this holdout
gate is `CONFIDENCE_TARGETING_GENERALIZES`.  A valid holdout failure closes C1
as `C1_CLOSED_HOLDOUT_NOT_CONFIRMED`.  A semantic holdout defect is
`INCONCLUSIVE` and is not rerun.

## Defects, corrections, and execution boundary

Before holdout outcomes, a protocol-conformance bug may be fixed only without
changing the frozen scientific choices; the corrected protocol must be
re-hashed and re-frozen before execution.  After any holdout outcome exists, a
semantic defect (algorithm, input, provenance, preparation, metric, gate, or
classification meaning) is `INCONCLUSIVE`; do not change the protocol or
rerun.  A packaging/hash/report correction is allowed only when it proves that
all computed outcomes, algorithm, inputs, hashes, and classifications are
unchanged, and it must be recorded as an explicit correction.

The manifest and schema flags remain false until a separately authorized
holdout execution writes outcome evidence.  In this freeze no raw bytes are
acquired, no consensus or sigma is calculated, no confidence curve is
evaluated, no holdout metric is generated, and no classification is emitted.
The protocol cannot execute an AutoEQ solver or alter production behavior.  It
does not reopen C1a, C1b, C2, C3, or C4, use C4 peak alignment, consume Batch C,
modify Standard-v1/goldens, update benchmarks, or change product/frontend
code.

`schema.json` describes the future holdout evidence shape while explicitly
setting `outcomeValuesAllowed` and `responseDerivedValuesAllowed` to false.
`protocol-sha256.txt` is the SHA-256 of the deterministic pretty-printed
`manifest.json` concatenated with `schema.json`, matching the existing
research-artifact convention.
