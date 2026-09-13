# Plan 3C — Squiglink Visual Alignment & UX Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining visual/compositional gap between AutoEQ Workbench and the pinned Squiglink reference while preserving Workbench branding, responsive product adaptations, accessibility, and all Plan 2/3A/3B behavior.

**Architecture:** Keep the current React/Zustand/core boundaries. Re-align the existing Squiglink-derived shell, CSS and D3 renderer instead of introducing a design system or component library. Use the pinned vendor source for geometry and interaction language, Playwright for real-browser iteration, and UX/UI skills only as QA/review.

**Tech Stack:** React, TypeScript, D3, CSS, Zustand, Vitest/Testing Library, Playwright CLI + Playwright Test.

**Spec:** `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`

## Global Constraints

- Plans 3A and 3B must be complete and green before this plan starts.
- Use `autoeq-ui-lab` profile. If Playwright/UX review tooling is missing, stop before product edits and report it.
- `vendor/squiglink/` is immutable and never runtime-imported.
- Light is the primary reference theme; Dark must share the same geometry.
- Desktop follows Squiglink composition strongly. Mobile is a responsive Workbench adaptation; no fake bottom-sheet handle/drag behavior.
- Do not add Squiglink branding, HifiGo/watermark, Brands/Models, Delta strip, L/R controls, fake hamburger/help/pin actions.
- Do not add a component library or token migration.
- Do not alter Standard-v1 algorithm behavior.
- No generated images. Playwright screenshots are captured QA evidence only and remain outside Git.
- Behavior changes require focused tests first; visual-only CSS changes require real-browser inspection at the reference viewports.

---

### Task 1: Re-align shell header and segmented dock geometry

**Files:**
- Modify: `apps/web/src/components/layout/AppHeader.tsx`
- Modify: `apps/web/src/components/layout/DockTabs.tsx` only if semantic markup needs an extra class/wrapper; preserve roles/keyboard logic
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/squiglink/styles/workbench-theme.css` only for token mapping
- Modify: `apps/web/src/index.css`
- Test: existing `DockTabs`/shell component tests

**Interfaces:**
- Header remains textual `AutoEQ Workbench` only.
- Tabs remain `Curves | Equalizer | Tools`, `role=tablist`, arrow/Home/End keyboard behavior unchanged.

- [ ] **Step 1: Capture pre-change screenshots outside the repo**

With Playwright CLI, capture:

```text
/tmp/autoeq-plan3/before-1440-light.png
/tmp/autoeq-plan3/before-390-light.png
/tmp/autoeq-plan3/before-390-dark.png
```

Do not add these files to Git.

- [ ] **Step 2: Write/retain semantic regression tests**

Assert the header contains exactly one `h1` named `AutoEQ Workbench`; tab tests assert existing keyboard behavior and selected state. No test should depend on pixel values.

- [ ] **Step 3: Align header geometry**

Use source-like header proportions: centered wordmark, no decorative left/right fake actions. On narrow viewports keep a single-line title without clipping. Move visual spacing into CSS; do not insert non-functional buttons.

- [ ] **Step 4: Tighten segmented tabs**

Target source grammar:

```text
border radius: 6px class of geometry, not pill-like 14px+
three equal segments
explicit internal 1px separators
active fill = Workbench accent
inactive background = surface
technical compact text weight/height
```

Keep minimum accessible touch height around 36–44 CSS px on mobile through padding/container sizing even with a smaller visual radius.

- [ ] **Step 5: Inspect at reference viewports**

Check `1440×900`, `390×844`, `360×800`, Light/Dark. There must be no document-level horizontal overflow.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter ./apps/web test -- DockTabs
pnpm --filter ./apps/web typecheck
git diff --check
git add apps/web
git commit -m "style(web): align shell and dock with Squiglink"
```

---

### Task 2: Recompose the graph toolbar and source-shaped Normalize control

**Files:**
- Modify: `apps/web/src/features/graph/GraphToolbar.tsx`
- Modify: `apps/web/src/features/graph/GraphToolbar.test.tsx`
- Create: `apps/web/src/features/graph/NormalizeControl.tsx`
- Create: `apps/web/src/features/graph/NormalizeControl.test.tsx`
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Toolbar order:

```text
Inspect | Label | Screenshot | Recolor | Theme
| Zoom: Bass | Mids | Treble
| Normalize: dB/value | Hz/value
| Smooth/value
```

- Normalize consumes/updates the Plan 3A `Normalization` object.

- [ ] **Step 1: Write Normalize interaction tests**

Starting from:

```ts
{ mode: 'hz', frequencyHz: 500, levelDb: 60 }
```

assert:

```text
Hz unit aria-pressed=true
dB unit aria-pressed=false
editing level to 70 -> mode='db', levelDb=70, frequencyHz still 500
clicking Hz unit -> mode='hz', values remain 70/500
editing frequency to 1000 -> mode='hz', frequencyHz=1000, levelDb still 70
```

Reject/display invalid frequency outside 20–20k and invalid level outside 0–100 using the existing NumberField validation pattern.

- [ ] **Step 2: Implement NormalizeControl**

Render two source-shaped compound controls with unit segment and numeric input. The active unit segment uses `aria-pressed=true`; clicking the unit changes only `mode`. Editing an input also selects that mode.

Do not encode normalization math in this component.

- [ ] **Step 3: Reorder GraphToolbar without losing behavior**

Move existing Inspect/Label/Screenshot/Recolor/Theme controls before Zoom. Keep current action handlers and screenshot live-region status. Replace inline normalization fields with `NormalizeControl`.

- [ ] **Step 4: Align toolbar geometry to pinned `style-alt.css`**

Use one horizontally scrollable strip with 1px group separators, source-like 34–36px controls, ~6px control radii and compact uppercase group labels. Internal toolbar scroll is allowed; page overflow is not.

For `prefers-reduced-motion`, toolbar has no unnecessary transitions.

- [ ] **Step 5: Browser inspect**

At `390×844`, scroll the toolbar from start through Normalize/Smooth and confirm every control remains reachable with touch and keyboard. At desktop, confirm it reads as one strip rather than separate cards.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter ./apps/web test -- GraphToolbar NormalizeControl
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "style(web): align graph toolbar and normalization control"
```

---

### Task 3: Bring D3 graph axes and legend to source fidelity

**Files:**
- Modify: `apps/web/src/squiglink/graph/createSquiglinkGraph.ts`
- Modify: `apps/web/src/squiglink/graph/createSquiglinkGraph.test.ts`
- Modify: `apps/web/src/features/graph/FrequencyResponseGraph.component.test.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Keep Workbench relative y-domain and existing permitted graph series.
- Keep viewBox exactly `800 0 0`? No: exactly `0 0 800 346`.
- Preserve zoom/inspect/smoothing/recolor/screenshot behavior.

- [ ] **Step 1: Add source-geometry assertions before changing renderer**

Tests must assert these pinned-source invariants:

```text
viewBox = 0 0 800 346
x ticks include 20,30,40,50,60,80 then repeat log pattern through 20k
edge labels exactly 20Hz and 20kHz
x minor-label font scale follows source 86% hierarchy
x grid visual extent uses source-style y1=10 / y2=312 inside the 800x346 SVG
Y major tick text is left aligned at global x≈18 with dy=-2
dB label is vertical at the left graph edge
```

Keep the Workbench y tick values/domain; do not import Squiglink absolute SPL domain.

- [ ] **Step 2: Correct source-derived grid/tick geometry**

The current renderer already carries the source tick pattern and many values. Change only mismatches found against pinned `graphtool.js`; do not rewrite the renderer.

- [ ] **Step 3: Reduce and reposition curve labels**

The current compact/mobile label size (`19` SVG units) is not acceptable. Use source-like SVG typography for both presentations:

```text
desktop label font: 10–10.5 SVG units
compact label font: 11–12 SVG units maximum
overflow label: one unit smaller
line spacing: about 13–15 SVG units
```

Position the label stack in the lower-left plot region with source-like inset and enough bottom clearance for x-axis labels. Keep deterministic series order and at most the current cap of visible labels.

- [ ] **Step 4: Match curve/grid visual weight through tokens**

Preserve semantic series colors and Target dash. Adjust only stroke width/opacity/grid token values needed to match the Light reference. Dark uses corresponding theme tokens with identical geometry.

- [ ] **Step 5: Real-browser side-by-side review**

Capture after screenshots to `/tmp/autoeq-plan3/` at all reference viewports. Compare specifically:

```text
dB label placement
20Hz / 20kHz edge placement
major/minor tick hierarchy
legend font size
legend lower-left position
curve visual weight
```

Do not add sponsor/watermark/rig labels to mimic the screenshot.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter ./apps/web test -- createSquiglinkGraph FrequencyResponseGraph
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "style(graph): close Squiglink axis and legend gap"
```

---

### Task 4: Compact Curves into a source-shaped manager

**Files:**
- Modify: `apps/web/src/features/curves/CurvesTab.tsx`
- Modify: `apps/web/src/features/curves/CurveManagerRow.tsx`
- Modify: relevant Curves/CurveManager tests
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Preserve rename, offset, baseline, visibility, remove, color and derived `<FR> EQ` behavior.
- Preserve all raw measurement data and current view-state ownership.

- [ ] **Step 1: Lock behavior tests**

Assert one row still exposes accessible controls for offset, baseline/reference, visibility and remove; derived EQ row remains non-destructive and cannot be renamed as a real imported curve.

- [ ] **Step 2: Remove excess vertical separation**

A mobile curve entry should read as one compact unit:

```text
●  Curve name                         [ offset ]
                                      baseline  visibility  remove
```

When width permits, actions may share the same line. Do not add L/R-only graphics, sample count or pin controls.

- [ ] **Step 3: Align empty/import state**

Keep `Import FR / Target`, but make its spacing/border/control height match the manager rather than a standalone large card.

- [ ] **Step 4: Inspect long names and multiple curves**

Use Playwright with at least three curves and a >40-character name. Verify ellipsis/rename and action access at 360/390 px with no overlap.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter ./apps/web test -- Curves CurveManager
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "style(web): compact Squiglink-derived curve manager"
```

---

### Task 5: Recompose Equalizer around FR -> Target -> AutoEQ

**Files:**
- Modify: `apps/web/src/features/filters/EqualizerTab.tsx`
- Modify: `apps/web/src/features/filters/EqualizerTab.test.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.tsx`
- Modify: `apps/web/src/features/filters/FilterEditor.test.tsx`
- Rename: `apps/web/src/features/filters/AutoEqConstraints.tsx` -> `apps/web/src/features/filters/AutoEqSettings.tsx`
- Rename/update corresponding test if present
- Modify: `apps/web/src/features/filters/FilterIoControls.tsx`
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Heading action name is `Settings`.
- Visible hard filter counter is removed; hard max logic remains unchanged.
- Target selector and AutoEQ control share one action row.
- Import + compact Export destination control share the bottom action area.

- [ ] **Step 1: Write composition/label regression tests**

Assert:

```text
heading "Parametric Equalizer" exists
button "Settings" exists
no visible text matching /\/ 64 filters/
FR selector exists
Target selector exists
AutoEQ action exists
Import exists
Export destination choices include Equalizer APO, Poweramp, Wavelet
```

Do not assert exact DOM nesting beyond accessible grouping.

- [ ] **Step 2: Rename Constraints component and preserve settings behavior**

Use `git mv`. Component heading/aria labels become AutoEQ Settings. Render a dense Min/Max grid:

```text
             Min       Max
Frequency     ...       ... Hz
Gain          ...       ... dB
Q             ...       ...
Max Filters             ...
```

Do not add Peak/LS/HS enable switches or preset dropdowns.

- [ ] **Step 3: Move Settings to the heading row**

It is a secondary control near `Parametric Equalizer`, not one of the large bottom buttons. Expanded settings remain in-flow and accessible with `aria-expanded`/`aria-controls`.

- [ ] **Step 4: Move AutoEQ adjacent to Target**

FR remains a full-width/source selector row. Target uses a flexible selector plus AutoEQ control at desktop; at narrow widths it may stack only when required to maintain usable input/button widths.

- [ ] **Step 5: Remove filter count and compact editor toolbar**

Delete the visible `filter-editor__count` element only. Keep `atLimit` and hard-max disabling. Group `+`, `-`, `Sort` as primary filter operations and `Undo`, `Redo` as secondary history operations.

Reduce empty-state vertical space; empty Equalizer must not reserve a large blank table area.

- [ ] **Step 6: Compact Import/Export behavior from Plan 3A**

Keep one Import action and one Export destination control; no three giant export buttons. Destination names remain explicit.

- [ ] **Step 7: Browser inspect with zero, five and ten filters**

At mobile and desktop confirm column headers/inputs stay legible, 10 rows scroll naturally, Settings does not cover controls, and action buttons remain discoverable.

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter ./apps/web test -- EqualizerTab FilterEditor FilterIoControls AutoEqSettings
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "style(web): align Equalizer composition with Squiglink"
```

---

### Task 6: Add a real AutoEQ running affordance with elapsed time

**Files:**
- Modify: `apps/web/src/state/autoeqRunStore.ts`
- Modify: `apps/web/src/state/autoeqRunStore.test.ts`
- Create: `apps/web/src/features/filters/AutoEqRunControl.tsx`
- Create: `apps/web/src/features/filters/AutoEqRunControl.test.tsx`
- Modify: `apps/web/src/features/filters/EqualizerTab.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**

```ts
interface AutoEqRunUiState {
  status: 'idle' | 'running' | 'error'
  activeRunId: string | null
  startedAtMs: number | null
  error: AutoEqPublicError | null
}
```

- [ ] **Step 1: Write run-store timestamp lifecycle tests**

Inject/start with a deterministic monotonic timestamp in the store test and assert:

```text
start -> status running + startedAtMs set
finish matching run -> idle + startedAtMs null
cancel matching run -> idle + startedAtMs null
fail matching run -> error + startedAtMs null
late finish/cancel from stale run does not clear active newer run
```

- [ ] **Step 2: Write AutoEqRunControl fake-timer test**

When running from 65 seconds elapsed, render text containing `01:05`, an activity indicator with an accessible running label, and a `Cancel` button/action. No percentage text may render.

When idle, render the normal `AutoEQ` action and no elapsed timer.

- [ ] **Step 3: Implement monotonic timer**

Store monotonic start time (`performance.now()` path, injectable in tests). UI refresh interval may be 250 ms but displayed time increments by whole seconds. Clear interval on unmount/status change.

- [ ] **Step 4: Add reduced-motion spinner behavior**

CSS spinner animates only when motion is allowed. Under `prefers-reduced-motion: reduce`, keep a static activity glyph/border plus running text/timer; never hide the state indication.

- [ ] **Step 5: Verify cancel/error semantics did not change**

Run existing controller tests proving cancel/error preserve prior filters/run provenance and stale/late results cannot apply.

- [ ] **Step 6: Commit**

```bash
pnpm --filter ./apps/web test -- autoeqRunStore AutoEqRunControl autoeqController EqualizerTab
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "feat(web): show AutoEQ activity and elapsed time"
```

---

### Task 7: Integrate Tools, Compare, Session and Analysis into one visual grammar

**Files:**
- Modify: `apps/web/src/features/tools/ToolsTab.tsx`
- Modify: `apps/web/src/features/tools/EqCompare.tsx`
- Modify: `apps/web/src/features/tools/EqCompare.test.tsx`
- Modify: `apps/web/src/features/tools/AnalysisSection.tsx`
- Modify: `apps/web/src/features/session/SessionControls.tsx`
- Modify: SoundTools markup only if a shared section wrapper is needed
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Sections use shared semantic class grammar, e.g. `tools-section`, not inline style islands.
- Compare behavior/store remains unchanged.

- [ ] **Step 1: Remove inline layout styles from EqCompare**

Move grid/gap/border/scroll styles into source-shaped classes. Keep only truly dynamic state in React.

- [ ] **Step 2: Replace loose A/B text with compact status rows**

Render semantic labels such as:

```text
A    Not assigned
B    Not assigned
```

or the snapshot summary when assigned. Current-match status belongs adjacent to the relevant row, not as detached prose.

Empty snapshot history is one subdued compact row; snapshots use dense bordered rows with Set A / Set B actions.

- [ ] **Step 3: Give Session and Analysis the same section grammar**

Consistent headings, borders/dividers, spacing, action height and empty-state typography. Analysis remains `<details>`/collapsible and keeps current-workspace semantics from Plan 3B.

- [ ] **Step 4: Browser inspect entire Tools tab**

Test no local audio file, loaded audio, zero snapshots, multiple snapshots, Analysis closed/open, Session controls. Mobile must no longer show the visually detached block seen before Plan 3.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter ./apps/web test -- EqCompare AnalysisSection SessionControls SoundTools
pnpm --filter ./apps/web typecheck
git add apps/web
git commit -m "style(web): unify Tools visual language"
```

---

### Task 8: Real-browser design QA, accessibility audit and responsive corrections

**Files:**
- Modify only concrete defects found in Tasks 1–7 scope.

**Interfaces:**
- QA tools advise; approved spec and pinned Squiglink source remain authority.

- [ ] **Step 1: Run Playwright screenshot matrix**

Capture outside repo:

```text
1440x900 Light: Curves / Equalizer / Tools
1440x900 Dark: Curves / Equalizer / Tools
390x844 Light: Curves / Equalizer / Tools
390x844 Dark: Curves / Equalizer / Tools
360x800 Light: Curves / Equalizer / Tools
```

Use representative FR + Target + 5-filter AutoEQ solution.

- [ ] **Step 2: Run UX/UI `design-review`**

Explicit review instruction: Squiglink pinned source is visual authority; do not propose a new aesthetic/design system. Prioritize hierarchy, spacing, consistency, responsiveness and source divergence.

Fix only findings that correspond to the Plan 3 visual contract.

- [ ] **Step 3: Run `a11y-audit` and keyboard smoke**

Cover:

```text
toolbar internal scrolling
Normalize dB/Hz unit selection
Dock tab arrows/Home/End
Equalizer selects/filter editing/Settings/Export
AutoEQ Run/Cancel
Tools Compare/Session/Analysis
visible focus Light/Dark
reduced motion
```

Use real render/axe where the prepared skill supports it. Never eyeball contrast as the only evidence.

- [ ] **Step 4: Run `design-qa` for overflow/states**

Check 360/390px, long curve names, disabled controls, error state, running AutoEQ, settings open, 10 filters, Tools empty/full.

- [ ] **Step 5: Run Ponytail review-only**

Use review/lite mode to identify unnecessary new abstraction/dependency. Do not remove behavior required by the spec.

- [ ] **Step 6: Commit only verified QA fixes**

Group closely related visual defects in one commit with a descriptive message; do not create a commit if no fix is needed.

---

### Task 9: Final Plan 3 gate, Pages proof and human-review handoff

**Files:**
- Modify only for a concrete failed gate.

- [ ] **Step 1: Run all automated verification**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/core benchmark
pnpm --filter ./apps/web e2e
pnpm build:pages
git diff --check
```

All commands must exit 0.

- [ ] **Step 2: Extend committed E2E for final running/visual semantics**

Add behavior assertions if not already covered:

```text
running AutoEQ exposes elapsed time + Cancel
no visible /64 filter counter
Settings label present; Constraints absent
Normalize dB/Hz selection changes mode
APO/Poweramp/Wavelet names visible in export control
```

Do not add pixel screenshot assertions to CI.

- [ ] **Step 3: Review scope/history**

```bash
git status --short
git log --oneline --decorate -30
git diff <PLAN3_START_SHA>..HEAD --check
```

Confirm no vendor edits, no generated screenshot/trace/video artifacts, no private measurement data, no accidental component library, no Standard-v1 tuning.

- [ ] **Step 4: Push only after local gate passes**

Push `remake/squiglink-base`, wait for CI, then verify Pages workflow publishes the **exact CI-approved final SHA** according to the existing deployment policy.

- [ ] **Step 5: Manual smoke handoff**

Provide the Pages URL/SHA and ask for human inspection of:

```text
Light + Dark
mobile + desktop
Graph axes/legend
Toolbar composition
Curves density
Equalizer composition
Settings
AutoEQ Run/Cancel/timer
Normalize Hz/dB
APO/Poweramp/Wavelet exports
Session round-trip
Undo/Redo
Compare A/B
Sound Tools
Analysis
```

Do not declare visual closeout complete until this smoke is accepted.

## Plan 3C Completion Gate

Plan 3C is complete only when the full automated gate passes, the UX/a11y/design QA produces no unresolved material Plan-3-scope defects, Pages publishes the exact approved SHA, and human review confirms the source-first visual alignment at desktop and responsive mobile.
