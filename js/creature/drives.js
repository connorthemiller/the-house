// Creature drives -- growth and mood derivation

export var methods = {
  _updateDrives: function() {
    var dm = this.development.modifiers;
    this.drives.hunger = Math.max(0, Math.min(1, this.drives.hunger + this.driveConfig.hunger.growthRate + dm.hunger.growthMod));
    this.drives.curiosity = Math.max(0, Math.min(1, this.drives.curiosity + this.driveConfig.curiosity.growthRate + dm.curiosity.growthMod));
    this.drives.comfort = Math.max(0, Math.min(1, this.drives.comfort + this.driveConfig.comfort.growthRate + dm.comfort.growthMod));
    this.drives.energy = Math.max(0, Math.min(1, this.drives.energy + this.driveConfig.energy.growthRate + dm.energy.growthMod));

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
  },

  _deriveMood: function() {
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
};
