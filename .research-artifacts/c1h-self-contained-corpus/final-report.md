# C1h — Self-Contained C1f Corpus Materialization

- Classification: **C1H_CORPUS_SELF_CONTAINED**
- Base commit: `f93adaf41ac4dcf02897d5f390c911014a4fa536`
- C1f evidence commit: `f93adaf41ac4dcf02897d5f390c911014a4fa536`
- C1f artifact hash index: `36cc16692dd7a0cc6e45c3c138e4ed2a481ab6c5293aca0a712098f6ecb3f7b7`
- Frozen upstream: `jaakkopasanen/AutoEq@7ae0f56d53074872b028649617a22bbb4232feb7` (tree `671f0a72499ace671e4b0a293bc1948bb8330c96`)
- Materialized corpus SHA-256: `db81c5c329128eef6769fa7da210e5580c2eb6bf5c4bc690c2f1104e9b8092d4`

## Materialization

- Groups materialized: 12 (6 primary, 6 secondary reserve).
- Primary curves: 31; secondary curves: 25.
- Cache hits: 56; immutable upstream rehydrations: 0.
- Source hash mismatches: 0.

## Safety

- Corpus-only materialization completed; no scientific execution ran.
- No raw upstream response bytes were committed; normalized response points are the only committed numeric representation.
- Batch C was not accessed and remains sealed.
- Primary and secondary membership remained exactly the frozen C1f selection.
- Final verification is performed separately from committed artifacts and does not read cache or network.

**C1H_CORPUS_SELF_CONTAINED**
