// World state manager -- rooms, objects, add/remove, serialization

class World {
  constructor(bus) {
    this.bus = bus;
    this.rooms = {};
    this.roomOrder = [];
    this.doorways = [];
    this.objects = new Map();
  }

  loadHouse(houseData, objectsData) {
    // Load rooms
    this.roomOrder = [];
    this.rooms = {};
    for (const room of houseData.rooms) {
      this.rooms[room.id] = { ...room };
      this.roomOrder.push(room.id);
    }

    // Load doorways
    this.doorways = houseData.doorways.map(d => ({ ...d }));

    // Load default objects
    this.objects.clear();
    for (const obj of objectsData) {
      this.objects.set(obj.id, { ...obj });
    }
  }

  getRoom(roomId) {
    return this.rooms[roomId] || null;
  }

  getRoomOrder() {
    return this.roomOrder;
  }

  getDoorways() {
    return this.doorways;
  }

  getObjectsInRoom(roomId) {
    const result = [];
    for (const obj of this.objects.values()) {
      if (obj.room === roomId) result.push(obj);
    }
    return result;
  }

  getObjectAt(roomId, col, row) {
    for (const obj of this.objects.values()) {
      if (obj.room === roomId && obj.col === col && obj.row === row) {
        return obj;
      }
    }
    return null;
  }

  cellIsEmpty(roomId, col, row) {
    const room = this.rooms[roomId];
    if (!room) return false;
    if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
    return !this.getObjectAt(roomId, col, row);
  }

  addObject(obj) {
    this.objects.set(obj.id, obj);
    this.bus.emit('world:object-added', { object: obj });
  }

  removeObject(id) {
    const existed = this.objects.has(id);
    this.objects.delete(id);
    if (existed) {
      this.bus.emit('world:object-removed', { objectId: id });
    }
  }

  // Get only user-placed objects for persistence
  getUserPlacedObjects() {
    const result = [];
    for (const obj of this.objects.values()) {
      if (obj.userPlaced) result.push({ ...obj });
    }
    return result;
  }

  getState() {
    return {
      userPlacedObjects: this.getUserPlacedObjects()
    };
  }

  loadState(saved) {
    if (!saved || !saved.userPlacedObjects) return;
    for (const obj of saved.userPlacedObjects) {
      this.objects.set(obj.id, obj);
    }
  }
}

export default World;
