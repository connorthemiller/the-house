// Creature -- autonomous agent with drives, movement, actions

const SPEECH_LINES = {
  eat: ['mmm', 'yum', '*munch*', 'food!'],
  investigate: ["what's that?", 'hmm...', 'ooh'],
  seek_food: ['hungry...', 'food?'],
  rest: ['zzz', '*yawn*'],
  wander: ['...', '~'],
  explore_room: ['...', '~'],
  picked_up: ['hey!', 'whoa!', '!'],
  dropped: ['oh.', 'here?'],
  play: ['wheee!', '*bat bat*', 'fun!', 'hehe'],
  cuddle: ['cozy', '*purr*', 'warm', 'nice'],
  sleep: ['zzz', 'zzz...', '*snore*'],
  seek_sleep: ['sleepy...', 'bed?', '*yawn*'],
  seek_comfort: ['cold...', 'hmm', 'need hug']
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Creature {
  constructor(bus, world, config) {
    this.bus = bus;
    this.world = world;
    this.name = config.name;
    this.species = config.species;
    this.emoji = config.emoji;
    this.room = config.startRoom;
    this.col = config.startCol;
    this.row = config.startRow;

    this.drives = {
      hunger: config.drives.hunger.baseline,
      curiosity: config.drives.curiosity.baseline,
      comfort: config.drives.comfort.baseline,
      energy: config.drives.energy.baseline
    };
    this.driveConfig = config.drives;

    this.mood = 'okay';
    this.currentAction = null;
    this.speech = null;
    this.knownObjects = new Set();
    this.dragging = false;
    this._dragPixel = null;

    this._tickId = null;
    this._speechTimer = null;
  }

  start() {
    this._tickId = setInterval(() => this._tick(), 2500);
  }

  stop() {
    if (this._tickId) {
      clearInterval(this._tickId);
      this._tickId = null;
    }
    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }
  }

  _tick() {
    if (this.dragging) return;

    // If an object was placed on creature's cell, move off
    if (this.world.getObjectAt(this.room, this.col, this.row)) {
      this._forceMove();
      return;
    }

    this._updateDrives();
    this.mood = this._deriveMood();
    var perception = this._perceive();
    this._selectAction(perception);
    this._executeAction(perception);
  }

  _forceMove() {
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var nc = this.col + dirs[i][0];
      var nr = this.row + dirs[i][1];
      if (this._canStep(this.room, nc, nr)) {
        this._step(nc, nr);
        return;
      }
    }
  }

  _updateDrives() {
    this.drives.hunger = Math.min(1, this.drives.hunger + this.driveConfig.hunger.growthRate);
    this.drives.curiosity = Math.min(1, this.drives.curiosity + this.driveConfig.curiosity.growthRate);
    this.drives.comfort = Math.min(1, this.drives.comfort + this.driveConfig.comfort.growthRate);
    this.drives.energy = Math.min(1, this.drives.energy + this.driveConfig.energy.growthRate);

    // Passive comfort soothing: adjacent high-comfort objects reduce comfort drive
    if (!this.dragging) {
      var roomObjects = this.world.getObjectsInRoom(this.room);
      for (var i = 0; i < roomObjects.length; i++) {
        var obj = roomObjects[i];
        if (obj.comfortValue > 0.3 &&
            Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row) <= 1) {
          this.drives.comfort = Math.max(0, this.drives.comfort - 0.01);
          break; // only one soothing tick per update
        }
      }
    }
  }

  _deriveMood() {
    if (this.drives.energy > 0.7) return 'sleepy';
    if (this.drives.hunger > 0.7) return 'hungry';
    if (this.drives.comfort > 0.6) return 'uneasy';
    var valence = (
      (1 - this.drives.hunger) +
      (1 - this.drives.curiosity) +
      (1 - this.drives.comfort) +
      (1 - this.drives.energy)
    ) / 4;
    if (valence > 0.7) return 'happy';
    if (valence > 0.5) return 'content';
    if (this.drives.hunger > 0.6 || this.drives.curiosity > 0.6 ||
        this.drives.comfort > 0.6 || this.drives.energy > 0.6) return 'restless';
    return 'okay';
  }

  _perceive() {
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

    // Novel objects in current room
    var novelObjects = [];
    for (var i = 0; i < roomObjects.length; i++) {
      if (!this.knownObjects.has(roomObjects[i].id)) {
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

    return {
      roomObjects: roomObjects, allFood: allFood, adjacentFood: adjacentFood,
      novelObjects: novelObjects, toys: toys, comfortObjects: comfortObjects,
      adjacentComfort: adjacentComfort, sleepable: sleepable,
      adjacentSleepable: adjacentSleepable
    };
  }

  _selectAction(perception) {
    // Multi-tick action stickiness -- continue unless urgency override
    if (this.currentAction && this.currentAction.turnsRemaining > 0) {
      var isUrgent = (this.drives.hunger > 0.8 && this.currentAction.action !== 'eat') ||
        (this.drives.energy > 0.8 && this.currentAction.action !== 'sleep');
      // Only hunger breaks sleep (sleep is long, shouldn't be easily interrupted)
      if (this.currentAction.action === 'sleep' && this.drives.hunger <= 0.8) {
        return;
      }
      if (!isUrgent) {
        return;
      }
    }

    var candidates = [];
    var noise = function() { return Math.random() * 0.15; };

    // eat: hunger>0.3 AND adjacent to food
    if (this.drives.hunger > 0.3 && perception.adjacentFood.length > 0) {
      candidates.push({ action: 'eat', target: perception.adjacentFood[0],
        score: this.drives.hunger * 2.0 + noise() });
    }

    // seek_food: hunger>0.5 AND food exists anywhere
    if (this.drives.hunger > 0.5 && perception.allFood.length > 0) {
      var food = this._closestFood(perception.allFood);
      candidates.push({ action: 'seek_food', target: food,
        score: this.drives.hunger * 1.5 + noise() });
    }

    // investigate: curiosity>0.4 AND novel object in room
    if (this.drives.curiosity > 0.4 && perception.novelObjects.length > 0) {
      var obj = perception.novelObjects[Math.floor(Math.random() * perception.novelObjects.length)];
      candidates.push({ action: 'investigate', target: obj,
        score: this.drives.curiosity * 1.2 + noise() });
    }

    // play: curiosity>0.3 AND adjacent to toy
    if (this.drives.curiosity > 0.3 && perception.toys.length > 0) {
      candidates.push({ action: 'play', target: perception.toys[0],
        score: this.drives.curiosity * 1.0 + noise() });
    }

    // cuddle: comfort>0.4 AND adjacent to comfort object
    if (this.drives.comfort > 0.4 && perception.adjacentComfort.length > 0) {
      candidates.push({ action: 'cuddle', target: perception.adjacentComfort[0],
        score: this.drives.comfort * 1.3 + noise() });
    }

    // seek_comfort: comfort>0.5 AND comfort object exists
    if (this.drives.comfort > 0.5 && perception.comfortObjects.length > 0) {
      var closest = this._closestTarget(perception.comfortObjects);
      candidates.push({ action: 'seek_comfort', target: closest,
        score: this.drives.comfort * 1.2 + noise() });
    }

    // sleep: energy>0.6 AND adjacent to sleepable
    if (this.drives.energy > 0.6 && perception.adjacentSleepable.length > 0) {
      candidates.push({ action: 'sleep', target: perception.adjacentSleepable[0],
        score: this.drives.energy * 2.0 + noise() });
    }

    // seek_sleep: energy>0.5 AND sleepable exists
    if (this.drives.energy > 0.5 && perception.sleepable.length > 0) {
      var closest = this._closestTarget(perception.sleepable);
      candidates.push({ action: 'seek_sleep', target: closest,
        score: this.drives.energy * 1.5 + noise() });
    }

    // explore_room: curiosity>0.3
    if (this.drives.curiosity > 0.3) {
      candidates.push({ action: 'explore_room', target: null,
        score: this.drives.curiosity * 0.6 + noise() });
    }

    // wander: always
    candidates.push({ action: 'wander', target: null, score: 0.2 + noise() });

    // rest: calmer when drives are low
    var restScore = (this.drives.hunger < 0.4 && this.drives.curiosity < 0.5 &&
      this.drives.comfort < 0.4 && this.drives.energy < 0.4) ? 0.4 : 0.1;
    candidates.push({ action: 'rest', target: null, score: restScore + noise() });

    // Pick highest score
    candidates.sort(function(a, b) { return b.score - a.score; });
    var winner = candidates[0];

    var turnCounts = { eat: 3, investigate: 2, rest: 4, play: 2, cuddle: 3, sleep: 5 };

    this.currentAction = {
      action: winner.action,
      target: winner.target,
      turnsRemaining: turnCounts[winner.action] || 0
    };

    this.bus.emit('creature:action-started', { action: winner.action, target: winner.target });
  }

  _executeAction(perception) {
    var act = this.currentAction;
    if (!act) return;

    switch (act.action) {
      case 'eat': this._doEat(act); break;
      case 'seek_food': this._doSeekFood(act, perception); break;
      case 'investigate': this._doInvestigate(act); break;
      case 'explore_room': this._doExploreRoom(); break;
      case 'wander': this._doWander(); break;
      case 'rest': this._doRest(act); break;
      case 'play': this._doPlay(act); break;
      case 'cuddle': this._doCuddle(act); break;
      case 'sleep': this._doSleep(act); break;
      case 'seek_sleep': this._doSeekSleep(act, perception); break;
      case 'seek_comfort': this._doSeekComfort(act, perception); break;
    }
  }

  _doEat(act) {
    if (act.turnsRemaining > 0) {
      this._speak('eat');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.hunger = Math.max(0, this.drives.hunger - 0.35);
        // Remove consumable user-placed food; default food_bowl is permanent
        if (act.target && act.target.userPlaced && act.target.consumable) {
          this.world.removeObject(act.target.id);
        }
        this.currentAction = null;
      }
    }
  }

  _doSeekFood(act, perception) {
    if (!act.target) { this.currentAction = null; return; }

    var food = act.target;
    // Check if food still exists
    var stillExists = perception.allFood.some(function(f) { return f.id === food.id; });
    if (!stillExists) { this.currentAction = null; return; }

    if (food.inRoom === this.room) {
      var adjacent = Math.abs(food.col - this.col) + Math.abs(food.row - this.row) <= 1;
      if (adjacent) {
        // Switch to eat
        this.currentAction = { action: 'eat', target: food, turnsRemaining: 3 };
        this.bus.emit('creature:action-started', { action: 'eat', target: food });
      } else {
        this._moveToward(food.col, food.row);
      }
    } else {
      this._moveTowardRoom(food.inRoom);
    }
    this._speak('seek_food');
  }

  _doInvestigate(act) {
    if (!act.target) { this.currentAction = null; return; }

    var obj = act.target;
    var dist = Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row);
    if (dist > 1) {
      this._moveToward(obj.col, obj.row);
    } else if (act.turnsRemaining > 0) {
      this._speak('investigate');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.knownObjects.add(obj.id);
        var novelty = obj.novelty || 0.5;
        var reduction = 0.15 + novelty * 0.25;
        this.drives.curiosity = Math.max(0, this.drives.curiosity - reduction);
        this.currentAction = null;
      }
    }
  }

  _doExploreRoom() {
    var room = this.world.getRoom(this.room);
    if (!room) return;
    var targetCol = Math.floor(Math.random() * room.cols);
    var targetRow = Math.floor(Math.random() * room.rows);
    this._moveToward(targetCol, targetRow);
    this._speak('explore_room');
    this.currentAction = null;
  }

  _doWander() {
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    // Shuffle
    for (var i = dirs.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp;
    }
    for (var i = 0; i < dirs.length; i++) {
      var nc = this.col + dirs[i][0];
      var nr = this.row + dirs[i][1];
      if (this._canStep(this.room, nc, nr)) {
        this._step(nc, nr);
        break;
      }
    }
    this._speak('wander');
    this.currentAction = null;
  }

  _doRest(act) {
    if (act.turnsRemaining > 0) {
      this._speak('rest');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.energy = Math.max(0, this.drives.energy - 0.1);
        this.currentAction = null;
      }
    }
  }

  // --- Movement ---

  _moveToward(targetCol, targetRow) {
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
  }

  _moveTowardRoom(targetRoomId) {
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
  }

  _canStep(roomId, col, row) {
    var room = this.world.getRoom(roomId);
    if (!room) return false;
    if (col < 0 || col >= room.cols || row < 0 || row >= room.rows) return false;
    if (this.world.getObjectAt(roomId, col, row)) return false;
    return true;
  }

  _step(newCol, newRow) {
    var prevCol = this.col;
    var prevRow = this.row;
    this.col = newCol;
    this.row = newRow;
    this.drives.energy = Math.min(1, this.drives.energy + 0.005);
    this.bus.emit('creature:moved', {
      room: this.room, col: this.col, row: this.row,
      prevCol: prevCol, prevRow: prevRow
    });
  }

  _closestFood(allFood) {
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
  }

  _closestTarget(items) {
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

  _doPlay(act) {
    if (act.turnsRemaining > 0) {
      this._speak('play');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.curiosity = Math.max(0, this.drives.curiosity - 0.25);
        this.currentAction = null;
      }
    }
  }

  _doCuddle(act) {
    if (act.turnsRemaining > 0) {
      this._speak('cuddle');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.comfort = Math.max(0, this.drives.comfort - 0.35);
        this.currentAction = null;
      }
    }
  }

  _doSleep(act) {
    if (act.turnsRemaining > 0) {
      this._speak('sleep');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.energy = Math.max(0, this.drives.energy - 0.4);
        this.currentAction = null;
      }
    }
  }

  _doSeekSleep(act, perception) {
    if (!act.target) { this.currentAction = null; return; }

    var target = act.target;
    var stillExists = perception.sleepable.some(function(s) { return s.id === target.id; });
    if (!stillExists) { this.currentAction = null; return; }

    if (target.inRoom === this.room) {
      var adjacent = Math.abs(target.col - this.col) + Math.abs(target.row - this.row) <= 1;
      if (adjacent) {
        this.currentAction = { action: 'sleep', target: target, turnsRemaining: 5 };
        this.bus.emit('creature:action-started', { action: 'sleep', target: target });
      } else {
        this._moveToward(target.col, target.row);
      }
    } else {
      this._moveTowardRoom(target.inRoom);
    }
    this._speak('seek_sleep');
  }

  _doSeekComfort(act, perception) {
    if (!act.target) { this.currentAction = null; return; }

    var target = act.target;
    var stillExists = perception.comfortObjects.some(function(c) { return c.id === target.id; });
    if (!stillExists) { this.currentAction = null; return; }

    if (target.inRoom === this.room) {
      var adjacent = Math.abs(target.col - this.col) + Math.abs(target.row - this.row) <= 1;
      if (adjacent) {
        this.currentAction = { action: 'cuddle', target: target, turnsRemaining: 3 };
        this.bus.emit('creature:action-started', { action: 'cuddle', target: target });
      } else {
        this._moveToward(target.col, target.row);
      }
    } else {
      this._moveTowardRoom(target.inRoom);
    }
    this._speak('seek_comfort');
  }

  // --- Speech ---

  _speak(action) {
    var lines = SPEECH_LINES[action];
    if (!lines) return;

    // Don't spam -- only speak 30% of the time for ambient actions
    if (['wander', 'explore_room', 'rest', 'sleep'].includes(action) && Math.random() > 0.3) return;

    var text = pick(lines);
    this.speech = { text: text, expiresAt: Date.now() + 3000 };
    this.bus.emit('creature:spoke', { text: text });

    if (this._speechTimer) clearTimeout(this._speechTimer);
    var self = this;
    this._speechTimer = setTimeout(function() {
      self.speech = null;
      self.bus.emit('creature:spoke', { text: null });
    }, 3000);
  }

  // --- Drag ---

  pickup() {
    this.dragging = true;
    this.drives.comfort = Math.min(1, this.drives.comfort + 0.3);
    this._speak('picked_up');
    this.bus.emit('creature:picked-up', {});
  }

  drop(room, col, row) {
    this.dragging = false;
    this._dragPixel = null;
    this.room = room;
    this.col = col;
    this.row = row;
    this.drives.curiosity = Math.min(1, this.drives.curiosity + 0.2);
    this.currentAction = null;
    this._speak('dropped');
    this.bus.emit('creature:dropped', { room: room, col: col, row: row });
  }

  // --- Persistence ---

  getState() {
    return {
      name: this.name,
      room: this.room,
      col: this.col,
      row: this.row,
      drives: {
        hunger: this.drives.hunger,
        curiosity: this.drives.curiosity,
        comfort: this.drives.comfort,
        energy: this.drives.energy
      },
      mood: this.mood,
      knownObjects: Array.from(this.knownObjects),
      currentAction: this.currentAction
        ? { action: this.currentAction.action, turnsRemaining: this.currentAction.turnsRemaining }
        : null
    };
  }

  loadState(saved) {
    if (!saved) return;
    if (saved.name) this.name = saved.name;
    if (saved.room) this.room = saved.room;
    if (saved.col != null) this.col = saved.col;
    if (saved.row != null) this.row = saved.row;
    if (saved.drives) {
      this.drives.hunger = saved.drives.hunger || 0;
      this.drives.curiosity = saved.drives.curiosity || 0;
      // Default new drives to baseline if missing (old saves)
      this.drives.comfort = saved.drives.comfort != null
        ? saved.drives.comfort : this.driveConfig.comfort.baseline;
      this.drives.energy = saved.drives.energy != null
        ? saved.drives.energy : this.driveConfig.energy.baseline;
    }
    if (saved.mood) this.mood = saved.mood;
    if (saved.knownObjects) {
      this.knownObjects = new Set(saved.knownObjects);
    }
    if (saved.currentAction) {
      this.currentAction = saved.currentAction;
    }
  }
}

export default Creature;
