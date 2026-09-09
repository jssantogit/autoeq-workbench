# AutoEQ Capacity-Aware Solver — Max10 Anytime Research Results

Date: 2026-09-09
Campaign started: 2026-09-08
Branch: `research/capacity-aware-solver-plan-2026-09-07`

## 1. Outcome

This phase converted additional Max10 work into measured Pareto novelty and two
canonical improvements without changing the frozen selector, reference snapshot,
Standard AutoEQ v1, or any production default. The strongest new result is the
bounded MP → structural composition for Trio: `0.803210 / 2.314456 dB`
RMSE/maxAbs, which dominates both the earlier teacher → structural control
(`0.844990 / 2.447990 dB`) and the frozen reference. For U12t, anytime feedback
reaches `0.931265 / 3.026776 dB` and improves the reference; it is a Pareto
tradeoff against structural pure (`0.977549 / 2.913091 dB`).

Storm remains the falsification case. Feedback finds `1.603119 / 4.870561 dB`,
a materially lower maxAbs than MP without feedback, but it does not improve the
reference and trades away RMSE. The evidence supports a search/allocation
problem around opposing residual regions. It does not establish a Max10
representational limit, and Storm remains `search/representation unresolved`.

## 2. Astra V2 routing and bounded scope

Astra Orchestra routed the optimizer, deadline, continuation, Pareto-accounting,
and scheduler work directly through the native clean-context V2 worker profile
to `gpt-5.6-sol` at medium reasoning, with one worker and no Luna attempt.
Incorrect results could look valid and the task involved numerical search,
termination, and state coordination. Astra retained independent verification
ownership.
The implementation stayed inside the three existing research mechanisms:
matching pursuit (MP), structural beam, and state bank. No fourth solver family,
holdout, promotion threshold, Calibration Manifest, private curve, UI/session
change, production default, export change, release, or publication was added.

The changed research paths are:

- `packages/core/benchmarks/research/capacityTournament.ts`
- `packages/core/benchmarks/research/capacityTournamentRun.ts`
- `packages/core/benchmarks/research/matchingPursuit.ts`
- `packages/core/benchmarks/research/structuralBeam.ts`
- `packages/core/benchmarks/research/anytimeComposition.ts`
- focused tests under `packages/core/test/autoeq/v2/research/`

## 3. Measurable contracts

The phase used these contracts:

1. A deadline is cooperative. Work may start before 60 seconds and return after
   it; the runner must preserve the last admissible progress time, last work-unit
   start, observed variant return time, overshoot, and stop cause.
2. Every evaluated MP candidate belongs to exactly one of Pareto-novel, strictly
   dominated, or metric-equivalent. A selector change is separate from novelty.
3. The delivered best-so-far follows Pareto dominance and then the frozen
   `referenceSelectorKey`; RMSE alone need not decrease at every change.
4. Candidate count is a true delivered-candidate count. The existing MP
   `evaluationCount` remains a legacy credit counter because a bounded gain solve
   can perform up to 32 sweeps per candidate.
5. A continuation preserves MP cursor, visited selections, selector state, and
   generator state. Sliced and continuous execution are deterministic in one
   process; the state is not a serializable process-restart snapshot.
6. A work-conserving scheduler returns to MP when feedback is empty, consumes a
   zero-work duplicate without counting artificial work, and continues to the
   next queued seed. Completed MP and exhausted feedback cannot busy-loop.

## 4. Provenance and frozen inputs

The definitive campaign is:

- full artifact: `/tmp/autoeq-max10-20260908/final8/tournament-report.json`
- artifact size: approximately 501 MiB, including full progress and research traces
- artifact SHA-256: `246a90482ee2e8fa41b7401a66ed587b9cd9a5d0742a2543ede0ac9dbe0048c1`
- frozen source: `/tmp/autoeq-max10-20260908/final-source-v2`
- per-file source manifest: `/tmp/autoeq-max10-20260908/final-source-v2/SHA256SUMS`,
  SHA-256 `81c4eb783b5b8c9aef66747c19b070d7ec8b3a9cca79a081dd04235e27cde42f`
- frozen research diff SHA-256: `ae13fac67b8c1ce3d0465171982eea3510137d98650da8781bd085c00bf99153`
- repository HEAD: `f1c6b47b0da932c7def7029ffbeb56bae8661201`; the phase is uncommitted
- campaign command SHA-256: `cd0860d02a78576453daefc10d4e8c724d485e0894d53aee4927feb09f94cbb4`
- snapshot: `/tmp/autoeq-capacity-recovery-20260908/OracleReferenceSnapshotV1.json`
- snapshot content SHA-256: `0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3`
- snapshot file SHA-256: `a4cd8b8bd26669c8509e413a1f3c5c23e12bff1534f62ff38a741e836b8da1cd`
- runtime: Node `22.22.2`, pnpm `10.34.5`, seed `0`, Max10

The teacher seeds are the exact prior positive-control seeds from
`/tmp/autoeq-capacity-directed-20260908/proposal-seeds`, with hashes Storm
`7643f664fd2826e5a1890b03298fb438ba1b185b88fc70bb270104bac575e5cf`,
U12t `45ac88b922d93f670a66ca9c7349817af9d52b17da676b81fac5af11ecac8991`,
and Trio
`445d2fe3d191299a879f0c4e521e7177be4e2b5aa522c580e4fb48ba9e7a32e2`.
Their source IDs begin with `teacher-compression-v1:deliverable-oracle`.

An earlier diagnostic smoke under `smoke-short-variants` used MP recovery seeds
while two variants were labeled teacher. It is explicitly invalidated by
`INVALID-PROVENANCE.md` and contributes no teacher evidence. The corrected
teacher smoke is `/tmp/autoeq-max10-20260908/smoke-short-teacher-correct`
(SHA-256 `bf36ab4f5de4b71ad8b7f513cd356ebf9539d32a85c785bfd73298e4e3a4ca50`).

## 5. Honest cooperative deadline

The previous runner serialized `deadlineRespected: true` literally, independent
of wall clock. The corrected runner records `deadlineMode=cooperative`, the last
progress and last synchronous work-unit start, `observedElapsedMs`, `overshootMs`,
and a computed boolean. A TDD regression advances from admissible progress at
59 seconds through a synchronous operation that returns at 62 seconds; the
result preserves the 59-second progress, reports 2 seconds of overshoot, and
sets `deadlineRespected=false`.

Pure state-bank and structural wrappers check expiration after the synchronous
evaluation and before admitting progress. Composition callbacks use one root
clock and reject a component result observed at or after 60 seconds; the raw
late event remains diagnostic. Checkpoints do not retrodate late work. The nine
60-second runs in the definitive campaign returned with cooperative overshoots
between `11.750` and `25.756 ms`; every official 60-second checkpoint was the
last progress observed before the deadline.

`observedElapsedMs` ends when `variant.run` returns. It excludes subsequent
trajectory validation, cloning, JSON serialization, and total CLI shutdown.
A checkpoint `stopReason=deadline` records the cause used to terminate the
cooperative search; it does not claim that the process had already returned at
exactly 60 seconds.

## 6. MP telemetry before heuristic changes

Instrumentation was added before changing ordering. Each candidate records the
selection, removed/added atoms, attempted and accepted replacement, semantic
structural revisit, continuous and quantized metrics, zero-gain and bounded-gain
vectors, linear residual before/after the bounded solve, real biquad metrics,
parent improvement, reference improvement, selector change, and novelty class.
It also records elapsed time and both legacy evaluation credits and actual
candidate evaluations since the preceding useful improvement.

The zero-filter baseline is emitted before dictionary/matrix setup. Its quality
is therefore a real starting point while setup time remains charged to the
shared clock. Pre-solve, bounded continuous solve, and post-quantization values
are distinct; the bounded-gain field is not mislabeled as the linear model
residual. The definitive trace preserves the observed time separately from
checkpoint admission.

The following medians cover all non-baseline candidates in the instrumented
drop-major run. `Pre linear` is the zero-gain linear residual; `post linear`
follows the bounded gain solve; `real pre-Q` evaluates continuous biquads; and
`real post-Q` is the canonical delivered result. `RMSE/max harms` count positive
quantization deltas. A reversal means quantization exceeds a positive continuous
improvement against the parent.

| Case | candidates | pre linear → post linear | real pre-Q → post-Q | median residual reduction | RMSE/max harms | RMSE reversals | mean/median candidates per useful change | mean ms / legacy credits per useful change |
| --- | ---: | --- | --- | ---: | --- | ---: | --- | --- |
| Storm | 3218 | 3.608406 → 1.731279 | 1.710346 → 1.710172 | 1.898059 | 1137/779 | 3 | 55.91/12 | 957.59 / 11182.61 |
| U12t | 3057 | 2.714685 → 1.612602 | 1.565626 → 1.565527 | 1.149059 | 1999/691 | 0 | 235.83/1 | 4547.82 / 47166.67 |
| Trio | 3077 | 3.531936 → 1.613067 | 1.578875 → 1.578770 | 1.953061 | 1823/2552 | 7 | 18.63/12 | 311.21 / 3726.53 |

The bounded solve produces a large linear residual reduction in all cases, and
the real continuous response differs measurably from that model. Median
quantization deltas are small and RMSE reversals are rare (3/0/7), so
quantization is not supported as the main global cause, although individual
boundary candidates can still be affected. Legacy credits remain explicitly
separate from actual candidates.

## 7. Instrumented baseline

The first definitive instrumented baseline retained the original dictionary
order and drop-major replacement traversal. Artifact:
`/tmp/autoeq-max10-20260908/baseline-mp/tournament-report.json`, SHA-256
`79a870d918038662358736da06b0bfc018d7d2aa00527a6ffa2abd2aab3766c5`.

| Case | candidates | Pareto novel | dominated | equivalent | selector changes | accepted replacements | structural revisits | QTF |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Storm | 3219 | 256 | 2961 | 2 | 47 | 36 | 79 | 0.291377 |
| U12t | 3058 | 15 | 3043 | 0 | 13 | 3 | 39 | 0.682031 |
| Trio | 3078 | 531 | 2545 | 2 | 50 | 39 | 103 | 0.067032 |

Astra independently recomputed all 9,355 telemetry rows, 12 checkpoints, the
three QTF values, novelty partitions, and pairwise selector monotonicity.
Throughput is lower than an earlier uninstrumented report because deep telemetry
has real cost. Candidate-per-second changes across source snapshots are not
claimed as production speed changes.

The trace falsified the simplistic claim that only the first drop was attempted.
At the 60-second boundary, the first drop position received 2,870 attempts in
each case, while the second received 338 for Storm, 177 for U12t, and 197 for
Trio. Only first-position drops were accepted. The causal finding is temporal
enumeration bias under a deadline, not an absolute inability to visit later
positions.

The trace exposed a deeper bounded-search cause. All replacement IDs are from
pass 2, and every replacement selection has symmetric difference 2 from the
same ten-atom greedy base. Accepted selector changes are recorded, but
`bestSelectedIndices` is rebased only after the complete roughly `10 × 2870`
replacement traversal. Neither the 60-second deadline nor the legacy
5,000-candidate budget completes that pass. No accepted replacement therefore
becomes a parent during these runs, and multi-step replacement barriers are not
explored. When the deadline interrupts the pass, the result's `selectedAtoms` can
still describe the old base; canonical progress filters and lineage remain
authoritative.

## 8. Replacement-ordering ablations

Two bounded changes were tested in sequence. Dictionary round-robin changes only
the traversal; it does not compute residual rankings. Residual-ranked
round-robin adds one retained-gain solve and residual correlation ranking only
for that mode. Thus baseline → round-robin isolates alternation, and
round-robin → ranked round-robin isolates ranking. No new heuristic family was
introduced.

The round-robin artifact SHA-256 is
`b9f94e43ec414456630906b58de392a5bc349c166d1f66e8c56cac502c33dee6`;
the ranked artifact SHA-256 is
`0a2199bbcf66d61353dae1b219f9574ab39fcd71d144b5edcbc81908a5faa125`.

| Ordering | Case | final RMSE/maxAbs | regret | improved | QTF | candidates | novel/dominated/equiv | selector changes | accepted replacements |
| --- | --- | --- | ---: | :---: | ---: | ---: | --- | ---: | ---: |
| drop-major baseline | Storm | 1.587142/5.396137 | 0.993223 | F | 0.291377 | 3219 | 256/2961/2 | 47 | 36 |
| drop-major baseline | U12t | 1.256646/3.544907 | 0.134980 | F | 0.682031 | 3058 | 15/3043/0 | 13 | 3 |
| drop-major baseline | Trio | 1.259124/4.722497 | 2.186731 | F | 0.067032 | 3078 | 531/2545/2 | 50 | 39 |
| round-robin | Storm | 1.576605/5.852472 | 1.112735 | F | 0.240930 | 2938 | 71/2864/3 | 22 | 11 |
| round-robin | U12t | 1.100032/4.410832 | 0 | T | 0.920620 | 2738 | 198/2533/7 | 31 | 21 |
| round-robin | Trio | 1.337172/4.187276 | 2.034980 | F | 0.091430 | 2803 | 38/2764/1 | 19 | 8 |
| residual-ranked RR | Storm | 1.293423/6.023363 | 0.783846 | F | 0.227530 | 2656 | 157/2499/0 | 22 | 11 |
| residual-ranked RR | U12t | 1.250406/3.336060 | 0.110021 | F | 0.801290 | 3948 | 253/3695/0 | 17 | 7 |
| residual-ranked RR | Trio | 1.411817/4.269936 | 2.352589 | F | 0.066100 | 2716 | 109/2607/0 | 22 | 11 |

Round-robin produces the only reference improvement in these ordering runs,
for U12t, and sharply increases useful novelty there. Residual ranking improves
Storm late RMSE/regret relative to round-robin while worsening maxAbs and QTF;
it also loses the U12t reference improvement. The result supports selecting
ranked traversal as a useful composition input for Storm exploration, while
rejecting a universal-quality claim.

## 9. Storm falsification and residual diagnosis

An independent residual audit is stored in
`/tmp/astra-storm-residual-audit.jsonl`. The drop-major baseline has residual
extrema `-5.396 dB @ 7561 Hz` and `+5.372 dB @ 10240 Hz`; round-robin reaches
`+5.852 dB @ 10240 Hz`; ranked round-robin reaches `-6.023 dB @ 7561 Hz` and
`+5.034 dB @ 10240 Hz`. Ranked traversal lowers bass and low-mid band RMSE from
`1.640/1.233` to `0.940/0.482`, while mid and presence rise from `0.818/1.723`
to `1.252/1.947`.

The selected Storm structures repeatedly allocate high-Q filters near the
opposing residual regions. A `PK 7453 Hz, -15 dB, Q 8` and an `HS 19331 Hz,
+15 dB` persist. Replacement ranking can improve one band while making another
selector dimension worse; locally attractive bounded-gain moves need not be
globally attractive after quantization and all ten allocations interact. The
feedback composition later lowers maxAbs to `4.870561 dB`, confirming that the
existing structural/state-bank mechanisms expose a different useful direction.
No Storm run improves the frozen reference, so dictionary resolution,
multi-replacement barriers, temporary worsening, quantization, and allocation
remain live hypotheses. None is promoted to a representational-limit claim.

| Hypothesis | Verdict from this phase |
| --- | --- |
| Drop/add locality and traversal | Confirmed limitation: drop-major exposure is position-biased under the deadline; round-robin changes outcomes causally. |
| Parent rebasing / multi-replacement | Confirmed limitation: every replacement is one swap from the greedy base; accepted replacements are not expanded before termination. |
| Bounded-gain basin/model | Material but unresolved: the solve sharply lowers linear residual, while real biquad metrics differ consistently from that model. |
| Dictionary resolution | Unresolved: no resolution ablation was added, and persistent high-Q boundary filters keep it plausible. |
| Replacement ranking | Causally mixed: it helps Storm RMSE/regret versus round-robin, hurts maxAbs/QTF, and loses the U12t improvement. |
| Quantization | Measured, not primary in aggregate: median deltas are small and only 3/0/7 RMSE reversals occur; local effects remain possible. |
| Visited blocking | No selection-key duplication was observed; semantic structural revisits exist, so delivered equivalence rather than raw-key blocking is the measured issue. |
| Candidate generation versus selector | Generation stays active and produces novelty; only 47/13/50 baseline candidates change the frozen selector. This is sparse utility, not evidence of a selector bug. |
| Refinement timing | Structural/state-bank work is short and seed-dependent; MP remains active until deadline. Feedback proves useful cross-component handoff with bounded per-seed depth. |

## 10. Continuation and anytime scheduler

MP now has a real in-process generator continuation. `advance` resumes the same
cursor, visited set, selected solution, telemetry sequence, and selector state;
a focused regression proves exact continuous-versus-sliced candidates,
trajectory, and diagnostics. Cancellation between slices emits no extra
candidate, and advancing a completed continuation is inert.

The feedback scheduler alternates 64-candidate MP slices with FIFO handoffs.
Only a non-baseline MP candidate that is both Pareto-novel and a selector change
enters the queue. Semantic filter keys ignore generated IDs. Each seed receives
structural beam width 2, four proposals per parent, 24 local-polish evaluations,
and a 12-candidate budget, followed by state-bank refinement of the best
structural descendant. Zero seeds are not re-evaluated during handoff. Empty
queues return control to MP, and exhausted/duplicate seeds consume queue state
without being counted as evaluations.

The `MP→structural` ablation instead spends 15 seconds in MP, hands its selected
seed once to structural search, and terminates with `phase-budget`. Metadata
preserves `mpContinuationHadAdmissibleWork=true`; its early return is pipeline
completion, not global search-space exhaustion.

## 11. Definitive tournament protocol

The definitive campaign runs these eight variants for Storm, U12t, and Trio:
MP pure, state-bank pure, state-bank+teacher, structural pure,
teacher→structural, MP→structural, anytime without feedback, and anytime with
feedback. Every variant/case is one continuous run observed at 5/15/30/60
seconds. The frozen Pareto/reference selector remains authoritative.

Abbreviations in the full tables are `MP`, `SB`, `SB+T`, `ST`, `T→ST`,
`MP→ST`, `AT−F`, and `AT+F`. `cand` is cumulative real candidates; `novel`,
`dom`, and `eq` are the global novelty partition; `ops` counts structural
operations. `observed` is the elapsed time of the source progress used by that
checkpoint. The termination column gives the eventual run return cause and
cooperative overshoot. Repeated rows for mechanisms that ended early are
terminal best-so-far observations, not claims of continued work.

## 12. Complete 5/15/30/60 second results

### Storm — 32 checkpoints

| Variant | t | RMSE | maxAbs | n | regret | imp | QTF | cand | novel | dom | eq | ops | bestOrigin | progress elapsed | final return/stop |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| MP | 5s | 1.656483 | 5.738167 | 10 | 1.339850 | F | 0.248586 | 236 | 37 | 199 | 0 | 225 | MP-repl | 4996.340 ms | 60011.750 ms; deadline; over 11.750 ms |
| MP | 15s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.248586 | 818 | 69 | 749 | 0 | 807 | MP-repl | 14981.776 ms | 60011.750 ms; deadline; over 11.750 ms |
| MP | 30s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.248586 | 1611 | 109 | 1502 | 0 | 1600 | MP-repl | 29991.101 ms | 60011.750 ms; deadline; over 11.750 ms |
| MP | 60s | 1.287965 | 6.022374 | 10 | 0.774757 | F | 0.248586 | 3291 | 185 | 3106 | 0 | 3280 | MP-repl | 59991.773 ms | 60011.750 ms; deadline; over 11.750 ms |
| SB | 5s | 3.608406 | 19.731539 | 0 | 21.132378 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 15.421 ms | 16.395 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 15s | 3.608406 | 19.731539 | 0 | 21.132378 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 15.421 ms | 16.395 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 30s | 3.608406 | 19.731539 | 0 | 21.132378 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 15.421 ms | 16.395 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 60s | 3.608406 | 19.731539 | 0 | 21.132378 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 15.421 ms | 16.395 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 5s | 1.787642 | 5.497997 | 10 | 1.798289 | F | 0.165582 | 6 | 4 | 0 | 2 | 0 | teacher-transfer | 140.051 ms | 140.467 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 15s | 1.787642 | 5.497997 | 10 | 1.798289 | F | 0.165582 | 6 | 4 | 0 | 2 | 0 | teacher-transfer | 140.051 ms | 140.467 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 30s | 1.787642 | 5.497997 | 10 | 1.798289 | F | 0.165582 | 6 | 4 | 0 | 2 | 0 | teacher-transfer | 140.051 ms | 140.467 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 60s | 1.787642 | 5.497997 | 10 | 1.798289 | F | 0.165582 | 6 | 4 | 0 | 2 | 0 | teacher-transfer | 140.051 ms | 140.467 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| ST | 5s | 1.683100 | 5.032532 | 5 | 1.377056 | F | 0.233739 | 81 | 18 | 63 | 0 | 80 | structural | 947.686 ms | 1054.613 ms; no-admissible-proposals; over 0.000 ms |
| ST | 15s | 1.683100 | 5.032532 | 5 | 1.377056 | F | 0.233739 | 81 | 18 | 63 | 0 | 80 | structural | 947.686 ms | 1054.613 ms; no-admissible-proposals; over 0.000 ms |
| ST | 30s | 1.683100 | 5.032532 | 5 | 1.377056 | F | 0.233739 | 81 | 18 | 63 | 0 | 80 | structural | 947.686 ms | 1054.613 ms; no-admissible-proposals; over 0.000 ms |
| ST | 60s | 1.683100 | 5.032532 | 5 | 1.377056 | F | 0.233739 | 81 | 18 | 63 | 0 | 80 | structural | 947.686 ms | 1054.613 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 5s | 1.613451 | 5.517595 | 10 | 1.106257 | F | 0.330795 | 34 | 5 | 29 | 0 | 32 | teacher-seed | 688.839 ms | 948.582 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 15s | 1.613451 | 5.517595 | 10 | 1.106257 | F | 0.330795 | 34 | 5 | 29 | 0 | 32 | teacher-seed | 688.839 ms | 948.582 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 30s | 1.613451 | 5.517595 | 10 | 1.106257 | F | 0.330795 | 34 | 5 | 29 | 0 | 32 | teacher-seed | 688.839 ms | 948.582 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 60s | 1.613451 | 5.517595 | 10 | 1.106257 | F | 0.330795 | 34 | 5 | 29 | 0 | 32 | teacher-seed | 688.839 ms | 948.582 ms; no-admissible-proposals; over 0.000 ms |
| MP→ST | 5s | 1.656483 | 5.738167 | 10 | 1.339850 | F | 0.256255 | 237 | 37 | 200 | 0 | 226 | zero→matching-pursuit:matching-pursuit-replacement | 4991.222 ms | 15618.200 ms; phase-budget; over 0.000 ms |
| MP→ST | 15s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.256255 | 773 | 68 | 705 | 0 | 762 | zero→matching-pursuit:matching-pursuit-replacement | 14993.588 ms | 15618.200 ms; phase-budget; over 0.000 ms |
| MP→ST | 30s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.256255 | 791 | 69 | 721 | 1 | 778 | zero→matching-pursuit:matching-pursuit-replacement | 15396.656 ms | 15618.200 ms; phase-budget; over 0.000 ms |
| MP→ST | 60s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.256255 | 791 | 69 | 721 | 1 | 778 | zero→matching-pursuit:matching-pursuit-replacement | 15396.656 ms | 15618.200 ms; phase-budget; over 0.000 ms |
| AT−F | 5s | 1.656483 | 5.738167 | 10 | 1.339850 | F | 0.258856 | 234 | 37 | 197 | 0 | 223 | zero→matching-pursuit:matching-pursuit-replacement | 4981.511 ms | 60018.023 ms; deadline; over 18.023 ms |
| AT−F | 15s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.258856 | 741 | 68 | 673 | 0 | 730 | zero→matching-pursuit:matching-pursuit-replacement | 14990.875 ms | 60018.023 ms; deadline; over 18.023 ms |
| AT−F | 30s | 1.640028 | 5.282105 | 10 | 1.204767 | F | 0.258856 | 1575 | 109 | 1466 | 0 | 1564 | zero→matching-pursuit:matching-pursuit-replacement | 29983.922 ms | 60018.023 ms; deadline; over 18.023 ms |
| AT−F | 60s | 1.293423 | 6.023363 | 10 | 0.783846 | F | 0.258856 | 3149 | 176 | 2973 | 0 | 3138 | zero→matching-pursuit:matching-pursuit-replacement | 59994.122 ms | 60018.023 ms; deadline; over 18.023 ms |
| AT+F | 5s | 1.740019 | 4.765690 | 6 | 1.604733 | F | 0.245333 | 276 | 43 | 233 | 0 | 245 | MP→ST→SB:sparse-0003:transferred | 4987.983 ms | 60025.756 ms; deadline; over 25.756 ms |
| AT+F | 15s | 1.623410 | 5.039939 | 10 | 1.138296 | F | 0.245333 | 860 | 71 | 788 | 1 | 776 | MP→ST→SB:sparse-0010:transferred | 14982.593 ms | 60025.756 ms; deadline; over 25.756 ms |
| AT+F | 30s | 1.636237 | 4.972503 | 10 | 1.189602 | F | 0.245333 | 1706 | 106 | 1598 | 2 | 1566 | MP→ST→SB:replacement-2-0054:transferred | 29995.410 ms | 60025.756 ms; deadline; over 25.756 ms |
| AT+F | 60s | 1.603119 | 4.870561 | 10 | 1.057129 | F | 0.245333 | 3210 | 165 | 3041 | 4 | 3062 | MP→ST→SB:replacement-2-2328:transferred | 59987.910 ms | 60025.756 ms; deadline; over 25.756 ms |

### U12T — 32 checkpoints

| Variant | t | RMSE | maxAbs | n | regret | imp | QTF | cand | novel | dom | eq | ops | bestOrigin | progress elapsed | final return/stop |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| MP | 5s | 1.256646 | 3.544907 | 10 | 0.134980 | F | 0.790111 | 287 | 23 | 264 | 0 | 276 | MP-repl | 4997.225 ms | 60020.438 ms; deadline; over 20.438 ms |
| MP | 15s | 1.257010 | 3.419090 | 10 | 0.136434 | F | 0.790111 | 1011 | 73 | 938 | 0 | 1000 | MP-repl | 14992.336 ms | 60020.438 ms; deadline; over 20.438 ms |
| MP | 30s | 1.250406 | 3.336060 | 10 | 0.110021 | F | 0.790111 | 2137 | 151 | 1986 | 0 | 2126 | MP-repl | 29989.356 ms | 60020.438 ms; deadline; over 20.438 ms |
| MP | 60s | 1.250406 | 3.336060 | 10 | 0.110021 | F | 0.790111 | 4299 | 256 | 4043 | 0 | 4288 | MP-repl | 59995.391 ms | 60020.438 ms; deadline; over 20.438 ms |
| SB | 5s | 2.714685 | 12.870304 | 0 | 12.198867 | F | 0.000005 | 2 | 1 | 0 | 1 | 0 | fresh | 2.585 ms | 2.743 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 15s | 2.714685 | 12.870304 | 0 | 12.198867 | F | 0.000005 | 2 | 1 | 0 | 1 | 0 | fresh | 2.585 ms | 2.743 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 30s | 2.714685 | 12.870304 | 0 | 12.198867 | F | 0.000005 | 2 | 1 | 0 | 1 | 0 | fresh | 2.585 ms | 2.743 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 60s | 2.714685 | 12.870304 | 0 | 12.198867 | F | 0.000005 | 2 | 1 | 0 | 1 | 0 | fresh | 2.585 ms | 2.743 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 5s | 1.062808 | 3.178085 | 10 | 0.000000 | T | 1.000000 | 7 | 5 | 0 | 2 | 0 | teacher-transfer | 134.999 ms | 135.124 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 15s | 1.062808 | 3.178085 | 10 | 0.000000 | T | 1.000000 | 7 | 5 | 0 | 2 | 0 | teacher-transfer | 134.999 ms | 135.124 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 30s | 1.062808 | 3.178085 | 10 | 0.000000 | T | 1.000000 | 7 | 5 | 0 | 2 | 0 | teacher-transfer | 134.999 ms | 135.124 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 60s | 1.062808 | 3.178085 | 10 | 0.000000 | T | 1.000000 | 7 | 5 | 0 | 2 | 0 | teacher-transfer | 134.999 ms | 135.124 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| ST | 5s | 0.977549 | 2.913091 | 8 | 0.000000 | T | 0.943435 | 201 | 36 | 165 | 0 | 200 | structural | 3397.803 ms | 3561.704 ms; no-admissible-proposals; over 0.000 ms |
| ST | 15s | 0.977549 | 2.913091 | 8 | 0.000000 | T | 0.943435 | 201 | 36 | 165 | 0 | 200 | structural | 3397.803 ms | 3561.704 ms; no-admissible-proposals; over 0.000 ms |
| ST | 30s | 0.977549 | 2.913091 | 8 | 0.000000 | T | 0.943435 | 201 | 36 | 165 | 0 | 200 | structural | 3397.803 ms | 3561.704 ms; no-admissible-proposals; over 0.000 ms |
| ST | 60s | 0.977549 | 2.913091 | 8 | 0.000000 | T | 0.943435 | 201 | 36 | 165 | 0 | 200 | structural | 3397.803 ms | 3561.704 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 5s | 1.049870 | 3.145749 | 7 | 0.000000 | T | 1.000000 | 42 | 11 | 31 | 0 | 40 | structural | 817.296 ms | 901.404 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 15s | 1.049870 | 3.145749 | 7 | 0.000000 | T | 1.000000 | 42 | 11 | 31 | 0 | 40 | structural | 817.296 ms | 901.404 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 30s | 1.049870 | 3.145749 | 7 | 0.000000 | T | 1.000000 | 42 | 11 | 31 | 0 | 40 | structural | 817.296 ms | 901.404 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 60s | 1.049870 | 3.145749 | 7 | 0.000000 | T | 1.000000 | 42 | 11 | 31 | 0 | 40 | structural | 817.296 ms | 901.404 ms; no-admissible-proposals; over 0.000 ms |
| MP→ST | 5s | 1.256646 | 3.544907 | 10 | 0.134980 | F | 0.832053 | 266 | 22 | 244 | 0 | 255 | zero→matching-pursuit:matching-pursuit-replacement | 4995.651 ms | 15977.882 ms; phase-budget; over 0.000 ms |
| MP→ST | 15s | 1.255419 | 3.436033 | 10 | 0.130070 | F | 0.832053 | 924 | 63 | 861 | 0 | 913 | zero→matching-pursuit:matching-pursuit-replacement | 14989.496 ms | 15977.882 ms; phase-budget; over 0.000 ms |
| MP→ST | 30s | 1.132316 | 3.412392 | 8 | 0.000000 | T | 0.832053 | 958 | 66 | 891 | 1 | 945 | zero→matching-pursuit→structural:structural-beam-proposal | 15701.620 ms | 15977.882 ms; phase-budget; over 0.000 ms |
| MP→ST | 60s | 1.132316 | 3.412392 | 8 | 0.000000 | T | 0.832053 | 958 | 66 | 891 | 1 | 945 | zero→matching-pursuit→structural:structural-beam-proposal | 15701.620 ms | 15977.882 ms; phase-budget; over 0.000 ms |
| AT−F | 5s | 1.256646 | 3.544907 | 10 | 0.134980 | F | 0.844901 | 301 | 23 | 278 | 0 | 290 | zero→matching-pursuit:matching-pursuit-replacement | 4987.926 ms | 60014.845 ms; deadline; over 14.845 ms |
| AT−F | 15s | 1.257010 | 3.419090 | 10 | 0.136434 | F | 0.844901 | 993 | 71 | 922 | 0 | 982 | zero→matching-pursuit:matching-pursuit-replacement | 14973.639 ms | 60014.845 ms; deadline; over 14.845 ms |
| AT−F | 30s | 1.250406 | 3.336060 | 10 | 0.110021 | F | 0.844901 | 2091 | 149 | 1942 | 0 | 2080 | zero→matching-pursuit:matching-pursuit-replacement | 29996.242 ms | 60014.845 ms; deadline; over 14.845 ms |
| AT−F | 60s | 1.250406 | 3.336060 | 10 | 0.110021 | F | 0.844901 | 4089 | 256 | 3833 | 0 | 4078 | zero→matching-pursuit:matching-pursuit-replacement | 59986.702 ms | 60014.845 ms; deadline; over 14.845 ms |
| AT+F | 5s | 1.256646 | 3.544907 | 10 | 0.134980 | F | 0.890083 | 304 | 21 | 283 | 0 | 272 | zero→matching-pursuit:matching-pursuit-replacement | 4986.572 ms | 60017.692 ms; deadline; over 17.692 ms |
| AT+F | 15s | 1.067501 | 3.187147 | 8 | 0.000000 | T | 0.890083 | 964 | 43 | 921 | 0 | 864 | MP→ST→SB:sparse-0008:transferred | 14987.904 ms | 60017.692 ms; deadline; over 17.692 ms |
| AT+F | 30s | 0.931265 | 3.026776 | 10 | 0.000000 | T | 0.890083 | 2094 | 48 | 2046 | 0 | 1963 | MP→ST→SB:replacement-2-0933:transferred | 29994.210 ms | 60017.692 ms; deadline; over 17.692 ms |
| AT+F | 60s | 0.931265 | 3.026776 | 10 | 0.000000 | T | 0.890083 | 4131 | 48 | 4083 | 0 | 4000 | MP→ST→SB:replacement-2-0933:transferred | 59999.378 ms | 60017.692 ms; deadline; over 17.692 ms |

### Trio — 32 checkpoints

| Variant | t | RMSE | maxAbs | n | regret | imp | QTF | cand | novel | dom | eq | ops | bestOrigin | progress elapsed | final return/stop |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| MP | 5s | 1.576704 | 3.848175 | 10 | 2.820892 | F | 0.069244 | 214 | 37 | 177 | 0 | 203 | MP-repl | 4990.245 ms | 60024.302 ms; deadline; over 24.302 ms |
| MP | 15s | 1.426926 | 4.253082 | 10 | 2.399315 | F | 0.069244 | 703 | 47 | 656 | 0 | 692 | MP-repl | 14992.323 ms | 60024.302 ms; deadline; over 24.302 ms |
| MP | 30s | 1.425756 | 4.233844 | 10 | 2.385224 | F | 0.069244 | 1462 | 71 | 1391 | 0 | 1451 | MP-repl | 29996.826 ms | 60024.302 ms; deadline; over 24.302 ms |
| MP | 60s | 1.411817 | 4.269936 | 10 | 2.352589 | F | 0.069244 | 2947 | 114 | 2833 | 0 | 2936 | MP-repl | 59983.339 ms | 60024.302 ms; deadline; over 24.302 ms |
| SB | 5s | 3.531936 | 14.134149 | 0 | 17.659239 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 13.330 ms | 13.465 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 15s | 3.531936 | 14.134149 | 0 | 17.659239 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 13.330 ms | 13.465 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 30s | 3.531936 | 14.134149 | 0 | 17.659239 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 13.330 ms | 13.465 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB | 60s | 3.531936 | 14.134149 | 0 | 17.659239 | F | 0.000000 | 2 | 1 | 0 | 1 | 0 | fresh | 13.330 ms | 13.465 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 5s | 1.191948 | 2.853694 | 10 | 1.241686 | F | 0.288897 | 8 | 7 | 0 | 1 | 0 | teacher-transfer | 130.088 ms | 130.218 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 15s | 1.191948 | 2.853694 | 10 | 1.241686 | F | 0.288897 | 8 | 7 | 0 | 1 | 0 | teacher-transfer | 130.088 ms | 130.218 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 30s | 1.191948 | 2.853694 | 10 | 1.241686 | F | 0.288897 | 8 | 7 | 0 | 1 | 0 | teacher-transfer | 130.088 ms | 130.218 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| SB+T | 60s | 1.191948 | 2.853694 | 10 | 1.241686 | F | 0.288897 | 8 | 7 | 0 | 1 | 0 | teacher-transfer | 130.088 ms | 130.218 ms; search-space-exhausted-under-current-mechanism; over 0.000 ms |
| ST | 5s | 1.144779 | 3.304229 | 7 | 1.053008 | F | 0.295861 | 125 | 25 | 100 | 0 | 124 | structural | 2432.229 ms | 2747.872 ms; no-admissible-proposals; over 0.000 ms |
| ST | 15s | 1.144779 | 3.304229 | 7 | 1.053008 | F | 0.295861 | 125 | 25 | 100 | 0 | 124 | structural | 2432.229 ms | 2747.872 ms; no-admissible-proposals; over 0.000 ms |
| ST | 30s | 1.144779 | 3.304229 | 7 | 1.053008 | F | 0.295861 | 125 | 25 | 100 | 0 | 124 | structural | 2432.229 ms | 2747.872 ms; no-admissible-proposals; over 0.000 ms |
| ST | 60s | 1.144779 | 3.304229 | 7 | 1.053008 | F | 0.295861 | 125 | 25 | 100 | 0 | 124 | structural | 2432.229 ms | 2747.872 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 5s | 0.844990 | 2.447990 | 10 | 0.000000 | T | 0.844949 | 90 | 15 | 75 | 0 | 88 | structural | 1697.774 ms | 1808.090 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 15s | 0.844990 | 2.447990 | 10 | 0.000000 | T | 0.844949 | 90 | 15 | 75 | 0 | 88 | structural | 1697.774 ms | 1808.090 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 30s | 0.844990 | 2.447990 | 10 | 0.000000 | T | 0.844949 | 90 | 15 | 75 | 0 | 88 | structural | 1697.774 ms | 1808.090 ms; no-admissible-proposals; over 0.000 ms |
| T→ST | 60s | 0.844990 | 2.447990 | 10 | 0.000000 | T | 0.844949 | 90 | 15 | 75 | 0 | 88 | structural | 1697.774 ms | 1808.090 ms; no-admissible-proposals; over 0.000 ms |
| MP→ST | 5s | 1.576704 | 3.848175 | 10 | 2.820892 | F | 0.320371 | 189 | 37 | 152 | 0 | 178 | zero→matching-pursuit:matching-pursuit-replacement | 4975.613 ms | 16295.583 ms; phase-budget; over 0.000 ms |
| MP→ST | 15s | 1.426926 | 4.253082 | 10 | 2.399315 | F | 0.320371 | 690 | 46 | 644 | 0 | 679 | zero→matching-pursuit:matching-pursuit-replacement | 14989.274 ms | 16295.583 ms; phase-budget; over 0.000 ms |
| MP→ST | 30s | 0.803210 | 2.314456 | 10 | 0.000000 | T | 0.320371 | 764 | 56 | 707 | 1 | 751 | zero→matching-pursuit→structural:structural-beam-proposal | 16195.953 ms | 16295.583 ms; phase-budget; over 0.000 ms |
| MP→ST | 60s | 0.803210 | 2.314456 | 10 | 0.000000 | T | 0.320371 | 764 | 56 | 707 | 1 | 751 | zero→matching-pursuit→structural:structural-beam-proposal | 16195.953 ms | 16295.583 ms; phase-budget; over 0.000 ms |
| AT−F | 5s | 1.576704 | 3.848175 | 10 | 2.820892 | F | 0.068929 | 187 | 36 | 151 | 0 | 176 | zero→matching-pursuit:matching-pursuit-replacement | 4999.646 ms | 60025.398 ms; deadline; over 25.398 ms |
| AT−F | 15s | 1.426926 | 4.253082 | 10 | 2.399315 | F | 0.068929 | 624 | 46 | 578 | 0 | 613 | zero→matching-pursuit:matching-pursuit-replacement | 14986.815 ms | 60025.398 ms; deadline; over 25.398 ms |
| AT−F | 30s | 1.427653 | 4.249919 | 10 | 2.400380 | F | 0.068929 | 1294 | 66 | 1228 | 0 | 1283 | zero→matching-pursuit:matching-pursuit-replacement | 29990.632 ms | 60025.398 ms; deadline; over 25.398 ms |
| AT−F | 60s | 1.411817 | 4.269936 | 10 | 2.352589 | F | 0.068929 | 2700 | 109 | 2591 | 0 | 2689 | zero→matching-pursuit:matching-pursuit-replacement | 59998.413 ms | 60025.398 ms; deadline; over 25.398 ms |
| AT+F | 5s | 1.576704 | 3.848175 | 10 | 2.820892 | F | 0.143594 | 253 | 38 | 215 | 0 | 228 | zero→matching-pursuit:matching-pursuit-replacement | 4987.848 ms | 60016.873 ms; deadline; over 16.873 ms |
| AT+F | 15s | 1.188314 | 2.780425 | 10 | 1.227150 | F | 0.143594 | 764 | 60 | 704 | 0 | 685 | MP→ST→SB:sparse-0010:transferred | 14988.765 ms | 60016.873 ms; deadline; over 16.873 ms |
| AT+F | 30s | 1.189402 | 2.626849 | 10 | 1.231500 | F | 0.143594 | 1514 | 68 | 1446 | 0 | 1371 | MP→ST→SB:replacement-2-0036:transferred | 29997.381 ms | 60016.873 ms; deadline; over 16.873 ms |
| AT+F | 60s | 0.987409 | 2.966131 | 10 | 0.423530 | F | 0.143594 | 3012 | 73 | 2939 | 0 | 2845 | MP→ST→SB:replacement-2-2390:transferred | 59979.373 ms | 60016.873 ms; deadline; over 16.873 ms |


## 13. Ablations, lineage, and complementarity

| Case | Mechanism | final RMSE/maxAbs; n | regret; improved | QTF | candidates; novel/dominated | origin | return |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| Storm | MP | 1.287965/6.022374; 10 | 0.774757; F | 0.248586 | 3291; 185/3106 | MP replacement | deadline +11.750 ms |
| Storm | SB pure | 3.608406/19.731539; 0 | 21.132378; F | 0.000000 | 2; 1/0 | fresh | exhausted 16 ms |
| Storm | SB+teacher | 1.787642/5.497997; 10 | 1.798289; F | 0.165582 | 6; 4/0 | teacher transfer | exhausted 140 ms |
| Storm | ST pure | 1.683100/5.032532; 5 | 1.377056; F | 0.233739 | 81; 18/63 | structural | no proposals 1.055 s |
| Storm | teacher→ST | 1.613451/5.517595; 10 | 1.106257; F | 0.330795 | 34; 5/29 | teacher seed | no proposals 0.949 s |
| Storm | MP→ST | 1.640028/5.282105; 10 | 1.204767; F | 0.256255 | 791; 69/721 | MP descendant | phase budget 15.618 s |
| Storm | anytime−feedback | 1.293423/6.023363; 10 | 0.783846; F | 0.258856 | 3149; 176/2973 | MP descendant | deadline +18.023 ms |
| Storm | anytime+feedback | 1.603119/4.870561; 10 | 1.057129; F | 0.245333 | 3210; 165/3041 | MP→ST→SB | deadline +25.756 ms |
| U12t | MP | 1.250406/3.336060; 10 | 0.110021; F | 0.790111 | 4299; 256/4043 | MP replacement | deadline +20.438 ms |
| U12t | SB pure | 2.714685/12.870304; 0 | 12.198867; F | 0.000005 | 2; 1/0 | fresh | exhausted 3 ms |
| U12t | SB+teacher | 1.062808/3.178085; 10 | 0; T | 1.000000 | 7; 5/0 | teacher transfer | exhausted 135 ms |
| U12t | ST pure | 0.977549/2.913091; 8 | 0; T | 0.943435 | 201; 36/165 | structural | no proposals 3.562 s |
| U12t | teacher→ST | 1.049870/3.145749; 7 | 0; T | 1.000000 | 42; 11/31 | structural | no proposals 0.901 s |
| U12t | MP→ST | 1.132316/3.412392; 8 | 0; T | 0.832053 | 958; 66/891 | MP→ST | phase budget 15.978 s |
| U12t | anytime−feedback | 1.250406/3.336060; 10 | 0.110021; F | 0.844901 | 4089; 256/3833 | MP descendant | deadline +14.845 ms |
| U12t | anytime+feedback | 0.931265/3.026776; 10 | 0; T | 0.890083 | 4131; 48/4083 | MP→ST→SB | deadline +17.692 ms |
| Trio | MP | 1.411817/4.269936; 10 | 2.352589; F | 0.069244 | 2947; 114/2833 | MP replacement | deadline +24.302 ms |
| Trio | SB pure | 3.531936/14.134149; 0 | 17.659239; F | 0.000000 | 2; 1/0 | fresh | exhausted 13 ms |
| Trio | SB+teacher | 1.191948/2.853694; 10 | 1.241686; F | 0.288897 | 8; 7/0 | teacher transfer | exhausted 130 ms |
| Trio | ST pure | 1.144779/3.304229; 7 | 1.053008; F | 0.295861 | 125; 25/100 | structural | no proposals 2.748 s |
| Trio | teacher→ST | 0.844990/2.447990; 10 | 0; T | 0.844949 | 90; 15/75 | structural | no proposals 1.808 s |
| Trio | MP→ST | 0.803210/2.314456; 10 | 0; T | 0.320371 | 764; 56/707 | MP→ST | phase budget 16.296 s |
| Trio | anytime−feedback | 1.411817/4.269936; 10 | 2.352589; F | 0.068929 | 2700; 109/2591 | MP descendant | deadline +25.398 ms |
| Trio | anytime+feedback | 0.987409/2.966131; 10 | 0.423530; F | 0.143594 | 3012; 73/2939 | MP→ST→SB | deadline +16.873 ms |

The lineage fields show that feedback results are descendants of newly emitted
MP candidates; external teacher seeds are never relabeled as MP. Feedback
performs 21 Storm, 16 U12t, and 21 Trio handoffs and leaves no queued seed at
the deadline. `mpDone=true` means that the in-process generator was finalized
when the deadline fired; it does not mean that admissible selection search was
exhausted.
It improves both U12t dimensions relative to no-feedback and both Trio
dimensions relative to no-feedback. For Storm it exposes a different Pareto
direction: maxAbs falls by `1.152802 dB` while RMSE rises by `0.309695 dB`.
This is complementarity, not a claim that summing component work always wins.

MP pure and sliced no-feedback use the same search mechanism but run separately
on one wall-clock sample. Their final candidates and QTF can differ because of
slice overhead, process warmup, and ordinary timing variability. These single
runs do not support a statistical speedup claim. The paired no-feedback versus
feedback runs do establish that actual handoff work can change the selected
quality and origin while the frozen selector remains monotonic.

The one-shot MP→structural path uses beam width 4, eight proposals per parent,
120 polish evaluations, and the broad structural evaluation allowance. Each
anytime handoff uses width 2, four proposals, 24 polish evaluations, and a
12-candidate allowance. The gap between Trio MP→ST and anytime feedback does
not isolate scheduler quality; handoff count and per-seed depth change together.

## 14. Work → novelty → quality and classification

State-bank pure does two evaluations and cannot create filters. Its useful role
is refinement of supplied states: teacher seeds cause U12t improvement, while
new MP→structural descendants let anytime feedback improve U12t and substantially
improve Trio over MP alone. Structural pure exhausts its narrow proposal space
in about 1.1–3.6 seconds; this short mechanism independently improves U12t and,
when given a teacher or MP seed, supplies the strongest Trio results. MP keeps
producing candidates until the deadline but useful novelty is sparse: in the
final pure runs only 185/3291 Storm, 256/4299 U12t, and 114/2947 Trio progress
points are globally Pareto-novel.

| Case | Evidence | Classification |
| --- | --- | --- |
| Storm | Ranked MP moves work among bass/low-mid and mid/presence; feedback lowers maxAbs to 4.870561 but no run improves the reference | `search/representation unresolved`; allocation, replacement barriers, dictionary, ranking, visited state, and quantization remain live |
| U12t | SB+teacher, structural pure, teacher→structural, MP→structural, and anytime feedback improve the reference; feedback dominates MP without feedback | `search unresolved`; Max10 benefit is demonstrably reachable, so not `cap-limited` |
| Trio | MP→structural dominates the earlier teacher control; feedback strongly improves over MP but does not reach the one-shot composition | `search unresolved`; fixed-cap search limitation confirmed, so not `cap-limited` |

No case is declared representationally saturated. Exhaustion labels apply only
to the bounded state-bank or structural mechanism that emitted them. MP→ST
returns after its defined phase budget with MP work still admissible. Deadline
runs stop because the cooperative time budget expires.

## 15. Verification, artifacts, incident, and next boundary

Astra independently verified all 24 runs, 33,941 progress points, and 96
checkpoints against canonical
delivered metrics, Directed Reference Regret v1, the frozen selector, QTF, and
checkpoint lookup. It recomputed the global novelty partition for all nine
composition traces (22,804 raw candidates) and checked the exact progress
sequence for monotonic counts and selected best-so-far. Verification artifacts
are:

- `/tmp/astra-max10-final-checkpoints.json`, SHA-256 `5d184d48ef297dee4cbe1ba1577376c8b13fe4650021dadff8746c12a33d1d6a`
- `/tmp/astra-max10-final-summary.json`, SHA-256 `7eec09e2018463312e72d5a7fc26274b1d0c0000ccc99828782cf9ab1cfdcc7a`
- `/tmp/astra-max10-final-progress-audit.json`, SHA-256 `2c2981c5a2589edb7a08b0a055b683c6bd57d72d34c173e213a8ed8574909a68`
- `/tmp/astra-max10-global-novelty-audit.json`, SHA-256 `ef198c79247fbadc1da88f0952952256b61af87e5ee19ba1d532d74e0c4c2e58`
- `/tmp/astra-max10-final-canonical-audit.jsonl`, SHA-256 `2a6627021fdd9b3a0f17d84dd749617ec98714df96294e8b21551defad47ba76`
- ordering trace audit: `/tmp/astra-max10-ordering-trace-audit.jsonl`, SHA-256
  `ebee0f9b4e712c68e1187e33babeb993e2d77ad96dbd21f5ddeb13ee77e77f63`
- Storm residual audit: `/tmp/astra-storm-residual-audit.jsonl`, SHA-256
  `14346f6dc45130c02ac285878ffc08f799c9d759bd489fd5abb9281cc800dee1`

The baseline, round-robin, ranked, and final campaign logs are under
`/tmp/autoeq-max10-20260908/logs/`; their SHA-256 values are respectively
`04d112aa8c3ed02e4adab09adef2741c1435fdc9d79dc60c3b1eb8daf469733c`,
`d4777c6e50b02db4d6c63b9d4ef090aa943e7d701ca0f3dee9de7032c29c2b8a`,
`ae70017b86da87900e9f50f05528ac7c9fa905f01f8bf9fdd47daafa5e97fa81`,
and `3956738d7dabe1a438c828afc3b4f7ee4971b0c32c900106f083f0bfdae1a188`.

Focused research validation passed 25 files and 101 tests. Root `pnpm typecheck`
and `pnpm build` passed. Root `pnpm test` passed 513/515 core tests and stopped
before the web package: Standard v1 retained its known last-bit fixture drift
(`~4e-17`), and one Standard v2 canonical-response test hit its 5,000 ms timeout
at 5,125 ms without reporting a value mismatch. The timed-out file then passed
6/6 in 3.74 seconds, and the complete v2 suite passed serially with 42 files and
181 tests in 51.42 seconds. The frozen v1 fixture was not changed.

The default parallel web run encountered six worker-startup timeouts and one
manual-workbench timeout (389 tests passed). That focused file passed 2/2 with
its existing timeout, then the complete web suite passed serially: 44 files,
418 tests, 653.57 seconds. Root `pnpm lint` passed. The required core benchmark
failed at the unchanged `Standard-v1 benchmark drift detected` guard, matching
the previous recovery report. Core production source, Standard-v1 tests, and
benchmark fixtures have no changes from HEAD; no baseline was regenerated.
`git diff --check` passed. The original root test command and benchmark remain
failed gates; successful serial reruns are recorded separately.

Final gate logs and SHA-256 values:

- `/tmp/autoeq-max10-20260908/logs/astra-web-serial.log`:
  `d0bf7ff2d0cbc8b40dfad0aea341e274ec864d4174f36c35cf9d2567686090cc`
- `/tmp/autoeq-max10-20260908/logs/root-lint.log`:
  `b29083228acbc55f5674d50f2bef05eeaeb709c8ea5630c3f4d3d1da55491316`
- `/tmp/autoeq-max10-20260908/logs/core-benchmark.log`:
  `88ada0155ade67fee47ce73d28174bfa5a10ff5a6af11295c3ff635da3612a26`

During focused validation, `runner.test.ts` was found writing its default
artifacts into the pre-existing untracked `packages/core/autoeq-research/`
directory. The test now uses a unique temporary output directory and deletes it
after each case. Exact initial copies of `metadata.json` and `timeline.json` were
recovered and their hashes restored. No byte-identical originals were available
for `results.json` and `summary.md`; those two files remain the synthetic
test-output versions. This is a material preservation incident, not solver
evidence, and the files are outside this phase's intended research output.
The final integrity check matched 85 of the 87 initial WIP file hashes; only
those two outputs differ. All ten implementation/test files in the frozen
campaign source manifest still match the workspace byte for byte.

The next bounded research step is a Storm-first ablation inside the existing MP
and composition mechanisms: rebase after an accepted replacement, or retain a
small selection beam, so later swaps expand improved parents; compare it with
the unchanged no-feedback traversal. A paired scheduler ablation should
equalize structural work per seed between one-shot and feedback modes and expose
per-seed checkpoints. This tests temporary-worsening and allocation barriers
without adding a family. This report stops before holdout, promotion, production
defaults, UI/session/export work, or any release action.
