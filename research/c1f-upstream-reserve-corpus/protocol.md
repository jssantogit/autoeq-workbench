# C1f — Upstream Reserve Corpus Protocol

## Scope and frozen ancestry

C1f is a corpus-only materialization milestone. It starts from
`3eb0329b8eee80eae8de72e268bf0e4fa4be733c` (the audited C1e
evidence commit; the effective base SHA is recorded in the runner as
`3eb0329b8eee80eae8de72e268bf0e4fa4be733c`). It does not execute AutoEQ,
Standard V1/V2, an optimizer, target generation, PEQ generation, confidence
evaluation, or any causal arm.

The authoritative candidate universe is read from
`.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/manifest.json` at
commit `28ce4470b12a3f3d6ed6eea0fcd5ea21081f1d3a`. The runner asserts 34 frozen
eligible IDs, 12 frozen selected IDs, and exactly 22 IDs in their set
 difference before any upstream acquisition.

All C1b development groups, C1c holdout groups, and all six C1d frozen primary
groups remain consumed. C1d is retained as `INCONCLUSIVE` due to
`CONCURRENT_PRIMARY_EXECUTION`; its materialized group artifact is not opened
or used as an outcome. The frozen confidence model hash is verified only for
provenance and rig-profile availability.

## Immutable upstream and acquisition

Only `jaakkopasanen/AutoEq` commit
`7ae0f56d53074872b028649617a22bbb4232feb7` and tree
`671f0a72499ace671e4b0a293bc1948bb8330c96` may be used. The runner uses
immutable GitHub API tree/name-index requests and raw URLs containing that
commit. It does not use a moving branch, a full clone, or any remote source
other than the pinned repository. Raw bytes are cached only below
`.research-cache/c1f-upstream-reserve-corpus/` and are not committed.

Metadata semantics are the audited C1 V1.1 semantics: form `in-ear`, exact
literal rig `711` for the primary reference class, exact rig strings preserved,
full configuration signatures retained, and no parenthesis-stripping join.
A group needs at least three independent exact-711 collections and one
independent non-711 observation. Members must pass local parsing, 20–20,000 Hz
coverage, and immutable blob/SHA-256 integrity checks. Terminal closure is only
the frozen V2 flat endpoint operation: when the terminal lies between the
penultimate V2 grid point and 20 kHz, append `[20000, lastObservedDb]`.
500 Hz normalization is recorded only as an integrity hash operation.

For every selected metadata member the evidence records the immutable path,
Git blob SHA-1, upstream SHA-256, original parsed-point hash, canonical-point
hash, normalized-integrity hash, and endpoint transformation. No response
performance metric is produced.

## Independence and Batch C seal

The identity matrix reports C1b, C1c, C1d, historical C1 group, source,
family, candidate-duplicate, rig, and Batch C axes separately. Reusing a
measurement database or rig is metadata, not automatic IEM leakage. Same-IEM
identity overlap is excluded; variants/revisions/nozzles/filters/tuning/DSP
configurations are not collapsed. Unknown rig strings are not mapped by
nominal similarity and cannot enter the primary gate.

Batch C case content at
`.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json` is sealed.
Only the committed identity-only ledger
`.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/historical-device-exclusions.json`
may be read. The runner has an explicit path guard and records
`batchCAccessAttempts = 0`.

## Outcome-blind selection and gates

From the reconciled 22 IDs, deterministic greedy selection takes exactly six
primary groups using, at each step, the tuple below relative to groups already
selected:

1. newly introduced non-711 rig-class count, descending;
2. distinct non-711 rig-class count within the group, descending;
3. exact-711 independent count, descending;
4. total independent measurement count, descending;
5. SHA-256 of `autoeq-workbench:c1f-reserve-primary-v1:<groupId>`, ascending;
6. group ID, ascending.

The secondary reserve is ranked after primary using the same tuple with fixed
seed `autoeq-workbench:c1f-secondary-reserve-v1`, capped at six. No amplitude,
disagreement, confidence value/weight, expected gain, solver output, or prior
C1d outcome participates.

`C1F_CORPUS_READY` requires exactly 22 reconciled IDs, at least six fully
valid groups, six selected primary groups, at least two distinct non-711 rig
classes in primary, no consumed/historical/sealed overlap, and all immutable
integrity/provenance checks. Any correctness or provenance failure is
`INCONCLUSIVE`; fewer than six valid/gated groups is
`C1F_CORPUS_INSUFFICIENT`. C1f stops after this corpus classification and does
not start a causal replication.

## Safety flags

The evidence manifest records `solverExecuted = false`,
`causalOutcomesGenerated = false`, `confidenceMetricsComputed = false`,
`confidenceWeightsUsedForSelection = false`, `responseAmplitudeUsedForSelection
= false`, `batchCAccessAttempts = 0`, `batchCAccessed = false`,
`batchCExecuted = false`, `modelRetrained = false`, `productionModified =
false`, `coreModified = false`, `frontendModified = false`, and
`c1dEvidenceReusedAsValidOutcome = false`.

The protected remote branch expectation is separately recorded as
`origin/research/storm-diagnosis-20260910` at
`31cc11982ebd07e009788d5e2c5c3537e9e6b615`. Its original local worktree is
outside this worktree and is not touched by the C1f runner.
