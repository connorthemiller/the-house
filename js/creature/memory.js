// Creature memory -- interaction tracking and valence

export var methods = {
  _recordInteraction: function(target, action) {
    if (!target || !target.id) return;
    var entry = this.memory[target.id];
    if (!entry) {
      entry = {
        name: target.name || '',
        emoji: target.emoji || '',
        interactions: 0,
        actions: {},
        lastSeen: Date.now(),
        valence: 0,
        familiarity: 0
      };
      this.memory[target.id] = entry;
    }
    entry.interactions++;
    entry.actions[action] = (entry.actions[action] || 0) + 1;
    entry.lastSeen = Date.now();
    entry.name = target.name || entry.name;
    entry.emoji = target.emoji || entry.emoji;
    entry.familiarity = Math.min(1.0, (entry.familiarity || 0) + 0.2);
    entry.valence = this._computeValence(entry);
    this.bus.emit('creature:memory-updated', { objectId: target.id, entry: entry });
  },

  _decayFamiliarity: function() {
    var now = Date.now();
    var ids = Object.keys(this.memory);
    for (var i = 0; i < ids.length; i++) {
      var entry = this.memory[ids[i]];
      if (entry.familiarity > 0) {
        // Lose 0.1 per 10 minutes since lastSeen
        var minutesAway = (now - entry.lastSeen) / 60000;
        var decay = Math.floor(minutesAway / 10) * 0.1;
        if (decay > 0) {
          entry.familiarity = Math.max(0, entry.familiarity - decay);
        }
      }
    }
  },

  _computeValence: function(entry) {
    if (entry.interactions === 0) return 0;
    var positive = (entry.actions.eat || 0) + (entry.actions.play || 0) +
      (entry.actions.cuddle || 0) + (entry.actions.sleep || 0);
    var ratio = positive / entry.interactions;
    // Shift from [0,1] to [-0.2, 1.0]
    return ratio * 1.2 - 0.2;
  },

  _preferredTarget: function(candidates) {
    var mem = this.memory;
    var sorted = candidates.slice().sort(function(a, b) {
      var va = (mem[a.id] && mem[a.id].valence) || 0;
      var vb = (mem[b.id] && mem[b.id].valence) || 0;
      return vb - va;
    });
    return sorted[0] || null;
  }
};
