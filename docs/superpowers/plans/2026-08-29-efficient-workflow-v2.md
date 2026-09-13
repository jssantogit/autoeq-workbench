# Efficient Workflow v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for this plan. The approved workflow is single-agent by default; do not use subagent-driven execution unless a genuinely independent blocker makes delegation cheaper than direct work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the approved Efficient Workflow v2 as a global OpenCode policy plus an AutoEQ-specific repository layer, using native pruning/compaction and bounded subagent behavior without changing product code.

**Architecture:** Global behavior lives in the user's OpenCode config and global `AGENTS.md`; AutoEQ-specific authority remains in the repository `AGENTS.md`. OpenCode v1.18.23 merges global `config.json`, then `opencode.json`, then `opencode.jsonc`, so later JSONC values win conflicts while non-conflicting keys survive. Native settings enforce pruning/auto-compaction and no nested subagents; behavioral limits live in global instructions. The repository layer contains only AutoEQ-specific architecture, gates, delivery safety, and source-of-truth references.

**Tech Stack:** OpenCode v1.18.23 JSON/JSONC configuration, OpenCode `AGENTS.md`, Git, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`

## Global Constraints

- Start from `remake/squiglink-base` with the docs commit that contains this revised plan.
- Preserve all pre-existing OpenCode providers, models, permissions, MCPs, plugins, agents, commands, profiles, comments, and environment safeguards unless this plan explicitly changes a key.
- Do not upgrade or migrate OpenCode as part of this plan.
- Do not print secrets, provider credentials, auth data, or full resolved configuration into logs/reports.
- Do not create a custom compaction/orchestration plugin, persistent memory system, or telemetry subsystem.
- Native global runtime targets: `compaction.auto = true`, `compaction.prune = true`, `subagent_depth = 1`; preserve an existing positive `compaction.reserved`, otherwise use `10000`.
- Maximum two concurrent subagents is a behavioral policy, not a reason to add an orchestration plugin.
- No AutoEQ product source, `packages/core`, app behavior, tests, package dependencies, CI workflow, Pages workflow, or vendor files may change.
- Repository `AGENTS.md` must stop duplicating generic workflow policy and retain only project-specific authority/gates/safety plus references.
- Global policy keeps `Inspect -> Implement -> Verify -> Review` but makes process proportional through Patch / Feature / Architectural classification.
- Use directed reading and silent execution. Do not re-audit unrelated config or repository files.

---

### Task 1: Baseline, resolve global config merge, and create rollback

**Files:**
- Inspect: `~/.config/opencode/config.json` if present
- Inspect: `~/.config/opencode/opencode.json` if present
- Inspect: `~/.config/opencode/opencode.jsonc` if present
- Inspect: `~/.config/opencode/AGENTS.md`
- Inspect only names/paths unless needed: `~/.config/opencode/plugins/`, `agents/`, `commands/`, `skills/`
- Inspect: repository `AGENTS.md`

**Interfaces:**
- Produces a rollback snapshot outside the repository.
- Treats multiple global config files as a supported merge, not a blocker.
- For OpenCode v1.18.23, effective global merge order is:

```text
config.json
  ↓ overridden by conflicts in
opencode.json
  ↓ overridden by conflicts in
opencode.jsonc
```

- The edit target is the highest-precedence existing supported file: `opencode.jsonc` when present, otherwise `opencode.json`, otherwise create `opencode.jsonc`.
- Do not consolidate, delete, rename, or rewrite lower-precedence files merely because more than one exists.

- [ ] **Step 1: Confirm repo and OpenCode baseline**

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
opencode --version
```

Expected:

- branch is `remake/squiglink-base`;
- local WIP, if any, is identified and preserved;
- installed version is recorded; do not upgrade it.

If installed OpenCode is not v1.18.23, verify that version's global merge behavior before writing config. Do not infer precedence from filenames alone.

- [ ] **Step 2: Resolve config paths without treating coexistence as failure**

Run:

```bash
GLOBAL_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
mkdir -p "$GLOBAL_DIR"

for file in config.json opencode.json opencode.jsonc; do
  [[ -f "$GLOBAL_DIR/$file" ]] && printf 'present=%s\n' "$file"
done

if [[ -f "$GLOBAL_DIR/opencode.jsonc" ]]; then
  GLOBAL_WRITE_CONFIG="$GLOBAL_DIR/opencode.jsonc"
elif [[ -f "$GLOBAL_DIR/opencode.json" ]]; then
  GLOBAL_WRITE_CONFIG="$GLOBAL_DIR/opencode.json"
else
  GLOBAL_WRITE_CONFIG="$GLOBAL_DIR/opencode.jsonc"
fi

printf 'write-target=%s\n' "$GLOBAL_WRITE_CONFIG"
```

Expected: coexistence of `opencode.json` and `opencode.jsonc` is allowed. With both present, `GLOBAL_WRITE_CONFIG` is `opencode.jsonc`.

- [ ] **Step 3: Create rollback snapshot before edits**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$GLOBAL_DIR/backups/efficient-workflow-v2-$STAMP"
mkdir -p "$BACKUP_DIR"

for file in config.json opencode.json opencode.jsonc AGENTS.md; do
  [[ -f "$GLOBAL_DIR/$file" ]] && cp -p "$GLOBAL_DIR/$file" "$BACKUP_DIR/"
done

printf 'backup=%s\n' "$BACKUP_DIR"
```

Expected: backup path only; do not print contents.

- [ ] **Step 4: Inspect only target fields and effective values**

Inspect only `$schema`, `compaction`, and `subagent_depth` from authored files where safe. Do not dump provider/plugin/MCP/auth sections.

Then inspect the effective runtime values only:

```bash
opencode debug config | jq '{compaction, subagent_depth}'
```

If the installed version's debug output is not JSON, use its supported equivalent while keeping output restricted to these fields.

---

### Task 2: Install native runtime settings and the global Efficient Workflow policy

**Files:**
- Modify/create only: `GLOBAL_WRITE_CONFIG` from Task 1
- Modify/create: `~/.config/opencode/AGENTS.md`

**Interfaces:**
- Effective runtime must resolve to:

```json
{
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  },
  "subagent_depth": 1
}
```

`reserved: 10000` is only the fallback. Preserve an already-effective positive numeric `compaction.reserved`.

- Global instructions use exactly one managed block:

```text
<!-- efficient-workflow-v2:start -->
...
<!-- efficient-workflow-v2:end -->
```

- [ ] **Step 1: Patch only the effective target keys**

Edit `GLOBAL_WRITE_CONFIG` without replacing unrelated configuration.

Required effective keys:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  },
  "subagent_depth": 1
}
```

Rules:

- preserve unrelated keys in every global config file;
- preserve JSONC comments and formatting;
- do not delete duplicate lower-precedence settings from `opencode.json` or `config.json`;
- preserve an already-effective positive `compaction.reserved` by writing that same value into the effective target if necessary;
- if the installed OpenCode rejects a required key, restore the backed-up changed global files and report `BLOCKED`; do not upgrade or add a workaround plugin.

- [ ] **Step 2: Verify effective native settings**

Run:

```bash
opencode debug config | jq '{compaction, subagent_depth}'
```

Expected:

- `compaction.auto: true`;
- `compaction.prune: true`;
- `compaction.reserved`: prior positive value or `10000`;
- `subagent_depth: 1`.

Do not print the full resolved config.

- [ ] **Step 3: Add or replace the managed global policy block**

Preserve unrelated global instructions outside the markers. Ensure exactly one managed block with this content:

```markdown
<!-- efficient-workflow-v2:start -->
## Efficient Workflow v2

Use `Inspect -> Implement -> Verify -> Review` with process proportional to task scope.

### Task class

Classify at the start and only upgrade if hidden complexity appears:

- **Patch:** existing flow, stable contracts, small file/component set. Use a short bounded design approval; no new spec/plan.
- **Feature:** broader coordinated behavior within stable architecture. Get short explicit design approval, then implement in coherent steps. Upgrade to Architectural if shared contracts/subsystems change.
- **Architectural:** new subsystem or shared-contract/persistence/execution/responsibility change. Use brainstorming -> approved spec -> writing-plans -> execution.

### Context and session discipline

1. Read `git status` / HEAD / relevant diff first.
2. Read project `AGENTS.md` or equivalent authority.
3. Read directly involved files and tests.
4. Read only needed spec/plan sections.
5. Use history search or external dependency docs only for a concrete unresolved gap.

Search before opening large files. Do not broadly explore a repo as precaution. One session serves one dominant technical purpose. Around 50-70% context, finish the current unit and avoid new exploration; around 70%, allow at most one useful compaction if work remains coherent. Significant renewed growth after compaction means create a short handoff and start a fresh session. Never prolong a session through repeated compactions.

Handoff, only when continuation is real, stays about 10-15 lines:
`Goal / Current state / Changed files / Decisions / Tests / Next action / Blockers`.
Git, code, and committed specs remain the source of truth.

### Tools and delegation

Installed does not mean active; active does not mean used. Keep optional tools lazy. Use dependency docs only for external API uncertainty, history search only for missing decisions, structural navigation only when it saves reading, and browser/visual tools only when acceptance requires them.

Single-agent is default. Delegate only an independent closed task with positive net value. Maximum two concurrent subagents. No nested subagents. Never delegate broad repo exploration or generic review. Each delegation states objective, scope/files, constraints, and a compact findings-only return format.

### Verification

Use focused tests after each logical behavior change. Once the diff is stable, review it and run one applicable global gate pass. If a global gate fails, fix the cause and rerun that gate plus affected focused tests first; do not restart every expensive gate automatically. Project `AGENTS.md` owns exact project commands and additional gates.

### Communication

Execute silently by default. Do not narrate routine reads, commands, passing tests, or already-established requirements. Interrupt only for required approval, blocking ambiguity, material risk, or final result.

Final output:
`Status: PASS | BLOCKED`
`SHA: <sha when applicable>`
`Changes: 1-5 concise bullets`
`Verification: only applicable gates`
`Notes: only blockers, limitations, or real risks`

Efficiency never overrides correctness, CI, review quality, reproducibility, or safety.
<!-- efficient-workflow-v2:end -->
```

- [ ] **Step 4: Static self-check**

Run:

```bash
grep -c '<!-- efficient-workflow-v2:start -->' "$GLOBAL_DIR/AGENTS.md"
grep -c '<!-- efficient-workflow-v2:end -->' "$GLOBAL_DIR/AGENTS.md"
```

Expected: `1` and `1`.

Confirm the managed block contains no AutoEQ-specific paths, benchmark commands, Pages rules, or product details.

---

### Task 3: Refactor AutoEQ `AGENTS.md` into the repo-specific layer

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Generic workflow policy moves to the global layer.
- Repository file keeps only AutoEQ-specific architecture, safety, gates, delivery rules, and references.
- No project `opencode.json` is added.

- [ ] **Step 1: Replace repository guidance with the repo layer**

Use:

```markdown
# Repository Guidance

## Repository Layer

- Global Efficient Workflow v2 owns generic task classification, session/context discipline, lazy tooling, delegation limits, handoffs, verification strategy, and reporting.
- This file adds only AutoEQ Workbench-specific architecture, safety, gates, and authorities.
- Make the smallest coherent project change that satisfies the approved task; do not perform unrelated cleanup.

## Architecture And Data Safety

- Keep DSP, parsing, normalization, metrics, optimization, quantization, export math, and other domain logic in `packages/core`, never in React components.
- Keep `packages/core` framework-agnostic; it must not import React, Zustand, Tailwind CSS, or ECharts.
- Standard AutoEQ v1 remains frozen unless a later approved design/version explicitly changes it.
- `vendor/squiglink/` is immutable reference only and must never be runtime-imported.
- Use only synthetic or explicitly sanitized test fixtures.
- Never commit secrets, private curves, user data, credentials, or local environment files.

## Repository Verification Gates

- Start with focused tests for changed behavior.
- Ordinary project change: after the diff stabilizes, run the applicable root `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm lint` once.
- AutoEQ/core behavior change: also run `pnpm --filter @autoeq-workbench/core benchmark`.
- Browser/session/export/UI-flow change: run the relevant focused browser E2E during development when needed; CI remains the full browser acceptance gate.
- Visual change: use Playwright/visual QA only when visual acceptance is part of the task.
- Before commit/push, inspect the directed diff and run `git diff --check`.
- GitHub Actions CI for the exact pushed SHA is the final executable proof; Pages follows only through the configured successful-CI path.

## Delivery Safety

- Do not deploy, merge, release, publish, or otherwise distribute the project without an explicit request.
- Preserve unrelated local WIP; never reset, clean, stash, or overwrite it merely to simplify the task.

## Approved References

- Efficient Workflow v2 design: `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`
- Efficient Workflow v2 plan: `docs/superpowers/plans/2026-08-29-efficient-workflow-v2.md`
- Source-first remake design: `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`
- Standard AutoEQ v1 design: `docs/superpowers/specs/2026-08-25-autoeq-standard-v1-design.md`
- Plan 3 integration/visual-closeout design: `docs/superpowers/specs/2026-08-26-plan-03-integration-visual-closeout-design.md`
- Plan 3A: `docs/superpowers/plans/2026-08-26-plan-03a-normalization-session-exports.md`
- Plan 3B: `docs/superpowers/plans/2026-08-26-plan-03b-validation-diagnostics-e2e.md`
- Plan 3C: `docs/superpowers/plans/2026-08-26-plan-03c-squiglink-visual-alignment.md`
```

- [ ] **Step 2: Review scope**

Run:

```bash
git diff -- AGENTS.md
git diff --check
git status --short
```

Expected implementation delta after the revised-plan commit:

- only `AGENTS.md` modified in the repository;
- no source, package, lockfile, CI, Pages, or vendor changes.

- [ ] **Step 3: Commit repository-layer change**

```bash
git add AGENTS.md
git commit -m "chore: apply Efficient Workflow v2 repo policy"
```

Never commit `~/.config/opencode/*`.

---

### Task 4: Smoke-test policy loading and finish once

**Files:**
- Verify only: global OpenCode config and global `AGENTS.md`
- Verify only: repository `AGENTS.md`

**Interfaces:**
- Proves merged native settings resolve correctly.
- Proves the global policy is available outside AutoEQ.
- Proves the AutoEQ repo layer contributes project-specific gates.

- [ ] **Step 1: Re-check effective native configuration**

Run:

```bash
opencode debug config | jq '{compaction, subagent_depth}'
```

Expected target values from Task 2.

- [ ] **Step 2: Global-policy classification smoke outside the repo**

Run in a temporary directory:

```bash
SMOKE_DIR="$(mktemp -d)"
opencode run --agent plan --dir "$SMOKE_DIR" \
  'Classify only. Do not read or edit files. Existing helper has a localized filename bug; contracts stay unchanged and one focused regression test is sufficient. Reply exactly: Class: <Patch|Feature|Architectural>.'
rm -rf "$SMOKE_DIR"
```

Expected:

```text
Class: Patch
```

If the installed CLI names the planning agent differently, use its installed planning equivalent without changing defaults.

- [ ] **Step 3: AutoEQ repo-layer gate smoke**

From repo root:

```bash
opencode run --agent plan --dir "$PWD" \
  'Do not edit files. For a hypothetical change to Standard AutoEQ/core behavior, name only the additional AutoEQ-specific verification gate beyond the ordinary root gates.'
```

Expected: identifies `pnpm --filter @autoeq-workbench/core benchmark` (or clearly the benchmark gate) and does not prescribe visual QA.

- [ ] **Step 4: Final repository verification and push**

This implementation changes guidance/config only. Do not run local benchmark, E2E, or the full product suite merely as precaution.

Run:

```bash
git diff --check
git status --short
git log -3 --oneline
git push origin remake/squiglink-base
```

Wait for CI on the exact pushed SHA. CI may run the full configured repository suite; do not duplicate it locally.

- [ ] **Step 5: Final review**

Confirm:

- delta from the prior implementation attempt contains the revised plan commit plus the `AGENTS.md` implementation commit;
- global config backup exists;
- both global JSON/JSONC files, when present, remain preserved;
- effective target settings resolve correctly;
- managed global policy block exists exactly once;
- no custom plugin/orchestrator/memory/telemetry was added;
- CI for the exact pushed SHA is green.

Final response only:

```text
Status: PASS | BLOCKED
SHA: <implementation sha>

Changes:
- <1-5 concise bullets>

Verification:
- resolved OpenCode config: PASS/FAIL
- global policy smoke: PASS/FAIL
- AutoEQ repo-policy smoke: PASS/FAIL
- git diff --check: PASS/FAIL
- CI: PASS/FAIL

Notes:
- only blockers, limitations, or real risks
```

## Plan self-review

- Spec coverage: all ten acceptance criteria map to Tasks 1-4.
- The previous false blocker for simultaneous `opencode.json` + `opencode.jsonc` is removed.
- For OpenCode v1.18.23, the plan matches source behavior: global configs merge `config.json` -> `opencode.json` -> `opencode.jsonc`, and JSONC wins conflicting keys.
- Multiple global files are preserved instead of consolidated.
- No product-code task exists; Standard-v1 and app behavior remain untouched.
- Native settings handle pruning, compaction, and subagent depth; the maximum-two limit remains behavioral.
- Global and repo layers remain distinct.
- Rollback precedes global-state edits.
- Validation is proportional: targeted config/policy smokes locally, full repository CI once after push.
- Unsupported installed-version behavior remains an explicit `BLOCKED`; no silent workaround or upgrade is allowed.
