# C1d — causal online confidence integration

This frozen research-only protocol asks whether the immutable C1 confidence
profile reduces delivered PEQ rig artifact beyond an equal-mean-authority
control.  The source is reconstructed as `R=C+D`; the physical correction is
zero.  The three identical-configuration Standard V2 runs use targets
`R-D`, `R-w_bar*D` in 4–14 kHz, and `R-w_conf(f)*D` in 4–14 kHz respectively;
outside that band both controls have multiplier one.

The only primary set is the six C1c holdout groups pinned in the manifest.
C1b groups are secondary, `primaryGateInput=false`, and cannot affect the
gate.  Batch C token `fresh-real-corpus-v1.2:Batch C` and its cases file are
rejected by the executor.

The endpoint is independently recomputed delivered-cascade RMSE against zero
on the frozen V2 grid in 4–14 kHz.  An observation wins only with at least 5%
improvement versus both baseline and constant authority.  A group requires a
strict majority and median combined gain of 5%; the campaign requires 4/6.

## Identity audit

Base is `bf9581cba91f546e34e8e47a56c44cb61b744e52`; published Standard V2 is
`7c9ebbbe6eefeb131c6c698055c737b429f5b0c6`; `31cc11982…` is historical
product context only.  The executed `runStandardAutoEqV2` path was compared
against published V2: config, numeric policy, preparation, candidate/search,
joint/discrete refinement and response math preserve behavior.  Added V2
changes are optional research-trace callbacks/cache helpers and uncalled
experimental structural-search modules; C1d supplies no trace.  Thus the
executed baseline is semantically compatible with published Standard V2.
