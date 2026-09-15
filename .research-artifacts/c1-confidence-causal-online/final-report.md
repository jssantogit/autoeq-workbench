# C1d closeout — INCONCLUSIVE

The causal gate was not evaluated.  The execution environment left a first
primary runner active and a second invocation began before detection.  At
least `group-c1g-ebdb284a8c7563a12c5f.json` was materialized, but it is
preserved as invalid provenance and is not scientific evidence.

`invalidation-manifest.json` records `scientificallyValid: false` and
`CONCURRENT_PRIMARY_EXECUTION` for every materialized primary artifact.
Neither `C1D_CAUSAL_INTEGRATION_SUPPORTED` nor
`C1D_CAUSAL_INTEGRATION_NOT_SUPPORTED` is valid.

The accepted `C1_CONFIDENCE_MODEL_GENERALIZED` result is unaffected. Batch C
was neither accessed nor executed; the frozen model was not retrained; no
production/core or original-WIP file was modified. The six C1c groups must
not be silently rerun under a new primary campaign name.
