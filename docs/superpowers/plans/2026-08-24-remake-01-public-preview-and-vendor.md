# Remake 01 — Public Preview And Vendor Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `remake/squiglink-base` the only branch that updates the public GitHub Pages preview during the remake, then pin an immutable Squiglink Lab source snapshot in the repository without changing the currently working application runtime.

**Architecture:** Keep CI as the quality gate and Pages as a separate consumer of successful CI runs. The Pages receiver stays on the default branch, checks out the exact CI-approved remake SHA, and publishes the existing `apps/web` build. Squiglink source is archived under `vendor/squiglink/` for inspection only; runtime code must not import or execute it.

**Tech Stack:** GitHub Actions, pnpm 10.34.5, Node 22, Vite 8, Git, GitHub Pages, Squiglink Lab 0BSD source snapshot.

**Spec:** `docs/superpowers/specs/2026-08-24-squiglink-source-first-remake-design.md`

## Global Constraints

- Work only on `remake/squiglink-base` for remake application/source changes; `main` remains the stable rollback application baseline.
- During the remake, the public URL `https://jssantogit.github.io/autoeq-workbench/` must be deployed only from successful push CI runs whose head branch is `remake/squiglink-base`.
- CI may continue to run for `main`, but a `main` push must not replace the public remake deployment.
- Pages must deploy the exact `github.event.workflow_run.head_sha` that passed CI.
- Keep the existing Pages build base `/autoeq-workbench/` and the existing `apps/web/dist` artifact path.
- Do not change DSP, curve semantics, filter semantics, graph semantics, product limits, or AutoEQ behavior in this plan.
- Pin Squiglink Lab repository `squiglink/lab` at commit `9ff842c539b058cc726207b689c904c9efff75fd`.
- Keep the upstream 0BSD license in the vendored snapshot and record exact provenance in `vendor/squiglink/UPSTREAM.md`.
- `vendor/squiglink/` is reference-only: no application import, script execution, CDN dependency, or runtime asset load from it.
- No secrets, credentials, private curves, user audio, or VM-local configuration may be committed.
- Follow repository `AGENTS.md`: Inspect -> Implement -> Verify -> Review.

---

### Task 1: Route remake pushes through the existing CI gate

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing workflow named `CI` and root scripts `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`.
- Produces: successful or failed `CI` workflow runs for pushes to both `main` and `remake/squiglink-base`; Pages will key off the resulting `workflow_run.head_branch` and `workflow_run.head_sha`.

- [ ] **Step 1: Inspect the workflow on both refs before editing**

Run:

```bash
git fetch origin main remake/squiglink-base
git checkout remake/squiglink-base
git pull --ff-only origin remake/squiglink-base
git show origin/main:.github/workflows/ci.yml
git show HEAD:.github/workflows/ci.yml
```

Expected: both currently contain `push.branches: [main]` and the same install/typecheck/test/build/lint job.

- [ ] **Step 2: Change only the push branch filter**

Set the workflow trigger to:

```yaml
on:
  push:
    branches: [main, remake/squiglink-base]
  pull_request:
```

Do not alter the job name, Node/pnpm versions, commands, or permissions.

- [ ] **Step 3: Validate the YAML diff locally**

Run:

```bash
git diff -- .github/workflows/ci.yml
git diff --check
```

Expected: the only semantic CI change is adding `remake/squiglink-base` to the push branch list.

- [ ] **Step 4: Commit the remake-branch CI trigger**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run checks for remake branch"
```

- [ ] **Step 5: Mirror the CI trigger change onto `main` without merging remake application work**

Because the Pages `workflow_run` receiver lives on the default branch, keep workflow-control changes narrowly mirrored on `main`. From a clean tree:

```bash
git checkout main
git pull --ff-only origin main
```

Edit only `.github/workflows/ci.yml` to the same branch filter and commit:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run checks for remake branch"
git push origin main
git checkout remake/squiglink-base
```

Expected: `main` receives only the CI routing change, not remake source/spec/runtime work.

### Task 2: Make Pages publish only successful remake-branch pushes

**Files:**
- Modify on `main`: `.github/workflows/pages.yml`
- Mirror on remake branch: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: completed workflow named `CI`.
- Produces: a Pages deployment only when `conclusion == 'success'`, `event == 'push'`, and `head_branch == 'remake/squiglink-base'`; checkout remains pinned to `workflow_run.head_sha`.

- [ ] **Step 1: Update the default-branch Pages receiver condition**

On `main`, change only the branch predicate in the existing deploy job:

```yaml
jobs:
  deploy:
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'remake/squiglink-base'
```

Keep these existing safety properties unchanged:

```yaml
concurrency:
  group: pages
  cancel-in-progress: true
```

```yaml
- uses: actions/checkout@v4
  with:
    ref: ${{ github.event.workflow_run.head_sha }}
```

```yaml
- run: pnpm --filter @autoeq-workbench/web build:pages
```

```yaml
- uses: actions/upload-pages-artifact@v3
  with:
    path: apps/web/dist
```

- [ ] **Step 2: Review and commit the default-branch routing change**

Run:

```bash
git diff -- .github/workflows/pages.yml
git diff --check
git add .github/workflows/pages.yml
git commit -m "ci: publish remake branch to Pages"
git push origin main
```

Expected: a future successful `main` CI run no longer satisfies the Pages job condition.

- [ ] **Step 3: Mirror the same Pages YAML into the remake branch**

```bash
git checkout remake/squiglink-base
git pull --ff-only origin remake/squiglink-base
git checkout main -- .github/workflows/pages.yml
git add .github/workflows/pages.yml
git commit -m "ci: align remake Pages policy"
```

Expected: both refs document the same active Pages policy even though the default-branch copy is the authoritative `workflow_run` receiver.

- [ ] **Step 4: Run the repository baseline before publishing the routing commit**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
git diff --check
```

Expected: all commands exit 0 before pushing the remake branch.

- [ ] **Step 5: Push the remake branch and verify the exact CI -> Pages SHA chain**

```bash
git push -u origin remake/squiglink-base
```

Use GitHub Actions UI or authenticated GitHub tooling to verify:

1. `CI` ran for the remake branch push SHA and succeeded.
2. `Pages` started only after that successful CI run.
3. the Pages checkout ref equals that CI run's `head_sha`.
4. build, artifact upload, and deployment completed successfully.
5. the `github-pages` environment reports `https://jssantogit.github.io/autoeq-workbench/`.

Do not claim this gate is complete from YAML inspection alone.

- [ ] **Step 6: Smoke-test that the public URL still serves the pre-remake functional app**

Check desktop and mobile browser behavior at the public URL:

```text
page loads
Light/Dark works
FR import works
Target import works
graph renders
manual PK/LS/HS editing works
inspector works
screenshot control remains reachable
refresh at project root succeeds
```

Expected: switching the source branch has not yet changed or broken the application UI.

### Task 3: Vendor the exact Squiglink Lab snapshot

**Files:**
- Create: `vendor/squiglink/**` from upstream archive at the pinned commit
- Create: `vendor/squiglink/UPSTREAM.md`

**Interfaces:**
- Consumes: public `squiglink/lab` Git repository at `9ff842c539b058cc726207b689c904c9efff75fd`.
- Produces: immutable, tracked reference source that later plans may inspect; no runtime module interface is produced.

- [ ] **Step 1: Fetch the exact upstream revision into a temporary directory**

Run from repository root:

```bash
tmp="$(mktemp -d)"
git clone https://github.com/squiglink/lab.git "$tmp/lab"
git -C "$tmp/lab" checkout 9ff842c539b058cc726207b689c904c9efff75fd
test "$(git -C "$tmp/lab" rev-parse HEAD)" = "9ff842c539b058cc726207b689c904c9efff75fd"
```

Expected: the final `test` exits 0.

- [ ] **Step 2: Create the snapshot from `git archive`, not by copying `.git`**

```bash
rm -rf vendor/squiglink
mkdir -p vendor/squiglink
git -C "$tmp/lab" archive 9ff842c539b058cc726207b689c904c9efff75fd | tar -x -C vendor/squiglink
test -f vendor/squiglink/LICENSE
test -f vendor/squiglink/graphtool.js
test -f vendor/squiglink/equalizer.js
test -f vendor/squiglink/style-alt.css
test ! -d vendor/squiglink/.git
```

Expected: the source files exist and no nested Git repository exists.

- [ ] **Step 3: Record provenance next to the snapshot**

Create `vendor/squiglink/UPSTREAM.md` with exactly this metadata block plus a short reference-only policy:

```markdown
# Squiglink Lab upstream snapshot

- Repository: https://github.com/squiglink/lab
- Commit: `9ff842c539b058cc726207b689c904c9efff75fd`
- Snapshot date: 2026-08-24
- License: BSD Zero Clause License (`LICENSE` in this directory)

This directory is an immutable reference snapshot for the AutoEQ Workbench source-first remake.
Runtime code must not import or execute files from this directory. Adapted production code lives under `apps/web`.
```

- [ ] **Step 4: Verify that the snapshot matches the upstream tree**

Generate sorted manifests excluding the Workbench-only provenance file:

```bash
(
  cd "$tmp/lab"
  git ls-tree -r --name-only 9ff842c539b058cc726207b689c904c9efff75fd | sort
) > /tmp/squiglink-upstream-files.txt
(
  cd vendor/squiglink
  find . -type f -printf '%P\n' | grep -v '^UPSTREAM.md$' | sort
) > /tmp/squiglink-vendor-files.txt
diff -u /tmp/squiglink-upstream-files.txt /tmp/squiglink-vendor-files.txt
```

Expected: `diff` exits 0.

- [ ] **Step 5: Verify that no runtime code references the vendor tree**

Run:

```bash
if git grep -n "vendor/squiglink" -- apps packages ':!docs/**'; then
  echo "Unexpected runtime vendor reference" >&2
  exit 1
fi
```

Expected: no match and exit 0.

- [ ] **Step 6: Commit the vendor snapshot as one provenance commit**

```bash
git add vendor/squiglink
git diff --cached --check
git commit -m "chore: vendor Squiglink reference source"
```

### Task 4: Re-run the baseline and prove the vendor snapshot is runtime-inert

**Files:**
- Verify only; no source file should require modification if Tasks 1-3 are correct.

**Interfaces:**
- Consumes: current pre-remake app plus vendored reference snapshot.
- Produces: evidence that the new files do not alter bundle/runtime behavior.

- [ ] **Step 1: Run targeted web checks and the full repository gate**

```bash
pnpm --filter @autoeq-workbench/web test
pnpm --filter @autoeq-workbench/web typecheck
pnpm --filter @autoeq-workbench/web build:pages
pnpm typecheck
pnpm test
pnpm build
pnpm lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect the production build for accidental vendor references**

Run:

```bash
if grep -R "vendor/squiglink\|squiglink/lab\|d3js.org" apps/web/dist; then
  echo "Unexpected reference in production artifact" >&2
  exit 1
fi
```

Expected: no runtime/build artifact match.

- [ ] **Step 3: Review the branch diff against `main` for scope**

```bash
git diff --stat origin/main...HEAD
git diff -- .github/workflows/ci.yml .github/workflows/pages.yml vendor/squiglink/UPSTREAM.md
```

Expected: workflow routing, approved remake docs, and the immutable vendor snapshot only; no application implementation yet.

- [ ] **Step 4: Push and verify the public preview again**

```bash
git push origin remake/squiglink-base
```

Wait for CI and Pages for the pushed SHA. Re-run the same public smoke checks from Task 2. The public UI should still be the existing functional Workbench because the vendor snapshot is not runtime code.

## Completion Gate

Remake 01 is complete only when all of the following are evidenced:

1. push CI runs for `remake/squiglink-base`;
2. Pages publishes only successful push CI runs from `remake/squiglink-base` while the remake policy is active;
3. Pages checks out the exact CI-approved SHA;
4. a `main` push cannot satisfy the active Pages branch predicate;
5. the public URL still loads the existing functional app from the remake branch;
6. `vendor/squiglink/` matches Squiglink Lab commit `9ff842c539b058cc726207b689c904c9efff75fd` plus the Workbench-only `UPSTREAM.md`;
7. the upstream 0BSD license is present;
8. there is no nested `.git` directory and no runtime import/reference to `vendor/squiglink/`;
9. root typecheck, tests, build, lint, `build:pages`, and `git diff --check` pass;
10. no AutoEQ optimizer or application remake implementation has started.

Stop at this gate and record the CI run, Pages run, deployed SHA, public URL, commits, and any verified limitation before starting Remake 02.
