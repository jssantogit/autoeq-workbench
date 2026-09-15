# C1b confidence-targeting — development outcome

- Protocol freeze commit: `6e8dba547bc9f12a072e0660ce35c89a3d502455`
- Protocol SHA-256: `f5d273820e95871ebf6f22bbeffffe000add5a395fb0da6f8825dab185ff48e8`
- Repaired C1 V1.1 corpus commit: `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`
- Repaired C1 V1.1 evidence SHA-256: `a1bc2d4b6da004afb01685a48f95243dcde72e6d1284906edd03ca4cf471fd43`
- Algorithm: `c1-confidence-targeting-v1`; transform scale: 0.75 dB.
- Development protocol: six-group leave-one-device-group-out; primary band 4000–14000 Hz.
- Equal-authority control uses the exact primary-band mean confidence per observation.
- Raw bytes were validated by both pinned Git blob SHA-1 and SHA-256 and remain only in the ignored cache.

## Per-group evidence

### c1g-c4cd2c0381c89a1e9911 — moondrop x crinacle blessing2 dusk
- Exact-711 members: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.25789506411179985.
- 711 consensus SHA-256: `6c089b3ecfb296c520f533c22a96b0e243ce8c9b18d3a16c7b88603f59ad953e`; repeatability sigma SHA-256: `ea926fbad92249dabb0aae4d257d9a11f616478aac01e628c433382519407bc6`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-106abf02ed8b580831bd — ikko oh10
- Exact-711 members: 6; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.09401326588310913.
- 711 consensus SHA-256: `03427e0c1561084f070af0bfd4861317aac90d1880d1314e95a97154a3bb49bc`; repeatability sigma SHA-256: `d7049fad4ac153f7663e641f6465bb1a978720fdd61364028d05b30eeeb18c63`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-5fe954a9babbe4c5cda0 — simgot audio ea500
- Exact-711 members: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.27248442528648226.
- 711 consensus SHA-256: `27b51f18ed6f33bc19381380ce1c5a8b36ef60e467584151cf53c8ba074b5c81`; repeatability sigma SHA-256: `093e5ae389c2cc8da856929124423799a8b9c028b40705d0a6986e7cc63668e5`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-0a8d256822943d659136 — kiwi ears ke4
- Exact-711 members: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.3146138331875719.
- 711 consensus SHA-256: `455292e2880ec6b2b29bda2378d76687d0b67ed13db27af2d8a9ef5b033b9ca0`; repeatability sigma SHA-256: `89d061f00a9c797145d22b5a73667b80ffcc51f61755d2ec3f8e9bd80d98bb89`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-20fa430247872858b84b — truthear x crinacle zero
- Exact-711 members: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.2516340810334106.
- 711 consensus SHA-256: `3d105335dadc150cc15ef4c6fa18675b9d6a73f083cd02c49ab48d6016daf843`; repeatability sigma SHA-256: `f048493d5284340d7ef83c127fc711605abdadfd860670c18ff19ca86db3f2e1`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

### c1g-3579b4e7c8f794efd07a — moondrop ssr
- Exact-711 members: 5; non-711 observations: 1; informative: 1.
- Wins/losses: 1/0; median targeting gain: 0.24048367819950928.
- 711 consensus SHA-256: `138e6ff84bc564aee36b10615e834e996f69d1f7d7f6228c60da2d5729db0a87`; repeatability sigma SHA-256: `e3bb1acbd6a3c83645ced60a404de57fd455db3ca51dc6dace0254cbc74bd61b`.
- Classification: **CONFIDENCE_TARGETING_SIGNAL**.

## Development gate

- Signal groups: 6/6; required: 4; classification: **CONFIDENCE_TARGETING_DEV_SUPPORTED**.

## Frozen guardrails

- Holdout groups were rejected before response acquisition; no holdout response was inspected.

- Fresh Real Corpus Batch C remained sealed and unexecuted.

- No C4 peak alignment, smoothing, Huber, solver, structural search, C2/C3/C4 rerun, or production code ran.

- Evidence files: aggregate-evidence.json, final-report.md, group-c1g-0a8d256822943d659136.json, group-c1g-106abf02ed8b580831bd.json, group-c1g-20fa430247872858b84b.json, group-c1g-3579b4e7c8f794efd07a.json, group-c1g-5fe954a9babbe4c5cda0.json, group-c1g-c4cd2c0381c89a1e9911.json, manifest.json, schema.json
