export default class ScorerParty {
  constructor(room) {
    this.room = room
  }

  onMessage(message, sender) {
    // Broadcast any state update to all other connected clients
    this.room.broadcast(message, [sender.id])
  }
}
