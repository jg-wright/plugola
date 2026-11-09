# Changelog

## [9.2.0](https://github.com/jg-wright/plugola/compare/plugin-manager-v9.1.0...plugin-manager-v9.2.0) (2026-11-09)


### Features

* **plugin-manager:** allplugins api ([60d5e0c](https://github.com/jg-wright/plugola/commit/60d5e0ccbecb45132a7ac6f225d804768d093831))
* **plugin-manager:** allplugins api ([16987f9](https://github.com/jg-wright/plugola/commit/16987f9bd128c4fb264364033bdaa59c3d9f8ad0))

## [9.1.0](https://github.com/jg-wright/plugola/compare/plugin-manager-v9.0.1...plugin-manager-v9.1.0) (2026-11-05)


### Features

* **plugin-manager:** add gates, plugin metadata and context signals ([63a3dc6](https://github.com/jg-wright/plugola/commit/63a3dc6772ad38fbd4934eb68293c9846e1eee91))
* **plugin-manager:** add run onStarted callback ([c0f198f](https://github.com/jg-wright/plugola/commit/c0f198f622b2f94a5cb39842a37b948c79911a7b))
* **plugin-manager:** check gates against a plugin-like object ([a121d10](https://github.com/jg-wright/plugola/commit/a121d106868fd033e5303d359e3dd8886848f61f))
* **plugin-manager:** check gates one after another over the live set ([bbe2408](https://github.com/jg-wright/plugola/commit/bbe2408cd3fe12196a7dda8c101ecc03acfdcc1b))


### Bug Fixes

* **plugin-manager:** call run onStarted outside plugin error handling ([e171333](https://github.com/jg-wright/plugola/commit/e1713336b3d53b12a061a283debe8907ed40238c))
* **plugin-manager:** share one run between a plugin and its dependers ([c97da3b](https://github.com/jg-wright/plugola/commit/c97da3b71c216097cc1310f61669479af6103f61))

## [9.0.1](https://github.com/jg-wright/plugola/compare/plugin-manager-v9.0.0...plugin-manager-v9.0.1) (2026-11-02)


### Bug Fixes

* **plugin-manager:** allow registering a plugin before its dependencies ([d25be39](https://github.com/jg-wright/plugola/commit/d25be39951cba8cf1c52ef3ba4eb442f8f4a73cb))
* **plugin-manager:** consistent, configurable handling of unknown plugins ([0a49822](https://github.com/jg-wright/plugola/commit/0a49822c67e5bc33c2938bb97e5867a2634d2489))
* **plugin-manager:** detect circular dependencies when running ([8b9476a](https://github.com/jg-wright/plugola/commit/8b9476abdc3f6f2d28d700e23604d78be0cd76b7))
* **plugin-manager:** give withOptions clones isolated runtime state ([94d5de2](https://github.com/jg-wright/plugola/commit/94d5de208738dd39e19169e882bda1f2f84c86c2))
* **plugin-manager:** isolate and report plugin enable/run errors ([c6e15b2](https://github.com/jg-wright/plugola/commit/c6e15b2e929bdd260beebced2737c7edcd41c235))
* **plugin-manager:** make enable batches local instead of a shared field ([46192da](https://github.com/jg-wright/plugola/commit/46192daaf9fe2d907ce42ab538b23cc50f04b550))
* **plugin-manager:** order run() after enabled optional dependencies ([2e1aeb3](https://github.com/jg-wright/plugola/commit/2e1aeb39a9ad1e7fac68a97992eeeb86b09cf123))

## [9.0.0](https://github.com/jg-wright/plugola/compare/plugin-manager-v8.0.3...plugin-manager-v9.0.0) (2026-06-08)


### ⚠ BREAKING CHANGES

* The `init` phase has been renamed to `enable`.

### Features

* introduce optional dependencies ([1e04612](https://github.com/jg-wright/plugola/commit/1e046125b87524981cf94d9bc6b586bf16f63d93))
* only enable one level of dependencies at once ([e9e5f99](https://github.com/jg-wright/plugola/commit/e9e5f997b4ca7037d43c59c277735e0f2abe3a61))


### Bug Fixes

* add dist to package ([64710ee](https://github.com/jg-wright/plugola/commit/64710ee56ed534118ab71d51b1b276fbe85b9d52))
* add repository url ([b8d5db6](https://github.com/jg-wright/plugola/commit/b8d5db672f7cf3613ca351169ad95bf1233109e1))
* correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
* **deps:** update dependency rimraf to v6.1.0 ([#763](https://github.com/jg-wright/plugola/issues/763)) ([b3a3c57](https://github.com/jg-wright/plugola/commit/b3a3c57ad0a0addbbe9e86a6eadb3433fd81dfa7))
* **deps:** update dependency rimraf to v6.1.2 ([#773](https://github.com/jg-wright/plugola/issues/773)) ([7db735a](https://github.com/jg-wright/plugola/commit/7db735a43aefcbaf33adbd2e714a367d3ee802d9))
* **deps:** update dependency rimraf to v6.1.3 ([#806](https://github.com/jg-wright/plugola/issues/806)) ([8fe27c4](https://github.com/jg-wright/plugola/commit/8fe27c432d88fadf3d0a5bad5dd0e67b83cd582d))
* update build and clean scripts across multiple packages ([e29e435](https://github.com/jg-wright/plugola/commit/e29e435c6dec7d31c33f7e454ceb9b38bf0ccd06))
* upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))


### Code Refactoring

* init phase to enable phase ([1e04612](https://github.com/jg-wright/plugola/commit/1e046125b87524981cf94d9bc6b586bf16f63d93))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/graph bumped from ^3.0.2 to ^3.0.3

## [8.0.2](https://github.com/jg-wright/plugola/compare/plugin-manager-v8.0.1...plugin-manager-v8.0.2) (2026-06-08)


### Bug Fixes

* add repository url ([b8d5db6](https://github.com/jg-wright/plugola/commit/b8d5db672f7cf3613ca351169ad95bf1233109e1))
* correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
* upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))

## [8.0.2](https://github.com/jg-wright/plugola/compare/plugin-manager-v8.0.1...plugin-manager-v8.0.2) (2026-06-08)


### Bug Fixes

* correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
* upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/graph bumped from ^3.0.0 to ^3.0.2

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
