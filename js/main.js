// Main entry point -- init, event wiring, render loop

import EventBus from './eventbus.js';
import World from './world.js';
import DayNight from './daynight.js';
import Renderer from './renderer.js';
import Input from './input.js';
import UI from './ui.js';
import Persistence from './persistence.js';

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

  // Renderer
  const canvas = document.getElementById('house-canvas');
  const renderer = new Renderer(canvas, world, daynight);
  renderer.init();

  // Input
  const input = new Input(canvas, renderer, world, bus);
  input.start();

  // UI
  const ui = new UI(bus, world, renderer);
  ui.start();

  // Persistence auto-save
  persistence.start();

  // Start day/night cycle
  daynight.start();

  // Render on state changes
  const scheduleRender = () => {
    requestAnimationFrame(() => renderer.render());
  };

  bus.on('daynight:changed', scheduleRender);
  bus.on('world:object-added', scheduleRender);
  bus.on('world:object-removed', scheduleRender);

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
}

init().catch(err => console.error('House init failed:', err));
