# M4 structural-search candidate-oracle census

- Frozen research boundary: `956be9ddcea4152276744df3565274352b9a9f80`.
- Protocol: C43/e6, 3 repeats; first completed generation; every 10th completed generation; final completed generation before deadline.
- Execution model: generation-work-bounded-replay; deterministic generation bound 4. The 30-second search setting is not used as a live wall-clock capture claim.
- Baseline trajectory: frozen ordinary search only; oracle candidates are evaluated offline from immutable snapshots.
- Oracle families: O1 residual-extremum PK, O2 residual-region PK, O3 shelf evidence, O4 fixed-count least-damage topology substitution.
- No M4 candidate entered the baseline beam and no baseline decision consumed oracle results.

## Aggregate evidence

- Real snapshots/cases: 36/6; synthetic snapshots/cases: 24/4.
- Real oracle-win coverage: 2 development cases, 1 holdout cases, 3 overall cases, 9 repeats, 9 generations.
- Sampling adequacy (first/middle/final across six cases and three repeats): **no**.
- Decomposition: NO_STRUCTURAL_CANDIDATE=0; PREPOLISH_REJECTED=60; POLISH_FAILURE=21; BEAM_REJECTED=159; REFERENCE_NONIMPROVING=27; ORACLE_WIN=39.

## Frozen decision rule

- Supported requires at least 2/3 development cases, 2/3 holdout cases, 4/6 overall cases, and wins in more than one repeat and generation.
- Decision: **INCONCLUSIVE**.
- Evidence hash: `3ac87d9d1c9556f902654825eb6de46f80c7837ce853da6e23487ad97a774d29`.

This milestone is diagnostic/shadow only. It does not authorize an online M4/M5 search policy.
