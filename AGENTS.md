# Plugola

TypeScript monorepo of small, independently published `@plugola/*` packages built around a plugin system (message bus, plugin manager, store, streams, logger, etc.). See the [README](README.md) and each package's own `README.md`.

## Layout

- npm workspaces: every package lives in `packages/*` and is published independently.
- Each package: `src/` (source), `test/` (vitest specs), `dist/` (build output, generated), its own `package.json`, `tsconfig.json`, and `CHANGELOG.md`.
- Cross-package deps use published versions (e.g. `@plugola/plugin-manager` depends on `@plugola/graph`), wired via TypeScript project references in the root [tsconfig.json](tsconfig.json).

## Commands (run from repo root)

- `npm ci` — install.
- `npm run build` — `tsc --build` across all project references. Run before tests; packages import each other's compiled `dist/`.
- `npm test` — runs `npm test` in every workspace (each is `vitest --run`).
- `npm start` — `tsc --build --watch`.
- Single package: `npm test --workspace @plugola/<name>` or `cd packages/<name> && npx vitest`.

## Conventions

- **ESM only**: every package is `"type": "module"` with `module`/`moduleResolution: nodenext`. Relative imports MUST include the `.js` extension, even from `.ts` files (e.g. `import Graph from '../src/Graph.js'`).
- **TypeScript is strict**, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noImplicitReturns`. Clean up unused code or the build fails.
- **Main class per package** is usually a `default export`; use `#private` class fields for internals.
- **Prettier** (see [prettier.config.js](prettier.config.js)): no semicolons, single quotes. `lint-staged` formats on commit.
- **Tests**: vitest with `import { test, expect, beforeEach } from 'vitest'`. Inline snapshots (`toMatchInlineSnapshot`) are used heavily — regenerate with `npx vitest -u`.

## Commits & releases

- **Conventional Commits** are enforced by commitlint + husky on commit (`feat:`, `fix:`, `chore:`, etc.). Non-conforming messages are rejected.
- Releases are automated via release-please ([release-please-config.json](release-please-config.json)); packages are versioned and tagged independently. Do not hand-edit `CHANGELOG.md` or bump versions manually.

## CI

PRs run `npm ci && npm run build && npm test` on Node 24 and 26 ([pull-request.yml](.github/workflows/pull-request.yml)). Ensure a clean build and passing tests on a current Node version before pushing.
