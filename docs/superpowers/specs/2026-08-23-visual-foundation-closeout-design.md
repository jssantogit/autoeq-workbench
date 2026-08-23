# AutoEQ Workbench — Visual Foundation Closeout Design

**Status:** approved direction, pending written-spec review  
**Date:** 2026-08-23  
**Repository:** `jssantogit/autoeq-workbench`

## 1. Purpose

This design closes the visual and numerical foundation of Plan 1 before implementation of the Standard AutoEQ engine in Plan 2.

The goal is to keep the solid React/ECharts/Zustand/core architecture already implemented while rebuilding the presentation layer around the interaction quality and responsive structure of the modern Squiglink/CrinGraph family.

The product must feel visually related to Squiglink without becoming a clone and without inheriting its database-oriented information architecture.

Core idea:

> Squiglink interaction structure and graph presentation, rebuilt as an AutoEQ workbench with its own amber/brown visual identity.

This is a visual-foundation change, not a rewrite of the numerical core and not a fork of Squiglink.

## 2. Reference sources and reuse boundary

Primary references:

- Squiglink Lab: https://github.com/squiglink/lab
- Squiglink: https://squig.link/
- CrinGraph: https://github.com/mlochbaum/CrinGraph

Relevant Squiglink Lab implementation files include:

- `style-alt.css`
- `style-alt-theme.css`
- `config.js`
- `graphtool.js`

The Squiglink Lab repository uses the BSD Zero Clause License, which permits use, copy, modification, and distribution. Even so, the Workbench should prefer translating visual patterns into its existing React/Tailwind/ECharts architecture rather than copying large legacy HTML/CSS/JS blocks wholesale.

Do not copy:

- Squiglink/Super Reviews branding;
- logos or watermarks;
- site-specific yellow/blue identity;
- database navigation such as Brands/Models;
- measurement catalog behavior;
- D3 graph implementation merely to match appearance.

Do reuse or closely study:

- graph-first layout proportions;
- spacing density;
- button/input geometry;
- segmented-tab behavior;
- mobile bottom-panel/dock behavior;
- light/dark theme structure;
- graph axis/grid visual treatment;
- target line convention;
- compact technical controls;
- responsive hierarchy.

## 3. Scope

### 3.1 In scope

- full visual redesign of `apps/web` while preserving existing domain behavior;
- Light and Dark themes;
- Light theme as the initial/default theme;
- explicit user theme toggle;
- Squiglink-inspired graph presentation;
- single responsive dock architecture shared by desktop and mobile;
- dock tabs `Curves | Equalizer | Details`;
- amber/brown/copper application accent palette;
- neutral graph palette independent from application accent;
- automatic high-contrast colors for imported FR curves;
- manual curve color change;
- standard gray dashed/dotted Target rendering;
- responsive filter editor redesign;
- responsive Source/Target import and normalization controls;
- preservation of graph viewport/legend state where currently supported;
- technical fix: canonical evaluation grid shared with Standard AutoEQ expectations;
- technical fix: derive PEQ/preamp independently of Target availability;
- regression tests for the refactored layout/state behavior;
- browser verification on narrow mobile and desktop widths.

### 3.2 Out of scope

- implementing the Standard AutoEQ optimizer itself;
- backend/database/account features;
- measurement catalog browsing;
- copying Squiglink data or assets;
- replacing ECharts with D3;
- changing `packages/core` public behavior beyond the two foundation fixes required here;
- final branding/logo design;
- native mobile application work;
- introducing a full component library.

## 4. Product identity

The Workbench should no longer read visually as a terminal-style engineering dashboard.

It should read as a polished graphing/equalization tool:

- spacious enough to feel modern;
- dense enough for technical work;
- graph dominant;
- controls soft and legible;
- minimal unnecessary panel borders;
- clear primary/secondary actions;
- visually coherent on both phone and desktop.

The layout may strongly evoke Squiglink because that interaction language is intentionally familiar. The application identity comes from:

- AutoEQ-specific information architecture;
- amber/brown application accent;
- AutoEQ Workbench branding;
- our graph semantics;
- our editor and diagnostics;
- our own iconography.

## 5. Theme system

### 5.1 Theme modes

Supported modes:

- `light`
- `dark`

Initial/default mode: `light`.

The user can switch themes explicitly. The initial mode does not depend on operating-system preference.

Theme choice may be persisted locally as a UI preference once the implementation has a stable persistence location. No account/backend persistence is required.

### 5.2 Token architecture

Use semantic design tokens rather than scattered literal colors.

Suggested token groups:

```text
--color-bg
--color-bg-elevated
--color-bg-subtle
--color-input
--color-border
--color-border-strong
--color-text
--color-text-muted
--color-text-faint
--color-accent
--color-accent-hover
--color-accent-active
--color-accent-soft
--color-focus
--color-danger
--color-success
--color-graph-bg
--color-graph-grid-major
--color-graph-grid-minor
--color-graph-axis
--color-target
```

Tailwind/theme utilities may map to these CSS variables. Theme decisions should remain centralized so later palette refinements do not require component rewrites.

### 5.3 Color direction

The application accent is warm amber/copper/brown, based on the user-provided reference palette.

Approximate starting family only, subject to implementation contrast testing:

```text
accent amber        ~ #FFA03A
accent hover        ~ #E98A27
copper/brown        ~ #9A642B
dark background     ~ #080C0E
dark surface        ~ #0E1417
light background    ~ warm off-white / very light warm gray
light surface       ~ near-white
primary dark text   ~ graphite
primary light text  ~ warm off-white
```

These values are direction, not immutable product constants. Final tokens must satisfy readable contrast and avoid oversaturating the UI.

### 5.4 Accent restraint

Amber is an application interaction color, not the color of everything.

Use accent for:

- selected tab;
- primary button;
- active toggles;
- focus state;
- selected filter/editor state where useful;
- small state highlights;
- theme-specific emphasis.

Do not automatically use amber for imported measurement curves.

## 6. Overall responsive architecture

The app uses one conceptual layout on mobile and desktop.

Structure:

```text
+---------------------------------------------------+
| Header / compact global actions                   |
+---------------------------------------------------+
|                                                   |
|             Frequency Response Graph              |
|                                                   |
+---------------------------------------------------+
| Graph toolbar / graph-specific controls           |
+---------------------------------------------------+
| [ Curves ] [ Equalizer ] [ Details ]             |
+---------------------------------------------------+
|                                                   |
|               Active dock content                 |
|                                                   |
+---------------------------------------------------+
```

The responsive difference is not a different information architecture. The same three tabs and the same concepts remain present at all viewport sizes.

## 7. Mobile behavior

Mobile behavior should closely follow the successful Squiglink pattern:

- graph stays visually dominant at the top;
- dock lives below the graph as the main work area;
- tab bar remains obvious and touch-friendly;
- the active dock panel can scroll vertically;
- graph and dock do not compete for arbitrary card space;
- horizontal overflow is avoided except where a deliberate editor affordance requires it;
- inputs/buttons have comfortable touch targets;
- controls are reorganized rather than simply shrunk.

The implementation does not need to mimic Squiglink's exact draggable bottom-sheet mechanics in the first pass. The important acceptance behavior is graph-first + dock/tab separation with stable mobile layout.

If a draggable/resizable dock is introduced, it must not create state complexity or obscure graph controls. A fixed responsive dock is acceptable for the closeout.

## 8. Desktop behavior

Desktop keeps the same `Curves | Equalizer | Details` dock.

The dock becomes wider and may use multi-column internal layouts.

Examples:

- `Curves`: Source and Target cards side by side, normalization controls aligned compactly;
- `Equalizer`: actions/config at left or top, filter editor taking the main width;
- `Details`: metric tiles/rows and diagnostics arranged in columns.

Do not revert desktop to the current collection of independent dashboard panels. The desktop and mobile experiences should feel like one product.

## 9. Header and global controls

The header should become visually lighter and less terminal-like.

Required content:

- AutoEQ Workbench product name/wordmark;
- compact workspace state where useful;
- Light/Dark theme toggle;
- optional small overflow/menu region for future global actions.

Avoid a dense row of status pills as the primary visual identity.

Status such as Source/Target loaded, modified/stale state, and filter count may be presented in the relevant dock tabs or as subtle secondary indicators.

## 10. Graph presentation

The graph is the strongest visual reference to Squiglink.

### 10.1 General appearance

Use ECharts, but style it to achieve a Squiglink-like presentation:

- graph background integrated with page theme;
- minimal outer chrome;
- subtle grid lines;
- stronger major log-frequency guides, lighter minor guides where feasible;
- clean axis labels;
- conventional FR proportions;
- no terminal-style frame or excessive panel title treatment;
- curve labels/legend readable without dominating the plot.

### 10.2 Frequency axis

- logarithmic 20 Hz–20 kHz;
- visually useful major labels similar to established FR graph conventions;
- retain zoom/pan behavior;
- retain Reset View;
- visual zoom never changes numerical optimization/evaluation range.

### 10.3 dB axis

- clean readable tick labels;
- graph viewport may continue to support vertical zoom/range behavior;
- defaults should produce an immediately useful FR view rather than excessive empty vertical range.

### 10.4 Target appearance

Target curves use the established Squiglink convention:

- neutral gray;
- dashed/dotted line;
- visually subordinate to measured FR curves;
- readable in both Light and Dark themes.

Targets such as JM-1 remain gray even though the application accent is amber.

### 10.5 Imported FR curve colors

Source and imported target/headphone FR curves receive independent graph colors.

Behavior:

- choose a color automatically when a curve is imported;
- colors come from a graph-specific palette independent of UI accent;
- assignment should avoid immediate collisions between Source/Target;
- the same curve retains its assigned color during the session;
- user can change a curve color manually;
- color selection should remain readable in both Light and Dark graph themes.

The assignment may be pseudo-random/deterministic-per-session or palette-cycled. Exact mechanism is implementation-level so long as the UX feels like Squiglink and remains stable enough not to recolor unexpectedly on every render.

### 10.6 Derived curves

Derived curves require clear semantics and should not all inherit amber.

At minimum support visible/toggleable styling for:

- Source;
- imported Target/FR if applicable;
- reference Target curve;
- Source + EQ;
- PEQ response;
- Desired Correction;
- selected filter response.

The implementation plan should define a compact default style map and allow later refinement without domain changes.

### 10.7 Legend/curve manager interaction

The graph needs a lightweight curve-control area inspired by Squiglink's active-curve management without recreating its database manager.

For imported Source and Target curves, expose at least:

- color indicator/control;
- visibility toggle;
- curve name;
- loaded state;
- normalization context where useful.

## 11. Graph toolbar

Graph-specific actions stay immediately near the graph.

MVP closeout actions may include:

- Reset View;
- curve visibility controls/legend interaction;
- inspector toggle if already implemented or trivial to preserve;
- future-ready space for smoothing/labeling without implementing unsupported functions now.

Do not overload this toolbar with AutoEQ configuration. AutoEQ belongs in the Equalizer dock tab.

## 12. Dock navigation

The tab bar contains exactly:

- `Curves`
- `Equalizer`
- `Details`

The segmented-control styling should strongly follow the clarity of Squiglink's mobile navigation:

- large enough touch targets;
- obvious active tab;
- rounded container/control geometry;
- theme-aware surface/border;
- amber active state rather than Squiglink blue/yellow.

The tab bar remains visible at the top of the dock content.

## 13. Curves tab

Purpose: import, identify, normalize, and control Source/Target curves.

Contents:

### 13.1 Source block

- Source name/file name;
- loaded/not-loaded state;
- import/replace action;
- graph color control;
- visibility toggle;
- normalization anchor Hz;
- normalization target dB.

### 13.2 Target block

Same responsibilities as Source, with target semantics.

The imported Target FR color remains user-configurable like Source. A separate reference target curve, when present as a Target curve semantic, uses the gray dashed visual convention.

### 13.3 Normalize Together

Keep the shared normalization action:

- common anchor Hz;
- common target dB;
- clear `Normalize Together` action.

The current behavior of explicit Source/Target normalization remains authoritative. Visual redesign must not make normalization destructive.

### 13.4 Layout

Mobile: stacked Source, Target, Together controls.

Desktop: Source/Target may sit side-by-side, with shared normalization compactly below or adjacent depending on available width.

## 14. Equalizer tab

Purpose: manual EQ now, Standard AutoEQ later.

Plan 1.5 must make this tab ready for Plan 2 without implementing optimizer behavior.

### 14.1 Current closeout content

- filter editor;
- Add PK / LS / HS;
- Undo / Redo;
- filter count;
- selected-filter graph behavior;
- quick preamp display;
- Manual profile/state indicator only where useful.

### 14.2 Future Plan 2 insertion point

Reserve a compact top section for:

- `Run AutoEQ` primary action;
- maxFilters control;
- Standard profile state;
- running/cancel/error status.

Do not implement fake disabled controls purely as decoration. The layout should simply have a clear place for Plan 2 controls.

### 14.3 Filter editor visual redesign

On desktop, keep table-like editing because it is efficient for repeated numeric work.

Recommended columns:

`ON | # | Type | Fc | Gain | Q | Actions`

On mobile, do not force a desktop-width table into a narrow viewport as the primary interaction.

Use a responsive row/card form that preserves the same filter identity and fields, for example:

```text
[on] #3  PK                    [more]
Fc        Gain       Q
1000 Hz   -2.5 dB    1.20
```

or another compact layout with equivalent edit speed.

The mobile representation and desktop table operate on the same filter state and components where practical.

### 14.4 Input styling

Use Squiglink-like input geometry:

- soft surface;
- subtle border;
- moderate radius;
- large readable numeric value;
- unit adjacent/inside visual treatment where accessible;
- clear invalid/focus state;
- no terminal-style monospace requirement for the whole interface.

A monospace or tabular-number font may still be used for numeric values if it improves alignment.

## 15. Details tab

Purpose: diagnostics and secondary outputs without cluttering the primary workspace.

Closeout contents:

- MAE;
- RMSE;
- max error;
- max error frequency when available;
- preamp;
- active filter count;
- workspace state (`clean`, `modified`, `stale`);
- explanatory status when metrics cannot be computed.

Future Plan 2/3 contents:

- cancellation audit;
- optimizer diagnostics;
- run manifest;
- export options;
- session information;
- benchmark/debug information as appropriate.

The Details tab should be compact and readable, not a grid of oversized dashboard cards.

## 16. Buttons, tabs, and controls

Component geometry should be inspired by Squiglink's modern alt layout:

- rectangular rounded buttons;
- subtle borders;
- filled primary state;
- muted disabled state;
- segmented navigation;
- soft input surfaces;
- clear hierarchy between primary and secondary actions;
- larger touch-friendly mobile controls.

Application-specific distinction:

- primary active color is amber/copper family;
- neutral secondary controls remain gray/warm-neutral;
- destructive actions should use a distinct danger semantic, not amber.

## 17. Typography

Move away from the current terminal/monospace-heavy presentation.

Preferred direction:

- humanist/sans-serif primary UI font;
- strong but not oversized section headings;
- normal case or restrained uppercase for small labels;
- optional tabular/monospace numerals only for technical numeric fields;
- clear hierarchy through size/weight rather than excessive letter spacing.

Avoid importing Squiglink's exact branded typography as a requirement. Use available/open web-safe/project-approved fonts or system font stack unless a runtime dependency is explicitly justified.

## 18. Icons

Use simple line icons for:

- theme;
- visibility;
- add/remove/duplicate;
- undo/redo;
- import/export;
- color/recolor;
- optional inspector/menu actions.

Do not copy Squiglink/Super Reviews logos or distinctive branded assets.

Prefer a small consistent icon source or local SVG primitives. Avoid adding a large UI/icon dependency solely for a handful of icons unless implementation review shows clear benefit.

## 19. Canonical evaluation grid fix

The current workspace derives comparison metrics on a lower-density graph/evaluation grid than the planned Standard AutoEQ engine.

This closeout must establish one canonical comparison/evaluation grid policy in `packages/core` so the UI and future Standard engine do not silently report materially different metrics for the same final filter set.

### 19.1 Required behavior

For Standard-ready comparison metrics:

- range: 20 Hz–20 kHz;
- log-frequency grid;
- default density: 96 points per octave, matching the planned Standard v1 fit density;
- grid policy owned by core/config, not hard-coded independently in `workspaceStore`.

The graph renderer may use the same grid or a separately optimized display representation, but user-facing final metrics must use the canonical evaluation grid.

### 19.2 Invariant

The same final filters evaluated by future `runStandardAutoEq()` and by the post-run workspace must produce matching metrics within floating-point tolerance when using the same Source, Target, normalization, and algorithm/config version.

## 20. Derived-state dependency fix

The current workspace unnecessarily withholds PEQ/preamp when both Source and Target are not loaded.

This closeout must separate derived calculations by actual dependency.

### 20.1 Required dependency graph

With filters only:

- PEQ response: available;
- preamp: available.

With Source + filters:

- normalized/interpolated Source: available;
- PEQ response: available;
- Source + EQ: available;
- preamp: available.

With Target only:

- normalized/interpolated Target: available;
- comparison metrics unavailable.

With Source + Target:

- Desired Correction: available;
- residual: available;
- MAE/RMSE/max error: available;
- Source + EQ: available if filters exist or as Source when no filters;
- preamp: available.

### 20.2 Error isolation

A missing Target must not turn an otherwise valid manual-EQ/preamp workspace into a generic incomplete state.

Messages should explain only the unavailable derivative, e.g. comparison metrics require both Source and Target.

## 21. State changes needed for visual behavior

Add only UI state that is genuinely shared.

Likely shared state:

- active dock tab;
- theme;
- per-curve assigned color;
- per-curve visibility;
- selected filter;
- existing graph legend/viewport state if it already lives outside ECharts appropriately.

Keep ephemeral component state local.

Do not move numerical domain state into UI components.

## 22. Curve color assignment

The user expects imported FRs to behave similarly to Squiglink: they receive a usable color automatically and can be recolored.

### 22.1 Requirements

- maintain a graph palette of multiple high-contrast colors;
- avoid using the application amber accent as a mandatory curve color;
- first two imported measurement curves should not collide;
- preserve assigned color through normal edits/renders;
- expose a simple recolor/color-picker action;
- choose values that remain distinguishable in Light and Dark themes.

### 22.2 Determinism

Exact cross-session deterministic color hashing is not required for closeout.

Within a session/workspace, a curve must not change color unexpectedly because of unrelated rerenders.

Portable session format may later persist curve colors.

## 23. Accessibility and interaction

- buttons and tabs need accessible names;
- color must not be the only indicator of selected/disabled state;
- target dashed line provides a non-color distinction;
- focus rings remain visible in both themes;
- numeric inputs keep real labels;
- touch targets should be practical on narrow mobile screens;
- graph color chooser must have a non-drag interaction path;
- contrast should be checked for text and control states.

The graph itself is inherently visual, but surrounding controls and data summaries should remain semantically accessible.

## 24. CSS/Tailwind strategy

Keep Tailwind CSS as decided for the project, but use it as an implementation mechanism rather than a visual identity.

Recommended structure:

- theme variables/tokens in one global theme layer;
- small reusable primitives for Button, SegmentedTabs, NumberField, IconButton, Surface/Panel only where necessary;
- feature layout classes/components in their respective feature folders;
- avoid one monolithic 8k-line CSS file modeled after Squiglink;
- avoid copying Squiglink selector structure directly;
- inspect Squiglink CSS values/relationships as a reference while expressing them in our component model.

## 25. Proposed web component structure

Indicative structure, not a hard API contract:

```text
apps/web/src/
  components/ui/
    Button.tsx
    IconButton.tsx
    NumberField.tsx
    SegmentedTabs.tsx
    ThemeToggle.tsx
    Surface.tsx
  features/workspace/
    WorkbenchHeader.tsx
    WorkbenchDock.tsx
  features/curves/
    CurvesTab.tsx
    CurveCard.tsx
    CurveColorControl.tsx
    CurveImport.tsx
    NormalizationControls.tsx
  features/filters/
    EqualizerTab.tsx
    FilterEditor.tsx
    FilterRow.tsx
    FilterCard.tsx
  features/details/
    DetailsTab.tsx
  features/graph/
    FrequencyResponseGraph.tsx
    GraphToolbar.tsx
    graphSeries.ts
    graphTheme.ts
  state/
    workspaceStore.ts
    uiStore.ts  // only if a separate UI store is justified
```

Do not create all primitives/files simply because they appear in this sketch. Use the smallest coherent structure during implementation.

## 26. Testing strategy

### 26.1 Core/foundation tests

Add or update tests for:

- canonical evaluation grid density/range;
- workspace metrics use canonical grid;
- preamp available with filters and no Target;
- PEQ available with filters and no Source/Target;
- Source + EQ available with Source + filters and no Target;
- comparison metrics require both Source and Target;
- existing raw curve immutability remains intact.

### 26.2 UI behavior tests

Test user-observable behavior, not CSS implementation details:

- default theme is Light;
- theme toggle switches to Dark and back;
- tabs switch between Curves/Equalizer/Details;
- Source and Target import remain functional after layout refactor;
- curve receives a color and recolor action updates its graph style;
- Target/reference target uses dashed neutral style;
- filter editing/disable/undo remain functional;
- metrics/preamp remain correct after moving components;
- mobile representation exposes the same filter controls as desktop.

### 26.3 Visual verification

Manual browser verification is required at representative widths.

At minimum:

- narrow mobile around 360–430 CSS px;
- tablet/intermediate width;
- desktop around 1280+ CSS px.

Verify both Light and Dark themes.

The implementation agent should capture or inspect rendered states directly rather than inferring responsiveness from CSS alone.

## 27. Visual acceptance criteria

The closeout is visually acceptable when:

1. the graph is clearly the dominant element on both phone and desktop;
2. the page no longer reads as a terminal/engineering dashboard;
3. the general graph/control proportions immediately evoke modern Squiglink without copying its branding;
4. Light theme is the first-load/default theme;
5. Dark theme is complete, not an afterthought;
6. amber/copper is the application accent but does not contaminate graph curve semantics;
7. Target/reference curves are neutral gray dashed/dotted;
8. imported FRs have independent automatically assigned colors;
9. users can recolor imported curves;
10. `Curves | Equalizer | Details` is the same main dock navigation on mobile and desktop;
11. filter editing is comfortable on mobile without relying on a clipped desktop table;
12. no horizontal page overflow is introduced;
13. graph controls remain usable on touch devices;
14. all existing Plan 1 manual-EQ behavior remains available.

## 28. Technical acceptance criteria

The closeout is technically complete when:

1. evaluation/metrics use a core-owned 20 Hz–20 kHz 96-points-per-octave canonical grid;
2. UI no longer hard-codes an incompatible comparison grid independently;
3. PEQ and preamp are available without requiring Target;
4. Source + EQ is available when Source and filters exist even without Target;
5. comparison metrics are computed only when both Source and Target exist;
6. raw imported points remain immutable under normalization;
7. existing filter enable/disable and undo/redo behavior is preserved;
8. selected-filter visualization still works;
9. graph viewport/legend interaction does not reset on unrelated workspace edits where currently guaranteed;
10. tests, typecheck, build, lint, and diff checks pass.

Required final verification:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
git diff --check
git status --short
```

## 29. Completion gate before Plan 2

Do not start the Standard AutoEQ engine until this closeout is green.

Browser gate:

- Light default loads correctly;
- Dark toggle works;
- Source import works;
- Target import works;
- curve colors are automatically assigned and manually changeable;
- reference Target visual is gray dashed/dotted;
- normalization works and preserves raw points;
- manual PK/LS/HS edit updates graph immediately;
- preamp updates even with no Target loaded;
- Source + EQ displays with Source + filters and no Target;
- comparison metrics display when Source + Target are both present;
- dock tabs work on mobile and desktop;
- graph remains usable and visually dominant at narrow width;
- filter editor remains usable at narrow width;
- no horizontal page overflow;
- full verification commands pass.

Only after this gate should `2026-08-23-02-autoeq-standard-engine.md` begin.

## 30. Relationship to existing design

This document refines the visual-direction section of:

`docs/superpowers/specs/2026-08-23-autoeq-workbench-design.md`

It does not invalidate the established core architecture, data model, AutoEQ pipeline, quantization policy, dense-grid preamp policy, or Plan 2/3 direction.

Where visual behavior conflicts, this document is the newer authority for presentation and responsive layout.

Where numerical foundation behavior conflicts, this document intentionally clarifies the canonical evaluation grid and derived-state dependencies before Plan 2.

## 31. Implementation constraint

Implementation must continue following the repository's adopted Noqlen Playbook:

`Inspect -> Implement -> Verify -> Review`

Keep numerical/domain behavior in `packages/core`; keep visual/presentation behavior in `apps/web`; do not introduce unrelated refactors or a generic UI framework merely to reproduce Squiglink appearance.

The target is not a pixel clone. The target is the same level of graph clarity, control polish, density, and responsive confidence, expressed as AutoEQ Workbench.