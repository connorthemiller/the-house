// Creature development -- action counting and personality growth

export var methods = {
  _actionToDrive: function(action) {
    switch (action) {
      case 'eat': case 'seek_food': return 'hunger';
      case 'investigate': case 'explore_room': case 'play': case 'play_together': return 'curiosity';
      case 'cuddle': case 'rest': case 'seek_comfort': case 'share_space': case 'rest_together': return 'comfort';
      case 'sleep': case 'seek_sleep': return 'energy';
      default: return null;
    }
  },

  _updateDevelopment: function(action) {
    this.development.actionCounts[action] = (this.development.actionCounts[action] || 0) + 1;
    this.development.totalActions++;

    if (this.development.totalActions < 10) return;

    // Count actions per drive category
    var driveCounts = { hunger: 0, curiosity: 0, comfort: 0, energy: 0 };
    var actions = Object.keys(this.development.actionCounts);
    for (var i = 0; i < actions.length; i++) {
      var drive = this._actionToDrive(actions[i]);
      if (drive) {
        driveCounts[drive] += this.development.actionCounts[actions[i]];
      }
    }

    var total = this.development.totalActions;
    var drives = ['hunger', 'curiosity', 'comfort', 'energy'];
    for (var i = 0; i < drives.length; i++) {
      var d = drives[i];
      var ratio = driveCounts[d] / total;
      var deviation = ratio - 0.25; // expected even = 0.25
      this.development.modifiers[d].growthMod = deviation * 0.30;
      this.development.modifiers[d].scoreMod = deviation * 0.15;
    }
  },

  _getPersonalityTraits: function() {
    if (this.development.totalActions < 20) return [];
    var traits = [];
    var mods = this.development.modifiers;
    if (mods.curiosity.growthMod > 0.02) traits.push('explorer');
    if (mods.curiosity.growthMod < -0.02) traits.push('homebody');
    if (mods.hunger.growthMod > 0.02) traits.push('food-motivated');
    if (mods.hunger.growthMod < -0.02) traits.push('light eater');
    if (mods.comfort.growthMod > 0.02) traits.push('cuddly');
    if (mods.comfort.growthMod < -0.02) traits.push('independent');
    if (mods.energy.growthMod > 0.02) traits.push('nap lover');
    if (mods.energy.growthMod < -0.02) traits.push('energetic');
    return traits;
  }
};
