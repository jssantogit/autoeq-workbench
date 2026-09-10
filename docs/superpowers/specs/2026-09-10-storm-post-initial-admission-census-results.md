# Storm post-initial admission census results

Version: storm-post-initial-admission-census-v1 (schema 1)
Case: titan-to-storm
Primary: matching-pursuit-v1:titan-to-storm:0:sparse-0010
Classification: **post-initial-local-only**
Producer commit: 21548aac0380f1e881fd7fd9d951b8dad66132d5

## Scope and frozen census

This is an observational offline census over semantic-unique post-initial parents in frozen trajectory B (`cheap-initial-only`). The initial `sparse-0010` parent is excluded. Parent identities are deduplicated by deterministic canonical structure with filter IDs removed; the parent set is frozen before any proposal outcomes are evaluated.

- Total B expansion occurrences: 20.
- Initial parent occurrences excluded: 12.
- Post-initial occurrences: 8.
- Semantic-unique post-initial parents: 1; repeated occurrences removed: 7.
- Recurring parent groups: 8×[{"enabled":true,"type":"PK","frequencyHz":195,"gainDb":-7.3,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":2958,"gainDb":-6.6,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-10.3,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"enabled":true,"type":"HS","frequencyHz":19331,"gainDb":15,"q":0.7},{"enabled":true,"type":"HS","frequencyHz":19897,"gainDb":10.5,"q":0.7}].
- Frozen parent-set SHA-256: 52688ba926dd9f37ee7df248ac3635daad3d36b0745ad448ae66df71c89677e3.

## Contracts and controls

- Max10; current mutation generator; `orderStructuralProposals`; local polish 24; frozen reference-selector-v1; standard-v2 quantization; canonical delivered evaluation.
- Cheap top-4 uses only canonical pre-polish metrics and lexical rank tie-breaks. Full-polish/canonical labels are computed only after both rankings are frozen.
- Residuals and proposal generation are recomputed exactly from each frozen parent. No beam/search feedback or trajectory mutation occurs.
- The trajectory-global-best comparator is reconstructed from B prefix data through each parent occurrence; future child outcomes are not used.

### Parent structural-beam-v1:titan-to-storm:0:matching-pursuit:proposal-4-remove:0004

- Semantic key: `[{"enabled":true,"type":"PK","frequencyHz":195,"gainDb":-7.3,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":2958,"gainDb":-6.6,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":4695,"gainDb":-10.3,"q":5.66},{"enabled":true,"type":"PK","frequencyHz":7453,"gainDb":-15,"q":8},{"enabled":true,"type":"PK","frequencyHz":12902,"gainDb":6.3,"q":8},{"enabled":true,"type":"PK","frequencyHz":16731,"gainDb":-9.7,"q":8},{"enabled":true,"type":"PK","frequencyHz":18246,"gainDb":9,"q":8},{"enabled":true,"type":"HS","frequencyHz":19331,"gainDb":15,"q":0.7},{"enabled":true,"type":"HS","frequencyHz":19897,"gainDb":10.5,"q":0.7}]`; occurrences: 8; proposal count: 31.
- Reappearance locations: run=1/layer=2/parent=1, run=1/layer=3/parent=1, run=3/layer=2/parent=1, run=3/layer=3/parent=1, run=9/layer=2/parent=1, run=9/layer=3/parent=1, run=11/layer=2/parent=1, run=11/layer=3/parent=1.
- Lexical top-4: [1,2,3,4]; cheap top-4: [14,15,21,22]; overlap: 0.
- Full-canonical best rank lexical=16; cheap=6.
- Useful recall@4 lexical=0/20 (0); cheap=4/20 (0.2).
- Best lexical-admitted: rank 4 (merge), RMSE 1.8796643091496317, maxAbs 5.702460773862317, regret 2.196019485925475.
- Best cheap-admitted: rank 21 (split), RMSE 1.7969179550278074, maxAbs 5.713791694570597, regret 1.8739372325092234.
- Best full-canonical proposal: rank 16 (split), RMSE 1.8205932788503454, maxAbs 5.5186536727262805, regret 1.93157986581745.
- Best full-canonical relation vs parent: Pareto=tradeoff, selector=baseline; vs trajectory-global-best: Pareto=tradeoff, selector=baseline.
- Useful mutation types: remove, split, type-mutation.
- Materially useful ranks: []; local-only ranks: [14,15,21,22]; unrecovered useful ranks: [5,6,7,8,9,11,12,13,16,17,18,19,20,23,24,25].

| Rank | Mutation | Lexical | Cheap | Pre-polish RMSE/maxAbs | Canonical RMSE/maxAbs/regret | vs parent | vs B global | Useful |
| ---: | --- | :---: | :---: | --- | --- | --- | --- | :---: |
| 1 | add-hs | yes | no | 2.65628004107195 / 9.871072307360777 | 2.7381023902574424 / 9.742054277385389 / 8.034154198353427 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 2 | add-ls | yes | no | 5.13465996271513 / 9.823175579914281 | 3.9195168227441246 / 7.739734891765611 / 10.776419279311305 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 3 | add-pk | yes | no | 2.4136540319437496 / 8.438958121019013 | 2.273446386146832 / 8.320833081552841 / 5.379893302151267 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 4 | merge | yes | no | 1.7829612209733101 / 5.8343602365096725 | 1.8796643091496317 / 5.702460773862317 / 2.196019485925475 | tradeoff/baseline | tradeoff/baseline | no |
| 5 | remove | no | no | 1.7586549393052822 / 5.839199835483127 | 1.8564563772677791 / 5.707300372835771 / 2.1057981825299388 | tradeoff/baseline | tradeoff/baseline | yes |
| 6 | remove | no | no | 1.9331419407783421 / 8.718175029036138 | 2.182171012540141 / 8.714713111292102 / 5.539501592797336 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 7 | remove | no | no | 1.7728352787152732 / 6.725677199584984 | 1.9086224296601815 / 6.721047392214122 / 2.8648216858966102 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 8 | remove | no | no | 1.8742696248540678 / 9.0447143247115 | 2.1782451296651493 / 9.015183672605474 / 5.8533359089739365 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 9 | remove | no | no | 1.7917922075845059 / 6.487484147159961 | 1.924195934526074 / 6.46276204173376 / 2.723627063294593 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 10 | remove | no | no | 2.4645937936746067 / 19.427251537599656 | 2.6433315651608984 / 18.461692479252612 / 18.155885884492264 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 11 | remove | no | no | 2.0344281970081792 / 6.780275829081755 | 1.9207004669714047 / 5.825693925461503 / 2.389711756955653 | tradeoff/baseline | tradeoff/baseline | yes |
| 12 | remove | no | no | 1.9152832577049763 / 5.890022027335666 | 1.9276100506055487 / 5.521401894744722 / 2.3590298364633004 | tradeoff/baseline | tradeoff/baseline | yes |
| 13 | remove | no | no | 1.896609464352093 / 5.850786538414161 | 1.9317591131552019 / 5.762996899694556 / 2.415568801846383 | tradeoff/baseline | tradeoff/baseline | yes |
| 14 | split | no | yes | 1.6889507886934696 / 5.850656937638545 | 1.8410464927730856 / 5.718742977054216 / 2.048143059782163 | tradeoff/baseline | tradeoff/baseline | yes |
| 15 | split | no | yes | 1.6905359017205626 / 5.853136983955045 | 1.8365317875073146 / 5.71241795261767 / 2.02879215568203 | tradeoff/baseline | tradeoff/baseline | yes |
| 16 | split | no | no | 1.6904134612169466 / 5.894526065615658 | 1.8205932788503454 / 5.5186536727262805 / 1.93157986581745 | tradeoff/baseline | tradeoff/baseline | yes |
| 17 | split | no | no | 1.7489882053109151 / 8.022942570885796 | 1.935587624624139 / 7.439870128066891 / 3.5994731985982793 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 18 | split | no | no | 1.704487017957386 / 5.847976920011424 | 1.8048243561252286 / 5.716077457364069 / 1.90550277197328 | tradeoff/baseline | tradeoff/baseline | yes |
| 19 | split | no | no | 1.7286876244208096 / 5.8529397019729 | 1.8275202496194498 / 5.721040239325545 / 1.9957194901874253 | tradeoff/baseline | tradeoff/baseline | yes |
| 20 | split | no | no | 1.7187963843521037 / 5.849748087371971 | 1.8182809582846173 / 5.717848624724615 / 1.9586660334319257 | tradeoff/baseline | tradeoff/baseline | yes |
| 21 | split | no | yes | 1.6960461004535303 / 5.845691157217953 | 1.7969179550278074 / 5.713791694570597 / 1.8739372325092234 | tradeoff/baseline | tradeoff/baseline | yes |
| 22 | split | no | yes | 1.7017088754252436 / 5.851855260652844 | 1.802051176086772 / 5.719955798005488 / 1.8957402163185997 | tradeoff/baseline | tradeoff/baseline | yes |
| 23 | type-mutation | no | no | 3.797987522741215 / 9.589674612371796 | 3.292536552718644 / 8.589249172703305 / 8.884575750941403 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 24 | type-mutation | no | no | 2.4830182718957494 / 10.496019901526289 | 2.6320062467785514 / 10.480395517456422 / 8.502618561647527 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 25 | type-mutation | no | no | 2.087638780237074 / 8.051157963545322 | 2.2605093477774094 / 8.037993054713127 / 5.07772192516472 | baseline-dominates/baseline | baseline-dominates/baseline | yes |
| 26 | type-mutation | no | no | 5.12649874623113 / 10.521548510672197 | 4.21169041905752 / 8.439091865908116 / 12.17640667417417 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 27 | type-mutation | no | no | 8.408045869828875 / 14.222190483342171 | 7.301165901549329 / 12.139141513131644 / 25.47682727956779 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 28 | type-mutation | no | no | 13.069570097346675 / 18.922821094891685 | 11.751588619415118 / 16.839306728859363 / 44.34703824036098 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 29 | type-mutation | no | no | 6.609209928859649 / 11.744315602794988 | 5.204626071431985 / 10.11100734801708 / 16.68060515684206 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 30 | type-mutation | no | no | 9.165153849060893 / 14.395013649718138 | 7.801276463940633 / 12.888015177009532 / 27.701599828112162 | baseline-dominates/baseline | baseline-dominates/baseline | no |
| 31 | type-mutation | no | no | 9.401186744893469 / 14.811512889297632 | 7.877028510664725 / 13.33255460907796 / 28.20092441241758 | baseline-dominates/baseline | baseline-dominates/baseline | no |

## Cost accounting

- Unique parents=1; proposals=31; canonical pre-polish evaluations=31; full-polish coordinate trials=744; canonical labels=31; parent baseline canonical evaluations=1.
- These are offline diagnostic counts, not production cost.

## Decision

- Classification: **post-initial-local-only**.
- Materially useful recovered parents: 0; local-only recovered parents: 1; useful misses not recovered: 1.
- Material definition: Lexical-excluded and cheap-admitted proposal whose full canonical result wins parent or frozen point-in-time B global best by selector, or dominates it in both RMSE and maxAbs.
- Cheap admission recovered a post-initial proposal better than lexical-admitted proposals, but no recovered proposal improved the parent or point-in-time B global best materially.
- The finding is local-only and does not establish useful trajectory headroom.

## Invariants and limitations

- doNotChange: packages/core/src/**
- doNotChange: normal solver policy
- doNotChange: mutation library
- doNotChange: frozen selector/reference
- doNotChange: fixtures/baselines
- doNotChange: UI/export/product
- doNotChange: historical artifacts
- doNotChange: Max10/current mutation generator/local polish 24/standard-v2 quantization/canonical delivered evaluation
- doNotChange: dynamic policy, caching, beam changes, temporary-worsening, MP rank audit, U12t/Trio, holdout, promotion, product/default, merge/release/deploy/publish
- This is an offline census over the frozen B cheap-initial-only trajectory; it is not a new competitive trajectory.
- The primary post-initial set contains one semantic parent after excluding sparse-0010; repeated B occurrences are descriptive overhead only.
- Useful is defined from full-canonical relations to lexical-admitted proposals, the parent, and the point-in-time B global best; it does not imply global causal impact.
- C-only parents are recorded as NOT_RUN and are not mixed into the primary census.
- Secondary C-only descriptive set: NOT_RUN (Optional descriptive C-only set was not needed after the single-parent B census was frozen.)

## Hashes and gate status

- Artifact SHA-256: fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920.
- Frozen dynamic artifact SHA-256: c97d7f764923cdb50ac2a097732b74a96c84e797568e8d0842294753ea6aa3a1.
- Frozen B cheap artifact SHA-256: 6ec227c0399211a70c7b78f401fdeece150ac74ba0ffb04446df9460010ae6cc.
- Frozen replay artifact SHA-256: 930c0474b01c03267469d5bc5c3e0a690c9b7a11fe1e8267fdf44db4a8ee4aba.
- Frozen reference snapshot content SHA-256: 0aea73de5592c3afb32491ea6766513a1b2d2982d4765912ba2bfdb74f4b63d3.
- Non-timing deterministic reproduction: true.
- focused_test: PASS_THIS_RUN.
- pnpm_test: FAIL.
- pnpm_typecheck: PASS_THIS_RUN.
- pnpm_build: PASS_THIS_RUN.
- pnpm_lint: PASS_THIS_RUN.
- core_benchmark: NOT_RUN.
- git_diff_check: PASS_THIS_RUN.
- routing_policy: PASS_THIS_RUN.
- deterministic_reproduction: PASS_THIS_RUN.
- Focused test: pnpm --filter @autoeq-workbench/core exec vitest run test/autoeq/v2/research/stormPostInitialAdmissionCensus.test.ts.
- Generation: pnpm --filter @autoeq-workbench/core research:storm-post-initial-census.
- Required gates: pnpm test; pnpm typecheck; pnpm build; pnpm lint; git diff --check; node --test .agents/skills/astra-orchestra/routing-policy.test.mjs.

This artifact stops after the post-initial census and Terra acceptance. It does not run a new dynamic policy, caching, beam change, temporary-worsening experiment, MP rank audit, U12t/Trio, holdout, promotion, product/default change, merge, release, deploy, or publish.
