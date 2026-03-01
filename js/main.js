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

async function init() {
  // Load data
  const [houseData, objectsData] = await Promise.all([
    fetch('data/house.json').then(r => r.json()),
    fetch('data/objects.json').then(r => r.json())
  ]);

  // Core systems
  const bus = new EventBus();
  const world = new World(bus);
  const daynight = new DayNight(bus);

  // Load world from JSON
  world.loadHouse(houseData, objectsData);

  // Load saved user objects before rendering
  const persistence = new Persistence(bus, world);
  persistence.load();

  // Create creature
  const creature = new Creature(bus, world, CREATURE_CONFIG);
  var savedCreature = persistence.loadCreature();
  if (savedCreature) {
    creature.loadState(savedCreature);
  } else {
    // First visit -- ask for a name
    var chosenName = await showNamingModal(CREATURE_CONFIG.emoji);
    creature.name = chosenName;
  }
  persistence.setCreature(creature);

  // Renderer
  const canvas = document.getElementById('house-canvas');
  const renderer = new Renderer(canvas, world, daynight);
  renderer.setCreature(creature);
  renderer.init();

  // Input
  const input = new Input(canvas, renderer, world, bus);
  input.setCreature(creature);
  input.start();

  // UI
  const ui = new UI(bus, world, renderer);
  ui.setCreature(creature);
  ui.start();

  // Persistence auto-save
  persistence.start();

  // Start day/night cycle
  daynight.start();

  // Activity log
  const activityLog = new ActivityLog(bus);
  activityLog.start();

  // Start creature
  creature.start();

  // Render on state changes
  const scheduleRender = () => {
    requestAnimationFrame(() => {
      renderer.render();
      ui.updateDrives();
    });
  };

  bus.on('daynight:changed', scheduleRender);
  bus.on('world:object-added', scheduleRender);
  bus.on('world:object-removed', scheduleRender);

  // Creature events -> re-render
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

  // Nav: switch room in single mode
  bus.on('nav:room-changed', (data) => {
    renderer.setCurrentRoom(data.roomId);
    ui._updateNav();
    scheduleRender();
  });

  // Responsive: switch mode on resize
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

  // Initial render
  renderer.render();
  ui.updateDrives();
}

init().catch(err => console.error('House init failed:', err));
