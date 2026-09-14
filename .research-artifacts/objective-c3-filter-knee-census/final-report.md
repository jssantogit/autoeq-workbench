# C3 filter-count/error knee census — corpus gate

- Frozen boundary: `b243d5cc4fd94a26ee38873e37d90900b946f9c0`.
- Selected algorithm remains `FROZEN_BASELINE`.
- Classification: **FRESH_REAL_CORPUS_INSUFFICIENT**.
- Evidence SHA-256: `a078e271aa892935567f979a6de9463a09c1690713a9dc595c57ab13f7b0c93e` (the canonical corpus inventory).

## Gate result

The authorized repository inventory contains one real source fixture (Dunu Titan S2) and six target fixtures.  Those fixtures derive exactly six real source-to-target cases: RSV, Mystic 8, S12 Ultra, Storm, U12t, and Trio.  They are exactly the six Structural Search VNext acceptance cases, which C3 explicitly prohibits reusing as its fresh real gate.

Therefore no materially fresh six-case real corpus can be formed from repository data.  No development/holdout split was frozen, no knee frontier was computed, and synthetics were not used to bypass the real-corpus gate.

## Required stop boundary

Per the C3 corpus discipline, this campaign stops before observer instrumentation, deterministic replay, OFF/ON equivalence work, knee geometry, synthetic sanity, or any production selection work.  The committed inventory provides the fixture paths and SHA-256 provenance needed to audit this determination.

## Coverage

- Development: not applicable (no fresh corpus).
- Holdout: not applicable (no fresh corpus).
- Overall: not applicable (no fresh corpus).
- Fresh real corpus IDs and hashes: none.
- Synthetic known-generating-complexity results: not run; the fresh-real gate failed first.

No C2 work, knee-selector implementation, or change to delivered selection was started.
