export default class ScorerParty {
  constructor(room) {
    this.room = room
    this.lastState = null
  }

  onConnect(connection) {
    // Send current state to any new joiner
    if (this.lastState) {
      connection.send(this.lastState)
    }
  }

  onMessage(message, sender) {
    this.lastState = message
    this.room.broadcast(message, [sender.id])
  }
}
