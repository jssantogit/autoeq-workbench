# AutoEQ V2 resource-envelope full-r1: synthetic fixed-capacity wave

Status: Phase 2 complete; later phases are not represented by this report.

## Provenance and inventory

The immutable plan is `AUTOEQ_V2_RESOURCE_ENVELOPE_FULL_R1_PLAN_20260913.json`.
The raw resumable JSONL is intentionally uncommitted at
`.research-artifacts/resource-envelope-generic-20260913-full-r1/`.

| Item | SHA-256 |
| --- | --- |
| manifest | `e36bc66b44902496046aaec2b5497de1a7e616c15857b314e57e5c0a27dc88b1` |
| runs JSONL | `15314e04b7e5529e5ede16d3f658c4e6cd6f5b5a513721c27afa570f87b222f9` |
| aggregate JSON | `6889861a3b822dba7e815ddc182d61ba0d2dd90f47ce14841fc2e0b016950fc5` |

The runner completed 32 serial repeat cells: 24 ordinary and 8 critical,
each containing its three fixed ceilings, for **96/96 trajectories**.  It
recorded requested labels 5/15/30 seconds as quantum labels (1/3/6) and the
separately measured wall-clock values in every checkpoint.  No failed or
skipped primary cell occurred.

## 30-label summary

Entries are `ceiling: RMSE best/median/worst; delivered filters
best/median/worst`; all cells reported frontier/blocked-pressure occurrence in
every repeat, so that observation alone is not a productive-capacity finding.

| family (K) | K-1 | K | K+1 |
| --- | --- | --- | --- |
| A easy broadband (2) | 1: .9956/.9956/.9956; 1/1/1 | 2: .0014/.0014/.0014; 2/2/2 | 3: .0013/.0013/.0013; 2/2/2 |
| B sparse (3) | 2: .9526/.9526/.9526; 2/2/2 | 3: .0054/.0054/.0054; 3/3/3 | 4: .0065/.0065/.0065; 4/4/4 |
| C shelf+peaks (4) | 3: .7758/.7758/.7758; 3/3/3 | 4: .3983/.3983/.3983; 4/4/4 | 5: .0767/.0767/.0767; 5/5/5 |
| D dense (12) | 11: .0784/.0784/.0784; 11/11/11 | 12: .0499/.0499/.0535; 11/11/11 | 13: .0568/.0568/.0570; 12/12/13 |
| E high-Q (3) | 2: .5452/.5452/.5452; 2/2/2 | 3: .0512/.0512/.0512; 3/3/3 | 4: .0171/.0171/.0171; 3/3/3 |
| F upper-frequency (3) | 2: .5160/.5160/.5160; 2/2/2 | 3: .2422/.2422/.2422; 3/3/3 | 4: .0923/.0923/.0923; 4/4/4 |
| G broad/deep dip (3) | 2: 1.0203/1.0203/1.0203; 2/2/2 | 3: .3986/.3986/.3986; 3/3/3 | 4: .1581/.1581/.1581; 4/4/4 |
| H alternating (6) | 5: .6582/.6582/.6582; 5/5/5 | 6: .3000/.3000/.3000; 6/6/6 | 7: .0344/.0344/.0344; 7/7/7 |

## Bounded findings

Below generating complexity was sharply worse in every family.  Extra
capacity improved A, C, E, F, G, and H under this protocol; B and D show that
the extra structural range can instead yield alternate parameterizations or a
median regression.  D is the important counterexample to a monotonic-capacity
claim: K is better than K+1 by median RMSE.  Generating complexity is
provenance, **not** a claim of minimal representational complexity: A and E
are accurately delivered with fewer filters at K+1.

This wave cannot establish delayed causal payoff: that requires the corrected
matched C-hold/C+-hold and C-ramp/C+-ramp continuations in Phase 4.  It also
does not identify a scheduler rule, comparator change, or real-FR conclusion.
