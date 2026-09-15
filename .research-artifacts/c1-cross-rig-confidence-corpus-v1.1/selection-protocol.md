# C1a V1.1 cross-study independence repair

This milestone replaces the C1a v1 selected set only for subsequent C1
experimental use. The original C1a artifact is immutable. This artifact is
metadata/provenance/integrity evidence only and computes no repeatability,
cross-rig response delta, confidence profile, weighting, loss, filter, or
solver outcome.

## Immutable source and unchanged C1a semantics

- Upstream repository: `jaakkopasanen/AutoEq`
- Upstream commit: `7ae0f56d53074872b028649617a22bbb4232feb7`
- Upstream tree: `671f0a72499ace671e4b0a293bc1948bb8330c96`
- Frozen boundary: `be4280512d36ad406fbebb63e49d5df51ce57a46`
- Form: exact `in-ear`
- Primary rig: exact literal `711`; every other exact rig string remains distinct.
- Domain: 20–20000 Hz, terminal flat closure, and 500 Hz normalization (60 dB).
- Eligibility: at least 3 independent exact-711 collections and at least one independent non-711 observation.
- Ranking: unchanged C1a tier/count/class/count/hash/group-ID tuple; selection seed `autoeq-workbench:c1-cross-rig-corpus-v1`.
- Split: unchanged six/six hash split seed `autoeq-workbench:c1-cross-rig-split-v1`, applied only when twelve groups remain.

## Independence repair

The exclusion predicate is applied to canonical device families before
grouping and deterministic selection. It is derived only from the committed
`historical-device-exclusions.json` provenance inventory. No response shape
or outcome value is used. Families in sealed Fresh Real Batch C are excluded
to protect that future corpus even though its outcomes remain unobserved.

The selected set asserts unique families, exact configuration identity,
valid immutable upstream integrity records, at least three exact-711
collections, at least one non-711 observation, and no unsupported rig alias
merge. Raw upstream bytes remain in the ignored cache only.

## Historical C4 boundary

- c4PeakAlignmentStatus: `C4_CLOSED_HOLDOUT_NOT_CONFIRMED`
- Historical C4 evidence SHA-256: `4ded0c7944e22c38843d21a06402fdfbd5656e87b33595a08595a1bf91ad03a4`
- Peak alignment is not used by this milestone.
- Fresh Real Batch C response outcomes are not acquired or executed.
