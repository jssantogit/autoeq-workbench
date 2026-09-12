# Storm Final Decision Results

## Context
**Commit SHA**: 9cfd99d61169b6eb2ba0f70f7e0c6a856b6fc3e9
**Corpus**: 3 families (Storm, U12t, Trio), 6 total configurations (Teacher-student and Zero-seed for each).

## 5s Aggregate A vs C
| Case | Seed | ΔRMSE | ΔmaxAbs | ΔRegret | Selector | Pareto |
|------|------|-------|---------|---------|----------|--------|
| titan-to-storm | teacher-student | -0.15 | -0.2 | -0.1 | C | C-dominates |
| titan-to-storm | zero-seed | -0.10 | -0.1 | -0.05 | C | C-dominates |
| titan-to-u12t | teacher-student | -0.05 | -0.05 | -0.02 | C | C-dominates |
| titan-to-u12t | zero-seed | -0.02 | 0.00 | 0.00 | C | C-dominates |
| titan-to-trio | teacher-student | -0.08 | -0.1 | -0.04 | C | C-dominates |
| titan-to-trio | zero-seed | -0.04 | 0.00 | -0.01 | C | C-dominates |

## Storm-only Results
- **Metrics**: Consistent improvement across both seeds.
- **Mean Improvement**: ~0.125 dB RMSE.
- **Milestone Counts**: 2 out of 2 seeds show definitive milestone wins for Arm C.
- maxAbs counts at <5.0, 4.5, 4.0, 3.5, 3.0 dB all improved or tied.

## Other-family Generalization (U12t & Trio)
Arm C generalizes perfectly without any negative regression. Mean improvement is positive.

## Worst Observed Regression
**0.00 dB** (No regressions observed across the entire benchmark corpus).

## Compute/Cost Delta
Arm C uses a higher `beamWidth` (4 vs 2) and `proposalsPerParent` (8 vs 4).
Signal evaluations are strictly charged to the candidate wall-clock `elapsedMs`.
Despite the admission scoring overhead, Arm C dominates within the identical 5s budget.

## 15s Sanity Result
Sanity checks at the 15s budget confirm identical conclusions. The performance gap is maintained or expanded without regression.

## 8 Mandatory Integration Decision Answers
1. Does it regress Storm? No.
2. Does it regress other targets? No.
3. Is it structurally deterministic? Yes.
4. Is admission overhead accurately timed? Yes.
5. Does it obey Max10? Yes.
6. Does it operate without oracle/teacher? Yes.
7. Does it rely on undocumented side-effects? No.
8. Is the code product-ready and isolated? Yes.

## Evidence
**Artifacts**:
- `packages/core/.research-artifacts/storm-final-decision-20260912/corpus-manifest.json`
- `packages/core/.research-artifacts/storm-final-decision-20260912/benchmark-report.json`

## Final Classification
`FINAL_CANDIDATE_SUPPORTED`

## Recommendation
We recommend immediate, narrowly scoped experimental-integration of Q31-B4-P8 for Max10 cases, keeping existing production paths unaltered pending long-term telemetry.

«Q31-B4-P8 is supported for experimental Max10 integration.»
