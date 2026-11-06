# Changelog

## [9.0.2](https://github.com/jg-wright/plugola/compare/message-bus-v9.0.1...message-bus-v9.0.2) (2026-11-06)


### Bug Fixes

* **message-bus:** resume every participant before replaying buffered messages ([a905c45](https://github.com/jg-wright/plugola/commit/a905c45f3d3fa3e13d97228fb67fa73efc64c352))

## [9.0.1](https://github.com/jg-wright/plugola/compare/message-bus-v9.0.0...message-bus-v9.0.1) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/queue bumped from ^1.0.0 to ^1.0.1

## [9.0.0](https://github.com/jg-wright/plugola/compare/message-bus-v8.0.0...message-bus-v9.0.0) (2026-11-05)


### ⚠ BREAKING CHANGES

* **message-bus:** TransportableMessageRegistry.message().as() and .command().as() now reject non-serializable payloads unless given a full codec.

### Features

* **message-bus:** add a delivery dispatcher and relax local payload types ([25a23c5](https://github.com/jg-wright/plugola/commit/25a23c5c5044bcc88f5319e178b952b89d69bbdd))
* **message-bus:** add a postMessage channel for browser workers ([213f4bb](https://github.com/jg-wright/plugola/commit/213f4bb8eac3d3136bdce5bf81f37e248e474b50))
* **message-bus:** add a queue to the bus ([57ff752](https://github.com/jg-wright/plugola/commit/57ff7523d26d3315a28c94473cda69953e3ca369))
* **message-bus:** add existing factories to a transportable registry ([8ef81cf](https://github.com/jg-wright/plugola/commit/8ef81cf07c0df0ea5ae216f67b327b488536f99f))
* **message-bus:** add onResponderError and observe; drop the dispatcher ([9dc5579](https://github.com/jg-wright/plugola/commit/9dc5579d9234fb43c49c94d8054d78b5dcd6f272))
* **message-bus:** tell observers when an emit is an invoked command ([353802b](https://github.com/jg-wright/plugola/commit/353802bb9008a0d70a781d38a07089c1657d5e29))


### Bug Fixes

* **message-bus:** deliver what an aborted participant emitted while paused ([8a91543](https://github.com/jg-wright/plugola/commit/8a9154365c425dbe54b76b74f1b31b4370023703))
* **message-bus:** keep delivery synchronous through synchronous interceptors ([1c3ddf2](https://github.com/jg-wright/plugola/commit/1c3ddf2f1f9c9370b69fd73a88921c617da7f029))
* **message-bus:** make message metadata non-enumerable ([feebf46](https://github.com/jg-wright/plugola/commit/feebf4602b696703a13abc9c6d50651b62172821))
* **message-bus:** snapshot handlers before delivering ([3a3a1cf](https://github.com/jg-wright/plugola/commit/3a3a1cf3fec07ceae2d540524cdadb3ba98bc964))

## [8.0.0](https://github.com/jg-wright/plugola/compare/message-bus-v7.1.0...message-bus-v8.0.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* **message-bus:** rename around Enterprise Integration Patterns
* **message-bus:** the entire public API of @plugola/message-bus has changed.

### Features

* **dmg-bus:** interception ([51521ef](https://github.com/jg-wright/plugola/commit/51521efaa1ec97cf98f0d502e233a6808bf25ff8))
* **message-bus:** add resumeuntil ([31c303e](https://github.com/jg-wright/plugola/commit/31c303e34650ea5a62e9fdae8d9a8964e15964a7))
* **message-bus:** allow messages and commands without a payload ([4b87f1d](https://github.com/jg-wright/plugola/commit/4b87f1d150a443292dbebfe2dde25896638f3d87))
* **message-bus:** bridge buses across transports (Messaging Bridge) ([66c4be7](https://github.com/jg-wright/plugola/commit/66c4be7117a9b8ff49251fc3e5581615737fc430))
* **message-bus:** enforce serializable message payloads ([9d19a79](https://github.com/jg-wright/plugola/commit/9d19a79adb8bb7b752a3f2e95c5bb4a108fb3f1a))
* **message-bus:** externally abortable brokers ([344cc71](https://github.com/jg-wright/plugola/commit/344cc71eb657911471ea26df10499ea1a6f9b214))
* **message-bus:** include a portchannel ([20ef604](https://github.com/jg-wright/plugola/commit/20ef604e6c0d2d40aeb24b8766e6cf27fe3e92c0))
* **message-bus:** rewrite around class-based events and per-broker queues ([f4ff39f](https://github.com/jg-wright/plugola/commit/f4ff39f24d38061bc2c35273d1546d82a527a75b))
* **message-bus:** strictly typed registries ([668c080](https://github.com/jg-wright/plugola/commit/668c0809d0a9347dc972a72032f51b35c3f8ece5))
* **message0bus:** invoke.first ([f52f9cf](https://github.com/jg-wright/plugola/commit/f52f9cf82645f11a5f5fffbf46c680e11734e62c))
* starting a new bus structure ([26bd49b](https://github.com/jg-wright/plugola/commit/26bd49b8c4751c49b62c020fea9d4ccdb2b51eeb))


### Bug Fixes

* correct import location ([d984131](https://github.com/jg-wright/plugola/commit/d98413118435cea49363bba4ee85985d60980929))
* **message-bus:** auto resume partipants ([b872449](https://github.com/jg-wright/plugola/commit/b8724493924d4238c32bc3d736ebf09ead5924ea))
* **message-bus:** import Runnable as a type ([0693a75](https://github.com/jg-wright/plugola/commit/0693a759d81b63ee466ee241d2d032caa696383f))


### Code Refactoring

* **message-bus:** rename around Enterprise Integration Patterns ([afe80cd](https://github.com/jg-wright/plugola/commit/afe80cdfc5399a6d16c5f4b572fc3b3251e04073))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/queue bumped from ^0.0.0 to ^1.0.0

## [7.1.0](https://github.com/jg-wright/plugola/compare/message-bus-v7.0.0...message-bus-v7.1.0) (2026-06-10)


### Features

* **message-bus:** match arguments with matchers ([827ceb1](https://github.com/jg-wright/plugola/commit/827ceb14a33813deb5f4a170a1f7f04bbde54aaa))
* **message-bus:** match arguments with matchers ([34940bf](https://github.com/jg-wright/plugola/commit/34940bf70b895e775c34c280fd1b7eea99c9483d))

## [7.0.0](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.4...message-bus-v7.0.0) (2026-06-10)


### ⚠ BREAKING CHANGES

* **message-bus:** `MessageBus`, `Broker`, and `InvokableNotRegisteredError` now take a single `MessageBusContext` type parameter instead of four positional generics. Replace `MessageBus<Events, Gens, Invokables, Streams>` with `MessageBus<CreateMessageBusContext<{ events: Events;

### Features

* add broker streaming ([2c03766](https://github.com/jg-wright/plugola/commit/2c03766bf075a4d4118029f7b98ee13f30df6458))
* add broker streaming ([9c765d3](https://github.com/jg-wright/plugola/commit/9c765d32131bcac5566af848c7d6217b044e9791))
* **message-bus:** collapse generics into a single MessageBusContext ([529ee5b](https://github.com/jg-wright/plugola/commit/529ee5bda1652549dcbc2e2f13933b268c0980e0))

## [6.0.4](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.3...message-bus-v6.0.4) (2026-06-09)


### Bug Fixes

* **message-bus:** export types ([3353ab3](https://github.com/jg-wright/plugola/commit/3353ab3f224769648974eb568896bb14706f4b12))

## [6.0.3](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.2...message-bus-v6.0.3) (2026-06-08)


### Bug Fixes

* add dist to package ([64710ee](https://github.com/jg-wright/plugola/commit/64710ee56ed534118ab71d51b1b276fbe85b9d52))
* update build and clean scripts across multiple packages ([e29e435](https://github.com/jg-wright/plugola/commit/e29e435c6dec7d31c33f7e454ceb9b38bf0ccd06))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/invoke bumped from ^2.0.2 to ^2.0.3

## [6.0.2](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.1...message-bus-v6.0.2) (2026-06-08)


### Bug Fixes

* add repository url ([b8d5db6](https://github.com/jg-wright/plugola/commit/b8d5db672f7cf3613ca351169ad95bf1233109e1))
* correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
* upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))

## [6.0.2](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.1...message-bus-v6.0.2) (2026-06-08)


### Bug Fixes

* correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
* upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @plugola/invoke bumped from ^2.0.0 to ^2.0.2

## [6.0.2](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.1...message-bus-v6.0.2) (2026-06-08)

### Bug Fixes

- correct repo urls ([6b5345b](https://github.com/jg-wright/plugola/commit/6b5345b15e5dece5cdbc9e73730de443f535ac6c))
- upgrade all dependencies ([6e0d045](https://github.com/jg-wright/plugola/commit/6e0d0453251e8096e2dbc1bbafe9c4b16919a0ca))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @plugola/invoke bumped from ^2.0.1 to ^2.0.2

## [6.0.1](https://github.com/jg-wright/plugola/compare/message-bus-v6.0.0...message-bus-v6.0.1) (2026-03-23)

### Bug Fixes

- **deps:** update dependency rimraf to v6.1.0 ([#763](https://github.com/jg-wright/plugola/issues/763)) ([b3a3c57](https://github.com/jg-wright/plugola/commit/b3a3c57ad0a0addbbe9e86a6eadb3433fd81dfa7))
- **deps:** update dependency rimraf to v6.1.2 ([#773](https://github.com/jg-wright/plugola/issues/773)) ([7db735a](https://github.com/jg-wright/plugola/commit/7db735a43aefcbaf33adbd2e714a367d3ee802d9))
- **deps:** update dependency rimraf to v6.1.3 ([#806](https://github.com/jg-wright/plugola/issues/806)) ([8fe27c4](https://github.com/jg-wright/plugola/commit/8fe27c432d88fadf3d0a5bad5dd0e67b83cd582d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @plugola/invoke bumped to 2.0.1
