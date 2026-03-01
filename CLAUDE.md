# The House -- Project Instructions

Digital creature habitat. Vanilla JS + Canvas, no build step, ES modules. A lobster creature lives in a three-room emoji house, driven by algorithmic subsystems (drives, perception, memory, action selection). See PROJECT_BRIEF.md for full vision, BUILD_PLAN.md for phase roadmap, DEVGUIDE.md for development workflow.

## Current State

Phases 0-3 complete + gap-fill sprint + mobile-first UI rework. Equal room sizes (all 6x5), drives HUD and care buttons on main view (below canvas), creature modal is inspection-only. Next up: Phase 4 (LLM reflective layer).

## File Map

```
js/main.js              init, event wiring, render loop
js/eventbus.js          pub/sub: on/off/emit
js/world.js             room/object state manager
js/renderer.js          canvas drawing (rooms, walls, objects, creature, lighting)
js/daynight.js          real-clock day/night cycle
js/input.js             mouse/touch/drag/swipe
js/ui.js                info panel, emoji picker, creature modal, drives HUD, care bar
js/activitylog.js       color-coded event log panel
js/persistence.js       localStorage save/load
js/creature.js          Creature class (hub, imports creature/ modules)
  creature/drives.js       drive growth and reset
  creature/perception.js   room scanning, object awareness
  creature/actions.js      action scoring and selection
  creature/behaviors.js    action execution (eat, sleep, investigate, etc.)
  creature/movement.js     cell-by-cell pathfinding, doorway traversal
  creature/memory.js       object memory, valence, familiarity/habituation
  creature/development.js  action counts, personality modifiers
  creature/speech.js       context-aware speech generation
data/house.json         room definitions, doorways
data/objects.json       default furniture catalog
```

## Architecture Rules

- **EventBus for cross-module communication.** Top-level modules (renderer, input, ui, world, daynight, persistence) never import each other. They communicate through events only.
- **Direct imports only within creature/.** creature.js is the sole entry point to the creature subsystem.
- **No build step.** ES modules loaded directly. No bundler, no transpiler.
- **Canvas rendering.** All visuals drawn on a single canvas. Grid is 48x48px cells.
- **3 rooms:** Bedroom (6x5), Living Room (6x5), Kitchen (6x5). 1-cell walls, doorways at row 2.

## Event Bus Events

```
daynight:changed        { phase, brightness, windowEmoji }
world:object-added      { object }
world:object-removed    { objectId }
input:object-tapped     { object, roomId, col, row }
input:empty-tapped      { roomId, col, row }
input:creature-tapped   { creature, roomId, col, row }
creature:moved          { room, col, row, prevCol, prevRow }
creature:room-changed   { room, prevRoom }
creature:action-started { action, target }
creature:spoke          { text }
creature:picked-up      {}
creature:dropped        { room, col, row }
creature:dragging       { x, y }
creature:memory-updated { objectId, entry }
creature:mood-changed   { prev, next }
creature:cared          { action, driveAffected, amount }
object:dragging         { x, y }
```

## Creature State Shape

```
creature.drives     -- { hunger, curiosity, comfort, energy } each 0-1
creature.mood       -- string: sleepy/hungry/uneasy/happy/content/restless/okay
creature.memory     -- { [objectId]: { name, emoji, interactions, actions, lastSeen, valence, familiarity } }
creature.development -- { actionCounts, totalActions, modifiers per drive }
creature.room / creature.col / creature.row -- position
creature.currentAction / creature.actionTarget -- what it's doing now
```

## Conventions

- Event names: `namespace:action` (e.g., `creature:moved`)
- Drive values: 0 (satisfied) to 1 (urgent)
- Action scoring: higher score = more likely to be selected. Noise of 0.15 for variability.
- Speech: 3-second canvas-rendered bubbles
- Persistence: localStorage, 5-second debounce on save
- ASCII only in terminal output (no Unicode box-drawing, em-dashes, fancy quotes)

## Do Not

- Add a build step or bundler
- Import between top-level modules (use EventBus)
- Make the LLM the creature's "brain" -- it's a reflective layer, not real-time control
- Add features beyond what's specified in the current task
- Over-engineer for hypothetical future needs
