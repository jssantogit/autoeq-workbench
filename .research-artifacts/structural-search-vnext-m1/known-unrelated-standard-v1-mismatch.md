# Known unrelated Standard-v1 floating mismatch

This M1 campaign did not modify Standard-v1.

During validation, the broad core test command exited nonzero because
`test/autoeq/runStandardAutoEq.test.ts` reported one failure:
`delivers identical deterministic Standard-v1 outputs and schemaVersion 2 for default normalization`.

This is recorded separately as required. It is not used as evidence about the
frozen baseline/VNext comparison. The focused M1 runner test and core typecheck
passed.
