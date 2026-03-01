// Creature perception -- environment scanning

export var methods = {
  _perceive: function() {
    var roomObjects = this.world.getObjectsInRoom(this.room);

    // Food across all rooms
    var allFood = [];
    var roomOrder = this.world.getRoomOrder();
    for (var i = 0; i < roomOrder.length; i++) {
      var objs = this.world.getObjectsInRoom(roomOrder[i]);
      for (var j = 0; j < objs.length; j++) {
        var obj = objs[j];
        if (obj.type === 'food' || (obj.affordances && obj.affordances.includes('eat'))) {
          allFood.push({ id: obj.id, col: obj.col, row: obj.row, emoji: obj.emoji,
            name: obj.name, type: obj.type, affordances: obj.affordances,
            consumable: obj.consumable, userPlaced: obj.userPlaced, inRoom: roomOrder[i] });
        }
      }
    }

    // Adjacent food (Manhattan distance <= 1)
    var adjacentFood = [];
    for (var i = 0; i < roomObjects.length; i++) {
      var obj = roomObjects[i];
      if (obj.type !== 'food' && !(obj.affordances && obj.affordances.includes('eat'))) continue;
      if (Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row) <= 1) {
        adjacentFood.push(obj);
      }
    }

    // Novel objects in current room (familiarity < 0.7)
    var novelObjects = [];
    for (var i = 0; i < roomObjects.length; i++) {
      var memEntry = this.memory[roomObjects[i].id];
      if (!memEntry || (memEntry.familiarity || 0) < 0.7) {
        novelObjects.push(roomObjects[i]);
      }
    }

    // Toys in current room, adjacent (play/bat/noise affordance)
    var toys = [];
    for (var i = 0; i < roomObjects.length; i++) {
      var obj = roomObjects[i];
      if (!obj.affordances) continue;
      var hasToyAffordance = obj.affordances.includes('play') ||
        obj.affordances.includes('bat') || obj.affordances.includes('noise');
      if (hasToyAffordance && Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row) <= 1) {
        toys.push(obj);
      }
    }

    // Comfort objects across all rooms (comfortValue>0.3, cuddle/sit_on affordance)
    var comfortObjects = [];
    var adjacentComfort = [];
    for (var i = 0; i < roomOrder.length; i++) {
      var objs = this.world.getObjectsInRoom(roomOrder[i]);
      for (var j = 0; j < objs.length; j++) {
        var obj = objs[j];
        if (obj.comfortValue > 0.3 && obj.affordances &&
            (obj.affordances.includes('cuddle') || obj.affordances.includes('sit_on'))) {
          comfortObjects.push({ id: obj.id, col: obj.col, row: obj.row, emoji: obj.emoji,
            name: obj.name, type: obj.type, affordances: obj.affordances,
            comfortValue: obj.comfortValue, inRoom: roomOrder[i] });
          if (roomOrder[i] === this.room &&
              Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row) <= 1) {
            adjacentComfort.push(obj);
          }
        }
      }
    }

    // Sleepable objects across all rooms (sleep affordance)
    var sleepable = [];
    var adjacentSleepable = [];
    for (var i = 0; i < roomOrder.length; i++) {
      var objs = this.world.getObjectsInRoom(roomOrder[i]);
      for (var j = 0; j < objs.length; j++) {
        var obj = objs[j];
        if (obj.affordances && obj.affordances.includes('sleep')) {
          sleepable.push({ id: obj.id, col: obj.col, row: obj.row, emoji: obj.emoji,
            name: obj.name, type: obj.type, affordances: obj.affordances,
            inRoom: roomOrder[i] });
          if (roomOrder[i] === this.room &&
              Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row) <= 1) {
            adjacentSleepable.push(obj);
          }
        }
      }
    }

    // Companion detection
    var companionNearby = false;
    var companionAdjacent = false;
    if (this.companion && this.companion.room === this.room) {
      companionNearby = true;
      companionAdjacent = Math.abs(this.companion.col - this.col) +
        Math.abs(this.companion.row - this.row) <= 1;
    }

    return {
      roomObjects: roomObjects, allFood: allFood, adjacentFood: adjacentFood,
      novelObjects: novelObjects, toys: toys, comfortObjects: comfortObjects,
      adjacentComfort: adjacentComfort, sleepable: sleepable,
      adjacentSleepable: adjacentSleepable,
      companionNearby: companionNearby, companionAdjacent: companionAdjacent
    };
  }
};
