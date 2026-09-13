# Squiglink Source-First Remake Design

## Goal

Rebuild the AutoEQ Workbench web interface from the actual Squiglink source rather than continuing to imitate it manually, while preserving the Workbench's existing DSP/domain contracts and keeping the published site usable throughout the migration.

The remake must feel and behave like a source-derived Squiglink interface across the whole application: header, graph, toolbar, responsive layout, curve management, equalizer, tools, spacing, control density, and interaction patterns. The deliberate product-level visual differences are the AutoEQ Workbench name/wordmark and the Workbench color palette.

This is a source-first port, not a legacy-architecture fork. The application remains Vite + React + TypeScript, `packages/core` remains the DSP/AutoEQ authority, and Zustand remains the canonical workspace state.

## Branch And Publication Policy

Development happens on:

```text
remake/squiglink-base
```

The current `main` branch remains the stable rollback point during the remake.

The public GitHub Pages URL remains:

```text
https://jssantogit.github.io/autoeq-workbench/
```

During the remake, that public URL is the continuous preview of `remake/squiglink-base` rather than `main`.

The deployment policy is:

```text
push to remake/squiglink-base
    -> CI
    -> CI success
    -> Pages
    -> checkout exact CI-approved SHA
    -> publish apps/web/dist
```

A push to `main` may continue to run CI, but must not replace the public remake deployment while this policy is active.

Because the Pages `workflow_run` receiver is most reliable when the receiving workflow exists on the default branch, the deployment-control workflow remains on `main` and is narrowly changed to publish successful push CI runs from `remake/squiglink-base`. The remake branch itself contains the application work.

No app implementation work starts by deleting or blanking `apps/web`. The published application must remain usable after each coherent migration step.

## Upstream Source And Provenance

Use Squiglink Lab as the source reference. The initially inspected upstream revision is:

```text
repository: squiglink/lab
commit: 9ff842c539b058cc726207b689c904c9efff75fd
license: BSD Zero Clause License
```

The 0BSD license permits use, copy, modification, and distribution. The repository must still preserve provenance clearly even though attribution is not a license condition.

Create an immutable reference snapshot under:

```text
vendor/squiglink/
```

The snapshot must include the upstream source needed to reproduce/inspect the original implementation, including its license. Add an `UPSTREAM.md` recording at least the upstream repository URL, exact commit SHA, and snapshot date.

`vendor/squiglink/` is reference material only:

- do not edit vendored source to implement Workbench behavior;
- do not execute vendored scripts directly in the production app;
- do not import runtime code directly from `vendor/`;
- do not load Squiglink runtime assets from a CDN;
- keep adapted/runtime code under `apps/web`.

If an approved Squiglink feature is found in another upstream source/revision rather than the pinned Lab snapshot, record that exact additional source and revision before adapting it. Do not silently re-create a feature from memory while claiming it came from the vendored source.

## Architecture Boundary

The high-level architecture is:

```text
packages/core
    FR / Target / filters / DSP / normalization contracts / metrics / future AutoEQ
                         |
                         v
                workspace state
                   (Zustand)
                         |
                         v
                React composition
                         |
             +-----------+-----------+
             |                       |
             v                       v
     Squiglink-derived UI      Squiglink-derived adapters
     controls/layout/styles    D3 / Web Audio / import-export
```

Ownership rules are strict:

- `packages/core` owns domain math and numeric product contracts.
- Zustand owns canonical workspace state: measurement curves, active FR/Target, filters, selections, theme, and Workbench-level UI state that must survive component remounts.
- React owns application composition and lifecycle.
- Squiglink-derived modules own narrowly scoped rendering or browser interaction where reusing the source is advantageous, such as the D3 graph and Web Audio tools.
- Squiglink-derived modules must not introduce a second global application state that competes with Zustand.

Reuse source code aggressively where useful, but add adapters at architectural boundaries instead of importing Squiglink's global mutable state model into the Workbench.

A preferred runtime organization is conceptually:

```text
apps/web/src/
  squiglink/
    graph/
    sound-tools/
    compare/
    eq-io/
    styles/
  features/
  state/
```

Exact filenames belong to the implementation plan after code inspection; this design fixes responsibilities rather than forcing artificial file splits.

## Runtime Dependency Policy

The published app remains self-contained.

Squiglink source currently references browser-global dependencies such as D3 through script tags. In the Workbench remake, runtime libraries such as D3 must be installed as normal project dependencies and bundled through Vite/pnpm.

Do not add production dependence on:

- the Squiglink website;
- the Squiglink GitHub repository;
- external D3/CDN script tags;
- remote measurement databases;
- analytics or ad infrastructure from Squiglink.

Browser APIs such as Web Audio remain valid local runtime dependencies.

## Visual And Branding Contract

The entire application follows Squiglink's composition and responsive behavior as the source reference, not merely its lower panel.

Port or adapt the source-derived behavior for:

- header proportions and placement;
- graph container and graph sizing;
- graph toolbar composition;
- primary/secondary content relationship;
- tabs/panel mechanics;
- curve-manager composition;
- equalizer layout and filter controls;
- tool sections;
- mobile/desktop responsive behavior;
- spacing, control density, borders, radii, typography hierarchy, icon placement, and interaction states.

Branding differences are intentionally narrow:

- replace Squiglink branding with the textual wordmark `AutoEQ Workbench`;
- do not create a new logo in this remake;
- remove ads, sponsor/premium branding, and Squiglink-specific identity;
- keep the AutoEQ Workbench color palette rather than Squiglink's original palette.

No image generation is required for the remake.

## Themes

Keep both Light and Dark themes.

Light remains the default theme.

The same Squiglink-derived structure and component styling must be shared by both themes; theme differences should be expressed through Workbench color tokens/CSS variables rather than separate duplicated layouts.

The Workbench palette remains the source of colors. Existing product direction includes the amber/copper accent family and the current light/dark surface language. Graph-series colors remain semantically independent from the general UI accent.

## Information Architecture

Replace the current dock IA with:

```text
Curves | Equalizer | Tools
```

This reuses Squiglink's tab/panel interaction model while replacing `Brands | Models | Equalizer`, because AutoEQ Workbench has no Squiglink headphone database.

### Curves

`Curves` owns local FR/Target import and curve management.

Preserve the Workbench domain model:

```ts
CurveKind = 'fr' | 'target'
activeFrId: string | null
activeTargetId: string | null
```

`Source` must not become a third curve kind.

Multiple FR and Target curves may coexist. Curve controls should use the Squiglink manager as the composition/interaction reference where applicable, including useful source-derived operations such as visibility, recolor, baseline/reference, offset, labels, pinning or equivalent curve management when they can be represented cleanly in the Workbench model.

Any additional curve-manager feature must preserve the distinction between stored measurement data and view-only presentation state. A visual offset, smoothing level, hidden state, or graph baseline must not silently mutate the imported raw FR/Target samples unless the core/domain contract explicitly requires such a transformation.

### Equalizer

`Equalizer` follows the Squiglink Parametric Equalizer composition closely while using Workbench state and core math.

Keep current supported filter types:

```text
PK / LS / HS
```

UI labels may follow the Squiglink source terminology where useful, but the runtime filter model must map explicitly to the Workbench core types rather than duplicating a second filter model.

Keep current Workbench hard product limits and shared settings contracts. Squiglink's input ranges must not silently replace them.

The Equalizer includes:

- active FR selection;
- active Target selection;
- enabled/disabled filters;
- Type / Frequency / Gain / Q editing;
- add/remove/sort controls;
- preamp display/output as appropriate;
- filter import/export;
- useful Graphic EQ/Wavelet export where the source implementation can be adapted cleanly;
- AutoEQ constraints/settings composition;
- AutoEQ button in its intended final location.

Filter-count and solution-state information belongs here when it is useful context, rather than in a generic Details panel.

## AutoEQ Boundary

Do not port or execute the legacy Squiglink AutoEQ optimizer.

The remake may port/adapt the Squiglink AutoEQ interface, constraints panel, ranges, layout, and visual states, but there is only one future optimization authority: the Workbench Standard AutoEQ engine planned under Plan 2 in `packages/core`.

During the remake, the `AutoEQ` button remains present in its intended final position but has no optimization engine behind it. It may be disabled or otherwise inert. No separate `coming soon` or `in development` presentation is required.

The remake must not start Plan 2 implementation as a side effect of wiring the UI.

## Graph Architecture

Replace the current custom React/SVG graph renderer with a real port of the Squiglink D3 graph.

The source reference includes the Squiglink graph's SVG composition, D3 scales/axes, interaction model, and 800x346 graph viewport. Port those behaviors instead of manually reproducing them in React.

The integration boundary is:

```text
React component
    |
    v
TypeScript graph adapter
    |
    v
ported Squiglink D3 renderer
    |
    v
SVG
```

D3 owns the interior of the graph. React owns mount/unmount and passes graph state/data through a controlled adapter.

The adapter must provide a clear lifecycle: create/mount, update, and destroy/cleanup. React rerenders must not produce duplicate axes, handlers, SVG elements, timers, or leaked observers.

The graph does not become a second DSP engine. Workbench/core data remains authoritative for FR, Target, full-cascade equalized FR, and normalization semantics that belong to the domain model.

### Main Graph Semantic Contract

The main graph continues to show semantic response curves only:

- imported FR curve(s);
- imported Target curve(s);
- the active FR after the complete enabled EQ cascade when filters exist.

Do not plot isolated selected-filter transfer curves.

Do not add a selected-filter vertical marker merely because a filter row is selected.

Internal PEQ transfer and desired-correction curves remain internal/derived data unless a later explicit product decision changes this contract.

The derived equalized FR remains one curve for the active FR and full enabled cascade.

## Graph Toolbar

The Squiglink-derived graph toolbar replaces the current Workbench `UtilityRail`; do not keep two parallel toolbars.

The remake toolbar includes the useful Squiglink controls:

```text
Zoom: Bass / Mids / Treble
Normalize: dB / Hz
Smooth
Inspect
Label
Screenshot
Recolor
```

Behavioral ownership is split deliberately:

- normalization uses Workbench state/core semantics and stays within shared product bounds;
- graph zoom, label, inspector, screenshot, recolor, and smoothing interaction are ported/adapted from Squiglink where possible;
- view-only operations must remain view-only unless the domain contract explicitly says otherwise.

The existing normalization anchor contract remains bounded to the canonical product frequency range.

## Tools

`Tools` replaces the former `Details` tab and becomes a real audio-tool workspace rather than a dumping ground for internal state.

Its conceptual composition is:

```text
Tools
  Sound Tools
    Tone Generator
    Music Player
  Compare A/B
  Analysis
```

The exact visual order should follow the Squiglink source composition where it produces a more faithful and usable result, with Analysis kept secondary rather than dominating the panel.

### Tone Generator

Port/adapt the Squiglink Web Audio tone-generator behavior rather than designing a new generator from scratch when the source implementation is available.

It must remain local in the browser and must not require a backend.

Browser autoplay/user-gesture restrictions must be handled normally: starting audio occurs only from an allowed user gesture, and teardown must stop/disconnect active nodes.

### Music Player

Include the approved music-player capability in the first remake.

Prefer direct reuse/adaptation from the identified Squiglink reference implementation. If the pinned Lab snapshot does not contain the player implementation, locate and record the exact upstream source/revision before adaptation. Do not present a newly invented player as a direct source port.

The player must operate on user-selected local audio and must not upload the file. Do not commit or bundle real user music/audio test data; tests use synthetic fixtures or mocks.

### Compare A/B

Include Compare A/B in the first remake and reuse/adapt the Squiglink interaction pattern/source where available.

At the Workbench boundary, A/B comparison must compare explicit user-selectable audio/EQ states rather than introducing an invisible duplicate workspace. The implementation plan must map the source behavior to the existing filter/workspace model and test that switching states is deterministic and reversible.

If the exact source feature stores mutable global state, adapt that state into a bounded module or Zustand representation rather than carrying the global singleton into the application.

### Analysis

Move useful technical output from the old `Details` tab into a secondary `Analysis` section under Tools.

Retain:

- MAE;
- RMSE;
- maximum absolute error;
- max-error frequency;
- preamp.

Do not retain the old Details composition solely for compatibility.

Move or remove generic workspace metadata from this section:

- active/total filter count belongs with Equalizer;
- solution state belongs with AutoEQ/Equalizer context;
- manual/AutoEQ provenance belongs with the filter solution/result context.

Analysis may be visually collapsed/secondary so Sound Tools and Compare A/B remain the primary interactive tools.

## Import And Export

Reuse useful Squiglink import/export code where compatible rather than delaying it solely to keep an artificially small first milestone.

The first remake includes the source-backed paths that serve FR/EQ workflows, including:

- local FR import;
- local Target import;
- PEQ/filter import;
- PEQ/filter export;
- screenshot export;
- Graphic EQ/Wavelet-style export when supported by the adapted source behavior.

Existing conservative FR/Target parsing and Workbench domain validation stay authoritative where they are already stronger or explicitly specified.

Exports must describe the delivered/current state, not an unquantized or stale intermediate state.

No upload-to-server behavior is introduced.

## Scope Exclusions

Do not port Squiglink features that depend primarily on its hosted measurement ecosystem or business/branding layer unless a later product decision explicitly adds them.

Excluded from this remake:

- Brands/Models database browsing;
- remote Squiglink measurement database integration;
- ads;
- sponsor/premium/paywall behavior;
- Patreon-related UI;
- analytics copied from Squiglink;
- Squiglink branding/assets used as Workbench branding;
- legacy Squiglink AutoEQ optimization runtime.

A source-derived utility is not excluded merely because it was not in the old Workbench. Sound Tools, Tone Generator, Music Player, Compare A/B, useful curve-manager actions, and useful EQ import/export are explicitly in scope.

## Functional-Continuity Migration Strategy

The remake is migrated incrementally over the existing functional `apps/web`; it is not rebuilt as an empty shell.

The approved sequence is:

1. Create/use `remake/squiglink-base` from the current stable baseline.
2. Switch CI/Pages policy so successful pushes from the remake branch feed the public URL, while `main` remains rollback and does not overwrite the preview.
3. Vendor the immutable Squiglink source snapshot and provenance/license metadata.
4. Port shell/layout/CSS/header and the Squiglink-derived graph toolbar while preserving existing functional import/graph paths.
5. Replace the existing graph renderer with the encapsulated D3 port.
6. Migrate the Curves manager/import flow to the Squiglink-derived composition.
7. Migrate Equalizer and source-backed import/export while preserving Workbench filter/core contracts.
8. Add Tools: Sound Tools, Tone Generator, Music Player, Compare A/B, and Analysis.
9. Perform mobile/desktop and Light/Dark parity/stability closeout.
10. Only after the remake is stable, resume Plan 2 Standard AutoEQ work and connect the already-positioned AutoEQ UI to that engine.

Each migration step must be coherent enough to publish. Temporary duplication is allowed inside a step while implementing, but the commit pushed as a preview gate should not leave two competing user-facing controls for the same responsibility.

## Error Handling And Browser Constraints

Preserve the existing structured/non-destructive Workbench error philosophy.

A bad local file, unsupported filter import, invalid numeric input, failed screenshot, or browser Web Audio restriction must not corrupt the workspace.

Graph and Web Audio adapters must clean up listeners, observers, audio nodes, timers, and object URLs they create.

Audio tools must degrade clearly when a browser capability is unavailable. Do not add a backend as a workaround.

For local media, revoke generated object URLs when replaced/unmounted.

## Existing Numeric And DSP Contracts

The remake is not permission to alter the numerical product contract.

Preserve the shared `packages/core` policies already established for the Workbench, including the fixed MVP sample rate/evaluation domain and the shared AutoEQ/filter hard bounds. UI source ranges from Squiglink must be adapted to those contracts rather than copied blindly.

Important existing semantics remain:

- normalization is a Workbench/core concern;
- preamp is derived from the full final filter cascade over the canonical dense evaluation domain;
- graph equalized FR means active FR plus the complete enabled filter cascade;
- filter count is a ceiling/complexity concern, not a target to fill;
- Plan 2 Standard AutoEQ remains deterministic and fresh-solution oriented when it is later implemented.

This remake must not fork those policies into duplicate constants in `apps/web`.

## Testing Strategy

Validation is risk-based but mandatory.

### Core Regression

Existing core tests must remain green. The remake should not change core DSP behavior unless a separately approved domain change is required.

### React/State Tests

Test the Workbench-to-adapter boundaries rather than trying to snapshot every pixel:

- FR/Target import still populates canonical workspace state;
- active FR/Target selection drives the correct graph data;
- filter edits produce the expected derived equalized FR/preamp state;
- tab/state transitions do not duplicate or lose workspace state;
- theme switching preserves state;
- Analysis values come from current derived workspace data;
- AutoEQ control is present but does not invoke a legacy optimizer.

### D3 Graph Tests

Cover deterministic adapter behavior:

- mount creates one graph instance;
- update changes data without duplicating axes/handlers;
- destroy removes owned listeners/observers;
- semantic series contract excludes isolated selected-filter curves;
- equalized FR follows the active FR/full cascade;
- target styling remains semantically distinct;
- toolbar actions affect the intended view/state only.

Use targeted DOM/jsdom tests for adapter behavior and browser smoke tests for interactions that jsdom cannot represent reliably.

### Web Audio Tests

Unit-test the Web Audio control layer with mocks/fakes where practical. Do not require speakers or real media during CI.

Cover lifecycle and state transitions for tone generation, local music playback, and A/B switching. Ensure nodes/object URLs are cleaned up.

### Visual/Responsive Verification

Because the objective is source-derived Squiglink parity, manual deployed visual verification is an explicit completion requirement.

At representative mobile and desktop widths, verify both Light and Dark for:

- header/wordmark;
- graph dimensions and responsiveness;
- toolbar expansion/controls;
- Curves tab and empty/loaded states;
- Equalizer rows/settings/import-export;
- Tools sections;
- inspector/labels/screenshot;
- long curve names and many filters;
- touch-sized controls and scrolling behavior.

The public Pages URL is the convenient preview environment for this visual review.

## CI And Verification Commands

The repository baseline remains:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
git diff --check
```

The Pages-specific production build must continue to use the repository project base path and publish `apps/web/dist`.

No successful-completion claim may be made from code inspection alone; CI/deployed smoke evidence must be observed for the relevant commit.

## Completion Gate

The source-first remake is complete only when all of the following are true:

1. the public Pages URL is fed by successful `remake/squiglink-base` CI pushes during the remake;
2. `main` remains a stable rollback and does not overwrite the preview;
3. the Squiglink upstream snapshot/provenance is pinned and immutable under `vendor/squiglink/`;
4. production does not execute from `vendor/` or depend on Squiglink/CDN runtime resources;
5. the complete interface composition is source-derived from Squiglink while using the AutoEQ Workbench name and palette;
6. Light and Dark both work, with Light default;
7. the D3 graph port replaces the old renderer and obeys the Workbench semantic-series contract;
8. the Squiglink-derived toolbar replaces the old UtilityRail;
9. `Curves | Equalizer | Tools` is the final main panel IA;
10. FR/Target import and curve management remain functional;
11. manual PK/LS/HS EQ, preamp, filter editing, and relevant import/export remain functional;
12. Sound Tools, Tone Generator, Music Player, Compare A/B, and Analysis are present and functional according to the adapted source contracts;
13. the legacy Squiglink AutoEQ optimizer is absent from runtime;
14. the AutoEQ UI/button is in its intended location but does not execute optimization until Plan 2;
15. no remote measurement database, ads, premium/paywall, analytics, or Squiglink branding is carried into the Workbench;
16. the existing core numeric/DSP contracts remain authoritative and regression-tested;
17. browser resource cleanup is verified for D3/Web Audio/object-URL lifecycles;
18. mobile and desktop visual verification is performed on the deployed site in both themes;
19. `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`, and `git diff --check` pass for the final remake state;
20. the final branch diff is reviewed for unrelated changes;
21. Plan 2 AutoEQ engine implementation has not been silently mixed into the remake.

After this gate, the next architectural step is to resume the existing Plan 2 Standard AutoEQ work against the remade interface and connect the already-defined AutoEQ controls to the Workbench engine.