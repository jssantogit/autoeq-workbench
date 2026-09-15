# C1h — Self-Contained C1f Corpus Materialization Protocol

This protocol freezes the six C1f primary groups and six C1f secondary-reserve groups as a committed, normalized numeric research corpus. It is data materialization only. It does not execute AutoEQ, generate filters, evaluate confidence, calculate disagreement, or produce causal outcomes.

## Provenance

- Base: `f93adaf41ac4dcf02897d5f390c911014a4fa536`.
- C1f tooling: `cafd24db4bb2b2cce3145c2bce5eb0d274713c06`.
- C1f evidence: `f93adaf41ac4dcf02897d5f390c911014a4fa536`.
- C1f classification: `C1F_CORPUS_READY`.
- C1f hash-index SHA-256: `36cc16692dd7a0cc6e45c3c138e4ed2a481ab6c5293aca0a712098f6ecb3f7b7`.
- Immutable upstream: `jaakkopasanen/AutoEq@7ae0f56d53074872b028649617a22bbb4232feb7`, tree `671f0a72499ace671e4b0a293bc1948bb8330c96`.

Membership is not rediscovered. `groups.json` and `provenance.json` from the committed C1f evidence are the only membership and expected-hash authorities. Primary and secondary IDs are asserted exactly in `materialize.mjs`.

## Rehydration and integrity

A raw response is read from the existing C1f cache only after byte length, Git blob SHA-1, and upstream SHA-256 checks. If unavailable, only the exact immutable upstream raw path at the pinned commit may be fetched. The frozen C1f parser/canonicalizer (version 1), terminal flat hold to 20,000 Hz, and 500 Hz normalization are applied, then original, canonical, and normalized point hashes are compared with C1f.

Raw third-party bytes are never written to a final artifact path. The committed representation contains individual normalized frequency and amplitude arrays plus provenance and integrity references. It does not contain exact-711 consensus, disagreement, correction targets, confidence weights, filters, or outcomes.

## Offline acceptance

`verify.mjs` reads only C1h committed artifacts. It has no network or cache dependency and rejects cache/Batch C paths. It checks all twelve group IDs, all member identities, finite ordered points, frozen normalization, C1f linkage, curve/group/corpus hashes, primary 31-curve count, secondary membership, and primary two-rig structure.

The final manifest records `solverExecuted: false`, `causalOutcomesGenerated: false`, `confidenceMetricsComputed: false`, `disagreementMetricsComputed: false`, `batchCAccessed: false`, `batchCExecuted: false`, `rawUpstreamBytesCommitted: false`, and `normalizedResponsePointsCommitted: true`.
