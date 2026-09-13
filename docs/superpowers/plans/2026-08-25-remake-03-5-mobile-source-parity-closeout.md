# Remake 03.5 — Mobile / Source Parity Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore literal Squiglink visual/compositional parity for Curves management, mobile dock behavior, toolbar selection states, and curve import while preserving all Workbench DSP/state contracts completed through Remake 03.

**Architecture:** Keep React as the binding layer, Zustand as workspace/UI state authority, `packages/core` as parsing/DSP authority, and the ported D3 graph untouched. Port the relevant `vendor/squiglink` markup/classes/CSS into `apps/web/src/**`; never import or execute vendor code at runtime. The mobile dock remains a Workbench tabbed panel, but removes the decorative handle because this app does not expose a hidden underlying secondary drawer.

**Tech Stack:** React, TypeScript, Vite, Zustand, D3, Vitest, Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Source-first: upstream Squiglink at `vendor/squiglink/` is the visual/compositional specification for ported elements.
- Upstream snapshot commit is `9ff842c539b058cc726207b689c904c9efff75fd` and remains immutable/non-runtime.
- Keep `packages/core` authoritative for DSP/parsing/export math; no DSP logic in React.
- Keep Zustand authoritative for workspace/UI state.
- Keep the graph contract unchanged: imported FRs, imported Targets, and exactly one derived full-cascade FR EQ for `activeFrId`; no isolated filter response, selected-filter marker, PEQ transfer, or Desired correction.
- Do not implement or enable legacy Squiglink AutoEQ; the visible AutoEQ button remains inert.
- Preserve Light + Dark with Light default and the Workbench amber/copper palette.
- Active source-derived controls use a solid accent fill, matching Squiglink selection semantics; do not use translucent fill, accent-only border, or an underline as the primary selected state.
- Do not start Remake 04 until this closeout has passed automated and visual acceptance.
- Follow `AGENTS.md`: Inspect -> Implement -> Verify -> Review; smallest coherent change; targeted tests first, then root verification.

---

### Task 1: Lock Curves import and manager parity with failing tests

**Files:**
- Modify: `apps/web/src/features/curves/CurveImport.test.tsx`
- Modify: `apps/web/src/features/curves/CurveManagerRow.test.tsx`

**Interfaces:**
- Consumes: `workspaceStore.addCurve`, `uiStore.registerCurve`, existing rename/remove/baseline/visibility/offset/color actions.
- Produces: regression contract for one explicit `Import FR / Target` entry point and source-shaped manager cells.

- [ ] **Step 1: Replace the two-import expectations with one explicit chooser contract**

Add tests equivalent to:

```tsx
it('uses one Import FR / Target entry point and requires an explicit kind before file selection', async () => {
  const user = userEvent.setup()
  render(<CurvesTab />)

  const importButton = screen.getByRole('button', { name: 'Import FR / Target' })
  expect(screen.queryByText('Upload FR')).not.toBeInTheDocument()
  expect(screen.queryByText('Upload Target')).not.toBeInTheDocument()

  await user.click(importButton)
  const chooser = screen.getByRole('group', { name: 'Curve type' })
  expect(within(chooser).getByRole('button', { name: 'FR' })).toBeVisible()
  expect(within(chooser).getByRole('button', { name: 'Target' })).toBeVisible()
})
```

Add a parse test that selects `Target`, supplies a generic `.txt`, and asserts:

```tsx
expect(parseCurveText).toHaveBeenCalledWith(expect.any(String), {
  name: 'Measurement.txt',
  kind: 'target',
})
```

- [ ] **Step 2: Add source-manager cell-order expectations**

For an FR row, assert the direct `td` class order is:

```tsx
expect(Array.from(row.children).map((cell) => cell.className)).toEqual([
  'remove',
  'phoneId',
  'key',
  'calibrate',
  'baselineButton',
  'hideButton',
  'lastColumn',
])
```

The final cell is a structural source-parity cell and must not add new Workbench semantics.

- [ ] **Step 3: Verify RED in CI**

Commit only the tests and wait for the branch CI check. Expected failure: current UI still exposes `Upload FR` / `Upload Target`, lacks the explicit chooser, and manager rows have only six cells.

---

### Task 2: Port the unified import flow and literal manager row composition

**Files:**
- Modify: `apps/web/src/features/curves/CurveImport.tsx`
- Modify: `apps/web/src/features/curves/CurvesTab.tsx`
- Modify: `apps/web/src/features/curves/CurveManagerRow.tsx`
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/squiglink/styles/workbench-theme.css`

**Interfaces:**
- Produces: `CurveImport` with no required `kind` prop; internal `selectedKind: CurveKind | null`; explicit kind chooser before file picker.
- Preserves: `parseCurveText(text, { name, kind })`, `workspaceStore.addCurve`, `uiStore.registerCurve`.

- [ ] **Step 1: Implement explicit kind selection before the picker**

Use one visible button:

```tsx
<button type="button" className="curve-import__trigger" onClick={() => setChooserOpen(true)}>
  Import FR / Target
</button>
```

When open, render:

```tsx
<div className="curve-import__chooser" role="group" aria-label="Curve type">
  <button type="button" onClick={() => chooseKind('fr')}>FR</button>
  <button type="button" onClick={() => chooseKind('target')}>Target</button>
</div>
```

`chooseKind(kind)` stores the explicit kind and then calls the hidden input's `.click()`. `handleFile` must refuse to parse if `selectedKind === null`; never infer kind from filename/content.

- [ ] **Step 2: Make Curves render one importer**

Replace the two prop-based imports with:

```tsx
<div className="curve-upload-actions">
  <CurveImport />
</div>
```

- [ ] **Step 3: Port the upstream manager table skeleton**

`CurvesTab` must use the source-shaped colgroup:

```tsx
<colgroup>
  <col className="remove" />
  <col className="phoneId" />
  <col className="key" />
  <col className="calibrate" />
  <col className="baselineButton" />
  <col className="hideButton" />
  <col className="lastColumn" />
</colgroup>
```

Keep `table > tbody > tr > td`; do not replace it with cards, grid rows, or div-based layout.

- [ ] **Step 4: Adapt row semantics without redesign**

Keep source visual order: remove, model/kind, name/key, calibration/display controls, baseline, show/hide, trailing structural cell. Continue to expose Workbench rename, color for FR only, display offset, baseline, visibility, and active FR/Target selection, but fit them inside these source cells rather than adding a new composition.

- [ ] **Step 5: Port source dimensions/density and the wide mobile import CTA**

Use Squiglink `manageTable`, `tbody.curves > tr`, and `mobile-helper` density as the CSS basis. The import trigger should visually follow the source `Browse all graphs` control: full available width, 36px source-like height, compact 12px text, 6px radius, source-equivalent border/background treatment adapted to Workbench variables.

- [ ] **Step 6: Verify GREEN in CI**

Run the targeted web tests through CI; Task 1 tests and pre-existing import/manager behavior tests must pass.

---

### Task 3: Remove the fake mobile handle and make the dock consume vertical space correctly

**Files:**
- Modify: `apps/web/src/components/layout/WorkbenchDock.tsx`
- Modify: `apps/web/src/components/layout/__tests__/WorkbenchDock.test.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`

**Interfaces:**
- Preserves: `DockTabs`, `activeDockTab`, keyboard navigation, the three tabpanels.
- Produces: mobile structure `dock -> tabs -> content` with no decorative handle element.

- [ ] **Step 1: Write the failing structural test**

Replace the old handle assertion with:

```tsx
expect(dock.querySelector('.workbench-dock__handle')).not.toBeInTheDocument()
expect(dock.firstElementChild).toBe(tablist)
expect(tablist.nextElementSibling).toBe(dockContent)
```

- [ ] **Step 2: Verify RED in CI**

Expected failure: `WorkbenchDock` currently renders `.workbench-dock__handle` before the tabs.

- [ ] **Step 3: Remove the handle markup**

Delete only:

```tsx
<div className="workbench-dock__handle" aria-hidden="true" />
```

Do not add drag/collapse behavior.

- [ ] **Step 4: Fix mobile height and internal scrolling**

At mobile widths, make the dock/content flex through the remaining page height rather than ending early. The active panel should be able to grow, and long Curves/Equalizer/Tools content should scroll inside the dock/content region without a large dead area below short panels.

Remove all `.workbench-dock__handle` CSS. Keep the source-derived rounded top treatment only where it belongs to the panel container; tabs are the first visual control.

- [ ] **Step 5: Verify GREEN in CI**

The dock structure and keyboard/theme tests must pass.

---

### Task 4: Restore solid Squiglink selected-state color semantics and toolbar flow

**Files:**
- Modify: `apps/web/src/features/graph/GraphToolbar.test.tsx`
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/squiglink/styles/workbench-theme.css`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Preserves all toolbar actions and `aria-pressed` state.
- Produces no sticky/floating toolbar child; selected tabs/toggles use full accent fill.

- [ ] **Step 1: Add a toolbar ordering/flow regression test**

Assert the theme toggle remains a normal first toolbar child and all source controls remain present:

```tsx
const toolbar = screen.getByRole('toolbar', { name: 'Graph tools' })
expect(toolbar.firstElementChild).toBe(screen.getByRole('button', { name: 'Switch to dark theme' }))
expect(within(toolbar).getByRole('button', { name: 'Screenshot' })).toBeVisible()
expect(within(toolbar).getByRole('button', { name: 'Recolor' })).toBeVisible()
```

The CSS review gate must confirm there is no `position: sticky` rule for `.graph-toolbar > .theme-toggle`.

- [ ] **Step 2: Change selected-state styling to solid fill**

For `.dock-tabs button[aria-selected='true']`, `.graph-toolbar button[aria-pressed='true']`, and equivalent source-derived selected controls, use the Workbench accent as the entire background and border, following upstream rules such as:

```css
background-color: var(--wb-accent);
border-color: var(--wb-accent);
color: var(--selected-control-text);
box-shadow: none;
```

Define a theme-safe selected text variable rather than relying on translucent `--color-accent-soft`.

- [ ] **Step 3: Remove sticky overlay behavior**

Delete the sticky rule from `.graph-toolbar > .theme-toggle`; keep every toolbar child `flex: 0 0 auto` inside the existing horizontal overflow container.

- [ ] **Step 4: Verify GREEN in CI**

GraphToolbar interactions, theme switching, screenshot, recolor, normalization, smoothing, and existing graph tests must remain green.

---

### Task 5: Full regression and source-parity closeout

**Files:**
- Review only unless a defect is found.

**Interfaces:**
- No new features.
- No Remake 04 code.

- [ ] **Step 1: Run automated verification**

Required root commands:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm build:pages
```

Also verify the existing vendor immutability/runtime-reference audits remain green.

- [ ] **Step 2: Review the actual diff**

Reject unrelated refactors. Confirm `vendor/squiglink/**` is unchanged, no legacy optimizer/AutoEQ code was introduced, and `packages/core` DSP contracts are untouched except if a failing regression proves a necessary correction.

- [ ] **Step 3: Perform visual acceptance**

Compare directly against the checked-in Squiglink source/screenshots at approximately 390px mobile and desktop, in Light and Dark, for Curves, Equalizer, and Tools. Explicitly inspect: manager row density/order, single import CTA, no fake handle/dead strip, dock vertical fill/scroll, toolbar horizontal scrolling without overlap, and solid selected fills.

- [ ] **Step 4: Confirm functional acceptance**

Manually exercise FR import, Target import, normalization, graph, D3 inspector, screenshot, recolor, baseline, display offset, smoothing, manual PK/LS/HS, FR EQ, preamp, EQ import/export, tab navigation, and theme switching.

- [ ] **Step 5: Stop at the Remake 03.5 approval gate**

Report the final SHA and CI/Pages evidence. Do not begin Sound Tools, Tone Generator, Music Player, Compare A/B, Analysis, or any other Remake 04 work until visual approval is explicitly given.
