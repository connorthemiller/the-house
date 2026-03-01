// Playdate -- packet encoding, URL parsing, guest instantiation, UI wiring

import Creature from './creature.js';

// --- Creature Packet Encode/Decode ---

function encodeCreaturePacket(creature) {
  var packet = {
    v: 1,
    n: creature.name,
    s: creature.species,
    e: creature.emoji,
    d: {
      h: Math.round(creature.drives.hunger * 1000) / 1000,
      c: Math.round(creature.drives.curiosity * 1000) / 1000,
      o: Math.round(creature.drives.comfort * 1000) / 1000,
      e: Math.round(creature.drives.energy * 1000) / 1000
    },
    dc: {
      h: { g: creature.driveConfig.hunger.growthRate, b: creature.driveConfig.hunger.baseline },
      c: { g: creature.driveConfig.curiosity.growthRate, b: creature.driveConfig.curiosity.baseline },
      o: { g: creature.driveConfig.comfort.growthRate, b: creature.driveConfig.comfort.baseline },
      e: { g: creature.driveConfig.energy.growthRate, b: creature.driveConfig.energy.baseline }
    },
    dm: {
      h: { gm: creature.development.modifiers.hunger.growthMod, sm: creature.development.modifiers.hunger.scoreMod },
      c: { gm: creature.development.modifiers.curiosity.growthMod, sm: creature.development.modifiers.curiosity.scoreMod },
      o: { gm: creature.development.modifiers.comfort.growthMod, sm: creature.development.modifiers.comfort.scoreMod },
      e: { gm: creature.development.modifiers.energy.growthMod, sm: creature.development.modifiers.energy.scoreMod }
    },
    ta: creature.development.totalActions,
    ts: Date.now()
  };
  // Include friend memory if any
  if (creature.friendMemory && Object.keys(creature.friendMemory).length > 0) {
    packet.fm = creature.friendMemory;
  }
  var json = JSON.stringify(packet);
  // UTF-8 safe base64 encoding (handles emoji)
  var bytes = new TextEncoder().encode(json);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeCreaturePacket(base64Str) {
  try {
    // UTF-8 safe base64 decoding (handles emoji)
    var binary = atob(base64Str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    var json = new TextDecoder().decode(bytes);
    var p = JSON.parse(json);
    if (p.v !== 1) return null;

    // Check 8-hour expiry
    if (p.ts && Date.now() - p.ts > 8 * 60 * 60 * 1000) {
      return null;
    }

    return {
      name: p.n,
      species: p.s,
      emoji: p.e,
      drives: {
        hunger: p.d.h,
        curiosity: p.d.c,
        comfort: p.d.o,
        energy: p.d.e
      },
      driveConfig: {
        hunger: { growthRate: p.dc.h.g, baseline: p.dc.h.b },
        curiosity: { growthRate: p.dc.c.g, baseline: p.dc.c.b },
        comfort: { growthRate: p.dc.o.g, baseline: p.dc.o.b },
        energy: { growthRate: p.dc.e.g, baseline: p.dc.e.b }
      },
      devModifiers: {
        hunger: { growthMod: p.dm.h.gm, scoreMod: p.dm.h.sm },
        curiosity: { growthMod: p.dm.c.gm, scoreMod: p.dm.c.sm },
        comfort: { growthMod: p.dm.o.gm, scoreMod: p.dm.o.sm },
        energy: { growthMod: p.dm.e.gm, scoreMod: p.dm.e.sm }
      },
      totalActions: p.ta,
      friendMemory: p.fm || {}
    };
  } catch (e) {
    console.error('Failed to decode creature packet:', e);
    return null;
  }
}

// --- URL Parsing ---

function parsePlaydateHash() {
  var hash = window.location.hash;
  if (!hash || hash.indexOf('#playdate=') !== 0) return null;

  var params = {};
  var parts = hash.slice(1).split('&');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq === -1) continue;
    params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
  }

  if (!params.playdate || !params.guest) return null;

  var guestData = decodeCreaturePacket(decodeURIComponent(params.guest));
  if (!guestData) return null;

  return {
    location: params.playdate,
    guest: guestData
  };
}

// --- Link Generation ---

function generatePlaydateLink(creature, locationId) {
  var packet = encodeCreaturePacket(creature);
  var base = window.location.origin + window.location.pathname;
  return base + '#playdate=' + locationId + '&guest=' + encodeURIComponent(packet);
}

// --- NOOP Bus ---

var NOOP_BUS = { on: function(){}, off: function(){}, emit: function(){} };

// --- Guest Creature Factory ---

function createGuestCreature(guestData, world) {
  var config = {
    name: guestData.name,
    species: guestData.species,
    emoji: guestData.emoji,
    startRoom: world.getRoomOrder()[0],
    startCol: 1,
    startRow: 1,
    drives: guestData.driveConfig
  };

  var guest = new Creature(NOOP_BUS, world, config);

  // Restore drives
  guest.drives.hunger = guestData.drives.hunger;
  guest.drives.curiosity = guestData.drives.curiosity;
  guest.drives.comfort = guestData.drives.comfort;
  guest.drives.energy = guestData.drives.energy;

  // Restore development modifiers
  guest.development.totalActions = guestData.totalActions;
  guest.development.modifiers = guestData.devModifiers;

  // Restore friend memory
  if (guestData.friendMemory) {
    guest.friendMemory = guestData.friendMemory;
  }

  return guest;
}

// --- Friend Memory Persistence ---

var PLAYDATE_HISTORY_KEY = 'the_house_playdate_history';

function savePlaydateResult(creature, guestData, locationId) {
  // Record friend interaction in creature's friendMemory
  var friendKey = guestData.name + '_' + guestData.species;
  if (!creature.friendMemory) creature.friendMemory = {};

  var entry = creature.friendMemory[friendKey];
  if (!entry) {
    entry = {
      name: guestData.name,
      species: guestData.species,
      emoji: guestData.emoji,
      playdates: 0,
      totalInteractions: 0,
      lastSeen: Date.now(),
      actions: {},
      valence: 0.2
    };
    creature.friendMemory[friendKey] = entry;
  }
  entry.playdates++;
  entry.lastSeen = Date.now();
}

export {
  encodeCreaturePacket,
  decodeCreaturePacket,
  parsePlaydateHash,
  generatePlaydateLink,
  createGuestCreature,
  savePlaydateResult,
  NOOP_BUS
};
