# C1e — Corpus Discovery and Independence Audit

- Base commit: `4e86e95ce09e0c8d149be3307d0fcfc2d3b40ff8`
- Frozen confidence model SHA-256 verified: `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00` (expected `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`)
- Total measurement records inventoried: 81
- Potential same-IEM groups: 12
- Primary-ready groups: 0
- Readiness classification: **C1E_CORPUS_INSUFFICIENT**

## Safety and independence boundary

- This phase performed structural/provenance discovery only; it did not execute AutoEQ, calculate disagreement, calculate confidence metrics, generate targets, or produce causal outcomes.
- Batch C access: not accessed; overlap status: **VERIFIED_WITHOUT_BREAKING_SEAL**.
- Prior C1 exclusion groups: 18; C1d classification preserved as INCONCLUSIVE (INCONCLUSIVE).

## Exclusion counts

- Candidate primary classifications:
  - USED_FOR_MODEL_TRAINING: 6
  - CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL: 6
- Prior C1 identity memberships (overlaps are intentionally retained):
  - USED_FOR_MODEL_TRAINING: 6
  - CONSUMED_BY_INVALIDATED_C1D_PRIMARY_PROTOCOL: 6
  - USED_FOR_C1C_HOLDOUT: 6

## Rig and profile distribution

- Rig classes: `{}`
- Profile categories: `{}`

## Proposed primary set

- None (fewer than six primary-ready candidates).

## Secondary reserve

- None.

## Audit ledger

- Paths accessed: 10
- Paths rejected: 5
- Batch C access attempts: 0
- Repository root: `/root/projects/autoeq-workbench-c1e-corpus-discovery`

**C1E_CORPUS_INSUFFICIENT**
