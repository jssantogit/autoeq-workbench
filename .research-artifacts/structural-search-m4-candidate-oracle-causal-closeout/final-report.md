# M4 structural-search candidate-oracle census

- Frozen research boundary: `956be9ddcea4152276744df3565274352b9a9f80`.
- Protocol: C43/e6, 3 repeats; first completed generation; every 10th completed generation; final completed generation before deadline.
- Execution model: generation-work-bounded-replay; deterministic generation bound 21. The 30-second search setting is not used as a live wall-clock capture claim.
- Baseline trajectory: frozen ordinary search only; oracle candidates are evaluated offline from immutable snapshots.
- Oracle families: O1 residual-extremum PK, O2 residual-region PK, O3 shelf evidence, O4 fixed-count least-damage topology substitution.
- No M4 candidate entered the baseline beam and no baseline decision consumed oracle results.

## Aggregate evidence

- Real snapshots/cases: 54/6; synthetic snapshots/cases: 36/4.
- Real oracle-win coverage: 2 development cases, 3 holdout cases, 5 overall cases, 15 repeats, 24 generations.
- Sampling adequacy (first/middle/final across six cases and three repeats): **yes**.
- Generation-global decomposition (real): NO_STRUCTURAL_CANDIDATE=0; PREPOLISH_REJECTED=18; POLISH_FAILURE=18; BEAM_REJECTED=720; REFERENCE_NONIMPROVING=72; ORACLE_WIN=87.
- Generation-global decomposition (synthetic): NO_STRUCTURAL_CANDIDATE=12; PREPOLISH_REJECTED=12; POLISH_FAILURE=3; BEAM_REJECTED=96; REFERENCE_NONIMPROVING=3; ORACLE_WIN=9.
- Aggregate generation-global decomposition (real + synthetic): NO_STRUCTURAL_CANDIDATE=12; PREPOLISH_REJECTED=30; POLISH_FAILURE=21; BEAM_REJECTED=816; REFERENCE_NONIMPROVING=75; ORACLE_WIN=96.

The committed 331d93c evidence used deterministicGenerationBound=4, so it captured only generation 0 and imposed terminal generation 3 (two snapshots per trajectory) and was sampling-inadequate. Those historical values are not used to tune this corrected census.
The historical partial coverage values (development 2/3, holdout 1/3, overall 3/6) remain incomplete evidence only and are not used to tune M4b.

### real trajectory sampling

| case | repeat | captured generations | terminal | adequacy |
| --- | ---: | --- | --- | --- |
| Titan → Mystic 8 | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Mystic 8 | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Mystic 8 | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → RSV | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → RSV | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → RSV | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → S12 Ultra | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → S12 Ultra | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → S12 Ultra | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Storm | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Storm | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Storm | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Trio | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Trio | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → Trio | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → U12t | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → U12t | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Titan → U12t | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |

### real deterministic repeat identity

Repeat outputs are compared as trajectory fingerprints. Identical deterministic repeats remain protocol repeats, not independent replication evidence.

- titan-to-mystic-8: identical across 3 repeats.
- titan-to-rsv: identical across 3 repeats.
- titan-to-s12-ultra: identical across 3 repeats.
- titan-to-storm: identical across 3 repeats.
- titan-to-trio: identical across 3 repeats.
- titan-to-u12t: identical across 3 repeats.

### real per-family census

Candidate-stage metrics use candidate-event denominators (generated, deduplicated, or valid as applicable). Family-local absence is one count per snapshot and is not the generation-global absence denominator.

| metric | O1_RESIDUAL_EXTREMUM_PK | O2_RESIDUAL_REGION_PK | O3_SHELF_EVIDENCE | O4_TOPOLOGY_SUBSTITUTION |
| --- | --- | --- | --- | --- |
| generated | 174 | 174 | 138 | 429 |
| semantic duplicates | 0 | 0 | 0 | 0 |
| valid | 174 | 174 | 138 | 429 |
| pre-polish beats worst admitted | 162 | 171 | 135 | 429 |
| pre-polish beats best ordinary | 0 | 66 | 0 | 54 |
| polished beats worst ordinary | 171 | 171 | 123 | 429 |
| polished beats best ordinary | 12 | 42 | 3 | 39 |
| would survive frozen beam | 15 | 72 | 15 | 66 |
| improves reference RMSE | 12 | 96 | 21 | 99 |
| improves reference maxAbs | 12 | 39 | 3 | 45 |
| improves both | 9 | 36 | 0 | 27 |
| topology-substitution wins | 0 | 0 | 0 | 39 |
| family-local absence | 0 | 0 | 3 | 18 |
| PREPOLISH_REJECTED | 12 | 3 | 3 | 0 |
| POLISH_FAILURE | 3 | 3 | 12 | 0 |
| BEAM_REJECTED | 150 | 99 | 108 | 363 |
| REFERENCE_NONIMPROVING | 3 | 30 | 12 | 27 |
| ORACLE_WIN | 6 | 39 | 3 | 39 |

### real generation-global decomposition

Denominator: 54 captured snapshot generations. `NO_STRUCTURAL_CANDIDATE` counts generations with no valid candidate across O1–O4 (0); the remaining stages are candidate-event counts (915) and therefore are not the same denominator.

- NO_STRUCTURAL_CANDIDATE=0; PREPOLISH_REJECTED=18; POLISH_FAILURE=18; BEAM_REJECTED=720; REFERENCE_NONIMPROVING=72; ORACLE_WIN=87

### real result localization

- ORACLE_WIN by family: O1_RESIDUAL_EXTREMUM_PK=6; O2_RESIDUAL_REGION_PK=39; O3_SHELF_EVIDENCE=3; O4_TOPOLOGY_SUBSTITUTION=39.
- Win locations (case/repeat/generation/phase): Titan → Mystic 8#1@g10/middle[O4_TOPOLOGY_SUBSTITUTION]; Titan → Mystic 8#1@g20/final[O2_RESIDUAL_REGION_PK, O4_TOPOLOGY_SUBSTITUTION]; Titan → Mystic 8#2@g10/middle[O4_TOPOLOGY_SUBSTITUTION]; Titan → Mystic 8#2@g20/final[O2_RESIDUAL_REGION_PK, O4_TOPOLOGY_SUBSTITUTION]; Titan → Mystic 8#3@g10/middle[O4_TOPOLOGY_SUBSTITUTION]; Titan → Mystic 8#3@g20/final[O2_RESIDUAL_REGION_PK, O4_TOPOLOGY_SUBSTITUTION]; Titan → RSV#1@g20/final[O1_RESIDUAL_EXTREMUM_PK]; Titan → RSV#2@g20/final[O1_RESIDUAL_EXTREMUM_PK]; Titan → RSV#3@g20/final[O1_RESIDUAL_EXTREMUM_PK]; Titan → Storm#1@g20/final[O4_TOPOLOGY_SUBSTITUTION]; Titan → Storm#2@g20/final[O4_TOPOLOGY_SUBSTITUTION]; Titan → Storm#3@g20/final[O4_TOPOLOGY_SUBSTITUTION]; Titan → Trio#1@g10/middle[O1_RESIDUAL_EXTREMUM_PK]; Titan → Trio#1@g20/final[O2_RESIDUAL_REGION_PK]; Titan → Trio#2@g10/middle[O1_RESIDUAL_EXTREMUM_PK]; Titan → Trio#2@g20/final[O2_RESIDUAL_REGION_PK]; Titan → Trio#3@g10/middle[O1_RESIDUAL_EXTREMUM_PK]; Titan → Trio#3@g20/final[O2_RESIDUAL_REGION_PK]; Titan → U12t#1@g10/middle[O2_RESIDUAL_REGION_PK, O3_SHELF_EVIDENCE, O4_TOPOLOGY_SUBSTITUTION]; Titan → U12t#1@g20/final[O2_RESIDUAL_REGION_PK]; Titan → U12t#2@g10/middle[O2_RESIDUAL_REGION_PK, O3_SHELF_EVIDENCE, O4_TOPOLOGY_SUBSTITUTION]; Titan → U12t#2@g20/final[O2_RESIDUAL_REGION_PK]; Titan → U12t#3@g10/middle[O2_RESIDUAL_REGION_PK, O3_SHELF_EVIDENCE, O4_TOPOLOGY_SUBSTITUTION]; Titan → U12t#3@g20/final[O2_RESIDUAL_REGION_PK].
- Pre-polish-qualified wins: 87; wins emerging only after equal-work polish: 0.
- Candidate-stage failure counts are descriptive only; the largest losing class (beam retention (720)) is not treated as an architectural bottleneck.

### synthetic trajectory sampling

| case | repeat | captured generations | terminal | adequacy |
| --- | ---: | --- | --- | --- |
| Synthetic D | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic D | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic D | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic E | 1 | 0, 10, 19 | 19 (natural-stop) | yes |
| Synthetic E | 2 | 0, 10, 19 | 19 (natural-stop) | yes |
| Synthetic E | 3 | 0, 10, 19 | 19 (natural-stop) | yes |
| Synthetic F | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic F | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic F | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic H | 1 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic H | 2 | 0, 10, 20 | 20 (deterministic-bound) | yes |
| Synthetic H | 3 | 0, 10, 20 | 20 (deterministic-bound) | yes |

### synthetic deterministic repeat identity

Repeat outputs are compared as trajectory fingerprints. Identical deterministic repeats remain protocol repeats, not independent replication evidence.

- synthetic-d-dense-known-structure: identical across 3 repeats.
- synthetic-e-high-q-valid: identical across 3 repeats.
- synthetic-f-upper-frequency-structure: identical across 3 repeats.
- synthetic-h-alternating-structure: identical across 3 repeats.

### synthetic per-family census

Candidate-stage metrics use candidate-event denominators (generated, deduplicated, or valid as applicable). Family-local absence is one count per snapshot and is not the generation-global absence denominator.

| metric | O1_RESIDUAL_EXTREMUM_PK | O2_RESIDUAL_REGION_PK | O3_SHELF_EVIDENCE | O4_TOPOLOGY_SUBSTITUTION |
| --- | --- | --- | --- | --- |
| generated | 39 | 39 | 12 | 54 |
| semantic duplicates | 0 | 12 | 0 | 9 |
| valid | 39 | 27 | 12 | 45 |
| pre-polish beats worst admitted | 33 | 27 | 6 | 45 |
| pre-polish beats best ordinary | 0 | 6 | 0 | 0 |
| polished beats worst ordinary | 39 | 24 | 6 | 45 |
| polished beats best ordinary | 12 | 3 | 0 | 0 |
| would survive frozen beam | 12 | 3 | 3 | 0 |
| improves reference RMSE | 12 | 3 | 0 | 0 |
| improves reference maxAbs | 6 | 0 | 3 | 3 |
| improves both | 6 | 0 | 0 | 0 |
| topology-substitution wins | 0 | 0 | 0 | 0 |
| family-local absence | 12 | 12 | 27 | 24 |
| PREPOLISH_REJECTED | 6 | 0 | 6 | 0 |
| POLISH_FAILURE | 0 | 3 | 0 | 0 |
| BEAM_REJECTED | 27 | 21 | 3 | 45 |
| REFERENCE_NONIMPROVING | 0 | 0 | 3 | 0 |
| ORACLE_WIN | 6 | 3 | 0 | 0 |

### synthetic generation-global decomposition

Denominator: 36 captured snapshot generations. `NO_STRUCTURAL_CANDIDATE` counts generations with no valid candidate across O1–O4 (12); the remaining stages are candidate-event counts (123) and therefore are not the same denominator.

- NO_STRUCTURAL_CANDIDATE=12; PREPOLISH_REJECTED=12; POLISH_FAILURE=3; BEAM_REJECTED=96; REFERENCE_NONIMPROVING=3; ORACLE_WIN=9

### synthetic result localization

- ORACLE_WIN by family: O1_RESIDUAL_EXTREMUM_PK=6; O2_RESIDUAL_REGION_PK=3; O3_SHELF_EVIDENCE=0; O4_TOPOLOGY_SUBSTITUTION=0.
- Win locations (case/repeat/generation/phase): Synthetic D#1@g0/first[O1_RESIDUAL_EXTREMUM_PK]; Synthetic D#2@g0/first[O1_RESIDUAL_EXTREMUM_PK]; Synthetic D#3@g0/first[O1_RESIDUAL_EXTREMUM_PK]; Synthetic H#1@g0/first[O1_RESIDUAL_EXTREMUM_PK, O2_RESIDUAL_REGION_PK]; Synthetic H#2@g0/first[O1_RESIDUAL_EXTREMUM_PK, O2_RESIDUAL_REGION_PK]; Synthetic H#3@g0/first[O1_RESIDUAL_EXTREMUM_PK, O2_RESIDUAL_REGION_PK].
- Pre-polish-qualified wins: 9; wins emerging only after equal-work polish: 0.
- Candidate-stage failure counts are descriptive only; the largest losing class (beam retention (96)) is not treated as an architectural bottleneck.

## Frozen decision rule

- Supported requires at least 2/3 development cases, 2/3 holdout cases, 4/6 overall cases, and wins in more than one repeat and generation.
- Decision: **STRUCTURAL_CANDIDATE_SIGNAL_SUPPORTED**.
- Evidence hash: `3e1dbd7ae3b13adc913b8e2c173fd59fc039fde4cce262c70ff0121d1fa73185`.

## Causal closeout (shadow-only)

- Online-feasibility gate: **ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED**; development/holdout/overall=1/3/4; distinct case×generation cells=6.
- Protocol causal classes (historical ORACLE_WIN events): ORDINARY_ALREADY_GENERATED=15; NOVEL_Q31_REJECTED=3; VISITED_DUPLICATE=0; EXACT_BEAM_REJECTED=0; REFERENCE_NONIMPROVING=0; ONLINE_FEASIBLE_ORACLE_WIN=78.
- De-duplicated deterministic causal classes (repeat 0): ORDINARY_ALREADY_GENERATED=5; NOVEL_Q31_REJECTED=1; VISITED_DUPLICATE=0; EXACT_BEAM_REJECTED=0; REFERENCE_NONIMPROVING=0; ONLINE_FEASIBLE_ORACLE_WIN=26.
- Online-feasible locations: titan-to-mystic-8@g10[O4_TOPOLOGY_SUBSTITUTION]; titan-to-mystic-8@g20[O2_RESIDUAL_REGION_PK]; titan-to-mystic-8@g20[O4_TOPOLOGY_SUBSTITUTION]; titan-to-storm@g20[O4_TOPOLOGY_SUBSTITUTION]; titan-to-trio@g20[O2_RESIDUAL_REGION_PK]; titan-to-u12t@g10[O2_RESIDUAL_REGION_PK]; titan-to-u12t@g10[O4_TOPOLOGY_SUBSTITUTION]; titan-to-u12t@g20[O2_RESIDUAL_REGION_PK].

### Protocol causal totals by oracle family

| metric | O1_RESIDUAL_EXTREMUM_PK | O2_RESIDUAL_REGION_PK | O3_SHELF_EVIDENCE | O4_TOPOLOGY_SUBSTITUTION |
| --- | --- | --- | --- | --- |
| historical ORACLE_WIN | 12 | 42 | 3 | 39 |
| ordinary-generated duplicates | 12 | 0 | 3 | 0 |
| ordinary-generated + admitted | 12 | 0 | 3 | 0 |
| ordinary-generated + not admitted | 0 | 0 | 0 | 0 |
| novel candidates | 0 | 42 | 0 | 39 |
| parent-local q31-admissible | 12 | 39 | 3 | 39 |
| visited duplicates | 0 | 0 | 0 | 0 |
| exact beam survivors | 12 | 42 | 3 | 39 |
| exact reference improvers | 12 | 42 | 3 | 39 |
| ONLINE_FEASIBLE_ORACLE_WIN | 0 | 39 | 0 | 39 |

### De-duplicated deterministic causal totals by oracle family

| metric | O1_RESIDUAL_EXTREMUM_PK | O2_RESIDUAL_REGION_PK | O3_SHELF_EVIDENCE | O4_TOPOLOGY_SUBSTITUTION |
| --- | --- | --- | --- | --- |
| historical ORACLE_WIN | 4 | 14 | 1 | 13 |
| ordinary-generated duplicates | 4 | 0 | 1 | 0 |
| ordinary-generated + admitted | 4 | 0 | 1 | 0 |
| ordinary-generated + not admitted | 0 | 0 | 0 | 0 |
| novel candidates | 0 | 14 | 0 | 13 |
| parent-local q31-admissible | 4 | 13 | 1 | 13 |
| visited duplicates | 0 | 0 | 0 | 0 |
| exact beam survivors | 4 | 14 | 1 | 13 |
| exact reference improvers | 4 | 14 | 1 | 13 |
| ONLINE_FEASIBLE_ORACLE_WIN | 0 | 13 | 0 | 13 |

- Architectural recommendation: keep the oracle shadow-only and do not start M5 or authorize online structural injection. De-duplicated useful fates are 27 novel candidates (1 q31-rejected), 5 ordinary-generated-and-admitted duplicates, and 0 ordinary-generated-but-not-admitted duplicates; no useful candidate was localized to visited, exact-beam, or reference rejection. The online gate remains ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED (1/3 development, 3/3 holdout, 4/6 overall, 6 case×generation cells).

This milestone is diagnostic/shadow only. It does not authorize an online M4/M5 search policy.
