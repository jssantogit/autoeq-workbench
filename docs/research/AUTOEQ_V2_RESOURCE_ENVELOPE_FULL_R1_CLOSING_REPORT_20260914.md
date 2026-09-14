# AutoEQ V2 full-r1 closing report

## Integrity
Development freeze remains unchanged. Holdout raw records were first recorded as failed because the copied development harness did not recognize holdout IDs; those records are preserved under the full-r1 raw root. Corrected reruns used the existing holdout corpus loader and produced all required fixed, effort, and legacy records.

## Development vs holdout
The generic ladder was `10/15/23/35/43`. Holdout confirms low-capacity binding: Storm, Trio, and U12t each reached C=10 with blocked pressure 86, 46, and 110 respectively. C10→C15 improved Storm and U12t but regressed Trio; later unpressured increases were mixed or neutral. Thus pressure is useful descriptive evidence but insufficient for a safe local allocator rule.

Effort improved 8/9 holdout capacity endpoints (median q30 RMSE e0−e6 positive); U12t/C23 worsened by 0.196 dB. Development improved 7/9 endpoints. Across both, 15/18 improve and 3/18 worsen: repeatable tendency, strongly state-dependent, no common knee.

Legacy holdout made 32/72 (44.4%) clearly premature expansions, 33/72 demand-aligned, and 7/72 ambiguous. Development was 35/73 (47.9%) clearly premature. This supports the frozen nonzero pre-demand prediction.

High-resource residual states remain: Storm/C43/e6 RMSE 0.901, U12t/C43/e6 0.878, Trio/C43/e6 0.572; fixed C43 frontiers were below ceiling with zero pressure. This supports a structural-search bottleneck rather than further scheduler tuning.

## Freeze scorecard
- A (pressure precedes productive capacity better than incumbent utilization): **partially supported** — low-C pressure identified binding, but productive adjacent expansion was not consistent.
- B (effort helps more often than premature capacity): **supported** — 15/18 effort endpoints improved; premature legacy expansion is 67/145 across development+holdout.
- C (legacy nonzero pre-demand expansion): **supported** — 32/72 holdout, 35/73 development.
- D (failures persist with resources): **supported** — high capacity/e6 residuals above.

## Seven-question gate
Q1 **conditionally** (15/18 endpoints improve; 3/18 worsen).
Q2 **yes** (all holdout C10 fixed trajectories bind; synthetic/development evidence remains frozen).
Q3 **no** as a usual rule: real-FR adjacent C+ is mixed once pressure clears.
Q4 **yes**: development 47.9%; holdout 44.4% clearly premature.
Q5 **no**: no threshold/rule was fitted or justified.
Q6 **partial**: effort tendency, premature legacy expansion, and residual states generalized; capacity payoff did not generalize consistently.
Q7 **inconclusive**: frozen delivery follow-ups were not executed, so no delivery claim is made.

## Architecture decision
**Primary: C — improve structural search engine.** Scheduler modifications have no safe deterministic local rule, while substantial residual error persists with high effort, unused structural headroom, and no pressure. Do not reopen scheduler/resource matrices absent a correctness failure.

## Next algorithm handoff
### Principles
1. Diversify structurally distinct candidates when local gain stalls.
2. Preserve deterministic, bounded continuation semantics.
3. Separate proposal generation from delivered-objective selection.
4. Spend search work on unresolved residual structure, not unused capacity.
5. Retain existing quantization/comparator behavior initially.

### Metrics
RMSE; maxAbs; structural violation; delivered filter count; independent work totals.

### Correctness invariants
No change to Standard-v1; capacity never exceeded; filters remain finite/in bounds; deterministic replay for a fixed seed/input; delivered metrics recomputed from delivered filters.

### Benchmark acceptance
1. Improve median RMSE versus frozen structural search on representative development and holdout cases without worse maxAbs.
2. No material delivered-quality loss after quantization.
3. No increase in pathological complexity (filter count, Q, gain, combined boost, opposing pairs) without documented quality benefit.
