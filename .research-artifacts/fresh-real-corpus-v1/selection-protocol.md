# Fresh Real Corpus V1 selection protocol

The corpus uses only immutable AutoEq raw URLs at commit `7ae0f56d53074872b028649617a22bbb4232feb7`, whose commit tree must be `671f0a72499ace671e4b0a293bc1948bb8330c96`.

Stage A reads only pinned `name_index.tsv` metadata and the pinned Git tree. It accepts `form = in-ear`, requires a resolvable rig and canonical model, excludes the seven prior VNext models, and ranks source/target identities with SHA-256 under seed `autoeq-workbench:fresh-real-corpus-v1`. Quotas are six Super Review same-rig pairs, six Super Review→oratory1990 cross-rig pairs, and six HypetheSonics→ToneDeafMonk cross-rig pairs. Device identities are globally non-reusable.

Stage B fetches only the selected processed CSVs to the ignored `.research-cache/` directory, verifies nonempty bytes and SHA-256, parses finite ordered points, and requires coverage of the current V2 domain `[20, 20000]` Hz. A rejected curve is recorded by deterministic identity and objective reason; no fit, solver, or response-shape metric is consulted.
