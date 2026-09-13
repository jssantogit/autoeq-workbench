# Full-Capacity Decision States Implementation Plan

**Goal:** Measure live capacity utilization and compare paired oracle outcomes from valid full-capacity snapshots without modifying search decisions.

**Architecture:** Expose an immutable clone of the incumbent in existing stage telemetry so a research harness can capture the first naturally full/pressured stage. The harness uses that state when available; otherwise it labels a cloned oracle snapshot whose current capacity equals the existing incumbent's actual filter count as reconstructed. It reports fullness and raw pressure separately.

### Task 1: Stage snapshot telemetry
- Add optional cloned incumbent result to `ScalableSearchStage`; test it is cloned, matches filter count, and does not alter results.
- Commit source and focused tests.

### Task 2: Sparse saturated-state research harness
- Add a fixed RSV/Mystic/S12 harness that records all live stages, first natural full/pressure snapshot, and one labeled reconstructed snapshot only when natural state is absent.
- Use existing paired oracle unchanged; report utilization and raw counters separately.
- Add deterministic parsing/record tests and commit.

### Task 3: Evidence and documentation
- Run one irregular-ceiling sparse probe, record JSONL, update resource-envelope documentation with protocol, utilization, pressure/outcomes, and shadow decision.
- Run focused tests, core typecheck, and `git diff --check`; commit report.
