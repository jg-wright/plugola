# Changelog

## [8.0.2](https://github.com/jg-wright/plugola/compare/plugin-manager-v8.0.1...plugin-manager-v8.0.2) (2026-06-08)

### Bug Fixes

- correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
- upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @plugola/graph bumped from ^3.0.1 to ^3.0.2

## [8.0.1](https://github.com/jg-wright/plugola/compare/plugin-manager-v8.0.0...plugin-manager-v8.0.1) (2026-03-23)

### Bug Fixes

- **deps:** update dependency rimraf to v6.1.0 ([#763](https://github.com/jg-wright/plugola/issues/763)) ([b3a3c57](https://github.com/jg-wright/plugola/commit/b3a3c57ad0a0addbbe9e86a6eadb3433fd81dfa7))
- **deps:** update dependency rimraf to v6.1.2 ([#773](https://github.com/jg-wright/plugola/issues/773)) ([7db735a](https://github.com/jg-wright/plugola/commit/7db735a43aefcbaf33adbd2e714a367d3ee802d9))
- **deps:** update dependency rimraf to v6.1.3 ([#806](https://github.com/jg-wright/plugola/issues/806)) ([8fe27c4](https://github.com/jg-wright/plugola/commit/8fe27c432d88fadf3d0a5bad5dd0e67b83cd582d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @plugola/graph bumped to 3.0.1

## [8.0.0](https://github.com/jg-wright/plugola/compare/plugin-manager-v7.0.0...plugin-manager-v8.0.0) (2025-10-03)

### ⚠ BREAKING CHANGES

- The `init` phase has been renamed to `enable`.

### Features

- introduce optional dependencies ([1e04612](https://github.com/jg-wright/plugola/commit/1e046125b87524981cf94d9bc6b586bf16f63d93))
- only enable one level of dependencies at once ([e9e5f99](https://github.com/jg-wright/plugola/commit/e9e5f997b4ca7037d43c59c277735e0f2abe3a61))

### Code Refactoring

- init phase to enable phase ([1e04612](https://github.com/jg-wright/plugola/commit/1e046125b87524981cf94d9bc6b586bf16f63d93))
