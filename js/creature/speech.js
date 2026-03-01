// Creature speech -- generation and environmental reactions

var SPEECH_LINES = {
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
  seek_comfort: ['cold...', 'hmm', 'need hug'],
  react_new: ['ooh!', 'new thing!', 'hm?', 'what!'],
  approach_friend: ['friend!', 'hey!', 'over here!', 'wait up!'],
  play_together: ['fun together!', 'wheee!', 'hehe!', 'play!', 'tag!'],
  rest_together: ['cozy...', 'nice company', 'zzz...', 'peaceful'],
  share_space: ['friend...', 'together', 'nice', 'comfy']
};

var CARE_SPEECH = {
  feed:  { normal: ['mmm!', 'yum!', 'tasty!'], low: ['not hungry', 'full...', 'no thanks'] },
  pet:   { normal: ['nice...', '*purr*', 'ahhh'], low: ['ok ok', 'heh', 'enough'] },
  play:  { normal: ['fun!', 'wheee', 'yay!'], low: ['tired...', 'maybe later', 'meh'] },
  rest:  { normal: ['zzz', 'cozy', 'ahhh'], low: ['wide awake', 'not sleepy', 'nah'] }
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export var methods = {
  _speak: function(action, target) {
    // Don't spam -- only speak 30% of the time for ambient actions
    if (['wander', 'explore_room', 'rest', 'sleep'].includes(action) && Math.random() > 0.3) return;

    var text = this._generateSpeech(action, target);
    if (!text) return;

    this.speech = { text: text, expiresAt: Date.now() + 3000 };
    this.bus.emit('creature:spoke', { text: text });

    if (this._speechTimer) clearTimeout(this._speechTimer);
    var self = this;
    this._speechTimer = setTimeout(function() {
      self.speech = null;
      self.bus.emit('creature:spoke', { text: null });
    }, 3000);
  },

  _generateSpeech: function(action, target) {
    var roll = Math.random();
    var name = target && target.name ? target.name.toLowerCase() : null;
    var memEntry = target && target.id ? this.memory[target.id] : null;

    // 1. Object-specific (40-50% when target has name)
    if (name && roll < 0.45) {
      var objectLines = {
        eat: ['mmm, ' + name + '!', '*munch* ' + name, name + '!'],
        investigate: ["what's this " + name + '?', 'hmm, ' + name + '...', 'ooh, ' + name],
        play: ['wheee, ' + name + '!', '*bat* ' + name, 'fun ' + name + '!'],
        cuddle: ['cozy ' + name, '*nuzzle* ' + name, 'warm ' + name],
        sleep: ['zzz on ' + name, '*snore* ' + name],
        seek_food: [name + '?', 'want ' + name + '...'],
        seek_sleep: [name + '...', 'find ' + name],
        seek_comfort: ['need ' + name + '...', name + '?']
      };
      if (objectLines[action]) return pick(objectLines[action]);
    }

    // 2. Preference expression (25% when high valence)
    if (memEntry && memEntry.valence > 0.5 && memEntry.interactions > 3 && roll < 0.70) {
      var prefLines = ['love ' + (name || 'this') + '!', 'my ' + (name || 'fav') + '!',
        (name || 'this') + ' is best'];
      return pick(prefLines);
    }

    // 3. Mood-based (15% chance)
    if (roll < 0.85) {
      var moodLines = {
        happy: ['life is good', 'great!', 'yay'],
        content: ['nice', 'mmm', 'good'],
        hungry: ['so hungry...', 'need food', 'tummy...'],
        sleepy: ['so tired...', 'need rest', '*yaaawn*'],
        uneasy: ['not right', 'hmm...', 'uncomfortable'],
        restless: ['antsy', 'hmm', 'gotta move']
      };
      if (moodLines[this.mood]) return pick(moodLines[this.mood]);
    }

    // 4. Personality-based (20% when developed enough)
    if (this.development.totalActions > 30) {
      var traits = this._getPersonalityTraits();
      if (traits.length > 0) {
        var traitLines = {
          'explorer': ['must explore', 'what else?', 'adventure!'],
          'food-motivated': ['snack time', 'food...', 'yum?'],
          'cuddly': ['need hugs', 'cozy time', 'snuggle'],
          'nap lover': ['sleepy...', 'nap time', 'zzz'],
          'energetic': ['go go!', 'so much energy!', 'no rest!'],
          'homebody': ['home sweet home', 'comfy here', 'staying put'],
          'independent': ['I got this', 'fine alone', 'my way'],
          'light eater': ['not hungry', 'maybe later', 'full']
        };
        var trait = pick(traits);
        if (traitLines[trait]) return pick(traitLines[trait]);
      }
    }

    // 5. Fallback: canned lines
    var lines = SPEECH_LINES[action];
    return lines ? pick(lines) : null;
  },

  _speakCare: function(action, low) {
    var lines = CARE_SPEECH[action];
    if (!lines) return;
    var text = pick(low ? lines.low : lines.normal);
    this.speech = { text: text, expiresAt: Date.now() + 3000 };
    this.bus.emit('creature:spoke', { text: text });
    if (this._speechTimer) clearTimeout(this._speechTimer);
    var self = this;
    this._speechTimer = setTimeout(function() {
      self.speech = null;
      self.bus.emit('creature:spoke', { text: null });
    }, 3000);
  },

  _setupEnvReactions: function() {
    var self = this;
    this._onObjectAdded = function(data) {
      if (self.dragging) return;
      if (data.object && data.object.room === self.room && Math.random() < 0.4) {
        self._speak('react_new', data.object);
      }
    };
    this._onDayNightChanged = function(data) {
      if (self.dragging) return;
      if (Math.random() < 0.5) {
        var phase = data.phase;
        var lines = {
          dawn: ['morning...', 'bright...', '*blink*'],
          day: ['sunny', 'warm', 'daytime'],
          dusk: ['evening...', 'dimming...', 'sunset'],
          night: ['dark...', 'night...', 'stars?']
        };
        if (lines[phase]) {
          var text = pick(lines[phase]);
          self.speech = { text: text, expiresAt: Date.now() + 3000 };
          self.bus.emit('creature:spoke', { text: text });
          if (self._speechTimer) clearTimeout(self._speechTimer);
          self._speechTimer = setTimeout(function() {
            self.speech = null;
            self.bus.emit('creature:spoke', { text: null });
          }, 3000);
        }
      }
    };
    this.bus.on('world:object-added', this._onObjectAdded);
    this.bus.on('daynight:changed', this._onDayNightChanged);
  },

  _teardownEnvReactions: function() {
    if (this._onObjectAdded) {
      this.bus.off('world:object-added', this._onObjectAdded);
    }
    if (this._onDayNightChanged) {
      this.bus.off('daynight:changed', this._onDayNightChanged);
    }
  }
};
