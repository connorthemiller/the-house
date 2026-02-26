// localStorage save/load -- persists user-placed objects

const STORAGE_KEY = 'the_house_v1';

class Persistence {
  constructor(bus, world) {
    this.bus = bus;
    this.world = world;
    this._onChanged = this._onChanged.bind(this);
  }

  start() {
    this.bus.on('world:object-added', this._onChanged);
    this.bus.on('world:object-removed', this._onChanged);
  }

  stop() {
    this.bus.off('world:object-added', this._onChanged);
    this.bus.off('world:object-removed', this._onChanged);
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.world.loadState(saved);
    } catch (err) {
      console.error('Persistence load error:', err);
    }
  }

  save() {
    try {
      const state = this.world.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Persistence save error:', err);
    }
  }

  _onChanged() {
    this.save();
  }
}

export default Persistence;
