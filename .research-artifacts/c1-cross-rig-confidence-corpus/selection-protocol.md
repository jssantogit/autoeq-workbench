# C1a cross-rig confidence corpus selection protocol

This is a metadata, objective parsing/coverage/integrity, normalization-hash, and provenance milestone only. It computes no uncertainty, weighting, loss, filter, solver, or response-comparison outcome.

## Immutable source

- Repository: `jaakkopasanen/AutoEq`
- Commit: `7ae0f56d53074872b028649617a22bbb4232feb7`
- Commit tree: `671f0a72499ace671e4b0a293bc1948bb8330c96`
- API/tree and raw URLs include the immutable commit identifier. No branch reference or full clone is used.
- Raw upstream bytes are cached only below `.research-cache/c1-cross-rig-confidence-corpus/`; no upstream measurement bytes are committed.

## Identity and preparation

- Form is exactly `in-ear`.
- Device family and full configuration signature are separate. Parenthetical qualifiers are removed only for family identity; filters, eartips, ANC states, switch states, and other explicit qualifiers remain in the configuration signature.
- Metadata joins use exact rig agreement when a path-level rig is present. No parenthesis-stripping resolver and no frequency-response similarity is used.
- V2 preparation is the audited 20–20,000 Hz domain, 500 Hz normalization, and terminal flat closure at the V2 maximum. Parsed/canonical/normalization hashes are integrity evidence only.

## Primary gate

1. Enumerate strict-resolved in-ear processed curves.
2. Group by `deviceFamily + configurationSignature`.
3. Use the literal exact upstream rig string `711` for the repeatability class; all other exact rig strings remain separate, including unsupported whitespace aliases.
4. Count a collection once per rig class. L/R metadata rows never create independent members.
5. Admit a group only with at least three valid independent exact-711 collections and at least one valid independent non-711 observation of the same configuration.
6. Tier A has at least two independent non-711 observations on one non-711 class. Tier B has at least one non-711 observation.

## Selection and split

Eligible groups are ranked without any response-derived value: Tier A before Tier B; exact-711 independent count descending; distinct non-711 rig-class count descending; total independent collection count descending; SHA-256 of `autoeq-workbench:c1-cross-rig-corpus-v1` plus group ID; group ID. The first twelve are frozen. A separate SHA-256 split seed `autoeq-workbench:c1-cross-rig-split-v1` assigns six development and six holdout groups.

## Historical boundaries

- `c4PeakAlignmentStatus = C4_CLOSED_HOLDOUT_NOT_CONFIRMED`.
- `peakAlignedDispersionUsed = false`; historical C4 evidence is not imported as preprocessing.
- Explicit Type 4.3 capability is not inferred for any other rig label. The later high-frequency corpus remains unavailable from this source.
- No external fresh-corpus batch is referenced or executed by this milestone.
- Upstream audited boundary: `be4280512d36ad406fbebb63e49d5df51ce57a46`.
- Historical C4 evidence SHA-256: `4ded0c7944e22c38843d21a06402fdfbd5656e87b33595a08595a1bf91ad03a4`.
