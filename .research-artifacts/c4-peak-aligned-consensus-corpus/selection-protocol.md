# C4a corpus/inventory selection protocol

This is a metadata, parsing, coverage, normalization-integrity, and provenance milestone only. No consensus estimator, peak matcher, prediction error, filter synthesis, or AutoEQ solver is part of this protocol.

## Immutable source

- Repository: `jaakkopasanen/AutoEq`
- Commit: `7ae0f56d53074872b028649617a22bbb4232feb7`
- Commit tree: `671f0a72499ace671e4b0a293bc1948bb8330c96`
- All API/tree and raw URLs include the immutable commit/tree identifiers. No branch URL or full clone is used.
- Raw upstream bytes are cached only below `.research-cache/c4-peak-aligned-consensus-corpus/`; no bytes are committed.

## Domain and identity

- Form is exactly `in-ear`.
- V2 coverage is `[20, 20000]` Hz and the terminal endpoint closure is unchanged: when the final observed point is below 20000 Hz but at or above the penultimate V2 grid point, append exactly `[20000, lastObservedDb]`. No other extrapolation is allowed.
- Every member retains collection, form, exact upstream rig string, exact processed name, variant qualifiers, path, blob SHA, and source metadata rows.
- Device-family identity is separate from `configurationSignature`. The latter is the canonical full processed name; parenthetical qualifiers are never removed for metadata lookup or grouping.
- An unresolved or conflicting configuration is excluded as `CONFIGURATION_AMBIGUOUS`; frequency-response similarity is never used to resolve it.

## Repeated-measurement gate

1. Enumerate every pinned in-ear processed CSV and strict-resolve it against its collection's `name_index.tsv`.
2. Derive `deviceFamily + configurationSignature`, exact collection, and explicit rig class.
3. Group by `deviceFamily + configurationSignature`; count each collection at most once. L/R source rows and multiple files in one collection do not add independent measurements.
4. The primary gate admits only the exact upstream rig string `711` (class `711-class`). Other rig strings remain distinct even when their names contain 711.
5. Objective finite/order/coverage parsing and 500 Hz normalization-integrity hashing are performed without inspecting response morphology.
6. Retain groups with at least 3 independent 711-class collections.
7. Rank eligible groups by independent count descending, then SHA-256 of `autoeq-workbench:c4-consensus-corpus-v1` plus the stable group identity, then group ID. Select the first 6; no device popularity or curve shape enters selection.
8. Hash each frozen group ID with split seed `autoeq-workbench:c4-consensus-split-v1`, sort by that hash, and assign the first three development and last three holdout.

## Why C4 precedes C1

The project knowledge base records increasing treble dispersion across repeated 711 measurements and horizontally shifted high-frequency resonances. Pointwise aggregation can turn that horizontal shift into apparent amplitude disagreement. C4 therefore establishes whether peak-aligned consensus materially changes repeatability before any C1 confidence weighting is designed.

## Side inventories

Cross-rig repeats and exact Type 4.3/HF-capable strings are reported separately. They cannot contribute to the C4 primary gate and are not used for confidence weighting or any outcome analysis.

## Frozen boundary

- Upstream audited boundary: `2718375e64e6e4682cb6cacf46ae8300a431e1ba`
- C2 evidence SHA-256: `1de4d0ac26eb1d24724e01b4dbeae38a6a10343cb8a671c06ccc3e79229d751a`
- C2 interpretation: `C2_CLOSED_HOLDOUT_NOT_CONFIRMED`
