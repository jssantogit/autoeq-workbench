# Plan 2 Amendment — Effective Standard Run Settings

**Applies to:** `docs/superpowers/plans/2026-08-23-02-autoeq-standard-engine.md`  
**Authoritative closeout contract:** `docs/superpowers/specs/2026-08-24-plan-1-5-final-closeout.md`

Read this amendment together with the original Plan 2. Where the two conflict, this amendment wins.

## 1. Do not recreate foundation UI or contracts

Plan 1.5 already provides:

- `CurveKind = 'fr' | 'target'`;
- `activeFrId` / `activeTargetId`;
- global normalization;
- `AUTOEQ_PRODUCT_LIMITS`;
- `AutoEqSettings` and `DEFAULT_AUTOEQ_SETTINGS`;
- Frequency/Gain/Q/maxFilters controls in the existing Equalizer tab;
- specialized React/SVG FR graph.

Plan 2 must consume these. Do not add a parallel config form, duplicate FR/Target selectors, or reintroduce ECharts for the FR graph.

The original proposed `apps/web/src/features/autoeq/AutoEqControls.tsx` is optional only if it is a thin extraction used by the existing `EqualizerTab`; it must not create a second user-facing control surface.

## 2. Product limits and effective settings are distinct

`AUTOEQ_PRODUCT_LIMITS` owns immutable Standard product bounds:

```text
frequency:        20–20,000 Hz
gain:             -15–+15 dB
PK Q:             0.1–12
defaultMaxFilters:10
hardMaxFilters:   64
```

`AutoEqSettings` owns the effective envelope for one run:

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

All effective values must stay inside the product bounds. `maxFilters` is an integer `0..64`; zero is valid.

## 3. Amend original Plan 2 Global Constraints

Replace the statement that Standard always optimizes the complete fixed 20 Hz–20 kHz range with:

> Standard has a fixed product domain of 20 Hz–20 kHz. Each run may choose a narrower effective optimization interval through `AutoEqSettings`, but may never exceed the product domain.

Replace fixed per-run Gain/Q language with:

> Standard hard limits are Gain ±15 dB and PK Q 0.1–12. Each run may choose narrower Gain and PK-Q ranges through `AutoEqSettings`. Shelves retain Q = 0.7.

Keep:

- sample rate fixed 48 kHz;
- canonical fit density 96 ppo;
- `maxFilters` ceiling semantics;
- deterministic behavior;
- quantization-before-final-metrics;
- cancellation/pruning/complexity penalties.

## 4. Amend Task 1: config and contracts

`STANDARD_V1_CONFIG` should contain immutable profile/algorithm information rather than duplicating user settings.

Recommended shape:

```ts
export const STANDARD_V1_CONFIG = {
  profile: 'Standard',
  algorithmVersion: 'standard-v1',
  sampleRateHz: MVP_NUMERIC_POLICY.sampleRateHz,
  fitPointsPerOctave: MVP_NUMERIC_POLICY.evaluationPointsPerOctave,
  shelfQ: 0.7,
  productLimits: AUTOEQ_PRODUCT_LIMITS,
  algorithm: {
    deadbandDb: 0.1,
    huberDeltaDb: 1.0,
    candidateThresholdDb: 0.5,
    minObjectiveImprovement: 0.005,
    pruneTolerance: 0.002,
    filterCountWeight: 0.01,
    highQWeight: 0.002,
    gainWeight: 0.0005,
    cancellationWeight: 0.01,
  },
} as const
```

Add an explicit resolver:

```ts
resolveStandardAutoEqConfig(settings: AutoEqSettings): AutoEqConfig
```

It must:

1. reject invalid `AutoEqSettings` with a structured core error;
2. copy the effective Frequency/Gain/Q/maxFilters values into the resolved config;
3. use fixed 48 kHz, 96 ppo and shelf Q 0.7;
4. attach `algorithmVersion = 'standard-v1'`;
5. never silently clamp or widen invalid settings.

Required tests include:

```ts
it('resolves a narrower valid Standard run envelope', () => {
  const config = resolveStandardAutoEqConfig({
    ...DEFAULT_AUTOEQ_SETTINGS,
    minFrequencyHz: 40,
    maxFrequencyHz: 15_000,
    minGainDb: -10,
    maxGainDb: 8,
    minQ: 0.5,
    maxQ: 8,
    maxFilters: 6,
  })
  expect(config).toMatchObject({
    minFrequencyHz: 40,
    maxFrequencyHz: 15_000,
    minGainDb: -10,
    maxGainDb: 8,
    minPkQ: 0.5,
    maxPkQ: 8,
    maxFilters: 6,
  })
})
```

and rejection of any effective setting outside `AUTOEQ_PRODUCT_LIMITS`.

## 5. Amend candidate generation and refinement

Every place in the original plan that clamps candidates to the full product range must instead clamp to the **resolved effective run config**:

- candidate Fc: `config.minFrequencyHz..config.maxFrequencyHz`;
- candidate gain: `config.minGainDb..config.maxGainDb`;
- PK Q: `config.minPkQ..config.maxPkQ`;
- accepted filter count: `0..config.maxFilters`.

The product limits remain a prior validation layer and must not be reimplemented ad hoc in candidate/refinement modules.

Shelf Q remains fixed at 0.7.

Low/high shelf candidate regions must respect the effective frequency range. Do not evaluate or generate a shelf from frequencies excluded by the run envelope.

## 6. Amend optimization-grid handling

The canonical evaluation policy remains 96 points/octave over the Workbench domain.

For an AutoEQ run, construct or select the fit samples inside:

```text
config.minFrequencyHz <= f <= config.maxFrequencyHz
```

Do not change the global Workbench graph/evaluation policy merely because a narrower AutoEQ run was selected.

Final full-cascade preamp remains dense-grid and must cover the complete audible Workbench domain required by the existing preamp policy, not only the narrowed optimization interval.

## 7. Amend maxFilters behavior

The original Plan 2 hard guard remains, but it is now resolved through `AutoEqSettings`:

- `maxFilters = 0` is valid and returns zero generated filters;
- default is 10;
- hard ceiling is 64;
- optimizer stops earlier whenever additional filters do not materially improve the objective.

Never substitute the current manual filter count for `maxFilters`.

Every run starts from zero generated filters regardless of the current editor contents.

## 8. Amend worker request and run manifest

The browser worker request must carry either:

- the validated `AutoEqSettings`, then resolve them inside core; or
- a fully resolved `AutoEqConfig` created by the core resolver before posting.

Prefer one validation/resolution path; do not maintain separate web/core config semantics.

The run manifest must record at least:

```text
algorithmVersion
sampleRateHz
fitPointsPerOctave
effective min/max frequency
effective min/max gain
effective min/max PK Q
maxFilters
final quantized filters
final metrics
preamp
```

This makes a run reproducible from the actual effective settings rather than only the profile defaults.

## 9. Amend web integration task

Wire the existing `EqualizerTab`:

- `Auto EQ` becomes enabled only when there is a valid active FR and active Target and no conflicting run state;
- clicking it starts a fresh worker run using the current global normalization and current `AutoEqSettings`;
- running state exposes Cancel;
- success atomically replaces the optimizer solution;
- cancel/failure preserves the prior valid filters;
- manual edits after success mark the result modified;
- changing active FR, active Target, normalization, or AutoEQ settings marks an AutoEQ result stale.

Do not add a second Standard-profile panel elsewhere.

## 10. Plan 2 completion gate addition

Before Plan 2 is complete, explicitly verify:

- defaults resolve to 20–20k / ±15 dB / Q 0.1–12 / 10 filters;
- narrower valid envelopes are honored by the optimizer;
- invalid envelopes are rejected before optimization;
- no candidate/refined filter exceeds the effective run envelope;
- `maxFilters = 0` returns zero filters;
- `maxFilters = 64` is accepted but never treated as a fill target;
- run manifest records the effective envelope;
- the existing Equalizer settings UI is the only user-facing Standard run config surface.
