# Remake 03.5 — Final Visual Closeout Spec

Status: implemented; pending final visual acceptance
Branch: `remake/squiglink-base`

This spec is the source of truth for the final Remake 03.5 pass. Where it conflicts with earlier 03.5 notes about Curves composition, this document wins. The architectural/DSP contracts in the Squiglink source-first remake design still win for everything not explicitly changed here.

Post-implementation decision: the final Curve Manager intentionally uses source-shaped direct table cells with responsive wrapping, rather than the earlier prescribed two-line component wrapper. That direct-cell composition is now the approved implementation direction and supersedes the previous `[remove][name] / [rename][hide][color]` prescription.

## 1. Scope and constraints

This pass closes the remaining visual and interaction issues before Remake 04.

Keep unchanged unless required by this spec:

- React + TypeScript + Vite architecture;
- `packages/core` as DSP/domain authority;
- Zustand as workspace/UI state authority;
- D3 renderer/interactions ported from Squiglink;
- Light + Dark, Light default;
- amber/copper palette;
- current horizontal toolbar behavior;
- FR/Target import flow;
- normalization math;
- screenshot, inspector, smoothing, baseline, display offset, recolor;
- manual PK/LS/HS, preamp and EQ import/export.

Do not modify `vendor/squiglink/**`.
Do not port Squiglink legacy AutoEQ.
Do not start Remake 04.

Before implementation work, synchronize `remake/squiglink-base` with the remote and verify a clean worktree.

## 2. Curves empty state

The empty state must match the compact upstream behavior rather than disappearing entirely or expanding vertically.

Requirements:

- keep `table.manageTable > tbody.curves`;
- when empty, `tbody.curves` remains compact, approximately one 50 px row;
- show a short Workbench-specific message: `No curves loaded`;
- keep the upstream-like border/density;
- `Import FR / Target` sits immediately below the manager;
- no flex-grow or empty-state panel may push the import action to the viewport bottom.

Do not reintroduce the previous expanding `curve-manager-empty` row.

## 3. Graph series labels

The graph label list must not add a visual sample, dash, gap, or special horizontal offset before Target names.

Requirements:

- FR, Target and FR EQ labels all start at the same X position;
- no `data-target-label-sample` or equivalent decorator;
- no artificial `-`, `—`, pipe, swatch or line sample beside the label;
- preserve legitimate spaces contained in the imported name;
- FR EQ name is exactly `<FR name> EQ`;
- Target remains gray/dashed in the plotted curve itself. Only the label decorator is removed.

Tests must cover both text and SVG structure/alignment.

## 4. Normalize dB / Hz visual parity

The Normalize control composition follows Squiglink visually.

Visual order:

- `Normalize:`
- `[ dB ][ value ]`
- `[ Hz ][ value ]`

Use Squiglink geometry/density as the visual specification: joined segments, shared borders, approximately 36 px control height, compact gap between the dB and Hz groups, and no visual gap between each unit segment and its input.

Use Workbench theme tokens and amber/copper styling rather than upstream colors.

Important semantic constraint: do not port Squiglink `norm_sel` behavior. Workbench normalization continues to use `targetDb` and `anchorHz` simultaneously according to `packages/core`. This is a visual parity change, not a DSP/domain change.

## 5. Derived FR EQ in the Curves tab

The graph derives exactly one FR EQ from `activeFrId` when the workspace has filters. The Curves manager must expose that same derived series.

Requirements:

- if `derived.frEq` exists and the workspace has filters, show one row named `<active FR name> EQ`;
- place it immediately after its source active FR;
- never persist it into `workspaceStore.curves`;
- never duplicate raw samples or create a fake imported Curve;
- only the active FR can have a derived EQ row;
- changing active FR moves/replaces the EQ row accordingly;
- removing filters removes the EQ row;
- renaming the source FR automatically updates the EQ name;
- graph contract remains exactly one derived FR EQ.

The derived row has its own UI appearance state for visibility/color, but does not become domain state. Use a stable derived appearance identifier rather than sharing visibility/color state with the source FR.

The derived EQ cannot be independently renamed or removed. In the source-shaped row, keep the direct-cell alignment by using non-interactive placeholders for controls that do not semantically apply.

## 6. Curve Manager row composition

The final approved implementation uses direct `table > tbody > tr > td` cells shaped after Squiglink rather than a custom wrapper component.

The row structure is source-derived and currently consists of direct cells equivalent to:

- curve color/swatch;
- curve name/inline rename;
- display offset;
- baseline;
- hide/show;
- remove.

This direct-cell structure is intentional and supersedes the earlier requirement that every row be implemented as two explicit wrapper lines.

Requirements:

- preserve `table.manageTable > tbody.curves > tr > td` as the composition foundation;
- keep the curve name visually dominant and give it the available width;
- do not display an `FR` / `Target` kind badge;
- imported FR and Target names are renamed by interacting with the name itself; no separate permanent Rename button is required;
- Enter commits inline rename and Escape cancels it;
- FR color is editable;
- Target uses a fixed gray, non-interactive swatch and remains gray/dashed in the graph;
- hide/show remains available;
- baseline remains available;
- display offset remains available and display-only;
- remove remains available for imported curves;
- derived FR EQ has independent hide/show and color, but no independent rename, baseline, offset or remove action where those controls do not semantically apply.

### Responsive behavior

At narrower widths, the direct cells may wrap into multiple visual bands while remaining one semantic table row.

Approved responsive behavior:

- swatch and curve name form the identity area at the top of the wrapped row;
- the name retains the remaining width and ellipsizes only when necessary;
- display offset, baseline, hide/show and remove reorganize below as space requires;
- the color swatch remains visually aligned with the curve name;
- do not introduce a separate custom row wrapper solely to force two-line markup;
- do not reintroduce a visible kind badge or another control that steals width from the name.

Source-shaped direct cells plus responsive CSS are the final composition contract.

## 7. Baseline and display offset

Baseline and display offset are retained directly in the source-shaped row rather than being hidden behind an advanced disclosure.

Requirements:

- baseline still works;
- display offset remains display-only;
- raw imported samples remain immutable;
- display offset may visually move both a source FR and its derived FR EQ according to the existing display-transform contract without modifying raw data;
- responsive wrapping may reposition these cells, but must not remove their functionality.

Do not move these concerns into DSP/domain state.

## 8. Graph contract

The main graph continues to show only:

1. imported FRs;
2. imported Targets;
3. exactly one derived FR EQ from `activeFrId` using the complete enabled-filter cascade.

Never show isolated filter response, selected-filter vertical markers, isolated PEQ transfer, or Desired correction.

Target remains gray dashed. FRs use semantic colors. FR EQ uses a distinct color and the name `<FR name> EQ`.

The graph axis presentation remains aligned with Squiglink: logarithmic frequency spacing, source-like frequency ticks/labels, source-like dB axis placement, and no special visual emphasis for the 0 dB horizontal grid line.

## 9. Tests and acceptance

Maintain or add tests for:

- compact empty Curves state;
- Import immediately after the manager rather than at viewport bottom;
- absence of Target label sample/decorator and equal label X alignment for FR/Target/FR EQ;
- preservation of legitimate spaces inside imported names;
- source-like logarithmic Hz tick layout and dB axis treatment;
- no special 0 dB grid emphasis;
- Normalize DOM/visual composition as unit then input for both dB and Hz;
- normalization semantics remaining simultaneous `targetDb` + `anchorHz`;
- derived FR EQ appearing in Curves only when valid;
- exactly one derived FR EQ, immediately after active source FR;
- derived EQ not entering `workspaceStore.curves`;
- source rename updating derived EQ name;
- source-shaped direct-cell manager structure;
- responsive wrapping without sacrificing name visibility;
- no visible FR/Target badge;
- imported remove/rename/hide/color actions;
- independent FR EQ hide/color without independent remove/rename;
- Target fixed gray appearance;
- baseline and display offset regressions;
- raw imported samples remaining unchanged by display-only controls.

Revalidate existing functionality and run the full project checks:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm lint`
- Pages build/deploy checks and existing vendor/runtime/legacy optimizer audits.

Visual acceptance must include approximately 390 px mobile and desktop, both Light and Dark, with Curves empty, FR only, FR + Target, FR + EQ, long names, Equalizer and Tools.

## 10. Completion gate

Remake 03.5 is not complete until:

- repository was synchronized before edits;
- empty manager is compact and source-like;
- no label sample/dash/spacing artifact remains for Target, FR or FR EQ;
- Hz/dB axes visually follow the Squiglink source presentation;
- 0 dB has no special grid emphasis;
- Normalize visually matches Squiglink's `[unit][value]` composition without changing Core semantics;
- derived FR EQ appears correctly in Curves and remains derived-only;
- Curve Manager uses the approved source-shaped direct-cell composition;
- curve names remain readable and swatches stay aligned with names across responsive layouts;
- no visible FR/Target kind badge is reintroduced;
- Target remains gray dashed;
- baseline/display offset and all existing functionality remain intact;
- tests, typecheck, build and lint pass;
- CI passes on the final SHA;
- Pages deploys that exact SHA;
- final visual acceptance is performed.

Stop at this gate. Do not start Remake 04 without explicit approval.
