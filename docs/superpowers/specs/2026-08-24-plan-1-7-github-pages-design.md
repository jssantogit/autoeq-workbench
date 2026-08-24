# Plan 1.7 — GitHub Pages Development Deploy Design

## Goal

Publish the current AutoEQ Workbench automatically to GitHub Pages after every successful CI run for a push to `main`, while keeping local development behavior unchanged and making only the minimum local VM/OpenCode alignment needed to work reliably.

## Scope

Plan 1.7 adds a static deployment path only. It does not implement any Standard AutoEQ/Plan 2 engine work and must not change DSP, graph semantics, curve semantics, filter behavior, or product limits.

The application remains a fully client-side Vite/React site with no backend, database, login, server state, or cloud persistence.

## Current Baseline

The repository already has:

- `main` as the default branch;
- root `pnpm` workspace scripts for `typecheck`, `test`, `build`, and `lint`;
- Node `>=22.12.0` in the root package contract;
- CI at `.github/workflows/ci.yml` using Node 22 and pnpm 10.34.5;
- the production web build in `apps/web/dist`;
- a Vite app with no application router that requires history fallback handling;
- repository guidance in `AGENTS.md` following Noqlen `Inspect -> Implement -> Verify -> Review`.

The repository is private at the time this design is written. GitHub Pages availability for that private repository must be checked before deployment is enabled.

## Local Environment Alignment

This is a user-local preflight, not a project tooling redesign.

Before changing deploy files, inspect the current Google Cloud VM/OpenCode environment and align only what is necessary:

- Node must satisfy the repository engine requirement (`>=22.12.0`); prefer Node 22 to match CI.
- pnpm must be able to install the current lockfile; prefer 10.34.5 to match CI unless the existing local version is already compatible and reproducible.
- `git` and GitHub authentication must support the requested repository operations.
- OpenCode must operate from the repository and honor the existing `AGENTS.md` instructions.
- `pnpm install --frozen-lockfile` plus root `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm lint` must work locally before deploy work is trusted.

Do not add project-local OpenCode configuration, personal VM paths, credentials, tokens, auth files, generated agent state, unrelated plugins, MCP configuration, or skills solely to make the environment resemble a previous machine.

If the local environment is already sufficient, do not change it.

## Deployment Architecture

Keep CI and deployment as separate workflows.

`.github/workflows/ci.yml` remains the quality gate and continues to own:

```text
install -> typecheck -> test -> build -> lint
```

Create `.github/workflows/pages.yml` as the deployment workflow.

The Pages workflow must trigger from completion of the existing workflow named `CI` and deploy only when all of the following are true:

- the triggering workflow conclusion is `success`;
- the triggering event was `push`;
- the triggering branch was `main`.

The workflow must checkout the exact `github.event.workflow_run.head_sha` that passed CI. It must not rebuild an arbitrary newer `main` HEAD.

The deploy flow is:

```text
push to main
    -> CI
    -> CI success
    -> Pages workflow
    -> checkout exact passed SHA
    -> install frozen lockfile
    -> build web for /autoeq-workbench/
    -> upload Pages artifact
    -> deploy to github-pages environment
```

A failed or cancelled CI run must never publish.

## Vite Base Path

The expected project-site URL is:

```text
https://jssantogit.github.io/autoeq-workbench/
```

GitHub Pages project sites require a public base path of:

```text
/autoeq-workbench/
```

Do not make local `pnpm dev` depend on that nested path.

Prefer keeping `apps/web/vite.config.ts` development defaults unchanged and passing the Pages base explicitly at build time, for example through the web build command used by the Pages workflow:

```text
vite build --base=/autoeq-workbench/
```

Because the current package build script includes `tsc -b && vite build`, the implementation may either add one narrowly named Pages build script or run the equivalent typecheck/build commands from the workflow. Avoid duplicating product configuration or changing normal local build semantics unnecessarily.

Any asset paths created by the application must work under the configured Vite base. If dynamic public paths exist, use Vite's supported base mechanism rather than hard-coded root URLs.

## GitHub Pages Workflow Requirements

Use the current GitHub-supported Pages Actions pattern:

- checkout;
- setup pnpm;
- setup Node with pnpm cache;
- `pnpm install --frozen-lockfile`;
- build the web application with `/autoeq-workbench/` as the base;
- `actions/configure-pages`;
- `actions/upload-pages-artifact` with `apps/web/dist`;
- `actions/deploy-pages`.

The deploy job must use the `github-pages` environment and the minimum required Pages permissions, including `pages: write` and `id-token: write`. Repository contents should otherwise remain read-only.

Use a concurrency group for Pages deployment so a newer valid `main` deployment supersedes stale queued deployment work without creating overlapping publishes.

Do not add deploy secrets.

## Repository Pages Configuration

GitHub Pages must use GitHub Actions as its publishing source.

Before attempting to publish, verify that the current account/repository plan supports Pages for this private repository.

If private-repository Pages is unavailable:

- stop the deployment setup at that boundary;
- report the limitation clearly;
- do not make the repository public;
- do not create a second public repository;
- do not copy build output elsewhere without explicit user approval.

If Pages is supported but the publishing source/environment requires a one-time repository setting that cannot be safely configured from the authenticated CLI/API, report the exact manual setting required instead of broadening credentials or inventing a workaround.

## Routing And Static Behavior

Do not add React Router, SPA history fallback files, custom `404.html`, service workers, or redirects for Plan 1.7 unless inspection finds an existing route that actually requires them.

The current single-screen app should load directly from the project-site root.

Refresh of the published root URL must work normally.

## CI Relationship

Do not weaken or duplicate the existing CI quality gate.

The Pages workflow may rebuild the site because GitHub Pages requires a deployment artifact, but it must not become a second independent authority for whether a commit is acceptable.

CI remains the gate; Pages consumes only a successful CI result.

Do not merge the two workflows in Plan 1.7.

## Verification

### Local

Before committing deploy configuration:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm lint
git diff --check
```

Also run a production build using the Pages base and inspect `apps/web/dist/index.html`/generated asset references to confirm they resolve below `/autoeq-workbench/` rather than `/assets/...` at the domain root.

### GitHub Actions

After the deployment commit reaches `main`, verify observable workflow results rather than assuming success from YAML structure:

1. `CI` succeeds for the pushed SHA.
2. Pages runs only after that successful CI.
3. Pages checks out/deploys that same SHA.
4. the Pages build/upload/deploy jobs succeed.
5. the `github-pages` environment reports the deployed URL.

### Published Site Smoke Test

Verify the published site in both desktop and mobile browsers:

- root page loads at `https://jssantogit.github.io/autoeq-workbench/`;
- JS/CSS/favicon/assets load without 404s;
- Light/Dark works;
- graph renders;
- local FR import works;
- local Target import works;
- Equalizer tab and manual filters remain functional;
- Inspector works;
- Screenshot behavior is checked in the deployed origin;
- refreshing the project root succeeds;
- no private measurement data or credentials are present in the built artifact.

## Failure Semantics

- Local baseline failure: stop and restore the local environment/baseline before deploy changes.
- CI failure: no deployment.
- Pages build failure: keep the previous successful Pages deployment; report the failure.
- Pages eligibility/permissions failure: stop and report the account/repository constraint.
- Published asset-path failure: fix the Vite base/build configuration; do not add unrelated routing infrastructure.

## Files Expected To Change

Expected repository changes are intentionally small:

```text
.github/workflows/pages.yml       # new automatic Pages deployment
apps/web/package.json             # only if a dedicated pages build script is the cleanest implementation
docs/...                          # only minimal deployment documentation if useful
```

`apps/web/vite.config.ts` should remain unchanged unless inspection proves build-time `--base` is inadequate for an existing app path.

Do not modify `packages/core` for this plan.

## Commit Shape

Prefer focused commits, for example:

```text
ci: add automatic GitHub Pages deploy
```

A separate documentation commit is acceptable if documentation changes are meaningful. Local VM/OpenCode configuration must not be committed.

## Completion Gate

Plan 1.7 is complete only when:

1. the local VM/OpenCode environment is minimally aligned and the root baseline is green;
2. the existing `CI` workflow remains unchanged in responsibility and green;
3. a Pages workflow deploys only successful `main` push CI results;
4. Pages builds the exact CI-approved SHA;
5. the production Vite base is `/autoeq-workbench/` without breaking local dev at `/`;
6. GitHub Pages is enabled through GitHub Actions for the repository;
7. the deployed site is reachable at the expected project URL or the verified Pages URL returned by the environment;
8. the published smoke checks pass on desktop and mobile;
9. no secrets/private local configuration are committed or embedded in the artifact;
10. `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`, and `git diff --check` pass;
11. the repository diff is reviewed for unrelated changes;
12. Plan 2 / Standard AutoEQ implementation has not started.

After this gate, stop and report the deployed URL, workflow run evidence, commit(s), local environment changes that were required, verification results, and any residual limitations.
