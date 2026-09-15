# C1c confidence-targeting — holdout confirmation outcome

- C1c protocol-freeze commit: `16491dbb517f6059e6d379e136019737b59f81c9`
- C1c protocol SHA-256: `0a4e20c50879f2d7aaa5765debd2dca55348b2c34158a3fd8eb2dc79354422a0`
- Repaired C1 V1.1 corpus commit: `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`
- Repaired C1 V1.1 evidence SHA-256: `a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43`
- Immutable C1b development model SHA-256: `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`
- Model profiles were loaded from the serialized development model only; no holdout response entered model selection or retraining.
- Raw bytes were reacquired from the pinned upstream commit and verified by Git blob SHA-1 and SHA-256; bytes remain only in the ignored cache.

## Per-group holdout evidence

### c1g-ebdb284a8c7563a12c5f — moondrop aria
- Members: 6; exact-711: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.28612921760880067.
- 711 consensus SHA-256: `69f5586e98f708856fb8207ac25baf8efb8f1924281db7c056469759130bc722`; repeatability sigma SHA-256: `3474d08ebacb7aeafd71c25366871d0db1832cf732eb6565ca8952ac757d6bc5`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-3f4de360d87a28aea240 — truthear hexa
- Members: 9; exact-711: 7; non-711 observations: 2; informative: 2.
- Wins/losses: 2/0; median targeting gain: 0.16848398743025245.
- 711 consensus SHA-256: `2146779a64f5dc29171a463aef471672bbb10e2d70831551b3698c26a9f68af9`; repeatability sigma SHA-256: `e33421b4795a6496b16a4293a7cfcefd83cc15ae0eace3348453906749770e69`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-f2a43144c5936389d89d — 7hz salnotes zero
- Members: 9; exact-711: 7; non-711 observations: 2; informative: 2.
- Wins/losses: 1/1; median targeting gain: 0.1295645087866565.
- 711 consensus SHA-256: `9a0d950afb5ba27f46776df74d16a530a45323510eb489b8aa444b5014631c72`; repeatability sigma SHA-256: `d6c6406c7e9507756a1f8b419848f2b80a6b34b2503dfdbd03bdb4a5ba8d9f3a`.
- Classification: **NO_CONFIDENCE_TARGETING_SIGNAL**.

### c1g-8bd11cb5d7772ff2165b — moondrop quarks
- Members: 6; exact-711: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 0/1; median targeting gain: -0.047007559372769146.
- 711 consensus SHA-256: `770609e6366aff191958eb38b3adf8b29eea7f3ce8b573ee1b6263fafe20af23`; repeatability sigma SHA-256: `1dcaf6763dafb951ce288f697aedda7430a60fb46e2dde8b649664a81ece9301`.
- Classification: **NO_CONFIDENCE_TARGETING_SIGNAL**.

### c1g-6c369c990dd73512951b — epz q5
- Members: 7; exact-711: 6; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.5236848363214066.
- 711 consensus SHA-256: `01bf44cba8c761ed54db675d7704d7e022ca4de573ac1bcaa67f946281dae22c`; repeatability sigma SHA-256: `1a6e8a9284ea01b3bea87d9630bb2751b3ba8990b81dac0681bc9f76e6824160`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-dc1ade324d0c4b3192d6 — 7hz timeless
- Members: 7; exact-711: 6; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.40675818285034854.
- 711 consensus SHA-256: `5b3d2dfdd1869838d01940b93a34a7ec026eba70649181cca2b5063b980f9a8f`; repeatability sigma SHA-256: `ccfff02a0d49fbced0d1390871242a4dbe8d37c3285373a3dfdabc6234c9c7bd`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

## Holdout gate

- Signal groups: 4/6; required: 4; classification: **CONFIDENCE_TARGETING_GENERALIZES**.

## Combined C1 interpretation

- **C1_CONFIDENCE_MODEL_GENERALIZED**.

## Frozen guardrails

- Development groups were rejected from holdout decision-making; Fresh Real Corpus Batch C remained sealed and unexecuted.

- No C4 peak alignment, smoothing, Huber, solver, structural search, C2/C3/C4 rerun, or production code ran.

- Evidence files: aggregate-evidence.json, final-report.md, group-c1g-3f4de360d87a28aea240.json, group-c1g-6c369c990dd73512951b.json, group-c1g-8bd11cb5d7772ff2165b.json, group-c1g-dc1ade324d0c4b3192d6.json, group-c1g-ebdb284a8c7563a12c5f.json, group-c1g-f2a43144c5936389d89d.json, schema.json
