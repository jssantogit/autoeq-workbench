# Plan 3 — Integration, Validation & Squiglink Visual Closeout Design

**Status:** approved design  
**Date:** 2026-08-26  
**Branch:** `remake/squiglink-base`  
**Baseline:** `a847bbf8d96a22ed591ad87d7d15db237e7c467e`

## 1. Authority and goal

This document is the authoritative design for Plan 3 after completion of Standard AutoEQ v1.

Read it together with:

- `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`;
- `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`;
- `docs/superpowers/specs/2026-08-25-remake-04-tools-and-closeout-design.md`;
- historical `docs/superpowers/plans/2026-08-23-03-integration-export-benchmarks.md`.

Where this document conflicts with the historical Plan 3 implementation plan, this document wins. The Standard AutoEQ v1 design remains authoritative for optimizer behavior. Plan 3 must not silently retune or replace `standard-v1`.

Plan 3 has three execution slices:

1. **3A — Portability & outputs:** normalization-mode parity, portable session v1, explicit APO/Poweramp/Wavelet output contracts.
2. **3B — Validation & browser acceptance:** frozen Standard-v1 benchmark evidence, diagnostics, committed browser E2E.
3. **3C — Squiglink visual closeout:** source-first graph, toolbar, tabs, Curves, Equalizer, Tools, running-state and responsive alignment.

The final product goal is not a generic redesign. It is to make AutoEQ Workbench look and behave like the same Squiglink-derived application base while preserving deliberate Workbench identity and product capabilities.

## 2. Source and reference hierarchy

Visual and interaction decisions use this order:

1. Workbench domain/product contracts and accessibility requirements;
2. immutable `vendor/squiglink/` source at the pinned upstream revision;
3. the user-approved live Squiglink comparison screenshots from the Plan 3 design review;
4. current Workbench implementation where it already satisfies 1–3.

Do not import runtime code from `vendor/`. Adapt source under `apps/web` or `packages/core` with provenance comments where appropriate.

For desktop, Squiglink is a **strong geometric/compositional authority**. For mobile, keep a Workbench-owned responsive adaptation using the same visual language; do not clone the upstream draggable bottom-sheet unless real drag/snap behavior is implemented.

## 3. Standard AutoEQ v1 is frozen

`algorithmVersion = 'standard-v1'` remains unchanged in Plan 3.

Plan 3 may:

- add synthetic benchmarks;
- record a deterministic baseline;
- expose diagnostics already derivable from the exact current solution;
- evolve surrounding schemas when required for new input representation.

Plan 3 must not:

- tune deadband, candidate threshold, penalties, prune tolerance, refinement steps or candidate rules;
- change optimizer output to improve benchmark numbers;
- introduce a hidden profile;
- treat a benchmark as permission to modify `standard-v1`.

If Plan 3 reveals a genuine optimizer defect, stop that task and report it separately. Algorithm behavior changes require a later version/plan.

## 4. Normalization parity is a real domain change, not CSS

The current Workbench normalization contract (`anchorHz` + `targetDb`) represents one anchor-frequency normalization operation. The pinned Squiglink source instead keeps two values and one selected mode: frequency normalization or listening-level/dB normalization. The source switches mode when either value/unit is selected.

Plan 3 adopts this source-shaped contract:

```ts
export type NormalizationMode = 'hz' | 'db'

export interface Normalization {
  mode: NormalizationMode
  frequencyHz: number
  levelDb: number
}
```

Defaults:

```ts
{
  mode: 'hz',
  frequencyHz: 500,
  levelDb: 60,
}
```

### 4.1 Hz mode

`mode === 'hz'` normalizes every FR/Target independently so its level at `frequencyHz` is **0 dB in the Workbench relative display**. `levelDb` is retained for mode switching but is inactive.

This preserves the old Workbench default behavior at 500 Hz even though the stored shape changes.

### 4.2 dB mode

`mode === 'db'` ports/adapts Squiglink's source-derived listening-level normalization (`norm_phon` / `find_offset` and its ISO/free-field data) into `packages/core`.

The Workbench remains a relative graph: after source-equivalent loudness normalization to `levelDb`, subtract the common `levelDb` display center so the graph remains centered around 0 dB. This common recentering must not change inter-curve differences.

The source-derived numerical routine belongs in core with an explicit provenance comment. React must not contain the formula.

### 4.3 UI behavior

The toolbar renders a source-shaped segmented pair:

```text
NORMALIZE:  [ dB | 60 ]  [ Hz | 500 ]
```

- exactly one mode is selected;
- selected unit segment uses the Workbench accent;
- editing the dB input selects `db` mode;
- editing the Hz input selects `hz` mode;
- clicking a unit segment selects that mode without overwriting its remembered value;
- both remembered values survive switching;
- default selected mode is Hz.

### 4.4 AutoEQ provenance/schema consequence

Because normalization is part of the captured AutoEQ input and run provenance, the run manifest must be able to reproduce the new normalization contract. Evolve the manifest schema explicitly rather than overloading the old shape. Keep `algorithmVersion: 'standard-v1'`; schema evolution is not an optimizer-version change.

A default Hz-mode run must produce the same delivered filters/metrics as the equivalent pre-Plan-3 default normalization input.

## 5. Portable Workbench Session v1

Session export is authoritative workspace portability, not UI persistence.

```ts
interface WorkbenchSessionV1 {
  schemaVersion: 1
  curves: Curve[]
  activeFrId: string | null
  activeTargetId: string | null
  normalization: Normalization
  autoeqSettings: AutoEqSettings
  filters: Filter[]
  filterProvenance: 'manual' | 'autoeq' | null
  solutionState: 'clean' | 'modified' | 'stale'
  autoEqRun: AutoEqRunRecord | null
}
```

The session includes **all** imported FR and Target curves, not only the active pair, and preserves existing curve/filter IDs because import replaces the whole authoritative workspace.

The session deliberately excludes:

- selected filter;
- undo/redo stacks;
- Compare A/B history and assignments;
- open tab, theme, zoom, smoothing, labels, inspector, visibility/color/offset presentation state;
- Worker/runId/error transient state;
- Tone Generator/Music Player transport state;
- browser `File`, object URLs, local paths or download artifacts.

Import pipeline:

```text
read -> parse -> validate complete schema -> validate references/coherence
     -> cancel/invalidate active AutoEQ run
     -> atomically replace authoritative workspace
     -> clear undo/redo, Compare A/B and transient run state
```

Invalid import is non-destructive. No partial mutation is allowed.

Stable serialization uses deterministic key order, two-space indentation and final newline. Filename: sanitized active FR name when available plus `.autoeq-workbench.json`; no local path and no timestamp is required for deterministic content.

## 6. Output/export contract

Equalizer output is one compact `Export` group with three explicit destinations:

```text
Equalizer APO
Poweramp
Wavelet
```

No export re-runs AutoEQ, changes filters or re-quantizes values. Export always reflects the **current editor state** at click time.

### 6.1 Equalizer APO

Use the existing core Equalizer APO formatter. Export current enabled filters plus current calculated safety preamp. Disabled filters remain in workspace/session but are absent from the active preset.

UI naming must say `Equalizer APO`; do not leave the destination as generic `Export`.

### 6.2 Poweramp

Add a deterministic **Poweramp-style manual-entry text preset**. It is not a claim of compatibility with Poweramp's private/native backup format.

Format rules:

- current enabled filters only;
- preamp to 0.1 dB;
- frequency integer Hz;
- gain 0.1 dB;
- Q 0.01;
- dense renumbering from 1;
- PK/LS/HS names explicit;
- no re-quantization inside the formatter.

### 6.3 Wavelet

Keep/adapt the current `GraphicEQ` export using the exact current enabled cascade. Label destination `Wavelet` in the UI while retaining valid GraphicEQ text semantics.

### 6.4 Import

Current filter import remains Equalizer APO text import. It stays separate from portable Session import.

## 7. Diagnostics and benchmark evidence

### 7.1 Live Analysis remains current-workspace authority

`Tools -> Analysis` displays metrics derived from the current filters/workspace. It must not show frozen manifest metrics as if they described manually edited filters.

Extend Analysis with compact provenance/diagnostics:

- filter count;
- MAE, RMSE, max absolute residual and max-error frequency;
- preamp;
- band metrics over 20–5k, 20–8k, 20–10k, 20–14k, 20–20k;
- current solution state;
- AutoEQ algorithm version when a run record exists;
- cancellation Moderate/Strong counts/list from current enabled filters.

The frozen run manifest remains provenance and may be shown in a clearly labeled origin subsection.

### 7.2 Frozen Standard-v1 benchmark

Create a synthetic deterministic corpus. No private/user measurement data may be committed.

Required cases:

- flat identity;
- broad bass shelf;
- single mid peak;
- vocal multi-feature;
- irregular treble;
- narrow high-Q feature;
- filter-budget pressure;
- quantization-sensitive case;
- preamp overlap;
- opposing-filter pressure.

Record filters and deterministic metrics. Elapsed time is informational only.

Automated benchmark invariants include determinism, max-filter bounds, product/grid validity, preamp safety, no final zero-gain filters and no strong final cancellation. The benchmark command must **not** modify algorithm constants.

## 8. Browser acceptance and tooling

Plan 3 uses the prepared `autoeq-ui-lab` OpenCode profile when available. If the profile or its required tools are missing, execution stops before product changes and reports the missing tooling.

Use:

- Superpowers TDD/execution workflow;
- AFT for structural/read-only navigation where useful;
- Context7 only for current external library APIs;
- Playwright CLI + skill for iterative real-browser inspection;
- committed `@playwright/test` E2E for repeatable repository acceptance;
- UX/UI skills (`design-review`, `a11y-audit`, `design-qa`) as review/QA, never as an alternate aesthetic authority;
- Ponytail only as post-implementation review/lite, with spec taking precedence.

Do not use autonomous Ralph/RLM to govern the whole Plan 3. It may be used only for a closed, separately verified task if explicitly chosen during execution.

## 9. Visual contract

Core rule:

> Copy Squiglink geometry, composition, density, hierarchy and interaction language when compatible with the Workbench. Preserve Workbench identity, semantics and capabilities where products diverge.

### 9.1 Preserve Workbench identity

Keep:

- textual `AutoEQ Workbench` branding;
- amber/copper accent family;
- Light and Dark themes, Light default;
- Curves | Equalizer | Tools IA;
- Workbench-only AutoEQ, Compare A/B, Session, Analysis and Sound Tools capabilities.

Do not copy:

- Squiglink logo/wordmark;
- HifiGo/sponsor/rig branding;
- watermark;
- Brands/Models database UI;
- Delta target preset strip;
- L/R channel graphics or two-channel controls not supported by the Workbench;
- fake hamburger/help/pin/drag controls without real functions.

### 9.2 Header

Center `AutoEQ Workbench` within a Squiglink-like header height/padding. Do not add a hamburger or help button merely for visual similarity.

### 9.3 Graph toolbar

Treat the toolbar as one continuous horizontally scrollable technical strip, not independent cards.

Composition order:

```text
Inspect | Label | Screenshot | Recolor | Theme
| Zoom: Bass | Mids | Treble
| Normalize: dB/value | Hz/value
| Smooth/value
```

Exact wrap/scroll behavior may adapt at narrow widths, but controls stay in one visual system with source-like heights, borders, separators and radii.

### 9.4 Graph

Keep Workbench relative dB semantics and allowed graph series contract. Do not copy Squiglink absolute 30–85 dB values, branding or watermark.

Align source-derived geometry and typography closely:

- 800×346 viewport;
- logarithmic 20 Hz–20 kHz axis;
- `20Hz` and `20kHz` edge labels;
- upstream tick-density pattern and major/minor hierarchy;
- `dB` vertical label placement;
- tick font hierarchy;
- grid extent/weight;
- curve stroke visual weight;
- curve-key/legend size, line-height and lower-left placement.

Current mobile `compact` graph labels are visibly oversized compared with the reference and must be reduced. Responsive CSS/SVG scaling should provide legibility without changing graph semantic data.

### 9.5 Dock tabs

Keep accessible tab semantics and keyboard behavior. Change only presentation toward the source segmented control: smaller radius, explicit separators, technical density. Active tab stays amber.

### 9.6 Curves

Use Squiglink manager density as the compositional reference. A loaded curve row should read as one compact identity/action unit: color indicator, name, offset, baseline/visibility/remove actions. Do not add L/R or database-only behaviors.

### 9.7 Equalizer

Target composition:

```text
Parametric Equalizer                         Settings
[ FR .............................................. ]
[ Target .............................. ] [ AutoEQ ]

Type       Frequency       Gain       Q
filters...

[ + ] [ - ] [ Sort ]      [ Undo ] [ Redo ]
[ Import ]                 [ Export ▾ ]
```

Requirements:

- remove visible `0 / 64 filters` counter;
- rename `Constraints` to `Settings`;
- place Settings near the Equalizer heading as a secondary action;
- place AutoEQ adjacent to Target;
- keep Undo/Redo but visually secondary;
- compact empty state;
- Settings panel uses a source-like dense Min/Max grid for Frequency/Gain/Q plus Max Filters;
- do not add Squiglink Peak/LSQ/HSQ enable toggles because they would change optimizer settings semantics.

### 9.8 AutoEQ running state

A running AutoEQ must never be represented only by replacing `AutoEQ` with `Cancel`.

Running UI includes:

- animated spinner/activity indicator;
- `AutoEQ` running label;
- elapsed `mm:ss` timer derived from a monotonic start timestamp;
- Cancel action.

No fake progress percentage. Timer is UI-only transient state and is not undoable/session state.

Finish, cancel and error remove the running affordance and stop timer updates. Existing result is preserved on cancel/error.

### 9.9 Tools

Sound Tools, Compare A/B, Session and Analysis use one shared section grammar: consistent heading, border/divider, spacing, control height and empty-state treatment.

Compare A/B must no longer render its important state as loose text. A/B assignments become compact labeled status rows/chips; snapshot history uses dense rows. `Analysis` remains collapsible but visually belongs to the same stack.

### 9.10 Desktop vs mobile

Desktop: strong Squiglink geometric authority.

Mobile: Workbench responsive adaptation. Preserve source-like surface, tabs, density and horizontal toolbar scrolling, but do not implement a decorative bottom-sheet handle or fake draggable panel.

Reference QA viewports:

```text
1440×900 Light
1440×900 Dark
390×844 Light
390×844 Dark
360×800 Light
```

## 10. Accessibility and visual QA

No visual alignment may regress keyboard, focus, labels or target size without an explicit reason.

Required review:

- keyboard navigation through toolbar/tabs/Equalizer/Tools;
- visible focus in both themes;
- no horizontal document overflow at 360/390 px (toolbar may scroll internally);
- reduced-motion behavior for the AutoEQ spinner;
- disabled/read-only contrast;
- real-render a11y audit;
- Light/Dark screenshot review at the reference viewports.

Pixel-perfect CI screenshot diffs are not required because font rasterization is environment-sensitive. Playwright screenshots are review evidence and stay outside the repo unless a later decision explicitly commits stable visual fixtures.

No image generation is part of this plan.

## 11. Acceptance gate

Plan 3 is complete only when all three subplans are complete and:

1. default Hz-mode behavior preserves prior default normalization/Standard-v1 delivered results;
2. real dB/Hz normalization mode selection works and is source-derived;
3. Session v1 round-trips authoritative workspace and invalid import is non-destructive;
4. APO, Poweramp and Wavelet exports are explicit and reflect current enabled filters only;
5. frozen Standard-v1 benchmark passes without optimizer tuning;
6. committed browser E2E covers the primary workflow;
7. AutoEQ running state shows activity + elapsed time + Cancel;
8. graph/toolbar/tabs/Curves/Equalizer/Tools satisfy the visual matrix in desktop Light and responsive mobile;
9. Light and Dark share geometry;
10. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, Pages build, benchmark, E2E and `git diff --check` pass;
11. Pages publishes the exact CI-approved final SHA;
12. final manual smoke covers Run/Cancel, normalization modes, imports/exports/session, Undo/Redo, Compare A/B, Sound Tools, graph controls and both themes.
