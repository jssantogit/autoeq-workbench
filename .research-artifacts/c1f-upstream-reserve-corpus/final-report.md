# C1f — Upstream Reserve Corpus

- Classification: **C1F_CORPUS_READY**
- Base commit: `3eb0329b8eee80eae8de72e268bf0e4fa4be733c`
- Frozen C1 V1.1 manifest commit: `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`
- Upstream: `jaakkopasanen/AutoEq` at commit `7ae0f56d53074872b028649617a22bbb4232feb7`, tree `671f0a72499ace671e4b0a293bc1948bb8330c96`
- Expected reserve groups: 22
- Reconciled reserve IDs: 22
- Successfully reacquired reserve groups: 16
- Frozen confidence model SHA-256 matched: `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`

## Primary groups

- `c1g-251bf90cf23f557cb011` — blon bl 03; exact-711=4; non-711=2; classes=gras-43ac, gras-ra0045
- `c1g-c45cb51de5231139b2f2` — moondrop variations; exact-711=4; non-711=1; classes=gras-43ac
- `c1g-e9b56c7e332c693b6f82` — sennheiser ie 600; exact-711=4; non-711=1; classes=gras-43ac
- `c1g-41b1767dc01a935198bf` — final audio e3000; exact-711=4; non-711=1; classes=gras-43ac
- `c1g-ba1d3af16db7a116d755` — final audio e1000; exact-711=4; non-711=1; classes=gras-43ac
- `c1g-1be44ee4bdbd73cbf632` — thieaudio monarch mkiii; exact-711=4; non-711=1; classes=gras-ra0045

## Secondary reserve

- `c1g-6cf5995d049cff49d672` — simgot audio ew100p
- `c1g-ccc7fd5250bd1714c73e` — moondrop chu 2
- `c1g-2fd95af2a97278cf88ef` — jvc ha fdx1
- `c1g-256c26e3bb37c97b890a` — truthear nova
- `c1g-6398ddcd56119d32eb70` — shuoer cadenza 12
- `c1g-3b112b59456722f8dabe` — symphonium audio helios

## Rig/profile distribution

- Primary rig classes: `{"gras-43ac":5,"gras-ra0045":2}`
- Primary profile categories: `{"CLASS_SPECIFIC":6}`

## Exclusions/failures

- {"USED_FOR_MODEL_TRAINING":0,"USED_FOR_C1C_HOLDOUT":0,"CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL":0,"HISTORICAL_EXCLUSION_OVERLAP":0,"NO_UPSTREAM_GROUP":0,"FROZEN_ELIGIBILITY_FAILURE":0,"IMMUTABLE_REACQUISITION_FAILED":0,"INTEGRITY_VALIDATION_FAILED":6,"IDENTITY_AMBIGUOUS":0,"VARIANT_OR_REVISION_MISMATCH":0,"ELIGIBLE_RESERVE_GROUP":16}
- `c1g-475064197540f231c71e`: UNKNOWN_RIG_CLASS
- `c1g-61f3ef2d22edbda0d4e9`: UNKNOWN_RIG_CLASS
- `c1g-6eee5959560dfe8bac37`: UNKNOWN_RIG_CLASS
- `c1g-856fc16f603398a5c7ac`: UNKNOWN_RIG_CLASS
- `c1g-d6b9e465ac5a797fe2cb`: UNKNOWN_RIG_CLASS
- `c1g-e394c150f910a0872d3e`: UNKNOWN_RIG_CLASS

## Safety

- Corpus-only metadata/provenance/integrity acquisition; no confidence evaluation, disagreement, response-shape ranking, target, filter, or causal outcome was computed.
- No AutoEQ solver or benchmark ran.
- Batch C overlap: **VERIFIED_WITHOUT_BREAKING_SEAL**; access attempts: 0.
- C1d materialized evidence was not reused as valid outcome evidence.
- Third-party raw response bytes remain only in the ignored C1f cache and are not committed.

**C1F_CORPUS_READY**
