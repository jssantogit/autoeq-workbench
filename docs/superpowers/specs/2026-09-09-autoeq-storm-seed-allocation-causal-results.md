# AutoEQ Research Bench — Storm Causal Seed Allocation v2

## Scope and routing

This is a Storm-only research comparison of concentrated versus distributed
structural descendant work. Terra High established the causal contracts and
handed an explicit `IMPLEMENT` task to Luna Max; Luna implemented and ran the
harness. Terra Medium remains the review/conclusion owner. No Sol or GPT-6
Astra consultation was used. No U12t/Trio, new solver family, holdout,
Calibration Manifest, promotion, default change, merge, release, deploy, or
publish was executed.

## Historical pilot disclaimer

The pilot at commit
`22a05fdcac88bdd603b7d80d7d96ffe10a28d606` is preserved in its historical
worktree and remains evidence only. It was `pilot equalized-v1`: target 5
equalized total `structural.candidates.length`, which included each seed's
initial re-evaluation. It selected the concentrated seed by lexical pool order
(`pool[0]`, `sparse-0007`) rather than the canonical frozen selector. It did
not answer the new causal question and is not treated as the definitive result.

## Frozen input and provenance

The same frozen source pool was supplied to both arms from the historical
`matching-pursuit-selection-beam-v2` Storm report:

`/root/projects/autoeq-workbench/.worktrees/capacity-aware-traversal-20260909/packages/core/.research-artifacts/mp-reallocation-corrective-20260909/storm-rerun1/tournament-report.json`

The source report SHA-256 is
`c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351`. The
report itself has no embedded producer commit; `sourceCommit` records the
historical worktree commit above. The frozen Oracle Reference Snapshot is
`/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json`, SHA-256
`0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3`.

The frozen pool SHA-256 is
`a87b9fbf856ff06cc750578a3d54abe0fdea697061ac462b8c414419814febd1`.
Its entry metrics, shown in deterministic frozen-pool order, are:

| Seed | Entry canonical RMSE | Entry canonical maxAbs |
| --- | ---: | ---: |
| `sparse-0007` | 2.0409828863 | 6.4471321227 |
| `sparse-0006` | 2.0830202178 | 6.3865182010 |
| `sparse-0005` | 2.2539075106 | 6.3831856382 |
| `sparse-0004` | 2.3644518552 | 8.9074503442 |
| `sparse-0003` | 2.6395014899 | 8.9135205660 |
| `sparse-0002` | 2.7568432481 | 9.7867172616 |
| `sparse-0001` | 3.3551539403 | 19.7496076060 |
| `sparse-0010` | 1.6944365617 | 6.0250191462 |
| `sparse-0009` | 1.8069840739 | 6.0291594855 |
| `sparse-0008` | 1.8938941990 | 6.4471425786 |

The primary was selected before structural execution by the existing frozen
`referenceSelector` semantics over entry metrics: `sparse-0010`. It was not
selected by lexical order, candidate ID, or generation order. The distributed
alternates were selected before execution by deterministic
`greedy-max-min-jaccard-v1` over semantic-key token sets: `sparse-0001` and
`sparse-0006`. The distributed arm includes the exact same primary.

## Common controls and work unit

Both arms used the unchanged structural beam with beam width 2, four proposals
per parent, local-polish allowance 24, Max10, canonical delivered evaluation,
standard-v2 quantization, the frozen snapshot, `reference-selector-v1`, and
cooperative 60,000 ms deadline/admission semantics.

The causal work unit was exactly new descendant structural evaluations. Seed
initialization/validation was counted separately and did not consume that
budget. The preallocated descendant target was 8. A preflight showed the
canonical primary can consume eight descendant evaluations under this fixed
mechanism before exhausting admissible proposals; the distributed `3/3/2`
allocation also consumed its assigned work, so the target was not reduced to
the prior target-5 pilot.

| Arm | Seed-validation evaluations | Descendant evaluations | Total structural candidates | Allocation |
| --- | ---: | ---: | ---: | --- |
| Concentrated | 1 | 8 | 9 | `sparse-0010`: 8 |
| Distributed | 3 | 8 | 11 | `sparse-0010`: 3; `sparse-0001`: 3; `sparse-0006`: 2 |

Final descendant equality is exact (`8 = 8`), all distributed seeds received
positive descendant work, and all three produced at least one descendant.
Therefore the artifact is `equalized` with `causalClaimAllowed: true`. The
distributed arm has two additional seed-validation evaluations; those are
reported overhead, not causal descendant work.

## Global outcomes

Metrics below are computed globally over each complete arm. Pareto novelty is
computed over all descendants in the arm; it is not a sum of local seed
counts. Selected-best changes and reference improvements count descendant
changes relative to the arm's initial validated seed baseline.

| Arm | Selected-best canonical RMSE | Selected-best canonical maxAbs | Directed Reference Regret v1 | Reference improved | Global Pareto-novel descendants | Global selected-best changes | Global reference improvements | First useful descendant | Descendants to best |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |
| Concentrated | 1.6944365617 | 6.0250191462 | 1.6357158772 | false | 2 | 0 | 0 | null | null (seed remained best) |
| Distributed | 1.6944365617 | 6.0250191462 | 1.6357158772 | false | 2 | 0 | 0 | null | null (seed remained best) |

Both arms had the same initial and final selected best, with zero RMSE/maxAbs
improvement per descendant evaluation. The distributed arm's local diagnostics
were `sparse-0010`: 2 Pareto-novel/0 selected changes, `sparse-0001`: 3
Pareto-novel/2 selected changes, and `sparse-0006`: 1 Pareto-novel/0 selected
changes. The global Pareto count is 2 rather than the local sum 6, and the two
alternate local changes never displaced the globally superior primary. All
three distributed seeds produced descendants; no seed was included solely for
validation.

## Interpretation

Because the primary was canonical and common, alternates were deterministic and
pre-run, all distributed seeds were exercised, and both arms consumed exactly
eight new descendant evaluations, this is a valid fixed-descendant-work
comparison for this Storm configuration and target. It shows practical
equivalence: distributing work did not improve the selected result, Pareto
novelty, selected-best changes, reference improvements, or improvement per
descendant evaluation; concentrating work did not improve them either.

The result does not establish a general allocation law or a representational
limit. Since both arms produced structural descendants but no useful global
progress, the allocation hypothesis is unresolved/unsupported as the primary
explanation of the Storm gap at this budget. Terra should decide whether to
close this allocation hypothesis and investigate proposal quality, bounded gain
solve, dictionary geometry/resolution, or residual-aware reallocation. Any
resulting implementation must be handed back to Luna.

## Artifacts

The new isolated evidence root is
`packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/`.
The JSON artifact is
[tournament-report.json](/root/projects/autoeq-workbench/packages/core/.research-artifacts/seed-allocation-causal-20260909/storm-target8/tournament-report.json)
with SHA-256
`322ed5ea9fd2c44c429dd3ccdcdc7987fcd86c56f4f9f35a71f9bd248ffe82f9`.
The historical pilot artifacts were not modified or copied over.

## Validation and gates

- Focused allocation and runner suites: `10/10` passed.
- Core typecheck: `pnpm --filter @autoeq-workbench/core typecheck` passed.
- Astra routing policy: `node --test .agents/skills/astra-orchestra/routing-policy.test.mjs`, `28/28` passed.
- Core benchmark: failed only at the pre-existing `Standard-v1 benchmark drift detected` guard; no baseline was changed.
- Core test suite: `522/525` passed in the root run launched concurrently with the other gates. The two known frozen Standard-v1/parity drifts remain; the third failure was a `runStandardAutoEqV2` timeout under that concurrent root invocation. The standalone core suite completed `523/525`, with only the two known drifts; no new allocation test failed.
- Root `pnpm typecheck`: passed.
- Root `pnpm build`: passed.
- Root `pnpm lint`: passed.
- `git diff --check`: passed.

## Blockers and next recommendation

The repository retains the known Standard-v1 fixture/normalization drift and the
existing V2 test timeout; this change did not alter those fixtures or baselines.
The causal Storm run itself is equalized and valid, but has no global useful
progress. Terra Medium should review this evidence and decide whether to close
seed-allocation as non-explanatory at this budget or route one of the four
follow-up investigations. No production promotion or default change is
recommended from this run.
