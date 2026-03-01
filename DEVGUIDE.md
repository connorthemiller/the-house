# The House -- Development Guide

How to keep building this project efficiently as it grows, without needing a full codebase review every session.

---

## The Core Problem

Every Claude Code session starts with zero memory of previous sessions. The project is ~4,750 lines and growing. If every task starts with "read the whole project," you burn context window and budget before real work begins. This guide fixes that.

---

## 1. Project-Level CLAUDE.md

The single most important thing for efficiency. Claude Code auto-loads `CLAUDE.md` from the project root every session. This is your "briefing document" -- it tells Claude what the project is, how it's structured, and what conventions to follow, without reading a single source file.

**What goes in it:**
- One-paragraph project summary
- Current phase and what's been built
- File map with one-line descriptions (update when files are added/split)
- Module boundaries and public interfaces
- Conventions (event names, state shape, naming patterns)
- What NOT to do (anti-patterns, resolved decisions)

**What does NOT go in it:**
- Full implementation details (that's what the source code is for)
- Task-specific context (that belongs in the prompt)
- Aspirational future plans (that's BUILD_PLAN.md)

**Keep it under 150 lines.** If it gets longer, it's doing too much. Move detailed subsystem docs to separate files and reference them.

**Update it every time you:**
- Add, rename, or split a file
- Add a new event to the EventBus
- Change a public interface
- Complete a phase

---

## 2. Module Boundaries

The project is already modular. The key to efficient development is treating modules as units with clear boundaries, so you can work on one without reading the others.

### Current Module Map

```
index.html              Entry point, loads main.js
js/main.js              Init (home + playdate modes), event wiring, render loop
js/eventbus.js          Pub/sub (on/off/emit)
js/world.js             Room/object state (add/remove/query)
js/renderer.js          Canvas drawing (rooms, walls, objects, creature, lighting)
js/daynight.js          Real-clock day/night cycle
js/input.js             Mouse/touch, drag, swipe, tap detection
js/ui.js                Info panel, emoji picker, creature modal, HUD, care bar
js/activitylog.js       Color-coded event log panel
js/persistence.js       localStorage save/load
js/creature.js          Creature class (hub that imports creature/ modules)
  js/creature/drives.js       Drive growth and reset
  js/creature/perception.js   Room scanning, object awareness
  js/creature/actions.js      Action scoring and selection
  js/creature/behaviors.js    Action execution (eat, sleep, investigate, etc.)
  js/creature/movement.js     Cell-by-cell pathfinding, doorway traversal
  js/creature/memory.js       Object memory, valence, familiarity/habituation
  js/creature/development.js  Action counts, personality modifiers
  js/creature/speech.js       Context-aware speech generation
js/playdate.js          Async packet encode/decode, URL parsing, guest factory
js/firebase-config.js   Firebase app init, db ref export, connection check
js/firebase-sync.js     Session CRUD, puppet factory, sync write/read, disconnect
data/house.json         Room definitions, doorways
data/objects.json       Default furniture catalog
data/playdate-locations.json  Park, cafe, mountains playdate locations
```

### How Modules Communicate

Modules talk through two channels:
1. **EventBus** -- loose coupling. Publisher doesn't know who's listening.
2. **Direct imports** -- tight coupling. Only within the creature/ subsystem.

**Rule:** Top-level modules (renderer, input, ui, world, daynight, persistence) ONLY communicate through EventBus. They never import each other. creature.js is the only file that imports from creature/.

This means: if you're working on renderer.js, you only need to know what events it listens to and what the world/creature state shape looks like. You don't need to read input.js or ui.js.

---

## 3. How to Scope a Task for Claude

The most important skill for efficient development. A well-scoped task tells Claude exactly what to read and what to do, so it doesn't need to explore.

### Template for a Focused Task

```
TASK: [one sentence]

CONTEXT: Working on The House (digital creature habitat, vanilla JS + Canvas).
Phase [N] is complete. Currently building [what].

FILES TO READ:
- js/[relevant file].js (the file being modified)
- js/[dependency].js (only if the interface matters)

CONSTRAINTS:
- EventBus pub/sub for cross-module communication
- No build step, ES modules only
- Event names follow pattern: namespace:action (e.g., creature:moved)
- [any relevant convention]

WHAT TO DO:
- [specific change 1]
- [specific change 2]

WHAT NOT TO DO:
- Don't refactor unrelated code
- Don't add features beyond what's listed
```

### Examples

**Good prompt (focused, Sonnet-tier):**
```
TASK: Add a "flee" action to the creature when it encounters a hazard object.

FILES TO READ:
- js/creature/actions.js (action scoring)
- js/creature/behaviors.js (action execution)
- js/creature/perception.js (to understand how objects are perceived)
- data/objects.json (to see hazard affordance)

CONSTRAINTS:
- Follow existing action pattern (score function + behavior function)
- Emit creature:action-started event like other actions
- Flee should move creature 2-3 cells away from hazard

WHAT TO DO:
- Add flee scoring in actions.js (high score when hazard nearby, creature not already fleeing)
- Add flee behavior in behaviors.js (pick cell away from hazard, move toward it)
- Speech line in speech.js for flee action
```

**Bad prompt (vague, forces full exploration):**
```
Add some more behaviors to the creature.
```

The first prompt can be done by Sonnet in one shot. The second requires Opus to read the whole project, decide what behaviors to add, and make judgment calls -- burning budget on decisions you should be making yourself.

---

## 4. Model Tier Strategy

Match the model to the task. This is where real budget savings happen.

### Opus -- The Architect ($$$)
Use for:
- Phase transitions (designing the next phase's architecture)
- New subsystem design (what events, what state shape, what interfaces)
- Debugging cross-module issues where the bug could be anywhere
- Reviewing whether a feature fits the CONSTITUTION philosophy
- Writing/updating CLAUDE.md and this guide

Do NOT use for:
- Implementing a feature whose design is already clear
- Adding a new action that follows an existing pattern
- Bug fixes where you already know which file is broken
- Formatting, renaming, mechanical refactors

### Sonnet -- The Builder ($$)
Use for:
- Implementing features with a clear spec (most development work)
- Adding new actions/behaviors that follow existing patterns
- Bug fixes in a known file
- Writing persistence migration code
- Canvas rendering changes

Give Sonnet:
- The specific files to read (2-4 max)
- The exact behavior to implement
- The conventions to follow
- A "don't touch anything else" constraint

### Haiku -- The Mechanic ($)
Use for:
- Renaming a variable across a file
- Adding speech lines to existing templates
- Updating data/objects.json with new entries
- Formatting fixes
- Quick lookups ("what events does renderer.js listen to?")

Give Haiku:
- One file, one task, no ambiguity

---

## 5. Session Workflow

What to actually do when you sit down to work.

### Starting a Session

1. **Decide what you're building** (journal/ChatGPT brainstorm, not Claude time)
2. **Check BUILD_PLAN.md** -- where are you in the phase plan?
3. **Write the task prompt** using the template from Section 3
4. **Pick the model tier** using Section 4
5. **Start Claude Code** and give it the scoped task

### During a Session

- One feature per session. Finish it, test it, commit it.
- If the task grows ("oh, I also need to change X"), stop and re-scope.
- If you're unsure about a design decision, pause and switch to Opus for that specific question. Don't let Sonnet make architecture calls.
- Commit after each working change. Small commits are free and give you rollback points.

### Ending a Session

1. **Commit** with a message that says what changed and why
2. **Update CLAUDE.md** if you changed the file map, events, or interfaces
3. **Update MEMORY.md** if Claude learned something that future sessions need
4. Don't leave half-finished work uncommitted -- either finish it or revert it

---

## 6. When to Split Files

The creature.js split at ~500 lines was the right call. General rules:

- **Split when a file has two unrelated responsibilities.** If you're scrolling past functions you don't care about to find the ones you do, it's time to split.
- **Split when a file exceeds ~200 lines.** Not a hard rule, but past 200 lines Claude starts needing to read more than it should for targeted changes.
- **Don't split prematurely.** A 100-line file with one responsibility is fine as one file, even if you can see two sub-responsibilities forming. Wait until it actually hurts.
- **Split along the EventBus boundary.** If a chunk of code only communicates with the rest via events, it's a natural module.

### Split Candidates to Watch

As you build future phases:

| File | Current Lines | Watch For |
|------|--------------|-----------|
| main.js | 863 | Largest file. Home init, playdate init, Firebase flows, UI wiring all mixed. Consider splitting playdate logic into js/playdate-init.js. |
| input.js | 508 | Drag logic is complex. Consider splitting into input/tap.js, input/drag.js, input/swipe.js if adding new gesture types. |
| ui.js | 493 | Info panel + emoji picker + creature modal + HUD + care bar. Split by panel type if adding journal or settings panel. |
| firebase-sync.js | 456 | Session CRUD + puppet + SyncWriter + SyncReader + connection monitor. Manageable for now but watch if sync logic grows. |
| renderer.js | 386 | Creature rendering vs room rendering. Split if creature visuals get complex (animations, particles). |

---

## 7. Phase Transition Checklist

When you finish a phase and start the next:

1. **Commit and tag.** `git tag phase-N-complete`
2. **Opus session: design review.** Give Opus the CLAUDE.md + BUILD_PLAN.md for the next phase. Ask it to:
   - Identify what new files/modules are needed
   - Define new events and state shape additions
   - Flag any existing interfaces that need to change
   - Write the updated CLAUDE.md with the new module map
3. **Break the phase into tasks.** Each task should be Sonnet-scoped (one feature, 2-4 files, clear spec).
4. **Build task by task.** One feature, test, commit. Repeat.
5. **Opus session: integration review.** Once all tasks are done, have Opus read the new code and check for:
   - Consistency with CONSTITUTION principles
   - Module boundary violations
   - State shape issues that would block future phases

This means Opus touches the project twice per phase (design + review), and Sonnet does all the building. That's the budget-efficient pattern.

---

## 8. What Makes This Sellable

Things to keep in mind as you build toward a product:

### Technical
- **No build step** is actually an advantage for distribution (static hosting, easy deployment)
- **localStorage persistence** works for MVP. Phase 4 uses a BYO API key model (user provides their own LLM API key, stored in localStorage, calls made client-side) so no server component needed. Cross-device sync is a future consideration.
- **State versioning** -- start including a version number in saved state NOW so you can migrate old saves when the format changes. Add this before Phase 4.

### Product
- **The creature needs to be charming in the first 30 seconds.** Before memory, before development, before LLM reflection. The fast loop must be delightful on its own.
- **The house needs to feel cozy.** Visual polish (lighting, animations, subtle effects) is not optional for a product. Budget time for it.
- **Onboarding = placing the first object.** The emoji picker interaction is the first thing a new user does. It needs to feel good.

### What to Build vs Buy
- **Canvas rendering** -- keep building (it's core)
- **Persistence/sync** -- Firebase Realtime Database already integrated for playdates (free Spark plan)
- **LLM integration** -- keep the provider abstract (Phase 4 design decision)
- **Analytics** -- add basic event tracking before launch (which actions are most common, session length, return rate)

---

## 9. File Reference Quick Card

Copy this into CLAUDE.md (and keep it updated):

```
## File Map
js/main.js          -- init (home + playdate), event wiring, render loop (863 lines)
js/eventbus.js      -- pub/sub: on/off/emit (40 lines)
js/world.js         -- room/object state manager (103 lines)
js/renderer.js      -- canvas drawing (386 lines)
js/daynight.js      -- real-clock day/night cycle (81 lines)
js/input.js         -- mouse/touch/drag/swipe (508 lines)
js/ui.js            -- info panel, emoji picker, creature modal, HUD (493 lines)
js/activitylog.js   -- color-coded event log panel (147 lines)
js/persistence.js   -- localStorage save/load (101 lines)
js/creature.js      -- Creature class hub (210 lines)
  creature/drives.js       -- drive growth/reset (41 lines)
  creature/perception.js   -- room scanning (109 lines)
  creature/actions.js      -- action scoring/selection (154 lines)
  creature/behaviors.js    -- action execution (265 lines)
  creature/movement.js     -- pathfinding, doorways (163 lines)
  creature/memory.js       -- object memory, valence (104 lines)
  creature/development.js  -- personality modifiers (55 lines)
  creature/speech.js       -- context-aware speech (174 lines)
js/playdate.js      -- async packet encode/decode, guest factory (201 lines)
js/firebase-config.js -- Firebase app init, connection check (99 lines)
js/firebase-sync.js -- session CRUD, puppet, sync write/read (456 lines)
data/house.json     -- room definitions, doorways
data/objects.json   -- default furniture catalog
data/playdate-locations.json -- playdate locations (park/cafe/mountains)
```

---

## 10. Quick-Start Checklist for New Sessions

Before starting Claude Code:

- [ ] I know which file(s) I'm changing
- [ ] I have a one-sentence task description
- [ ] I've picked the right model tier
- [ ] I've written the prompt with FILES TO READ and CONSTRAINTS
- [ ] I'm not asking Claude to make design decisions (unless it's an Opus architecture session)

If you can check all five, you'll get fast, focused, budget-friendly sessions.
