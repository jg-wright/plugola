class AuctionEvent extends CallbackEvent {}

broker.register(AuctionEvent, (event) => {
  event.send(1)
  event.send(2)
  event.send(3)
  event.finish()
})

const { promise } = broker.publish(new PromiseEvent(10_000))

broker.publish(new AuctionEvent())
