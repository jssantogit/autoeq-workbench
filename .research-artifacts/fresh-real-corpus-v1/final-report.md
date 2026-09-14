# Fresh Real Corpus V1 acquisition result

**CORPUS_V1_INSUFFICIENT**

The pinned AutoEq commit and tree were verified through the immutable GitHub commit object. The deterministic metadata-only selection yielded 18 candidate pairs spanning Super Review, ToneDeafMonk, oratory1990, and HypetheSonics, with the required same-rig and cross-rig quotas.

Stage B fetched only those 36 processed CSVs into the ignored local cache. Every selected file was finite and ordered but ended below the exact current V2 evaluation maximum of 20,000 Hz (the sampled files ended at 19,955.54 Hz). Since the existing V2 interpolation explicitly rejects extrapolation, none covers the complete required `[20, 20000]` Hz domain. The corpus cannot be frozen without relaxing a rule, which this milestone must not do.

- Upstream: `jaakkopasanen/AutoEq` at `7ae0f56d53074872b028649617a22bbb4232feb7`; tree `671f0a72499ace671e4b0a293bc1948bb8330c96`.
- Manifest SHA-256: `bef5048dfdd7ecbda8e62d9df5062dd86f69edd9a54da371f11bf6ac810f4ca7`.
- No AutoEQ solver was executed.
- No upstream measurement raw file was committed.
