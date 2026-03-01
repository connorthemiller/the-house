// Firebase sync -- session CRUD, puppet, real-time sync, disconnect handling

import { getDb } from './firebase-config.js';

// We dynamically import the Firebase database SDK once and cache the module
var _dbMod = null;
async function dbMod() {
  if (!_dbMod) {
    _dbMod = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js');
  }
  return _dbMod;
}

// --- Session codes ---

function generateSessionCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  var code = '';
  var bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

function generatePlayerId() {
  var hex = '0123456789abcdef';
  var id = 'p_';
  var bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (var i = 0; i < 8; i++) {
    id += hex.charAt(bytes[i] % hex.length);
  }
  return id;
}

// Get or create a persistent player ID for this browser tab
function getPlayerId() {
  var id = sessionStorage.getItem('house_player_id');
  if (!id) {
    id = generatePlayerId();
    sessionStorage.setItem('house_player_id', id);
  }
  return id;
}

// --- Puppet factory ---
// A puppet is a plain JS object that satisfies the renderer's creature interface.
// It gets updated from Firebase data rather than from local AI ticks.

function createPuppet(data) {
  return {
    name: data.name || 'friend',
    emoji: data.emoji || '',
    species: data.species || 'unknown',
    room: data.room || null,
    col: data.col || 0,
    row: data.row || 0,
    mood: data.mood || 'okay',
    currentAction: data.action ? { action: data.action } : null,
    actionTarget: null,
    dragging: data.dragging || false,
    _dragPixel: (data.dragX != null && data.dragY != null) ? { x: data.dragX, y: data.dragY } : null,
    speech: null,
    drives: { hunger: 0, curiosity: 0, comfort: 0, energy: 0 },
    // Methods the renderer/UI might call (no-ops for puppet)
    _isPuppet: true
  };
}

function _str(val, maxLen) {
  if (typeof val !== 'string') return null;
  return val.slice(0, maxLen);
}

function _num(val, min, max) {
  if (typeof val !== 'number' || isNaN(val)) return null;
  return Math.max(min, Math.min(max, val));
}

function updatePuppet(puppet, data) {
  if (!puppet || !data) return;
  var s;
  s = _str(data.name, 16); if (s != null) puppet.name = s;
  s = _str(data.emoji, 8); if (s != null) puppet.emoji = s;
  s = _str(data.room, 32); if (s != null) puppet.room = s;
  var n;
  n = _num(data.col, 0, 20); if (n != null) puppet.col = n;
  n = _num(data.row, 0, 20); if (n != null) puppet.row = n;
  s = _str(data.mood, 16); if (s != null) puppet.mood = s;
  s = _str(data.action, 32); puppet.currentAction = s ? { action: s } : null;
  puppet.dragging = !!data.dragging;
  if (data.dragX != null && data.dragY != null) {
    puppet._dragPixel = { x: data.dragX, y: data.dragY };
  } else {
    puppet._dragPixel = null;
  }
  // Speech
  if (data.speech && data.speechExpires && Date.now() < data.speechExpires) {
    puppet.speech = { text: data.speech, expiresAt: data.speechExpires };
  } else {
    puppet.speech = null;
  }
  // Drives
  if (data.drives) {
    puppet.drives.hunger = data.drives.hunger || 0;
    puppet.drives.curiosity = data.drives.curiosity || 0;
    puppet.drives.comfort = data.drives.comfort || 0;
    puppet.drives.energy = data.drives.energy || 0;
  }
}

// --- Session CRUD ---

var SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

async function createSession(locationId, creature) {
  var db = getDb();
  var mod = await dbMod();
  var code = generateSessionCode();
  var playerId = getPlayerId();

  var sessionRef = mod.ref(db, 'sessions/' + code);

  // Check if code already exists (unlikely but possible)
  var existing = await mod.get(sessionRef);
  if (existing.exists()) {
    // Try another code
    code = generateSessionCode();
    sessionRef = mod.ref(db, 'sessions/' + code);
  }

  var now = Date.now();
  // Write meta and player separately (Firebase rules grant write at
  // the meta and players/$id levels, not at the session root)
  var metaRef = mod.ref(db, 'sessions/' + code + '/meta');
  await mod.set(metaRef, {
    location: locationId,
    status: 'waiting',
    createdAt: now
  });
  var playerRef = mod.ref(db, 'sessions/' + code + '/players/' + playerId);
  await mod.set(playerRef, _creatureSnapshot(creature, null));

  // Set up onDisconnect to remove our player node
  await mod.onDisconnect(playerRef).remove();

  return { code: code, playerId: playerId };
}

async function joinSession(sessionCode, creature) {
  var db = getDb();
  var mod = await dbMod();
  var playerId = getPlayerId();

  var metaRef = mod.ref(db, 'sessions/' + sessionCode + '/meta');
  var metaSnap = await mod.get(metaRef);

  if (!metaSnap.exists()) {
    return { error: 'Session not found' };
  }

  var meta = metaSnap.val();

  // Check expiry
  if (Date.now() - meta.createdAt > SESSION_EXPIRY_MS) {
    // Clean up stale session
    var sessionRef = mod.ref(db, 'sessions/' + sessionCode);
    await mod.remove(sessionRef);
    return { error: 'Session expired' };
  }

  if (meta.status === 'ended') {
    return { error: 'Session has ended' };
  }

  // Write our player data
  var playerRef = mod.ref(db, 'sessions/' + sessionCode + '/players/' + playerId);
  await mod.set(playerRef, _creatureSnapshot(creature, null));

  // Update status to active
  await mod.set(mod.ref(db, 'sessions/' + sessionCode + '/meta/status'), 'active');

  // Set up onDisconnect
  await mod.onDisconnect(playerRef).remove();

  return {
    code: sessionCode,
    playerId: playerId,
    location: meta.location
  };
}

async function getSessionMeta(sessionCode) {
  var db = getDb();
  var mod = await dbMod();
  var metaRef = mod.ref(db, 'sessions/' + sessionCode + '/meta');
  var snap = await mod.get(metaRef);
  return snap.exists() ? snap.val() : null;
}

// --- Sync: writing local creature state to Firebase ---

function _creatureSnapshot(creature, roomId) {
  var snap = {
    name: creature.name,
    emoji: creature.emoji,
    species: creature.species || 'lobster',
    room: roomId || creature.room,
    col: creature.col,
    row: creature.row,
    mood: creature.mood || 'okay',
    action: (creature.currentAction && creature.currentAction.action) || null,
    dragging: !!creature.dragging,
    dragX: (creature._dragPixel && creature._dragPixel.x) || null,
    dragY: (creature._dragPixel && creature._dragPixel.y) || null,
    speech: (creature.speech && creature.speech.text) || null,
    speechExpires: (creature.speech && creature.speech.expiresAt) || null,
    drives: creature.drives ? {
      hunger: Math.round(creature.drives.hunger * 1000) / 1000,
      curiosity: Math.round(creature.drives.curiosity * 1000) / 1000,
      comfort: Math.round(creature.drives.comfort * 1000) / 1000,
      energy: Math.round(creature.drives.energy * 1000) / 1000
    } : null
  };
  return snap;
}

// SyncWriter -- writes local creature state on events
var WRITE_THROTTLE_MS = 200; // max 5 writes/sec

function SyncWriter(sessionCode, playerId, creature, bus) {
  this.sessionCode = sessionCode;
  this.playerId = playerId;
  this.creature = creature;
  this.bus = bus;
  this._listeners = [];
  this._playerRef = null;
  this._started = false;
  this._writeTimer = null;
  this._lastWrite = 0;
}

SyncWriter.prototype.start = async function() {
  var db = getDb();
  var mod = await dbMod();
  this._playerRef = mod.ref(db, 'sessions/' + this.sessionCode + '/players/' + this.playerId);
  this._mod = mod;
  this._started = true;

  var self = this;
  var write = function() { self._write(); };

  // Events that trigger a sync write
  var events = [
    'creature:moved', 'creature:spoke', 'creature:action-started',
    'creature:mood-changed', 'creature:picked-up', 'creature:dropped',
    'creature:dragging'
  ];

  for (var i = 0; i < events.length; i++) {
    this.bus.on(events[i], write);
    this._listeners.push({ event: events[i], fn: write });
  }

  // Initial write
  this._write();
};

SyncWriter.prototype._write = function() {
  if (!this._started || !this._playerRef) return;
  var now = Date.now();
  var self = this;
  if (now - this._lastWrite < WRITE_THROTTLE_MS) {
    // Throttle: schedule a trailing write
    if (!this._writeTimer) {
      this._writeTimer = setTimeout(function() {
        self._writeTimer = null;
        self._doWrite();
      }, WRITE_THROTTLE_MS);
    }
    return;
  }
  this._doWrite();
};

SyncWriter.prototype._doWrite = function() {
  if (!this._started || !this._playerRef) return;
  this._lastWrite = Date.now();
  var snap = _creatureSnapshot(this.creature, null);
  this._mod.set(this._playerRef, snap);
};

SyncWriter.prototype.stop = function() {
  for (var i = 0; i < this._listeners.length; i++) {
    this.bus.off(this._listeners[i].event, this._listeners[i].fn);
  }
  this._listeners = [];
  this._started = false;
  if (this._writeTimer) {
    clearTimeout(this._writeTimer);
    this._writeTimer = null;
  }
};

// --- Sync: reading remote player state from Firebase ---

// SyncReader -- listens on remote players and updates puppets
function SyncReader(sessionCode, myPlayerId, onPuppetUpdate, onPlayerJoin, onPlayerLeave) {
  this.sessionCode = sessionCode;
  this.myPlayerId = myPlayerId;
  this.onPuppetUpdate = onPuppetUpdate;
  this.onPlayerJoin = onPlayerJoin;
  this.onPlayerLeave = onPlayerLeave;
  this._unsubs = [];
  this._knownPlayers = {};
}

SyncReader.prototype.start = async function() {
  var db = getDb();
  var mod = await dbMod();
  var self = this;

  var playersRef = mod.ref(db, 'sessions/' + this.sessionCode + '/players');

  // Listen for new players joining
  var unsubAdd = mod.onChildAdded(playersRef, function(snap) {
    var pid = snap.key;
    if (pid === self.myPlayerId) return; // skip self
    var data = snap.val();
    self._knownPlayers[pid] = data;
    if (self.onPlayerJoin) self.onPlayerJoin(pid, data);

    // Also listen for changes on this specific player
    var playerRef = mod.ref(db, 'sessions/' + self.sessionCode + '/players/' + pid);
    var unsubChange = mod.onValue(playerRef, function(valSnap) {
      var val = valSnap.val();
      if (!val) return;
      self._knownPlayers[pid] = val;
      if (self.onPuppetUpdate) self.onPuppetUpdate(pid, val);
    });
    self._unsubs.push(unsubChange);
  });
  this._unsubs.push(unsubAdd);

  // Listen for players leaving
  var unsubRemove = mod.onChildRemoved(playersRef, function(snap) {
    var pid = snap.key;
    if (pid === self.myPlayerId) return;
    delete self._knownPlayers[pid];
    if (self.onPlayerLeave) self.onPlayerLeave(pid);
  });
  this._unsubs.push(unsubRemove);

  // Listen for session status changes (ended)
  var statusRef = mod.ref(db, 'sessions/' + this.sessionCode + '/meta/status');
  var unsubStatus = mod.onValue(statusRef, function(snap) {
    var status = snap.val();
    if (status === 'ended' && self.onSessionEnded) {
      self.onSessionEnded();
    }
  });
  this._unsubs.push(unsubStatus);
};

SyncReader.prototype.stop = function() {
  for (var i = 0; i < this._unsubs.length; i++) {
    if (typeof this._unsubs[i] === 'function') {
      this._unsubs[i]();
    }
  }
  this._unsubs = [];
  this._knownPlayers = {};
};

// --- Connection monitoring ---

function onConnectionChange(callback) {
  var cancelled = false;

  (async function() {
    var db = getDb();
    var mod = await dbMod();
    var connRef = mod.ref(db, '.info/connected');
    var unsub = mod.onValue(connRef, function(snap) {
      if (!cancelled) {
        callback(snap.val() === true);
      }
    });

    // Store unsub for cleanup
    onConnectionChange._unsub = function() {
      cancelled = true;
      unsub();
    };
  })();
}

onConnectionChange._unsub = null;

function stopConnectionMonitor() {
  if (onConnectionChange._unsub) {
    onConnectionChange._unsub();
    onConnectionChange._unsub = null;
  }
}

// --- End session ---

async function endSession(sessionCode) {
  var db = getDb();
  var mod = await dbMod();
  var statusRef = mod.ref(db, 'sessions/' + sessionCode + '/meta/status');
  await mod.set(statusRef, 'ended');
}

// --- Cleanup stale sessions ---
// Called client-side; only cleans sessions older than 1 hour

async function cleanupStaleSession(sessionCode) {
  var meta = await getSessionMeta(sessionCode);
  if (!meta) return false;
  if (Date.now() - meta.createdAt > SESSION_EXPIRY_MS) {
    var db = getDb();
    var mod = await dbMod();
    var sessionRef = mod.ref(db, 'sessions/' + sessionCode);
    await mod.remove(sessionRef);
    return true;
  }
  return false;
}

export {
  generateSessionCode,
  getPlayerId,
  createPuppet,
  updatePuppet,
  createSession,
  joinSession,
  getSessionMeta,
  SyncWriter,
  SyncReader,
  onConnectionChange,
  stopConnectionMonitor,
  endSession,
  cleanupStaleSession
};
