# AutoEQ V2 large-scale search/resource campaign

Status: **bounded infrastructure, gate, and one serial synthetic smoke cell** (2026-09-13)

This report is the integrity boundary for the isolated research line.  It does
not present an unrun timing matrix as evidence.  The campaign runner and probe
helpers are implemented; timing-sensitive cells remain explicitly unrun until
a predeclared campaign invocation is made.

## Starting and final line

- Worktree: `.worktrees/resource-envelope-generic-20260913`
- Branch: `research/resource-envelope-generic-20260913`
- Starting SHA verified before edits: `0100384552171afc7b35abbb144f128597531361`
  (`0100384`, natural structural-capacity evidence report)
- Starting line also contains `e27cfb9` (natural structural-demand harness).
- The final SHA is the commit containing this report; obtain it with
  `git rev-parse HEAD` rather than copying a pre-report SHA.
- The pre-existing untracked `.research-artifacts/` directory was preserved;
  no raw artifact or approved raw curve was rewritten or added.

## Inventory and corpus boundary

| Item | Count/status | Interpretation |
| --- | ---: | --- |
| Development real-FR cases | 3 | Titan → RSV, Mystic 8, S12 Ultra; existing approved manual fixtures |
| Holdout real-FR cases | 3 | Titan → Storm, U12t, Trio; no policy tuning performed |
| Synthetic ground-truth cases | 8 | Explicit deterministic A–H cascades, known complexity |
| Derived algorithmic-FR stress cases | 0 | Not materialized; no fixture-pair selection was made |
| New timing cells in this bounded handoff | 1 | One predeclared serial synthetic threshold cell; not a repeat distribution |
| New failed/skipped timing cells | 0 | No failed/skipped cell was recorded |
| Invariant focused tests | 26 across the changed research groups | Deterministic harness correctness only, not search-quality evidence |

The dedicated real robustness corpus search found only the approved static
fixtures and design/spec references.  No repeated-measurement, reseat, or
cross-rig corpus is available, so this line makes no physical-robustness claim.

## Implemented packages and gates

| Package | State | Evidence/limitation |
| ---: | --- | --- |
| 0 | **complete** | Capacity-only classification now distinguishes `no-headroom`, `available-but-unused`, `explored`, and `productively-used`.  The policy-qualified landmark is `first-headroom-before-legacy-expansion`; prior artifacts were not rewritten. |
| 1–2 | **complete** | `campaignRunner.ts` writes an append-safe `runs.jsonl` and `manifest.json`, derives stable IDs, resumes completed cells, records failed/skipped cells, and filters by case/family/envelope. Runtime provenance is recorded separately from deterministic identity. |
| 3–5 | **complete** | `multiQuantum.ts` runs continuing C/C+ × hold/ramp arms from cloned incumbents at nested 1/2/4/8/16 checkpoints and retains frontier, pressure, raw work, and first-new-slot event fields. No arm is selected as production policy. |
| 6–8 | **helper complete; cells unrun** | `fixedCapacity.ts` holds a generic ceiling while effort progresses, derives the ladder with `nextScalableCapacity`, and records 5/15/30-second continuing checkpoint labels. No wall-clock ladder was executed here. |
| 9–10 | **corpus available; cells unrun** | Existing development/holdout real-FR definitions remain unchanged. Holdout was not used to tune any rule. |
| 11 | **not run** | No compact optimizer-outcome-blind derived fixture set was needed for this bounded implementation; no external data was downloaded. |
| 12–14 | **helper complete; broad runs unrun** | `syntheticCorpus.ts` contains deterministic A–H families and below/at/above known-complexity probe helpers. Frequency-response correctness remains the intended synthetic criterion. |
| 15–18 | **not run** | Effort curves, delayed capacity payoff, legacy expansion fractions, and filter-count knees require declared serial repeats and are not inferred from unit tests. |
| 19–21 | **instrumentation complete; cells unrun** | Rich delivered metrics, complexity/pathology observations, and comparator-alignment reporting are available without changing the comparator. |
| 22–24 | **helper complete; cells unrun** | Actual V2 quantization, dense-grid preamp, and 44.1/48/96 kHz replay helpers exist. Re-optimization-at-each-rate remains a caller-level study. |
| 25–27 | **not run** | Repeat distributions, work-normalized views, and phase/runtime scaling need a declared timing campaign; machine time is not deterministic work. |
| 28–29 | **unsupported/engineering-only** | Real robustness corpus unavailable. Synthetic perturbation is intentionally not substituted into a physical robustness claim. |
| 30–32 | **discipline/helpers in place; cells unrun** | Development/holdout separation is documented; diversification and 64-ceiling stress were not run or scored by ceiling utilization. |
| 33–35 | **gate held** | Existing natural evidence does not justify another scheduler. A frozen allocator was not proposed, so no holdout policy comparison was allowed. |
| 36–37 | **complete** | This report and the machine-readable ledger separate completed infrastructure/evidence from unrun and unsupported packages; focused tests, core typecheck, and diff checks are recorded below. |

## Evidence from the preceding natural line

The committed natural report remains the source for the earlier causal result:
the 1 s/10 s trajectories reached large ceilings before observing frontier
saturation or blocked-capacity pressure, and capacity-only arms did not cross
their old ceilings.  That is limited natural evidence, not proof that fixed
capacity can never bind.  The new fixed-capacity and synthetic helpers exist
specifically to test that question without restarting matched continuations or
turning a ceiling into a product mode.

## Serial synthetic smoke evidence

One predeclared, serial, fixed-capacity threshold cell was run after the
infrastructure gate: synthetic D (the explicit 12-component dense known
structure), with ceilings 11, 12, and 13; generic effort ramp; and continuing
5/15/30-second labels.  It is one repeat only, so its differing wall-clock
paths are not a capacity causal estimate and it must not be treated as a
monotonicity result.  The raw append-only artifact remains uncommitted at
`.research-artifacts/resource-envelope-generic-20260913-smoke-r0/`:
`manifest.json` SHA-256 `b4de91993f11ce74f8ff82f4228c08233606606ebedc40b104afa8475f0ee141`;
`runs.jsonl` SHA-256 `b0f65b8783d20609b7130f4b540413650fc372e5de8224e3d07811a02ed3bae3`.

At the final label, all three ceilings reached their searched frontier and
reported blocked additive pressure in quantum 1.  Their final structural
violations were 0.3201 (11), 0.1998 (12), and 0.2274 (13); delivered filter
counts were 11, 11, and 12 respectively.  Thus the synthetic generator can
reach and explore the available range under pressure.  The 11-to-12 result is
consistent with useful representation freedom, while 12-to-13 regressed on
this single noisy trajectory.  This is deliberately reported as limited
engineering evidence—not an allocator rule, a filter-count knee, or a claim
that quality is monotonic in capacity.

## Resource and metric safeguards

- The existing structural comparator and incumbent-preservation guard are
  unchanged.  Rich metrics are observation only.
- Raw work dimensions remain separate; no weighted compute mega-score was
  introduced.
- Capacity is represented by numeric ceilings derived with
  `nextScalableCapacity`; no `Max10`/`Max15`/`Max20` algorithm was added.
- Quantization uses `quantizeV2Filters` and preamp uses the existing dense-grid
  `calculatePreampDb` implementation.  Weighted MAE is explicitly unavailable
  because no project weighting definition exists.
- Sample-rate replay evaluates the same filters at 44.1, 48, and 96 kHz.  It
  does not silently claim a redesign under each rate.

## Validation boundary

Commands run on this line:

| Command | Result |
| --- | --- |
| Focused research Vitest groups (semantic, runner, multi-quantum, fixed-capacity, synthetic, delivered metrics, oracle) | 7 files / 22 tests passed before final run-row assertion; subsequent runner group 4/4 passed |
| `pnpm --filter @autoeq-workbench/core typecheck` | exit 0 |
| `git diff --check` | exit 0 at each commit boundary |

The known Standard-v1 exact floating mismatch remains a separate broad-suite
issue and was not changed here.

## Architecture recommendation at this gate

Retain the existing fixed/legacy scheduling and observable resource telemetry;
prioritize serial fixed-capacity and synthetic evidence before considering a
capacity-on-demand or joint allocator rule.  The correct next result may be a
negative one: if fixed-capacity synthetic cases still do not consume new slots,
improve structural search/candidate generation before scheduler complexity.

See `AUTOEQ_V2_RESOURCE_CAMPAIGN_LEDGER_20260913.json` for the explicit
question-by-question status, including inconclusive and not-testable items.
