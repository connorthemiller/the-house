// localStorage save/load -- persists user-placed objects and creature state

const STORAGE_KEY = 'the_house_v1';
const CREATURE_KEY = 'the_house_creature_v1';

class Persistence {
  constructor(bus, world) {
    this.bus = bus;
    this.world = world;
    this.creature = null;
    this._creatureSaveTimer = null;
    this._onChanged = this._onChanged.bind(this);
    this._onCreatureChanged = this._onCreatureChanged.bind(this);
  }

  setCreature(creature) {
    this.creature = creature;
  }

  start() {
    this.bus.on('world:object-added', this._onChanged);
    this.bus.on('world:object-removed', this._onChanged);

    // Creature events -- debounced save
    this.bus.on('creature:moved', this._onCreatureChanged);
    this.bus.on('creature:action-started', this._onCreatureChanged);
    this.bus.on('creature:dropped', this._onCreatureChanged);
    this.bus.on('creature:renamed', this._onCreatureChanged);
    this.bus.on('creature:reflected', this._onCreatureChanged);
  }

  stop() {
    this.bus.off('world:object-added', this._onChanged);
    this.bus.off('world:object-removed', this._onChanged);
    this.bus.off('creature:moved', this._onCreatureChanged);
    this.bus.off('creature:action-started', this._onCreatureChanged);
    this.bus.off('creature:dropped', this._onCreatureChanged);
    this.bus.off('creature:renamed', this._onCreatureChanged);
    this.bus.off('creature:reflected', this._onCreatureChanged);
    if (this._creatureSaveTimer) {
      clearTimeout(this._creatureSaveTimer);
      this._creatureSaveTimer = null;
    }
  }

  load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        this.world.loadState(saved);
      }
    } catch (err) {
      console.error('Persistence load error:', err);
    }
  }

  loadCreature() {
    try {
      var raw = localStorage.getItem(CREATURE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('Creature load error:', err);
      return null;
    }
  }

  save() {
    try {
      var state = this.world.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Persistence save error:', err);
    }
  }

  saveCreature() {
    if (!this.creature) return;
    try {
      var state = this.creature.getState();
      localStorage.setItem(CREATURE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Creature save error:', err);
    }
  }

  _onChanged() {
    this.save();
  }

  _onCreatureChanged() {
    // Debounce creature saves (5s)
    if (this._creatureSaveTimer) return;
    var self = this;
    this._creatureSaveTimer = setTimeout(function() {
      self._creatureSaveTimer = null;
      self.saveCreature();
    }, 5000);
  }
}

export default Persistence;
