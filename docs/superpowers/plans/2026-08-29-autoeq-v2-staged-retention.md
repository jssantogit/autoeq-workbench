# Standard AutoEQ v2 Staged Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bounded Standard v2 search prioritize exact appended cascades that survive deterministic per-parent retention without falsely converging when a deferred candidate can refine into an improvement.

**Architecture:** Each active parent still generates and exact-appends the approved shortlist of at most eight candidates. The existing tuple stages at most three candidates for joint refinement; when none improves the parent, deferred candidates are refined in exact tuple order only until the first completed improvement, then accepted refinements are globally retained exactly as before.

**Tech Stack:** TypeScript 6, Vitest 4, pnpm, framework-agnostic `@autoeq-workbench/core`.

**Spec:** `docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md`, Section 10.1.

## Global Constraints

- Preserve Standard v1 unchanged.
- Preserve candidate geometry, shortlist size `8`, path cap `3`, retention ratio, solution ranking/tie-breaking, joint scales, six-cycle cap, envelopes, deadline semantics, response math, and delivery-grid policy.
- Add no tuning constant and do not change any approved numeric constant.
- Keep diagnostics internal; do not add them to manifests or UI.
- Preserve unrelated WIP and do not reset, clean, stash, merge, deploy, release, or publish.
- Run focused tests first. Do not run global gates during this task.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Stage Exact Appends Before Joint Refinement

**Files:**
- Modify: `packages/core/src/autoeq/v2/search.ts:17-132`
- Test: `packages/core/test/autoeq/v2/search.test.ts`

**Interfaces:**
- Consumes: `retainV2SearchPaths<T extends V2Solution>(paths, mainStagnant)` and the existing candidate shortlist, ranking, deadline, and `jointRefineV2()` contracts.
- Produces: `SearchResult.jointRefinementCount: number`, an internal counter returned on every search exit and never copied into `AutoEqResultV2` or `RunManifestV2`.

- [ ] **Step 1: Write the failing staged-retention regression**

Add imports for `createEvaluationGrid`, `evaluateV2Solution`, `generateV2Candidates`, `rankV2CandidateShortlist`, `type Filter`, and `type SearchResult`. Add this fixture and test inside `Standard v2 bounded search`:

```ts
function pk(id: string, frequencyHz: number, gainDb: number, q: number): Filter {
  return { id, enabled: true, type: 'PK', frequencyHz, gainDb, q }
}

it('joint-refines at most three exact appended candidates for one active parent', () => {
  const frequencies = createEvaluationGrid()
  const desiredFilters = [
    pk('a', 90, 2, 1.2),
    pk('b', 220, -2.4, 1.5),
    pk('c', 520, 2.8, 1.8),
    pk('d', 1_200, -3, 2),
    pk('e', 2_600, 3.2, 2.4),
    pk('f', 5_200, -3, 2.8),
    pk('g', 9_000, 2.5, 3),
    pk('h', 15_000, -2, 2.5),
  ]
  const desiredDb = evaluateV2Solution(
    desiredFilters,
    [],
    frequencies,
    48_000,
  ).cascadeDb
  const config = resolveStandardAutoEqV2Config({
    ...DEFAULT_AUTOEQ_SETTINGS,
    maxFilters: 1,
  })
  const shortlist = rankV2CandidateShortlist(generateV2Candidates({
    frequencies,
    residualDb: desiredDb,
    config,
  }))

  expect(shortlist).toHaveLength(8)

  const result = searchStandardV2WorkingSolutions({
    desiredDb,
    frequencies,
    config: {
      ...config,
      workingMaxFilters: 1,
      algorithm: { ...config.algorithm, maxJointRefinementCycles: 1 },
    },
    deadline: { isExpired: () => false },
  }) as SearchResult & { jointRefinementCount?: number }

  expect(result.jointRefinementCount).toBeGreaterThan(0)
  expect(result.jointRefinementCount).toBeLessThanOrEqual(3)
  expect(result.activeSolutions.length).toBeGreaterThan(0)
  expect(result.activeSolutions.length).toBeLessThanOrEqual(3)
})
```

- [ ] **Step 2: Run the regression to verify RED**

Run:

```bash
pnpm --filter @autoeq-workbench/core exec vitest run \
  test/autoeq/v2/search.test.ts \
  -t "joint-refines at most three exact appended candidates for one active parent"
```

Expected: FAIL because `jointRefinementCount` is `undefined` on the current search result.

- [ ] **Step 3: Add the internal refinement counter to every search exit**

In `SearchResult`, add:

```ts
jointRefinementCount: number
```

Initialize it next to `peakWorkingFilterCount`:

```ts
let jointRefinementCount = 0
```

Return it from the initial expired exit and every later `target-capable`, `time-limit`, and `converged` exit. The initial expired exit uses literal `0`.

- [ ] **Step 4: Split exact append from refinement per parent**

Replace the current shortlist loop with this shape, preserving `candidateFilter()` and all existing callbacks/ranking checks:

```ts
const appendedCandidates: V2EvaluatedSolution[] = []
for (const candidate of shortlist) {
  if (input.deadline.isExpired()) {
    expired = true
    break
  }
  appendedCandidates.push(evaluateV2Solution(
    [...path.filters, candidateFilter(candidate, path.filters.length)],
    input.desiredDb,
    input.frequencies,
    input.config.sampleRateHz,
  ))
}
if (expired) break

const staged = retainV2SearchPaths(appendedCandidates, false)
for (const appended of staged) {
  if (input.deadline.isExpired()) {
    expired = true
    break
  }
  jointRefinementCount += 1
  const refined = jointRefineV2({
    solution: appended,
    desiredDb: input.desiredDb,
    frequencies: input.frequencies,
    config: input.config,
    deadline: input.deadline,
  })
  if (refined.expired) {
    expired = true
    break
  }
  if (compareV2Solutions(refined.solution, path) < 0) {
    expanded.push(refined.solution)
    peakWorkingFilterCount = Math.max(
      peakWorkingFilterCount,
      refined.solution.filters.length,
    )
    input.onWorkingSolution?.(refined.solution)
    if (compareV2Solutions(refined.solution, best) < 0) best = refined.solution
    if (input.isTargetCapable?.(refined.solution)) {
      return {
        bestSolution: best,
        activeSolutions: [refined.solution],
        peakWorkingFilterCount,
        jointRefinementCount,
        termination: 'target-capable',
      }
    }
  }
}
```

Do not publish `refined.solution` through `onWorkingSolution`, `best`, or `expanded` when `refined.expired` is true. This preserves the last completed working solution and prevents a new deliverable build after expiration.

- [ ] **Step 5: Run the staged-retention regression to verify GREEN**

Run the exact command from Step 2.

Expected: PASS with `jointRefinementCount` in `1..3` and `activeSolutions.length <= 3`.

- [ ] **Step 6: Run focused search and refinement tests**

Run:

```bash
pnpm --filter @autoeq-workbench/core exec vitest run \
  test/autoeq/v2/search.test.ts \
  test/autoeq/v2/jointRefine.test.ts \
  test/autoeq/v2/discreteRefine.test.ts \
  test/autoeq/v2/responseCache.test.ts
```

Expected: all files and tests PASS.

- [ ] **Step 7: Add the false-convergence regression RED**

Add imports for `desiredCorrection`, `prepareCurve`, `type Curve`, and `type Normalization`. Add this test using the existing `pk()` helper:

```ts
it('falls back when staged candidates cannot improve their parent', () => {
  const frequencies = createEvaluationGrid()
  const desiredFilters = [
    pk('a', 2_200, 3, 2.4),
    pk('b', 3_300, -3.8, 3),
    pk('c', 4_800, 3.4, 3.8),
    pk('d', 7_100, -2.8, 3.2),
  ]
  const responseDb = evaluateV2Solution(
    desiredFilters,
    [],
    frequencies,
    48_000,
  ).cascadeDb
  const curve = (kind: Curve['kind'], db: readonly number[]): Curve => ({
    id: kind,
    name: kind,
    kind,
    rawPoints: frequencies.map((frequencyHz, index) => ({
      frequencyHz,
      db: db[index]!,
    })),
  })
  const normalization: Normalization = { mode: 'hz', frequencyHz: 500, levelDb: 60 }
  const source = prepareCurve(curve('fr', responseDb.map((value) => -value)), normalization, frequencies)
  const target = prepareCurve(curve('target', frequencies.map(() => 0)), normalization, frequencies)
  const desiredDb = desiredCorrection(source.db, target.db)
  const result = searchStandardV2WorkingSolutions({
    desiredDb,
    frequencies,
    config: resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS),
    deadline: { isExpired: () => false },
  })

expect(result.bestSolution.filters.length).toBeGreaterThan(4)
})
```

Run the named test alone. Expected: FAIL on staged-only search with RMSE approximately `0.774` and four filters.

- [ ] **Step 8: Implement deterministic deferred fallback**

Keep appended candidates in exact tuple order and stage them with `retainV2SearchPaths()`. Track whether any staged refinement improved the parent. If none did, refine candidates not present in the staged set in exact tuple order. Reuse the same refinement/acceptance code path; stop fallback immediately after the first accepted parent improvement, target-capable return, deadline, or exhaustion. Increment `jointRefinementCount` for every fallback refinement.

- [ ] **Step 9: Verify fallback GREEN and staged fast path**

Run the false-convergence test, then the original at-most-three test. Expected: both PASS; the original fixture must remain within three refinements because its staged path improves and never enters fallback.

---

### Task 2: Make Discrete Cancellation Audits Lazy

**Files:**
- Modify: `packages/core/src/autoeq/v2/ranking.ts`
- Modify: `packages/core/src/autoeq/v2/discreteRefine.ts`
- Test: `packages/core/test/autoeq/v2/discreteRefine.test.ts`

**Interfaces:**
- Produces: `compareV2PrimaryMetrics(left: ErrorMetrics, right: ErrorMetrics): number` and optional `DiscreteRefineTrace.onCancellationAuditComputed` instrumentation.
- Preserves: exact `compareV2Solutions()` ordering and an exact final `cancellationAudit` on every returned solution.

- [ ] **Step 1: Write the failing lazy-audit regression**

Use two opposite-sign PK filters so cancellation audit is materially expensive. Add this test and extend the local trace test interface with `onCancellationAuditComputed(): void`:

```ts
it('materializes cancellation audit only for the final non-tied solution', () => {
  const config = resolveStandardAutoEqV2Config(DEFAULT_AUTOEQ_SETTINGS)
  const fixed = pk('fixed', 1_500, -2, 2)
  const desiredDb = desiredResponse([pk('desired', 1_235), fixed])
  let cancellationAuditComputations = 0
  const result = cyclicDiscreteRefineV2({
    filters: [pk('start', 1_230), fixed],
    desiredDb,
    frequencies,
    config,
    deadline: { isExpired: () => false },
  }, {
    onCancellationAuditComputed: () => {
      cancellationAuditComputations += 1
    },
  } as DiscreteRefineTraceWithResponseComputations)

  expect(result.filters[0]!.frequencyHz).toBe(1_235)
  expect(cancellationAuditComputations).toBe(1)
  expect(result.solution.cancellationAudit).toEqual(evaluateV2Solution(
    result.filters,
    desiredDb,
    frequencies,
    config.sampleRateHz,
  ).cancellationAudit)
})
```

Run the named test alone. Expected: FAIL because the current trace has no lazy-audit event.

- [ ] **Step 2: Extract exact primary comparison**

Add `compareV2PrimaryMetrics()` in `ranking.ts` using the existing normalized violation, RMSE, and maxAbs comparisons. Make `compareV2Solutions()` call it before cancellation and later tie-break fields.

- [ ] **Step 3: Implement lazy audit validity inside discrete refinement**

Track audit-valid solution objects in a function-local `WeakSet`. Initial and explicitly audited solutions are valid. Trial candidates reuse the current audit as an internal placeholder and are compared with `compareV2PrimaryMetrics()` first. On an exact primary tie, materialize missing audits before calling `compareV2Solutions()`. Before every return, materialize the final solution audit. Call `onCancellationAuditComputed` only when discrete refinement itself materializes an audit.

- [ ] **Step 4: Verify GREEN and exact ranking**

Run the lazy-audit regression, `discreteRefine.test.ts`, `responseCache.test.ts`, and ranking/search tests. Expected: all PASS with one final audit in the no-tie fixture.

---

### Task 3: Verify Runtime Gate and Task 5

**Files:**
- Verify: `packages/core/benchmarks/v2Cases.ts`
- Verify: `packages/core/benchmarks/runV2.ts`
- Verify: `packages/core/test/autoeq/v2/benchmarkCases.test.ts`

**Interfaces:**
- Consumes: staged `searchStandardV2WorkingSolutions()` and existing `runStandardAutoEqV2()` checkpoint pipeline.
- Produces: evidence for `near_budget`, then one full `benchmark:v2` run only if the focused case passes.

- [ ] **Step 1: Run `near_budget` once with a 60-second real deadline**

Use a temporary benchmark-only diagnostic runner, removed immediately after the run, to select `near_budget` and record only:

```text
RMSE
maxAbs
termination
completed search iterations
slowest checkpoint duration
joint refinement cycles
whether the sixth cycle still improved
jointRefinementCount
```

Pass criteria:

```text
RMSE <= 0.25 dB
maxAbs <= 0.75 dB
```

- [ ] **Step 2: Stop on a focused-case failure**

If `near_budget` misses either precision threshold, stop. Do not change constants, cycle limits, shortlist size, path cap, or the approved staged-retention design. Remove temporary diagnostics and report exact metrics/timings.

- [ ] **Step 3: Run `benchmark:v2` once only after focused PASS**

Run:

```bash
pnpm --filter @autoeq-workbench/core benchmark:v2
```

Expected: every known-solvable case passes `RMSE <= 0.25 dB` and `maxAbs <= 0.75 dB`; deterministic and timeout invariants pass.

- [ ] **Step 4: Stop on any known-solvable failure**

If a known-solvable case fails, do not tune constants. Report its exact metrics and termination evidence and leave Task 5 blocked.

- [ ] **Step 5: Inspect final diff and whitespace**

Run:

```bash
git diff --check
git diff -- \
  packages/core/src/autoeq/v2/search.ts \
  packages/core/test/autoeq/v2/search.test.ts \
  docs/superpowers/specs/2026-08-29-autoeq-standard-v2-design.md \
  docs/superpowers/plans/2026-08-29-autoeq-standard-v2.md \
  docs/superpowers/plans/2026-08-29-autoeq-v2-staged-retention.md
```

Expected: no whitespace errors, no diagnostic runner, and no unrelated changes in the directed diff.
