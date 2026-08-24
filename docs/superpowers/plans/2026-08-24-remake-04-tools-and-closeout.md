# Remake 04 — Tools, Audio, Compare A/B, And Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the source-first remake with local Sound Tools, Tone Generator, Music Player, Compare A/B, and a focused Analysis section, then remove transitional/obsolete UI and close the remake with mobile/desktop Light/Dark public verification before Plan 2 resumes.

**Architecture:** Browser audio is encapsulated behind a lifecycle-safe TypeScript Web Audio engine. The primary Tone Generator interaction is adapted from pinned Squiglink Lab. The pinned Lab snapshot does not provide a reusable Music Player/Compare A/B implementation, so those two approved features use an explicitly recorded additional MIT-licensed source reference from `potatosalad775/modernGraphTool` at commit `7e9481e44100c0bb80d74e80756529239525950d`. Zustand remains canonical application/compare state; `packages/core` still owns DSP/filter/preamp calculations.

**Tech Stack:** React 19, TypeScript 6, Zustand 5, Web Audio API, Vitest/jsdom with mocked AudioContext, Testing Library, Squiglink Lab 0BSD reference, modernGraphTool MIT reference.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Remake 03 must be complete and publicly green before starting.
- Do not vendor or copy the full modernGraphTool repository. Record exact source/revision/license, then adapt only the approved Music Player/Compare A/B concepts/files.
- Keep the MIT copyright/permission notice for modernGraphTool in repository third-party provenance because adapted substantial portions require it.
- Do not present modernGraphTool as `squiglink/lab`; it is an additional related open-source reference used only where the pinned Lab snapshot lacks the approved feature.
- Audio must remain fully local. User-selected audio is decoded in the browser and never uploaded, fetched, persisted to a server, or committed as a fixture.
- Tests use mocks/synthetic buffers only; no real music files or private audio.
- Web Audio must start only after a user gesture, stop/disconnect nodes on stop/destroy, and cancel timers/RAF callbacks.
- Audio EQ uses canonical Workbench filters plus the current core-derived preamp. Do not port legacy Squiglink biquad math as domain authority.
- Compare A/B states are explicit, session-scoped EQ snapshots; applying a side is deterministic, visible in canonical workspace state, and undoable.
- Analysis keeps only MAE, RMSE, max absolute error, max-error frequency, and preamp.
- `Details` must disappear as a tab/component; filter counts/state/provenance remain in Equalizer context.
- No AutoEQ engine work in this plan. AutoEQ button remains inert at closeout.
- Public Pages remains the continuous preview from `remake/squiglink-base`.

---

### Task 1: Record the additional Music Player/Compare source and MIT notice

**Files:**
- Create: `vendor/references/modernGraphTool/UPSTREAM.md`
- Create: `vendor/references/modernGraphTool/LICENSE`
- Create or Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces: provenance only; no runtime import path.

- [ ] **Step 1: Record the exact additional source revision**

Create `vendor/references/modernGraphTool/UPSTREAM.md`:

```markdown
# modernGraphTool additional source reference

- Repository: https://github.com/potatosalad775/modernGraphTool
- Commit: `7e9481e44100c0bb80d74e80756529239525950d`
- Reference date: 2026-08-24
- License: MIT (`LICENSE` in this directory)

Approved reference files/concepts for the AutoEQ Workbench remake:

- `src/lib/services/audio-player-service.svelte.ts` — local Web Audio file/tone playback, EQ-chain lifecycle, seek/stop cleanup.
- `src/lib/components/equalizer/EqAudioPlayer.svelte` — player interaction composition.
- `src/lib/stores/eq-history-store.svelte.ts` — bounded session EQ snapshots and A/B selection.
- `src/lib/components/equalizer/EqHistoryAndCompare.svelte` — A/B/history interaction.
- `src/lib/services/eq-commands.ts` — undoable snapshot-apply pattern.

This is an additional related open-source reference, not the pinned `squiglink/lab` snapshot. Runtime code must not import this directory.
```

- [ ] **Step 2: Copy the exact MIT license text from the pinned source revision**

`vendor/references/modernGraphTool/LICENSE` must contain the MIT license including:

```text
MIT License

Copyright (c) 2026 potatosalad775
```

and the complete permission/warranty text from the source license.

- [ ] **Step 3: Add a concise repository third-party notice**

`THIRD_PARTY_NOTICES.md` must distinguish:

```text
Squiglink Lab — 0BSD — source snapshot in vendor/squiglink
modernGraphTool — MIT — selected Music Player/Compare A/B implementation concepts adapted; exact reference in vendor/references/modernGraphTool
```

Do not add attribution claims not present in the source licenses.

- [ ] **Step 4: Verify there is no runtime import from either vendor reference**

```bash
if git grep -n "vendor/squiglink\|vendor/references/modernGraphTool" -- apps packages ':!docs/**'; then
  echo "Runtime vendor/reference import is forbidden" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 5: Commit provenance separately**

```bash
git add vendor/references/modernGraphTool THIRD_PARTY_NOTICES.md
git diff --cached --check
git commit -m "docs: record audio tools source provenance"
```

### Task 2: Add an undoable workspace snapshot-apply action for Compare A/B

**Files:**
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/workspaceStore.test.ts`

**Interfaces:**

```ts
export interface FilterSnapshotState {
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
}

export interface WorkspaceState {
  // existing fields...
  applyFilterSnapshot(snapshot: FilterSnapshotState): void
}
```

- [ ] **Step 1: Write failing snapshot-apply tests**

Start with state A, edit to state B, then call `applyFilterSnapshot(stateA)` and assert:

```text
filters restored exactly
filterProvenance restored exactly
solutionState restored exactly
selectedFilterId becomes null
one undo() restores state B
one redo() reapplies state A
invalid snapshot (>64/invalid filter/duplicate ids) leaves state unchanged
```

- [ ] **Step 2: Run the test and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement with the existing single-record history boundary**

Validate the full snapshot with the same filter rules as `setFilters`, deep-copy filters, call `record()` once, clear `selectedFilterId`, and restore provenance/solution state from the snapshot. Do not recalculate or store a mutable preamp: preamp remains derived from filters.

- [ ] **Step 4: Run targeted tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/state/workspaceStore.ts apps/web/src/state/workspaceStore.test.ts
git commit -m "feat(web): add undoable EQ snapshot apply"
```

### Task 3: Add a bounded session Compare A/B store adapted from modernGraphTool

**Files:**
- Create: `apps/web/src/state/eqCompareStore.ts`
- Create: `apps/web/src/state/eqCompareStore.test.ts`
- Create: `apps/web/src/state/initializeEqCompareRecorder.ts`
- Create: `apps/web/src/state/initializeEqCompareRecorder.test.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**

```ts
export interface EqSnapshot {
  id: string
  timestamp: number
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
  preampDb: number
  summary: string
}

export interface EqCompareState {
  snapshots: EqSnapshot[]
  aSnapshotId: string | null
  bSnapshotId: string | null
  record(snapshot: Omit<EqSnapshot, 'id' | 'timestamp' | 'summary'>): void
  flush(): void
  cancelPending(): void
  suppressNext(): void
  setA(id: string | null): void
  setB(id: string | null): void
  clear(): void
}

export function initializeEqCompareRecorder(): () => void
```

Use source timings/cap:

```ts
const RECORD_DEBOUNCE_MS = 500
const RECORD_MIN_GAP_MS = 1000
const SNAPSHOT_CAP = 100
```

- [ ] **Step 1: Write compare-store tests before implementation**

With fake timers, assert:

```text
record is debounced by 500 ms
commits <1000 ms apart coalesce/replace the newest entry
identical state is not duplicated
cap is 100 newest snapshots
A/B ids must refer to existing snapshots or null
trimming a selected snapshot clears its slot
suppressNext skips exactly one record
clear cancels pending capture and clears A/B
snapshot filters are deep copies
```

Summary example should be deterministic and useful:

```text
PK 1k Hz +2.0 dB +3, preamp -3.1 dB
no bands, preamp 0.0 dB
```

- [ ] **Step 2: Write recorder integration tests**

Initialize against the canonical `workspaceStore`. Change filters and advance fake timers; assert one compare snapshot is captured with current `filterProvenance`, `solutionState`, and preamp produced by `calculatePreampDb(filters, MVP_NUMERIC_POLICY.sampleRateHz)`.

Changing only `selectedFilterId`, active dock tab, theme, or curve visibility must not record an EQ snapshot.

Calling the cleanup function must unsubscribe and cancel pending timers.

- [ ] **Step 3: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/eqCompareStore.test.ts src/state/initializeEqCompareRecorder.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the bounded store/recorder**

Adapt the snapshot-copy/debounce/coalesce/cap logic from the recorded MIT source, replacing Svelte state with Zustand vanilla state and Workbench `Filter`/provenance/solution types.

The recorder subscribes only to the filter list/provenance/solution fields. It calls the existing core preamp API; it must not duplicate preamp math.

- [ ] **Step 5: Initialize the recorder once at application lifetime**

In `App.tsx`, install it in a mount-only effect and return cleanup:

```tsx
useEffect(() => initializeEqCompareRecorder(), [])
```

No recorder state belongs in React local state.

- [ ] **Step 6: Run targeted tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/eqCompareStore.test.ts src/state/initializeEqCompareRecorder.test.ts src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/state apps/web/src/App.tsx
git commit -m "feat(web): add EQ compare snapshots"
```

### Task 4: Port a lifecycle-safe local Web Audio engine

**Files:**
- Create: `apps/web/src/squiglink/sound-tools/audioEngine.ts`
- Create: `apps/web/src/squiglink/sound-tools/audioEngine.test.ts`

**Interfaces:**

```ts
export type AudioSourceKind = 'tone' | 'file'

export interface AudioEngineState {
  source: AudioSourceKind
  isPlaying: boolean
  fileLoaded: boolean
  currentTime: number
  duration: number
  volume: number
  toneFrequencyHz: number
  eqEnabled: boolean
}

export interface AudioEngineEqState {
  filters: readonly Filter[]
  preampDb: number
}

export interface AudioEngine {
  getState(): AudioEngineState
  setSource(source: AudioSourceKind): void
  loadFile(file: File): Promise<void>
  setVolume(linear: number): void
  setToneFrequency(frequencyHz: number): void
  setEqEnabled(enabled: boolean): void
  updateEq(eq: AudioEngineEqState): void
  play(): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): void
  destroy(): void
}

export function createAudioEngine(
  onStateChange: (state: AudioEngineState) => void,
  createContext?: () => AudioContext,
): AudioEngine
```

- [ ] **Step 1: Build a small fake AudioContext for unit tests**

Mock only APIs the engine uses:

```text
createGain
createBiquadFilter
createOscillator
createBufferSource
decodeAudioData
resume
currentTime
destination
```

Mock nodes with `connect`, `disconnect`, `start`, `stop` spies and mutable AudioParam-like `{ value }` members.

- [ ] **Step 2: Write failing tone tests**

Assert:

```text
play() resumes/creates context only after call
source tone creates a sine oscillator
20 <= toneFrequencyHz <= 20000
tone frequency updates live while playing
pause/stop stop and disconnect oscillator
destroy is idempotent and disconnects active nodes
```

- [ ] **Step 3: Write failing file-player tests**

Create a synthetic `File` and mock `decodeAudioData`. Assert:

```text
loadFile calls file.arrayBuffer + decodeAudioData
no fetch/XMLHttpRequest is used
fileLoaded/duration state updates
play creates AudioBufferSourceNode
pause stores local position
seek recreates source at requested offset when playing
stop resets currentTime to 0
```

- [ ] **Step 4: Write failing EQ-chain tests**

Call `updateEq` with enabled PK/LS/HS filters plus derived preamp and assert Web Audio node mapping:

```text
PK -> peaking
LS -> lowshelf
HS -> highshelf
frequency/Q/gain copied from canonical filters
preamp gain = 10 ** (preampDb / 20)
disabled filters create no BiquadFilterNode
```

With `eqEnabled=false`, the source bypasses the preamp/filter chain. Toggling EQ while playing rebuilds downstream nodes without restarting the file/tone source and disconnects the replaced filter nodes.

- [ ] **Step 5: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/sound-tools/audioEngine.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Implement the engine by adapting source lifecycle patterns, not Svelte state**

Use the modernGraphTool source for AudioContext/file/seek/filter-chain lifecycle and the Squiglink Tone Generator for frequency-range interaction. Replace source stores with explicit methods/state callbacks.

Keep one context per engine instance. Always disconnect old filter nodes before rebuilding. Use `requestAnimationFrame` only for file playback time reporting; cancel it on pause/stop/destroy.

Clamp:

```ts
volume: 0..1
toneFrequencyHz: 20..20_000
seek: 0..duration
```

- [ ] **Step 7: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/sound-tools/audioEngine.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/squiglink/sound-tools
git commit -m "feat(web): add local Web Audio engine"
```

### Task 5: Build Sound Tools UI with Tone Generator and Music Player

**Files:**
- Create: `apps/web/src/features/tools/SoundTools.tsx`
- Create: `apps/web/src/features/tools/SoundTools.test.tsx`
- Create: `apps/web/src/features/tools/ToneGenerator.tsx`
- Create: `apps/web/src/features/tools/ToneGenerator.test.tsx`
- Create: `apps/web/src/features/tools/MusicPlayer.tsx`
- Create: `apps/web/src/features/tools/MusicPlayer.test.tsx`

**Interfaces:**
- Consumes: `createAudioEngine`, canonical `workspaceStore.filters`, `deriveWorkspace(...).preamp`, no network resources.
- Produces: source-derived local playback controls.

- [ ] **Step 1: Write Tone Generator interaction tests**

Assert the UI exposes a source-derived frequency-range control and:

```text
frequency slider maps logarithmically across 20-20000 Hz
frequency text updates
Play calls engine.setSource('tone') then engine.play()
Stop calls engine.stop()
component unmount stops/destroys owned audio engine when SoundTools owns the instance
```

Use this log mapping:

```ts
function sliderToFrequency(t: number): number {
  return 20 * Math.pow(20_000 / 20, t)
}
```

where `t` is clamped 0..1.

- [ ] **Step 2: Write Music Player tests**

Assert:

```text
local audio file input exists
selecting a file calls engine.loadFile(file)
Play/Pause/Stop work
seek control is disabled until a file is loaded
volume control calls setVolume
EQ Effect toggle calls setEqEnabled
no upload/fetch UI exists
```

- [ ] **Step 3: Write SoundTools EQ-sync tests**

When canonical filters/preamp change, call:

```ts
engine.updateEq({ filters, preampDb })
```

without recreating the engine. A/B snapshot application must therefore change live audio EQ automatically through the same canonical-state path.

- [ ] **Step 4: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/ToneGenerator.test.tsx src/features/tools/MusicPlayer.test.tsx src/features/tools/SoundTools.test.tsx
```

Expected: FAIL.

- [ ] **Step 5: Implement a single engine instance shared by Tone/Music controls**

`SoundTools` owns the engine for its mounted lifetime and passes it to child controls. Switching source stops the previous source first. Do not create one AudioContext per child.

Use Squiglink-derived control density/section hierarchy and Workbench theme variables; do not import modernGraphTool visual styling.

- [ ] **Step 6: Run targeted tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/ToneGenerator.test.tsx src/features/tools/MusicPlayer.test.tsx src/features/tools/SoundTools.test.tsx src/squiglink/sound-tools/audioEngine.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/tools
git commit -m "feat(web): add Sound Tools player and tone generator"
```

### Task 6: Build Compare A/B UI and deterministic snapshot application

**Files:**
- Create: `apps/web/src/features/tools/EqCompare.tsx`
- Create: `apps/web/src/features/tools/EqCompare.test.tsx`
- Modify: `apps/web/src/state/eqCompareStore.ts`
- Modify: `apps/web/src/state/eqCompareStore.test.ts`

**Interfaces:**
- Consumes: compare snapshot store plus `workspaceStore.applyFilterSnapshot`.
- Produces: A/B assignment/application and bounded history list.

- [ ] **Step 1: Write failing UI tests from the recorded source interaction**

With three snapshots in the compare store, assert:

```text
newest-first history list
Set A / Set B buttons per snapshot
A and B header apply buttons
Clear action
active A/B styling reflects whether canonical workspace matches that snapshot
```

- [ ] **Step 2: Write apply behavior tests**

On A click:

1. call `eqCompareStore.suppressNext()`;
2. call `workspaceStore.applyFilterSnapshot()` with the chosen snapshot's filters/provenance/solution state;
3. assert canonical filters exactly match A;
4. assert one workspace undo restores the pre-click state;
5. assert compare history did not immediately duplicate the applied snapshot.

Repeat for B and assert switching A -> B -> A is deterministic.

- [ ] **Step 3: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/EqCompare.test.tsx src/state/eqCompareStore.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the source-derived history/A-B composition**

Adapt the modernGraphTool A/B header + history semantics into React/Workbench styling. Keep snapshots session-only; do not persist them to localStorage or URL.

Define a pure matcher:

```ts
export function snapshotMatchesWorkspace(
  snapshot: EqSnapshot,
  workspace: Pick<WorkspaceState, 'filters' | 'filterProvenance' | 'solutionState'>,
): boolean
```

Compare every filter field and ordered filter list, plus provenance/solution state. Ignore selected filter and derived preamp for equality because preamp follows filters deterministically.

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/EqCompare.test.tsx src/state/eqCompareStore.test.ts src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/tools/EqCompare.tsx apps/web/src/features/tools/EqCompare.test.tsx apps/web/src/state/eqCompareStore.ts apps/web/src/state/eqCompareStore.test.ts
git commit -m "feat(web): add EQ Compare A B"
```

### Task 7: Replace interim Details/Analysis composition with final Tools tab

**Files:**
- Create: `apps/web/src/features/tools/AnalysisSection.tsx`
- Create: `apps/web/src/features/tools/AnalysisSection.test.tsx`
- Create: `apps/web/src/features/tools/ToolsTab.tsx`
- Create: `apps/web/src/features/tools/ToolsTab.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx` if needed to avoid duplicated heading/status composition
- Delete: `apps/web/src/features/tools/ToolsInterim.tsx`
- Delete: `apps/web/src/features/tools/ToolsInterim.test.tsx`
- Delete: `apps/web/src/features/metrics/DetailsTab.tsx`
- Delete corresponding Details tests if present

**Interfaces:**
- Produces final conceptual order:

```text
Tools
  Sound Tools
    Tone Generator
    Music Player
  Compare A/B
  Analysis
```

- [ ] **Step 1: Write final Tools composition tests**

Assert `ToolsTab` contains Sound Tools, Compare A/B, and Analysis in that order. Analysis must expose exactly these metric labels:

```text
MAE
RMSE
Max absolute error
Max-error frequency
Preamp
```

Assert it does not render:

```text
Active filters
Total filters
Solution state
Provenance
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools src/App.test.tsx
```

Expected: FAIL while interim Tools/Details files remain.

- [ ] **Step 3: Implement final Tools and secondary/collapsible Analysis**

Keep Analysis visually subordinate. A native `<details>` with `summary="Analysis"` is acceptable and accessible; default may be closed. Sound Tools and Compare A/B remain immediately visible.

Reuse metric calculation/output from `WorkspaceDerived`; do not recalculate MAE/RMSE/preamp in Tools.

- [ ] **Step 4: Switch App to final Tools and remove obsolete Details/interim components**

Before delete:

```bash
git grep -n "DetailsTab\|ToolsInterim" -- apps/web/src
```

After App migration, only obsolete files/tests should match; delete them and rerun tests.

- [ ] **Step 5: Run targeted tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools src/features/metrics src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
git add -A apps/web/src
git commit -m "feat(web): complete Tools workspace"
```

### Task 8: Source-first visual/responsive closeout and dead-code audit

**Files:**
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/squiglink/styles/workbench-theme.css`
- Modify: relevant `apps/web/src/features/**` only for verified layout/accessibility defects
- Modify: `AGENTS.md` to list the approved remake spec/plans as active references
- Modify: `README.md` only if current feature/status text is now materially inaccurate; do not add stack/UI trivia

**Interfaces:**
- Produces: finished remake baseline ready for Plan 2.

- [ ] **Step 1: Audit obsolete pre-remake components/styles**

Search:

```bash
git grep -n "Details\|UtilityRail\|CurveAppearanceControls\|graphGeometry" -- apps/web/src
```

Remove dead files/selectors/imports only when no current behavior/test depends on them. Do not perform unrelated cleanup.

- [ ] **Step 2: Audit source exclusions**

Search built/runtime source for disallowed ecosystem pieces:

```bash
git grep -ni "patreon\|premium\|advert\|analytics\|brands\|models" -- apps/web/src
```

Review every match. Generic words in test descriptions are fine; hosted Squiglink database/ad/analytics behavior is not.

- [ ] **Step 3: Update active repository guidance**

Add to `AGENTS.md` Approved References:

```text
Squiglink source-first remake design: docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md
Remake plans 01-04: docs/superpowers/plans/2026-08-24-remake-*.md
```

State that Remake 01-04 gates supersede the old visual UI implementation where they conflict, while Plan 2 remains the future AutoEQ engine authority.

- [ ] **Step 4: Run a deliberate viewport/theme matrix locally**

Use at least:

```text
390x844 Light
390x844 Dark
768x1024 Light
1280x800 Light
1280x800 Dark
```

At each viewport verify:

```text
wordmark/header follows source hierarchy
D3 graph remains primary and does not overflow
source toolbar wraps/collapses without hiding required controls
Curves rows remain operable
equalizer filter rows remain editable at 64-row scale
Tools controls fit without horizontal document overflow
local file chooser/player controls remain reachable
A/B history scrolls inside its section
Analysis does not dominate Tools
```

- [ ] **Step 5: Fix only observed parity/responsive/accessibility defects**

Prefer adapting source media queries and existing source-derived selectors. Keep one shared layout for themes; do not fork a separate mobile app or theme-specific markup.

- [ ] **Step 6: Commit closeout changes**

```bash
git add apps/web/src AGENTS.md README.md THIRD_PARTY_NOTICES.md
git diff --cached --check
git commit -m "fix(web): close source-first remake parity"
```

If README did not require a change, omit it from `git add`.

### Task 9: Final remake verification and public acceptance gate

**Files:**
- Modify only to fix failures directly attributable to Remake 01-04.

**Interfaces:**
- Produces: the stable remake baseline after which Plan 2 may resume.

- [ ] **Step 1: Run all repository checks**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm --filter @autoeq-workbench/web build:pages
git diff --check
```

Expected: all exit 0.

- [ ] **Step 2: Run runtime provenance/dependency audits**

```bash
if git grep -n "vendor/squiglink\|vendor/references/modernGraphTool" -- apps packages ':!docs/**'; then
  echo "Runtime vendor import/reference detected" >&2
  exit 1
fi
if grep -R "d3js.org\|cdnjs.cloudflare.com.*d3\|github.com/squiglink\|github.com/potatosalad775" apps/web/dist; then
  echo "Unexpected production remote source dependency" >&2
  exit 1
fi
```

Expected: no production-source dependency matches.

- [ ] **Step 3: Audit the AutoEQ boundary one last time**

```bash
if git grep -n "search_candidates\|OptimizeDeltas\|Equalizer\.autoeq\|function autoeq" -- apps packages ':!docs/**'; then
  echo "Legacy AutoEQ runtime detected" >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 4: Public end-to-end smoke on deployed origin**

After pushing the final SHA and waiting for successful CI + Pages, verify at `https://jssantogit.github.io/autoeq-workbench/`:

```text
Light/Dark
FR and Target local import
multiple curve manager operations
D3 graph zoom/smooth/inspect/label/screenshot/recolor
baseline/offset display-only behavior
manual PK/LSQ/HSQ EQ
preamp and FR EQ update
PEQ import/export
GraphicEQ export
AutoEQ button visible but inert
Tone Generator plays/stops
local Music Player loads/plays/pauses/seeks/stops
EQ Effect toggle changes local playback chain
Compare history captures edits
A/B apply is deterministic and undoable
Analysis shows only approved metrics
mobile/desktop layout has no document-level horizontal overflow
page refresh at project root succeeds
```

Browser audio checks must be performed from explicit user gestures; do not treat autoplay blocking as an engine failure.

- [ ] **Step 5: Verify final Pages SHA equals final green CI SHA**

Record:

```text
final branch commit SHA
CI run ID/status
Pages run ID/status
Pages deployed head_sha
public URL
```

Do not report completion if the public environment is serving an older SHA.

- [ ] **Step 6: Review branch scope against main**

```bash
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Review for secrets, private paths/data, accidental generated audio, source-license omissions, unrelated refactors, and legacy duplicated DSP.

## Completion Gate

The source-first remake is complete only when:

1. the entire user-facing shell/graph/toolbar/Curves/Equalizer/Tools composition is source-derived and uses the Workbench wordmark/palette;
2. Light/Dark work with Light default and shared responsive markup;
3. `packages/core` remains DSP/parsing/export authority and Zustand remains canonical app state;
4. D3 is lifecycle-encapsulated and graph semantics remain FR/Target/active full-cascade FR EQ only;
5. manual EQ, PEQ import/export, GraphicEQ, and dense-grid preamp all use current Workbench contracts;
6. Tone Generator and local Music Player operate entirely in-browser with cleanup and no upload/network path;
7. Compare A/B uses bounded session snapshots, applies canonical states deterministically, and is undoable;
8. Analysis contains only MAE, RMSE, max error, max-error frequency, and preamp;
9. old Details/UtilityRail/custom graph transitional code is removed where superseded;
10. source provenance is complete for Squiglink Lab 0BSD and modernGraphTool MIT adaptations;
11. no runtime imports from vendor/reference trees, no D3 CDN, and no remote source dependency exist;
12. no legacy Squiglink AutoEQ optimizer exists in runtime;
13. full repository checks pass;
14. public mobile/desktop Light/Dark/audio functional smoke passes on the final deployed SHA;
15. Pages is confirmed to serve that exact green SHA.

After this gate, stop. Do not begin Standard AutoEQ implementation automatically. Report the completed remake evidence and wait for explicit approval to resume Plan 2 and connect the inert AutoEQ UI to the Workbench engine.
