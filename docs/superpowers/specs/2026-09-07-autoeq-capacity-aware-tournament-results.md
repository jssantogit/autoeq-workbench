# AutoEQ Capacity-Aware Same-Runtime Tournament Results

> Historical blocked endpoint. The same-runtime tournament completed
> afterward; see `2026-09-08-autoeq-capacity-aware-directed-results.md` for the
> current artifact and results.

Status: blocked before runtime execution.

The Task 14 harness and CLI are implemented on branch
`research/capacity-aware-solver-plan-2026-09-07`, but the tournament did not
run because Task 12 produced no evidence-backed survivor and the corrected
Oracle snapshot is unavailable.

## Contract and provenance

- Runtime: Node/TypeScript only.
- Product capacity: Max10 only.
- Approved adversarial cases: `titan-to-storm`, `titan-to-u12t`,
  `titan-to-trio`.
- Required checkpoints: 5, 15, 30, and 60 seconds (`5000`, `15000`,
  `30000`, `60000` ms).
- Required checkpoint evidence: canonical delivered filters, canonical
  RMSE/maxAbs, actual delivered count, Directed Reference Regret v1,
  `referenceImproved`, snapshot/input hashes, termination/deadline metadata,
  and runner metadata.
- The harness rejects non-Max10 cases, non-approved variant IDs, regressing
  best-so-far trajectories, missing initial points, and progress beyond the
  60-second hard deadline.
- QTF is computed from the same Node/TypeScript trajectory using QTF v1.
- Max20, Max40, and Max64 are explicitly excluded from this runtime
  tournament. Max40/64 remain high-cap diagnostic/reference capacities only.

The blocked output artifact is:

`.research-artifacts/capacity-aware/same-runtime-tournament/tournament-report.json`

Its SHA-256 is
`c5f0ad3ff57c42ce54e43abb571f86bde347076a2a3067f1e9300076ae55d2f7`.
The report records the missing corrected snapshot, the empty Task 12
shortlist, and the fact that no canonical Max10 tournament artifact exists.

## Results

| Case | 5 s | 15 s | 30 s | 60 s | Winner/product readiness |
| --- | --- | --- | --- | --- | --- |
| Storm | not run | not run | not run | not run | no winner; not product-ready |
| U12t | not run | not run | not run | not run | no winner; not product-ready |
| Trio | not run | not run | not run | not run | no winner; not product-ready |

There are no RMSE/maxAbs values, delivered counts, regrets, QTF values, raw
control deltas, or monotonicity summaries to report. They are not fabricated
from Python timings, synthetic fixtures, or absent Oracle cells.

No tournament winner is labeled product-ready. Holdout inspection and
production promotion remain unopened.
