# AutoEQ Capacity-Aware Calibration Decision

Outcome B: calibration remains insufficient; no `OracleCalibrationManifestV1`
is frozen or manufactured.

## Evidence and formula identity

- Branch: `research/capacity-aware-solver-plan-2026-09-07`.
- Corrected Oracle snapshot: unavailable because
  `AUTOEQ_ORACLE_EVIDENCE_DIR` was not set.
- Capacity screening report SHA-256:
  `d5f301cda251ec8c5ea963f1dd608cd16e14a14fd726db944ea1b024c4537f1f`.
- Same-runtime tournament report SHA-256:
  `c5f0ad3ff57c42ce54e43abb571f86bde347076a2a3067f1e9300076ae55d2f7`.
- QTF formula version: `1`.
- QTF formula SHA-256:
  `10d387db6ea37b2cbdf6a5c6c614c5d3f0a790046e45cbadfa931b32471d9965`.

The calibration validator now requires both QTF fields and rejects a missing,
malformed, or locally mismatched formula hash. This metadata requirement does
not itself constitute calibration evidence.

## Strict gate result

The strict gate cannot be entered with a real campaign because:

- no frozen corrected Oracle reference cells are available;
- no canonical Max10 capacity/compression matrix exists for Storm, U12t, or
  Trio;
- no same-runtime Node/TypeScript 5/15/30/60-second tournament runs exist;
- no aggregate control improvement or non-vacuous regression/catastrophic
  distribution can be established.

Therefore:

```text
status = insufficient
manifest = null
holdout = not opened
production promotion = not opened
```

Synthetic calibration fixtures only verify directionality and manifest
validation. They are not used to derive or freeze production thresholds.
Tasks 1–14 do not require a calibration manifest to run their research
contracts, and the absent manifest does not weaken raw canonical metrics,
Pareto frontiers, directed regret, or QTF evidence requirements.

## Stop boundary

No holdout data was inspected. No calibration thresholds were promoted. No
solver mechanism was promoted to production or made the default. A future
calibration attempt must use the existing corrected Oracle snapshot, the
canonical delivered same-runtime tournament artifacts, and this exact QTF
version/hash contract.
