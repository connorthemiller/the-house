// Creature reflection -- periodic LLM introspection layer

import { callLLM, isConfigured, getSettings } from '../llm.js';

var MIN_COOLDOWN = 2 * 60 * 1000; // 2 minutes
var EVENT_THRESHOLD = 15;
var MAX_RECENT_ACTIONS = 10;
var MAX_REFLECTIONS = 20;
var MAX_INTERESTS = 5;

var SYSTEM_PROMPT =
  'You are the inner voice of a small creature living in a house. ' +
  'You experience life simply and directly. You do not know you are in a simulation. ' +
  'You think in short, fragmentary terms -- like a young animal gaining awareness. ' +
  'You have drives (hunger, curiosity, comfort, energy), a mood, memories of objects, and maybe some interests forming.\n\n' +
  'Given a snapshot of your recent experience, respond with a JSON object (no markdown, no explanation) using this exact schema:\n' +
  '{\n' +
  '  "narrative": "1-3 sentence inner experience summary in first person",\n' +
  '  "associations": [{"target": "object_id_or_room_id", "delta": -0.2 to 0.2, "reason": "brief"}],\n' +
  '  "interests": [{"topic": "short_label", "strength": 0.1 to 0.5, "reason": "brief"}],\n' +
  '  "speech": "optional short phrase to say aloud, or null"\n' +
  '}\n\n' +
  'Rules:\n' +
  '- narrative: honest, simple, sensory. Not analytical.\n' +
  '- associations: max 3. target must match an object ID or room ID from the snapshot. delta adjusts your feeling toward it.\n' +
  '- interests: max 2. topic is a short label like "warm spots" or "crunchy food". strength 0.1-0.5.\n' +
  '- speech: a short thing you might murmur aloud, or null if you feel quiet. Max 20 characters.\n' +
  '- Return ONLY valid JSON. No markdown fences, no extra text.';

function buildSnapshot(creature) {
  var now = new Date();
  var hours = now.getHours();
  var mins = now.getMinutes();
  var timeStr = (hours < 10 ? '0' : '') + hours + ':' + (mins < 10 ? '0' : '') + mins;

  // Drive percentages
  var drives = {};
  var driveKeys = Object.keys(creature.drives);
  for (var i = 0; i < driveKeys.length; i++) {
    drives[driveKeys[i]] = Math.round(creature.drives[driveKeys[i]] * 100) + '%';
  }

  // Memory highlights: top 5 by interactions
  var memHighlights = [];
  var memIds = Object.keys(creature.memory);
  var memEntries = [];
  for (var i = 0; i < memIds.length; i++) {
    memEntries.push({ id: memIds[i], entry: creature.memory[memIds[i]] });
  }
  memEntries.sort(function(a, b) { return b.entry.interactions - a.entry.interactions; });
  for (var i = 0; i < Math.min(5, memEntries.length); i++) {
    var m = memEntries[i];
    memHighlights.push({
      id: m.id,
      name: m.entry.name || m.entry.emoji,
      emoji: m.entry.emoji,
      interactions: m.entry.interactions,
      valence: Math.round(m.entry.valence * 100) / 100,
      familiarity: Math.round((m.entry.familiarity || 0) * 100) / 100
    });
  }

  // Personality traits
  var traits = [];
  if (creature._getPersonalityTraits) {
    traits = creature._getPersonalityTraits();
  }

  // Interests
  var interests = {};
  if (creature.interests) {
    var intKeys = Object.keys(creature.interests);
    for (var i = 0; i < intKeys.length; i++) {
      interests[intKeys[i]] = {
        strength: Math.round(creature.interests[intKeys[i]].strength * 100) / 100
      };
    }
  }

  // Previous reflection
  var prevReflection = null;
  if (creature.reflections && creature.reflections.length > 0) {
    prevReflection = creature.reflections[creature.reflections.length - 1].text;
  }

  return {
    name: creature.name,
    species: creature.species,
    room: creature.room,
    time: (creature._dayPhase || 'day') + ' ' + timeStr,
    drives: drives,
    mood: creature.mood,
    recentActions: (creature._recentActions || []).slice(),
    memoryHighlights: memHighlights,
    personality: traits,
    interests: interests,
    previousReflection: prevReflection
  };
}

function parseResponse(raw) {
  if (!raw) return null;

  // Strip markdown fences if present
  var text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    var obj = JSON.parse(text);
  } catch (e) {
    console.warn('Reflection: JSON parse failed', e.message);
    return null;
  }

  var result = {
    narrative: null,
    associations: [],
    interests: [],
    speech: null
  };

  // Narrative
  if (typeof obj.narrative === 'string' && obj.narrative.length > 0) {
    result.narrative = obj.narrative.slice(0, 500);
  }

  // Associations (max 3)
  if (Array.isArray(obj.associations)) {
    for (var i = 0; i < Math.min(3, obj.associations.length); i++) {
      var a = obj.associations[i];
      if (a && typeof a.target === 'string' && typeof a.delta === 'number') {
        result.associations.push({
          target: a.target,
          delta: Math.max(-0.2, Math.min(0.2, a.delta)),
          reason: typeof a.reason === 'string' ? a.reason.slice(0, 100) : ''
        });
      }
    }
  }

  // Interests (max 2)
  if (Array.isArray(obj.interests)) {
    for (var i = 0; i < Math.min(2, obj.interests.length); i++) {
      var int = obj.interests[i];
      if (int && typeof int.topic === 'string' && typeof int.strength === 'number') {
        result.interests.push({
          topic: int.topic.slice(0, 30).toLowerCase(),
          strength: Math.max(0.1, Math.min(0.5, int.strength)),
          reason: typeof int.reason === 'string' ? int.reason.slice(0, 100) : ''
        });
      }
    }
  }

  // Speech
  if (typeof obj.speech === 'string' && obj.speech.length > 0) {
    result.speech = obj.speech.slice(0, 20);
  }

  return result;
}

function applyReflection(creature, parsed) {
  if (!parsed) return;

  // Narrative -> reflections array
  if (parsed.narrative) {
    if (!creature.reflections) creature.reflections = [];
    creature.reflections.push({ text: parsed.narrative, timestamp: Date.now() });
    if (creature.reflections.length > MAX_REFLECTIONS) {
      creature.reflections.shift();
    }
  }

  // Associations -> adjust memory valence or room associations
  for (var i = 0; i < parsed.associations.length; i++) {
    var a = parsed.associations[i];
    if (creature.memory[a.target]) {
      var entry = creature.memory[a.target];
      entry.valence = Math.max(-0.2, Math.min(1.0, entry.valence + a.delta));
    } else {
      // Could be a room ID
      if (!creature.roomAssociations) creature.roomAssociations = {};
      var current = creature.roomAssociations[a.target] || 0;
      creature.roomAssociations[a.target] = Math.max(-0.2, Math.min(1.0, current + a.delta));
    }
  }

  // Interests -> merge, decay existing, cap at MAX_INTERESTS
  if (!creature.interests) creature.interests = {};

  // Decay all existing interests
  var intKeys = Object.keys(creature.interests);
  for (var i = 0; i < intKeys.length; i++) {
    creature.interests[intKeys[i]].strength *= 0.9;
    if (creature.interests[intKeys[i]].strength < 0.05) {
      delete creature.interests[intKeys[i]];
    }
  }

  // Merge new interests
  for (var i = 0; i < parsed.interests.length; i++) {
    var ni = parsed.interests[i];
    if (creature.interests[ni.topic]) {
      // Reinforce existing
      creature.interests[ni.topic].strength = Math.min(0.5,
        creature.interests[ni.topic].strength + ni.strength * 0.5);
      creature.interests[ni.topic].reason = ni.reason;
    } else {
      creature.interests[ni.topic] = {
        strength: ni.strength,
        reason: ni.reason,
        createdAt: Date.now()
      };
    }
  }

  // Cap at MAX_INTERESTS: remove weakest
  var keys = Object.keys(creature.interests);
  if (keys.length > MAX_INTERESTS) {
    keys.sort(function(a, b) {
      return creature.interests[a].strength - creature.interests[b].strength;
    });
    while (keys.length > MAX_INTERESTS) {
      delete creature.interests[keys.shift()];
    }
  }

  // Speech -> speak aloud
  if (parsed.speech) {
    creature._speak(null, null);
    // Override with reflection speech
    creature.speech = { text: parsed.speech, expiresAt: Date.now() + 4000 };
    creature.bus.emit('creature:spoke', { text: parsed.speech });
    if (creature._speechTimer) clearTimeout(creature._speechTimer);
    creature._speechTimer = setTimeout(function() {
      creature.speech = null;
      creature.bus.emit('creature:spoke', { text: null });
    }, 4000);
  }

  // Emit event
  creature.bus.emit('creature:reflected', {
    narrative: parsed.narrative,
    associationCount: parsed.associations.length,
    interestCount: parsed.interests.length,
    speech: parsed.speech
  });
}

export var methods = {
  _initReflection: function() {
    this.interests = this.interests || {};
    this.reflections = this.reflections || [];
    this.roomAssociations = this.roomAssociations || {};
    this.lastReflectionTime = this.lastReflectionTime || 0;
    this.eventsSinceReflection = this.eventsSinceReflection || 0;
    this._recentActions = this._recentActions || [];
    this._reflectionInProgress = false;
    this._driveHighsSinceReflection = {};
    this._dayPhase = this._dayPhase || 'day';
  },

  _recordReflectionEvent: function() {
    this.eventsSinceReflection = (this.eventsSinceReflection || 0) + 1;
  },

  _recordRecentAction: function(action, target) {
    if (!this._recentActions) this._recentActions = [];
    this._recentActions.push({
      action: action,
      target: target ? (target.name || target.emoji || null) : null,
      time: Date.now()
    });
    if (this._recentActions.length > MAX_RECENT_ACTIONS) {
      this._recentActions.shift();
    }
  },

  _checkReflectionTrigger: function() {
    if (!isConfigured()) return;
    if (this._reflectionInProgress) return;

    var now = Date.now();
    var timeSinceLast = now - (this.lastReflectionTime || 0);

    // Minimum cooldown
    if (timeSinceLast < MIN_COOLDOWN) return;

    var settings = getSettings();
    var intervalMs = (settings.reflectionIntervalMin || 10) * 60 * 1000;
    var triggered = false;

    // Timer trigger
    if (timeSinceLast >= intervalMs) {
      triggered = true;
    }

    // Accumulation trigger
    if ((this.eventsSinceReflection || 0) >= EVENT_THRESHOLD) {
      triggered = true;
    }

    // Significant event: drive >0.9 for first time since last reflection
    var driveKeys = ['hunger', 'curiosity', 'comfort', 'energy'];
    for (var i = 0; i < driveKeys.length; i++) {
      var k = driveKeys[i];
      if (this.drives[k] > 0.9 && !this._driveHighsSinceReflection[k]) {
        this._driveHighsSinceReflection[k] = true;
        triggered = true;
      }
    }

    // Significant event: brand-new object (0 interactions) in memory
    var memIds = Object.keys(this.memory);
    for (var i = 0; i < memIds.length; i++) {
      var entry = this.memory[memIds[i]];
      if (entry.interactions === 0 && entry._newSinceReflection) {
        triggered = true;
        delete entry._newSinceReflection;
      }
    }

    if (triggered) {
      this._triggerReflection().catch(function(err) {
        console.error('Reflection error:', err);
      });
    }
  },

  _triggerReflection: async function() {
    this._reflectionInProgress = true;

    try {
      var snapshot = buildSnapshot(this);
      var userMessage = JSON.stringify(snapshot);
      var result = await callLLM(SYSTEM_PROMPT, userMessage);

      if (result.error) {
        console.warn('Reflection failed:', result.error);
        this.bus.emit('creature:reflected', {
          narrative: null,
          associationCount: 0,
          interestCount: 0,
          speech: null,
          error: result.error
        });
      } else if (result.text) {
        var parsed = parseResponse(result.text);
        if (parsed) {
          applyReflection(this, parsed);
        }
      }
    } finally {
      this._reflectionInProgress = false;
      this.lastReflectionTime = Date.now();
      this.eventsSinceReflection = 0;
      this._driveHighsSinceReflection = {};
    }
  }
};
