# Remake 04 — Tools, Audio, Compare A/B, and Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the final Tools workspace with one shared local Web Audio engine, Tone Generator, local Music Player, deterministic undoable Compare A/B, secondary Analysis, and complete the source-first remake closeout without starting AutoEQ Plan 2.

**Architecture:** `packages/core` remains DSP/preamp/metrics authority and `workspaceStore` remains canonical EQ state. `SoundTools` owns one lifecycle-safe browser audio engine shared by tone and file playback; Compare A/B stores bounded session snapshots in Zustand and applies them atomically back to canonical workspace state so live audio follows through the same state path.

**Tech Stack:** React 19, TypeScript, Zustand, Web Audio API, Vitest/jsdom, Testing Library, Squiglink Lab 0BSD reference, modernGraphTool MIT complementary reference.

**Spec:** `docs/superpowers/specs/2026-08-25-remake-04-tools-and-closeout-design.md`

## Global Constraints

- Synchronize `remake/squiglink-base` with remote and confirm a clean worktree before edits.
- The spec above is the behavior/source-of-truth document; this plan is the implementation map.
- Preserve the approved Remake 03.5 shell, graph, toolbar, Curves, Equalizer, Light/Dark, graph semantics, and responsive behavior.
- `packages/core` remains DSP/filter/preamp/metrics authority.
- Zustand remains canonical workspace/UI state.
- Squiglink remains the primary visual/interaction source.
- `modernGraphTool` is allowed only as the recorded MIT complementary source for Music Player lifecycle and Compare A/B/history concepts.
- Do not import runtime code from `vendor/**`.
- Audio is local-only: no upload, fetch/XHR path for selected audio, backend persistence, or real/private audio fixtures.
- One shared audio engine/context serves Tone Generator and Music Player.
- `EQ Effect` is playback-only and must never mutate canonical workspace state.
- Compare A/B is session-only, bounded, deterministic, and undoable.
- Analysis shows only MAE, RMSE, Max absolute error, Max-error frequency, and Preamp.
- AutoEQ remains visible and inert. Do not start Standard AutoEQ / Plan 2.
- Avoid unrelated refactors.

---

### Task 1: Record modernGraphTool provenance

**Files:**
- Create: `vendor/references/modernGraphTool/UPSTREAM.md`
- Create: `vendor/references/modernGraphTool/LICENSE`
- Create or Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: approved source revision from the spec.
- Produces: exact complementary source/license record; no runtime API.

- [ ] **Step 1: Confirm exact source revision and license text**

Use the approved revision:

```text
repository: https://github.com/potatosalad775/modernGraphTool
commit: 7e9481e44100c0bb80d74e80756529239525950d
license: MIT
```

Record only the files/concepts actually adapted for audio-player lifecycle and Compare A/B/history.

- [ ] **Step 2: Add provenance files**

`UPSTREAM.md` must record repository, exact commit, license, reference date, and approved concept/file scope. `LICENSE` must contain the exact MIT license text from the pinned source revision.

- [ ] **Step 3: Update third-party notices**

Keep Squiglink 0BSD and modernGraphTool MIT clearly separate. Do not imply modernGraphTool is part of the vendored Squiglink snapshot.

- [ ] **Step 4: Verify runtime isolation**

Run:

```bash
if git grep -n "vendor/squiglink\|vendor/references/modernGraphTool" -- apps packages ':!docs/**'; then
  echo "Runtime vendor/reference import is forbidden" >&2
  exit 1
fi
```

Expected: no runtime matches.

- [ ] **Step 5: Commit provenance**

```bash
git add vendor/references/modernGraphTool THIRD_PARTY_NOTICES.md
git diff --cached --check
git commit -m "docs: record audio tools source provenance"
```

---

### Task 2: Add atomic undoable EQ snapshot application

**Files:**
- Modify: `apps/web/src/state/workspaceStore.ts`
- Modify: `apps/web/src/state/workspaceStore.test.ts`

**Interfaces:**
- Consumes: canonical `Filter[]`, filter provenance, solution state, existing history boundary.
- Produces: `applyFilterSnapshot(snapshot)` for Compare A/B.

Use an explicit snapshot shape equivalent to:

```ts
export interface FilterSnapshotState {
  filters: Filter[]
  filterProvenance: FilterProvenance | null
  solutionState: SolutionState
}
```

- [ ] **Step 1: Write failing tests**

Cover:

```text
valid snapshot restores ordered filters exactly
provenance and solution state restore exactly
selectedFilterId is cleared
one undo restores the complete pre-apply state
redo reapplies the snapshot
invalid filter data leaves the workspace unchanged
duplicate filter ids leave the workspace unchanged
over-limit filter count leaves the workspace unchanged
input arrays are not retained by reference
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
```

Expected: new snapshot-apply tests fail before implementation.

- [ ] **Step 3: Implement the minimal atomic action**

Reuse the same validation rules/bounds as canonical filter replacement. Deep-copy filters, call the existing workspace history recorder exactly once, apply filters/provenance/solution atomically, and clear stale filter selection. Do not store preamp in canonical mutable state.

- [ ] **Step 4: Re-run tests and typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/workspaceStore.ts apps/web/src/state/workspaceStore.test.ts
git commit -m "feat(web): add undoable EQ snapshot apply"
```

---

### Task 3: Add bounded Compare A/B store and recorder

**Files:**
- Create: `apps/web/src/state/eqCompareStore.ts`
- Create: `apps/web/src/state/eqCompareStore.test.ts`
- Create: `apps/web/src/state/initializeEqCompareRecorder.ts`
- Create: `apps/web/src/state/initializeEqCompareRecorder.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx` if recorder lifetime needs coverage there.

**Interfaces:**
- Consumes: canonical workspace filters/provenance/solution and core-derived preamp.
- Produces: bounded `EqSnapshot[]`, A/B selection, recorder lifecycle, one-shot suppression.

Use a snapshot shape equivalent to:

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
```

Retain the approved bounds unless implementation evidence requires a smaller equivalent:

```ts
const RECORD_DEBOUNCE_MS = 500
const RECORD_MIN_GAP_MS = 1000
const SNAPSHOT_CAP = 100
```

- [ ] **Step 1: Write failing store tests**

With fake timers, cover:

```text
500 ms debounce
<1000 ms commits coalesce/replace newest appropriately
identical canonical EQ state is not duplicated
100 newest snapshots are retained
filters are deep copies
A/B ids must be existing ids or null
trimming a selected snapshot clears that slot
suppressNext skips exactly one automatic record
clear cancels pending work and clears snapshots/A/B
```

- [ ] **Step 2: Write failing recorder tests**

Subscribe only to meaningful canonical EQ fields. Assert that filter/provenance/solution changes record; changes to selected filter, tab, theme, curve visibility/color, graph controls, or playback-only EQ Effect do not record.

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/eqCompareStore.test.ts src/state/initializeEqCompareRecorder.test.ts
```

- [ ] **Step 4: Implement store and recorder**

Adapt bounded history/debounce/coalescing concepts from the recorded MIT source into Zustand vanilla state. Call existing core preamp calculation/derived state; do not duplicate preamp math.

Initialize the recorder once for application lifetime and return cleanup. Cleanup must unsubscribe and cancel pending timers.

- [ ] **Step 5: Run focused tests/typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/state/eqCompareStore.test.ts src/state/initializeEqCompareRecorder.test.ts src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/state apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): add EQ compare snapshots"
```

---

### Task 4: Implement the shared lifecycle-safe Web Audio engine

**Files:**
- Create: `apps/web/src/squiglink/sound-tools/audioEngine.ts`
- Create: `apps/web/src/squiglink/sound-tools/audioEngine.test.ts`

**Interfaces:**
- Consumes: canonical enabled `Filter[]` and current core-derived `preampDb`.
- Produces: one imperative engine used by both tone and file playback.

The interface must support the equivalent of:

```ts
export interface AudioEngineEqState {
  filters: readonly Filter[]
  preampDb: number
}

export interface AudioEngine {
  getState(): AudioEngineState
  setSource(source: 'tone' | 'file'): void
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
```

- [ ] **Step 1: Build the minimal fake AudioContext in tests**

Mock only what production uses: gain, biquad, oscillator, buffer source, decode, resume, currentTime, destination, connect/disconnect/start/stop, and mutable AudioParam-like values.

- [ ] **Step 2: Write failing tone lifecycle tests**

Cover context creation only on play, sine oscillator, 20..20000 Hz clamp, live frequency update, stop/disconnect, source replacement, and idempotent destroy.

- [ ] **Step 3: Write failing file lifecycle tests**

Use synthetic `File`/mocked decode only. Cover `arrayBuffer()`, `decodeAudioData`, duration, play/pause position, seek, stop->0, and absence of network APIs.

- [ ] **Step 4: Write failing EQ-chain tests**

Assert mapping:

```text
PK -> peaking
LS -> lowshelf
HS -> highshelf
```

Assert disabled filters create no biquad, frequency/gain/Q are copied, and preamp gain uses:

```ts
10 ** (preampDb / 20)
```

Assert EQ bypass does not mutate canonical state and replaced filter nodes are disconnected.

- [ ] **Step 5: Run focused tests and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/sound-tools/audioEngine.test.ts
```

- [ ] **Step 6: Implement engine**

Use one context per engine instance. `AudioContext` creation/resume must only happen after explicit playback request. Tone/file source switching stops the previous source. File progress RAF/timers are cancelled on pause/stop/destroy. `destroy()` must be safe repeatedly and late async decode/state callbacks must not revive a destroyed engine.

- [ ] **Step 7: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/squiglink/sound-tools/audioEngine.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/squiglink/sound-tools
git commit -m "feat(web): add local Web Audio engine"
```

---

### Task 5: Build Sound Tools, Tone Generator, and Music Player

**Files:**
- Create: `apps/web/src/features/tools/SoundTools.tsx`
- Create: `apps/web/src/features/tools/SoundTools.test.tsx`
- Create: `apps/web/src/features/tools/ToneGenerator.tsx`
- Create: `apps/web/src/features/tools/ToneGenerator.test.tsx`
- Create: `apps/web/src/features/tools/MusicPlayer.tsx`
- Create: `apps/web/src/features/tools/MusicPlayer.test.tsx`

**Interfaces:**
- Consumes: shared audio engine, canonical filters, current derived preamp.
- Produces: source-derived local playback UI.

- [ ] **Step 1: Write failing Tone Generator tests**

Cover logarithmic frequency mapping across 20..20000 Hz, visible numeric frequency, Play/Stop, volume, live frequency update, and switching to tone stops a file source first.

Use:

```ts
function sliderToFrequency(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 20 * Math.pow(20_000 / 20, clamped)
}
```

- [ ] **Step 2: Write failing Music Player tests**

Cover local file input, `loadFile(file)`, Play/Pause/Stop, disabled seek before load, seek after load, volume, EQ Effect, local decode error state, and absence of upload/network UI.

- [ ] **Step 3: Write failing shared-engine/EQ-sync tests**

Assert `SoundTools` creates one engine for its mounted lifetime, passes the same engine to tone/player controls, calls `engine.updateEq({ filters, preampDb })` when canonical EQ changes, and destroys it on unmount.

- [ ] **Step 4: Run focused tests and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/ToneGenerator.test.tsx src/features/tools/MusicPlayer.test.tsx src/features/tools/SoundTools.test.tsx
```

- [ ] **Step 5: Implement source-shaped UI**

Use Squiglink-derived control density/hierarchy and Workbench theme tokens. Do not copy modernGraphTool visual styling. `EQ Effect` modifies only engine playback state. No second AudioContext or child-owned engine.

- [ ] **Step 6: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/ToneGenerator.test.tsx src/features/tools/MusicPlayer.test.tsx src/features/tools/SoundTools.test.tsx src/squiglink/sound-tools/audioEngine.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/tools
git commit -m "feat(web): add Sound Tools player and tone generator"
```

---

### Task 6: Build Compare A/B UI and deterministic application

**Files:**
- Create: `apps/web/src/features/tools/EqCompare.tsx`
- Create: `apps/web/src/features/tools/EqCompare.test.tsx`
- Modify: `apps/web/src/state/eqCompareStore.ts`
- Modify: `apps/web/src/state/eqCompareStore.test.ts`

**Interfaces:**
- Consumes: compare snapshots and `workspaceStore.applyFilterSnapshot`.
- Produces: A/B assignment, Apply A/B, Clear, current-state matching.

- [ ] **Step 1: Write failing UI tests**

Cover newest-first history, Set A/Set B per snapshot, visible A/B assignment, Apply A/Apply B controls, Clear, bounded internal scrolling semantics, and mobile-usable labels/controls.

- [ ] **Step 2: Write failing deterministic apply tests**

Applying A/B must execute this semantic sequence:

```ts
eqCompareStore.getState().suppressNext()
workspaceStore.getState().applyFilterSnapshot(snapshot)
```

Then assert canonical state exactly matches the snapshot, one undo restores pre-click state, redo is deterministic, and no duplicate compare snapshot is immediately recorded.

- [ ] **Step 3: Add a pure equality matcher test**

Match ordered filter fields plus relevant provenance/solution state. Ignore selected filter/view-only state and derived preamp when preamp follows filters deterministically.

- [ ] **Step 4: Run tests and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/EqCompare.test.tsx src/state/eqCompareStore.test.ts src/state/workspaceStore.test.ts
```

- [ ] **Step 5: Implement the UI minimally**

Use Workbench/Squiglink visual language. Keep history session-only. A/B never talks directly to Web Audio; audio changes because canonical workspace filters changed.

- [ ] **Step 6: Run tests/typecheck and commit**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools/EqCompare.test.tsx src/state/eqCompareStore.test.ts src/state/workspaceStore.test.ts
pnpm --filter @autoeq-workbench/web typecheck
git add apps/web/src/features/tools/EqCompare.tsx apps/web/src/features/tools/EqCompare.test.tsx apps/web/src/state/eqCompareStore.ts apps/web/src/state/eqCompareStore.test.ts
git commit -m "feat(web): add EQ Compare A B"
```

---

### Task 7: Replace interim Tools with final Tools tab and secondary Analysis

**Files:**
- Create: `apps/web/src/features/tools/AnalysisSection.tsx`
- Create: `apps/web/src/features/tools/AnalysisSection.test.tsx`
- Create: `apps/web/src/features/tools/ToolsTab.tsx`
- Create: `apps/web/src/features/tools/ToolsTab.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/features/metrics/MetricsSummary.tsx` only if needed to reuse metric output cleanly.
- Delete: `apps/web/src/features/tools/ToolsInterim.tsx`
- Delete: `apps/web/src/features/tools/ToolsInterim.test.tsx`
- Delete obsolete Details components/tests only after confirming no current dependency.

**Interfaces:**
- Consumes: `SoundTools`, `EqCompare`, existing `WorkspaceDerived` metrics.
- Produces final order: Sound Tools -> Compare A/B -> Analysis.

- [ ] **Step 1: Write failing composition tests**

Assert exact section order and Analysis labels:

```text
MAE
RMSE
Max absolute error
Max-error frequency
Preamp
```

Assert Analysis does not show Active filters, Total filters, Solution state, or Provenance.

- [ ] **Step 2: Write failing Analysis behavior tests**

Analysis is secondary/collapsed by default using an accessible disclosure such as `<details>`. Values come from existing derived state; the component must not calculate MAE/RMSE/preamp independently.

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools src/App.test.tsx
```

- [ ] **Step 4: Implement final Tools composition and migrate App**

Replace `ToolsInterim` with `ToolsTab`. Remove obsolete transitional user-facing Tools/Details components only after `git grep` proves no live references remain.

- [ ] **Step 5: Run focused tests/typecheck**

```bash
pnpm --filter @autoeq-workbench/web test -- src/features/tools src/features/metrics src/App.test.tsx
pnpm --filter @autoeq-workbench/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): complete Tools workspace"
```

---

### Task 8: Perform source-first responsive/accessibility/dead-code closeout

**Files:**
- Modify: `apps/web/src/squiglink/styles/squiglink-base.css`
- Modify: `apps/web/src/squiglink/styles/workbench-theme.css`
- Modify: relevant `apps/web/src/features/**` only for observed defects.
- Modify: `AGENTS.md` if active-reference guidance is stale.
- Modify: `README.md` only if product/status text becomes materially inaccurate.

**Interfaces:**
- Consumes: completed Remake 01-04 UI.
- Produces: stable final remake baseline.

- [ ] **Step 1: Audit dead transitional code**

Run targeted searches for obsolete Details/UtilityRail/old graph/tool components. Delete only code proven unused.

- [ ] **Step 2: Audit excluded hosted ecosystem/runtime dependencies**

Review matches for ads, premium, Patreon, analytics, remote brands/models, vendor runtime imports, external D3/source dependencies, and legacy AutoEQ optimizer identifiers.

- [ ] **Step 3: Verify viewport/theme matrix**

At minimum:

```text
390x844 Light
390x844 Dark
768x1024 Light
1280x800 Light
1280x800 Dark
```

Verify graph/toolbar/Curves/Equalizer remain approved and Tools has no document-level horizontal overflow. Tone/player controls must be reachable, Compare history scroll internally, Analysis remain subordinate, and both themes share the same markup.

- [ ] **Step 4: Fix only observed defects**

Prefer existing Squiglink-derived selectors/media queries and Workbench tokens. Do not redesign already-approved 03.5 areas.

- [ ] **Step 5: Run regression suite before commit**

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
git diff --check
```

- [ ] **Step 6: Commit closeout fixes**

```bash
git add apps/web/src AGENTS.md README.md
git diff --cached --check
git commit -m "fix(web): close source-first remake parity"
```

Omit files that did not require changes.

---

### Task 9: Final repository, CI, Pages, and public acceptance gate

**Files:**
- Modify only files required to fix failures attributable to Remake 04.

**Interfaces:**
- Produces: final green remake SHA and evidence. No Plan 2 implementation.

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

- [ ] **Step 2: Run provenance/runtime audits**

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

- [ ] **Step 3: Audit AutoEQ boundary**

```bash
if git grep -n "search_candidates\|OptimizeDeltas\|Equalizer\.autoeq\|function autoeq" -- apps packages ':!docs/**'; then
  echo "Legacy AutoEQ runtime detected" >&2
  exit 1
fi
```

Expected: no legacy optimizer runtime.

- [ ] **Step 4: Push final candidate and wait for exact CI/Pages SHA**

Record final branch SHA, CI run ID/status, Pages run ID/status, Pages deployed `head_sha`, and public URL. Do not accept a Pages deployment serving an older SHA.

- [ ] **Step 5: Perform public smoke on deployed origin**

Verify with explicit user gestures where audio is involved:

```text
Light/Dark
FR + Target import
Curves operations
D3 zoom/smooth/inspect/label/screenshot/recolor
baseline/display offset
manual PK/LS/HS
preamp + derived FR EQ
PEQ import/export + GraphicEQ export
AutoEQ visible and inert
Tone Generator play/stop/frequency/volume
local Music Player load/play/pause/seek/stop/volume
EQ Effect bypass vs canonical EQ playback
Compare snapshots capture meaningful edits
A/B apply deterministic + one-step undo/redo
Analysis exact approved metrics only
mobile/desktop no document-level horizontal overflow
root refresh succeeds
```

Browser autoplay blocking without a user gesture is not an engine defect.

- [ ] **Step 6: Review final branch scope**

```bash
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Check for secrets, private paths/data, generated audio, missing license notices, runtime vendor imports, unrelated refactors, duplicated DSP, and legacy AutoEQ code.

## Completion Gate

Remake 04 is complete only when all nine tasks are accepted and the final deployed SHA satisfies the spec. At that point:

- the source-first remake is complete;
- stop implementation;
- do not begin Standard AutoEQ / Plan 2 automatically;
- report final SHA, CI, Pages, public smoke evidence, and any known non-blocking limitations;
- wait for explicit approval before Plan 2 resumes.
