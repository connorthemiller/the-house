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
      showInviteModal(creature, loc);
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

// --- Init ---

async function init() {
  var playdateInfo = parsePlaydateHash();
  if (playdateInfo) {
    await initPlaydate(playdateInfo);
  } else {
    await initHome();
  }
}

init().catch(err => console.error('House init failed:', err));
