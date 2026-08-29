# Efficient Workflow v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for this plan. The approved workflow is single-agent by default; do not use subagent-driven execution unless a genuinely independent blocker makes delegation cheaper than direct work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the approved Efficient Workflow v2 as a global OpenCode policy plus an AutoEQ-specific repository layer, using native pruning/compaction and bounded subagent behavior without changing product code.

**Architecture:** Global behavior lives in the user's OpenCode config and global `AGENTS.md`; AutoEQ-specific authority remains in the repository `AGENTS.md`. Native OpenCode settings enforce pruning/auto-compaction and no nested subagents where supported; behavioral limits such as task classification, progressive context loading, maximum two concurrent subagents, focused-first verification, handoffs, and compact reporting live in global instructions. The repository layer contains only AutoEQ-specific architecture, gates, delivery safety, and source-of-truth references.

**Tech Stack:** OpenCode JSON/JSONC configuration, OpenCode `AGENTS.md`, Git, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-efficient-workflow-v2-design.md`

## Global Constraints

- Start from `remake/squiglink-base` with the docs commit that contains this plan.
- Preserve all pre-existing OpenCode providers, models, permissions, MCPs, plugins, agents, commands, profiles, and environment safeguards unless this plan explicitly changes a key.
- Do not upgrade or migrate OpenCode as part of this plan.
- Do not print secrets, provider credentials, auth data, or full resolved configuration into logs/reports.
- Do not create a custom compaction/orchestration plugin, persistent memory system, or telemetry subsystem.
- Native global runtime targets: `compaction.auto = true`, `compaction.prune = true`, `subagent_depth = 1`; preserve an existing positive `compaction.reserved`, otherwise use `10000`.
- Maximum two concurrent subagents is a behavioral policy, not a reason to add an orchestration plugin.
- No AutoEQ product source, `packages/core`, app behavior, tests, package dependencies, CI workflow, or Pages workflow may change.
- Repository `AGENTS.md` must stop duplicating generic workflow policy and retain only project-specific authority/gates/safety plus references.
- Global policy keeps the existing `Inspect -> Implement -> Verify -> Review` execution skeleton but makes it proportional through Patch / Feature / Architectural classification.
- Use directed reading and silent execution. Do not re-audit unrelated config or repository files.

---

### Task 1: Baseline and protect the existing OpenCode setup

**Files:**
- Inspect: `~/.config/opencode/opencode.json`
- Inspect: `~/.config/opencode/opencode.jsonc`
- Inspect: `~/.config/opencode/AGENTS.md`
- Inspect only as names/paths, not contents unless needed: `~/.config/opencode/plugins/`, `agents/`, `commands/`, `skills/`
- Inspect: repository `AGENTS.md`

**Interfaces:**
- Produces a local rollback snapshot outside the repository.
- Determines one authoritative global config file: existing `opencode.json` or existing `opencode.jsonc`; if neither exists, create `opencode.json` in Task 2.
- If both JSON and JSONC global config files exist, stop and report `BLOCKED` rather than guessing same-level precedence.

- [ ] **Step 1: Confirm repo and OpenCode baseline without broad inspection**

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
opencode --version
```

Expected:

- branch is `remake/squiglink-base`;
- working tree changes, if any, are identified before this plan touches files;
- do not reset, clean, stash, or overwrite unrelated local work;
- record the OpenCode version only for compatibility evidence; do not upgrade it.

- [ ] **Step 2: Resolve the active global config path**

Run:

```bash
GLOBAL_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
mkdir -p "$GLOBAL_DIR"

if [[ -f "$GLOBAL_DIR/opencode.json" && -f "$GLOBAL_DIR/opencode.jsonc" ]]; then
  echo "BLOCKED: both opencode.json and opencode.jsonc exist"
  exit 2
elif [[ -f "$GLOBAL_DIR/opencode.jsonc" ]]; then
  GLOBAL_CONFIG="$GLOBAL_DIR/opencode.jsonc"
else
  GLOBAL_CONFIG="$GLOBAL_DIR/opencode.json"
fi

printf '%s\n' "$GLOBAL_CONFIG"
```

Expected: exactly one path selected. Do not rename an existing JSONC file merely to standardize format.

- [ ] **Step 3: Create a rollback snapshot without exposing content**

Run:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$GLOBAL_DIR/backups/efficient-workflow-v2-$STAMP"
mkdir -p "$BACKUP_DIR"

for file in "$GLOBAL_DIR/opencode.json" "$GLOBAL_DIR/opencode.jsonc" "$GLOBAL_DIR/AGENTS.md"; do
  [[ -f "$file" ]] && cp -p "$file" "$BACKUP_DIR/"
done

printf 'backup=%s\n' "$BACKUP_DIR"
```

Expected: backup path only. Do not print file contents.

- [ ] **Step 4: Inspect only keys needed by this plan**

If the config exists, inspect these keys only: `$schema`, `compaction`, `subagent_depth`. Do not dump provider/plugin/MCP/auth-related sections.

For JSON:

```bash
jq '{"$schema": .["$schema"], compaction, subagent_depth}' "$GLOBAL_CONFIG"
```

For JSONC, use the editor/OpenCode-resolved config rather than stripping comments destructively. If the file cannot be safely inspected with existing tooling, proceed to `opencode debug config` in Task 2 and edit only the target keys.

---

### Task 2: Install the global native runtime settings and Efficient Workflow policy

**Files:**
- Modify or create: the `GLOBAL_CONFIG` resolved in Task 1
- Modify or create: `~/.config/opencode/AGENTS.md`

**Interfaces:**
- Resolved runtime must contain:

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

`reserved: 10000` applies only when no existing positive numeric value exists. Preserve an existing positive value.

- Global instructions use managed markers so future updates replace one block instead of duplicating policy:

```text
<!-- efficient-workflow-v2:start -->
...
<!-- efficient-workflow-v2:end -->
```

- [ ] **Step 1: Make the smallest runtime-config edit**

Merge the following behavior into the existing config rather than replacing the file:

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

- preserve every unrelated top-level key and nested setting;
- preserve JSONC comments/format when editing JSONC;
- preserve an existing positive numeric `compaction.reserved`;
- if the installed OpenCode rejects `subagent_depth`, do not upgrade or invent a plugin: restore the backed-up config and report `BLOCKED` with the version and unsupported key.

- [ ] **Step 2: Verify the resolved native settings before changing instructions**

Run from any project directory:

```bash
opencode debug config | jq '{compaction, subagent_depth}'
```

Expected:

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

The `reserved` value may differ only when a pre-existing positive value was deliberately preserved.

If `opencode debug config` is not JSON on this installed version, inspect only the equivalent resolved fields with the version's supported debug output. Do not print the entire resolved config.

- [ ] **Step 3: Add or replace the managed global policy block**

In `~/.config/opencode/AGENTS.md`, create or replace exactly one managed block with the following content. Preserve all unrelated existing global instructions outside the markers.

```markdown
<!-- efficient-workflow-v2:start -->
## Efficient Workflow v2

Use `Inspect -> Implement -> Verify -> Review` with process proportional to task scope.

### Task class

Classify at the start and upgrade only if hidden complexity appears:

- **Patch:** existing flow, existing contracts, small file/component set. Use the Superpowers bounded path; short design approval only, no new spec/plan.
- **Feature:** existing architecture with broader coordinated behavior. Use the Superpowers bounded path while contracts remain stable; get short explicit design approval, then implement in coherent steps. Upgrade to Architectural if interfaces/subsystems change.
- **Architectural:** new subsystem, shared-contract/persistence/execution change, or major responsibility reorganization. Use Superpowers brainstorming -> approved spec -> writing-plans -> execution.

### Context and session discipline

1. Read `git status` / HEAD / relevant diff first.
2. Read project `AGENTS.md` or equivalent authority.
3. Read directly involved files and tests.
4. Read only needed spec/plan sections.
5. Use history search or external dependency docs only for a concrete unresolved gap.

Search before opening large files. Do not broadly explore a repo as precaution. A session serves one dominant technical purpose. Around 50-70% context, finish the current unit and avoid new exploration; around 70%, allow at most one useful compaction if work remains coherent. Significant renewed growth after compaction means create a short handoff and start a fresh session. Never prolong a session through repeated compactions.

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

- [ ] **Step 4: Static self-check the global layer**

Confirm exactly one start marker and one end marker exist:

```bash
grep -c '<!-- efficient-workflow-v2:start -->' "$GLOBAL_DIR/AGENTS.md"
grep -c '<!-- efficient-workflow-v2:end -->' "$GLOBAL_DIR/AGENTS.md"
```

Expected: `1` and `1`.

Also confirm the managed block contains no `AutoEQ`, `packages/core`, benchmark, Pages, or repository-specific commands. Global process must remain project-agnostic.

---

### Task 3: Refactor AutoEQ repository guidance into the repo-specific layer

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Removes generic workflow duplication now owned globally.
- Preserves AutoEQ architecture/data-safety and delivery restrictions.
- Adds exact conditional gate mapping and Efficient Workflow v2 references.
- Does not add a project `opencode.json`; no project runtime override is needed for v2.

- [ ] **Step 1: Replace `AGENTS.md` with project-specific guidance**

Use this content, adjusting only reference order if necessary:

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

- Start with focused tests for the changed behavior.
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

- [ ] **Step 2: Review the repo diff for layer separation**

Run:

```bash
git diff -- AGENTS.md
git diff --check
git status --short
```

Expected:

- only `AGENTS.md` is modified by implementation work;
- docs/spec/plan files already committed are unchanged;
- no source, package, lockfile, workflow, or vendor file changes;
- generic process details are not duplicated beyond the one sentence establishing layer ownership.

- [ ] **Step 3: Commit the repository-layer change**

```bash
git add AGENTS.md
git commit -m "chore: apply Efficient Workflow v2 repo policy"
```

Do not commit anything under `~/.config/opencode/`; it is user-global state, not repository content.

---

### Task 4: Smoke-test policy loading and finish with one verification pass

**Files:**
- Verify only: global OpenCode config and global `AGENTS.md`
- Verify only: repository `AGENTS.md`
- No new files required

**Interfaces:**
- Proves native settings resolve correctly.
- Proves global policy is visible outside AutoEQ.
- Proves AutoEQ repo layer adds conditional project gates without contaminating global policy.

- [ ] **Step 1: Re-check resolved native configuration**

Run:

```bash
opencode debug config | jq '{compaction, subagent_depth}'
```

Expected:

- `compaction.auto: true`;
- `compaction.prune: true`;
- `compaction.reserved`: preserved positive value or `10000`;
- `subagent_depth: 1`.

- [ ] **Step 2: Run one global-policy classification smoke outside the repository**

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

If the installed `plan` agent cannot be invoked non-interactively, use the installed primary planning agent equivalent without changing global defaults.

- [ ] **Step 3: Run one AutoEQ repo-layer gate smoke**

From repo root:

```bash
opencode run --agent plan --dir "$PWD" \
  'Do not edit files. For a hypothetical change to Standard AutoEQ/core behavior, name only the additional AutoEQ-specific verification gate beyond the ordinary root gates.'
```

Expected answer identifies the core benchmark command or benchmark gate and does not prescribe visual QA unless the hypothetical task is visual.

- [ ] **Step 4: Run the single final repository verification pass**

Because implementation changes only repository guidance, no product behavior changed. Do not run local benchmark or E2E solely for this docs/config task. Run:

```bash
git diff --check
git status --short
git log -2 --oneline
```

Then push the current branch:

```bash
git push origin remake/squiglink-base
```

Wait for CI on the exact pushed SHA. CI may run the repository's full configured suite; do not duplicate that expensive suite locally for this guidance-only change.

- [ ] **Step 5: Review exact pushed delta and report**

Confirm:

- repository delta from the plan baseline contains only the plan commit plus `AGENTS.md` implementation commit;
- global config has rollback backup and resolved target values;
- global managed policy block exists exactly once;
- no custom plugin/orchestrator/memory/telemetry was added;
- CI for the exact pushed SHA is green.

Final response must be only:

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
- No product-code task exists; Standard-v1 and app behavior remain untouched.
- Native OpenCode settings are used for pruning, compaction, and subagent depth; the maximum-two limit stays behavioral rather than introducing orchestration machinery.
- The global and repo layers have distinct responsibilities with no AutoEQ-specific content in the global managed block.
- Rollback exists before global state changes.
- Validation is proportional: focused config/policy smokes locally, full repository CI once after push.
- No placeholder implementation decisions remain; unsupported installed-version behavior is explicitly `BLOCKED`, not silently worked around.
