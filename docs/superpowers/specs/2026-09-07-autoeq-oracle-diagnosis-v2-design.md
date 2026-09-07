# AutoEQ Workbench — Oracle Diagnosis v2 Design

**Status:** approved direction, pending written-spec review  
**Date:** 2026-09-07  
**Design branch:** `research/oracle-diagnosis-v2-design-2026-09-07`  
**Research base:** `a9f6ce06bac11b5545b7f22a4f96d267cc42687e`  
**Frozen Standard-v2 control:** `5dafaa50410b9fa3157c28a1f7757d676b33152a`

## 1. Authority and purpose

This document defines the next diagnostic phase of the AutoEQ solver research program after the optimized Oracle SCREEN → CONFIRM → DEEP campaign completed without enough evidence to freeze `OracleCalibrationManifestV1`.

It is an amendment/continuation of `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`. The parent program remains authoritative unless this document explicitly narrows or extends it.

This phase is research-only. It does not approve a production solver change, merge, deployment, release, holdout access, Quality-Time Frontier execution, or a change to the existing Oracle calibration acceptance semantics.

The optimized Oracle campaign at `a9f6ce06bac11b5545b7f22a4f96d267cc42687e` is the input evidence for this diagnosis. Its orchestration, canonical evaluation, deterministic aggregation, control-retention semantics, exact-N diagnostic frontiers, and aggregate cap-frontier semantics are retained.

## 2. Motivation

The completed MaxFilters=10 campaign substantially improved research throughput but did not establish a calibrated Oracle that strictly improves the frozen Standard-v2 control. All eleven cases remained unresolved under the campaign convergence rules, while additional compute still changed at least one synthetic frontier.

A further undifferentiated DEEP sweep would therefore have low expected information value. The next scientific task is not simply to spend more compute in the same search configuration; it is to determine **why** the current best-known Oracle does not establish a useful strict improvement over the control.

The diagnosis must distinguish at least four hypotheses:

1. **local/search gap:** the frozen control lies in a basin that the current Oracle can still improve when initialized appropriately;
2. **discovery/seeding gap:** materially better states exist, but current global search fails to discover their regions without strong seeds;
3. **objective/scalarization gap:** weighted scalar objectives fail to expose relevant non-convex or weakly sampled parts of the RMSE/maxAbs Pareto frontier;
4. **capacity gap:** MaxFilters=10 is the principal limitation, so more search within the same cap has diminishing value compared with additional filter capacity.

A fifth possible outcome is also valid: under the current representation and MaxFilters=10 contract, the frozen control may already be close to the current best-known frontier. The diagnosis must be able to support that conclusion instead of forcing an Oracle improvement.

## 3. Alternatives considered

Three next-step strategies were considered.

### 3.1 Repeat a broader DEEP campaign

Run the same optimizer families, objective family, and MaxFilters=10 configuration with more seeds/evaluations.

This is rejected as the immediate next step. The prior campaign already reached large canonical-evaluation counts and still showed unresolved behavior. Repeating it would provide weak causal information about whether the problem is initialization, scalarization, local basin quality, or capacity.

### 3.2 Relax calibration so a stable frontier containing the control can freeze

Treat a stable best-known frontier that includes the frozen control as sufficient calibration evidence even when it does not strictly improve the control.

This is deferred. It may ultimately be defensible, but changing the calibration rule now would mix a methodological change with an unresolved question about Oracle strength. The existing strict-improvement gate remains frozen throughout Oracle Diagnosis v2.

### 3.3 Targeted Oracle Diagnosis v2

Run a small set of counterfactual searches designed to isolate the four hypotheses above, with escalation only when a diagnostic result has high information value.

This is the selected approach.

## 4. Global constraints

Oracle Diagnosis v2 must preserve all of the following:

- QTF remains paused;
- holdout remains sealed;
- Standard v1 remains frozen;
- Standard v2 production behavior remains frozen;
- the Standard-v2 control remains present in best-known cap unions unless strictly dominated;
- canonical TypeScript DSP/evaluation remains authoritative for every official stored point;
- exact-N results remain diagnostic and aggregate max-filter cap frontiers remain the official comparison surface;
- no diagnostic zero or missing improvement is converted into a permissive threshold;
- no new `OracleCalibrationManifestV1` is created unless the already-approved calibration gate passes with valid evidence;
- no raw/private/user data is added; only existing approved real research curves and synthetic/sanitized diagnostics may be used;
- every remote claim must be tied to exact repository SHA, configuration, seeds, corpus/problem hashes, budgets, and artifacts.

The phase should initially cost **tens of minutes of wall-clock research compute**, not another multi-hour exhaustive campaign. Escalation is conditional on information gain.

## 5. Diagnostic Track A — frozen-control local basin audit

### 5.1 Question

Can the exact frozen Standard-v2 delivered solution be improved materially when the optimizer starts from that state instead of searching for its basin from scratch?

### 5.2 Contract

For each selected case, construct a canonical continuous candidate from the frozen Standard-v2 control filters and hold its topology fixed:

- same filter count;
- same filter types;
- no add/remove/split/merge operation;
- parameter values remain within the same product bounds.

Run multiple local or neighborhood refiners from that exact seed. The initial mandatory methods are:

- a long deterministic Powell/local-search pass;
- seeded CMA-ES in a controlled neighborhood around the encoded control vector.

A third local method may be added during implementation only if it tests a distinct local-search mechanism and remains versioned in the artifact.

Every admitted result must be canonically re-evaluated and compared against the original control using the same Pareto/dominance semantics as the Oracle campaign.

### 5.3 Interpretation

- **Material improvement from the control seed:** evidence of a local/refinement search gap. The current Oracle and/or runtime solver is leaving quality inside a reachable basin.
- **Near-zero improvement across independent local methods:** evidence that the control is locally strong; attention shifts toward discovery, topology/capacity, or objective construction.
- **Different local methods find distinct nondominated improvements:** evidence that even the local basin is multi-region and should be represented as a small local frontier rather than one scalar optimum.

This track does not claim global optimality.

## 6. Diagnostic Track B — known-good seed recoverability

### 6.1 Question

Can the Oracle retain or improve known-good states that previous research already demonstrated, and can its global search rediscover comparable regions without those seeds?

### 6.2 Seed sources

Eligible seeds may include only reproducible, provenance-known results already sanctioned by the research history, such as:

- Standard v1 delivered solutions for matching approved cases;
- previously recorded Standard-v2 research presets that materially improved a difficult case, including the coherent-only warm-start evidence where the exact filters/artifact are available and valid;
- any other prior research point only when its full filter payload, problem identity, cap, and source SHA/artifact provenance can be reconstructed and canonically validated.

If a historical result cannot be reconstructed exactly, it is not used as an official seed and is reported as unavailable rather than approximated.

### 6.3 Experiment

For each eligible known-good seed:

1. canonicalize/re-evaluate it against the current problem definition;
2. insert it into a seeded search path and local/neighborhood refinement path;
3. run a matched unseeded control search with the same optimizer family/budget where practical;
4. compare whether the seeded region survives, improves, or is rediscovered independently.

### 6.4 Interpretation

- **Seed is canonically good and remains/improves, but matched unseeded search cannot reach it:** discovery/seeding gap.
- **Seed loses its historical advantage after current canonical evaluation:** historical evidence is not transferable under the current problem definition; do not infer a discovery gap.
- **Unseeded search reliably rediscovers the region:** current global discovery is adequate for that case; focus elsewhere.

The purpose is causal diagnosis, not to promote v1 or warm-start behavior directly into production.

## 7. Diagnostic Track C — alternative multiobjective frontier construction

### 7.1 Question

Are the current five weighted scalar objective combinations under-sampling relevant portions of the RMSE/maxAbs Pareto frontier?

### 7.2 Required methods

The first diagnosis must add at least two objective constructions that do not reduce to the current weighted-sum family:

- **epsilon-constraint** search, where one primary metric is optimized under explicit constraints/sweeps on the other;
- **augmented Tchebycheff** search over normalized RMSE/maxAbs objectives.

A true multiobjective evolutionary method may be added later if these probes indicate a scalarization gap, but it is not required for the first diagnostic pass.

### 7.3 Cases

Initial objective diagnosis uses four representative cases:

- Titan S2 → Storm;
- Titan S2 → U12t;
- Titan S2 → Trio;
- one difficult synthetic case chosen from the existing adversarial set because it demonstrates either moving frontier, strong nonlinearity, or poor weighted-sum coverage.

The synthetic case must be chosen and recorded before inspecting the alternative-objective result; the implementation plan should prefer a case already identified as unresolved in the completed campaign.

### 7.4 Comparison

New candidates are not judged by their scalar objective score. They are canonically projected into the same RMSE/maxAbs Pareto space and unioned with:

- frozen Standard-v2 control;
- prior best-known Oracle cap frontier;
- candidates from the alternative objective searches.

### 7.5 Interpretation

- **New nondominated points in previously empty/weak frontier regions:** scalarization/objective-coverage gap.
- **No meaningful frontier extension despite independent objective formulations:** weighted-sum coverage is unlikely to be the principal bottleneck for the tested case/budget.

## 8. Diagnostic Track D — selective MaxFilters=20/40 capacity probe

### 8.1 Question

Is MaxFilters=10 itself the dominant source of residual error on the difficult real cases?

### 8.2 Cases and caps

Only the three approved real adversarial mappings are used initially:

- Titan S2 → Storm;
- Titan S2 → U12t;
- Titan S2 → Trio.

Run selective cap-frontier probes at:

```text
MaxFilters = 10  (existing reference)
MaxFilters = 20
MaxFilters = 40
```

The Max10 result should reuse existing valid evidence where possible instead of being recomputed.

### 8.3 Search policy

This is a capacity diagnosis, not a full recalibration campaign. Use enough search to establish whether capacity opens a materially better canonical region; do not automatically reproduce the full eight-seed DEEP matrix at Max20/40.

A staged policy is preferred:

1. cheap/screen-level Max20 and Max40 probe;
2. canonical frontier comparison to Max10 and control;
3. escalate only the cap/case combinations showing a substantial and scientifically relevant improvement.

### 8.4 Interpretation

- **Large canonical improvement with higher cap:** capacity/representation gap is important; further brute-force Max10 search becomes lower priority.
- **Little improvement despite higher cap:** filter count is not the principal explanation for that case under the tested search method.
- **Large Continuous gain but weak Deliverable gain:** deliverability/quantization/structural constraints become the next target rather than raw search capacity.

The diagnosis must report actual delivered filter counts, not merely cap labels.

## 9. Marginal compute and practical-convergence analysis

The completed SCREEN, CONFIRM, and DEEP artifacts must be analyzed before launching unnecessary new compute.

For every case, compute the change in the **best-known canonical cap frontier** across:

```text
SCREEN → CONFIRM
CONFIRM → DEEP
```

At minimum report:

- whether each later stage adds any nondominated point;
- normalized Pareto/regret or comparable frontier-distance improvement;
- change in the best RMSE region;
- change in the best maxAbs region;
- whether the frozen control changes dominance status;
- optimizer-family provenance of new frontier points.

A separate diagnostic classification may mark a case **practically stable** when additional compute changes the best-known frontier by less than a predeclared numerical tolerance, even if DE/CMA family agreement remains low.

This classification is diagnostic only. It does **not** alter the existing Oracle calibration convergence or freeze rules during this phase.

The implementation plan must define the practical-stability tolerance before running the new diagnosis, using numerical precision and existing campaign deltas rather than post-hoc tuning.

## 10. Experimental matrix and budget discipline

The first pass is deliberately selective.

| Track | Initial cases | Initial scale |
| --- | --- | --- |
| A — control local basin | Storm, U12t, Trio; add synthetics only if needed | multiple local starts, moderate budgets |
| B — known-good recovery | matching cases with exact reproducible seeds | paired seeded/unseeded runs |
| C — alternative objectives | Storm, U12t, Trio + 1 preselected hard synthetic | epsilon sweeps + Tchebycheff, screen/confirm scale |
| D — capacity | Storm, U12t, Trio | Max20/40 screen first, selective escalation |
| Marginal analysis | all 11 completed campaign cases | artifact-only; no new optimizer compute |

The exact evaluation budgets and seeds belong in the implementation plan. The design requirement is that the first pass remain substantially cheaper than another full 11-case DEEP campaign.

Any escalation must state which uncertainty it resolves. “More compute may help” is insufficient justification on its own.

## 11. Canonical evidence and artifact contract

Each diagnosis run must emit machine-readable evidence sufficient for deterministic re-analysis without rerunning the optimizer.

Every top-level diagnostic artifact records at least:

- schema/version;
- repository SHA;
- research-base SHA;
- case/problem ID and problem hash;
- corpus/case version;
- maxFilters and actual filter count;
- algorithm/objective family;
- exact optimizer configuration;
- seed/run index;
- evaluation budget and actual evaluation counts;
- source seed provenance where applicable;
- candidate/filter payload;
- surrogate metrics if used internally;
- canonical TypeScript metrics;
- candidate/frontier provenance;
- wall-clock timing as diagnostic metadata;
- reference control ID/hash;
- prior-oracle artifact/run IDs when reused;
- nondominance/dominance relationship against control and prior best-known frontier.

Aggregated artifacts must be deterministic with stable ordering and must refuse mismatched problem hashes, caps, schema versions, or control identities.

Official claims use canonical TypeScript metrics only. Python-side/surrogate objective values are search diagnostics.

## 12. Decision matrix

The purpose of Oracle Diagnosis v2 is to end with a causal routing decision, not merely a larger candidate set.

| Observed evidence | Primary diagnosis | Next research direction |
| --- | --- | --- |
| Control-seeded local search materially improves control | local/refinement search gap | strengthen/refactor local refinement and runtime continuation around good states |
| Known-good seed remains superior but unseeded search misses it | discovery/seeding gap | proposal generation, state bank, structural seeding, sparse/dictionary or v1-derived proposals |
| Alternative objectives add meaningful nondominated points | scalarization/frontier-coverage gap | replace/extend weighted objective construction in Oracle and later screening |
| Max20/40 materially outperform Max10 | capacity/representation gap | study filter efficiency, structural representation, cap-quality tradeoffs before more Max10 brute force |
| Continuous improves but Deliverable does not | deliverability gap | quantization/discrete/structural-delivery research |
| None of the above produces material improvement | current Max10 control is close to current best-known under tested representation/search | stop broad brute-force escalation; reconsider calibration semantics or representation with a written design amendment |

Multiple diagnoses may be true simultaneously. The report should quantify evidence strength per case rather than force a single global label.

## 13. Calibration and QTF gate

The existing calibration semantics remain unchanged during this diagnosis.

`OracleCalibrationManifestV1` may be frozen only if the corrected existing calibration process, with valid diagnosis evidence incorporated where appropriate, satisfies the current strict-improvement and validity gates.

If diagnosis finds useful nondominated improvements but the campaign still does not support a valid calibration manifest, QTF remains paused.

If diagnosis concludes that the control is already close to the best-known Max10 frontier and the current strict-improvement requirement is therefore structurally inappropriate, that is not resolved implicitly. It requires a **separate written design amendment** to calibration semantics before any manifest or QTF work proceeds.

Holdout remains unopened throughout.

## 14. Relationship to existing unreviewed WIP branch

A branch named `research/oracle-diagnosis-v2-2026-09-07` already exists and is ahead of the Oracle campaign base. At the time this design was written, its HEAD was observed at `c6ac58d97e6d0aa966a753d2b4acfbc8a58c2894`, with research code/tests related to seeded CMA, diagnostic objective search, and a diagnosis CI workflow.

That branch predates this written design-review gate in the current workflow and is therefore treated as **unreviewed implementation WIP**, not as accepted implementation or scientific evidence.

This design does not reset, rewrite, delete, or merge that branch. After this spec is approved and an implementation plan is written, the WIP branch may be audited against the approved design. Individual changes may then be reused, reworked, or rejected according to TDD, provenance, canonical-evaluation, and verification requirements.

No result produced solely by that WIP branch is promoted to calibration evidence until the implementation is brought under the approved spec/plan and verified at an exact SHA.

## 15. Implementation and verification policy

Implementation follows Efficient Workflow v2 and repository `AGENTS.md`:

- dedicated research branch/worktree;
- preserve unrelated WIP;
- TDD RED → GREEN for new behavioral/research contracts;
- focused Python/TypeScript tests first;
- one coherent global verification endpoint rather than repeated full-suite runs;
- `git diff --check` before completion;
- exact pushed SHA and remote CI as final evidence when remote execution is required;
- no production merge/deploy/release without explicit approval.

The implementation plan should prefer reuse of the optimized case-parallel orchestration where it reduces wall-clock without changing evidence semantics.

## 16. Exit criteria

Oracle Diagnosis v2 is complete when all of the following are true:

1. SCREEN→CONFIRM→DEEP marginal frontier analysis exists for all 11 completed cases;
2. the three real adversarial cases have a frozen-control local-basin result;
3. every available eligible known-good seed has a reproducibility/recoverability result or an explicit provenance-unavailable disposition;
4. the three real cases plus one preselected hard synthetic have alternative-objective results;
5. Storm/U12t/Trio have selective Max20/40 capacity evidence;
6. every official candidate is canonically evaluated and provenance-complete;
7. a final diagnosis report assigns supported gap hypotheses per case and recommends the next research branch;
8. calibration is either validly frozen under the existing rules or remains explicitly `insufficient`;
9. QTF and holdout remain untouched unless a later explicit gate is satisfied.

The desired scientific output is not necessarily a better preset. A well-supported conclusion that the current Oracle/search space is limited by capacity, discovery, scalarization, deliverability, or that the control is already near the present best-known frontier is a successful result because it determines where subsequent solver research should spend compute.
