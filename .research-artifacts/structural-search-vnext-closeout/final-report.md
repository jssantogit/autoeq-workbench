# Structural Search VNext research program closeout

**Status: CLOSED.** This is a documentation/evidence consolidation artifact.
It does not implement M5, start another structural-search campaign, recalculate
any gate, or modify frozen aggregate evidence, benchmark goldens, or
Standard-v1.

## Final architectural decision

The selected algorithm is **`FROZEN_BASELINE`**: frozen baseline structural
search remains the selected algorithm. The VNext research program did not
establish sufficient evidence to replace or augment it generically.

This is not proof that structural alternatives can never help. The supported
conclusion is narrower:

> Existing O2 residual-region and O4 topology-substitution candidates show
> causal local value, but the predeclared case-coverage gate for generic online
> injection was not met.

O2/O4 remain a **`PROMISING_LOCAL_STRUCTURAL_HYPOTHESIS`**, not an approved
algorithm. No production change is authorized by this research series.

## Evidence chain and milestone decisions

The milestone artifacts and immutable commit/evidence references are indexed in
[`evidence-index.json`](./evidence-index.json). The final causal source of
truth is commit
`51bce1042fb7d5a3d75810a984ffe748e15e7e68`, with causal evidence SHA-256
`3e1dbd7ae3b13adc913b8e2c173fd59fc039fde4cce262c70ff0121d1fa73185`.

### M1 — broad always-on structural diversity: **`FAIL`**

- Development wins: **1/3**.
- Holdout wins: **1/3**.
- Overall wins: **2/6**.
- Four real cases worsened in both RMSE and maxAbs.
- Replacement path: **69 attempts / 69 polish / 0 accepted**.
- Broad diversification displaced useful ordinary search.
- VNext used substantially fewer filters but did not meet the quality
  requirements.

Architectural conclusion: do not run structural diversity globally or
continuously.

### M2 — protected exact-stall intervention: **`FAIL`**

- Development wins: **0/3**.
- Holdout wins: **0/3**.
- Overall wins: **0/6**.
- In real trajectories, the exact intervention trigger was effectively absent.
- Synthetic mechanism: **21 challengers constructed/polished**; **0 accepted**;
  **0 incumbent improvements**.
- Protected-progress wall-clock equivalence was not causally demonstrated; the
  result nevertheless provided no evidence of an M2 quality gain.

Architectural conclusion: exact numeric stall is too late/unreachable as a
useful real trigger, and the specific challenger mechanism was unsupported.

### M3 — structural-stagnation census: **`INCONCLUSIVE`**

Exact numeric stall occurs too late. **S3** is the materially earlier
structural signal, but structural no-novelty frequently occurs during
subsequently productive ordinary search. The M3 census also observed the S0
exact-stall control only at or after the completed 30-second boundary, so those
observations were not eligible live M2 intervention triggers.

Do not use simple structural stagnation as an online trigger.

### M3b — telemetry fidelity

- Telemetry classification: **`M3_TELEMETRY_WALLCLOCK_PERTURBATION_MATERIAL`**;
  S3 classification remains **`INCONCLUSIVE`**.
- Deterministic telemetry OFF/ON equivalence was confirmed under the frozen
  C43/e6 q31 envelope.
- Real wall-clock equivalence was not established; instrumentation may change
  time-bounded trajectories.
- S3 remained unsuitable as a simple intervention trigger.
- Unique-event normalization corrected overlapping signal interpretation.

Architectural conclusion: no binary stagnation trigger was supported. The
telemetry fidelity result is deterministic logical equivalence, not a claim of
real wall-clock equivalence or a causal attribution of time-path differences
to telemetry.

### M4 — structural candidate oracle (historical candidate existence)

Historical conclusion: **`STRUCTURAL_CANDIDATE_SIGNAL_SUPPORTED`**.

Corrected deterministic census:

- Development: **2/3**.
- Holdout: **3/3**.
- Overall: **5/6**.
- O1/O2/O3/O4 were evaluated shadow-only.
- Sampling generations were **0/10/20**.
- Deterministic repeats were identical and therefore are not independent
  replication.

This establishes candidate-existence evidence only. It does not authorize
online injection.

### M4 causal closeout

Final classification: **`ONLINE_STRUCTURAL_INJECTION_NOT_SUPPORTED`**.

De-duplicated historical `ORACLE_WIN` causal fates:

| Fate | Count |
| --- | ---: |
| `ORDINARY_ALREADY_GENERATED` | 5 |
| `NOVEL_Q31_REJECTED` | 1 |
| `VISITED_DUPLICATE` | 0 |
| `EXACT_BEAM_REJECTED` | 0 |
| `REFERENCE_NONIMPROVING` | 0 |
| `ONLINE_FEASIBLE_ORACLE_WIN` | 26 |

Online-feasible candidate families were **O1 = 0**, **O2 = 13**, **O3 = 0**,
and **O4 = 13**. Coverage was **development 1/3, holdout 3/3, overall 4/6**,
across six distinct case×generation cells.

Real cases with online-feasible evidence were **Mystic 8, Storm, Trio, and
U12t**. No online-feasible structural candidate was established for **RSV**
or **S12 Ultra**.

#### Causal interpretation

- RSV's historical useful O1 candidate was already generated and admitted by
  ordinary baseline.
- S12 Ultra had no historical oracle win.
- Therefore the development-gate failure is not caused by the single
  q31-rejected candidate. Changing q31 cannot by itself convert the causal
  result into a passing development gate.

The following are explicitly **not** the identified bottlenecks:

- **Beam retention:** for historical useful candidates,
  `EXACT_BEAM_REJECTED = 0`. Every online-feasible candidate survives the exact
  frozen beam counterfactual. The large descriptive historical
  `BEAM_REJECTED` count among all oracle candidates is not the causal reason
  useful candidates are missing.
- **Visited/dedup:** `VISITED_DUPLICATE = 0`.
- **Reference selection:** `REFERENCE_NONIMPROVING = 0`.
- **q31:** only one de-duplicated historical useful candidate is
  `NOVEL_Q31_REJECTED`; q31 is not the dominant bottleneck.

Candidate generation is locally incomplete, but not generically proven. O2/O4
construct **26 de-duplicated online-feasible useful candidates across four real
cases**, which is meaningful evidence that the ordinary generator can miss
useful topology. However, predeclared generic coverage was not reached because
only **1/3 development cases** showed that evidence. Do not convert this
localized signal into a production or general policy.

## Future interpretation and resource boundary

Record O2/O4 as **`PROMISING_LOCAL_STRUCTURAL_HYPOTHESIS`**, not an approved
algorithm. A future investigation may revisit O2/O4 only with materially new
independent evidence/corpus or a newly approved research program. Do not
continue reusing the same six cases to tune an injection policy until the
existing gate passes; doing so would compromise the holdout/development
interpretation.

Resource research remains closed:

- Do not reopen scheduler or resource-allocation research.
- Resource ceilings were not the blocker.
- **64 filters** remains a supported resource ceiling, never an optimization
  target or named mode.

The frozen baseline is selected because it remains the only architecture that
has not failed the applicable replacement/injection quality gates. VNext
alternatives supplied useful mechanistic information but insufficient generic
quality evidence.

## Provenance and non-actions

- Final causal commit: `51bce1042fb7d5a3d75810a984ffe748e15e7e68`.
- Final causal evidence SHA-256:
  `3e1dbd7ae3b13adc913b8e2c173fd59fc039fde4cce262c70ff0121d1fa73185`.
- All milestone commit and evidence references available in the repository are
  listed in `evidence-index.json`.
- Frozen M1–M4 evidence was not modified or recalculated.
- No benchmark golden or Standard-v1 artifact was updated. The known
  Standard-v1 floating drift remains documented and nonblocking.
- **M5 was not started**, and no new structural-search quality campaign was
  run.
