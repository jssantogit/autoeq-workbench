# AutoEQ Workbench — Solver Research Program Design

**Status:** approved design, pending written-spec review  
**Date:** 2026-09-06  
**Branch:** `research/solver-research-program-design-2026-09-06`  
**Production control baseline:** `5dafaa50410b9fa3157c28a1f7757d676b33152a`  
**Research instrumentation base:** `cb50d0c6519d6f8937353aea9309e2b686655968`

## 1. Authority and scope

This document defines the research architecture for the next major AutoEQ solver investigation. It is a research-program design, not a production-solver implementation spec and not an approval to merge or deploy behavioral changes.

Read it together with:

- `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`;
- `docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md`;
- `docs/superpowers/specs/2026-08-30-autoeq-research-bench-design.md`;
- `docs/superpowers/specs/2026-08-30-autoeq-research-bench-raw-corpus-amendment.md`;
- `docs/superpowers/specs/2026-09-05-autoeq-v2-codex-handoff.md`;
- `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`.

The current Standard v2 production behavior remains frozen as the primary control at `5dafaa50410b9fa3157c28a1f7757d676b33152a`. The Standard v1 implementation remains frozen. Research branches may replace nearly all Standard v2 solver internals, but they must preserve the external product contract when a candidate is eventually distilled for production.

The research program is deliberately broader than the existing v2 architecture. It may compare search algorithms, schedulers, structural representations, state-transfer policies, global optimizers, sparse approximation methods, and offline reference solvers. It must not assume that the current candidate-generation, boundary-mode, active-path, or joint-coordinate-refinement structure is the right architecture.

## 2. Problem statement

The completed v2 work established several useful facts but did not produce a sufficiently strong quality-time frontier.

The safe v2 stack materially reduced repeated deliverable work and removed known monotonicity/retention problems, but difficult real curves still remain far from the intended final precision envelope at Max Filters 10. The dominant runtime phase is joint refinement, and several targeted micro-optimizations were either neutral, noisy, or slower. Fixed staged refinement, rank-threshold pruning, broad ranking changes, and simple warm-start policies also failed to produce a robust general improvement.

At the same time, existing evidence shows that materially better solutions are reachable in at least some cases:

- Standard v1 can reach better RMSE on difficult real fixtures, although too slowly for the intended user experience;
- increased filter capacity improves some difficult cases substantially;
- matching-depth and coherent-only warm-start experiments produce large gains on U12t, proving that useful cross-trajectory state exists;
- the current scheduler can spend several expensive refinement cycles on a candidate before making the next global allocation decision;
- candidate rank alone is not a safe proxy for long-term refinement value.

Therefore the next research program must answer a more fundamental question:

> Which solver architecture most efficiently approaches the best deliverable solution as wall-clock budget increases?

The program must discover this empirically rather than continue tuning the current architecture by isolated heuristics.

## 3. Primary objective: progressive Pareto quality

The official research objective is:

> Maximize useful delivered quality throughout the wall-clock trajectory, with a monotonic best-so-far result that progressively approaches the best-known deliverable Pareto frontier.

The product-facing budget checkpoints remain:

```text
5 s
15 s
30 s
60 s
```

Research traces should additionally record finer early checkpoints when practical, including approximately:

```text
0.5 s
1 s
2 s
3 s
5 s
10 s
15 s
30 s
60 s
```

The fine checkpoints are diagnostic. The 5/15/30/60-second points remain the stable comparison interface.

A longer budget must never produce a worse delivered best-so-far result than a shorter checkpoint from the same run. This is an architectural invariant for promoted candidates, not merely a statistical expectation.

## 4. Success policy

The program uses a hybrid success model.

### 4.1 Absolute aspiration

The existing final target envelope remains the primary absolute aspiration for an exact delivered preset:

```text
RMSE   <= 0.25 dB
maxAbs <= 0.75 dB
```

The research program does not redefine those thresholds merely to make an algorithm appear successful.

### 4.2 Relative domination

A candidate must also demonstrate material improvement over the frozen v2 control across the quality-time frontier. Small changes inside timing noise or measurement noise do not count as research wins.

### 4.3 Two-stage regression policy

During exploration, isolated regressions are allowed so that unconventional algorithm families are not eliminated before their failure modes are understood.

Before a candidate is eligible for product distillation, it must satisfy all of the following:

- practical non-regression per relevant case and budget against the frozen control;
- material aggregate improvement on the development and adversarial corpus;
- no catastrophic outlier on holdout;
- monotonic best-so-far trajectory;
- deterministic/reproducible behavior under the candidate's declared determinism contract;
- correct hard-deadline behavior and canonical final metrics.

The numerical threshold that defines a material relative improvement is not guessed in advance. It is frozen at the end of Oracle Calibration, before the holdout is opened. That acceptance policy must be derived only from development/adversarial evidence and oracle gaps, versioned with the research artifacts, and may not be changed after holdout results are inspected.

## 5. Program strategy: oracle-led algorithm tournament

The program adopts an **oracle-led algorithm tournament** rather than an immediate solver rewrite.

The sequence is:

```text
measurement foundation
        ↓
continuous + deliverable oracles
        ↓
oracle-gap diagnosis
        ↓
algorithm-family screening
        ↓
adversarial tournament
        ↓
selective cross-family hybrids
        ↓
holdout
        ↓
product distillation
```

The current v2 solver is a control and source of useful mechanisms, not the assumed end-state architecture.

This strategy is preferred over an immediate rewrite because it lets the project distinguish three very different outcomes:

1. the current solver is far from a reachable optimum and a new search architecture can recover the gap;
2. the main weakness is seed/structure selection rather than local refinement;
3. much of the remaining error is imposed by filter count, filter types, bounds, or quantized deliverability rather than search quality.

Without oracles these cases cannot be separated reliably.

## 6. Reference hierarchy

Each research case is evaluated against four reference layers.

### 6.1 Standard v1

Standard v1 is a historical trajectory and solution-quality reference only. Its implementation remains frozen. It may be analyzed for seeding or structural insight but must not be silently changed.

### 6.2 Standard v2 control

`5dafaa50410b9fa3157c28a1f7757d676b33152a` is the frozen primary control for all relative claims unless a later written amendment explicitly replaces the control baseline.

### 6.3 Continuous Oracle

The Continuous Oracle estimates the best-known Pareto frontier achievable for a specified filter count and continuous product bounds before final product quantization/discrete delivery constraints.

### 6.4 Deliverable Oracle

The Deliverable Oracle estimates the best-known Pareto frontier achievable under the actual delivered-preset rules, including supported filter types, product bounds, filter-count cap, quantization, canonical evaluation, and any required final deliverability constraints.

These references define two central diagnostic gaps:

```text
search gap         = runtime solver → Continuous Oracle
deliverability gap = Continuous Oracle → Deliverable Oracle
```

For product relevance the program also reports:

```text
product gap = runtime solver → Deliverable Oracle
```

The gaps are reported as Pareto/regret measures rather than as a single scalar whenever possible.

## 7. Multiobjective oracle contract

Neither oracle is defined by one fixed scalar objective.

The mandatory primary Pareto dimensions are:

- global RMSE;
- global maxAbs.

Secondary dimensions and diagnostics include:

- 20–200 Hz error;
- 200 Hz–1 kHz error;
- 1–4 kHz error;
- 4–8 kHz error;
- 8–20 kHz error;
- delivered filter count;
- maximum Q;
- maximum absolute gain;
- sum of absolute gains;
- cancellation/audit severity where applicable.

The canonical TypeScript DSP/evaluation path remains the authority for reported final metrics. An external laboratory implementation may use faster surrogate evaluation internally, but any solution admitted to an oracle frontier must be re-evaluated canonically before storage or comparison.

## 8. Solver/generator and Pareto selector are separate research problems

The research program separates:

1. generating/finding candidate solutions;
2. selecting a single product-preferred solution from a Pareto set.

During solver-family comparisons, a frozen **Reference Pareto Selector** must be used so that improvements cannot be attributed ambiguously to both a changed search method and a changed final preference policy.

A separate selector study may compare policies using identical candidate/frontier inputs. Only after the generator and selector studies are independently understood may their winners be combined.

This separation is mandatory for causal interpretation of research results.

## 9. Laboratory technology policy

Research discovery is not restricted to technologies that can ship in the browser.

The laboratory may use:

- Python;
- NumPy/SciPy;
- established optimization libraries;
- command-line research tools;
- disposable prototypes;
- parallel offline runners;
- long-running multi-seed experiments.

The production implementation remains subject to the repository's normal constraints: framework-agnostic `packages/core`, browser suitability, hard deadlines, deterministic behavior where required, no server dependency, and the existing external AutoEQ contract.

The research program must treat laboratory discovery and product distillation as separate stages. A Python result is evidence about the algorithmic family, not production code by default.

## 10. Compute policy

Offline research compute may be aggressive.

Oracles and screening sweeps may spend minutes or hours per case, use hundreds of seeds, and run broad parameter studies when the information gain justifies the cost. The product's 5/15/30/60-second budgets do not constrain oracle computation.

Compute must still be managed deliberately:

- cheap screening precedes expensive full studies;
- obviously dominated families are eliminated early;
- repeated expensive runs require a specific hypothesis or validation purpose;
- broad sweeps must emit machine-readable artifacts so they do not need to be repeated for simple re-analysis.

## 11. Corpus architecture

The research corpus is organized into three layers.

### 11.1 Development corpus

A small, fast corpus used for frequent iteration. It may include known real cases and synthetic diagnostic cases. Researchers may inspect all development results and tune algorithms against them.

### 11.2 Adversarial corpus

A deliberately difficult set used to expose solver pathologies. It includes the approved real cases based on the existing raw research curves, including:

- Titan S2 → Subtonic Storm;
- Titan S2 → 64 Audio U12t;
- Titan S2 → 64 Audio Trio.

It also includes synthetic stress cases for patterns such as:

- narrow high-Q peaks/notches;
- strong shelves;
- clusters of nearby resonances;
- alternating-sign residual features;
- irregular high-frequency structure;
- Q/gain boundary pressure;
- filter-count saturation;
- cases with a large continuous-to-quantized gap.

### 11.3 Holdout corpus

The holdout is predominantly or exclusively real and remains unopened during algorithm tuning. A candidate reaches holdout only after its algorithm/configuration and acceptance policy are frozen.

After the holdout is opened, changing solver constants or selection policy in response to those results invalidates that holdout for the modified candidate. A future evaluation must then use a fresh holdout.

No new raw/private/user curve may be committed without a new explicit data-approval amendment. Synthetic curves are the default safe mechanism for expanding diagnostic coverage.

## 12. Continuous Oracle design

The Continuous Oracle is an ensemble rather than a single optimizer.

Candidate methods should include multiple independent families, for example:

- CMA-ES;
- Differential Evolution;
- basin-hopping or comparable restart frameworks;
- multi-start Powell/Nelder–Mead;
- L-BFGS or other gradient-based polishing only where the chosen surrogate/objective is sufficiently smooth;
- epsilon-constrained or sweep-based multiobjective construction.

The oracle frontier is the non-dominated union of canonically re-evaluated solutions from all participating methods and seeds.

The oracle is considered increasingly trustworthy when independent optimization families converge to the same or very similar frontier regions. It is explicitly a **best-known** oracle, not a formal mathematical proof of global optimality.

Oracle artifacts must retain enough provenance to identify which optimizer/seed discovered each frontier point.

## 13. Deliverable Oracle design

The Deliverable Oracle operates in the mixed continuous/discrete product space.

Its search may combine:

- Continuous Oracle seeds;
- heavy quantized neighborhood search;
- simulated annealing;
- evolutionary/genetic search;
- cross-entropy-style sampling;
- wide beam search;
- add/remove/split/merge structural mutations;
- filter-type mutations;
- repeated continuous local polishing followed by re-quantization.

The exact ensemble is chosen during the implementation plan and may evolve during Oracle Calibration, provided every oracle version is recorded and historical frontiers remain reproducible.

A Deliverable Oracle point must satisfy the same product filter-type and bound rules as the delivered candidate it is intended to benchmark.

## 14. Measurement foundation and research telemetry

The current detailed joint-refinement tracing at `cb50d0c6519d6f8937353aea9309e2b686655968` is useful but must be hardened before it becomes authoritative research infrastructure.

Round 0 must address at least these issues:

- detailed cycle/metric allocation must have negligible overhead when deep tracing is disabled;
- retention correlation should rely on stable solution/result keys rather than object identity where logical equivalence matters;
- duplicate/equivalent refinement must distinguish **attempted** from **completed** work so an expired prior attempt is not treated as fully paid;
- the staged-candidate retention field should be named according to its actual semantics rather than ambiguously as parent retention;
- source-solution and best-deliverable contribution correlation must remain correct across checkpoint, deep-finish, compression, and expiration paths.

The research trace should expose enough information to answer:

- how much time is spent on states that never influence a retained path or final best deliverable;
- marginal metric gain per refinement cycle;
- marginal metric gain per unit time/evaluation count;
- survival probability by candidate origin and rank;
- duplicate/equivalent work frequency;
- time-to-best and time-since-last-improvement;
- which state origins contribute to final best deliverables;
- distance/regret to oracle over time.

Deep telemetry must remain opt-in so that measurement does not materially alter the behavior being measured.

## 15. Algorithm-family tournament

The tournament explicitly compares algorithm families rather than isolated heuristics.

### 15.1 Family A — Resumable beam / continuation scheduling

Replace the current pattern of giving a candidate a potentially long full refinement before the next global allocation decision with resumable work units.

Conceptually:

```text
many candidates receive cheap work
        ↓
global comparison
        ↓
selected states receive another refinement slice
        ↓
global comparison
        ↓
continue until deadline
```

Refinement state must be resumable. A candidate may pause and later continue rather than either consuming all cycles immediately or being permanently discarded after a fixed early stage.

### 15.2 Family B — Sparse dictionary / matching pursuit

Build a dictionary or structured basis of candidate biquad responses across filter type, frequency, and Q. Use sparse approximation to obtain rapid structural seeds before nonlinear polishing.

Candidate techniques include:

- Orthogonal Matching Pursuit;
- bounded least squares over selected atoms;
- LASSO-like sparse selection;
- greedy residual fitting with exact canonical validation.

The purpose is to test whether better filter structure can be obtained much more cheaply than repeated local coordinate trials.

### 15.3 Family C — Global continuous optimization

Represent a fixed-topology N-filter preset as a continuous parameter vector and compare global/multi-start optimizers such as CMA-ES and Differential Evolution.

This family is both a potential solver direction and a diagnostic tool for detecting poor local minima in the current coordinate-descent refinement.

### 15.4 Family D — Structural beam search

Treat filter structure itself as part of the state. Structural actions may include:

- add PK/LS/HS;
- remove a filter;
- mutate filter type;
- split a filter;
- merge nearby filters;
- move a structural feature.

Each structure receives bounded local refinement rather than assuming the candidate generator already selected the correct topology.

### 15.5 Family E — v1-derived seeding

Analyze successful v1 solutions/trajectories and turn useful decisions into cheap seeds for a modern solver. Standard v1 is not copied as the target architecture; it is used as a source of proposals and structural priors.

### 15.6 Family F — State bank / cross-geometry transfer

Generalize the warm-start finding into an explicit state bank that does not have to displace fresh diversity inside the same three-path cap.

A state may carry origin metadata such as:

- fresh;
- transferred;
- resumed;
- mutated;
- v1-seeded;
- oracle-inspired for offline diagnosis only.

The scheduler chooses when to allocate compute to state classes. Cross-geometry reuse must be measured independently from the active-path diversity budget.

### 15.7 Family G — Oracle distillation

Only after sufficiently broad oracle data exists, analyze oracle solutions for predictive structure: likely filter locations, useful Q ranges, promising structural patterns, and low-value refinement behavior.

The first goal is rule/seed distillation, not necessarily machine learning in production. Any learned model is a later optional research branch and requires its own deployment/safety analysis before product use.

## 16. Tournament stages

### Stage 0 — Measurement foundation

No production candidate is selected. Harden telemetry, define canonical artifacts, and establish control traces.

### Stage 1 — Development screening

Run inexpensive variants on the development corpus. Eliminate clearly dominated methods quickly. Focused research tests are sufficient during active iteration.

### Stage 2 — Adversarial tournament

Surviving families run on the adversarial corpus at 5/15/30/60-second budgets. Max Filters 10 is primary; Max Filters 20/40 are used selectively to diagnose capacity/search interactions.

Methods with small timing differences require same-runner/same-process A/B designs rather than claims from separate CI runs.

### Stage 3 — Cross-family hybrids

Only combine components after individual strengths are demonstrated. Examples may include sparse seeds plus resumable beam scheduling or v1-derived seeds plus structural search. Hybrids must preserve causal attribution by retaining ablations for each component.

### Stage 4 — Holdout

Freeze algorithm, constants, selector, and acceptance policy before revealing holdout results. Holdout is used for promotion evidence, not tuning.

### Stage 5 — Product distillation

Translate the winning algorithmic family into a browser-suitable, framework-agnostic core implementation. Re-establish the full product contract, cancellation/deadline behavior, quantized deliverability, session/export compatibility, and UI integration through a later implementation design/plan if required.

This program design does not itself approve product promotion or deployment.

## 17. Quality-time frontier and summary metrics

The primary evidence remains the full best-so-far trajectory and the fixed 5/15/30/60-second checkpoints.

For efficient family ranking, the research bench may also compute a normalized **Quality-Time Frontier** summary metric. It should conceptually integrate best-so-far quality over log-scaled time and normalize against the Deliverable Oracle so that early useful improvements are rewarded.

The summary metric must not replace raw RMSE, maxAbs, band metrics, Pareto fronts, or per-budget tables. It is a screening/ranking aid, not the sole acceptance criterion.

The exact formula is frozen during Oracle Calibration before it is used for holdout promotion decisions.

## 18. Counterfactual and oracle-guided diagnostics

Before engineering complex schedulers, the program should use traces to estimate the value of smarter allocation with hindsight.

A wide offline run may record a richer graph of:

```text
parent state
  → candidate state
  → refinement cycle state
  → retained/discarded outcome
  → deliverable contribution
```

Offline counterfactual analysis can then ask:

- which candidate/cycle would have been selected if future value were known;
- how much quality was available under the same approximate compute budget;
- how much work went to states that never became useful;
- whether a better scheduler could recover a meaningful fraction of oracle regret without changing candidate generation.

These analyses are diagnostic upper bounds, not deployable algorithms. They are specifically intended to prevent another round of unsupported scheduler heuristics.

## 19. Reproducibility contract

Every material research artifact must record at least:

- repository commit SHA;
- algorithm family and variant;
- complete configuration/version identifier;
- seed where randomness exists;
- corpus version and relevant input hashes;
- Node/Python/runtime versions;
- runner/machine metadata when relevant to timing;
- time budget;
- Max Filters and bounds;
- canonical final metrics;
- trajectory/checkpoints;
- evaluation/trial counts;
- phase timing where instrumented;
- Pareto membership/provenance for oracle runs.

Randomized laboratory optimizers must be reproducible from saved seeds/configuration even when the eventual product solver is deterministic.

A result that cannot be reproduced from its recorded artifact is not valid promotion evidence.

## 20. Correctness and safety gates

Before any research candidate can be considered for product distillation, it must preserve or re-establish:

- exact hard timeout semantics;
- cooperative cancellation semantics;
- best-so-far monotonic delivery;
- canonical final cascade evaluation;
- correct `targetAchieved` and termination metadata;
- final filter-count and parameter bounds;
- quantized delivered-result rules;
- deterministic IDs/order under the declared deterministic contract;
- session/export compatibility;
- frozen Standard v1 behavior;
- no dependence on React or UI state inside numerical core logic.

Production, default branch, release, merge, deployment, or publication remain outside this research program unless separately and explicitly approved.

## 21. Research workflow and verification policy

The program follows Efficient Workflow v2.

During hypothesis iteration:

- use dedicated research branches;
- start with focused tests;
- prefer cheap screening over repeated full CI;
- save machine-readable artifacts;
- stop dominated experiments early;
- do not perform unrelated cleanup.

At coherent research milestones:

- run the applicable research tests and core typecheck;
- use Research Bench for material quality claims;
- run root/global verification only when the diff has reached a meaningful endpoint that warrants it;
- use the exact pushed SHA and its CI result as final executable evidence for that milestone.

Behavioral changes intended for eventual product promotion require a separate explicit promotion decision and normal full gates.

## 22. Proposed research workspace boundary

The laboratory should be isolated from shipping runtime code. A concrete layout is chosen in the implementation plan, but the intended boundary is conceptually:

```text
research/
  solver-lab/
    corpus/
    oracle/
    algorithms/
    adapters/
    experiments/
    analysis/
    artifacts/
```

This is not a requirement to move existing `packages/core/benchmarks/research/` immediately. Existing bench code may remain where it is if an adapter boundary provides the same isolation. Avoid unnecessary repository churn purely to match the conceptual diagram.

`packages/core` remains the canonical numerical/product authority. External tools consume explicit interchange formats rather than importing UI/runtime state.

## 23. Explicit non-goals for the first program cycle

The first cycle does not begin with:

- another JavaScript hot-loop micro-optimization;
- another rank-gap threshold;
- another global L2/L4/L8 comparator trial;
- fixed K1/K2 staged refinement;
- a simple repetition of the existing warm-start policy;
- immediate TypeScript ports of CMA-ES or other laboratory optimizers;
- changes to production/default behavior;
- UI changes;
- new filter types or widened product bounds;
- new raw/private measurement data without explicit approval.

Previously rejected ideas may be revisited only if new oracle/trajectory evidence provides a materially different reason to expect success.

## 24. Program deliverables

The program is complete when it produces all of the following:

1. a trustworthy, low-overhead measurement foundation;
2. versioned Continuous Oracle and Deliverable Oracle frontiers for the research corpus;
3. a quantified diagnosis of search gap versus deliverability gap;
4. an algorithm-family tournament with reproducible artifacts and explicit eliminations;
5. a frozen development/adversarial acceptance policy before holdout;
6. holdout evidence for the selected family or a documented conclusion that no tested family merits promotion;
7. a recommendation for the next production architecture, including the evidence that justifies it;
8. a separate product-distillation design/plan before any production merge if the winning family changes architecture materially.

A negative result is acceptable if it establishes credible limits and rules out major solver families. The research program is successful if it replaces unsupported local hypothesis tuning with a measured understanding of what quality is achievable, where the current gap originates, and which architecture best closes it under real time budgets.

## 25. Decision summary

The approved design choices are:

- progressive/Pareto quality over the whole 5/15/30/60-second trajectory;
- hybrid absolute + relative success policy;
- exploratory regressions allowed, promotion regressions not allowed;
- layered development/adversarial/holdout corpus;
- real measurements as the core plus synthetic stress cases;
- aggressive offline compute;
- unrestricted laboratory technology followed by product distillation;
- separate Continuous and Deliverable Oracles;
- multiobjective Pareto oracle frontiers;
- separate solver/generator and Pareto-selector studies;
- algorithm-family tournament rather than continued isolated v2 tuning;
- production/default branch remains untouched until a later explicit promotion approval.

This document authorizes the research-program planning phase only. It does not authorize implementation, merge, deployment, release, or production behavior changes.
