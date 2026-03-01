// Creature behaviors -- action execution

export var methods = {
  _executeAction: function(perception) {
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
  },

  _doEat: function(act) {
    if (act.turnsRemaining > 0) {
      this._speak('eat', act.target);
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.hunger = Math.max(0, this.drives.hunger - 0.35);
        this._recordInteraction(act.target, 'eat');
        this._updateDevelopment('eat');
        // Remove consumable user-placed food; default food_bowl is permanent
        if (act.target && act.target.userPlaced && act.target.consumable) {
          this.world.removeObject(act.target.id);
        }
        this.currentAction = null;
      }
    }
  },

  _doSeekFood: function(act, perception) {
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
    this._speak('seek_food', act.target);
  },

  _doInvestigate: function(act) {
    if (!act.target) { this.currentAction = null; return; }

    var obj = act.target;
    var dist = Math.abs(obj.col - this.col) + Math.abs(obj.row - this.row);
    if (dist > 1) {
      this._moveToward(obj.col, obj.row);
    } else if (act.turnsRemaining > 0) {
      this._speak('investigate', act.target);
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this._recordInteraction(obj, 'investigate');
        this._updateDevelopment('investigate');
        var novelty = obj.novelty || 0.5;
        var familiarity = (this.memory[obj.id] && this.memory[obj.id].familiarity) || 0;
        var reduction = (0.15 + novelty * 0.25) * (1 - familiarity);
        this.drives.curiosity = Math.max(0, this.drives.curiosity - reduction);
        this.currentAction = null;
      }
    }
  },

  _doExploreRoom: function() {
    var room = this.world.getRoom(this.room);
    if (!room) return;
    var targetCol = Math.floor(Math.random() * room.cols);
    var targetRow = Math.floor(Math.random() * room.rows);
    this._moveToward(targetCol, targetRow);
    this._speak('explore_room');
    this._updateDevelopment('explore_room');
    this.currentAction = null;
  },

  _doWander: function() {
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
    this._updateDevelopment('wander');
    this.currentAction = null;
  },

  _doRest: function(act) {
    if (act.turnsRemaining > 0) {
      this._speak('rest');
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.energy = Math.max(0, this.drives.energy - 0.1);
        this._updateDevelopment('rest');
        this.currentAction = null;
      }
    }
  },

  _doPlay: function(act) {
    if (act.turnsRemaining > 0) {
      this._speak('play', act.target);
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.curiosity = Math.max(0, this.drives.curiosity - 0.25);
        this._recordInteraction(act.target, 'play');
        this._updateDevelopment('play');
        this.currentAction = null;
      }
    }
  },

  _doCuddle: function(act) {
    if (act.turnsRemaining > 0) {
      this._speak('cuddle', act.target);
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.comfort = Math.max(0, this.drives.comfort - 0.35);
        this._recordInteraction(act.target, 'cuddle');
        this._updateDevelopment('cuddle');
        this.currentAction = null;
      }
    }
  },

  _doSleep: function(act) {
    if (act.turnsRemaining > 0) {
      this._speak('sleep', act.target);
      act.turnsRemaining--;
      if (act.turnsRemaining === 0) {
        this.drives.energy = Math.max(0, this.drives.energy - 0.4);
        this._recordInteraction(act.target, 'sleep');
        this._updateDevelopment('sleep');
        this.currentAction = null;
      }
    }
  },

  _doSeekSleep: function(act, perception) {
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
    this._speak('seek_sleep', act.target);
  },

  _doSeekComfort: function(act, perception) {
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
    this._speak('seek_comfort', act.target);
  }
};
