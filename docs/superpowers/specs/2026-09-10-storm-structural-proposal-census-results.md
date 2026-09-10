# Storm structural-proposal census results

Version: storm-structural-proposal-census-v1 (schema 1)  
Case: titan-to-storm  
Primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010  
Parent: matching-pursuit-v1:titan-to-storm:0:sparse-0010:structural-beam-v1:titan-to-storm:0:matching-pursuit:matching-pursuit-v1:titan-to-storm:0:sparse-0010:0000  
Frozen replay source commit: 26ba86bdb17e0b5d365fd51590dd6abdb4636b96  
Producer commit: 989832ea9f6aca047433b64107d07cc61ada1bea

## Scope and controls

This is an observational, initial-parent-only census. It recreates the frozen parent from the existing Storm diagnostic replay, derives residuals identically, calls the current structural generator and solver order, enumerates all ordered proposals before the current top-4 boundary, and evaluates each proposal independently with the existing 24-trial local polish, standard-v2 quantization, canonical delivered evaluator, and frozen reference selector. It does not extend to replay descendants and does not change beam, generator, rank, polish, selector, promotion, U12t/Trio, or policy behavior.

Configuration: Max10, beam width 2, normal proposals/parent 4, localPolish=24, top4=4. Quantization steps {"frequencyStepHz":1,"gainStepDb":0.1,"qStep":0.01}. Generator generateStructuralMutations; order orderStructuralProposals; selector reference-selector-v1; reference snapshot 0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3.

## Inventory and admission boundary

Total proposals: **21**. Admitted: **4** (ranks 1, 2, 3, 4). Excluded: **17**. Counts by type: {"add-pk":0,"add-ls":0,"add-hs":0,"remove":10,"type-mutation":10,"split":0,"merge":1}. Top-4 types: ["merge","remove"]. Wholly truncated types: ["type-mutation"].

The admission flag is exactly rank <= 4; ranks are current solver ordering only, not dictionary provenance.

## Proposal results

Metrics are RMSE / maxAbs; regret is Directed Reference Regret v1. “Continuous” is post-polish before canonical quantization. Bound saturation is the number of saturated filters in the canonical output.

| Rank | Ordinal | Admitted | Mutation | Pre-polish | Post-polish continuous | Canonical / regret | Pareto vs parent | Selector vs parent | Coordinate trials | Canonical saturated filters |
|---:|---:|:---:|:---|---:|---:|---:|:---|:---|---:|---:|
| 1 | 21 | yes | merge | 1.7780314969732776 / 6.008734393902259 | 1.860148450931376 / 5.899810826890398 | 1.8600490806256555 / 5.899909013582937 / 2.1811260718628063 | tradeoff | parent | 24 | 2 |
| 2 | 17 | yes | remove | 1.9281057398169095 / 8.716363585402057 | 2.1880254811566697 / 8.715500931055612 | 2.1878625643339666 / 8.715501215505615 / 5.554226132480243 | baseline-dominates | parent | 24 | 1 |
| 3 | 19 | yes | remove | 1.7538248331958555 / 6.013575593883999 | 1.8368651211277602 / 5.904652026872139 | 1.8367740125912453 / 5.904748612556391 / 2.094299508592714 | tradeoff | parent | 24 | 2 |
| 4 | 15 | yes | remove | 1.7681394024007941 / 6.721877992361329 | 2.048927676326693 / 6.720067930368773 | 2.0487535434545334 / 6.720068525948621 / 3.327445720248407 | baseline-dominates | parent | 24 | 2 |
| 5 | 13 | no | remove | 1.8709642802927922 / 9.051847310209427 | 2.046532170456431 / 9.044274199003967 | 2.0464496338825615 / 9.044280438778317 / 5.601143952177122 | baseline-dominates | parent | 24 | 2 |
| 6 | 11 | no | remove | 1.785499337452002 / 6.46699165872551 | 2.062910915573649 / 6.45718374969576 | 2.0627383118971485 / 6.457186923346409 / 3.2093187558832854 | baseline-dominates | parent | 24 | 2 |
| 7 | 9 | no | remove | 2.5019316558859024 / 19.613550597026254 | 2.5670391314952847 / 19.367114137977808 | 2.566989515553885 / 19.36720188000778 / 19.235165168733136 | baseline-dominates | parent | 24 | 1 |
| 8 | 7 | no | remove | 1.9969155981759403 / 6.746974125900628 | 1.901522727110446 / 6.075201788947922 | 1.901454339015441 / 6.075298374632183 / 2.414488201508928 | baseline-dominates | parent | 24 | 2 |
| 9 | 5 | no | remove | 1.840725135669484 / 6.050795826954705 | 1.6990017666736137 / 5.850278905538724 | 1.6989353408590506 / 5.850643387777495 / 1.5509895845764776 | tradeoff | candidate | 24 | 2 |
| 10 | 3 | no | remove | 1.8137873440324388 / 6.037151498152225 | 1.8776238850823719 / 5.803178128199189 | 1.8775808187066088 / 5.803573701724353 / 2.21506257426515 | tradeoff | parent | 24 | 2 |
| 11 | 1 | no | remove | 1.8573193362017753 / 6.025066970548769 | 1.9690654289505782 / 5.91623934325567 | 1.9691238312745232 / 5.916335315487425 / 2.606809709158419 | tradeoff | parent | 24 | 2 |
| 12 | 2 | no | type-mutation | 3.2989466275422603 / 8.589234624956411 | 2.852884584383358 / 7.588767536031364 | 2.8528678258153106 / 7.588766412119765 / 6.711499237079988 | baseline-dominates | parent | 24 | 2 |
| 13 | 20 | no | type-mutation | 2.0968840075041575 / 8.054957170769956 | 2.2316814640492795 / 8.050932770921996 | 2.2316160417953386 / 8.050936149841181 / 5.006522017704542 | baseline-dominates | parent | 24 | 2 |
| 14 | 18 | no | type-mutation | 2.5035486055801996 / 10.499819108750962 | 2.5919204964060616 / 10.495794708902999 | 2.591875672708353 / 10.495798087822152 / 8.422423756136991 | baseline-dominates | parent | 24 | 2 |
| 15 | 4 | no | type-mutation | 4.202282986037079 / 8.43915461892775 | 3.365217207143347 / 6.8928961157976625 | 3.3652777756069057 / 6.892896493838112 / 8.34050765583354 | baseline-dominates | parent | 24 | 2 |
| 16 | 6 | no | type-mutation | 4.842938320825121 / 9.139481882894477 | 3.9249775596533767 / 7.592893428999692 | 3.925016534670907 / 7.592893812705234 / 10.743029505695128 | baseline-dominates | parent | 24 | 2 |
| 17 | 8 | no | type-mutation | 7.497288883152705 / 12.139667922524767 | 6.431388906995059 / 10.592890990769046 | 6.43147610190364 / 10.592891381225288 / 21.50684735078381 | baseline-dominates | parent | 24 | 2 |
| 18 | 10 | no | type-mutation | 12.90390464200959 / 17.839834666230857 | 11.719512487880362 / 16.292893072876566 | 11.719628431604427 / 16.292893462993185 / 43.98148069859234 | baseline-dominates | parent | 24 | 1 |
| 19 | 12 | no | type-mutation | 6.7668300035204005 / 11.918691361195858 | 5.528045156011221 / 10.65478662980988 | 5.528435574171336 / 10.654789480746686 / 18.154175948146268 | baseline-dominates | parent | 24 | 2 |
| 20 | 14 | no | type-mutation | 8.981655596614154 / 14.343213962205134 | 7.762802133993601 / 12.887381124567236 | 7.762902726495027 / 12.887528134817865 / 27.558186530988912 | baseline-dominates | parent | 24 | 2 |
| 21 | 16 | no | type-mutation | 9.562892747825718 / 14.985888647698498 | 8.224866645353302 / 13.876253508719667 | 8.22526114281793 / 13.876336741807565 / 29.764341046353007 | baseline-dominates | parent | 24 | 2 |

## Summary and classification

Best admitted by frozen selector: **rank 3 (remove), RMSE 1.8367740125912453, maxAbs 5.904748612556391, regret 2.094299508592714**.  
Best excluded by frozen selector: **rank 9 (remove), RMSE 1.6989353408590506, maxAbs 5.850643387777495, regret 1.5509895845764776**.  
Lexical rank best overall: **rank 1 (merge), RMSE 1.8600490806256555, maxAbs 5.899909013582937, regret 2.1811260718628063**.  
Excluded counts: dominate any admitted=5, selector-preferred to any admitted=6, dominate parent=0, selector beat parent=1, selector beat primary=1, improve reference=0.

Classification: **admission-bottleneck-supported**. The conservative material criterion is “canonical dominates parent or sparse-0010, or frozen-selector beats sparse-0010”; excluded material replacements=1. Consistent exclusion outperformance=false; admitted comparable-or-better=false.

Evidence:

- 17 proposal(s) were excluded after the rank-4 boundary.
- 1 excluded proposal(s) were selector-preferred to the best admitted proposal.
- 1 excluded proposal(s) met the conservative material-replacement criterion: canonical dominates parent or sparse-0010, or frozen-selector beats sparse-0010.

Guards:

- A positive result means an admission/truncation issue only in this frozen configuration and parent; it is not an automatic cause, solution, or policy decision.
- A negative result only weakens the top-4-loss hypothesis at this parent; it does not rule out other parents or configurations.
- Structural ranks are lexical solver-order ranks; no dictionary atom/rank semantics were collected or inferred.

Recommended next experiment: **Positive admission/truncation evidence: separately design a causal ranking/admission experiment; this census alone does not authorize a policy change.**

## Provenance, hashes, and gates

- Frozen replay source commit (historical replay provenance): 26ba86bdb17e0b5d365fd51590dd6abdb4636b96
- Producer commit (current checked-out census code): 989832ea9f6aca047433b64107d07cc61ada1bea
- Source artifact logical ID: external:storm-mp-reallocation-corrective-rerun1/tournament-report.json (c8bf9b05b3c00cb4b9475bb850665d4708ad6c5e027971cb0d461f59c1b00351)
- Diagnostic replay logical ID: repo:packages/core/.research-artifacts/storm-diagnostic-replay-20260910/sparse-0010/replay-report.json (930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba)
- Reference snapshot logical ID: external:OracleReferenceSnapshotV1.json (0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3)
- Runtime inputs are resolved from replay.sourceArtifact.path and snapshotPath or DEFAULT_SNAPSHOT; absolute machine/worktree paths are intentionally omitted from canonical output.
- Frozen parent canonical metrics: RMSE 1.69443656174349, maxAbs 6.025019146179327, filterCount 10, cancellationScore 0, Directed Reference Regret v1 1.6357158771757774.
- Frozen parent canonical filters: [{"id":"autoeq-1","enabled":true,"type":"PK","frequencyHz":174,"gainDb":-6.3,"q":8},{"id":"autoeq-2","enabled":true,"type":"PK","frequencyHz":2635,"gainDb":-5.6,"q":8},{"id":"autoeq-3","enabled":true,"type":"PK","frequencyHz":3320,"gainDb":-6.3,"q":8},{"id":"autoeq-4","enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-9.3,"q":8},{"id":"autoeq-5","enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"id":"autoeq-6","enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"id":"autoeq-7","enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"id":"autoeq-8","enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"id":"autoeq-9","enabled":true,"type":"HS","frequencyHz":19331,"gainDb":15,"q":0.7},{"id":"autoeq-10","enabled":true,"type":"HS","frequencyHz":19897,"gainDb":10.5,"q":0.7}]
- Frozen parent replay comparison: canonical filters, cancellation score, and Directed Reference Regret v1 all matched the replay snapshot.
- Census artifact SHA-256: 62dc02f53b7e9ae3e730950cb0f205a4d6907542d4c8734c78e0d95569b944c0
- Focused test: pnpm exec vitest run test/autoeq/v2/research/stormStructuralProposalCensus.test.ts test/autoeq/v2/research/structuralBeam.test.ts test/autoeq/v2/research/stormDiagnosticReplay.test.ts
- Required gates: pnpm test, pnpm typecheck, pnpm build, pnpm lint, pnpm --filter @autoeq-workbench/core benchmark, git diff --check, node --test .agents/skills/astra-orchestra/routing-policy.test.mjs
- Generation: pnpm --filter @autoeq-workbench/core research:storm-structural-census
- Historical artifacts were read-only and no raw data was added.

Validation output for this checkout:

- Focused census, structural-beam, and diagnostic-replay tests: PASS (15 focused tests after provenance/recommendation retry).
- pnpm typecheck: PASS.
- pnpm build: PASS.
- pnpm lint: PASS.
- git diff --check: PASS.
- routing-policy.test.mjs: PASS from the repository checkout that owns .agents.
- pnpm test: BLOCKED by two unrelated pre-existing floating-point/parity fixture failures (Standard-v1 metrics and solver-lab canonical response).
- pnpm --filter @autoeq-workbench/core benchmark: BLOCKED by existing Standard-v1 benchmark drift; no baseline update was made.
