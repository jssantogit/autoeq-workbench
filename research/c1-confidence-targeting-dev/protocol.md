# C1b confidence-targeting development — protocol freeze

This directory freezes the C1b development protocol only. It contains no
response outcomes and performs no upstream response acquisition. A later
execution may run only after this protocol is committed and the exact freeze
commit is supplied to the execution gate.

## Immutable corpus and split

- Repaired C1a V1.1 commit: `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`
- Repaired C1a V1.1 evidence SHA-256: `a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43`
- Corpus classification: `C1_CORPUS_V1_1_READY`
- Development groups (the only groups admissible to C1b):
  - `c1g-c4cd2c0381c89a1e9911`
  - `c1g-106abf02ed8b580831bd`
  - `c1g-5fe954a9babbe4c5cda0`
  - `c1g-0a8d256822943d659136`
  - `c1g-20fa430247872858b84b`
  - `c1g-3579b4e7c8f794efd07a`
- Rejected holdout groups:
  - `c1g-ebdb284a8c7563a12c5f`
  - `c1g-3f4de360d87a28aea240`
  - `c1g-f2a43144c5936389d89d`
  - `c1g-8bd11cb5d7772ff2165b`
  - `c1g-6c369c990dd73512951b`
  - `c1g-dc1ade324d0c4b3192d6`
- Fresh Real Corpus Batch C (`fresh-real-corpus-v1.2:Batch C`) is sealed and
  rejected. No Batch C device or response is an input.
- The upstream repository, commit/tree, strict metadata semantics, exact
  literal `711`, non-711 rig classes, eligibility, selection tuple, and split
  seed are inherited unchanged from the repaired C1a V1.1 artifact.

## Data preparation (frozen)

For every later response member, reacquire immutable bytes, verify its Git blob
SHA-1 and SHA-256, parse using the repaired C1a parser, and apply only the
frozen terminal endpoint closure. Sample on the normal V2 log grid from
20–20,000 Hz and normalize by subtracting the interpolated 500 Hz value. No
smoothing, peak alignment, C4 preprocessing, response-derived filtering, or
extrapolation is allowed. Raw upstream bytes remain in the ignored cache and
are never committed.

## Frozen C1b model

For each device group `g`, use only exact-711 measurements:

- `C_g(f) = pointwise median_i(x_i(f))`.
- `sigma_g(f) = 1.4826 * median_i(abs(x_i(f) - C_g(f)))`.
- For each non-711 observation `r`, `D_g,r(f) = R_g,r(f) - C_g(f)` and
  `A_g,r(f) = abs(D_g,r(f))`.

For each leave-one-device-group-out fold, train on the other five development
groups only:

- `R_T(f) = median_g(sigma_g(f))`.
- `G_global,T(f) = median(abs(D_g,r(f)))` across every training observation.
- `G_k,T(f)` is class-specific only when class `k` spans at least two distinct
  training device groups. Otherwise use `G_global,T(f)`; a one-device class is
  never used to construct its own profile.
- `c(u) = 0.75 / (0.75 + u)`.
- `w_repeatability,T(f) = c(R_T(f))`.
- `w_rig,k,T(f) = c(G_k,T(f))` using the class profile or frozen global
  fallback.
- `w_conf,k,T(f) = w_repeatability,T(f) * w_rig,k,T(f)`.

The base weight is exactly `w_base(f) = 1`. All uncertainty values must be
finite and nonnegative; every resulting weight must be finite and satisfy
`0 < w <= 1`. There is no clipping, smoothing, exponent, lambda, frequency
threshold, or psychoacoustic weighting.

## Leave-one-group-out and evaluation gate

Each of the six development groups is withheld in turn. Its consensus,
sigma, non-711 observations, and all response-derived values are excluded from
that fold's learned profiles. The withheld group is used only after training
to compute its own 711 consensus and observed cross-rig disagreement.

The primary band is inclusive `[4000, 14000]` Hz. The primary grid consists
only of normal V2 grid points satisfying `4000 <= f <= 14000`; no synthetic
boundary interpolation is introduced because the protocol defines `mean_f`
over the primary grid itself. For an observation:

- `w_bar = mean_primary(w_conf(f))`.
- `E_conf = mean_primary(abs(w_conf(f) * D(f)))`.
- `E_const = mean_primary(abs(w_bar * D(f)))`.
- If `E_const == 0`, the observation is non-informative and is omitted from
  win/loss and median-gain counts.
- Otherwise `gain = (E_const - E_conf) / E_const`.
- The observation is `CONFIDENCE_TARGETING_WIN` exactly when `gain >= 0.05`;
  the threshold is not tuned after outcomes.

A group is `CONFIDENCE_TARGETING_SIGNAL` only when a strict majority of its
informative observations are wins and their median gain is at least `0.05`.
A group with no informative observations is `INCONCLUSIVE`; valid no-information
is not counted as a signal. The development gate is
`CONFIDENCE_TARGETING_DEV_SUPPORTED` only when at least four of six groups are
signals. With valid evidence and fewer signals it is
`CONFIDENCE_TARGETING_DEV_NOT_SUPPORTED`; implementation, provenance, or data
failure is `INCONCLUSIVE`.

## Diagnostics (non-gating)

Each observation records raw cross-rig MAE/RMSE, `E_conf`, `E_const`, gain,
mean/min/max confidence, repeatability-only and rig-only candidates, the full
product candidate, and diagnostics for the nine inclusive bands:

`20–500`, `500–1k`, `1–2k`, `2–4k`, `4–6k`, `6–8k`, `8–10k`, `10–14k`, and
`14–20k` Hz.

Spearman correlation is computed between `1 - w_conf` and `abs(D)` using
average ranks for exact ties. A constant rank vector has undefined Spearman
rho and is reported as `null`, not coerced to a score. Highest/lowest
confidence quartiles contain `ceil(n/4)` primary points; confidence ties retain
normal-V2 grid order, making selection deterministic.

## Execution and artifact gate

The committed `manifest.json`, `schema.json`, and `protocol-sha256.txt` in
`.research-artifacts/c1-confidence-targeting-dev/` are pre-outcome evidence.
They contain no development response metrics, profiles, weights, losses, or
classifications. The manifest flags all development/holdout execution,
response observation, confidence weighting, solver, C4 alignment, and Batch C
execution as false. The later runner must reject every holdout ID and Batch C
identifier, and must not retrain after a holdout protocol freeze.

No AutoEQ solver, production code, C4 peak alignment, C2/C3/C4 rerun, Standard
v1/golden update, structural search, or Fresh Real Batch C outcome is reachable
from this protocol.
