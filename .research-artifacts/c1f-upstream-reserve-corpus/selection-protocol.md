# C1f upstream reserve corpus selection

This protocol is frozen before acquisition outcomes and uses only the authoritative C1 V1.1 reserve difference.

- Frozen manifest commit: `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`; eligible count 34; selected count 12; reserve count 22.
- Upstream pin: `jaakkopasanen/AutoEq` commit `7ae0f56d53074872b028649617a22bbb4232feb7`, tree `671f0a72499ace671e4b0a293bc1948bb8330c96`. Metadata uses immutable GitHub API trees and raw paths at the pinned commit; no full clone or moving branch is used.
- Primary gate: exactly 6 groups and at least 2 distinct non-711 rig classes.
- Structural greedy tuple for each step: newly introduced non-711 rig-class count (descending), group distinct non-711 rig-class count (descending), exact-711 independent count (descending), total independent measurement count (descending), SHA-256 of `autoeq-workbench:c1f-reserve-primary-v1:<groupId>` (ascending), group ID (ascending).
- Secondary uses the same tuple with seed `autoeq-workbench:c1f-secondary-reserve-v1`, after primary, and is capped at 6.
- No response amplitudes, disagreement, confidence values/weights, solver output, causal outcomes, or C1d partial outcome participates.
- Exact literal `711` is the primary reference rig. Other rig strings remain distinct; unsupported strings are not mapped by nominal similarity.
- Every reacquired member records immutable path, Git blob SHA-1, upstream SHA-256, parsed/canonical/normalized integrity hashes, and terminal endpoint transformation. The only endpoint operation is flat closure to 20,000 Hz when the observed terminal is between the V2 penultimate point and 20 kHz; normalization remains 500 Hz only for integrity hashing.
- Historical and sealed identity exclusions use committed identity-only ledgers. Batch C case content is sealed and never opened; access attempts must remain zero.
- This is a corpus freeze only. No causal experiment follows automatically.
