# AutoEQ Solver Triad Audit — Speed, Precision, Consistency

**Status:** research design
**Date:** 2026-09-12
**Branch:** `research/speed-precision-consistency-audit-20260912`

## 1. Purpose

This audit compares three explicitly frozen solver references:

1. **Standard V2 control**
   - SHA: `5dafaa50410b9fa3157c28a1f7757d676b33152a`
   - Role: historical production-quality baseline.

2. **Research-backed Max10 Q31-B4-P8**
   - SHA: `e7656a8ade3b7fa9239f40e7ff9d1dc1d1a2ad76`
   - Role: experimentally validated structural-search candidate before later product-side tuning.
   - Research identity: Max10, beam width 4, 8 proposals per parent, local polish 24, Q31 admission.

3. **Current live Max10 experimental**
   - SHA: `17d3a60b8cff0ce7b4b2ebe98d83f0c25c3a42b4`
   - Role: current Pages experiment after multi-region, semantic-shelf, metric-ranking, merge and cleanup changes.

No result from one reference may be attributed to another.

The audit focuses on the product problems that motivated the experimental solver:

- **Speed**
- **Precision**
- **Consistency / repeatability**

The purpose is causal diagnosis and solver-direction selection, not incremental tuning of the current live Max10.

## 2. Existing evidence that must be preserved

### 2.1 Standard V2 strengths and known costs

The Standard V2 design targets a quantized delivered solution with:

- RMSE <= 0.25 dB
- maxAbs <= 0.75 dB

Its architecture includes multi-scale candidate generation, PK width/Q estimation, evidence-based shelves, exact shortlist scoring, bounded alternate paths, repeated joint refinement, working capacity above the delivered cap, final-cap compression, quantization, and discrete refinement.

For Max Filters = 10, Standard V2 may search with a working cap of 15 filters before producing a <=10-filter deliverable.

The research handoff reports representative Max10 / ~30 s adversarial results around:

- Storm: RMSE ~1.340 dB, maxAbs ~5.462 dB
- U12t: RMSE ~1.286 dB, maxAbs ~4.965 dB
- Trio: RMSE ~1.141 dB, maxAbs ~3.493 dB

The same handoff records that many micro-optimization attempts failed to produce reliable total speedups. The recommended direction moved from micro-optimization toward structural joint-refinement scheduling and search architecture.

### 2.2 Standard V2 consistency contract

Standard V2 is exactly deterministic for non-timeout / controlled-clock execution.

Real-clock timeout execution is only best-effort deterministic. The Research Bench therefore measures repeated-run quality stability rather than requiring byte-identical filters for real-clock V2 runs.

Later capacity-recovery research found a stronger symptom: a time-limited control candidate identity could correspond to materially different filter topologies on different executions. This must be treated as a consistency defect relative to the product goal of repeated identical user runs.

### 2.3 Research-backed Q31-B4-P8 evidence

The 2026-09-12 Storm final decision supports Q31-B4-P8 for experimental Max10 integration.

Under the primary 5 s benchmark across Storm/U12t/Trio x teacher/zero seeds:

- selector record: 4 wins, 0 losses, 2 ties versus narrow-beam Arm A
- mean delta maxAbs: -0.7878 dB
- mean delta RMSE: -0.2134 dB
- worst paired maxAbs regression: 0.0000 dB
- actual 5 s wall-clock contract: satisfied

Research also found:

- beam width 4 is the dominant structural unlock;
- proposal width 8 is useful mainly when paired with beam width 4;
- novelty backfill produced no useful delta;
- productive structural search largely saturates between 5 and 10 seconds;
- 15 s does not justify a default longer Max10 structural budget.

This evidence applies to the frozen research candidate, not to later live modifications.

### 2.4 Current live Max10 observations

Manual Pages testing on Dunu Titan S2 -> JM-1 exposed several behaviors not covered by the Storm/U12t/Trio research matrix:

- original exposed Max10 could stop around 7 filters and concentrate nearly all filters in upper mids/treble;
- multi-region changes removed that tunnel behavior;
- semantic shelf changes eliminated obviously suspect edge shelves;
- repeated runs after those changes produced the same filters in four consecutive user runs;
- later structural cleanup successfully merged 1191 Hz +0.7 dB and 1262 Hz +0.7 dB into 1226 Hz +1.4 dB;
- the cleanup then over-simplified the result to four filters, demonstrating a ratcheting problem and showing that the current live candidate is no longer the same algorithm that research validated.

This manual case is important product evidence, but it is not yet a repository research fixture.

## 3. Research questions

### 3.1 Speed

For each solver, determine:

- elapsed time to first useful deliverable;
- time to RMSE thresholds;
- time to maxAbs thresholds;
- time to best selected deliverable;
- total elapsed time;
- canonical signal evaluations;
- coordinate/refinement trials;
- delivered and peak working filter counts;
- whether additional time after 5 s produces meaningful quality.

Primary question:

> Which architecture reaches the best practical delivered quality per unit of deterministic work and per unit of wall-clock time?

### 3.2 Precision

For each solver, measure from the exact delivered quantized cascade:

- RMSE
- maxAbs
- maxAbs frequency
- regional RMSE/maxAbs:
  - 20-200 Hz
  - 200-1000 Hz
  - 1-4 kHz
  - 4-8 kHz
  - 8-20 kHz
- filter count
- cancellation score / structural cleanliness
- normalized violation:
  `max(RMSE / 0.25, maxAbs / 0.75)`

Primary question:

> Which architecture best uses a <=10-filter delivered budget without hiding local peak error behind average RMSE?

### 3.3 Consistency

Consistency is split into two contracts.

#### A. Deterministic-work contract

Given the same:

- numerical input
- solver version
- fixed work/evaluation budget
- seed state
- settings

the result must be exactly identical:

- filter types
- filter order
- frequencies
- gains
- Q values
- delivered metrics
- termination reason
- candidate/result signature

Required repeatability target: **10/10 exact identity**.

#### B. Real-clock safety contract

Wall clock is a safety fuse, not the normal source of search depth.

Real-clock testing records:

- exact-result signature distribution;
- RMSE/maxAbs spread;
- termination distribution;
- last completed deterministic work checkpoint.

The desired production direction is that normal runs finish their deterministic work budget before the fuse. If the fuse is hit, the result must be explicitly classified as a safety-timeout fallback rather than silently becoming a different ordinary answer.

## 4. Comparison matrix

### 4.1 Official repository cases

Use the existing sanitized Research Bench cases:

- `titan-to-storm`
- `titan-to-u12t`
- `titan-to-trio`

Use existing synthetic/adversarial fixtures where they target:

- narrow high-Q structure;
- shelves;
- nearby resonances;
- alternating-sign residuals;
- high-frequency irregularity;
- gain/Q bounds;
- filter-count pressure.

### 4.2 JM-1 product case

Dunu Titan S2 -> JM-1 is a mandatory product validation case because it exposed failures not caught by the existing adversarial trio.

It must not be fabricated from screenshots.

Until an authorized/sanitized desired-correction fixture exists, JM-1 remains a manual product-validation case. If an exact source/target fixture is later approved, add it to the audit with a stable hash.

## 5. Required runs

For each frozen solver reference and compatible case:

### 5.1 Fixed-work repeatability

Run at deterministic checkpoints appropriate to the solver, including at minimum:

- early
- medium
- terminal deterministic work budgets

Repeat each cell 10 times.

Expected result: exact filter/result identity for all 10 runs.

### 5.2 Real-clock time-to-quality

Observe at:

- 0.5 s
- 1 s
- 2 s
- 3 s
- 5 s
- 10 s
- 15 s

Do not automatically extend to 30/60 s for structural Max10 after evidence already shows saturation unless a candidate remains productively active.

Repeat real-clock cells enough to measure spread; Research Full's five repeats remain the minimum.

### 5.3 Cross-architecture comparison

Every comparison must separate:

- final absolute quality;
- time-to-quality;
- work-to-quality;
- exact repeatability;
- real-clock spread.

A solver cannot be declared better only because it is faster, only because it has lower RMSE, or only because it uses fewer filters.

## 6. Causal hypotheses to test

### H1 — Standard V2 precision comes from richer geometry and deeper refinement

Evidence basis:

- multi-scale feature generation;
- three Q variants;
- evidence-based shelves;
- working cap above delivered cap;
- repeated whole-cascade refinement;
- final discrete delivery refinement.

Test whether these components explain V2's stronger JM-1 fit, and which are actually necessary.

### H2 — Standard V2 speed cost is dominated by structural/refinement scheduling, not micro-operations

Evidence basis:

- multiple rejected sub-1% or negative micro-optimizations;
- staged-refinement studies;
- research handoff recommendation to focus on scheduling/diversity.

Test phase/counter cost rather than attempting more isolated trig/cache changes.

### H3 — Standard V2 inconsistency is caused by wall-clock-dependent search depth

Evidence basis:

- real-clock determinism explicitly relaxed in the Standard V2 contract;
- repeated-run stability is measured statistically rather than by exact identity;
- time-limited control identity conflict observed in capacity recovery.

Test V2 using equal deterministic-work checkpoints versus equal real-clock limits.

### H4 — Research Max10 quality is limited mainly by reachability/admission/beam capacity

Evidence basis:

- widening B=2 -> B=4 was the dominant causal unlock;
- B4 x P8 showed super-additive search survival;
- single-blocker bridge experiment proved one missed admission could block a better two-hop descendant under equal work;
- novelty backfill did not help.

Test reachable descendants and beam survival before modifying objectives.

### H5 — Original research Max10 has candidate-geometry blind spots

Manual JM-1 evidence and frozen source show original structural Max10 uses one strongest residual feature to seed add mutations. This can tunnel into one spectral region.

Test multi-region feature generation independently of later cleanup/ranking changes.

### H6 — Live Max10 cleanup introduced quality ratcheting

The current cleanup can be invoked repeatedly with a fresh local anchor. Repeated locally safe simplifications can accumulate into a materially different result.

Test total degradation against one immutable pre-cleanup reference and prohibit repeated tolerance reset.

### H7 — Max10 is not proven representation-limited

Capacity-aware research found prior high-cap plateaus were caused by search behavior, and no case was classified as cap-limited.

Do not respond to a Max10 miss simply by assuming 10 filters are insufficient.

## 7. Candidate architecture directions to evaluate after diagnosis

No production candidate is selected in advance.

The audit may distill a candidate from proven mechanisms, but candidate construction should prefer:

- deterministic fixed-work search;
- bounded beam diversity;
- multi-region residual features;
- semantically justified shelves;
- canonical Pareto/violation selection;
- explicit best-deliverable checkpointing;
- continuation/rebasing of improved states;
- final quantized delivery refinement only where it produces measured value.

Avoid by default:

- random search in production;
- wall-clock-driven normal search depth;
- repeated tolerance-reset cleanup;
- widening to 15 working filters merely to imitate V2 without evidence;
- global ranking changes unsupported by measured causal gains;
- previously rejected micro-optimizations without a new causal reason.

## 8. Decision gates

A future production candidate must satisfy all three dimensions.

### Precision gate

On the agreed corpus:

- no material regression against the strongest relevant baseline;
- report RMSE and maxAbs separately;
- no average-only win that hides severe local maxAbs;
- manual JM-1 must not regress relative to the best known V2 result unless explicitly justified by measured tradeoff.

### Speed gate

Target direction from current research:

- useful terminal Max10 quality in roughly the 5-8 s window on the research environment;
- time-to-quality is more important than consuming the entire user time limit;
- no architecture is promoted merely because it exits early through search exhaustion.

### Consistency gate

- deterministic-work cells: 10/10 exact identical outputs;
- normal product runs should finish before the wall-clock fuse;
- any fuse-hit fallback is explicitly distinguishable and must not be treated as ordinary deterministic completion.

## 9. Immediate research sequence

1. Preserve the three frozen references above.
2. Add one triad comparison adapter to the existing Research Bench without changing product defaults.
3. Run fixed-work repeatability first; this isolates algorithmic determinism from machine speed.
4. Run real-clock 0.5/1/2/3/5/10/15 s time-to-quality comparisons.
5. Generate per-case precision/speed/consistency tables.
6. Attribute deltas to mechanisms using targeted ablations, beginning with:
   - V2 geometry/refinement cost;
   - Max10 beam/admission reachability;
   - multi-region feature generation;
   - live cleanup ratchet.
7. Only after causal attribution, design the next solver candidate.
8. Do not merge/deploy another Max10 tuning patch during this audit unless a separate explicit product request is made.

## 10. Expected output

The audit ends with:

- a causal problem matrix for V2, research Max10, and live Max10;
- measured speed/precision/consistency tables;
- accepted/rejected mechanism list;
- one recommended solver architecture;
- a production-distillation plan;
- explicit reasons not to reuse rejected approaches.

The intended outcome is not "make the current Max10 pass." It is to identify the smallest architecture that simultaneously improves speed, precision, and consistency over the historical V2 baseline.
