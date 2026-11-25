# Changelog

## [1.1.0](https://github.com/jg-wright/plugola/compare/message-bus-kafka-v1.0.0...message-bus-kafka-v1.1.0) (2026-11-25)


### Features

* **message-bus-kafka:** add KafkaCommandSink and KafkaCommandSource ([777e209](https://github.com/jg-wright/plugola/commit/777e2094de3cf92159c1d17aa0bef0d086abb641))
* **message-bus-kafka:** dead-letter records a KafkaCommandSource gives up on ([6dbdf41](https://github.com/jg-wright/plugola/commit/6dbdf41f100586b479ce847fd378d0a5945afc9d))
* stronger typing of kafka delivery commands ([a6de2b7](https://github.com/jg-wright/plugola/commit/a6de2b7b07a52f0306b3d8a47533cea88a7d6210))


### Bug Fixes

* **message-bus-kafka:** pause the consumer while no handler is registered ([88a5bc4](https://github.com/jg-wright/plugola/commit/88a5bc46a539aaa9d908367b65a98976c3d520cf))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @plugola/message-bus bumped from ^9.0.5 to ^9.1.0
  * peerDependencies
    * @plugola/message-bus bumped from ^9.0.5 to ^9.1.0

## 1.0.0 (2026-11-18)


### Features

* **message-bus-kafka:** add KafkaChannel for bridging buses over Kafka ([2dd4d72](https://github.com/jg-wright/plugola/commit/2dd4d72d72dd01b6acbb249841ddd133c1910505))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @plugola/message-bus bumped from ^9.0.4 to ^9.0.5
  * peerDependencies
    * @plugola/message-bus bumped from ^9.0.4 to ^9.0.5
