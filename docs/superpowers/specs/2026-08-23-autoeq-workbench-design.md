# AutoEQ Workbench — MVP Design

**Status:** approved design, pending written-spec review  
**Date:** 2026-08-23  
**Repository:** `jssantogit/autoeq-workbench`

## 1. Purpose

AutoEQ Workbench is a focused browser application for importing a measured frequency response and a target, visualizing both, generating a parametric AutoEQ with our own algorithm, inspecting and manually editing the resulting filters, and exporting the final result for Poweramp.

The product is a **workbench**, not a measurement database, catalog, social application, or step-by-step wizard.

Primary workflow:

`Import curves -> Visualize -> Normalize -> Run AutoEQ -> Inspect/Edit filters -> Export`

The MVP is intentionally local-first and single-purpose. It does not require accounts, a backend, a database, or cloud persistence.

## 2. Design principles

1. **The graph is the center of the product.** The visual language should feel familiar to users of CrinGraph/Squiglink while being rebuilt around AutoEQ rather than measurement browsing.
2. **UI stays thin over a solid numerical core.** DSP, parsing, normalization, metrics, optimization, quantization, and export logic do not live in React components.
3. **The filter limit is a ceiling, not a target.** The optimizer should use as few filters as materially useful.
4. **Final metrics must describe the delivered preset.** Quantization happens before final validation and preamp calculation.
5. **Manual edits are first-class.** The user can inspect and modify the generated solution without the optimizer silently taking control again.
6. **The system is reproducible.** Each run records effective parameters, final filters, metrics, and algorithm version.
7. **Failure is non-destructive.** Parse, worker, numeric, optimization, and export failures must not destroy the last valid workspace state.
8. **No hidden network processing in the MVP.** Imported curves and generated data remain in the browser.

## 3. Scope

### 3.1 In scope for MVP

- Import Source FR from `.txt` or `.csv`.
- Import Target from `.txt` or `.csv`.
- Conservative delimiter/header autodetection.
- Two-column frequency/dB input.
- Explicit per-curve normalization by anchor frequency and target dB.
- Shared normalization action for Source + Target.
- Log-frequency graph from 20 Hz to 20 kHz.
- Source, Target, Desired Correction, PEQ Response, and Source + EQ curves.
- Parametric filters: PK, low shelf, high shelf.
- Manual filter add/remove/duplicate/enable/disable/reorder/edit.
- AutoEQ Standard profile.
- AutoEQ execution in a Web Worker.
- Cancelable AutoEQ execution.
- Quantization before final validation.
- Discrete post-quantization refinement.
- Dense-grid combined-response preamp calculation.
- Error metrics and cancellation audit.
- Poweramp text export.
- Export of derived curves.
- Portable Workbench session/run JSON.
- Undo/redo for workspace edits.
- Regression tests and a benchmark corpus.

### 3.2 Explicitly out of scope for MVP

- Measurement database or headphone/IEM catalog.
- User accounts, login, cloud sync, or server persistence.
- Backend optimization service.
- Multiple AutoEQ policy profiles beyond Standard.
- WASM implementation.
- Direct visual dragging of filter Fc/Gain on the graph.
- Audio playback, convolution, or real-time audio processing.
- Automatic rig identification or confidence weighting.
- Mobile-first UX.
- Full set of generic biquad types beyond PK/LS/HS.
- Deployment/release automation beyond what is required to validate the app.

## 4. Technology and repository architecture

The repository is a pnpm workspace monorepo without Turborepo in the MVP.

```text
autoeq-workbench/
  apps/
    web/
      src/
        components/
        features/
        workers/
        state/
        styles/
  packages/
    core/
      src/
        curves/
        dsp/
        autoeq/
        metrics/
        io/
        exports/
        types/
  docs/
    superpowers/
      specs/
```

### 4.1 Web application

`apps/web` uses:

- React
- TypeScript
- Vite
- Apache ECharts
- Zustand
- Tailwind CSS

Responsibilities:

- file selection and browser I/O;
- workspace layout;
- graph rendering and graph interaction;
- shared UI state;
- filter table/editor;
- worker lifecycle;
- human-readable error presentation;
- export/download actions.

The web layer does not own DSP formulas or AutoEQ behavior.

### 4.2 Core package

`packages/core` is framework-agnostic TypeScript.

Responsibilities:

- FR parsing and validation;
- log-frequency interpolation;
- normalization;
- common-grid creation;
- PK/LS/HS biquad response calculation;
- filter-cascade response;
- desired correction calculation;
- AutoEQ candidate generation and optimization;
- regularization, pruning, and cancellation analysis;
- quantization;
- discrete refinement;
- metrics;
- dense-grid preamp;
- session/run serialization contracts;
- export adapters.

The core must not import React, Zustand, Tailwind, or ECharts.

### 4.3 Worker boundary

Optimization runs in a Web Worker so the main UI remains responsive.

Worker messages use serializable core contracts. A run request contains normalized Source/Target data plus effective `AutoEqConfig`. A successful response contains the complete final solution and diagnostics. A failed response contains a structured error.

Cancellation must terminate or invalidate the active run without altering the previous valid solution.

### 4.4 Future WASM compatibility

The core APIs should not depend on implementation details that make later replacement of numeric hot spots difficult. WASM is not part of MVP and should only be introduced if profiling demonstrates a real performance problem.

## 5. Core data model

### 5.1 Curve

A curve represents imported FR-like data without destroying the original measurements.

Conceptual fields:

```ts
interface Curve {
  id: string
  name: string
  role: 'source' | 'target' | 'derived'
  rawPoints: CurvePoint[]
  metadata: CurveMetadata
}

interface CurvePoint {
  frequencyHz: number
  db: number
}
```

Normalization, interpolation, and other transformations are derived operations. Repeatedly changing normalization must not accumulate destructive offsets into `rawPoints`.

### 5.2 Normalization

Each imported curve has explicit normalization settings:

```ts
interface Normalization {
  anchorHz: number
  targetDb: number
}
```

The UI supports independent Source and Target normalization plus an action to apply one anchor/level pair to both.

Default project convention may be 500 Hz, but the MVP UI exposes the anchor and level rather than hiding the convention.

### 5.3 Filter

```ts
type FilterType = 'PK' | 'LS' | 'HS'

interface Filter {
  id: string
  enabled: boolean
  type: FilterType
  frequencyHz: number
  gainDb: number
  q: number
}
```

Filter IDs are stable across edits. Disabled filters remain in the preset and workspace but do not contribute to the active cascade, metrics, or preamp.

### 5.4 AutoEqConfig

The Standard profile is represented as configuration, not a separate hard-coded optimizer implementation.

MVP effective behavior:

- `sampleRateHz = 48000` fixed by product behavior;
- optimization range fixed at 20 Hz–20 kHz;
- filter types PK/LS/HS;
- filter gain bounds `[-15, +15] dB`;
- PK Q bounds `[0.1, 12]`;
- shelf Q default `0.7`;
- `maxFilters` user-configurable;
- default `maxFilters = 10`;
- hard ceiling `maxFilters = 64`.

The exact penalty weights, deadband, candidate thresholds, pruning tolerance, and discrete-refinement neighborhood are algorithm parameters that must be versioned and benchmarked. They are not product UI promises.

### 5.5 AutoEqResult

A completed run returns the complete final state required to reproduce and inspect it:

```ts
interface AutoEqResult {
  filters: Filter[]
  metrics: AutoEqMetrics
  preampDb: number
  cancellationAudit: CancellationAudit
  manifest: RunManifest
}
```

Filters in `AutoEqResult` are the **final quantized filters**. Reported metrics and preamp must correspond to those exact values.

### 5.6 Workspace state

The web workspace separates authoritative state from derived state.

Authoritative state:

- imported Source;
- imported Target;
- normalization settings;
- current filter list;
- AutoEQ configuration;
- selected filter;
- run status and provenance;
- undo/redo history.

Derived state:

- normalized curves;
- common-grid curves;
- desired correction;
- individual filter response;
- total PEQ response;
- Source + EQ;
- residual;
- metrics;
- preamp.

Derived state must always be reconstructable from authoritative state.

## 6. Workspace behavior

### 6.1 Single-screen workbench

There is no upload wizard and no separate EQ result page. Source/Target import, graph, AutoEQ controls, filter editing, metrics, and export belong to one continuous workspace.

### 6.2 Run semantics

`Run AutoEQ` computes a fresh solution from the current Source, Target, normalization, and Standard config.

It does **not** start from fragments of the previous optimizer result.

On success, the generated solution replaces the current optimizer solution as one undoable workspace action.

On failure or cancellation, the current valid filters remain unchanged.

### 6.3 Modified and stale states

After a successful AutoEQ run:

- manual filter changes mark the solution `modified`;
- replacing Source or Target marks the current filters/result `stale`;
- stale filters are preserved until the user runs AutoEQ again or explicitly clears them.

The UI must not imply that a modified or stale solution is the pristine output of the recorded AutoEQ run.

### 6.4 Undo/redo

Undo/redo should cover meaningful workspace edits including:

- filter changes;
- filter enable/disable;
- filter insertion/removal/duplication/reorder;
- normalization changes;
- replacement of an AutoEQ solution.

Transient graph zoom/pan state does not need to enter the undo stack.

## 7. Visual and interaction direction

### 7.1 Reference language

Visual interaction is based on the successful layout language of:

- CrinGraph: https://github.com/mlochbaum/CrinGraph
- Squiglink: https://squig.link/
- Squiglink Lab: https://github.com/squiglink/lab

The project should **not copy their code or assets**. The reference is the interaction model: a dominant FR graph, compact nearby controls, dense technical editing, and immediate visual feedback.

Product design summary:

> CrinGraph/Squiglink interaction language, rebuilt as a focused modern AutoEQ workbench.

### 7.2 Layout

Desktop/laptop is the primary MVP target.

Conceptual layout:

```text
+--------------------------------------------------------------+
|                         FR GRAPH                             |
|  Source | Target | Source+EQ | PEQ | Desired | inspector     |
+--------------------------------------------------------------+
| graph tools | normalize | reset view | Run AutoEQ | status   |
+------------------------------+-------------------------------+
| Source / Target              | Filter editor                 |
| import                       | ON # Type Fc Gain Q Actions   |
| normalization               | ...                           |
| Standard config             | ...                           |
| metrics summary             | Add Filter                    |
+------------------------------+-------------------------------+
| Export Poweramp | Export curves | Export session             |
+--------------------------------------------------------------+
```

On narrower screens, lower panels may stack. The graph remains the primary element.

### 7.3 Visual density

The UI should remain technical and relatively dense. Avoid oversized dashboard cards, large empty spacing, and generic SaaS landing-page aesthetics.

Tailwind is used for consistent layout, spacing, typography, interaction states, and component primitives rather than to make the product visually generic.

## 8. Graph behavior

Apache ECharts is the graph engine.

### 8.1 Axes

- frequency x-axis: logarithmic, 20 Hz–20 kHz;
- y-axis: dB;
- visual zoom and pan must not change optimization data or optimization range;
- `Reset View` restores the default graph viewport.

### 8.2 Curves

The graph can show:

- Source;
- Target;
- Source + EQ;
- Desired Correction;
- PEQ Response;
- selected filter response.

Default visible curves:

- Source;
- Target;
- Source + EQ when filters exist.

Auxiliary curves can be toggled to reduce clutter.

### 8.3 Inspector

Pointer inspection shows frequency and interpolated dB values for visible curves at the current position.

### 8.4 Selected filter visualization

Selecting a filter row:

- highlights that row;
- highlights the filter's individual response;
- shows a visual marker around its Fc where useful.

Direct dragging of filters on the graph is intentionally deferred. Numeric editing must be precise and stable first.

## 9. Filter editor

The filter table is dense and optimized for repeated numeric editing.

Columns:

`ON | # | Type | Fc | Gain | Q | actions`

Supported operations:

- edit type;
- edit frequency;
- edit gain;
- edit Q;
- enable/disable;
- add;
- remove;
- duplicate;
- reorder;
- select/highlight.

Valid edits update the cascade, Source + EQ, residual, metrics, and preamp immediately.

Invalid field values remain visibly invalid and must not silently enter the core numerical state.

Reordering is organizational/export-facing. For the magnitude-response use case, the final cascade calculation should not use order as a hidden optimization variable.

## 10. AutoEQ Standard engine

### 10.1 Fundamental correction

After validation, normalization, and common-grid interpolation:

`desired(f) = target(f) - source(f)`

The desired correction is distinct from the PEQ approximation.

### 10.2 Frequency grid and interpolation

Source and Target are interpolated onto a sufficiently dense common log-frequency grid.

Interpolation strategy must be explicit and testable. The MVP core uses log-frequency interpolation rather than inheriting Squiglink's linear-in-Hz interpolation behavior.

### 10.3 Objective

The optimizer should minimize fit error while charging for fragile or unnecessarily complex solutions.

Conceptual objective:

`J = fitError + filterCountCost + highQCost + gainCost + cancellationCost`

A robust fit loss may be used internally while user-facing metrics remain conventional MAE/RMSE/error-max diagnostics.

The exact weights belong to the versioned algorithm and benchmark suite.

### 10.4 Pipeline

1. validate inputs;
2. normalize Source and Target;
3. create common log-frequency grid;
4. calculate desired correction;
5. calculate residual;
6. detect meaningful error regions and generate candidates;
7. prioritize broad/material corrections;
8. optimize Fc/Gain/Q continuously against the complete cascade;
9. penalize complexity, high Q, extreme gain, redundancy, and cancellation;
10. prune low-value filters;
11. merge/remove structurally redundant or opposing nearby filters when this preserves useful fit;
12. stop when extra complexity does not materially improve the objective;
13. quantize for the Poweramp export adapter;
14. perform bounded discrete refinement on the quantized parameter grid;
15. recalculate exact final cascade;
16. calculate final metrics;
17. calculate dense-grid preamp;
18. create cancellation audit and run manifest.

### 10.5 Filter-count behavior

The engine starts from zero filters and adds filters only when useful.

`maxFilters` is never a fill target. Six filters are preferred to ten when the additional four do not produce material benefit after regularization and quantization.

### 10.6 Q policy

High Q is not categorically forbidden. PK Q may reach 12, but progressively higher Q should cost more unless its error reduction justifies it.

### 10.7 Shelves

LS and HS compete with PK candidates. There is no mandatory allocation such as "one LS and one HS". A shelf is favored only when it provides a lower-complexity explanation of a broad trend.

### 10.8 Deadband

A small residual deadband may prevent spending complexity on numerically trivial errors. An initial neighborhood around 0.1 dB is a benchmark candidate, not a permanent product truth.

The effective value must be captured by algorithm version/config in the run manifest.

### 10.9 Cancellation audit

The engine explicitly detects nearby, strongly overlapping filters with opposing effects.

The audit classifies structural risk and allows the optimizer/pruner to prefer merge/removal/replacement when similar fit is achievable with a cleaner solution.

The final preset should not contain pathological cancellation structures merely to improve a tiny numeric residual.

### 10.10 Determinism

Same Source, Target, config, and algorithm version should produce the same result.

If a stochastic optimization technique is introduced later, its random seed becomes part of the run manifest.

## 11. Quantization and Poweramp adapter

Continuous optimizer output is not the final result.

Finalization order:

`continuous optimization -> pruning -> quantization -> discrete refinement -> exact validation -> preamp -> export`

The Poweramp adapter owns Poweramp-specific serialization and parameter quantization rules. The optimizer operates on physical filter parameters and does not embed text-export formatting behavior.

A Poweramp export is considered valid only when:

- every exported filter equals the quantized filter validated by the core;
- Source + EQ and reported metrics were calculated from those same values;
- preamp was calculated after quantization/refinement;
- no unvalidated continuous parameters are silently substituted during export.

Poweramp-specific numeric step rules must live in one adapter/configuration source and be covered by tests so export and validation cannot drift apart.

## 12. Preamp

Preamp is calculated from the maximum positive gain of the **combined enabled-filter cascade**, not from the largest individual filter gain.

Conceptual rule:

`preamp <= -max(0, maxCombinedBoost)`

The maximum is searched on a dense frequency grid at the fixed MVP sample rate of 48 kHz.

A conservative rounding policy may be applied by the export adapter, but it must never produce less attenuation than the calculated headroom requirement.

Disabled filters do not contribute to preamp.

## 13. Metrics and diagnostics

Minimum final run metrics:

- MAE over 20 Hz–20 kHz;
- RMSE over 20 Hz–20 kHz;
- maximum absolute residual;
- frequency of maximum absolute residual;
- active filter count;
- maximum Q;
- maximum positive filter gain;
- required preamp;
- cancellation-audit summary.

The main workspace should show a compact summary, primarily:

- filters used;
- principal residual/MAE indicator;
- preamp.

Detailed metrics can live in a diagnostics panel.

User-facing metrics do not have to be the exact same loss used internally by the optimizer.

## 14. Import and validation

### 14.1 Supported input

MVP accepts `.txt` and `.csv` files representing two numeric columns:

- frequency in Hz;
- magnitude in dB.

Parser may recognize:

- whitespace;
- tabs;
- comma;
- semicolon;
- optional recognizable headers;
- blank lines;
- recognizable comment lines.

Autodetection must be conservative. Ambiguous input produces a useful error instead of silently selecting an interpretation.

### 14.2 Validation

At minimum reject or surface:

- empty files;
- insufficient numeric data;
- non-positive frequency;
- non-finite numeric values;
- malformed rows;
- unresolved duplicate-frequency conflicts;
- inputs that cannot provide a meaningful working range.

The parser must not mutate raw imported values as a side effect of normalization or interpolation.

## 15. Export and portable sessions

### 15.1 Poweramp preset

Primary export is a textual Poweramp-style parametric preset containing the final enabled solution and final preamp according to the adapter contract.

### 15.2 Curve export

Useful derived curves can be exported in text/CSV form, including:

- Source + EQ;
- PEQ response;
- residual.

### 15.3 Workbench session/run JSON

A portable session file contains enough information to reproduce the workspace without a database:

- schema version;
- Source raw points and metadata;
- Target raw points and metadata;
- normalization settings;
- current filters including disabled filters;
- selected/effective Standard config;
- current solution state (`clean`, `modified`, `stale`);
- metrics;
- preamp;
- cancellation audit;
- run manifest;
- algorithm version.

This file is user-initiated export/import, not automatic cloud persistence.

## 16. Structured errors

Core errors use categories such as:

- `parse`;
- `validation`;
- `optimization`;
- `numeric`;
- `export`.

The core returns machine-readable error data; the web layer converts it into concise human-readable messages.

A Worker error, cancellation, parse error, or export error must leave the last valid workspace state intact.

## 17. Run manifest

Each successful AutoEQ run records a compact reproducibility manifest containing at least:

- manifest/schema version;
- algorithm version;
- effective profile name (`Standard`);
- sample rate;
- optimization range;
- Source/Target identifiers or file names when available;
- normalization settings;
- effective bounds/config;
- effective algorithm parameter version;
- final quantized filters;
- metrics;
- preamp;
- cancellation-audit summary.

The manifest is primarily a reproducibility/debugging artifact. The user does not need to see every field in the default workspace.

## 18. State during AutoEQ execution

While AutoEQ is running:

- UI stays responsive;
- status is clearly visible;
- user may cancel the run;
- the previous valid solution remains available until the new run succeeds;
- do not display fake percentage progress if no defensible progress estimate exists.

`Running...` plus cancellation is preferable to fabricated progress.

## 19. Testing strategy

### 19.1 Core unit tests

Cover at least:

- parser and delimiter/header handling;
- malformed input behavior;
- log-frequency interpolation;
- normalization invariants;
- PK/LS/HS response calculations;
- cascade composition;
- disabled-filter behavior;
- desired correction;
- metrics;
- quantization adapter;
- discrete refinement invariants;
- dense-grid preamp;
- cancellation detection;
- session serialization/deserialization.

Useful DSP invariants include:

- a 0 dB filter is magnitude-neutral;
- PK response near Fc matches the intended gain within numeric tolerance;
- disabling a filter removes its contribution;
- final exported values reproduce the final reported response.

### 19.2 AutoEQ regression fixtures

Use deterministic synthetic fixtures plus sanitized non-private real curves.

A key synthetic test constructs a Source from a Target plus known EQ behavior and verifies that AutoEQ recovers an equivalent final response within tolerance. It does not require recovering the identical original filter decomposition.

Regression assertions should favor observable result quality and structural cleanliness rather than one exact internal candidate path.

### 19.3 Benchmark corpus

Maintain representative cases such as:

- easy broad correction;
- extreme bass shelf difference;
- vocal/midrange difference;
- irregular treble;
- narrow-feature stress case;
- filter-count stress case;
- quantization-sensitive case;
- preamp overlap/high-Q stress case.

For each benchmark record at least:

- MAE;
- RMSE;
- max error;
- filter count;
- max Q;
- max boost;
- preamp;
- cancellation count/severity;
- elapsed optimizer time.

Algorithm changes should make trade-offs visible rather than hiding them behind a single score.

### 19.4 Web behavior tests

Focus on user-observable workflows:

- import Source/Target;
- normalize;
- run AutoEQ through Worker;
- cancel a run;
- edit a filter;
- enable/disable a filter;
- undo/redo;
- export Poweramp;
- recover from parse/Worker failure without state loss.

Do not test ECharts or Zustand internals merely because they are dependencies.

## 20. Performance expectations

Manual filter editing and curve recomputation should feel immediate on a typical desktop/laptop.

AutoEQ execution should remain responsive to the rest of the UI and complete within a practically useful timescale. Exact time targets are benchmark outcomes rather than architectural assumptions.

If profiling later identifies a real TypeScript bottleneck, optimize the measured hot path first and consider WASM only when evidence justifies the extra implementation boundary.

## 21. MVP acceptance criteria

The MVP is functionally complete when all of the following are true:

1. Source and Target can be imported from valid `.txt` or `.csv` files.
2. Both can be visualized on a 20 Hz–20 kHz log-frequency graph.
3. Each curve can be normalized by explicit anchor frequency + target dB.
4. AutoEQ Standard runs in a Worker without blocking the UI.
5. A running AutoEQ can be canceled safely.
6. AutoEQ may return from zero to `maxFilters` and is never required to fill the filter budget.
7. `maxFilters` defaults to 10 and cannot exceed 64.
8. PK/LS/HS filters can be manually edited.
9. Filter edits update the displayed response, residual, metrics, and preamp.
10. Filters can be enabled/disabled without deletion.
11. Selected filters can be inspected individually on the graph.
12. Final validation occurs only after quantization and discrete refinement.
13. Preamp is based on dense-grid maximum boost of the combined enabled cascade.
14. The exported Poweramp preset reproduces the exact validated final filter values.
15. Source + EQ, PEQ response, and residual can be exported.
16. A portable session/run JSON can reproduce the workspace.
17. Parser/Worker/optimization failures preserve the last valid workspace state.
18. Core unit/regression tests pass.
19. The benchmark corpus produces recorded comparison metrics.
20. The UI retains the graph-centered CrinGraph/Squiglink interaction language without depending on their legacy code.

## 22. Post-MVP evolution

The architecture should allow, without requiring them now:

- `same_rig_literal` profile;
- `cross_rig_conservative` profile;
- `consensus_711` profile;
- higher-confidence HF/Type 4.3 workflows;
- confidence weighting by frequency/rig;
- configurable sample rate;
- additional export adapters;
- optional visual filter dragging;
- optional WASM numeric kernels;
- more detailed diagnostic views.

These should extend the same core rather than fork separate AutoEQ engines.

## 23. Technical references and provenance

This design is based on the project's established AutoEQ methodology/research plus direct interaction references from CrinGraph and Squiglink.

Relevant external implementations and references include:

- CrinGraph — https://github.com/mlochbaum/CrinGraph
- Squiglink Lab — https://github.com/squiglink/lab
- Squiglink — https://squig.link/
- AutoEq by Jaakko Pasanen — https://github.com/jaakkopasanen/AutoEq
- RBJ Audio EQ Cookbook / biquad reference material used by the project's DSP research

The Workbench does not assume that Squiglink's AutoEQ and modern AutoEq are the same optimizer. They are references for behavior and techniques, not code to copy.

## 24. Implementation constraint

Implementation should follow the repository's adopted Noqlen Playbook operating rules: inspect the relevant surface, make the smallest coherent change, verify with evidence appropriate to risk, then review the actual diff. Heavy domain logic belongs in the core rather than UI screens.

This document defines the approved product/architecture direction. Implementation sequencing belongs in the separate implementation plan created after written-spec review.
