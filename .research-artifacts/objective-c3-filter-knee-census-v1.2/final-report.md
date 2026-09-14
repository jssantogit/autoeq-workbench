# C3 filter-count/error knee census — Fresh Real Corpus V1.2

- Frozen corpus commit: `fc3932c72e3c3931dc062c523c2205389639264b` (CORPUS_V1_2_READY).
- Corpus evidence SHA-256: `13c7ff43614d7e257b0231f9238102afff5413964077017a2db7741d87b659b1`.
- Upstream: `jaakkopasanen/AutoEq` commit `7ae0f56d53074872b028649617a22bbb4232feb7`, tree `671f0a72499ace671e4b0a293bc1948bb8330c96`.
- Selected algorithm: **FROZEN_BASELINE**; this census adds observation only and does not implement a production knee selector.
- Resolved envelope: C43/e6, preset `max10-q31-b4-p8-experimental`, beam 16, proposals/parent 32, polish 120, admission `q31-b4-p8`, work profile `full`.
- Execution: one deterministic generation-work-bounded trajectory per case, maximum 31 completed ordinary generations (natural termination is retained).

## Batch A cases

| Case | Split | N_min | N_knee | N_final | Filters saved | Violation knee/final | RMSE knee/final | maxAbs knee/final | MAE knee/final | Classification |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| frc1.1-12-0002977aa8bc | development | 0 | 5 | 17 | 12 | 6.039226 / 6.033730 | 1.504305 / 1.429421 | 4.529419 / 4.525297 | 1.141462 / 1.038448 | KNEE_CASE |
| frc1.1-09-0001b6618e24 | development | 0 | 6 | 16 | 10 | 7.980605 / 2.595360 | 1.943391 / 0.640864 | 5.985454 / 1.946520 | 1.634912 / 0.440258 | KNEE_CASE |
| frc1.1-10-00027122c3ce | development | 0 | 5 | 15 | 10 | 8.429603 / 4.217341 | 2.107401 / 0.982015 | 5.144471 / 3.163006 | 1.796408 / 0.726121 | KNEE_CASE |
| frc1.1-03-00003906daac | holdout | 0 | 3 | 16 | 13 | 8.472713 / 5.201725 | 2.103084 / 1.300431 | 6.354535 / 3.893310 | 1.401103 / 0.923443 | KNEE_CASE |
| frc1.1-15-000323cd8787 | holdout | 0 | 3 | 21 | 18 | 9.625481 / 2.136679 | 2.406370 / 0.528459 | 6.098071 / 1.602509 | 2.076340 / 0.408958 | KNEE_CASE |
| frc1.1-06-0000c6497763 | holdout | 0 | 5 | 15 | 10 | 7.947362 / 3.393359 | 1.893182 / 0.844729 | 5.960521 / 2.545020 | 1.394827 / 0.641991 | KNEE_CASE |

## Temporal diagnostic

| Case | g10 knee | g20 knee | final knee | movement g10→g20 | movement g20→final | final N represented at g10 | final N represented at g20 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| frc1.1-12-0002977aa8bc | 3 | 4 | 5 | 1 | 1 | yes | yes |
| frc1.1-09-0001b6618e24 | 3 | 3 | 6 | 0 | 3 | yes | yes |
| frc1.1-10-00027122c3ce | 1 | 1 | 5 | 0 | 4 | yes | yes |
| frc1.1-03-00003906daac | 2 | 2 | 3 | 0 | 1 | yes | yes |
| frc1.1-15-000323cd8787 | 2 | 3 | 3 | 1 | 0 | yes | yes |
| frc1.1-06-0000c6497763 | 3 | 5 | 5 | 2 | 0 | yes | yes |

## Gate

- Development KNEE_CASE coverage: 3/3.
- Holdout KNEE_CASE coverage: 3/3.
- Overall KNEE_CASE coverage: 6/6.
- Final C3 classification: **KNEE_SIGNAL_SUPPORTED**.
- Gate: supported requires development ≥2/3, holdout ≥2/3, overall ≥4/6, observer OFF/ON equivalence, and all frontier invariants.

## Synthetic sanity (D/E/F/H)

| Case | Known generating complexity | N_knee | N_final | Unique knee |
| --- | ---: | ---: | ---: | --- |
| synthetic-d-dense-known-structure | 12 | 9 | 11 | yes |
| synthetic-e-high-q-valid | 3 | 3 | 3 | yes |
| synthetic-f-upper-frequency-structure | 3 | 3 | 7 | yes |
| synthetic-h-alternating-structure | 6 | 6 | 14 | yes |

- Synthetic results are sanity checks only and do not move the real-case gate.
- Secondary cancellation/Q/gain metrics are recorded in each per-case frontier artifact and do not move the knee.

- Interpretation: stop after the census; a later milestone may implement exactly this geometric selector for a direct frozen-baseline benchmark.
