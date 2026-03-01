// Main entry point -- init, event wiring, render loop

import EventBus from './eventbus.js';
import World from './world.js';
import DayNight from './daynight.js';
import Renderer from './renderer.js';
import Input from './input.js';
import UI from './ui.js';
import Persistence from './persistence.js';
import Creature from './creature.js';
import ActivityLog from './activitylog.js';
import { parsePlaydateHash, createGuestCreature, savePlaydateResult, generatePlaydateLink } from './playdate.js';
import { initFirebase, isFirebaseAvailable } from './firebase-config.js';
import {
  createSession, joinSession, getSessionMeta,
  getPlayerId, createPuppet, updatePuppet,
  SyncWriter, SyncReader,
  onConnectionChange, stopConnectionMonitor,
  endSession as fbEndSession
} from './firebase-sync.js';

var CREATURE_CONFIG = {
  name: 'Lobster',
  species: 'lobster',
  emoji: '\uD83E\uDD9E',
  startRoom: 'living_room',
  startCol: 4,
  startRow: 2,
  drives: {
    hunger:    { growthRate: 0.02, baseline: 0.3 },
    curiosity: { growthRate: 0.03, baseline: 0.5 },
    comfort:   { growthRate: 0.015, baseline: 0.2 },
    energy:    { growthRate: 0.01, baseline: 0.2 }
  }
};

function showNamingModal(emoji) {
  return new Promise(function(resolve) {
    var modal = document.getElementById('naming-modal');
    var input = document.getElementById('naming-input');
    var btn = document.getElementById('naming-confirm');
    var emojiEl = document.getElementById('modal-emoji');

    emojiEl.textContent = emoji;
    modal.style.display = 'flex';
    input.value = '';
    input.focus();

    function confirm() {
      var name = input.value.trim();
      if (!name) return;
      modal.style.display = 'none';
      btn.removeEventListener('click', confirm);
      input.removeEventListener('keydown', onKey);
      resolve(name);
    }

    function onKey(e) {
      if (e.key === 'Enter') confirm();
    }

    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', onKey);
  });
}

// --- Home mode (normal) ---

async function initHome() {
  const [houseData, objectsData] = await Promise.all([
    fetch('data/house.json').then(r => r.json()),
    fetch('data/objects.json').then(r => r.json())
  ]);

  const bus = new EventBus();
  const world = new World(bus);
  const daynight = new DayNight(bus);

  world.loadHouse(houseData, objectsData);

  const persistence = new Persistence(bus, world);
  persistence.load();

  const creature = new Creature(bus, world, CREATURE_CONFIG);
  var savedCreature = persistence.loadCreature();
  if (savedCreature) {
    creature.loadState(savedCreature);
  } else {
    var chosenName = await showNamingModal(CREATURE_CONFIG.emoji);
    creature.name = chosenName;
  }
  persistence.setCreature(creature);

  const canvas = document.getElementById('house-canvas');
  const renderer = new Renderer(canvas, world, daynight);
  renderer.setCreature(creature);
  renderer.init();

  const input = new Input(canvas, renderer, world, bus);
  input.setCreature(creature);
  input.start();

  const ui = new UI(bus, world, renderer);
  ui.setCreature(creature);
  ui.start();

  persistence.start();
  daynight.start();

  const activityLog = new ActivityLog(bus);
  activityLog.start();

  creature.start();

  const scheduleRender = () => {
    requestAnimationFrame(() => {
      renderer.render();
      ui.updateDrives();
    });
  };

  bus.on('daynight:changed', scheduleRender);
  bus.on('world:object-added', scheduleRender);
  bus.on('world:object-removed', scheduleRender);
  bus.on('creature:moved', scheduleRender);
  bus.on('creature:action-started', scheduleRender);
  bus.on('creature:spoke', scheduleRender);
  bus.on('creature:dragging', scheduleRender);
  bus.on('object:dragging', scheduleRender);
  bus.on('creature:dropped', scheduleRender);
  bus.on('creature:room-changed', scheduleRender);
  bus.on('creature:picked-up', scheduleRender);
  bus.on('creature:renamed', scheduleRender);
  bus.on('creature:memory-updated', scheduleRender);
  bus.on('creature:cared', scheduleRender);
  bus.on('creature:mood-changed', scheduleRender);

  bus.on('nav:room-changed', (data) => {
    renderer.setCurrentRoom(data.roomId);
    ui._updateNav();
    scheduleRender();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newMode = window.innerWidth < 600 ? 'single' : 'panorama';
      renderer.setMode(newMode);
      ui._updateNav();
      scheduleRender();
    }, 250);
  });

  renderer.render();
  ui.updateDrives();

  // --- Playdate button wiring ---
  var playdateBtn = document.getElementById('playdate-btn');
  if (playdateBtn) {
    // Show offline label if Firebase not available
    if (!isFirebaseAvailable()) {
      var offLabel = document.createElement('span');
      offLabel.className = 'offline-label';
      offLabel.textContent = '(offline)';
      playdateBtn.appendChild(offLabel);
    }

    playdateBtn.addEventListener('click', function() {
      showLocationPicker(creature);
    });
  }
}

// --- Location picker ---

function showLocationPicker(creature) {
  var modal = document.getElementById('location-picker-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  var btns = modal.querySelectorAll('[data-location]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = function() {
      var loc = this.dataset.location;
      modal.style.display = 'none';

      if (isFirebaseAvailable()) {
        startRealtimePlaydate(creature, loc);
      } else {
        showInviteModal(creature, loc);
      }
    };
  }

  var cancelBtn = modal.querySelector('[data-action="cancel"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() { modal.style.display = 'none'; };
  }
}

function showInviteModal(creature, locationId) {
  var modal = document.getElementById('invite-modal');
  if (!modal) return;

  var link = generatePlaydateLink(creature, locationId);
  var linkEl = modal.querySelector('.invite-link');
  if (linkEl) linkEl.value = link;

  modal.style.display = 'flex';

  var copyBtn = modal.querySelector('[data-action="copy"]');
  if (copyBtn) {
    copyBtn.onclick = function() {
      navigator.clipboard.writeText(link).then(function() {
        copyBtn.textContent = 'copied!';
        setTimeout(function() { copyBtn.textContent = 'copy link'; }, 2000);
      });
    };
  }

  var closeBtn = modal.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.onclick = function() { modal.style.display = 'none'; };
  }
}

// --- Playdate mode ---

async function initPlaydate(playdateInfo) {
  var locationData = await fetch('data/playdate-locations.json').then(r => r.json());
  var loc = locationData.locations[playdateInfo.location];
  if (!loc) {
    console.error('Unknown playdate location:', playdateInfo.location);
    // Fallback to home
    window.location.hash = '';
    initHome();
    return;
  }

  var bus = new EventBus();
  var world = new World(bus);
  var daynight = new DayNight(bus);

  // Load single-room world from playdate location
  var houseData = {
    rooms: [loc.room],
    doorways: []
  };
  world.loadHouse(houseData, loc.objects);

  // Create host creature from localStorage
  var persistence = new Persistence(bus, world);
  var creature = new Creature(bus, world, {
    name: CREATURE_CONFIG.name,
    species: CREATURE_CONFIG.species,
    emoji: CREATURE_CONFIG.emoji,
    startRoom: loc.room.id,
    startCol: 2,
    startRow: 3,
    drives: CREATURE_CONFIG.drives
  });
  var savedCreature = persistence.loadCreature();
  if (savedCreature) {
    creature.loadState(savedCreature);
  }
  // Place host in playdate room
  creature.room = loc.room.id;
  creature.col = 2;
  creature.row = 3;
  creature.currentAction = null;

  // Create guest creature from URL packet
  var guest = createGuestCreature(playdateInfo.guest, world);
  // Place guest at different position
  guest.room = loc.room.id;
  guest.col = loc.room.cols - 3;
  guest.row = 2;

  // Wire companions
  creature.companion = guest;
  guest.companion = creature;

  // Hide home-only UI
  var drivesHud = document.getElementById('drives-hud');
  var careBar = document.getElementById('care-bar');
  var roomNav = document.getElementById('room-nav');
  if (drivesHud) drivesHud.style.display = 'none';
  if (careBar) careBar.style.display = 'none';
  if (roomNav) roomNav.style.display = 'none';
  var playdateBtn = document.getElementById('playdate-btn');
  if (playdateBtn) playdateBtn.style.display = 'none';

  // Show playdate HUD
  var playdateHud = document.getElementById('playdate-hud');
  if (playdateHud) {
    playdateHud.style.display = 'flex';
    var locLabel = playdateHud.querySelector('.playdate-location');
    if (locLabel) locLabel.textContent = loc.room.name;
    var guestLabel = playdateHud.querySelector('.playdate-guest-name');
    if (guestLabel) guestLabel.textContent = guest.name + ' ' + guest.emoji;
  }

  // Timer
  var startTime = Date.now();
  var timerEl = document.getElementById('playdate-timer');
  var timerInterval = null;
  if (timerEl) {
    timerInterval = setInterval(function() {
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  // Canvas + renderer
  var canvas = document.getElementById('house-canvas');
  var renderer = new Renderer(canvas, world, daynight);
  renderer.setCreature(creature);
  renderer.setGuestCreature(guest);
  // Force single-room mode for playdate
  renderer.mode = 'single';
  renderer.currentRoomId = loc.room.id;
  renderer.roomLayout = renderer._computeLayout();
  canvas.width = renderer.roomLayout.totalWidth;
  canvas.height = renderer.roomLayout.totalHeight;

  // Input -- playdate mode (no object drag, no emoji picker)
  var input = new Input(canvas, renderer, world, bus);
  input.setCreature(creature);
  input.playdateMode = true;
  input.guestCreature = guest;
  input.start();

  // UI in playdate mode
  var ui = new UI(bus, world, renderer);
  ui.setCreature(creature);
  ui.playdateMode = true;
  ui.guestCreature = guest;
  ui.start();

  // Title
  var h1 = document.querySelector('h1');
  if (h1) h1.textContent = 'PLAYDATE';

  daynight.start();

  var activityLog = new ActivityLog(bus);
  activityLog.start();

  // Start host creature
  creature.start();

  // Start guest ticking independently
  guest.start();

  // Render loop -- poll guest state too
  var scheduleRender = function() {
    requestAnimationFrame(function() {
      renderer.render();
    });
  };

  bus.on('daynight:changed', scheduleRender);
  bus.on('world:object-added', scheduleRender);
  bus.on('world:object-removed', scheduleRender);
  bus.on('creature:moved', scheduleRender);
  bus.on('creature:action-started', scheduleRender);
  bus.on('creature:spoke', scheduleRender);
  bus.on('creature:dragging', scheduleRender);
  bus.on('creature:dropped', scheduleRender);
  bus.on('creature:room-changed', scheduleRender);
  bus.on('creature:picked-up', scheduleRender);
  bus.on('creature:memory-updated', scheduleRender);
  bus.on('creature:cared', scheduleRender);
  bus.on('creature:mood-changed', scheduleRender);
  bus.on('creature:friend-interaction', scheduleRender);

  // Poll guest for render updates (guest uses NOOP_BUS, no events)
  var guestPollId = setInterval(scheduleRender, 2500);

  // Tab visibility -- pause/resume both creatures
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      creature.stop();
      guest.stop();
    } else {
      creature.start();
      guest.start();
    }
  });

  // End playdate
  var endBtn = document.getElementById('playdate-end');
  if (endBtn) {
    endBtn.addEventListener('click', function() {
      // Stop everything
      creature.stop();
      guest.stop();
      clearInterval(guestPollId);
      if (timerInterval) clearInterval(timerInterval);

      // Save friend memory on host
      savePlaydateResult(creature, playdateInfo.guest, playdateInfo.location);

      // Save creature state
      persistence.setCreature(creature);
      persistence.saveCreature();

      // Show share-back modal
      showShareBackModal(creature, playdateInfo.location);
    });
  }

  renderer.render();
}

function showShareBackModal(creature, locationId) {
  var modal = document.getElementById('shareback-modal');
  if (!modal) return;

  var link = generatePlaydateLink(creature, locationId);
  var linkEl = modal.querySelector('.shareback-link');
  if (linkEl) linkEl.value = link;

  modal.style.display = 'flex';

  var copyBtn = modal.querySelector('[data-action="copy"]');
  if (copyBtn) {
    copyBtn.onclick = function() {
      navigator.clipboard.writeText(link).then(function() {
        copyBtn.textContent = 'copied!';
        setTimeout(function() { copyBtn.textContent = 'copy link'; }, 2000);
      });
    };
  }

  var homeBtn = modal.querySelector('[data-action="home"]');
  if (homeBtn) {
    homeBtn.onclick = function() {
      window.location.hash = '';
      window.location.reload();
    };
  }
}

// --- Real-time playdate (Firebase) ---

async function startRealtimePlaydate(creature, locationId) {
  try {
    var result = await createSession(locationId, creature);
    var code = result.code;

    // Show session modal with code + link
    var sessionModal = document.getElementById('session-modal');
    var codeDisplay = document.getElementById('session-code-display');
    var linkInput = document.getElementById('session-link-input');
    var statusEl = document.getElementById('session-status');
    var copyBtn = document.getElementById('session-copy-btn');
    var closeBtn = document.getElementById('session-close-btn');

    var joinLink = window.location.origin + window.location.pathname + '#session=' + code;

    codeDisplay.textContent = code;
    linkInput.value = joinLink;
    statusEl.textContent = 'waiting for friend...';
    statusEl.className = 'session-status';
    sessionModal.style.display = 'flex';

    copyBtn.onclick = function() {
      navigator.clipboard.writeText(joinLink).then(function() {
        copyBtn.textContent = 'copied!';
        setTimeout(function() { copyBtn.textContent = 'copy link'; }, 2000);
      });
    };

    closeBtn.onclick = function() {
      sessionModal.style.display = 'none';
      // Navigate into the playdate
      initRealtimePlaydate(code, locationId, true);
    };
  } catch (err) {
    console.error('Failed to create session:', err);
    // Fallback to async
    showInviteModal(creature, locationId);
  }
}

async function initRealtimePlaydate(sessionCode, locationId, isHost) {
  var locationData = await fetch('data/playdate-locations.json').then(function(r) { return r.json(); });
  var loc = locationData.locations[locationId];
  if (!loc) {
    console.error('Unknown playdate location:', locationId);
    window.location.hash = '';
    window.location.reload();
    return;
  }

  var bus = new EventBus();
  var world = new World(bus);
  var daynight = new DayNight(bus);

  // Load single-room world from playdate location
  var houseData = { rooms: [loc.room], doorways: [] };
  world.loadHouse(houseData, loc.objects);

  // Create host creature from localStorage
  var persistence = new Persistence(bus, world);
  var creature = new Creature(bus, world, {
    name: CREATURE_CONFIG.name,
    species: CREATURE_CONFIG.species,
    emoji: CREATURE_CONFIG.emoji,
    startRoom: loc.room.id,
    startCol: 2,
    startRow: 3,
    drives: CREATURE_CONFIG.drives
  });
  var savedCreature = persistence.loadCreature();
  if (savedCreature) {
    creature.loadState(savedCreature);
  }
  creature.room = loc.room.id;
  creature.col = 2;
  creature.row = 3;
  creature.currentAction = null;

  // Create puppet for remote player (starts empty, updated via Firebase)
  var puppet = createPuppet({
    name: '...',
    emoji: '',
    room: loc.room.id,
    col: loc.room.cols - 3,
    row: 2
  });
  var puppetVisible = false;

  // Hide home-only UI
  var drivesHud = document.getElementById('drives-hud');
  var careBar = document.getElementById('care-bar');
  var roomNav = document.getElementById('room-nav');
  if (drivesHud) drivesHud.style.display = 'none';
  if (careBar) careBar.style.display = 'none';
  if (roomNav) roomNav.style.display = 'none';
  var playdateBtn = document.getElementById('playdate-btn');
  if (playdateBtn) playdateBtn.style.display = 'none';

  // Show playdate HUD
  var playdateHud = document.getElementById('playdate-hud');
  if (playdateHud) {
    playdateHud.style.display = 'flex';
    var locLabel = playdateHud.querySelector('.playdate-location');
    if (locLabel) locLabel.textContent = loc.room.name;
    var guestInfoEl = playdateHud.querySelector('.playdate-guest-info');
    if (guestInfoEl) guestInfoEl.style.display = 'none'; // hide until friend joins
  }

  // Timer
  var startTime = Date.now();
  var timerEl = document.getElementById('playdate-timer');
  var timerInterval = null;
  if (timerEl) {
    timerInterval = setInterval(function() {
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  // Canvas + renderer
  var canvas = document.getElementById('house-canvas');
  var renderer = new Renderer(canvas, world, daynight);
  renderer.setCreature(creature);
  renderer.mode = 'single';
  renderer.currentRoomId = loc.room.id;
  renderer.roomLayout = renderer._computeLayout();
  canvas.width = renderer.roomLayout.totalWidth;
  canvas.height = renderer.roomLayout.totalHeight;

  // Input
  var input = new Input(canvas, renderer, world, bus);
  input.setCreature(creature);
  input.playdateMode = true;
  input.guestCreature = puppet;
  input.start();

  // UI
  var ui = new UI(bus, world, renderer);
  ui.setCreature(creature);
  ui.playdateMode = true;
  ui.guestCreature = puppet;
  ui.start();

  // Title
  var h1 = document.querySelector('h1');
  if (h1) h1.textContent = 'PLAYDATE';

  daynight.start();

  var activityLog = new ActivityLog(bus);
  activityLog.start();

  creature.start();

  var scheduleRender = function() {
    requestAnimationFrame(function() {
      renderer.render();
    });
  };

  bus.on('daynight:changed', scheduleRender);
  bus.on('world:object-added', scheduleRender);
  bus.on('world:object-removed', scheduleRender);
  bus.on('creature:moved', scheduleRender);
  bus.on('creature:action-started', scheduleRender);
  bus.on('creature:spoke', scheduleRender);
  bus.on('creature:dragging', scheduleRender);
  bus.on('creature:dropped', scheduleRender);
  bus.on('creature:room-changed', scheduleRender);
  bus.on('creature:picked-up', scheduleRender);
  bus.on('creature:memory-updated', scheduleRender);
  bus.on('creature:cared', scheduleRender);
  bus.on('creature:mood-changed', scheduleRender);
  bus.on('creature:friend-interaction', scheduleRender);

  // --- Firebase sync ---
  var syncWriter = new SyncWriter(sessionCode, null, creature, bus);
  var syncReader = null;
  var reconnectTimer = null;
  var banner = document.getElementById('connection-banner');

  // The playerId was set when we created/joined -- retrieve from sessionStorage
  var myPlayerId = getPlayerId();
  syncWriter.sessionCode = sessionCode;
  syncWriter.playerId = myPlayerId;
  await syncWriter.start();

  // Read remote players
  syncReader = new SyncReader(
    sessionCode,
    myPlayerId,
    // onPuppetUpdate
    function(pid, data) {
      updatePuppet(puppet, data);
      scheduleRender();
    },
    // onPlayerJoin
    function(pid, data) {
      updatePuppet(puppet, data);
      puppetVisible = true;
      // Set as guest creature for renderer
      renderer.setGuestCreature(puppet);
      // Set companion for social actions
      creature.companion = puppet;
      // Update HUD guest info
      var guestInfoEl = playdateHud ? playdateHud.querySelector('.playdate-guest-info') : null;
      var guestNameEl = playdateHud ? playdateHud.querySelector('.playdate-guest-name') : null;
      if (guestInfoEl) guestInfoEl.style.display = '';
      if (guestNameEl) guestNameEl.textContent = puppet.name + ' ' + puppet.emoji;
      scheduleRender();
    },
    // onPlayerLeave
    function(pid) {
      puppetVisible = false;
      renderer.setGuestCreature(null);
      creature.companion = null;
      var guestInfoEl = playdateHud ? playdateHud.querySelector('.playdate-guest-info') : null;
      if (guestInfoEl) guestInfoEl.style.display = 'none';
      scheduleRender();

      // Show "friend left" in banner briefly
      if (banner) {
        banner.textContent = 'friend disconnected';
        banner.className = 'connection-banner';
        banner.style.display = '';
        setTimeout(function() { banner.style.display = 'none'; }, 5000);
      }
    }
  );
  await syncReader.start();

  // Connection monitoring
  var wasConnected = true;
  onConnectionChange(function(connected) {
    if (!connected && wasConnected) {
      // Lost connection
      if (banner) {
        banner.textContent = 'reconnecting...';
        banner.className = 'connection-banner';
        banner.style.display = '';
      }
      reconnectTimer = setTimeout(function() {
        if (banner) {
          banner.textContent = 'connection lost -- end playdate?';
          banner.className = 'connection-banner';
        }
      }, 30000);
    } else if (connected && !wasConnected) {
      // Reconnected
      clearTimeout(reconnectTimer);
      if (banner) {
        banner.textContent = 'reconnected';
        banner.className = 'connection-banner reconnected';
        banner.style.display = '';
        setTimeout(function() { banner.style.display = 'none'; }, 3000);
      }
    }
    wasConnected = connected;
  });

  // Tab visibility -- pause/resume creature
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      creature.stop();
    } else {
      creature.start();
    }
  });

  // End playdate
  var endBtn = document.getElementById('playdate-end');
  if (endBtn) {
    endBtn.addEventListener('click', async function() {
      creature.stop();
      syncWriter.stop();
      syncReader.stop();
      stopConnectionMonitor();
      if (timerInterval) clearInterval(timerInterval);
      if (banner) banner.style.display = 'none';

      // Save friend memory if puppet was visible
      if (puppetVisible && puppet.name && puppet.name !== '...') {
        var guestData = {
          name: puppet.name,
          species: puppet.species || 'unknown',
          emoji: puppet.emoji
        };
        savePlaydateResult(creature, guestData, locationId);
      }

      // Save creature state
      persistence.setCreature(creature);
      persistence.saveCreature();

      // Signal session ended in Firebase
      try {
        await fbEndSession(sessionCode);
      } catch (e) {
        // Ignore -- might already be cleaned up
      }

      // Go home
      window.location.hash = '';
      window.location.reload();
    });
  }

  renderer.render();
}

// --- Init ---

async function init() {
  // Try initializing Firebase early (non-blocking for home mode)
  var firebaseReady = initFirebase(5000);

  // Check for session join hash first
  var hash = window.location.hash;
  if (hash && hash.indexOf('#session=') === 0) {
    var sessionCode = hash.split('=')[1];
    if (sessionCode) {
      await firebaseReady;
      if (isFirebaseAvailable()) {
        await handleSessionJoin(sessionCode);
        return;
      } else {
        // Firebase unavailable, can't join session
        console.warn('Cannot join session -- Firebase unavailable');
        window.location.hash = '';
      }
    }
  }

  var playdateInfo = parsePlaydateHash();
  if (playdateInfo) {
    await initPlaydate(playdateInfo);
  } else {
    await firebaseReady; // ensure Firebase state is known before showing UI
    await initHome();
  }
}

async function handleSessionJoin(sessionCode) {
  var joinModal = document.getElementById('join-modal');
  var joinStatus = document.getElementById('join-status');
  if (joinModal) joinModal.style.display = 'flex';

  // Load creature from localStorage to send our data
  var tempBus = new EventBus();
  var tempWorld = new World(tempBus);
  var tempPersistence = new Persistence(tempBus, tempWorld);
  var tempCreature = new Creature(tempBus, tempWorld, CREATURE_CONFIG);
  var saved = tempPersistence.loadCreature();
  if (saved) tempCreature.loadState(saved);

  var result = await joinSession(sessionCode, tempCreature);

  if (result.error) {
    if (joinStatus) joinStatus.textContent = result.error;
    setTimeout(function() {
      if (joinModal) joinModal.style.display = 'none';
      window.location.hash = '';
      window.location.reload();
    }, 2000);
    return;
  }

  if (joinModal) joinModal.style.display = 'none';

  // Enter the playdate
  await initRealtimePlaydate(sessionCode, result.location, false);
}

init().catch(err => console.error('House init failed:', err));
