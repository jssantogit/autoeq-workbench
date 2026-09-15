# Post-Research Integration Audit

**Scope:** read-only reconciliation of the current checkout and frozen research evidence. No solver, benchmark, app, production setting, historical branch, Batch C case content, or sealed corpus was changed or run.

## 1. Recorded repository state

| Item | Observed value |
|---|---|
| Worktree | `/root/projects/autoeq-workbench` |
| Current branch / HEAD | `research/storm-diagnosis-20260910` / `117e70c10a447c3c1f48ba87d6ebcaffc6a67121` |
| `origin/main` | `2feb737906442dad73116f5a75dc4957abdd83a8` |
| Start state | Dirty: pre-existing modified and untracked WIP was preserved; none was reset, stashed, or included in this audit. |
| Protected product boundary | `origin/main` is the canonical product line. `packages/core/src/**` and `apps/**` were read-only in this audit. |
| Consolidation | `origin/main:docs/research/BRANCH_CONSOLIDATION_20260912.json` says the canonical tree source is `798614e…`, with 143 historical tips preserved in ancestry and rejected experimental trees **not reapplied**. |

This checkout is not `origin/main`; it also differs from it in V2/core and worker files. Findings below distinguish executable code observed in this checkout from authorization on the canonical product boundary. A historical branch being preserved by ancestry is not evidence that its tree or hypothesis was integrated.

`batchCAccessed = false`.

## 2. Standard V2 as actually implemented here

**Identity:** `standard-v2`, manifest schema 3, profile `Standard`, 48 kHz evaluation policy, settings-controlled limits. It is an error-metric optimizer, not a perceptually weighted or psychoacoustic objective.

| Pipeline stage | Main function(s) / behavior | Metric, limits, and stop behavior |
|---|---|---|
| FR/Target → preparation | `runStandardAutoEqV2`; `prepareCurve`, `desiredCorrection`, canonical grid | Valid FR + Target required; normalization applied; only frequencies inside configured `[minFrequencyHz,maxFrequencyHz]` retained. |
| Candidate generation | `generateV2Candidates` | Residual floor **0.15 dB**. PK extrema produce Q from width, multiplied by **0.5, 1, 2**, clamped to settings; LS/HS use edge median/sign/coverage evidence and Q=0.7. Modes are half-height, sign-crossing, then mixed. |
| Candidate selection/search | `rankV2CandidateShortlist`, `searchStandardV2WorkingSolutions` | Cheap score is unweighted squared-error decrease; deterministic ordering. At most **8** shortlist candidates; at most **3** active paths; alternatives within **1.02×** best normalized violation. On stagnant, still-above-target main path, one outside alternative may escape. Working cap is `min(hardMax=64, maxFilters + max(4, ceil(maxFilters/2)))`. |
| Refinement | `jointRefineV2`, staged/fallback control in `search.ts`, then `cyclicDiscreteRefineV2` | Up to **6** joint cycles. First refine retained staged candidates; use deferred candidates only if staged produced no improvement. A refined candidate must beat its parent by canonical comparator. |
| Deliverable | `buildDeliverableV2`, `constrainToCap`, quantization/finalization | Prunes working filters to delivery `maxFilters`; quantizes, discrete-refines, removes zero-gain filters, orders final filters, computes preamp and cancellation audit. On deadline with a fallback, keeps last known deliverable rather than partial replacement. |
| Compression → final PEQ | `compressDeliverableV2` | Only after target is achieved. Tries removals ordered by canonical solution comparator, refines/rebuilds each, retaining a removal only if the target remains achieved. |

**Deadline and termination:** hard deadline is settings time; exploration reserves `clamp(maxFilters*10 ms, 100, 400)`. Search stops as `time-limit`, `converged`, or `target-capable`; the outer runner then may finalize/compress under the hard deadline. The manifest reports `target-reached`, `converged`, or `time-limit`; final canonical metrics can downgrade a nominal target-reached result to converged.

### Implemented ranking, exactly

Primary comparator order is:

1. `max(rmseDb / 0.25, maxAbsDb / 0.75)` (**normalized violation**),
2. lower `rmseDb`,
3. lower `maxAbsDb`.

Structural tie-breaks then are:

4. lower cancellation `totalScore`,
5. lower maximum Q,
6. lower maximum absolute gain,
7. lower sum absolute gain,
8. fewer filters,
9. per-filter deterministic sequence: lower frequency, type `LS < PK < HS`, lower gain, lower Q.

For final deliverables only, target achievement (`RMSE ≤ 0.25` and `MaxAbs ≤ 0.75`) precedes normalized Euclidean delivered distance, then the comparator above. None of this is perceptual weighting.

## 3. Separate structural/Max10 path

`runStructuralSearch` is not called by `runStandardAutoEqV2`. In this checkout it is reachable as **`PRODUCT_OPT_IN_EXPERIMENTAL`**, not `PRODUCT_DEFAULT`:

* UI settings keep `experimentalMax10Enabled` false by default; it is an in-memory UI-store setting. The checkbox is enabled only when default frequency/gain/Q bounds are present and `maxFilters === 10`; changing settings clears an ineligible toggle.
* Run control sends `experimental-structural-max10` only with that explicit eligible toggle. Otherwise it sends `standard`.
* The worker independently rechecks eligibility, uses zero-start and `MAX10_Q31_B4_P8_EXPERIMENTAL_PRESET`, and dispatches `runStructuralSearch`; there is no fallback to Standard V2 inside that experimental request.
* The worker tags its result `experimentalStructuralSearch: {preset: "max10-q31-b4-p8-experimental", seedMode: "zero-start"}`. The controller requires that tag for experimental requests and rejects it on standard requests.

The structural closeout selects **`FROZEN_BASELINE`**, not VNext injection: M1 broad diversity failed (2/6), M2 protected stall failed (0/6), M3 was inconclusive/unsuitable, and M4’s O2/O4 candidate-existence signal did not meet generic online-injection coverage. Thus the UI's “validated” wording does not authorize promotion. The Max10 mode is a product-exposed sandbox/experiment, not an approved replacement for Standard V2. No structural combination beyond the frozen baseline survives as a generally authorized product algorithm.

## 4. Research inventory and outcome

| Research line | Frozen evidence / conclusion | Current code and authorization | Outcome |
|---|---|---|---|
| Standard V2 bench, ranking, candidate policy | Canonical selected baseline and deterministic comparator | Present in Standard V2 | `INTEGRATED_IN_PRODUCT` |
| Response/frequency/trig cache; trial-buffer reuse; lazy audits; progressive evaluation | Exact cost reductions where cached values preserve comparator inputs | Response cache + lazy removal cancellation audit present | `INFRASTRUCTURE_ONLY`, integrated; `SEMANTICS_PRESERVING` |
| Staged refinement | Selected staged-then-fallback traversal | Present in `search.ts`; it changes which refinements are attempted under a deadline | `INTEGRATED_IN_PRODUCT`; `SEARCH_SEMANTICS_CHANGING` |
| Capacity-aware traversal / storm diagnosis | Resource ceilings were not the generic quality blocker; 64 is ceiling, not a named optimization mode | No separately authorized policy identified | `NEGATIVE_CLOSED` |
| Structural VNext M1–M4 / semantic candidates | O2/O4 are promising local hypotheses, but `ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED` | No VNext injection in Standard V2 | `NEGATIVE_CLOSED` |
| Max10/Q31/B4/P8 | Bounded experimental structural mode, not a generic replacement decision | Worker/UI opt-in only | `INTEGRATED_AS_EXPERIMENTAL_OPT_IN` |
| Manual real-FR regression (`638a37e…`) | Frozen baseline plus scalability harness | `manualRegressionScalability.ts`, baseline JSON, `manualRegression.test.ts`, diagnostic workflow carried into canonical tree | `INTEGRATED_IN_PRODUCT` regression gate |
| C1 (`c2d88e3755306b101c11bee8468a6d0a1d623447`) | **`SIGNAL_MODEL_GENERALIZED; CAUSAL_INTEGRATION_NOT_SUPPORTED`**; valid C1g gate 2/6 vs required 4/6 | **`NOT_INTEGRATED`** | `NEGATIVE_CLOSED`; product **`NOT_AUTHORIZED`**; Batch C **`NOT_AUTHORIZED`** |
| C2 Huber-075 | C2b holdout divergence only 1/3; `C2_CLOSED_HOLDOUT_NOT_CONFIRMED` | Not used in search | `NEGATIVE_CLOSED`, not authorized |
| C3 filter-count/error knee | `FRESH_REAL_CORPUS_INSUFFICIENT`; no fresh six-case corpus, no frontier/selector calculated | Not implemented | `INCONCLUSIVE_CLOSED` |
| C4 peak-aligned consensus | Holdout signal 1/3; `C4_CLOSED_HOLDOUT_NOT_CONFIRMED` | Not integrated | `NEGATIVE_CLOSED`, not authorized |
| Research trace callbacks | Optional phase/candidate/refinement callbacks; no default product runtime enables them | Public core export but only observability | `INFRASTRUCTURE_ONLY` / `OBSERVABILITY_ONLY` |

C1 is closed. No confidence weighting, confidence-shaped target/attenuation, C1-derived loss change, or Batch C confirmation belongs in an integration shortlist. Any such proposal is **NEW RESEARCH**, not accepted-finding integration.

## 5. Manual real-FR regression coverage

The canonical carry-forward is deliberately narrow: frozen `manual-regression-baseline.json`, manual regression test, `manualRegressionScalability.ts`, and diagnostic workflow. It protects recorded real-FR baseline quality/scalability against unintentional Standard-V2 movement. It is a product regression gate, not evidence authorizing a new solver hypothesis. It does not cover every user FR/target pairing, all Max10 experimental behavior, or provenance/session round trips.

## 6. Research-leakage and provenance review

| Occurrence | Classification | Audit result |
|---|---|---|
| Max10 constants, worker dispatch, UI switch | `INTENTIONAL_PRODUCT_EXPERIMENT` | Explicit opt-in and marker exist; not Standard default. |
| `researchTrace` optional callbacks/exports | `OBSERVABILITY_ONLY` | No default UI/product runtime attachment found. |
| `runStructuralSearch` / presets exported from core index | `BENIGN_EXPORT` | Reachable only through explicit experimental worker path in app; export alone is not default integration. |
| C1/C2/C3/C4 | `BENIGN_EXPORT` / no product import | No production imports/hooks found. |
| Session persistence of experimental marker | `POTENTIAL_RESEARCH_LEAKAGE` | V2 validator accepts the extra marker but `canonicalizeRunManifest` rebuilds V2 manifests without it. Export filenames use source/target names only. An imported/exported session can therefore cease to distinguish experimental Max10 from Standard V2 provenance. Do not fix in this audit. |

No validated product behavior is merely labeled experimental by legacy that is eligible for promotion: the structural closeout blocks generic promotion. The Max10 label should remain experimental until separate product/scientific authorization exists.

## 7. Integration matrix and next work

The machine-readable matrix is [integration-matrix.json](../../../.research-artifacts/post-research-integration-audit/integration-matrix.json). There is **no positive, uncontradicted, fully specified scientific solver finding awaiting direct integration**.

| Priority | Action | Why / evidence | Risk / size | New research? |
|---:|---|---|---|---|
| 1 | `IMPLEMENT_CANDIDATE`: preserve and validate the explicit experimental marker through session import/export (and visibly distinguish it where runs are identified) | Worker/controller provenance contract exists; session canonicalization drops it. | Low scientific risk, medium UI/session compatibility scope; reversible. | No |
| 2 | `IMPLEMENT_CANDIDATE`: extend manual real-FR regression coverage to provenance/session behavior and the bounded Max10 path | Existing canonical manual regression baseline/harness is the accepted guard; current gap is identified above. | Low–medium test-fixture scope. | No |
| 3 | `KEEP` / product decision: retain Max10 as opt-in or archive/remove its UI exposure after product-owner decision | Structural closeout does not authorize generic promotion; UI exposure is intentional but a sandbox. | Medium UX/product risk; small implementation after decision. | No |

No C1/C2/C3/C4/structural-injection finding is an implementation candidate. C3 could only re-open as `NEW_RESEARCH_REQUIRED` after a materially new, approved corpus; it is not a next integration task.

## Direct answers

**A. What is it today?** A deterministic Standard-V2 FR-to-target PEQ optimizer: canonical preparation, residual candidates, bounded multi-path search, joint/discrete refinement, delivery cap, quantization/preamp and target-preserving compression. A separate zero-start Max10 Q31-B4-P8 structural path is explicitly opt-in experimental.

**B. What did research prove?** The canonical baseline/ranking/search and exact performance infrastructure are selected/integrated; manual real-FR regression is a usable quality guard. Structural research proved only local candidate-existence information, not generic injection. C1 proved its offline signal model generalized, not causal solver integration.

**C. What did it reject?** C1 causal integration; C2 Huber preference integration; C4 peak-alignment integration; generic VNext structural injection. C3 stopped inconclusively for insufficient fresh corpus.

**D. What is integrated?** Standard V2 is default; caches/lazy audit infrastructure and staged refinement are integrated. Max10 is integrated only as explicit experimental opt-in, not default.

**E. What remains to integrate?** No authorized positive scientific solver finding. Product-quality work can address experimental provenance and regression coverage without changing solver science.

**F. Next work:** the three-item shortlist above.

**G. Recommendation #1:** implement a backward-compatible session/export provenance contract that preserves and validates `experimentalStructuralSearch`, then add focused regression tests. It is evidence-backed, bounded, reversible, and does not re-open research or alter solver behavior.
