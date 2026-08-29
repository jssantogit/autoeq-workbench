# Efficient Workflow v2 — Hybrid Policy Layer Design

**Status:** approved design  
**Date:** 2026-08-29  
**Branch:** `remake/squiglink-base`  
**Baseline:** `2a35e12a60391b11583226506b95e6ff3f247c24`

## 1. Authority and goal

This document is the authoritative design for Efficient Workflow v2. It defines how OpenCode work should minimize context and repeated work without weakening correctness, reviewability, or verification.

The primary goal is:

> Reduce tokens and context processed per task while preserving or improving implementation quality, traceability, CI reliability, and review confidence.

The design is intentionally hybrid:

- a **global OpenCode policy layer** controls workflow discipline and cost across projects;
- a **repo/profile policy layer** supplies project-specific authorities, constraints, gates, and optional capabilities.

The two layers must not duplicate each other. Global policy owns process. Repo policy owns technical correctness and project-specific rules.

Efficient Workflow v2 does not introduce a custom workflow orchestrator. It starts with native OpenCode mechanisms plus explicit operating policy. Custom automation is deferred until measured evidence shows that native mechanisms and policy are insufficient.

## 2. Core principles

Efficient Workflow v2 follows these rules:

1. **Task boundary before context capacity.** A session serves one coherent work unit and ends when the nature of the work changes, even if context remains.
2. **Minimum sufficient context.** Start with the smallest evidence set that can answer the current question; expand only for a concrete unresolved ambiguity.
3. **Single-agent by default.** Delegation is justified only when it has positive net value.
4. **Installed is not activated; activated is not used.** Optional tools are lazy-loaded by task need.
5. **Focused-first verification.** Run targeted tests during development and global gates once after the diff stabilizes.
6. **Git and committed specs are memory.** Handoffs index durable state; they do not duplicate it.
7. **Silent execution by default.** Do not narrate routine reads, commands, or passing checks.
8. **Efficiency is not correctness tradeoff.** Token reduction is successful only when CI, review quality, and rework remain equal or better.
9. **No unnecessary repetition.** Do not re-read, re-run, re-summarize, or re-explain already established facts without a concrete reason.
10. **YAGNI for workflow machinery.** Add custom plugins, telemetry, or automation only after real measurements justify them.

## 3. Two-layer architecture

### 3.1 Global OpenCode policy

The global layer is project-agnostic. It defines:

- task classification;
- context-loading order;
- session lifecycle and stop conditions;
- pruning and compaction policy;
- lazy tooling;
- subagent limits;
- verification discipline;
- communication/reporting format;
- generic handoff format;
- efficiency measurements.

It must not encode AutoEQ-specific file paths, algorithm rules, benchmark semantics, or Pages behavior.

### 3.2 Repo/profile policy

The repository or selected profile defines only project-specific information, including:

- source-of-truth documents;
- frozen or high-risk areas;
- exact local commands and gates;
- browser/visual acceptance requirements;
- domain-specific tooling;
- repository-specific exceptions.

For AutoEQ Workbench, this layer may define authority for `packages/core`, benchmark and browser gates, Pages expectations, repo specs/plans, and optional profiles such as UI-focused tooling. A profile exposes capability; it does not require every exposed tool to be loaded or used.

### 3.3 Execution flow

```text
User task
   ↓
Classify: Patch | Feature | Architectural
   ↓
Load minimal global policy
   ↓
Load repo-specific policy
   ↓
Read minimum sufficient context
   ↓
Select only necessary tools
   ↓
Execute one coherent work unit
   ↓
Focused verification
   ↓
Final global gate when applicable
   ↓
Commit / CI
   ↓
Compact final report
   ↓
Checkpoint only when continuation exists
```

## 4. Task classification

Every task is classified at the start. Classification can be upgraded when hidden complexity appears but must not be downgraded mid-task to avoid required process.

### 4.1 Patch

A Patch changes an already-existing flow within current contracts and can be understood and tested through a small set of files/components.

Default behavior:

- no new spec or implementation-plan document;
- directed reading only;
- TDD or an equivalent focused regression test where behavior changes;
- no subagents by default;
- focused tests during work;
- one proportional final gate pass.

Typical examples include filename bugs, validation corrections, input-step fixes, or other localized behavior changes.

### 4.2 Feature

A Feature changes a coherent behavior across multiple components while preserving the system's central architectural contracts.

Default behavior:

- short explicit design approval before implementation;
- multiple logical steps are allowed;
- checkpoint/new session when the work unit changes or context approaches closure;
- optional specialized tooling only when required by acceptance criteria;
- focused tests per logical step and one final global gate.

Durable design decisions may be documented when they are not evident from code, but documentation must remain proportional.

### 4.3 Architectural

An Architectural task creates a subsystem, changes shared contracts, alters persistence/execution architecture, or changes how major components relate.

Required flow:

```text
brainstorming
  ↓
approved design
  ↓
spec
  ↓
spec self-review
  ↓
user spec review
  ↓
implementation plan
  ↓
execution in coherent sessions
  ↓
final review
```

### 4.4 Classification heuristic

Use three questions:

1. Does the flow being changed already exist?
2. Does the change stay within existing contracts?
3. Can the change be understood and tested in a small number of files/components?

Three yes answers normally indicate Patch. Existing flow plus broader coordination normally indicates Feature. A new flow, changed contract, or reorganized subsystem indicates Architectural.

## 5. Session lifecycle and context control

### 5.1 Session boundary

The unit of work is not "the conversation". A session serves one dominant technical purpose. A change of work nature ends the session even if context remains, for example:

- implementation → broad review;
- implementation → visual QA;
- domain/core work → unrelated UI investigation.

A task can span multiple sessions. Each session should finish a coherent, reviewable work unit whenever practical.

### 5.2 Progressive context loading

Default context-loading order:

```text
1. git status / HEAD / relevant diff
2. AGENTS.md or equivalent repo authority
3. directly involved files
4. directly involved tests
5. only the needed section of a spec/plan
6. history-search / Context7 only if a real information gap remains
```

Operational rules:

- search for symbols/strings before opening large files;
- in reviews, inspect base→head diff and new commits before full files;
- do not re-open already understood material without a concrete reason;
- specs are references, not mandatory full-session preload;
- summarize and discard large tool outputs after their useful decision has been captured;
- expand context only to answer a specific unresolved question.

### 5.3 Context zones and stop conditions

Context thresholds are soft operating limits rather than exact mathematical gates:

```text
0–50%    normal operation
50–70%   closure zone: finish current unit; avoid new exploration
~70%     allow the session's one useful compaction if continued work is coherent
after compaction + significant new growth
          → checkpoint + new session
```

The task boundary overrides these percentages: a completed unit ends even at low utilization, and a new significant sub-task must not start merely because space remains.

The target is to complete work with context headroom, not to maximize context-window utilization.

### 5.4 Pruning and compaction

Use native pruning continuously for obsolete tool output where supported. Auto-compaction remains enabled where supported.

Policy:

- no custom compaction plugin in v2;
- at most one meaningful compaction per coherent session;
- do not repeatedly compact a growing monolithic session;
- after compaction, significant renewed growth triggers handoff and a fresh session.

If later evidence shows that native compaction loses critical information, a custom compaction strategy may be proposed as a separate measured improvement.

### 5.5 Handoff format

Create a handoff only when meaningful work continues in another session.

Maximum target: roughly 10–15 lines using:

```text
Goal:
Current state:
Changed files:
Decisions:
Tests:
Next action:
Blockers:
```

Rules:

- reference commits, branches, code, and specs instead of copying them;
- include only decisions not obvious from durable sources;
- no full logs;
- no old reasoning transcript;
- no artificial handoff when there is no useful continuation state.

A new session starts from handoff + current HEAD/diff and expands only when necessary.

## 6. Tooling and subagents

### 6.1 Lazy tooling

The baseline should expose only low-cost/core capabilities required by ordinary work. Specialized tools are used on demand.

Baseline category:

- Superpowers workflow discipline;
- native OpenCode mechanisms;
- environment/safety guardrails such as `envsitter-guard` when already part of the baseline.

On-demand category:

- Context7;
- history-search;
- structural navigation such as AFT;
- AGY/subagents;
- Playwright;
- UX/UI review skills;
- Ponytail or equivalent UI-specific assistance;
- other specialized inspection tools.

Experimental/autonomous plugins that increase fanout, parallel memory, or context significantly remain outside the normal workflow unless a measured use case justifies them.

### 6.2 Tool admission rules

- Context7: only for unresolved external dependency/API behavior.
- history-search: only when a required decision is absent from current code/specs.
- AFT/structural tools: only when structural navigation clearly saves reading/context.
- Playwright: only when browser behavior or browser acceptance is relevant.
- visual/UX tooling: only when visual acceptance is part of the task.
- profiles expose possible capabilities; they do not mandate their use.

### 6.3 Subagent policy

Default: single-agent execution.

Delegation is allowed only for an independent, closed task where delegation plus integration is cheaper or clearer than direct execution.

Constraints:

- maximum two concurrent subagents;
- no nested subagents;
- no broad "explore the repo" or "review everything" delegation;
- each delegation states objective, scope/files, constraints, and compact return format;
- subagent output returns conclusions/findings, not investigation narrative or log dumps;
- if the main agent can answer with a few directed reads, do not delegate.

Subagent-driven development is therefore not an automatic default. Use it only when the implementation plan has genuinely independent tasks whose isolation creates net value; otherwise execute directly or use a linear plan-execution workflow.

## 7. Verification strategy

### 7.1 General rule

Use **focused-first, global-once** verification.

During implementation:

```text
logical change
   ↓
focused test
   ↓
next logical change
   ↓
focused test
   ↓
diff review
   ↓
one final global pass
   ↓
CI
```

Do not run the entire global gate after every micro-change.

If a global gate fails, fix the cause and rerun the failed gate plus directly affected tests first. Repeat the entire chain only when the correction plausibly affects other gates.

### 7.2 AutoEQ Workbench gate mapping

For the current repository policy:

- **ordinary Patch:** focused tests → `test` → `typecheck` → `build` → `lint`;
- **touches AutoEQ/core behavior:** ordinary gates + benchmark;
- **touches browser/session/export/UI flow:** applicable ordinary/core gates + relevant E2E;
- **visual change:** Playwright/visual QA only when visual acceptance requires it;
- **push:** CI is the final executable proof; Pages follows only after the configured successful-CI path.

Expensive checks already guaranteed by CI may remain CI-only when they are unnecessary for development or diagnosis. Critical changed behavior must still have focused local proof before push.

### 7.3 Diff and commit review

Before final commit/push:

- inspect the directed diff;
- detect unexpected files;
- run whitespace/diff sanity checking such as `git diff --check` where applicable;
- create small coherent commits, not microcommits.

A review of new work proceeds from base SHA to head SHA, then commits/diff, then full files only where the diff is insufficient, then CI for the exact reviewed SHA.

Do not re-audit the full repository after a localized patch.

## 8. Communication policy

Execution is silent by default.

Do not narrate:

- routine reads;
- routine commands;
- passing focused tests;
- already-established requirements;
- intermediate summaries that do not change a decision.

Interrupt the user only for a real blocking ambiguity, material risk, required approval, or final result.

Default final report:

```text
Status: PASS | BLOCKED
SHA: <sha>

Changes:
- 1–5 concise bullets

Verification:
- only applicable gates and results

Notes:
- only real blockers, limitations, or risks
```

Passing logs are not reproduced. Failures are summarized by cause and relevant evidence rather than copied wholesale.

## 9. Efficiency measurement

Efficient Workflow v2 does not require a new telemetry subsystem. Initially, evaluate trends from existing session/tool evidence and lightweight observation.

Track when available:

- approximate tokens/context consumed per task;
- compactions per session;
- sessions per task;
- subagents invoked;
- repeated global gates;
- unnecessary file/spec rereads;
- first-attempt CI success rate;
- rework attributable to insufficient context.

The first operational objective is to eliminate outliers:

- giant multi-purpose sessions;
- repeated compaction loops;
- unnecessary subagent fanout;
- repeated full-gate runs;
- broad precautionary repo exploration.

Token savings are accepted only if correctness indicators stay equal or improve. A reduction accompanied by more failed CI, missed requirements, regressions, or context-related rework is not a workflow improvement.

After enough representative tasks, measured results may justify tighter thresholds or targeted automation. Do not pre-optimize thresholds before evidence exists.

## 10. Scope boundaries and non-goals

Efficient Workflow v2 does not:

- change AutoEQ Standard-v1 algorithms or product behavior;
- replace project specs/plans as technical authority;
- introduce a custom orchestration/compaction plugin;
- introduce a new persistent memory system;
- require broad telemetry infrastructure;
- require all installed tools to be enabled;
- optimize for maximal parallelism;
- sacrifice tests, CI, review quality, or reproducibility to reduce tokens.

Changes to these boundaries require a separate design decision based on measured need.

## 11. Acceptance criteria

The implementation of Efficient Workflow v2 is complete when:

1. a global workflow policy encodes the approved task classification, context, session, pruning/compaction, lazy-tooling, subagent, verification, and reporting rules without AutoEQ-specific duplication;
2. the AutoEQ repo/profile layer contains only project-specific authorities, gates, constraints, and optional capability rules;
3. pruning and auto-compaction use native mechanisms where supported, with no custom compaction plugin;
4. Patch, Feature, and Architectural work paths are distinguishable and do not impose architectural ceremony on localized patches;
5. session stop conditions and minimal handoff format are explicit;
6. optional tooling and subagents are lazy and bounded, including maximum two concurrent subagents and no nesting;
7. verification follows focused-first/global-once with AutoEQ-specific benchmark/E2E/visual gates applied only when relevant;
8. final reporting is compact and routine progress narration is absent;
9. no existing AutoEQ domain behavior or frozen Standard-v1 contract changes as a side effect;
10. the resulting setup can be evaluated against the efficiency measurements in Section 9 without introducing a new telemetry subsystem.
