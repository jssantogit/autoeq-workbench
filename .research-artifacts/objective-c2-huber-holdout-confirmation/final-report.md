# C2b Huber preference holdout confirmation — Fresh Real Corpus V1.2

- C2a protocol boundary: `e042f312d414308c09819bef6ab45567846e959f`; C2a evidence SHA-256: `7678c3c0ba37fc35e46ba5ed9644552b4262334e8561f2dc4e03e885f87ccfd8`.
- Protocol-freeze commit: `8b4ebc3ba6a828154cfce6f7cfa6712aaf8fb3f8`; evidence SHA-256: `1de4d0ac26eb1d24724e01b4dbeae38a6a10343cb8a671c06ccc3e79229d751a`.
- Frozen candidate: **HUBER-075**, delta **0.75 dB**; no search decision used either loss.
- Corpus: `fc3932c72e3c3931dc062c523c2205389639264b`, evidence SHA-256 `13c7ff43614d7e257b0231f9238102afff5413964077017a2db7741d87b659b1`; Batch C executed: **false**.

## Holdout census

| Case | unique states | MSE winner N | Huber winner N | comparable N | divergent N | exact-N divergence | ρ(MSE,Huber) | gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| frc1.1-14-00025d5729a1 | 2957 | 18 | 18 | 21 | 4 | 19.05% | 0.995972 | NO_HUBER_PREFERENCE_DIVERGENCE |
| frc1.1-13-000225a01a6d | 1327 | 7 | 7 | 11 | 5 | 45.45% | 0.989345 | HUBER_PREFERENCE_DIVERGENCE |
| frc1.1-17-00036da52192 | 3658 | 20 | 20 | 23 | 10 | 43.48% | 0.997203 | NO_HUBER_PREFERENCE_DIVERGENCE |

## Global winner diagnostics

| Case | loss | N | MSE | RMSE | MAE | Huber075 | maxAbs | violation | cancellation | Q p50/p90/max | max |gain| | sum |gain| | opposing pairs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| frc1.1-14-00025d5729a1 | MSE | 18 | 0.616275 | 0.785032 | 0.547472 | 0.416915 | 2.516316 | 3.355088 | 0.000000 | 0.700000 / 2.670000 / 3.850000 | 15.000000 | 82.900000 | 0 |
| frc1.1-14-00025d5729a1 | HUBER-075 | 18 | 0.616275 | 0.785032 | 0.547472 | 0.416915 | 2.516316 | 3.355088 | 0.000000 | 0.700000 / 2.670000 / 3.850000 | 15.000000 | 82.900000 | 0 |
| frc1.1-13-000225a01a6d | MSE | 7 | 2.158480 | 1.469177 | 0.986840 | 0.974101 | 4.407832 | 5.877109 | 0.000000 | 2.380000 / 6.608000 / 8.390000 | 14.400000 | 60.800000 | 0 |
| frc1.1-13-000225a01a6d | HUBER-075 | 7 | 2.158480 | 1.469177 | 0.986840 | 0.974101 | 4.407832 | 5.877109 | 0.000000 | 2.380000 / 6.608000 / 8.390000 | 14.400000 | 60.800000 | 0 |
| frc1.1-17-00036da52192 | MSE | 20 | 0.390827 | 0.625161 | 0.467668 | 0.308999 | 1.871111 | 2.500645 | 0.351234 | 3.405000 / 9.209000 / 12.000000 | 15.000000 | 107.800000 | 1 |
| frc1.1-17-00036da52192 | HUBER-075 | 20 | 0.390827 | 0.625161 | 0.467668 | 0.308999 | 1.871111 | 2.500645 | 0.351234 | 3.405000 / 9.209000 / 12.000000 | 15.000000 | 107.800000 | 1 |

## Band diagnostics (MAE / RMSE / maxAbs)

| Case | loss | 20 Hz–5 kHz | 5–8 kHz | 8–12 kHz | 12–16 kHz | 16–20 kHz |
| --- | --- | --- | --- | --- | --- | --- |
| frc1.1-14-00025d5729a1 | MSE | 0.375707 / 0.507904 / 1.159541 | 1.285222 / 1.450954 / 2.516313 | 1.349798 / 1.509289 / 2.516316 | 1.025274 / 1.281394 / 2.478892 | 1.153874 / 1.402678 / 2.515561 |
| frc1.1-14-00025d5729a1 | HUBER-075 | 0.375707 / 0.507904 / 1.159541 | 1.285222 / 1.450954 / 2.516313 | 1.349798 / 1.509289 / 2.516316 | 1.025274 / 1.281394 / 2.478892 | 1.153874 / 1.402678 / 2.515561 |
| frc1.1-13-000225a01a6d | MSE | 0.787471 / 1.222433 / 3.069805 | 1.353387 / 1.805894 / 4.227681 | 2.058837 / 2.454409 / 4.404304 | 1.643640 / 2.047645 / 4.407832 | 2.311463 / 2.547098 / 4.318979 |
| frc1.1-13-000225a01a6d | HUBER-075 | 0.787471 / 1.222433 / 3.069805 | 1.353387 / 1.805894 / 4.227681 | 2.058837 / 2.454409 / 4.404304 | 1.643640 / 2.047645 / 4.407832 | 2.311463 / 2.547098 / 4.318979 |
| frc1.1-17-00036da52192 | MSE | 0.427192 / 0.583811 / 1.487323 | 0.379456 / 0.453892 / 0.912928 | 0.606953 / 0.711491 / 1.465901 | 0.916181 / 1.061882 / 1.871111 | 0.810081 / 0.915649 / 1.660874 |
| frc1.1-17-00036da52192 | HUBER-075 | 0.427192 / 0.583811 / 1.487323 | 0.379456 / 0.453892 / 0.912928 | 0.606953 / 0.711491 / 1.465901 | 0.916181 / 1.061882 / 1.871111 | 0.810081 / 0.915649 / 1.660874 |

## Outlier concentration mechanism diagnostic

| Case | statistic | MSE | Huber075 | Huber − MSE |
| --- | --- | ---: | ---: | ---: |
| frc1.1-14-00025d5729a1 | squaredErrorWorst1Percent | 10.38% | 10.38% | 0.00% |
| frc1.1-14-00025d5729a1 | squaredErrorWorst5Percent | 39.05% | 39.05% | 0.00% |
| frc1.1-14-00025d5729a1 | absoluteErrorWorst1Percent | 4.72% | 4.72% | 0.00% |
| frc1.1-14-00025d5729a1 | absoluteErrorWorst5Percent | 19.95% | 19.95% | 0.00% |
| frc1.1-13-000225a01a6d | squaredErrorWorst1Percent | 8.92% | 8.92% | 0.00% |
| frc1.1-13-000225a01a6d | squaredErrorWorst5Percent | 31.29% | 31.29% | 0.00% |
| frc1.1-13-000225a01a6d | absoluteErrorWorst1Percent | 4.54% | 4.54% | 0.00% |
| frc1.1-13-000225a01a6d | absoluteErrorWorst5Percent | 18.51% | 18.51% | 0.00% |
| frc1.1-17-00036da52192 | squaredErrorWorst1Percent | 7.67% | 7.67% | 0.00% |
| frc1.1-17-00036da52192 | squaredErrorWorst5Percent | 27.84% | 27.84% | 0.00% |
| frc1.1-17-00036da52192 | absoluteErrorWorst1Percent | 3.77% | 3.77% | 0.00% |
| frc1.1-17-00036da52192 | absoluteErrorWorst5Percent | 15.72% | 15.72% | 0.00% |

## Gate

- Holdout divergence coverage: **1/3**.
- Final C2b classification: **HUBER_PREFERENCE_NOT_CONFIRMED**.
- Combined C2 interpretation: **C2_CLOSED_HOLDOUT_NOT_CONFIRMED**.
- The result is preference evidence only. It does not prove Huber improves an online optimizer; because holdout confirmation failed, C2 is closed and no C2c implementation is authorized.

## Sealed execution

- Exact holdouts: `frc1.1-14-00025d5729a1`, `frc1.1-13-000225a01a6d`, `frc1.1-17-00036da52192`.
- Batch B development was not rerun; Batch C and all old Structural VNext cases were not executed.
