# C1g — Causal Confidence Integration Replication

This is the frozen, one-shot causal replication of the C1d hypothesis on the six primary groups materialized by C1h. C1d remains INCONCLUSIVE because CONCURRENT_PRIMARY_EXECUTION invalidated its execution; no C1d outcome is reused. The only response input is the committed C1h normalized corpus.

## Frozen provenance

- C1h protocol: `723307d5ba5db3afd6ade3489cbed2bd8b25058b`; evidence: `b2d13ba799067738dee523b22e8930e97e71c5b4`.
- C1h evidence-index SHA-256: `73e5ae8f9bd11ecb63d5b0da7d273655bc023da15d6674a765b125915bcb66c7`.
- Materialized corpus SHA-256: `db81c5c329128eef6769fa7da210e5580c2eb6bf5c4bc690c2f1104e9b8092d4`.
- Confidence model: `65cc495bebdce148ab3aaf06186b6683213717235c71854314859aba99f92f00`; it is loaded read-only.
- Standard V2 published identity: `7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`; historical product boundary: `31cc11982ebd07e009788d5e2c5c3537e9e6b615`.

## Inputs and frozen groups

Responses are read only from `.research-artifacts/c1h-self-contained-corpus/**`. Cache, network, upstream, raw paths, Batch C, C1d outcome artifacts, and secondary reserve outcomes are forbidden.
The six primary IDs and the exact order are: c1g-251bf90cf23f557cb011, c1g-c45cb51de5231139b2f2, c1g-e9b56c7e332c693b6f82, c1g-41b1767dc01a935198bf, c1g-ba1d3af16db7a116d755, c1g-1be44ee4bdbd73cbf632.
The six secondary IDs remain `SECONDARY_RESERVE_UNEXECUTED` and never enter the gate.

Each primary group has four literal-rig `711` responses. Its reference is the pointwise median on the frozen V2 grid, with no smoothing, alignment, source weighting, or non-711 input. For every non-711 response R and consensus C, `D = R - C`, truth is zero, and `desired_base = C - R = -D`.

## Frozen arms

- **FROZEN_BASELINE:** source R, target C, desired correction `-D`.
- **CONSTANT_AUTHORITY_CONTROL:** inside 4–14 kHz, `w_bar = mean(w_conf)` and `desired_const = w_bar * desired_base`; outside, multiplier one.
- **CONFIDENCE_SHAPED:** inside 4–14 kHz, `desired_conf = w_conf * desired_base`; outside, multiplier one.

The equal-authority invariant is checked before the first solver call with tolerance `1e-12`. Confidence only preconditions desired correction; it is not placed in loss, ranking, candidate generation, refinement, compression, or any solver internals. Every arm uses the same resolved Standard V2 settings.

## Endpoint and gates

After each unchanged Standard V2 run, calculate the delivered filter cascade independently against zero. The primary endpoint is `E_arm = RMS(H_arm)` over 4,000–14,000 Hz. Observation gains are `(E_base-E_conf)/E_base` and `(E_const-E_conf)/E_const`; both must be at least 0.05 without rounding. A zero denominator is `NON_INFORMATIVE_ZERO_DENOMINATOR` and no epsilon is introduced.

A group requires a strict majority of informative wins and median combined gain at least 0.05. The campaign passes only at least 4 of exactly 6 group signals. Results are `C1G_CAUSAL_INTEGRATION_REPLICATED`, `C1G_CAUSAL_INTEGRATION_NOT_SUPPORTED`, or `INCONCLUSIVE` for an execution-integrity failure after primary start.

## One-shot execution integrity

All preflight checks run before rights are consumed. Immediately before the first solver call, one foreground process exclusively creates `primary-execution.lock`, then the permanent exclusive-create `primary-execution-attempt.json`, then persists `PRIMARY_STARTED`. A second invocation fails closed before any solver call. All six groups run sequentially in the frozen order and arms run BASELINE, CONSTANT_AUTHORITY, CONFIDENCE_SHAPED. Each complete group is written through a temporary file and atomic rename. The permanent marker is never deleted. The runtime lock is removed only after `PRIMARY_COMPLETE` and complete evidence writing; it remains on invalidation.

## Safety

The secondary reserve and Fresh Real Batch C remain untouched. The harness never changes core, production, frontend, solver code, C1f, C1h, or any prior campaign. Protocol and evidence commits are separate, and no executor/protocol patch is permitted after `PRIMARY_STARTED`.
