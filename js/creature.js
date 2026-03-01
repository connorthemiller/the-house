// Creature -- autonomous agent coordinator

import { methods as memoryMethods } from './creature/memory.js';
import { methods as developmentMethods } from './creature/development.js';
import { methods as drivesMethods } from './creature/drives.js';
import { methods as movementMethods } from './creature/movement.js';
import { methods as perceptionMethods } from './creature/perception.js';
import { methods as speechMethods } from './creature/speech.js';
import { methods as actionsMethods } from './creature/actions.js';
import { methods as behaviorsMethods } from './creature/behaviors.js';

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
    this.memory = {};
    this.friendMemory = {};
    this.companion = null;
    this.development = {
      actionCounts: {},
      totalActions: 0,
      modifiers: {
        hunger:    { growthMod: 0, scoreMod: 0 },
        curiosity: { growthMod: 0, scoreMod: 0 },
        comfort:   { growthMod: 0, scoreMod: 0 },
        energy:    { growthMod: 0, scoreMod: 0 }
      }
    };
    this.dragging = false;
    this._dragPixel = null;

    this._tickId = null;
    this._speechTimer = null;
  }

  start() {
    this._tickId = setInterval(() => this._tick(), 2500);
    this._setupEnvReactions();
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
    this._teardownEnvReactions();
  }

  _tick() {
    if (this.dragging) return;

    // If an object was placed on creature's cell, move off
    if (this.world.getObjectAt(this.room, this.col, this.row)) {
      this._forceMove();
      return;
    }

    this._updateDrives();
    this._decayFamiliarity();
    var prevMood = this.mood;
    this.mood = this._deriveMood();
    if (this.mood !== prevMood) {
      this.bus.emit('creature:mood-changed', { prev: prevMood, next: this.mood });
    }
    var perception = this._perceive();
    this._selectAction(perception);
    this._executeAction(perception);
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

  // --- Care ---

  receiveCare(action) {
    var CARE = {
      feed:  { drive: 'hunger',    full: 0.3, half: 0.15 },
      pet:   { drive: 'comfort',   full: 0.25, half: 0.12 },
      play:  { drive: 'curiosity', full: 0.2, half: 0.1 },
      rest:  { drive: 'energy',    full: 0.15, half: 0.07 }
    };
    var cfg = CARE[action];
    if (!cfg) return;
    var low = this.drives[cfg.drive] < 0.2;
    var amount = low ? cfg.half : cfg.full;
    this.drives[cfg.drive] = Math.max(0, this.drives[cfg.drive] - amount);
    this._speakCare(action, low);
    this.bus.emit('creature:cared', { action: action, driveAffected: cfg.drive, amount: amount });
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
      memory: this.memory,
      friendMemory: this.friendMemory,
      development: this.development,
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
    if (saved.memory) {
      this.memory = saved.memory;
      // Migration: add familiarity to old entries that lack it
      var ids = Object.keys(this.memory);
      for (var i = 0; i < ids.length; i++) {
        var entry = this.memory[ids[i]];
        if (entry.familiarity == null) {
          entry.familiarity = Math.min(1.0, entry.interactions * 0.2);
        }
      }
    } else if (saved.knownObjects) {
      // Migration from old save format
      for (var i = 0; i < saved.knownObjects.length; i++) {
        var id = saved.knownObjects[i];
        this.memory[id] = {
          name: '', emoji: '', interactions: 1,
          actions: { investigate: 1 }, lastSeen: Date.now(), valence: -0.2,
          familiarity: 0.2
        };
      }
    }
    if (saved.friendMemory) {
      this.friendMemory = saved.friendMemory;
    }
    if (saved.development) {
      this.development = saved.development;
    }
    if (saved.currentAction) {
      this.currentAction = saved.currentAction;
    }
  }
}

Object.assign(Creature.prototype,
  memoryMethods, developmentMethods, drivesMethods,
  movementMethods, perceptionMethods, speechMethods,
  actionsMethods, behaviorsMethods
);

export default Creature;
