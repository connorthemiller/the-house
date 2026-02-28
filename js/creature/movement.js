// Creature movement -- pathfinding and stepping

export var methods = {
  _forceMove: function() {
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var nc = this.col + dirs[i][0];
      var nr = this.row + dirs[i][1];
      if (this._canStep(this.room, nc, nr)) {
        this._step(nc, nr);
        return;
      }
    }
  },

  _moveToward: function(targetCol, targetRow) {
    var dc = targetCol - this.col;
    var dr = targetRow - this.row;
    if (dc === 0 && dr === 0) return;

    // Prefer axis with greater distance
    var tryMoves = [];
    if (Math.abs(dc) >= Math.abs(dr)) {
      tryMoves.push([Math.sign(dc), 0]);
      if (dr !== 0) tryMoves.push([0, Math.sign(dr)]);
    } else {
      tryMoves.push([0, Math.sign(dr)]);
      if (dc !== 0) tryMoves.push([Math.sign(dc), 0]);
    }

    for (var i = 0; i < tryMoves.length; i++) {
      var nc = this.col + tryMoves[i][0];
      var nr = this.row + tryMoves[i][1];
      if (this._canStep(this.room, nc, nr)) {
        this._step(nc, nr);
        return;
      }
    }
  },

  _moveTowardRoom: function(targetRoomId) {
    if (targetRoomId === this.room) return;

    var rooms = this.world.getRoomOrder();
    var currentIdx = rooms.indexOf(this.room);
    var targetIdx = rooms.indexOf(targetRoomId);

    var doorways = this.world.getDoorways();
    var dw = null;

    if (targetIdx > currentIdx) {
      // Go right: doorway FROM current room
      for (var i = 0; i < doorways.length; i++) {
        if (doorways[i].from === this.room) { dw = doorways[i]; break; }
      }
    } else {
      // Go left: doorway TO current room
      for (var i = 0; i < doorways.length; i++) {
        if (doorways[i].to === this.room) { dw = doorways[i]; break; }
      }
    }

    if (!dw) return;

    var exitCol, exitRow, entryRoom, entryCol, entryRow;
    if (dw.from === this.room) {
      exitCol = dw.fromCol;
      exitRow = dw.fromRow;
      entryRoom = dw.to;
      entryCol = dw.toCol;
      entryRow = dw.toRow;
    } else {
      exitCol = dw.toCol;
      exitRow = dw.toRow;
      entryRoom = dw.from;
      entryCol = dw.fromCol;
      entryRow = dw.fromRow;
    }

    // At exit cell? Step through doorway
    if (this.col === exitCol && this.row === exitRow) {
      var prevRoom = this.room;
      this.room = entryRoom;
      this.col = entryCol;
      this.row = entryRow;
      this.bus.emit('creature:room-changed', { room: this.room, prevRoom: prevRoom });
      this.bus.emit('creature:moved', {
        room: this.room, col: this.col, row: this.row,
        prevCol: exitCol, prevRow: exitRow
      });
    } else {
      this._moveToward(exitCol, exitRow);
    }
  },

  _canStep: function(roomId, col, row) {
    var room = this.world.getRoom(roomId);
    if (!room) return false;
    if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
    if (this.world.getObjectAt(roomId, col, row)) return false;
    return true;
  },

  _step: function(newCol, newRow) {
    var prevCol = this.col;
    var prevRow = this.row;
    this.col = newCol;
    this.row = newRow;
    this.drives.energy = Math.min(1, this.drives.energy + 0.005);
    this.bus.emit('creature:moved', {
      room: this.room, col: this.col, row: this.row,
      prevCol: prevCol, prevRow: prevRow
    });
  },

  _closestFood: function(allFood) {
    var rooms = this.world.getRoomOrder();
    var myIdx = rooms.indexOf(this.room);

    var best = null;
    var bestDist = Infinity;

    for (var i = 0; i < allFood.length; i++) {
      var f = allFood[i];
      var fIdx = rooms.indexOf(f.inRoom);
      var roomDist = Math.abs(fIdx - myIdx) * 10;
      var cellDist = (f.inRoom === this.room)
        ? (Math.abs(f.col - this.col) + Math.abs(f.row - this.row))
        : 0;
      var dist = roomDist + cellDist;
      if (dist < bestDist) {
        bestDist = dist;
        best = f;
      }
    }
    return best;
  },

  _closestTarget: function(items) {
    var rooms = this.world.getRoomOrder();
    var myIdx = rooms.indexOf(this.room);
    var best = null;
    var bestDist = Infinity;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var fIdx = rooms.indexOf(item.inRoom);
      var roomDist = Math.abs(fIdx - myIdx) * 10;
      var cellDist = (item.inRoom === this.room)
        ? (Math.abs(item.col - this.col) + Math.abs(item.row - this.row))
        : 0;
      var dist = roomDist + cellDist;
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    return best;
  }
};
