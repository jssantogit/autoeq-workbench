# Storm Bridge Detectability Audit Results

Version: storm-bridge-detectability-audit-v1 (schema 1)  
Case: titan-to-storm; primary=matching-pursuit-v1:titan-to-storm:0:sparse-0010  
Classification: **bridge-signal-supported**  
Producer commit: b1faad6231afb30f6567b8738ec05b61eace840d  

## Executive summary

This audit resolves the primary research question: *«Can an admission-time signal rank at least one genuinely bridge-capable intermediate into the normal top-4 budget without oracle knowledge?»*

The answer is **affirmative** (classification: **bridge-signal-supported**). Intermediate rank 16 (split mutation), causally validated in the single-blocker experiment, is identified and admitted into the top-4 budget by cheap, outcome-blind signals operating strictly prior to downstream two-hop evaluations.

- **Direct cheap admission**: `pre-polish-rmse-max-abs` ranks intermediate 16 at **rank 2** into top-4 `[14, 16, 15, 21]`, achieving **100% (1/1) primary recall@4** at zero coordinate trials.
- **Lookahead continuation signal**: `cheap-next-step-lookahead` ranks intermediate 16 at **rank 1** into top-4 `[16, 14, 15, 21]`, achieving **100% (1/1) primary recall@4** at zero coordinate trials.
- **Lexical baseline failure**: Default lexical ordering ranks intermediate 16 at rank 16 (top-4: `[1, 2, 3, 4]`), achieving 0% primary recall.
- **Partial refinement probes**: 2-trial and 6-trial coordinate probes rank intermediate 16 at rank 6, missing top-4 without direct RMSE prioritization.

## Experiment design & frozen inputs

- Candidate set: Exactly 31 hop-1 intermediates from accepted two-hop census.
- Frozen parent: `matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004`
- Parent canonical metrics: RMSE 1.698935, maxAbs 5.850643, regret 1.550990, filterCount 9.
- Primary positive label definition: Intermediates satisfying (1) does not itself beat parent/B-best; (2) has useful grandchild; (3) retained by beam (rank <= 2); (4) reaches grandchild under normal downstream mechanics (grandchild lexical rank <= 4). Primary positive set: `[16]`.
- Secondary positive label definition: Intermediates with >= 1 grandchild beating parent: `[1, 11, 12, 16, 25]`.

## Predecessor artifact verification

- `packages/core/.research-artifacts/storm-single-blocker-bridge-causal-20260911/sparse-0010/experiment-report.json`: before=646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7; after=646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7; unchanged=true.
- `packages/core/.research-artifacts/storm-two-hop-reachability-census-20260910/sparse-0010/census-report.json`: before=733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d; after=733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d; unchanged=true.
- `packages/core/.research-artifacts/storm-post-initial-admission-census-20260910/sparse-0010/census-report.json`: before=fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920; after=fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920; unchanged=true.
- Audit artifact SHA-256: `ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b`

## Signal definitions & explicit cost accounting

| Signal ID | Description | Canonical Evals | Coordinate Trials | Structural Enums | Total Work Summary |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `lexical` | Baseline structural proposal ordering (ranks 1..31). | 0 | 0 | 0 | 0 canonical evals, 0 coordinate trials, 0 structural enumerations |
| `pre-polish-frozen-selector` | Score each candidate using canonical pre-polish deliverable metrics evaluated through reference-selector-v1 key (hypot distance to target), tie-breaking by lexical rank. | 31 | 0 | 0 | 31 canonical pre-polish evaluations, 0 coordinate trials |
| `pre-polish-rmse-max-abs` | Canonical pre-polish metrics sorted by RMSE, then maxAbs, then filterCount, then cancellationScore, then lexical rank. | 31 | 0 | 0 | 31 canonical pre-polish evaluations, 0 coordinate trials |
| `continuation-count` | Deterministic structural degrees of freedom: count of legal next mutations generable from the unpolished candidate structure, tie-breaking by pre-polish-frozen-selector then lexical rank. | 0 | 0 | 31 | 31 structural proposal enumerations, 0 coordinate trials |
| `continuation-diversity` | Count of distinct legal mutation types generable from the candidate structure, tie-breaking by pre-polish-frozen-selector then lexical rank. | 0 | 0 | 31 | 31 structural proposal enumerations, 0 coordinate trials |
| `partial-refinement-2` | Low-cost probe: 2 coordinate trials through polishStructuralProposal, quantized with standard-v2, ranked with reference-selector-v1, tie-breaking by lexical rank. | 31 | 62 | 0 | 31 canonical evaluations, 62 coordinate trials |
| `partial-refinement-6` | Low-cost probe: 6 coordinate trials through polishStructuralProposal, quantized with standard-v2, ranked with reference-selector-v1, tie-breaking by lexical rank. | 31 | 186 | 0 | 31 canonical evaluations, 186 coordinate trials |
| `cheap-next-step-lookahead` | Enumerate hop-2 structural proposals for each candidate, evaluate unpolished canonical deliverable metrics (0 coordinate trials!), score candidate by best unpolished grandchild selector key, tie-breaking by candidate pre-polish selector then lexical rank. | 816 | 0 | 31 | 31 unpolished structural enumerations + 816 unpolished canonical evaluations, 0 coordinate trials |

## Summary of all 8 audited signals

| Signal | Top-4 | Rank of 16 | 16 in Top-4? | Primary Recall@4 | Two-Hop Recall@4 | Overlap Lexical | Overlap Selector | Cost |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `lexical` | [1, 2, 3, 4] | 16 | no | 0/1 (0%) | 1/5 (20%) | 4/4 | 0/4 | 0 canonical evals, 0 coordinate trials, 0 structural enumerations |
| `pre-polish-frozen-selector` | [14, 15, 21, 22] | 6 | no | 0/1 (0%) | 0/5 (0%) | 0/4 | 4/4 | 31 canonical pre-polish evaluations, 0 coordinate trials |
| `pre-polish-rmse-max-abs` | [14, 16, 15, 21] | 2 | **YES** | 1/1 (100%) | 1/5 (20%) | 0/4 | 3/4 | 31 canonical pre-polish evaluations, 0 coordinate trials |
| `continuation-count` | [23, 26, 29, 27] | 27 | no | 0/1 (0%) | 0/5 (0%) | 0/4 | 0/4 | 31 structural proposal enumerations, 0 coordinate trials |
| `continuation-diversity` | [13, 12, 9, 7] | 25 | no | 0/1 (0%) | 1/5 (20%) | 0/4 | 0/4 | 31 structural proposal enumerations, 0 coordinate trials |
| `partial-refinement-2` | [14, 15, 21, 22] | 6 | no | 0/1 (0%) | 0/5 (0%) | 0/4 | 4/4 | 31 canonical evaluations, 62 coordinate trials |
| `partial-refinement-6` | [14, 15, 21, 22] | 6 | no | 0/1 (0%) | 0/5 (0%) | 0/4 | 4/4 | 31 canonical evaluations, 186 coordinate trials |
| `cheap-next-step-lookahead` | [16, 14, 15, 21] | 1 | **YES** | 1/1 (100%) | 1/5 (20%) | 0/4 | 3/4 | 31 unpolished structural enumerations + 816 unpolished canonical evaluations, 0 coordinate trials |

## Complete ranking matrix (all 31 intermediates)

| Cand | Mutation | Lexical | PrePolSel | PrePolRmse | ContCount | ContDiv | PartRef2 | PartRef6 | Lookahead | PrimaryPos | TwoHopUseful |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | add-hs | 1 | 21 | 23 | 30 | 30 | 21 | 21 | 22 | no | YES |
| 2 | add-ls | 2 | 24 | 26 | 31 | 31 | 24 | 24 | 13 | no | no |
| 3 | add-pk | 3 | 20 | 20 | 24 | 29 | 20 | 20 | 16 | no | no |
| 4 | merge | 4 | 10 | 12 | 18 | 16 | 10 | 10 | 11 | no | no |
| 5 | remove | 5 | 9 | 10 | 17 | 15 | 9 | 9 | 9 | no | no |
| 6 | remove | 6 | 18 | 17 | 19 | 18 | 18 | 18 | 23 | no | no |
| 7 | remove | 7 | 14 | 11 | 13 | 4 | 14 | 14 | 18 | no | no |
| 8 | remove | 8 | 19 | 14 | 15 | 6 | 19 | 19 | 29 | no | no |
| 9 | remove | 9 | 13 | 13 | 12 | 3 | 13 | 13 | 20 | no | no |
| 10 | remove | 10 | 26 | 21 | 16 | 9 | 26 | 27 | 30 | no | no |
| 11 | remove | 11 | 15 | 18 | 14 | 5 | 15 | 15 | 15 | no | YES |
| 12 | remove | 12 | 12 | 16 | 11 | 2 | 12 | 12 | 10 | no | YES |
| 13 | remove | 13 | 11 | 15 | 10 | 1 | 11 | 11 | 14 | no | no |
| 14 | split | 14 | 1 | 1 | 21 | 20 | 1 | 1 | 2 | no | no |
| 15 | split | 15 | 2 | 3 | 25 | 21 | 2 | 2 | 3 | no | no |
| 16 | split | 16 | 6 | 2 | 27 | 25 | 6 | 6 | 1 | **YES** | YES |
| 17 | split | 17 | 16 | 9 | 29 | 28 | 16 | 16 | 25 | no | no |
| 18 | split | 18 | 5 | 6 | 26 | 24 | 5 | 5 | 5 | no | no |
| 19 | split | 19 | 8 | 8 | 23 | 27 | 8 | 8 | 7 | no | no |
| 20 | split | 20 | 7 | 7 | 28 | 26 | 7 | 7 | 6 | no | no |
| 21 | split | 21 | 3 | 4 | 22 | 22 | 3 | 3 | 4 | no | no |
| 22 | split | 22 | 4 | 5 | 20 | 23 | 4 | 4 | 8 | no | no |
| 23 | type-mutation | 23 | 23 | 24 | 1 | 7 | 23 | 23 | 12 | no | no |
| 24 | type-mutation | 24 | 22 | 22 | 9 | 19 | 22 | 22 | 27 | no | no |
| 25 | type-mutation | 25 | 17 | 19 | 8 | 17 | 17 | 17 | 26 | no | YES |
| 26 | type-mutation | 26 | 25 | 25 | 2 | 8 | 25 | 25 | 17 | no | no |
| 27 | type-mutation | 27 | 28 | 28 | 4 | 11 | 28 | 28 | 24 | no | no |
| 28 | type-mutation | 28 | 31 | 31 | 7 | 14 | 31 | 31 | 31 | no | no |
| 29 | type-mutation | 29 | 27 | 27 | 3 | 10 | 27 | 26 | 19 | no | no |
| 30 | type-mutation | 30 | 29 | 29 | 5 | 12 | 29 | 29 | 28 | no | no |
| 31 | type-mutation | 31 | 30 | 30 | 6 | 13 | 30 | 30 | 21 | no | no |

## Classification & interpretation

Classification: **bridge-signal-supported**

Rationale: pre-polish-rmse-max-abs (a cheap direct outcome-blind signal available before polish at 0 coordinate trials) ranks intermediate 16 at rank 2 into top-4 and improves primary recall@4 from 0/1 to 1/1. Furthermore, cheap-next-step-lookahead (an unpolished continuation signal at 0 coordinate trials) ranks intermediate 16 at rank 1 into top-4.

### Primary findings
- The causally validated temporary-worsening bridge (intermediate rank 16 / split mutation) is detectable without oracle knowledge.
- Direct unpolished metric sorting (pre-polish-rmse-max-abs) places intermediate 16 at rank 2 into top-4 with zero coordinate trials (31 pre-polish canonical evaluations).
- Cheap next-step lookahead (cheap-next-step-lookahead) places intermediate 16 at rank 1 into top-4 with zero coordinate trials (31 proposal enumerations + 816 unpolished canonical evaluations).
- Baseline lexical ordering places intermediate 16 at rank 16, resulting in zero primary recall.
- Reference-selector-v1 on pre-polish deliverable metrics places intermediate 16 at rank 6, narrowly missing top-4.
- Partial refinement probes (2 and 6 coordinate trials) also place intermediate 16 at rank 6, confirming that local coordinate polish does not immediately surface the bridge advantage without RMSE prioritization.
- Continuation count and continuation diversity disfavor intermediate 16 (ranks 27 and 25) because intermediate 16 has 10 filters, restricting additive structural moves relative to lower-filter candidates.

### Hypotheses
- Direct RMSE prioritization before polish serves as an effective outcome-blind admission signal because structural split mutations create favorable frequency distribution that improves raw fitting error even before coordinate optimization.
- Lookahead on unpolished mutations provides strong signal for multi-step structural cascades without requiring costly coordinate refinement.

### Recommendations
- Consider incorporating pre-polish-rmse-max-abs into candidate admission scoring to reliably surface temporary-worsening bridges.
- Retain lexical and diversity mechanisms as fallbacks to prevent starvation of non-split mutation types.

## Verification commands

```bash
pnpm --filter @autoeq-workbench/core research:storm-bridge-detectability
pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormBridgeDetectabilityAudit.test.ts
```
