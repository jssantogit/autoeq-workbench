# Remake 04 — Tools, Audio, Compare A/B, and Closeout Design

Status: approved design
Branch: `remake/squiglink-base`

This spec is the source of truth for Remake 04. Where it conflicts with the older implementation plan `docs/superpowers/plans/2026-08-24-remake-04-tools-and-closeout.md`, this document wins. The architectural and DSP contracts in `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md` remain authoritative for everything not explicitly changed here.

Remake 03.5 is the visual/interaction baseline. Remake 04 must preserve the approved shell, graph, toolbar, Curves, Equalizer, Light/Dark behavior, graph semantics, and source-first visual language while replacing the interim Tools area with the final audio/compare workspace and performing the final remake closeout.

## 1. Goal

Complete the source-first remake by delivering the final `Tools` workspace:

```text
Tools
  Sound Tools
    Tone Generator
    Music Player
  Compare A/B
  Analysis
```

Then perform the final responsive, dead-code, provenance, CI, Pages, and public smoke closeout.

After the Remake 04 acceptance gate, the remake is complete. Stop there. Do not begin Standard AutoEQ / Plan 2 automatically.

## 2. Source and provenance policy

Squiglink Lab remains the primary source reference for visual language, composition, density, interaction style, Tone Generator behavior where available, and the broader remake shell.

Pinned Squiglink source:

```text
repository: squiglink/lab
commit: 9ff842c539b058cc726207b689c904c9efff75fd
license: 0BSD
snapshot: vendor/squiglink/
```

The pinned Squiglink snapshot does not provide reusable implementations for the approved Music Player and Compare A/B scope. For those two areas only, use `potatosalad775/modernGraphTool` as an explicitly recorded complementary MIT reference.

Approved complementary source revision:

```text
repository: https://github.com/potatosalad775/modernGraphTool
commit: 7e9481e44100c0bb80d74e80756529239525950d
license: MIT
```

Before adapting substantial implementation ideas from that source, record exact provenance under:

```text
vendor/references/modernGraphTool/
```

including `UPSTREAM.md` and the exact source `LICENSE`, and add an appropriate entry to `THIRD_PARTY_NOTICES.md`.

Rules:

- do not vendor the full modernGraphTool repository;
- do not present modernGraphTool code as Squiglink code;
- use modernGraphTool only for Music Player lifecycle and Compare A/B/history concepts;
- do not import runtime code from `vendor/**`;
- do not copy modernGraphTool visual styling into Workbench;
- adapted production code belongs under `apps/web/src/**`;
- preserve the applicable MIT notice for substantial adapted portions.

## 3. Architecture

The approved architecture is a single local audio engine plus canonical Workbench state.

```text
packages/core
  filters / preamp / metrics / validation
                |
                v
         workspaceStore
                |
      +---------+----------+
      |                    |
      v                    v
 Equalizer            Compare A/B
      |                    |
      +---------+----------+
                |
                v
            SoundTools
                |
                v
      one Web Audio engine
```

Ownership remains strict:

- `packages/core` owns filter/DSP/preamp math and numeric contracts;
- `workspaceStore` remains canonical EQ/workspace state;
- Zustand may own bounded session Compare A/B metadata/snapshots;
- React owns Tools composition and lifecycle;
- a browser Web Audio adapter owns imperative audio nodes and playback lifecycle;
- the Web Audio engine is not a second DSP/domain authority;
- the engine receives canonical filters plus the current core-derived preamp and translates them to Web Audio nodes.

Do not create a global AudioContext store. Do not create separate audio engines for Tone Generator and Music Player.

## 4. Single Web Audio engine

`SoundTools` owns one audio-engine instance for its mounted lifetime. Tone Generator and Music Player both use that engine.

The engine conceptually supports:

```ts
type AudioSourceKind = 'tone' | 'file'

interface AudioEngineState {
  source: AudioSourceKind
  isPlaying: boolean
  fileLoaded: boolean
  currentTime: number
  duration: number
  volume: number
  toneFrequencyHz: number
  eqEnabled: boolean
}
```

The exact public interface may be adapted during implementation, but must preserve the following responsibilities:

- select tone/file source;
- load a local audio file;
- play/pause/stop;
- seek file playback;
- control linear volume;
- control tone frequency;
- enable/disable local EQ effect;
- update the current canonical EQ chain without recreating the engine;
- destroy all browser resources cleanly.

### Lifecycle rules

- `AudioContext` is created/resumed only after an explicit user gesture that requests playback;
- Tone and Music share one engine/context;
- switching source stops/disconnects the previous source before starting the new one;
- stop/pause/seek must release obsolete source nodes;
- rebuilt EQ/filter nodes must disconnect replaced nodes;
- requestAnimationFrame/timers used for playback progress must be cancelled on pause/stop/destroy;
- unmount destroys active nodes/resources;
- `destroy()` is idempotent;
- no autoplay workaround is allowed.

### EQ chain

The engine consumes canonical enabled Workbench filters and the current core-derived preamp.

Map supported filter types to Web Audio:

```text
PK -> peaking
LS -> lowshelf
HS -> highshelf
```

Disabled filters create no Biquad node.

Use canonical frequency/gain/Q values. Convert preamp to linear gain using the standard dB amplitude relation. Do not duplicate or port legacy Squiglink optimizer/DSP authority.

`EQ Effect` is playback-only state:

- ON: local audio passes through current Workbench preamp/filter chain;
- OFF: playback bypasses the EQ chain;
- toggling it never mutates workspace filters, preamp, FR EQ, normalization, or curve data.

Canonical filter/preamp changes must update live playback through the same engine instance.

## 5. Tone Generator

Tone Generator is the source-derived local audio utility.

Requirements:

- sine-wave tone;
- frequency range 20 Hz to 20 kHz;
- frequency control maps logarithmically across the range;
- current frequency is visible numerically;
- Play and Stop are explicit user gestures;
- volume control uses the shared audio engine;
- changing tone frequency while playing updates the active oscillator without creating competing sources;
- switching from Music Player to Tone Generator stops the file source first.

Use Squiglink-derived density/control hierarchy and Workbench theme tokens. Do not redesign it as a card-heavy modern player.

## 6. Music Player

Music Player plays a file selected locally by the user.

Data path:

```text
File
  -> arrayBuffer()
  -> AudioContext.decodeAudioData()
  -> local AudioBuffer playback
```

Requirements:

- no upload;
- no `fetch`/XHR/network path for the selected file;
- no server persistence;
- no localStorage persistence of the audio file;
- no real/private music fixtures in tests;
- supported files are whatever the current browser can decode via Web Audio;
- decode failure is non-destructive and produces a clear local error state;
- Play/Pause/Stop;
- seek within loaded duration;
- volume;
- `EQ Effect` toggle;
- source selection does not create a second AudioContext.

Pause retains the local playback position. Stop returns it to zero. Seeking while playing recreates/repositions only the required file source node and continues through the current engine state.

## 7. Compare A/B state model

Compare A/B compares explicit EQ snapshots, not hidden duplicate workspaces.

Snapshots are session-scoped only. Refresh clears them.

Each snapshot must contain enough canonical EQ state to reproduce the state deterministically, including:

- ordered filter list;
- filter provenance if part of current canonical state;
- solution state if part of current canonical state;
- a derived/display preamp value may be stored for summary text, but preamp must not become mutable snapshot authority if it is deterministic from filters.

Snapshot filter arrays must be deep copies.

A bounded Zustand compare store is appropriate. Keep history bounded; the existing Plan 04 target of 100 newest entries and debounce/coalescing behavior may be retained unless implementation evidence shows a smaller equivalent is necessary.

Do not persist Compare A/B history in localStorage, URL state, backend storage, or files.

## 8. Compare snapshot recording

Compare history should record meaningful canonical EQ changes rather than every UI interaction.

Record changes to the canonical EQ solution state, such as filters/provenance/solution state.

Do not record changes that only affect:

- selected filter row;
- active Tools/Curves/Equalizer tab;
- theme;
- curve visibility/color;
- graph inspector/labels/zoom;
- playback-only EQ Effect state.

Recording should be debounced/coalesced so continuous numeric edits do not flood history.

Identical snapshots must not be duplicated.

The implementation must expose a way to suppress the one automatic recorder entry produced when A/B itself applies an existing snapshot.

## 9. Deterministic and undoable A/B application

Applying A or B must mutate canonical `workspaceStore` EQ state through one explicit workspace action.

That action must:

- validate the incoming full snapshot with the same filter rules as normal workspace updates;
- deep-copy filters;
- apply filters/provenance/solution state atomically;
- clear stale filter selection where appropriate;
- produce exactly one workspace history record;
- support one-step undo back to the pre-apply state;
- support redo deterministically.

Compare UI flow:

```text
history snapshot -> assign A/B -> Apply A or Apply B -> workspaceStore
                                                     -> SoundTools observes canonical change
                                                     -> live local audio EQ changes automatically
```

A/B must not directly manipulate Web Audio filters. Audio follows canonical workspace state only.

Applying A/B must not immediately create a duplicate compare-history snapshot of the applied state.

## 10. Compare A/B UX

Compare A/B appears immediately below Sound Tools.

Requirements:

- newest snapshots first;
- each history row can be assigned to A or B;
- clear indication of which snapshots are currently A and B;
- top-level Apply A and Apply B controls;
- Clear action for compare history/selection;
- active/equality indication may show when current workspace exactly matches A or B;
- history scrolls within its section when long rather than creating document-level overflow;
- interaction remains usable on approximately 390 px mobile.

Equality between current workspace and a snapshot compares the ordered canonical filter fields plus relevant provenance/solution state. Ignore selected row and other view-only state. Derived preamp is not required for equality when it follows filters deterministically.

Use Workbench/Squiglink visual language, not modernGraphTool styling.

## 11. Analysis

Replace the interim Tools analysis with the final secondary Analysis section.

Analysis is visually subordinate and collapsed by default. A native accessible `<details>` pattern is acceptable.

Expose only:

- MAE;
- RMSE;
- Max absolute error;
- Max-error frequency;
- Preamp.

Consume these values from existing `WorkspaceDerived` / current core-derived state. Do not recompute MAE/RMSE/preamp in the Tools UI.

Do not include generic workspace metadata here:

- active filter count;
- total filter count;
- solution state;
- provenance.

Those belong in Equalizer/solution context where relevant.

## 12. Final Tools composition

The final `Tools` tab order is fixed:

```text
Sound Tools
  Tone Generator
  Music Player
Compare A/B
Analysis
```

Sound Tools and Compare A/B are immediately visible. Analysis is secondary.

Replace/delete transitional Tools/Details components when no longer referenced. Do not retain two competing user-facing Tools implementations.

The final Tools UI must use:

- existing shared responsive shell;
- Squiglink-derived section hierarchy/density;
- current Workbench amber/copper palette;
- current Light/Dark tokens;
- no separate mobile markup tree;
- no horizontal document overflow.

## 13. Existing remake contracts that must not regress

Remake 04 must preserve the completed 03.5 baseline:

- source-first shell and responsive composition;
- `Curves | Equalizer | Tools` dock;
- compact Curves empty state;
- source-shaped direct-cell Curves manager and responsive wrapping;
- readable names and aligned swatches;
- explicit FR/Target import chooser;
- Target gray/dashed graph contract;
- exactly one derived FR EQ for active FR when filters exist;
- FR EQ row in Curves without persistence as imported curve;
- graph labels aligned without Target sample/dash decoration;
- Squiglink-like Hz/dB axes;
- no special 0 dB grid emphasis;
- Inspect without pointer-click white focus border while retaining keyboard focus-visible behavior;
- source-like Normalize `[dB][value] [Hz][value]` visual composition with Workbench simultaneous normalization semantics;
- screenshot, recolor, baseline, display offset, smoothing;
- manual PK/LS/HS;
- preamp;
- PEQ import/export;
- GraphicEQ export;
- Light/Dark;
- horizontal graph toolbar;
- AutoEQ button visible and inert.

## 14. Error handling

All Tools errors are local and non-destructive.

Examples:

- invalid/unsupported audio decode: show an error and keep workspace unchanged;
- Web Audio unavailable/blocked: report playback failure without touching EQ state;
- invalid Compare snapshot: reject atomically;
- failed A/B apply: preserve current workspace;
- destroyed/unmounted engine must not emit late state updates.

Do not silently swallow errors that leave controls appearing active when playback is not active.

## 15. Testing strategy

Use TDD in implementation.

### Provenance

Verify exact complementary source revision/license are recorded and runtime source contains no vendor import.

### Workspace snapshot action

Cover:

- atomic apply;
- validation failure leaves state unchanged;
- filters/provenance/solution restored exactly;
- stale selected filter cleared as designed;
- one undo restores pre-apply state;
- redo reapplies snapshot.

### Compare store/recorder

Cover:

- debounce/coalescing;
- identical-state dedupe;
- bounded history;
- deep copies;
- A/B ids only reference existing snapshots;
- trimming/clear behavior;
- suppression of exactly one recorder entry after A/B apply;
- non-EQ UI changes do not create snapshots.

### Web Audio engine

Use mocked/synthetic AudioContext/AudioBuffer behavior only.

Cover:

- context creation only after playback request;
- one context/engine shared by sources;
- tone oscillator lifecycle;
- logarithmic frequency control bounds;
- file decode and playback lifecycle;
- pause/seek/stop;
- volume;
- filter mapping PK/LS/HS;
- disabled filters omitted;
- preamp gain mapping;
- EQ bypass;
- chain rebuild disconnects obsolete nodes;
- timers/RAF cleanup;
- idempotent destroy.

### Tools UI

Cover:

- final section order;
- one engine shared by Tone/Music;
- source switching stops the previous source;
- local file input only;
- Play/Pause/Stop/seek/volume;
- EQ Effect changes playback engine state only;
- canonical filter/preamp change updates engine;
- A/B assignment/application/clear;
- Analysis exact metric list and absence of old Details metadata.

### Regression

Run all existing graph, Curves, Equalizer, import/export, workspace, theme, and app tests.

## 16. Implementation sequence

Implement in coherent blocks:

1. complementary source provenance and notices;
2. undoable atomic workspace snapshot-apply action;
3. bounded Compare A/B store and recorder;
4. lifecycle-safe shared Web Audio engine;
5. Tone Generator + Music Player using the shared engine;
6. Compare A/B UI and deterministic apply;
7. final Tools tab + secondary Analysis and removal of interim/Details code;
8. source-first responsive/accessibility/dead-code closeout;
9. full CI, Pages, and public smoke acceptance.

Each block should be test-driven and independently coherent. Avoid unrelated refactors.

## 17. Responsive and visual acceptance

At minimum verify:

```text
390x844 Light
390x844 Dark
768x1024 Light
1280x800 Light
1280x800 Dark
```

Check:

- graph remains primary and unchanged from approved baseline;
- toolbar remains usable/scrollable;
- Curves manager remains operable;
- Equalizer remains usable at high filter counts;
- Tools introduces no document-level horizontal overflow;
- Tone controls are reachable;
- local file chooser/player controls are reachable;
- Compare history scrolls internally;
- A/B controls remain understandable on mobile;
- Analysis does not dominate the panel;
- Light/Dark share the same markup/layout.

Fix only observed parity/responsive/accessibility defects. Do not redesign already-approved sections opportunistically.

## 18. Repository and runtime audits

Before closeout, audit and remove dead transitional code that is truly superseded, including obsolete Details/interim Tools code and old pre-remake UI remnants where no active reference remains.

Do not perform unrelated cleanup.

Production/runtime must contain no direct dependency on:

- `vendor/squiglink/**`;
- `vendor/references/modernGraphTool/**`;
- Squiglink CDN/runtime URLs;
- modernGraphTool runtime URLs;
- remote user-audio paths;
- legacy Squiglink AutoEQ optimizer code.

## 19. Final technical verification

Run the full project verification, including at least:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/web build:pages
git diff --check
```

Also run existing vendor/runtime/legacy-AutoEQ audits.

No completion claim without fresh green evidence from the final SHA.

## 20. Public Pages acceptance

After pushing the final SHA and obtaining green CI/Pages, verify the deployed public origin.

Public smoke must include:

- Light/Dark;
- FR/Target import;
- Curves operations;
- graph zoom/smooth/inspect/label/screenshot/recolor;
- baseline/display offset;
- manual PK/LS/HS;
- preamp and FR EQ update;
- PEQ import/export and GraphicEQ export;
- AutoEQ visible but inert;
- Tone Generator play/stop from explicit gesture;
- local Music Player load/play/pause/seek/stop;
- EQ Effect audibly/structurally switching playback chain without mutating workspace;
- Compare history capture;
- deterministic A/B apply and undo;
- Analysis with only approved metrics;
- mobile/desktop no document-level horizontal overflow.

Autoplay blocking without an explicit user gesture is not an engine failure.

Confirm Pages serves the exact `head_sha` that passed final CI.

## 21. Completion gate

Remake 04 and the source-first remake are complete only when all of the following are true:

1. modernGraphTool complementary provenance/license are recorded correctly;
2. no runtime import comes from either vendor/reference tree;
3. one shared lifecycle-safe Web Audio engine powers Tone Generator and Music Player;
4. user audio remains fully local and is never uploaded/fetched remotely;
5. current canonical Workbench filters plus core-derived preamp drive local EQ playback;
6. `EQ Effect` is playback-only bypass state and never mutates workspace EQ;
7. Compare A/B uses bounded session snapshots of canonical EQ state;
8. applying A/B is deterministic and produces one undoable workspace state change;
9. applying A/B does not immediately duplicate the same state in compare history;
10. Sound Tools contains Tone Generator and Music Player;
11. Compare A/B is immediately available under Sound Tools;
12. Analysis is secondary/collapsed and contains only MAE, RMSE, max absolute error, max-error frequency, and preamp;
13. obsolete interim Tools/Details UI is removed where superseded;
14. all Remake 03.5 graph/Curves/Equalizer/visual contracts remain intact;
15. AutoEQ remains visible and inert;
16. responsive Light/Dark acceptance passes;
17. full tests/typecheck/build/lint/Pages build pass;
18. CI is green on the final SHA;
19. Pages deploys that exact green SHA;
20. public audio/A-B/Tools smoke passes.

After this gate, stop. Do not begin Standard AutoEQ / Plan 2 until explicitly authorized.
