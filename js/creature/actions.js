// Creature action selection -- score-and-pick with noise

export var methods = {
  _selectAction: function(perception) {
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
      var eatTarget = this._preferredTarget(perception.adjacentFood) || perception.adjacentFood[0];
      candidates.push({ action: 'eat', target: eatTarget,
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
      var playTarget = this._preferredTarget(perception.toys) || perception.toys[0];
      candidates.push({ action: 'play', target: playTarget,
        score: this.drives.curiosity * 1.0 + noise() });
    }

    // cuddle: comfort>0.4 AND adjacent to comfort object
    if (this.drives.comfort > 0.4 && perception.adjacentComfort.length > 0) {
      var cuddleTarget = this._preferredTarget(perception.adjacentComfort) || perception.adjacentComfort[0];
      candidates.push({ action: 'cuddle', target: cuddleTarget,
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
      var sleepTarget = this._preferredTarget(perception.adjacentSleepable) || perception.adjacentSleepable[0];
      candidates.push({ action: 'sleep', target: sleepTarget,
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

    // --- Social actions (only when companion present) ---
    if (this.companion) {
      var friendValence = this._getFriendValence();
      var socialBoost = 1 + friendValence * 0.3;

      // approach_friend: companion in room but not adjacent
      if (perception.companionNearby && !perception.companionAdjacent) {
        candidates.push({ action: 'approach_friend', target: null,
          score: 0.7 * socialBoost + noise() });
      }

      // play_together: adjacent, curiosity > 0.3
      if (perception.companionAdjacent && this.drives.curiosity > 0.3) {
        candidates.push({ action: 'play_together', target: null,
          score: (this.drives.curiosity * 0.9) * socialBoost + noise() });
      }

      // rest_together: adjacent, energy > 0.4
      if (perception.companionAdjacent && this.drives.energy > 0.4) {
        candidates.push({ action: 'rest_together', target: null,
          score: (this.drives.energy * 0.8) * socialBoost + noise() });
      }

      // share_space: adjacent, comfort > 0.3
      if (perception.companionAdjacent && this.drives.comfort > 0.3) {
        candidates.push({ action: 'share_space', target: null,
          score: (this.drives.comfort * 0.8) * socialBoost + noise() });
      }
    }

    // rest: calmer when drives are low
    var restScore = (this.drives.hunger < 0.4 && this.drives.curiosity < 0.5 &&
      this.drives.comfort < 0.4 && this.drives.energy < 0.4) ? 0.4 : 0.1;
    candidates.push({ action: 'rest', target: null, score: restScore + noise() });

    // Apply valence multiplier from memory + development score modifier + familiarity
    var mem = this.memory;
    var devMods = this.development.modifiers;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.target && c.target.id && mem[c.target.id]) {
        c.score *= (1 + mem[c.target.id].valence * 0.2);
        // Familiarity penalty for investigate/play: fresh=1.3x, fully familiar=0.3x
        if (c.action === 'investigate' || c.action === 'play') {
          c.score *= (1.3 - (mem[c.target.id].familiarity || 0));
        }
      }
      var drive = this._actionToDrive(c.action);
      if (drive && devMods[drive]) {
        c.score *= (1 + devMods[drive].scoreMod);
      }
    }

    // Pick highest score
    candidates.sort(function(a, b) { return b.score - a.score; });
    var winner = candidates[0];

    var turnCounts = { eat: 3, investigate: 2, rest: 4, play: 2, cuddle: 3, sleep: 5,
      play_together: 3, rest_together: 4, share_space: 2 };

    this.currentAction = {
      action: winner.action,
      target: winner.target,
      turnsRemaining: turnCounts[winner.action] || 0
    };

    this.bus.emit('creature:action-started', { action: winner.action, target: winner.target });
  }
};
