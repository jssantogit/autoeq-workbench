# AutoEQ Standard v2 — Codex Handoff (2026-09-05)

## Purpose

This document freezes the state of the Standard AutoEQ v2 performance/quality investigation so a fresh Codex session can continue without relying on chat history.

**Do not merge or deploy anything merely because it appears in an experimental PR.** Treat the SHAs and evidence below as the source of truth.

## Safe starting point

Start Codex from this exact commit:

`5dafaa50410b9fa3157c28a1f7757d676b33152a`

Recommended handoff branch:

`handoff/codex-autoeq-v2-2026-09-05`

Base product branch remains:

`remake/squiglink-base`

Fresh verification evidence for the safe SHA:

- CI run `33969054815`: SUCCESS.
- The exact SHA passed typecheck, all tests, build, lint, Standard v1 benchmark, Standard v2 benchmark, Playwright Chromium install, and E2E.
- The final-metric canonicalization was additionally validated by the real Research Bench at Max Filters 10/20/40; the independent recomputation accepted the delivered filters/metrics.

Important: PR #10 (`perf(core): integrate progressive v2 performance stack`) was later advanced during research and is **not** the safe-source-of-truth branch head. Use the SHA above or this handoff branch, not the current PR #10 head.

## What the safe checkpoint contains

The safe SHA combines the validated changes that materially improved behavior:

1. **Stable best-deliverable retention**
   - Search keeps the original max-error-oriented objective.
   - Best deliverable retention is separated from search ranking so a microscopic maxAbs improvement cannot overwrite a globally much better result.
   - Target-achieving results remain preferred over non-target results.

2. **Progressive checkpoint architecture**
   - Working solutions can produce cheap valid checkpoints.
   - Deep discrete finishing is no longer performed for practically every intermediate checkpoint.
   - Best working progress is emitted promptly enough to avoid losing an already-found improvement when the next expensive operation reaches the deadline.

3. **Reusable replacement-trial response buffer**
   - Exact-output allocation optimization in the joint-refinement hot path.

4. **Lazy cap-removal cancellation audit**
   - Candidate filter removals compare primary metrics first.
   - Expensive cancellation audit is computed only when required as a tie-break.

5. **Finalization reserve**
   - Exploration stops slightly before the user hard deadline, leaving a small bounded reserve to materialize a safe final result.
   - User 5/15/30/60 s budgets remain hard caps.

6. **Canonical final metrics**
   - Internal search still uses its fast cached response path.
   - Returned final filters are recomputed once through the canonical DSP path so `result.metrics` and the manifest exactly describe the delivered filters.

## Research corpus

Source curve:

- DUNU Titan S2

Targets:

- Subtonic Storm
- 64 Audio U12t
- 64 Audio Trio

Fixed cases:

- `titan-to-storm`
- `titan-to-u12t`
- `titan-to-trio`

The four raw approved curves are already versioned under the Research Bench corpus. Keep their existing integrity checks.

## Current measured behavior

Representative safe/progressive results at Max Filters 10, around 30 s budget:

- Storm: RMSE ~`1.340 dB`, maxAbs ~`5.462 dB`.
- U12t: RMSE ~`1.286 dB`, maxAbs ~`4.965 dB`.
- Trio: RMSE ~`1.141 dB`, maxAbs ~`3.493 dB`.

The progressive architecture made extra filter capacity useful again. Representative 30 s results:

| Case | 10 filters | 20 filters | 40 filters |
| --- | --- | --- | --- |
| Storm RMSE / maxAbs | ~1.340 / 5.462 | ~1.218 / 5.290 | ~1.292 / 4.534 |
| U12t RMSE / maxAbs | ~1.286 / 4.965 | ~0.763 / 2.851 | ~0.698 / 2.850 |
| Trio RMSE / maxAbs | ~1.141 / 3.493 | ~0.990 / 4.332 | ~0.703–0.734 / 2.305 |

Exact values vary slightly by the later canonical-metric recomputation and runner timing; use fresh artifacts instead of hard-coding these values into tests.

## Major performance finding

Before the progressive checkpoint change, Storm could spend ~242,820 discrete trials during the search. The progressive path reduced this to roughly ~13,133 while preserving the useful search trajectory.

This removed discrete refinement as the dominant bottleneck. The main remaining hotspot is **`jointRefine` / joint coordinate trials**.

Typical converged Storm / 10-filter runs still perform about:

- `184,380` joint coordinate trials
- ~`358` joint-refinement calls
- ~`97` working checkpoints

At Max Filters 40, difficult runs can reach roughly 400k–500k+ coordinate trials before the time limit.

Therefore the next large improvement is unlikely to come from candidate generation or another tiny allocation micro-optimization. It should reduce the amount or scheduling of joint-refinement work while preserving diversity/quality.

## Validated performance improvements worth keeping

### Lazy cap-removal audit

Experimental SHA: `9281fd31e5f7fd1092b97831e9a7c5cd946eb6b4`

Representative Storm/30/10 deep profile versus its prior exact stack:

- total: ~11.156 s -> ~10.420 s (`~6.6%` better)
- deliverable phase: ~3781 ms -> ~2880 ms (`~23.8%` better)
- filters, final metrics, timeline and algorithm counters: identical

This logic is incorporated in the safe checkpoint.

### Reusable trial response buffer

Experimental SHA: `875e2db53839351a8e4f4858b335c7a23c9b564b`

Representative effect:

- ~3% whole-run improvement
- ~5% jointRefine improvement
- identical outputs and counters

This logic is incorporated in the safe checkpoint.

### Progressive checkpoints / reduced intermediate deep finishing

This was the largest structural win.

Representative earlier comparison:

- Storm convergence ~18.0 s -> ~11.5 s
- U12t ~13.2 s -> ~11.2 s
- Trio ~10.6 s -> ~8.8 s
- Trio at 5 s reached the result that previously required ~10–15 s

Later exact optimizations brought some Storm runners below ~10 s, but compare using same-runner A/B before attributing precise wall-clock numbers.

## Experiments rejected — do not repeat without a new reason

### Global L2/L4/L8 search ranking

Rejected. It can improve some 30 s endpoints but changes search trajectory and causes severe early-quality regressions, especially Trio. The correct lesson was to separate deliverable retention from the search objective, not replace the objective globally.

### Fixed staged joint-refinement K=1/K=2

PRs #12–#14 contain the staged-refinement investigation.

Findings:

- 1 cycle is dramatically cheaper and sometimes better for U12t/Trio, but materially worse for Storm.
- K=2 saves work but changes the trajectory and can regress Trio/maxAbs.
- K=3 recovers the canonical result because all three staged candidates are eventually deeply continued; it does not produce the desired large work reduction.

Key proof: for the **same candidate**, `1 cycle + 5 continuation cycles` reproduces `6 continuous cycles` exactly. The problem is candidate selection/diversity, not segmentation itself.

### Adaptive third staged continuation from simple rank gaps

PRs #16–#17 contain rank telemetry / adaptive-threshold attempts.

Real corpus telemetry showed that rank-3 fast-pass candidates sometimes become important only after full continuation. To get near-100% recall of useful rank-3 candidates, simple thresholds become permissive enough that almost all thirds are continued. Do not introduce a fragile threshold based only on one-cycle normalized-rank gap without new evidence.

### Deferred staged fast-pass publication

PR #15. Semantically safe in tested corpus when timeout fallback is preserved, but did not prove a clean net performance win; discrete-trial distribution changed. Not promoted.

### Primary-trial metrics / defer MAE

PR #7 / SHA `c9d71024cc9b22fe33c240aa5e1ec22eae60027e`.

Exact but no reliable speedup. Rejected.

### Center-frequency trig cache

PR #8 / SHA `9f1abeaceab8eadba41690d41d587680f3631a35`.

Exact but ~2% slower in the relevant deep profile. Rejected.

### Trusted replacement-trial evaluator

PR #18 / SHA `111357498ad1d1c8134e821fe2f5d5f360f88acc`.

Same-runner/process A-B-B-A:

- canonical jointRefine avg ~5216.98 ms
- candidate ~5217.94 ms
- effectively zero/slightly worse

Rejected.

### Single-pass response + replacement metrics

PR #19 / SHA `1555ddb344429272623fa32b9709c862b07ed6fb`.

Same-runner/process A-B-B-A:

- total ~9.85% worse
- jointRefine ~11.45% worse
- deterministic result identical

Rejected.

### Direct pair dedup instead of `Set<string>`

PR #20 / SHA `8062ec7600500a036d953e5e09d2dd6060a124ff`.

Correct and locally a little faster, but total effect was noise-level.

Balanced 12-run same-runner/process experiment (`33983045350`):

- total mean: canonical 7599.05 ms, candidate 7614.74 ms (`-0.207%`, worse)
- total median improvement: `+0.671%`
- jointRefine mean improvement: `+0.984%`
- jointRefine median improvement: `+1.452%`
- no deterministic drift

Rejected as a performance feature. Do not use this SHA as the safe base.

### Reuse RBJ gain factor A

PR #21 / SHA `ebb660fef8fb2bbb523ae1e3f56c1e3e8fc4fda6`.

Exact; combined controlled A/B showed only ~`+0.615%` jointRefine improvement and noisy/worse total time. Rejected due to insufficient benefit for added plumbing.

## v1 comparison

On this adversarial corpus, frozen Standard v1 did **not** reproduce the remembered ~5 s user experience:

- Storm median around ~31 s
- U12t ~24 s
- Trio ~21 s

However v1 often reached better final RMSE, showing that meaningful solution quality remains available and the v2 search/refinement strategy can still improve.

Do not optimize v2 merely to emulate v1 runtime. Study which v1 search decisions/trajectory produce useful filters and whether a cheap v1-like seed can improve the v2 starting solution.

## Recommended next research direction for Codex

The next phase should prioritize **structural joint-refinement scheduling**, not more sub-1% micro-optimizations.

Suggested order:

1. **Reproduce the safe baseline first**
   - Checkout `handoff/codex-autoeq-v2-2026-09-05` / verify parent `5dafaa50410b9fa3157c28a1f7757d676b33152a`.
   - Run focused tests, then Research Quick and Storm/30 deep profile.
   - Confirm the same qualitative metrics/counters before changing solver logic.

2. **Instrument where deep joint refinement is actually useful**
   - For each `jointRefine` invocation, record parent quality, candidate source, number of cycles completed, per-cycle improvement, whether the result survives path retention, and whether it contributes to the eventual best deliverable.
   - Trace must be opt-in and prove zero deterministic drift with fake-clock/non-timeout tests.
   - Prefer adding this to the existing Research Bench telemetry schema rather than logging ad hoc text.

3. **Use the telemetry to reduce full refinement work without killing diversity**
   - Candidate ideas worth testing:
     - priority/deferred continuation where candidates can be revisited, instead of permanently discarding rank 2/3 after a fast pass;
     - cycle-by-cycle continuation based on a queue of promising states, preserving alternative paths until evidence says they are dominated;
     - warm-start later geometry modes from the best paths instead of restarting from zero;
     - cheap v1-like seed before expensive multi-path search;
     - avoid re-refining effectively unchanged parent/candidate states when an exact cache key proves the same refinement problem has already been solved.
   - Test one hypothesis at a time.

4. **Quality gates for any structural candidate**
   - No meaningful regression on Storm/U12t/Trio at 5/15/30/60 s.
   - Preserve or improve practical time monotonicity.
   - Keep exact final-metric canonicalization.
   - Keep cancellation/timeout behavior and hard user time cap.
   - Do not change v1 behavior.
   - Do not alter UI/session/export unless separately requested.

5. **Performance proof**
   - For small effects, use same-runner/same-process balanced A/B, not separate GitHub runners.
   - Prefer median plus mean and verify deterministic filters/metrics/counters where the algorithm is intended to be equivalent.
   - Reject micro-optimizations whose whole-run effect is noise-level even if one inner phase improves by ~1%.

6. **Only after structural progress, consider objective changes**
   - The current remaining errors are large enough that regional/objective improvements may eventually matter, but changing objective while search scheduling is still wasteful will confound the diagnosis.

## Research workflow rules

- Normal CI must remain fast/blocking and unchanged unless needed for a real product regression test.
- Long real-time benchmarking belongs in the separate Research Bench workflow.
- Temporary push triggers may be used only on disposable research execution branches because `workflow_dispatch` requires the workflow on the default branch.
- Never touch `main` or change the repository default branch merely to dispatch research.
- Restore disposable workflow branches after artifacts are collected.
- Do not merge, deploy, or release during research unless the user explicitly authorizes it.

## Efficient Workflow v2 expectations

- Directed reads; do not repeatedly reread the whole repository.
- Single agent by default; parallelize only truly independent experiments.
- TDD for behavioral/code changes: RED -> minimal GREEN -> focused verification.
- Do not run the entire expensive suite after every micro-edit; run focused checks, then one global pass for a candidate worth keeping.
- Use coherent commits.
- Avoid unrelated cleanup/refactors.
- Keep worktree clean before handoff.

## Codex execution mandate

Codex is allowed to continue the research and implementation on a new branch from the safe handoff SHA. It may create temporary research branches/workflows, run GitHub Actions, inspect artifacts, and make corrective commits.

Codex must **not** merge, deploy, release, touch `main`, change the default branch, or loosen benchmark correctness checks merely to make an experiment pass.

At the end of a research batch, report:

- exact branch and SHA;
- tests/checks run and their results;
- GitHub Actions run IDs/artifacts;
- before/after quality and timing;
- whether the hypothesis was accepted or rejected;
- next recommended hypothesis.
