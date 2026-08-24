# AutoEQ Workbench — Plan 1.5 Final Closeout Contract

**Status:** approved closeout contract  
**Date:** 2026-08-24  
**Repository:** `jssantogit/autoeq-workbench`

This document records the final implemented foundation that Plan 2 must build on. Where it conflicts with the earlier MVP design or Visual Foundation Closeout documents, this document is authoritative for the current product state.

## 1. Current workspace architecture

The application remains a local-first React/TypeScript/Vite workbench with Zustand state and a framework-independent `packages/core`.

The primary mobile/desktop structure is:

```text
compact header
horizontal utility rail
specialized FR graph
Curves | Equalizer | Details dock
active dock content
```

The same information architecture is used on desktop and mobile.

## 2. Frequency-response graph

The FR graph is no longer an Apache ECharts chart. Plan 1.5 replaced the graph-only renderer with a dedicated React/SVG implementation modeled on the useful geometry of Squiglink while retaining Workbench-owned data and interaction state.

Current graph contract:

- SVG `viewBox` geometry approximately `800 x 346`;
- width-driven aspect ratio rather than fixed mobile height;
- explicit logarithmic 20 Hz–20 kHz x mapping;
- explicit Squiglink-inspired x ticks/grid hierarchy;
- stable visual dB window rather than data-driven autoscale;
- natural-spline rendering from the imported/derived points;
- curve labels inside the plot;
- inspector implemented in the same SVG renderer;
- no zoom, pan, dataZoom slider, or Reset View;
- Target curves render neutral gray and dashed;
- FR colors remain independent and user-changeable.

ECharts must not be reintroduced for the FR graph during Plan 2.

## 3. Curve model

Imported curves use only two domain kinds:

```ts
type CurveKind = 'fr' | 'target'
```

Selection for AutoEQ is separate workspace state:

```ts
activeFrId: string | null
activeTargetId: string | null
```

There are no Source, Comparison, or Reference Target curve roles.

Multiple FRs and multiple Targets may coexist. Only the active FR and active Target participate in desired-correction/AutoEQ calculations; other visible curves remain comparison overlays.

## 4. Normalization

Normalization is one authoritative, non-destructive workspace setting:

```ts
interface Normalization {
  anchorHz: number
  targetDb: number
}
```

It is edited directly in the top utility rail and applied consistently to every imported curve.

There are no separate FR/Target normalizations and no `Normalize Together` subsystem.

The normalization anchor must stay inside the Workbench frequency domain:

```text
20 Hz <= anchorHz <= 20,000 Hz
```

Default remains 500 Hz / 0 dB.

## 5. Canonical numerical policy

The frozen MVP numerical policy remains:

```text
sample rate:              48,000 Hz
Workbench domain:         20 Hz–20 kHz
canonical evaluation:     96 points/octave
```

The 20 Hz–20 kHz domain is a hard product boundary. An AutoEQ run may use a narrower effective optimization interval, but it may not exceed this product domain.

PEQ/preamp derivation remains independent of Target availability. FR + EQ requires only an active FR. Comparison metrics require both an active FR and an active Target.

## 6. AutoEQ product limits vs effective run settings

Plan 1.5 now distinguishes immutable product limits from user-selected run settings.

### 6.1 Hard product limits

Authoritative limits are exposed by `AUTOEQ_PRODUCT_LIMITS`:

```text
frequency:       20 Hz–20,000 Hz
gain:            -15 dB–+15 dB
PK Q:            0.1–12
default filters: 10
hard max filters:64
```

These are not expanded by user input.

### 6.2 Effective run settings

`AutoEqSettings` represents the effective search envelope selected for the next run:

```ts
interface AutoEqSettings {
  minFrequencyHz: number
  maxFrequencyHz: number
  minGainDb: number
  maxGainDb: number
  minQ: number
  maxQ: number
  maxFilters: number
}
```

Defaults equal the full Standard product envelope:

```text
20–20,000 Hz
-15–+15 dB
Q 0.1–12
maxFilters 10
```

Valid effective settings must remain inside the hard product limits. `maxFilters` is an integer from 0 through 64. Zero is valid and means the run returns no generated filters.

The Q range is the effective PK-Q search range. Standard shelves keep fixed Q = 0.7.

## 7. Equalizer contract for Plan 2

The current Equalizer tab already owns the correct insertion point for AutoEQ:

- active FR selector;
- active Target selector;
- `Auto EQ` action;
- expandable AutoEQ settings for Frequency/Gain/Q/maxFilters;
- compact manual filter table;
- `+ / - / Sort` and Undo/Redo controls.

Plan 2 must wire the existing controls to the worker/engine. It must not create a second competing Standard-config form or duplicate FR/Target selectors elsewhere.

## 8. Plan 2 effective configuration

Plan 2 must keep algorithm-version constants separate from the run envelope.

Conceptually:

```ts
resolveStandardAutoEqConfig(settings) => {
  profile: 'Standard',
  algorithmVersion: 'standard-v1',
  sampleRateHz: 48_000,
  fitPointsPerOctave: 96,
  minFrequencyHz: settings.minFrequencyHz,
  maxFrequencyHz: settings.maxFrequencyHz,
  minGainDb: settings.minGainDb,
  maxGainDb: settings.maxGainDb,
  minPkQ: settings.minQ,
  maxPkQ: settings.maxQ,
  maxFilters: settings.maxFilters,
  shelfQ: 0.7,
  algorithm: { ...versioned Standard-v1 constants }
}
```

The resolver must reject invalid settings rather than silently widening/clamping them.

Candidate generation, refinement, pruning/finalization and worker input validation use this resolved effective config.

The run manifest records the effective run envelope and algorithm version so the delivered result is reproducible.

## 9. Standard invariants that remain unchanged

- Every AutoEQ run starts from zero generated filters.
- `maxFilters` is a ceiling, never a fill target.
- Same active FR, active Target, normalization, effective settings, and algorithm version must produce the same result.
- Optimization evaluates the complete enabled cascade.
- Quantization occurs before final validation/metrics/preamp.
- Preamp is calculated from the actual maximum positive boost of the final quantized cascade on a dense grid.
- Manual editing remains independent and may mark an AutoEQ result modified/stale.
- Cancel/failure is non-destructive.

## 10. Plan 1.5 closeout boundary

Plan 1.5 does not implement the optimizer, worker execution, candidate generation, pruning, quantization, or export pipeline.

Its final engine-facing deliverables are:

- stable FR/Target selection contract;
- global normalization contract;
- canonical numeric policy;
- hard AutoEQ product limits;
- validated effective run settings including `maxFilters`;
- existing Equalizer UI ready to invoke Plan 2.
