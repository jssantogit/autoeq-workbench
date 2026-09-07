# AutoEQ Workbench — Capacity-Aware Solver Program Amendment

**Status:** approved design, pending written-spec review  
**Date:** 2026-09-07  
**Amends:** `docs/superpowers/specs/2026-09-06-autoeq-solver-research-program-design.md`  
**Evidence branch:** `research/oracle-diagnosis-v2-2026-09-07`  
**Evidence HEAD at amendment authoring:** `c6ac58d97e6d0aa966a753d2b4acfbc8a58c2894`  
**Production control baseline:** `5dafaa50410b9fa3157c28a1f7757d676b33152a`

## 1. Authority and precedence

This amendment revises the research architecture after the corrected Oracle campaign and follow-up diagnosis materially changed the program's central hypothesis.

The original Solver Research Program Design remains authoritative where this amendment is silent. Where they conflict, this amendment supersedes the original design's broad oracle-led tournament sequence, Oracle/QTF dependency, algorithm-family breadth, and capacity-diagnosis workflow, especially the intent expressed in Sections 5, 6, 12–17, 24, and 25.

This amendment does **not** change production/default AutoEQ behavior, Standard v1, Standard v2, the frozen production control baseline, the canonical TypeScript evaluator, product filter bounds/types, session/export behavior, or release/deployment policy.

The following existing plans remain historical provenance and evidence even where their future execution sequence is superseded:

- `docs/superpowers/plans/2026-09-06-autoeq-solver-oracles.md`;
- `docs/superpowers/plans/2026-09-06-autoeq-solver-oracle-calibration-fix.md`;
- `docs/superpowers/plans/2026-09-07-autoeq-solver-oracle-campaign-optimization.md`.

The following unexecuted broad plans are superseded as forward implementation instructions and must be replaced after this amendment is reviewed:

- `docs/superpowers/plans/2026-09-06-autoeq-quality-time-frontier.md`;
- `docs/superpowers/plans/2026-09-06-autoeq-solver-family-screening.md`.

They remain useful historical design records and should not be rewritten to pretend the newer diagnosis was known earlier.

## 2. New diagnosis and revised central question

The corrected Oracle work no longer supports a generic question of “which optimizer family is best?” as the highest-value next step.

The current evidence separates the difficult real cases into materially different failure modes:

- **Storm:** local-search weakness plus discovery/seeding weakness plus a capacity component;
- **U12t:** discovery/seeding weakness plus a capacity component;
- **Trio:** primarily capacity-limited under the current Max Filters 10 representation;
- **objective scalarization:** no current evidence of a material objective-scalarization gap that justifies making alternative scalarizations a primary runtime-family axis.

The revised central research question is therefore:

> How much of the best-known Max20/40 delivered quality can be distilled into a Max10 representation, and which search mechanism finds those compact states quickly enough to improve the 5/15/30/60-second product trajectory?

This changes the program from a broad algorithm tournament into a **Capacity-Aware Solver Program** with two coupled research tracks:

1. **Fixed-Cap Max10 Search Recovery** — recover quality that is already representable with at most ten filters but is missed by current discovery, state allocation, or local refinement;
2. **High-Cap Teacher → Sparse Student** — use strong Max20/40 delivered solutions as offline teachers to test whether apparently capacity-dependent quality can be compressed back to at most ten filters.

Max Filters 10 remains the primary product problem. Max20/40 are research teachers and capacity probes, not an implicit product-setting change.

## 3. Architectural correction: reference evidence is not calibration evidence

The program previously overloaded one concept: the Oracle was expected both to provide a best-known research reference and to justify numerical promotion thresholds.

Those are different jobs and now have separate contracts.

### 3.1 `OracleReferenceSnapshotV1`

`OracleReferenceSnapshotV1` is the immutable input used by QTF, solver screening, capacity-gap measurement, and teacher selection for a declared research milestone.

It may be frozen whenever the artifact is valid and reproducible, even when the frozen Standard v2 control is itself on the best-known frontier and therefore has zero reference regret.

A reference snapshot does **not** certify global optimality and does **not** authorize product promotion.

For every declared `problemId × maxFilters` cell it records at least:

```text
version = 1
createdFromRepositorySha
corpusVersion
canonicalEvaluatorVersion
problemId
inputSha256
maxFilters
referenceState
control candidate/provenance
best-known deliverable frontier
optional continuous diagnostic frontier
candidate provenance
actual delivered filter count
canonical RMSE
canonical maxAbs
frontier/content hashes
search/campaign configuration references
```

`referenceState` is exactly one of:

```text
stable-under-current-search
still-moving
```

Do not use the stronger word `converged` as a claim of mathematical optimality. A best-known frontier may be stable under all currently approved search effort while remaining improvable by a future method.

The best-known deliverable frontier for a cell is constructed from the nondominated union of all valid, canonically evaluated known deliverable candidates for that cell, with the frozen Standard v2 control always admitted to the union before nondominated selection.

Therefore:

- if the control is nondominated, it legitimately remains a reference point;
- if another candidate dominates the control, the control may disappear from the final nondominated frontier while remaining recorded as the control candidate/provenance;
- a zero control regret is scientifically valid and is not a reason to reject the reference snapshot.

Continuous Oracle points remain valuable diagnostic evidence, but QTF and product-facing runtime regret are normalized against the **deliverable** reference frontier because runtime candidates are delivered presets.

### 3.2 `OracleCalibrationManifestV1`

`OracleCalibrationManifestV1` retains its stricter purpose: freeze promotion-policy thresholds only when development/adversarial evidence is informative enough to support them.

The existing refusal to freeze vacuous thresholds or evidence with no strict aggregate control improvement remains in force.

This amendment does not weaken that gate.

A Calibration Manifest is therefore **not** a prerequisite for:

- freezing a Reference Snapshot;
- implementing or computing QTF;
- measuring runtime/reference regret;
- measuring Max10/20/40 capacity gaps;
- screening research algorithms;
- running teacher→student compression experiments.

It becomes necessary again when the program is ready to freeze promotion thresholds before holdout/product-distillation decisions.

## 4. Directed reference regret contract

The existing symmetric distance-to-frontier regret is unsuitable as the primary QTF/reference measure once the frontier is explicitly “best-known” rather than an immutable optimum. A new solver must not be penalized for dominating its reference.

This amendment defines **Directed Reference Regret v1** for a delivered candidate point `c` and a deliverable reference frontier `F`:

```text
referenceRegretV1(c, F) = min over r in F of
  sqrt(
    (max(0, c.rmse - r.rmse) / 0.25)^2 +
    (max(0, c.maxAbs - r.maxAbs) / 0.75)^2
  )
```

The scales remain the research target scales:

```text
RMSE scale   = 0.25 dB
maxAbs scale = 0.75 dB
```

Semantics:

```text
candidate worse than every useful reference region  -> regret > 0
candidate equivalent to a reference point           -> regret = 0
candidate dominates at least one reference point    -> regret = 0
```

A separate boolean/diagnostic must disambiguate the last two cases:

```text
referenceImproved = true
```

when the candidate canonically dominates at least one point required to establish that the stored best-known reference is stale/improvable under the current cell contract.

A runtime candidate that improves the snapshot does **not** invalidate the run. The run remains evidence; its improved candidate is eligible to enter the next reference snapshot.

The existing symmetric `normalized_regret()` may remain available for historical diagnostics where required. It is not the normative QTF/reference-regret measure under this amendment.

## 5. Quality-Time Frontier under the Reference Snapshot

QTF remains a summary/ranking metric only. The primary evidence remains:

- raw canonical delivered RMSE;
- raw canonical delivered maxAbs;
- Pareto/frontier evidence;
- 5/15/30/60-second checkpoints;
- the complete monotonic best-so-far trajectory where available.

The unimplemented QTF plan's dependency on a frozen `OracleCalibrationManifestV1` is superseded.

The first implemented QTF contract must use the frozen `OracleReferenceSnapshotV1` for the exact `problemId × maxFilters` cell and Directed Reference Regret v1.

Conceptually, for best-so-far delivered reference regret `r(t)`:

```text
q(t) = exp(-max(0, r(t)))
```

and QTF integrates `q(t)` over the declared log-time interval. The previously proposed `0.5 s → 60 s` left-continuous piecewise-constant integration remains the preferred v1 integration rule unless implementation reveals a concrete incompatibility that requires a new reviewed spec amendment.

The canonical formula descriptor must identify the regret source as the best-known deliverable reference snapshot plus Directed Reference Regret v1. It must not claim `OracleCalibrationManifestV1` as the normalization authority.

Because QTF v1 has not yet been frozen as an implemented research artifact, the implementation may define QTF v1 directly with the corrected reference-regret semantics. If implementation discovery finds an already-frozen QTF v1 artifact in the repository/evidence set, the corrected formula must instead be versioned as QTF v2 rather than silently reinterpret an existing v1 artifact.

When `referenceImproved=true`, the corresponding QTF quality is `1` for that checkpoint and the report records the reference improvement. The solver is never assigned worse QTF quality merely because it surpassed its teacher/reference.

## 6. Track A — Fixed-Cap Max10 Search Recovery

This track tests whether Max10 quality is being lost because the current solver does not discover or allocate compute to useful compact states.

The primary runtime-relevant mechanisms are reduced to three families/components.

### 6.1 Resumable refinement + separate state bank

Continuation/resumable refinement becomes a first-class search mechanism rather than a scheduler micro-optimization.

Requirements:

- current deterministic refinement behavior must remain reproducible through a compatibility wrapper before scheduling experiments are trusted;
- a candidate can receive a bounded slice, pause, and resume later;
- fresh-state diversity and transferred/known-good state capacity are represented separately;
- transferred states do not consume or displace the same bounded fresh active-path slots merely by being inserted into one array;
- state origin is recorded explicitly, including at least `fresh`, `resumed`, `transferred`, and `known-good` where applicable;
- allocation decisions use Pareto/reference-selector semantics, not a new ad-hoc scalar ranking.

Known-good warm starts and Standard v1-derived states are proposal sources for this mechanism. They are no longer required to compete as independent complete solver families.

### 6.2 Sparse matching pursuit

Sparse dictionary / matching pursuit is a primary candidate because it directly targets structural discovery.

The laboratory implementation may use:

- deterministic biquad response dictionaries;
- greedy residual correlation;
- Orthogonal Matching Pursuit-like selection;
- bounded `lsq_linear`/least-squares gain solving;
- shelves where valid under the product contract;
- nonlinear Powell or equivalent bounded polish after sparse structure selection.

Every official checkpoint/result must still be canonically evaluated.

Matching pursuit may operate both from the original target residual and from teacher-derived structural proposals, but the final student is always scored against the original problem target.

### 6.3 Structural beam

Structural beam search remains the third runtime-relevant family/component.

Its useful actions include:

- add;
- remove;
- split;
- merge;
- filter-type mutation where product-valid;
- bounded local polish.

Seeds may come from fresh generation, the resumable/state-bank track, matching pursuit, or teacher-compression outputs. Beam retention must remain Pareto-first with the frozen Reference Pareto Selector used only where deterministic trimming is needed.

### 6.4 Diagnostic-only methods

Differential Evolution, CMA-ES, alternative scalarizations, epsilon-constrained objectives, Powell-only studies, and related broad global-search variants remain available in the laboratory as:

- Oracle/reference builders;
- local-minimum diagnostics;
- teacher discovery tools;
- polish primitives;
- falsification tools for specific hypotheses.

They are no longer mandatory primary runtime-family competitors unless new evidence specifically reopens that question.

This reduction is deliberate: the diagnosis has lowered the expected information gain from a broad generic optimizer tournament.

## 7. Track B — High-Cap Teacher → Sparse Student

This is a first-class experiment, not a side analysis.

Its purpose is to distinguish a true Max10 representational limit from a Max10 discovery/search failure.

### 7.1 Teacher eligibility

Official teachers are selected from canonically evaluated **deliverable** best-known Max20 and/or Max40 reference frontiers for the same problem contract except filter cap.

Continuous high-cap solutions may inform proposals and diagnostics but are not official teachers for product-deliverable compression claims until they have passed the same delivered/canonical rules.

Teacher artifacts retain full provenance, cell/cap, filters, canonical metrics, and reference snapshot identity.

### 7.2 Student construction

The student is constrained to:

```text
actualDeliveredFilterCount <= 10
```

A teacher-compression pipeline may combine:

1. teacher-response analysis and structural-region extraction;
2. matching-pursuit atom selection;
3. bounded least-squares gain fitting;
4. prune/remove of low-value atoms;
5. merge of redundant/nearby structures;
6. split/reallocation where a compact alternative benefits the original target;
7. deterministic deduplication;
8. bounded nonlinear polish;
9. final product quantization/delivery;
10. canonical evaluation against the original target.

The teacher is a proposal/structure source. The normative student objective remains the original AutoEQ target.

Teacher imitation error may be recorded as a diagnostic, but a student is not considered better merely because it approximates the teacher response more closely if its canonical error to the original target is worse.

### 7.3 Compression evidence

For every teacher/student attempt record at least:

```text
problemId
inputSha256
teacher snapshot/candidate ID
teacher maxFilters
teacher actualDeliveredFilterCount
teacher canonical metrics
student algorithm/config/seed
student actualDeliveredFilterCount
student canonical metrics
directed regret to Max10 reference
quality retained relative to teacher
structural operations used
evaluation/work budget
artifact hashes
```

A teacher-derived student that improves the frozen Max10 reference is valid evidence and causes `referenceImproved=true`; it does not invalidate the experiment.

## 8. Capacity-gap interpretation and `cap-limited` classification

A case must not be labeled `cap-limited` merely because Max20/40 performs better than the current Max10 control.

A strong `cap-limited` conclusion requires all of the following:

1. the best-known Max20 and/or Max40 deliverable frontier materially improves the stable-under-current-search Max10 deliverable reference;
2. the Max10 reference has received the declared Fixed-Cap search effort from the primary mechanisms relevant to that case;
3. teacher→student compression has been attempted with the declared deterministic configurations/seeds/budgets and canonical evaluation;
4. no resulting ≤10-filter student preserves enough high-cap quality to materially improve the stable Max10 reference under the same research decision policy;
5. the evidence is reproducible and artifact-backed.

If the Max10 or high-cap reference is `still-moving`, the case may be described as `capacity-suspected` but not conclusively `cap-limited`.

If a teacher-derived ≤10 student recovers a substantial fraction of high-cap quality, the case is reclassified as primarily a discovery/search problem even if Max20/40 remains numerically superior.

The current case-specific expectations are hypotheses to test, not acceptance rules:

- Storm should expose recoverable Max10 search/discovery gain plus some capacity effect;
- U12t should expose recoverable discovery/seeding gain plus some capacity effect;
- Trio may legitimately finish as `cap-limited` if compression repeatedly fails under stable references.

## 9. Narrowed screening program

The broad seven-family screening program is replaced by a diagnosis-driven screening program.

The mandatory primary candidates are:

```text
A. resumable/state-bank search with known-good/transfer proposal sources
B. sparse matching pursuit + teacher-compression components
C. structural beam seeded from A/B outputs where justified
```

The program may test A+B or B+C hybrids only after individual component evidence exists. Hybrid ablations must preserve causal attribution.

Standard v1-derived seeds, known-good warm starts, and teacher-derived candidates are **proposal-source variants**, not separate solver-family winners.

DE/CMA/global-continuous variants do not enter the main runtime tournament by default.

Screening still uses comparable work/evaluation budgets during cross-language laboratory comparison. Raw Python-vs-Node wall-clock is diagnostic only until a surviving mechanism is implemented in the same TypeScript/Node runner.

The final same-runtime tournament remains product-facing and must use the stable checkpoints:

```text
5 s
15 s
30 s
60 s
```

with one monotonic best-so-far trajectory per run.

## 10. Promotion evidence remains stricter than research ranking

The new Reference Snapshot and QTF semantics do not weaken promotion requirements.

Research ranking may use:

- QTF;
- Directed Reference Regret v1;
- quality versus evaluation/work count;
- case-specific gap recovery;
- teacher-compression retention.

Before product distillation, the surviving same-runtime candidate still requires:

- canonical delivered metrics;
- practical non-regression on relevant case/budget cells;
- material aggregate improvement under a frozen acceptance policy;
- monotonic best-so-far delivery;
- correct hard deadlines/cancellation;
- deterministic/reproducible declared behavior;
- no catastrophic holdout outlier after the holdout gate is legitimately opened.

`OracleCalibrationManifestV1` is frozen at this later promotion-policy boundary when evidence supports non-vacuous thresholds. It is not manufactured merely to satisfy a pipeline prerequisite.

## 11. Revised program sequence

The forward research sequence is now:

```text
corrected Oracle/diagnosis evidence
        ↓
freeze OracleReferenceSnapshotV1
        ↓
implement Directed Reference Regret v1 + QTF on reference snapshots
        ↓
Fixed-Cap Max10 Search Recovery
  ├─ resumable/state-bank + proposal sources
  ├─ sparse matching pursuit
  └─ structural beam
        ↓
High-Cap Teacher → Sparse Student
        ↓
case classification: search-recoverable / mixed / capacity-suspected / cap-limited
        ↓
select at most three mechanisms/components for same-runtime Node/TypeScript tournament
        ↓
5/15/30/60 same-runner adversarial tournament
        ↓
freeze non-vacuous OracleCalibrationManifestV1 / acceptance policy if supported
        ↓
holdout
        ↓
product distillation
```

The two middle research tracks may share primitives and execute in an information-efficient order. They must not be collapsed into one opaque hybrid before their independent evidence is understood.

## 12. Implementation boundary

The replacement implementation plan should preserve the repository's existing research isolation.

Expected research surfaces include, subject to exact plan review:

```text
research/solver-lab/
packages/core/benchmarks/research/
packages/core/test/autoeq/v2/research/
```

A compatibility-preserving continuation extraction may touch `packages/core/src/autoeq/v2/` only where necessary to expose resumable refinement semantics. Such changes must keep default `runStandardAutoEqV2()` behavior equivalent until a later explicit product-distillation decision.

No production solver promotion, UI change, export/session behavior change, default filter-cap change, merge, deploy, release, or publication is authorized by this amendment.

## 13. Artifact and provenance rules

Every new material artifact must preserve the original research reproducibility contract and additionally identify which role it serves:

```text
reference snapshot
calibration manifest
runtime trajectory
teacher
student/compression attempt
screening summary
same-runtime tournament result
```

Reference and calibration artifacts must never be silently substituted for each other.

Every result that depends on a snapshot records the exact snapshot content hash/identity. When a candidate improves the snapshot, the current run remains valid evidence and a later snapshot version incorporates the new point.

Historical artifacts remain interpretable under the formula/reference versions that created them.

## 14. Plan replacement requirements

After this amendment is reviewed and approved, write one coherent replacement implementation plan rather than separately executing the old QTF and broad Family Screening plans.

The plan must:

1. define and validate `OracleReferenceSnapshotV1` in Python and TypeScript-facing research contracts where needed;
2. implement Directed Reference Regret v1 with parity/edge-case tests;
3. implement the corrected QTF contract without a Calibration Manifest prerequisite;
4. implement the common runtime trajectory/reference-reporting contract needed by narrowed screening;
5. implement resumable refinement and separate state-bank scheduling with compatibility tests;
6. implement sparse matching pursuit and teacher→student compression;
7. implement structural beam using existing proven structural mutation primitives where possible;
8. run case-focused Fixed-Cap and compression studies before any broad tournament;
9. distill surviving mechanisms to a same-runtime Node/TypeScript 5/15/30/60 tournament;
10. stop at the promotion-policy gate if evidence still cannot support a non-vacuous `OracleCalibrationManifestV1`;
11. execute inline/directly in the current development session; do not use subagent-driven development for this program.

The implementation plan should use focused TDD, small coherent commits, explicit artifact checkpoints, and the repository's Efficient Workflow v2 verification cadence.

## 15. Completion criteria for this amended research cycle

This amended cycle is complete when it has produced:

1. a frozen, reproducible `OracleReferenceSnapshotV1` covering the declared research cells;
2. a parity-tested Directed Reference Regret v1 contract;
3. a QTF implementation normalized to the reference snapshot without calibration deadlock;
4. reproducible Fixed-Cap Max10 evidence from the three primary mechanisms/components;
5. reproducible Max20/40 teacher→Max10 student compression evidence;
6. an explicit per-case classification of search-recoverable, mixed, capacity-suspected, or cap-limited with evidence;
7. no more than three evidence-backed mechanisms/components entering the same-runtime tournament;
8. canonical 5/15/30/60 same-runner trajectories for those survivors;
9. either a justified non-vacuous Calibration Manifest/acceptance policy for the next gate or an explicit conclusion that calibration remains insufficient;
10. no holdout tuning and no production behavior change during the research cycle.

A valid negative result includes demonstrating that a stable high-cap advantage cannot be compressed to Max10 with the tested sparse/structural methods and that further Max10 search does not recover it. Such a result is scientifically useful because it distinguishes representational capacity from solver discovery failure.

## 16. Decision summary

The approved architectural decisions introduced by this amendment are:

- replace the broad generic algorithm tournament with a Capacity-Aware Solver Program;
- keep Max Filters 10 as the primary product problem;
- use Max20/40 as offline teachers/capacity probes rather than an automatic product-cap increase;
- separate `OracleReferenceSnapshotV1` from `OracleCalibrationManifestV1`;
- allow a valid reference snapshot when the control has zero regret;
- preserve strict/non-vacuous calibration rules for later promotion thresholds;
- use Directed Reference Regret v1 so a solver is not penalized for surpassing a best-known reference;
- make QTF depend on the Reference Snapshot, not Calibration Manifest freeze;
- prioritize resumable/state-bank search, sparse matching pursuit/teacher compression, and structural beam;
- demote DE/CMA/alternative scalarizations from mandatory runtime competitors to laboratory diagnostic/reference tools unless new evidence reopens them;
- require teacher compression before a strong `cap-limited` conclusion;
- preserve canonical delivered metrics and 5/15/30/60 trajectories as primary evidence;
- require a new replacement implementation plan after written-spec review;
- require direct inline execution without subagents for that plan.

This amendment authorizes replacement planning after written-spec review. It does not itself authorize production promotion, merge, deployment, release, publication, or default behavior changes.
