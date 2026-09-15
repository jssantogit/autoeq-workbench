# C1e — Corpus Discovery and Independence Audit

## Scope and provenance

C1e is a read-only, pre-causal corpus audit. Its sole question is whether
committed local material contains a new same-IEM pair/group with at least one
literal exact-`711` reference and at least one non-`711` observation. C1e does
not run AutoEQ, construct targets, calculate disagreement/confidence, select
filters, or emit causal outcomes.

The research ancestry is the C1d closeout commit
`4e86e95ce09e0c8d149be3307d0fcfc2d3b40ff8`. The C1d state remains
`INCONCLUSIVE` because of `CONCURRENT_PRIMARY_EXECUTION`; it is not
reinterpreted. The frozen C1d protocol is `b5606dc7b3aa2dd3917af2be817ca98d24649907`
and its superseded pre-freeze reference is
`d371defd11dc7ce274b0a9d8daa3f3439757fd4f`. The frozen confidence-model
identity is SHA-256
`65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`.

The implementation and generated evidence are restricted to this directory
and `.research-artifacts/c1e-corpus-discovery/`. Product/core, Standard V1/V2,
all earlier C1 campaign directories, upstream corpus material, and the sealed
Batch C cases are not modified or imported.

## Allowed local sources

The source inventory covers committed files below `research/**`,
`.research-artifacts/**`, `packages/core/benchmarks/**`, and
`packages/core/.research-artifacts/**`, excluding immutable `vendor/squiglink`
and rejecting the sealed path
`.research-artifacts/fresh-real-corpus-v1-metadata-repair/cases.json` (and its
sealed directory) before any filesystem open. The C1e output directory itself
is excluded from the input inventory because it is generated evidence, not a
source corpus. Existing metadata/manifests are
read for identity/provenance only. A local response path is considered
available only when its bytes or an explicitly supplied structural summary are
local; an upstream URL or path is never reacquired.

The only Batch C overlap mechanism is the pre-existing identity-only artifact
`.research-artifacts/c1-cross-rig-confidence-corpus-v1.1/historical-device-exclusions.json`.
Only its `sealedFutureBatchCFamilies` fingerprint is used. If that artifact is
missing or malformed, the report must say
`UNVERIFIED_DUE_TO_SEAL`; C1e never opens the Batch C cases file to repair the
status.

## Frozen exclusion ledger

Before candidate evaluation, the runner reads the C1b and C1c manifests plus
the C1a V1.1 group metadata and derives all six C1b development identities and
all six C1c holdout identities. It reads the C1d manifest, invalidation
manifest, and frozen protocol and treats all six frozen C1d primary IDs as
consumed, even though only one outcome artifact was materialized. The reasons
are respectively:

* `USED_FOR_MODEL_TRAINING`;
* `USED_FOR_C1C_HOLDOUT`; and
* `CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL`.

Exclusion is by canonical IEM identity, not by group ID. A new group ID cannot
evade an identity match. When an identity appears in both the C1c holdout and
the frozen C1d primary set, the primary classification is
`CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL`; the prior ledger still records
both memberships. Manufacturer, model, canonical model/family,
aliases, full configuration, source identity, and explicit variant/revision,
tuning, DSP-mode, nozzle/filter, or eartip qualifiers are retained. C1a's
family/configuration distinction is preserved: parenthetical or explicit
configuration qualifiers are not silently erased. Known spelling aliases
(including `7Hz Zero`/`7Hz Salnotes Zero`) are equivalent; unresolved identity
conflicts are `IDENTITY_AMBIGUOUS`. Different models, collabs, revisions,
tunings, and semantically distinct configurations are not merged and are
classified `VARIANT_OR_REVISION_MISMATCH` or `NOT_PROVEN_SAME_IEM` as
appropriate.

Source/database reuse and rig reuse are recorded separately from IEM identity.
The same reviewer/database does not itself exclude a new IEM. A same-IEM
overlap always excludes it, even if its source differs.

## Structural candidate rule

Candidate grouping uses canonical base identity and preserves full
configuration signatures. Each candidate must have:

1. one or more locally available exact literal `711` observations;
2. one or more locally available non-`711` observations of the same identity;
3. an identifiable raw rig string and a provenance/source identifier for every
   observation;
4. local response structure sufficient for a future C1 grid (finite frequency
   and amplitude values spanning 20–20,000 Hz, or a local audited structural
   summary); and
5. no prior C1 identity overlap, variant/revision mismatch, ambiguous identity,
   sealed Batch C overlap, or duplicate candidate identity.

No consensus is constructed and no curve is compared. Multiple exact-`711`
observations record count, source IDs, and repeat availability. Structural
availability is classified `EXACT711_CONSENSUS_FEASIBLE` only when every local
exact-`711` response has the required grid structure.

Rig classes are exact-metadata classifications. The model is read only to
verify its hash and enumerate serialized class profiles/global fallback. The
audited classes include `gras-43ac`, `kb501x-711`, `gras-ra0045`, and
`gras-43acb`; no nominal similarity is used to extend this list. A serialized
class profile is `CLASS_SPECIFIC`; a known class without one but with the
serialized global profile is `GLOBAL_FALLBACK`; an unsupported raw rig is
`UNKNOWN_RIG_CLASS` and cannot enter the primary-ready pool.

The runner never reads or computes confidence weights, disagreement magnitude,
RMSE/MAE, gains, wins/losses, expected causal gain, targeting metrics, or any
outcome-derived score. Candidate eligibility and selection are therefore
outcome-blind.

## Candidate IDs and independence matrix

For each candidate, serialize stable key-sorted JSON containing:

* canonical IEM identity;
* sorted exact-`711` observation identities;
* sorted non-`711` observation identities;
* sorted non-`711` rig classes; and
* sorted source-provenance identifiers.

The candidate ID is `c1e-` followed by the first 20 lowercase hex characters of
SHA-256 over that serialization. Input order cannot change the ID. The
independence matrix reports, separately for every candidate, overlap with C1b
training identities, C1c holdout identities, C1d primary identities,
historical C1 group IDs, source/rig reuse, family identity,
candidate-to-candidate duplicate identity, and Batch C only when verified by
the sealed identity-only artifact.

## Outcome-blind proposed set

When more than six primary-ready candidates exist, the complete pool is
retained. A proposed set of exactly six is selected by the following frozen
greedy algorithm, declared before evidence generation:

1. maximize the number of newly introduced non-`711` rig classes;
2. maximize newly introduced canonical families;
3. maximize newly introduced measurement-source identifiers;
4. maximize exact-`711` repeat count as a structural quality tie-break; and
5. break every remaining tie by lexicographic candidate ID.

No response amplitude, visual disagreement, or confidence value participates.
All candidates after the six are labeled `SECONDARY_RESERVE`; reserve entries
are not executed or evaluated.

## Readiness gate

The report emits exactly one of:

* `C1E_CORPUS_READY` — at least six primary-ready groups, at least two distinct
  non-`711` rig classes, sufficient local response/provenance, and verified
  Batch C overlap without opening the seal;
* `C1E_CORPUS_READY_BATCHC_INDEPENDENCE_UNVERIFIED` — the same structural
  threshold, but Batch C overlap is not verifiable without the sealed cases;
* `C1E_CORPUS_LIMITED` — at least six structural groups but only one non-`711`
  rig class or another declared structural limitation; or
* `C1E_CORPUS_INSUFFICIENT` — fewer than six structural groups. This means the
  committed repository does not contain a new causal holdout sufficient to
  repeat C1d without reusing consumed evidence. C1c and Batch C are not
  reopened.

A ready or limited discovery result does not start a causal replication. A
future campaign must author and freeze its own causal protocol first.

## Safety flags and audit ledger

The generated manifest explicitly sets `solverExecuted = false`,
`causalOutcomesGenerated = false`, `confidenceTargetingMetricsComputed = false`,
`confidenceWeightsUsedForSelection = false`, `responseAmplitudeUsedForSelection
= false`, `batchCAccessed = false`, `batchCExecuted = false`,
`modelRetrained = false`, `productionModified = false`, and
`c1dEvidenceReusedAsValidOutcome = false`. The source inventory records every
opened path, every rejected path, and a zero Batch C access-attempt count.
