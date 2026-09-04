---
description: "Scaffold a new @plugola/* workspace package with the repo's standard structure (package.json, tsconfigs, src, test, README, LICENSE) and wire it into the root tsconfig and release-please config. Use when adding a new package to the monorepo."
name: 'New Plugola Package'
argument-hint: '<package-name> [one-line description]'
agent: 'agent'
---

Scaffold a new `@plugola/*` package in this monorepo. Follow the conventions in [AGENTS.md](../../AGENTS.md).

## Inputs

- **Package name**: the unscoped name (e.g. `state-machine` → published as `@plugola/state-machine`). If not provided in the arguments, ask for it.
- **Description**: a one-line summary for `package.json` and the README. If not provided, ask.
- **Main entry file**: default `src/index.ts`. Ask only if the package's primary export should be a named file (some packages use e.g. `src/Store.ts` and point `exports` at `./dist/Store.js`).

Model the new package on the smallest existing one, [packages/store](../../packages/store) — read its files first to match structure and current dependency versions exactly.

## Steps

1. Create `packages/<name>/` with these files:
   - `package.json` — `"name": "@plugola/<name>"`, `"version": "0.0.0"`, `"type": "module"`, `"sideEffects": false`, `exports` pointing at the built `./dist/<entry>.js`. Copy the `scripts` block (`build`, `clean`, `start`, `test`) and `devDependencies` verbatim from an existing package so versions stay in sync. Keep `dependencies` to `tslib` unless the user needs more.
   - `tsconfig.json` — `extends: "../../tsconfig.json"`, `compilerOptions: { "outDir": "dist", "rootDir": "./src" }`, `include: ["src"]`.
   - `test/tsconfig.json` — `extends: "../tsconfig.json"`, `compilerOptions: { "noEmit": true, "rootDir": "../" }`, `include: ["../src", "."]`.
   - `src/<entry>.ts` — a minimal starting export (default export for a main class, using `#private` fields; named exports otherwise).
   - `test/<entry>.test.ts` — a vitest spec importing from `../src/<entry>.js` (note the `.js` extension) with `import { test, expect } from 'vitest'` and one placeholder assertion.
   - `README.md` — `# @plugola/<name>`, the description as a `>` blockquote, and a `## Usage` heading.
   - `LICENSE` — copy verbatim from [packages/store/LICENSE](../../packages/store/LICENSE).

2. Wire it into the build: add `{ "path": "packages/<name>" }` to `references` in the root [tsconfig.json](../../tsconfig.json), keeping the list alphabetically ordered.

3. Register it for releases: add `"packages/<name>": {}` to the `packages` map in [release-please-config.json](../../release-please-config.json), keeping alphabetical order.

4. Verify: run `npm install` (to link the workspace), then `npm run build` and `npm test --workspace @plugola/<name>`. Fix any errors before finishing.

## Conventions to honor

- **ESM only**: relative imports MUST include the `.js` extension, even in `.ts` files.
- **Prettier**: no semicolons, single quotes — match the surrounding code exactly.
- **Strict TS**: no unused locals/parameters, or the build fails.
- Do NOT hand-write a `CHANGELOG.md` or invent a real version — release-please manages versions and changelogs.

When done, print the list of created/modified files and the exact command to run the new package's tests.
