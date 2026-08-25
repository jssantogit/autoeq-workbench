# Remake 03.5 — Final Visual Closeout Spec

Status: approved for implementation
Branch: `remake/squiglink-base`

This spec is the source of truth for the final Remake 03.5 pass. Where it conflicts with earlier 03.5 notes about Curves composition, this document wins. The architectural/DSP contracts in the Squiglink source-first remake design still win for everything not explicitly changed here.

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

Before implementation, synchronize `remake/squiglink-base` with the remote and verify a clean worktree.

## 2. Curves empty state

The current empty state must match the compact upstream behavior rather than disappearing entirely or expanding vertically.

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

Current behavior to remove: the Target label receives a small dashed sample and a different X offset.

Requirements:

- FR, Target and FR EQ labels all start at the same X position;
- no `data-target-label-sample` or equivalent decorator;
- no artificial `-`, `—`, pipe, swatch or line sample beside the label;
- preserve legitimate spaces contained in the imported name;
- FR EQ name is exactly `<FR name> EQ`;
- Target remains gray/dashed in the plotted curve itself. Only the label decorator is removed.

Tests must cover both text and SVG structure/alignment.

## 4. Normalize dB / Hz visual parity

Port the Normalize control composition from Squiglink more literally.

Visual order:

- `Normalize:`
- `[ dB ][ value ]`
- `[ Hz ][ value ]`

Use Squiglink geometry/density as the visual specification: joined segments, shared borders, approximately 36 px control height, compact gap between the dB and Hz groups, and no visual gap between each unit segment and its input.

Use Workbench theme tokens and amber/copper styling rather than upstream colors.

Important semantic constraint: do not port Squiglink `norm_sel` behavior. Workbench normalization continues to use `targetDb` and `anchorHz` simultaneously according to `packages/core`. This is a visual parity change, not a DSP/domain change.

## 5. Derived FR EQ in the Curves tab

The graph already derives exactly one FR EQ from `activeFrId` when filters exist. The Curves manager must expose that same derived series.

Requirements:

- if `derived.frEq` exists, show one row named `<active FR name> EQ`;
- place it immediately after its source active FR;
- never persist it into `workspaceStore.curves`;
- never duplicate raw samples or create a fake imported Curve;
- only the active FR can have a derived EQ row;
- changing active FR moves/replaces the EQ row accordingly;
- removing filters removes the EQ row;
- renaming the source FR automatically updates the EQ name;
- graph contract remains exactly one derived FR EQ.

The derived row may have its own UI appearance state for visibility/color, but must not become domain state. Use a stable derived appearance identifier rather than sharing all appearance state with the source FR.

The derived EQ cannot be independently renamed or removed. Preserve the two-line row geometry by reserving the corresponding control space or using non-interactive treatment where appropriate.

## 6. Curve Manager row composition

The previous single-line source-shaped row made imported names too hard to read. This spec deliberately changes the Curves manager to a two-line composition while preserving the table/tbody/tr/td foundation and Squiglink-like density/tokens.

Each imported curve item has two visual lines.

### Line 1 — identity

Composition:

`[ remove ] [ curve name ]`

Requirements:

- compact source-like remove button;
- do not display an FR/Target badge or label;
- the name is the dominant element and receives the remaining width;
- long names should remain readable and only ellipsize when genuinely necessary;
- do not squeeze the name between multiple permanent controls.

For the derived FR EQ row, keep the same alignment but do not expose an independent remove action.

### Line 2 — appearance actions

Composition:

`[ Rename ] [ Hide/Show ] [ Color ]`

Requirements:

- controls must be compact and touch-friendly;
- rename acts only on imported FR/Target curves;
- hide/show acts independently on FR, Target and derived FR EQ;
- FR color is editable;
- FR EQ color is editable independently from its source FR;
- Target remains contractually gray/dashed, so its color position is a fixed/non-interactive gray swatch rather than an arbitrary recolor control;
- derived FR EQ has no independent rename.

Do not restore a visible `FR` / `Target` kind badge merely to select active curves. Active FR/Target selection already exists in the Equalizer controls. Any retained manager selection behavior must not reduce name visibility.

## 7. Baseline and display offset

Do not lose baseline or display-offset functionality.

They do not need to remain permanently visible in the two primary lines. A compact secondary disclosure/popover/advanced control is acceptable, provided:

- baseline still works;
- display offset remains display-only;
- raw imported samples remain immutable;
- no permanent third line is added to every row.

Use the smallest coherent solution.

## 8. Graph contract

The main graph continues to show only:

1. imported FRs;
2. imported Targets;
3. exactly one derived FR EQ from `activeFrId` using the complete enabled-filter cascade.

Never show isolated filter response, selected-filter vertical markers, isolated PEQ transfer, or Desired correction.

Target remains gray dashed. FRs use semantic colors. FR EQ uses a distinct color and the name `<FR name> EQ`.

## 9. Tests and acceptance

Add or update tests for:

- compact empty Curves state;
- Import immediately after the manager rather than at viewport bottom;
- absence of Target label sample/decorator and equal label X alignment for FR/Target/FR EQ;
- Normalize DOM/visual composition as unit then input for both dB and Hz;
- normalization semantics remaining simultaneous `targetDb` + `anchorHz`;
- derived FR EQ appearing in Curves only when valid;
- exactly one derived FR EQ, immediately after active source FR;
- derived EQ not entering `workspaceStore.curves`;
- source rename updating derived EQ name;
- two-line manager composition;
- no visible FR/Target badge;
- imported remove/rename/hide/color actions;
- independent FR EQ hide/color without independent remove/rename;
- Target fixed gray appearance;
- baseline and display offset regressions.

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
- Normalize visually matches Squiglink's `[unit][value]` composition without changing Core semantics;
- derived FR EQ appears correctly in Curves and remains derived-only;
- Curve Manager uses the approved two-line composition with readable names;
- Target remains gray dashed;
- baseline/display offset and all existing functionality remain intact;
- tests, typecheck, build and lint pass;
- CI passes on the final SHA;
- Pages deploys that exact SHA;
- final visual acceptance is performed.

Stop at this gate. Do not start Remake 04 without explicit approval.
