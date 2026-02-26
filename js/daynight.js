// Day/night cycle -- uses browser local time

class DayNight {
  constructor(bus) {
    this.bus = bus;
    this.phase = null;
    this.brightness = 1.0;
    this.windowEmoji = '\u2600\ufe0f';
    this.intervalId = null;
  }

  start() {
    this.update();
    this.intervalId = setInterval(() => this.update(), 60000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  update() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const prev = this.phase;
    const result = this._calcPhase(timeInMinutes);

    this.phase = result.phase;
    this.brightness = result.brightness;
    this.windowEmoji = result.windowEmoji;

    if (prev !== null && prev !== this.phase) {
      this.bus.emit('daynight:changed', this.getTimeOfDay());
    }
    // Also emit on first call so renderer can pick it up
    if (prev === null) {
      this.bus.emit('daynight:changed', this.getTimeOfDay());
    }
  }

  _calcPhase(timeInMinutes) {
    // Dawn: 6:30-7:00 (390-420)
    // Day: 7:00-18:30 (420-1110)
    // Dusk: 18:30-19:00 (1110-1140)
    // Night: 19:00-6:30 (1140-390)

    const DAWN_START = 390;
    const DAY_START = 420;
    const DUSK_START = 1110;
    const NIGHT_START = 1140;

    if (timeInMinutes >= DAY_START && timeInMinutes < DUSK_START) {
      return { phase: 'day', brightness: 1.0, windowEmoji: '\u2600\ufe0f' };
    } else if (timeInMinutes >= DUSK_START && timeInMinutes < NIGHT_START) {
      // Dusk transition
      const t = (timeInMinutes - DUSK_START) / (NIGHT_START - DUSK_START);
      return { phase: 'dusk', brightness: 1.0 - t * 0.7, windowEmoji: '\ud83c\udf05' };
    } else if (timeInMinutes >= DAWN_START && timeInMinutes < DAY_START) {
      // Dawn transition
      const t = (timeInMinutes - DAWN_START) / (DAY_START - DAWN_START);
      return { phase: 'dawn', brightness: 0.3 + t * 0.7, windowEmoji: '\ud83c\udf04' };
    } else {
      return { phase: 'night', brightness: 0.3, windowEmoji: '\ud83c\udf19' };
    }
  }

  getTimeOfDay() {
    return {
      phase: this.phase,
      brightness: this.brightness,
      windowEmoji: this.windowEmoji
    };
  }
}

export default DayNight;
