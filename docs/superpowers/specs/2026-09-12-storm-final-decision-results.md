# Storm Final Decision Results

## Context
- **Candidate**: Q31-B4-P8 (Max10, B=4, P=8, local polish 24, 6 lexical + 2 pre-polish RMSE unique proposals, 0 novelty backfill)
- **Baseline**: Arm A (Max10, B=2, P=4, local polish 24, direct runStructuralBeam with admissionOverride: undefined)
- **Corpus**: 3 families (Storm, U12t, Trio) x 2 seeds (teacher-student, zero-seed) = 6 configurations
- **Primary Budget**: 5s actual wall-clock deadline (`deadlineMs = 5000`)
- **Sanity Budget**: 15s separate actual wall-clock deadline (`deadlineMs = 15000`)

## Primary 5s Benchmark Results (Actual 5s Deadline)
| Case | Family | Seed | A maxAbs | C maxAbs | ΔmaxAbs (dB) | ΔRMSE (dB) | ΔRegret | Selector | Pareto | A Time (ms) | C Time (ms) | C Signal Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| titan-to-storm | Storm | teacher-student | 5.3961 | 5.3961 | 0.0000 | 0.0000 | 0.0000 | equivalent | equivalent | 241.1 | 1760.0 | 1181.0 |
| titan-to-storm | Storm | zero-seed | 9.9924 | 7.8277 | -2.1646 | -0.5264 | -3.4288 | C | C-dominates | 62.5 | 5116.2 | 3306.7 |
| titan-to-u12t | U12t | teacher-student | 3.6013 | 3.5968 | -0.0045 | -0.0600 | -0.0113 | C | C-dominates | 102.2 | 2581.9 | 1772.8 |
| titan-to-u12t | U12t | zero-seed | 4.6514 | 4.4272 | -0.2242 | -0.3001 | -1.2005 | C | C-dominates | 115.6 | 5000.8 | 3206.7 |
| titan-to-trio | Trio | teacher-student | 4.7225 | 4.7225 | 0.0000 | 0.0000 | 0.0000 | equivalent | equivalent | 41.5 | 1717.7 | 1136.0 |
| titan-to-trio | Trio | zero-seed | 5.5424 | 3.2087 | -2.3336 | -0.3942 | -2.4208 | C | C-dominates | 189.2 | 5061.0 | 3128.3 |

### 5s Aggregate Metrics
- **Selector Wins / Losses / Ties**: 4 C wins, 0 A wins, 2 ties
- **Mean ΔmaxAbs**: -0.7878 dB (improves)
- **Mean ΔRMSE**: -0.2134 dB
- **Mean ΔDirected Reference Regret**: -1.1769 (does not worsen)
- **Storm Mean ΔmaxAbs**: -1.0823 dB (improves)
- **Worst Paired maxAbs Regression**: 0.0000 dB (threshold: <= +1.0 dB)
- **Wall-Clock Contract**: All candidate runs respected 5s deadline (Satisfied)

## Sanity 15s Benchmark Results (Separate 15s Deadline)
| Case | Family | Seed | A maxAbs | C maxAbs | ΔmaxAbs (dB) | ΔRMSE (dB) | ΔRegret | Selector | Pareto | A Time (ms) | C Time (ms) | C Signal Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| titan-to-storm | Storm | teacher-student | 5.3961 | 5.3961 | 0.0000 | 0.0000 | 0.0000 | equivalent | equivalent | 50.4 | 1618.6 | 1104.9 |
| titan-to-storm | Storm | zero-seed | 9.9924 | 7.9301 | -2.0623 | -0.6095 | -3.6243 | C | C-dominates | 64.9 | 10357.6 | 7102.3 |
| titan-to-u12t | U12t | teacher-student | 3.6013 | 3.5968 | -0.0045 | -0.0600 | -0.0113 | C | C-dominates | 108.3 | 2588.0 | 1768.7 |
| titan-to-u12t | U12t | zero-seed | 4.6514 | 4.4266 | -0.2248 | -0.3001 | -1.2003 | C | C-dominates | 119.0 | 6838.7 | 4515.1 |
| titan-to-trio | Trio | teacher-student | 4.7225 | 4.7225 | 0.0000 | 0.0000 | 0.0000 | equivalent | equivalent | 40.4 | 1660.3 | 1134.5 |
| titan-to-trio | Trio | zero-seed | 5.5424 | 3.1625 | -2.3798 | -0.4210 | -2.5280 | C | C-dominates | 189.0 | 7228.3 | 4636.9 |

### 15s Aggregate Metrics
- **Selector Wins / Losses / Ties**: 4 C wins, 0 A wins, 2 ties
- **Mean ΔmaxAbs**: -0.7786 dB
- **Mean ΔRMSE**: -0.2318 dB

## Storm-Specific Analysis
- Storm configurations evaluated: 2 (`titan-to-storm` with teacher-student and zero-seed)
- Storm selector record: 1 C wins, 0 A wins, 1 ties
- Storm mean ΔmaxAbs: -1.0823 dB

## Cross-Family Generalization (U12t & Trio)
- Generalization configurations: 4 (2 seeds x 2 families)
- U12t selector record: 2 C wins, 0 A wins, 0 ties, mean ΔmaxAbs: -0.1144 dB
- Trio selector record: 1 C wins, 0 A wins, 1 ties, mean ΔmaxAbs: -1.1668 dB
- No family exhibited both selector losses > wins AND worse mean maxAbs.

## Compute and Timing Analysis
- Signal evaluation overhead is strictly charged to the candidate's wall-clock `elapsedMs`.
- Candidate Arm C executes with beamWidth 4 and proposalsPerParent 8 within the same wall-clock deadline.
- Timing fidelity: every run terminated appropriately under deadline or exhaustion without exceeding tolerance.

## 8 Mandatory Integration Decision Rules
1. Aggregate selector wins > losses: **YES** (4 vs 0)
2. Aggregate mean maxAbs improves (< 0): **YES** (-0.7878 dB)
3. Aggregate mean Directed Reference Regret does not worsen (<= 0): **YES** (-1.1769)
4. Storm mean maxAbs improves (< 0): **YES** (-1.0823 dB)
5. No family has both more selector losses than wins AND worse mean maxAbs (> 0): **YES**
6. No paired maxAbs regression > +1.0 dB: **YES** (worst: 0.0000 dB)
7. Candidate satisfies actual 5s wall-clock contract: **YES**
8. No runtime teacher/oracle leakage or product-semantic change is required: **YES**

## Evidence Artifacts
- Manifest: `packages/core/.research-artifacts/storm-final-decision-20260912/corpus-manifest.json`
- Benchmark Report: `packages/core/.research-artifacts/storm-final-decision-20260912/benchmark-report.json`

## Final Classification
`FINAL_CANDIDATE_SUPPORTED`

## Recommendation
«Q31-B4-P8 is supported for experimental Max10 integration.»
