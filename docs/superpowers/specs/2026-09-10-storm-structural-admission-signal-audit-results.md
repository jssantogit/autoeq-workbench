# Storm structural admission cheap-signal audit results

Version: storm-structural-admission-signal-audit-v1 (schema 1)
Case: titan-to-storm
Primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010
Source commit: 26ba86bdb17e0b5d365fd51590dd6abdb4636b96
Census producer commit: 989832ea9f6aca047433b64107d07cc61ada1bea
Audit producer commit: b67c9c8c628662de6c6f6344b2bcde90f034479e

## Scope and contract

This is deterministic experimental evidence only. It ranks exactly the 21 frozen sparse-0010 initial-parent proposals from the existing Storm census. The current solver admission policy is unchanged.

- Frozen census hash: `62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0`. Replay hash: `930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba`. Source hash: `c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351`. Semantic proposal-set hash: `1db7e2cbb3a1542c97666757a9e4cac09f223294035d78d18be3c5c500e69f99`.
- Audit artifact SHA-256: `8838020aaed9222ec201ee79a65c1fb7c9e768d2882c7165bb8b928cadae2abc`.
- Current admission remains generate → orderStructuralProposals → slice(0,4) → full 24-trial polish → canonical delivery.
- Labels are the existing full 24-coordinate-trial polish plus canonical outcome from the census. They are post-hoc only and never enter signal scores or rankings.
- Permitted admission-time information is limited to mutation/unpolished structure, current lexical order, canonical delivered RMSE/maxAbs/filter-count/cancellation metrics of the unpolished structure, and canonical metrics from exactly the 2- or 6-trial admission-only probes.
- Material recall improvement is defined minimally and deterministically as the same eligible set plus at least one additional recovered proposal in either recall@4 set versus the lexical baseline.
- Partial probes call polishStructuralProposal exactly at 2 and 6 coordinate trials, with existing coordinate order, steps, mutation, selector, and standard-v2 quantization semantics. Probes score admission only and do not feed back into the solver.

## Frozen inputs

- Proposal count: 21; lexical order reproduced: true; semantic set hash matched: 1db7e2cbb3a1542c97666757a9e4cac09f223294035d78d18be3c5c500e69f99.
- Parent: matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000; parent semantic hash: ba04cd61d4a12f2ff0f661b32bb4f520637f6bd9f136942770cf488b8db3ddfb.
- Excluded cases: U12t and Trio.

## Results

Best full-polish canonical proposal: lexical rank 9. Current admitted ranks: 1, 2, 3, 4.
Proposals beating any current-admitted proposal by the full-canonical frozen selector: 6, 8, 9, 10, 11, 13.
Proposals beating parent by the full-canonical frozen selector: 9.

### lexical

Definition: Current lexical orderStructuralProposals rank, with proposal rank as the score.

- Complete ranking (best → worst): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21.
- Full-polish oracle proposal rank 9: signal rank 9; top-1=false; top-4=false.
- Top-4: 1, 2, 3, 4.
- Recall@4 of proposals beating any current-admitted proposal: 0/6 (0).
- Recall@4 of proposals beating parent by frozen selector: 0/1 (0).
- Overlap with lexical top-4: 4/4 (1, 2, 3, 4).
- Cost: current admission=4 admitted / 96 coordinate trials; signal work=0 canonical + 0 continuous evaluations and 0 probe coordinate trials; coordinate trials per probe=0; label cost=504 offline coordinate trials at 24 per proposal.
- Tie/order stability: true.

### pre-polish-rmse-max-abs

Definition: Canonical delivered RMSE then maxAbs of each unpolished proposal structure; deterministic tie-break is filter count, cancellation score, proposal rank.

- Complete ranking (best → worst): 3, 4, 1, 6, 10, 9, 11, 5, 2, 8, 13, 7, 14, 12, 15, 16, 19, 17, 20, 21, 18.
- Full-polish oracle proposal rank 9: signal rank 6; top-1=false; top-4=false.
- Top-4: 3, 4, 1, 6.
- Recall@4 of proposals beating any current-admitted proposal: 1/6 (0.16666667).
- Recall@4 of proposals beating parent by frozen selector: 0/1 (0).
- Overlap with lexical top-4: 3/4 (3, 4, 1).
- Cost: current admission=4 admitted / 96 coordinate trials; signal work=21 canonical + 21 continuous evaluations and 0 probe coordinate trials; coordinate trials per probe=0; label cost=504 offline coordinate trials at 24 per proposal.
- Tie/order stability: true.

### pre-polish-frozen-selector

Definition: Frozen reference-selector-v1 key on the canonical delivered state of each unpolished proposal structure; no full-polish label is read.

- Complete ranking (best → worst): 3, 1, 10, 9, 11, 6, 4, 8, 13, 2, 5, 14, 12, 15, 16, 7, 19, 17, 20, 21, 18.
- Full-polish oracle proposal rank 9: signal rank 4; top-1=false; top-4=true.
- Top-4: 3, 1, 10, 9.
- Recall@4 of proposals beating any current-admitted proposal: 2/6 (0.33333333).
- Recall@4 of proposals beating parent by frozen selector: 1/1 (1).
- Overlap with lexical top-4: 2/4 (3, 1).
- Cost: current admission=4 admitted / 96 coordinate trials; signal work=21 canonical + 0 continuous evaluations and 0 probe coordinate trials; coordinate trials per probe=0; label cost=504 offline coordinate trials at 24 per proposal.
- Tie/order stability: true.

### partial-refinement-2

Definition: Frozen reference-selector-v1 key after exactly two coordinate trials through polishStructuralProposal and standard-v2 quantization.

- Complete ranking (best → worst): 3, 1, 10, 9, 11, 6, 4, 8, 13, 2, 5, 14, 12, 15, 16, 7, 19, 17, 20, 21, 18.
- Full-polish oracle proposal rank 9: signal rank 4; top-1=false; top-4=true.
- Top-4: 3, 1, 10, 9.
- Recall@4 of proposals beating any current-admitted proposal: 2/6 (0.33333333).
- Recall@4 of proposals beating parent by frozen selector: 1/1 (1).
- Overlap with lexical top-4: 2/4 (3, 1).
- Cost: current admission=4 admitted / 96 coordinate trials; signal work=21 canonical + 0 continuous evaluations and 42 probe coordinate trials; coordinate trials per probe=2; label cost=504 offline coordinate trials at 24 per proposal.
- Tie/order stability: true.

### partial-refinement-6

Definition: Frozen reference-selector-v1 key after exactly six coordinate trials through polishStructuralProposal and standard-v2 quantization.

- Complete ranking (best → worst): 3, 1, 10, 9, 11, 6, 4, 8, 13, 2, 5, 12, 15, 14, 16, 19, 7, 17, 20, 21, 18.
- Full-polish oracle proposal rank 9: signal rank 4; top-1=false; top-4=true.
- Top-4: 3, 1, 10, 9.
- Recall@4 of proposals beating any current-admitted proposal: 2/6 (0.33333333).
- Recall@4 of proposals beating parent by frozen selector: 1/1 (1).
- Overlap with lexical top-4: 2/4 (3, 1).
- Cost: current admission=4 admitted / 96 coordinate trials; signal work=21 canonical + 0 continuous evaluations and 126 probe coordinate trials; coordinate trials per probe=6; label cost=504 offline coordinate trials at 24 per proposal.
- Tie/order stability: true.

## Classification

Classification: **cheap-signal-supported**.

### Measured facts

- Exactly 21 frozen initial-parent proposals were ranked.
- The best full-polish canonical proposal is lexical rank 9.
- Cheap signals placing that proposal in top-4: pre-polish-frozen-selector.
- Partial-refinement signals placing that proposal in top-4: partial-refinement-2, partial-refinement-6.
- Signals with material recall improvement versus lexical baseline: pre-polish-rmse-max-abs, pre-polish-frozen-selector, partial-refinement-2, partial-refinement-6.
- Full-polish labels cost 21 offline canonical evaluations and 504 coordinate trials; they were not used by ranking.

### Interpretation

- At this frozen parent, at least one admission-time cheap signal ranks the best known full-polish canonical proposal into top-4 and materially improves recall versus lexical admission.

### Hypotheses and recommendation

- A separate causal equal-work study is needed to determine whether replacing current lexical admission improves solver outcomes under equal downstream work.
- Recommend a separate causal equal-work study comparing current lexical admission with the candidate signal; do not implement a policy change from this audit.

### Limitations

- This is one frozen sparse-0010 initial parent and 21 proposals; it is not a holdout or promotion study.
- The full-polish canonical outcome is a post-hoc label/oracle and cannot establish a deployable signal by itself.
- No U12t, Trio, MP rank audit, refinement-potential oracle, or structured-admission policy was run.
- Partial probes were admission-only and did not feed back into solver beam state or parent expansion.

## Tests and gates

- Focused command: `pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormStructuralAdmissionSignalAudit.test.ts`.
- Required commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm --filter @autoeq-workbench/core benchmark`, `git diff --check`.
- Generation command: `pnpm --filter @autoeq-workbench/core research:storm-structural-admission-signal-audit`.
- This report records evidence from the execution; it does not authorize admission-policy change, promotion, merge, release, deployment, or publication.
