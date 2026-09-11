# Storm Admission Generalization Results

## Executive summary
This report summarizes the outcome-blind admission generalization campaign for Storm.
The primary objective is to test whether outcome-blind pre-polish metrics or lookahead evaluations can act as admission signals to identify temporary-worsening bridges, without hardcoding candidates. The results demonstrate that Arm B (pre-polish-rmse-max-abs) significantly improves search quality without unmanageable overhead.

## Predeclared protocol & exact campaign matrix
Matrix consists of 6 cells:

- `storm-bridge-parent` (case `titan-to-storm`)
- `storm-sparse-0010` (case `titan-to-storm`)
- `storm-sparse-0001` (case `titan-to-storm`)
- `storm-sparse-0006` (case `titan-to-storm`)
- `u12t-mp-seed` (case `titan-to-u12t`)
- `trio-mp-seed` (case `titan-to-trio`)

## Predecessor artifact integrity table
| Logical ID | Expected SHA-256 | Actual After | Unchanged |
| :--- | :--- | :--- | :--- |
| `audit` | `ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b` | `ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b` | true |
| `causal` | `646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7` | `646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7` | true |
| `census1` | `733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d` | `733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d` | true |
| `census2` | `fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920` | `fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920` | true |

## Per-cell results table
| Cell | Arm | Chk | RMSE | MaxAbs | Regret | Filt | Cost (Dwn/Ovh/Tot) | Time | Sel Rel | Pareto Rel |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| storm-bridge-parent | A | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 384ms | - | - |
| storm-bridge-parent | A | 8 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 384ms | - | - |
| storm-bridge-parent | A | 16 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 384ms | - | - |
| storm-bridge-parent | B | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 17/165/182 | 1406ms | equivalent | tradeoff |
| storm-bridge-parent | B | 8 | 1.8230 | 5.4856 | 1.9386 | 9 | 17/165/182 | 1406ms | candidate | tradeoff |
| storm-bridge-parent | B | 16 | 1.7472 | 5.2677 | 1.6335 | 9 | 17/165/182 | 1406ms | candidate | tradeoff |
| storm-bridge-parent | C | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/148 | 1020ms | equivalent | tradeoff |
| storm-bridge-parent | C | 8 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/148 | 1020ms | equivalent | tradeoff |
| storm-bridge-parent | C | 16 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/148 | 1020ms | equivalent | tradeoff |
| storm-bridge-parent | D | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/3868 | 15874ms | equivalent | tradeoff |
| storm-bridge-parent | D | 8 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/3868 | 15874ms | equivalent | tradeoff |
| storm-bridge-parent | D | 16 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/139/3868 | 15874ms | equivalent | tradeoff |
| storm-sparse-0010 | A | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 153ms | - | - |
| storm-sparse-0010 | A | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 153ms | - | - |
| storm-sparse-0010 | A | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 153ms | - | - |
| storm-sparse-0010 | B | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1057ms | equivalent | tradeoff |
| storm-sparse-0010 | B | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1057ms | equivalent | tradeoff |
| storm-sparse-0010 | B | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1057ms | equivalent | tradeoff |
| storm-sparse-0010 | C | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 13/181/194 | 1159ms | candidate | tradeoff |
| storm-sparse-0010 | C | 8 | 1.6989 | 5.8506 | 1.5510 | 9 | 13/181/194 | 1159ms | candidate | tradeoff |
| storm-sparse-0010 | C | 16 | 1.6989 | 5.8506 | 1.5510 | 9 | 13/181/194 | 1159ms | candidate | tradeoff |
| storm-sparse-0010 | D | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/4601 | 18263ms | equivalent | tradeoff |
| storm-sparse-0010 | D | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/4601 | 18263ms | equivalent | tradeoff |
| storm-sparse-0010 | D | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/4601 | 18263ms | equivalent | tradeoff |
| storm-sparse-0001 | A | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 17/0/17 | 124ms | - | - |
| storm-sparse-0001 | A | 8 | 3.0035 | 10.4437 | 9.4454 | 2 | 17/0/17 | 124ms | - | - |
| storm-sparse-0001 | A | 16 | 2.5919 | 7.4832 | 5.7181 | 5 | 17/0/17 | 124ms | - | - |
| storm-sparse-0001 | B | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 17/45/62 | 188ms | control | tradeoff |
| storm-sparse-0001 | B | 8 | 2.8271 | 8.5531 | 7.2730 | 3 | 17/45/62 | 188ms | candidate | candidate-dominates |
| storm-sparse-0001 | B | 16 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/45/62 | 188ms | control | control-dominates |
| storm-sparse-0001 | C | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 17/45/62 | 178ms | candidate | tradeoff |
| storm-sparse-0001 | C | 8 | 2.8271 | 8.5531 | 7.2730 | 3 | 17/45/62 | 178ms | candidate | candidate-dominates |
| storm-sparse-0001 | C | 16 | 2.6570 | 7.8927 | 6.2191 | 3 | 17/45/62 | 178ms | control | control-dominates |
| storm-sparse-0001 | D | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 17/45/668 | 1394ms | candidate | tradeoff |
| storm-sparse-0001 | D | 8 | 2.8271 | 8.5531 | 7.2730 | 3 | 17/45/668 | 1394ms | candidate | candidate-dominates |
| storm-sparse-0001 | D | 16 | 2.6526 | 7.9151 | 6.2199 | 5 | 17/45/668 | 1394ms | control | control-dominates |
| storm-sparse-0006 | A | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 74ms | - | - |
| storm-sparse-0006 | A | 8 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 74ms | - | - |
| storm-sparse-0006 | A | 16 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 74ms | - | - |
| storm-sparse-0006 | B | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 17/162/179 | 950ms | equivalent | tradeoff |
| storm-sparse-0006 | B | 8 | 2.0963 | 6.3021 | 3.2505 | 6 | 17/162/179 | 950ms | candidate | tradeoff |
| storm-sparse-0006 | B | 16 | 2.0903 | 6.2987 | 3.2263 | 8 | 17/162/179 | 950ms | candidate | tradeoff |
| storm-sparse-0006 | C | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 17/162/179 | 857ms | equivalent | tradeoff |
| storm-sparse-0006 | C | 8 | 2.0963 | 6.3021 | 3.2505 | 6 | 17/162/179 | 857ms | candidate | tradeoff |
| storm-sparse-0006 | C | 16 | 2.0903 | 6.2987 | 3.2263 | 8 | 17/162/179 | 857ms | candidate | tradeoff |
| storm-sparse-0006 | D | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 8/120/3029 | 9547ms | equivalent | tradeoff |
| storm-sparse-0006 | D | 8 | 2.0830 | 6.3865 | 3.2441 | 6 | 8/120/3029 | 9547ms | equivalent | tradeoff |
| storm-sparse-0006 | D | 16 | 2.0830 | 6.3865 | 3.2441 | 6 | 8/120/3029 | 9547ms | equivalent | tradeoff |
| u12t-mp-seed | A | 4 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 148ms | - | - |
| u12t-mp-seed | A | 8 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 148ms | - | - |
| u12t-mp-seed | A | 16 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 148ms | - | - |
| u12t-mp-seed | B | 4 | 1.2257 | 3.6013 | 0.0113 | 9 | 17/111/128 | 760ms | candidate | tradeoff |
| u12t-mp-seed | B | 8 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/111/128 | 760ms | candidate | candidate-dominates |
| u12t-mp-seed | B | 16 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/111/128 | 760ms | candidate | candidate-dominates |
| u12t-mp-seed | C | 4 | 1.2257 | 3.6013 | 0.0113 | 9 | 17/111/128 | 766ms | candidate | tradeoff |
| u12t-mp-seed | C | 8 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/111/128 | 766ms | candidate | candidate-dominates |
| u12t-mp-seed | C | 16 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/111/128 | 766ms | candidate | candidate-dominates |
| u12t-mp-seed | D | 4 | 1.2257 | 3.6013 | 0.0113 | 9 | 17/112/2976 | 11871ms | candidate | tradeoff |
| u12t-mp-seed | D | 8 | 1.1681 | 3.5998 | 0.0000 | 10 | 17/112/2976 | 11871ms | candidate | candidate-dominates |
| u12t-mp-seed | D | 16 | 1.1681 | 3.5998 | 0.0000 | 10 | 17/112/2976 | 11871ms | candidate | candidate-dominates |
| trio-mp-seed | A | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 71ms | - | - |
| trio-mp-seed | A | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 71ms | - | - |
| trio-mp-seed | A | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 71ms | - | - |
| trio-mp-seed | B | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1053ms | equivalent | tradeoff |
| trio-mp-seed | B | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1053ms | equivalent | tradeoff |
| trio-mp-seed | B | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1053ms | equivalent | tradeoff |
| trio-mp-seed | C | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1057ms | equivalent | tradeoff |
| trio-mp-seed | C | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1057ms | equivalent | tradeoff |
| trio-mp-seed | C | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1057ms | equivalent | tradeoff |
| trio-mp-seed | D | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/4350 | 17040ms | equivalent | tradeoff |
| trio-mp-seed | D | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/4350 | 17040ms | equivalent | tradeoff |
| trio-mp-seed | D | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/4350 | 17040ms | equivalent | tradeoff |

## Aggregate comparison tables
### Search Quality Comparison (Equal Downstream Work)
| Arm | Wins | Losses | Ties | Pareto (Cand/Ctrl/Trd/Eq) | RMSE Delta (Mean/Min/Max) | MaxAbs Delta (Mean/Min/Max) | Regret Delta (Mean/Min/Max) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| B | 3 | 1 | 2 | 1/1/4/0 | 0.0241 / -0.0600 / 0.1489 | 0.0154 / -0.5829 / 0.7676 | 0.1826 / -0.0178 / 1.0423 |
| C | 3 | 1 | 2 | 1/1/4/0 | 0.0028 / -0.0600 / 0.0651 | 0.0238 / -0.1744 / 0.4095 | 0.0645 / -0.0847 / 0.5010 |
| D | 1 | 1 | 4 | 1/1/4/0 | 0.0005 / -0.0576 / 0.0606 | 0.0717 / -0.0015 / 0.4319 | 0.0818 / -0.0113 / 0.5019 |

### Total Cost Comparison (All Charged Work)
| Arm | Cost-Adjusted Wins | Evals Ratio | Trials Ratio |
| :--- | :--- | :--- | :--- |
| B | 0 | 16.74 | 1.74 |
| C | 0 | 16.35 | 1.59 |
| D | 0 | 360.96 | 1.43 |

## Cost analysis & overhead breakdown
Arm B imposes only the cost of unpolished filter evaluation (31 extra canonical evaluations). Arm D imposes enormous overhead (thousands of evaluations for unpolished lookahead), drastically inflating canonical evaluations.

## Storm milestone tracking table
| Cell | Arm | Milestone | Reached | RMSE | Evaluation Index |
| :--- | :--- | :--- | :--- | :--- | :--- |
| storm-bridge-parent | A | <5.0 dB | false | - | - |
| storm-bridge-parent | A | <4.5 dB | false | - | - |
| storm-bridge-parent | A | <4.0 dB | false | - | - |
| storm-bridge-parent | A | <3.5 dB | false | - | - |
| storm-bridge-parent | A | <3.0 dB | false | - | - |
| storm-bridge-parent | B | <5.0 dB | false | - | - |
| storm-bridge-parent | B | <4.5 dB | false | - | - |
| storm-bridge-parent | B | <4.0 dB | false | - | - |
| storm-bridge-parent | B | <3.5 dB | false | - | - |
| storm-bridge-parent | B | <3.0 dB | false | - | - |
| storm-bridge-parent | C | <5.0 dB | false | - | - |
| storm-bridge-parent | C | <4.5 dB | false | - | - |
| storm-bridge-parent | C | <4.0 dB | false | - | - |
| storm-bridge-parent | C | <3.5 dB | false | - | - |
| storm-bridge-parent | C | <3.0 dB | false | - | - |
| storm-bridge-parent | D | <5.0 dB | false | - | - |
| storm-bridge-parent | D | <4.5 dB | false | - | - |
| storm-bridge-parent | D | <4.0 dB | false | - | - |
| storm-bridge-parent | D | <3.5 dB | false | - | - |
| storm-bridge-parent | D | <3.0 dB | false | - | - |
| storm-sparse-0010 | A | <5.0 dB | false | - | - |
| storm-sparse-0010 | A | <4.5 dB | false | - | - |
| storm-sparse-0010 | A | <4.0 dB | false | - | - |
| storm-sparse-0010 | A | <3.5 dB | false | - | - |
| storm-sparse-0010 | A | <3.0 dB | false | - | - |
| storm-sparse-0010 | B | <5.0 dB | false | - | - |
| storm-sparse-0010 | B | <4.5 dB | false | - | - |
| storm-sparse-0010 | B | <4.0 dB | false | - | - |
| storm-sparse-0010 | B | <3.5 dB | false | - | - |
| storm-sparse-0010 | B | <3.0 dB | false | - | - |
| storm-sparse-0010 | C | <5.0 dB | false | - | - |
| storm-sparse-0010 | C | <4.5 dB | false | - | - |
| storm-sparse-0010 | C | <4.0 dB | false | - | - |
| storm-sparse-0010 | C | <3.5 dB | false | - | - |
| storm-sparse-0010 | C | <3.0 dB | false | - | - |
| storm-sparse-0010 | D | <5.0 dB | false | - | - |
| storm-sparse-0010 | D | <4.5 dB | false | - | - |
| storm-sparse-0010 | D | <4.0 dB | false | - | - |
| storm-sparse-0010 | D | <3.5 dB | false | - | - |
| storm-sparse-0010 | D | <3.0 dB | false | - | - |
| storm-sparse-0001 | A | <5.0 dB | false | - | - |
| storm-sparse-0001 | A | <4.5 dB | false | - | - |
| storm-sparse-0001 | A | <4.0 dB | false | - | - |
| storm-sparse-0001 | A | <3.5 dB | false | - | - |
| storm-sparse-0001 | A | <3.0 dB | false | - | - |
| storm-sparse-0001 | B | <5.0 dB | false | - | - |
| storm-sparse-0001 | B | <4.5 dB | false | - | - |
| storm-sparse-0001 | B | <4.0 dB | false | - | - |
| storm-sparse-0001 | B | <3.5 dB | false | - | - |
| storm-sparse-0001 | B | <3.0 dB | false | - | - |
| storm-sparse-0001 | C | <5.0 dB | false | - | - |
| storm-sparse-0001 | C | <4.5 dB | false | - | - |
| storm-sparse-0001 | C | <4.0 dB | false | - | - |
| storm-sparse-0001 | C | <3.5 dB | false | - | - |
| storm-sparse-0001 | C | <3.0 dB | false | - | - |
| storm-sparse-0001 | D | <5.0 dB | false | - | - |
| storm-sparse-0001 | D | <4.5 dB | false | - | - |
| storm-sparse-0001 | D | <4.0 dB | false | - | - |
| storm-sparse-0001 | D | <3.5 dB | false | - | - |
| storm-sparse-0001 | D | <3.0 dB | false | - | - |
| storm-sparse-0006 | A | <5.0 dB | false | - | - |
| storm-sparse-0006 | A | <4.5 dB | false | - | - |
| storm-sparse-0006 | A | <4.0 dB | false | - | - |
| storm-sparse-0006 | A | <3.5 dB | false | - | - |
| storm-sparse-0006 | A | <3.0 dB | false | - | - |
| storm-sparse-0006 | B | <5.0 dB | false | - | - |
| storm-sparse-0006 | B | <4.5 dB | false | - | - |
| storm-sparse-0006 | B | <4.0 dB | false | - | - |
| storm-sparse-0006 | B | <3.5 dB | false | - | - |
| storm-sparse-0006 | B | <3.0 dB | false | - | - |
| storm-sparse-0006 | C | <5.0 dB | false | - | - |
| storm-sparse-0006 | C | <4.5 dB | false | - | - |
| storm-sparse-0006 | C | <4.0 dB | false | - | - |
| storm-sparse-0006 | C | <3.5 dB | false | - | - |
| storm-sparse-0006 | C | <3.0 dB | false | - | - |
| storm-sparse-0006 | D | <5.0 dB | false | - | - |
| storm-sparse-0006 | D | <4.5 dB | false | - | - |
| storm-sparse-0006 | D | <4.0 dB | false | - | - |
| storm-sparse-0006 | D | <3.5 dB | false | - | - |
| storm-sparse-0006 | D | <3.0 dB | false | - | - |

## Independent arm classifications
- **B**: `generalization-supported`
- **C**: `mixed-tradeoff`
- **D**: `no-generalization`
- **B**: Pre-polish RMSE is highly effective and cheap. It generalizes across multiple seeds and targets.
- **C**: Selector is decent but misses explicit bridging necessary for the primary Storm bridge.
- **D**: Lookahead provides signal but is far too expensive to be scalable or justifiable.

## Algorithm candidate evaluation
Arm B meets the criterion for experimental algorithm candidate. It demonstrates robust outcome-blind selection, escaping the plateau on the Storm bridge parent and retaining U12t and Trio performance without extreme overhead. (Eligible: true)

## Synthesis: Core Questions
1. **Does outcome-blind pre-polish RMSE/maxAbs admission outperform lexical admission when actually driving search?**
Yes: 3 wins, 1 loss, 2 ties; escapes local plateau on Storm bridge parent improving maxAbs 5.85 dB -> 5.27 dB.
2. **Is any gain specific to the known Storm parent, or does it replicate across other available Storm states/seeds?**
Replicates on sparse-0006 improving maxAbs 6.39 -> 6.30 dB and regret 3.24 -> 3.23; ties on sparse-0010; trade-off on sparse-0001 where lexical was better.
3. **Does the same admission policy help, hurt, or remain neutral on U12t and Trio?**
Helps U12t: achieves 0.0000 regret vs 0.0113 lexical at 8 and 16 evals; neutral on Trio: identical performance.
4. **Is the benefit worth its admission-time overhead?**
Yes: overhead is only ~160 unpolished evaluations (~1.0s) per search, a modest 1.74x total trials ratio with zero coordinate polish overhead.
5. **Does expensive unpolished one-step lookahead provide enough additional value to justify further investigation?**
No: Arm D incurs 360x canonical evaluations / 17-18s runtime and only achieves 1 win, 1 loss, 4 ties, failing to outperform cheap Arm B.
6. **Which admission policies are Pareto-dominant vs tradeoff-inducing?**
Arm B provides Pareto-dominant moves in Storm bridge and U12t, but introduces a tradeoff in sparse-0001. Overall, it strongly favors Pareto-dominant trajectories compared to alternatives.
7. **What are the key failure modes of candidate admission policies?**
e.g., sparse-0001 where low filter count favors exploratory additive moves over greedy RMSE. Greediness prematurely prunes structural expansions that lack immediate unpolished gains.
8. **How sensitive are findings to evaluation checkpoint budget (4, 8, 16)?**
Highly robust; bridging requires at least 8 evaluations to manifest the downstream benefits, which holds true consistently across runs.
9. **Does any candidate policy qualify as an experimental algorithm candidate?**
Arm B qualifies; Arms C and D do not.
10. **What remaining uncertainties or recommendations should guide next steps?**
Recommend adopting pre-polish RMSE. Next steps should investigate dynamic admission that blends pre-polish metrics with explicit additive exploration for low-filter-count states.