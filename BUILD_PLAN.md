# The House — Build Plan

Incremental phases. Each phase produces something testable. No phase depends on future phases being built — you can stop at any phase and have a working (if incomplete) system.

---

## Phase 0: The Empty House
**Goal:** A rendered house you can look at and tap around in. No creature yet.

**Build:**
- Project scaffold (SvelteKit + Tailwind, or plain HTML/Canvas — match your preference from prior iterations)
- World data model: rooms, objects, positions, properties, affordances
- Room renderer: bird's-eye emoji grid for three rooms (living room, bedroom, kitchen)
- Object placement: fixed furniture rendered at grid positions
- Doorways between rooms (visual connections)
- Day/night cycle: detect user timezone, adjust room brightness and window emoji
- Tap interaction: tap objects to see their name/type (tooltip or info panel)
- Caregiver object dropping: tap empty space → emoji picker → place an object

**Data to author:**
- `house.json` — Room definitions, default furniture, grid layout
- `objects.json` — Object catalog with properties and affordances

**Done when:** You can open the app, see a three-room house with emoji furniture, watch it get dark at night, tap objects to inspect them, and drop food/toys from a picker. No creature — just a world that exists and persists.

**Why this phase matters:** The world needs to work before anything lives in it. If the house isn't charming to look at and satisfying to interact with, the creature won't save it. This is also where you make the rendering decision (Canvas vs. DOM grid) and lock the visual style.

**Status: COMPLETE.** Vanilla JS + Canvas chosen over SvelteKit. EventBus pub/sub. 48px grid cells. Dark terrarium aesthetic.

---

## Phase 1: The Creature Moves
**Goal:** A creature inhabits the house and moves autonomously.

**Build:**
- Creature data model: position, room, species emoji, name
- Creature renderer: emoji at grid position with mood label
- Movement system: creature navigates within rooms and between rooms through doorways
- Basic drive system: hunger and curiosity only (two drives, minimal). Drives grow over time.
- Minimal perception: creature is aware of objects in its current room
- Minimal action selection: approach food when hungry, explore when curious, rest when nothing urgent. Random wandering as default.
- Tick loop: configurable interval (2-4 seconds), drives update, perception runs, action selected, creature moves
- Creature speech: canned bubble text keyed to actions ("mmm", "what's that?", "zzz")
- Caregiver can pick up and drag the creature between positions/rooms

**Psyche config (hand-authored):**
```json
{
  "species": "lobster",
  "emoji": "🦞",
  "drives": {
    "hunger": { "growthRate": 0.02, "baseline": 0.3 },
    "curiosity": { "growthRate": 0.03, "baseline": 0.5 }
  }
}
```

**Done when:** The creature wanders the house. It goes to the kitchen when hungry. It investigates new objects when curious. It reacts when you pick it up. You can watch it for five minutes and form a rough mental model of what it's "trying to do." The fast loop works.

**Status: COMPLETE.** Lobster creature with hunger + curiosity drives. Cell-by-cell movement with doorway traversal. Canned speech bubbles.

---

## Phase 2: Drives, Affect, and Care
**Goal:** The creature has a full emotional life and you can take care of it.

**Build:**
- Full drive system: hunger, fatigue, curiosity, comfort, social (five drives)
- Affect system: valence and arousal derived from drive state + recent events
- Mood derivation: mood labels (curious, anxious, content, sleepy, relaxed, etc.) from valence/arousal
- Mood-driven behavior modulation: anxious creature moves jerkily, sleepy creature drifts, curious creature moves purposefully
- Visual expression: mood label under creature emoji, animation style changes, trail dots in species color
- Care action buttons: pet, comfort, play, rest, feed — each produces a percept that modifies drives and affect
- Caregiver presence tracking: the creature knows when you're "there" (app is open/foregrounded) vs. away
- Object interaction expansion: eat, sleep, sit_on, play_with, investigate, look_at (use affordances from object data)
- Drive-gated attention: hungry creature notices food more, tired creature notices bed more
- Activity log: color-coded internal events (drive changes, mood shifts, decisions, perceptions, care actions)

**Done when:** The creature has moods you can read. Petting it when it's anxious produces a visible change. Feeding it when it's hungry is satisfying. Ignoring it makes it restless. The activity log shows you *why* it's doing what it's doing. It feels like taking care of something.

**Status: COMPLETE.** Four drives (hunger, curiosity, comfort, energy), derived mood, care buttons, score-and-pick action selection with noise, urgency overrides, drag/drop creature and objects.

---

## Phase 3: Memory and Habituation
**Goal:** The creature remembers and changes over time. The past starts to matter.

**Build:**
- Associative memory: object/room/action → valence associations. Reinforced by experience, decay over time.
- Memory-driven navigation: when a drive is high, the creature recalls where that drive was previously satisfied and moves toward it (e.g., goes to kitchen when hungry without needing to perceive food directly)
- Episodic memory: log of significant events (capped, with salience-based retention). High-salience memories persist longer.
- Habituation: repeated interaction with the same object reduces its novelty. Familiar objects become boring. New objects are exciting.
- Developmental stages: newborn → young → mature. Plasticity decreases over time. Early experiences shape associations more strongly.
- Memory-biased action selection: the creature's history influences which actions it prefers. A creature that has had good experiences playing prefers play. One that was frequently hungry prioritizes food-seeking.
- Journal panel: tap creature to see drives, mood, recent episodic memories in readable form, association highlights

**Done when:** The creature behaves differently on day 3 than on day 1. It has room preferences. It remembers where food is. New objects excite it more than familiar ones. You can see its personality forming. The Boundary Test starts to pass.

**Status: COMPLETE.** Object memory with valence/familiarity, developmental personality modifiers, context-aware speech, habituation/novelty decay. Activity log panel added. Gap-fill sprint and mobile-first UI rework also landed here.

---

---

## Phase 3.5: Social Playdates
**Goal:** Creatures can meet. Two players' creatures interact in a shared playdate location in real time.

**Build:**
- Firebase Realtime Database as sync layer (free Spark plan)
- Session model: 6-char session codes, join-by-link (`#session=CODE`)
- Each player runs their creature locally; Firebase syncs position, speech, mood, drives, and current action
- Puppet system: remote creature rendered as a lightweight plain object (not a full Creature instance)
- SyncWriter: writes local creature state on every bus event, throttled to 5 writes/sec
- SyncReader: listens for remote player join/leave/update via Firebase child events
- Disconnect handling: onDisconnect removes player node; connection banner shows reconnecting/reconnected
- 3 playdate locations (Park, Cafe, Mountains) with dedicated room layouts and objects
- 4 social actions: approach_friend, play_together, rest_together, share_space
- Friend memory: creatures remember who they've had playdates with (name, species, valence)
- Async URL fallback: if Firebase is unreachable, falls back to the original share-link system (creature packets encoded as base64 in URL hash)
- Security: HTML escaping on all innerHTML, crypto-secure session/player IDs, Firebase validation rules, input validation on puppet data, write throttling

**Files added:**
- `js/firebase-config.js` -- Firebase init, connection check with 5s timeout
- `js/firebase-sync.js` -- Session CRUD, puppet factory, SyncWriter/SyncReader, disconnect handling
- `js/playdate.js` -- Async fallback (packet encode/decode, guest creature factory)
- `data/playdate-locations.json` -- Park, Cafe, Mountains room definitions

**Done when:** Player A creates a playdate, picks a location, and gets a session code. Player B opens the join link. Both creatures appear on both screens, wandering and interacting in real time. Speech bubbles, mood, and position sync smoothly. Either player can end the playdate and return home with friend memory saved. If Firebase is down, the old async link-sharing flow still works.

**Status: COMPLETE.**

---

## Phase 4: The Reflective Layer (LLM)
**Goal:** The creature thinks. Periodically, it reflects on its experience, and those reflections change who it is.

**Build:**
- LLM integration: BYO API key model. User provides their own API key (Anthropic, OpenAI, etc.) via a settings panel. Key stored in localStorage, calls made client-side. No server component needed. This keeps the project static-hostable and lets it scale without backend costs.
- Reflection trigger system: timer-based (every N minutes) + event-triggered (significant events, accumulation threshold)
- Snapshot assembler: constructs the structured prompt from current state, recent memories, associations, personality context
- Reflection parser: processes LLM response into structured outputs (memory consolidation, association updates, interest formation, optional speech)
- Memory consolidation: LLM narrative summaries stored as episodic memories alongside raw algorithmic memories
- Association updates from reflection: LLM-suggested changes to the associative memory map, applied with bounds checking
- Interest formation: emergent preferences that bias future action selection (e.g., "interested in carrying objects" → increased weight for carry actions)
- Self-initiated speech: the creature occasionally says something unprompted, generated by the LLM based on current state. Displayed as bubble speech.
- Reflection events in activity log: gold-colored entries showing what the creature "thought about" and concluded
- Narrative memories in journal: the creature's reflections become part of its readable inner life

**Prompt design (critical):**
- System prompt establishes the creature's identity, species, and personality context
- The creature does not "know" it's an AI. The prompt frames it as a small creature experiencing its life.
- The LLM is asked to respond *as* the creature's inner experience, not *about* the creature
- Output format is structured JSON for reliable parsing
- Fallback: if the LLM call fails or no API key is configured, the fast loop continues normally. No degradation of core behavior. The creature is fully functional without an LLM -- the reflective layer enriches but does not constitute.

**API key model:**
- Settings panel (accessible from home screen) where users paste their API key
- Key stored in localStorage (never sent to any server besides the LLM provider)
- Provider selector: Anthropic (Claude), OpenAI (GPT), or other compatible APIs
- Usage indicator: show approximate token cost per reflection so users can budget
- Graceful no-key state: creature works fine without it, settings panel shows explanation of what the LLM adds

**Done when:** The creature surprises you. It forms an association you didn't expect. It says something you didn't program. It develops an interest that emerges from its accumulated experience rather than from its initial configuration. The Surprise Test has a real chance of passing.

**Status: COMPLETE.** BYO API key (Anthropic/OpenAI) via settings panel. Provider abstraction in js/llm.js. Reflection system in js/creature/reflection.js with timer/accumulation/significant-event triggers. Interests bias action scoring. Journal + interests in creature modal. Gold reflection entries in activity log.

---

## Phase 5: Polish and Persistence
**Goal:** The creature feels like a living thing you come back to.

**Build:**
- Robust persistence: all state saves to localStorage (and optionally to server-side JSON for backup)
- Session resume: load state, calculate elapsed time (capped 24-48 hours), apply drive decay, generate reunion event
- Offline time handling: the creature "lived" while you were away. Drives grew. Maybe it moved rooms. The reunion is an event.
- State migration: version the save format so future updates don't break existing creatures
- Speed controls: 1x / 2x / 5x tick speed for observation and development acceleration
- Pause/resume with auto-save
- Creature naming: prompted at birth, renameable via journal
- Visual polish: smooth animations, particle effects, mood-driven color shifts, day/night transitions
- Sound (optional): ambient room sounds, creature vocalizations (the droid-speak pattern from the Psyche Builder)
- Mobile optimization: touch targets, responsive layout, swipe between rooms if using single-room view

**Done when:** You can close the app, come back the next day, and the creature greets you. It remembers. It's changed a little since yesterday. Checking on it feels like checking on something alive.

---

## Phase 6: The Caregiver Effect (Validation)
**Goal:** Run the Chiang Test. Prove the architecture works.

**Build:**
- Multi-creature state support: ability to run two creatures with different psyche configs in separate houses (can be separate browser tabs/profiles, doesn't need to be in-app)
- Psyche variation tools: easy way to create two distinct psyche configs (different drive weights, different growth rates)
- Observation logging: export creature state history for comparison
- Caregiver experiment protocol: defined interaction patterns (attentive vs. neglectful, consistent vs. erratic) to test across two creatures

**Done when:** Two creatures raised differently have turned out meaningfully different. Their memories diverge. Their room preferences diverge. Their reactions to the same stimulus diverge. The difference is legible to an observer who didn't set up the experiment. The Chiang Test passes.

---

## Build Order Summary

```
Phase 0: The Empty House          (world exists, no creature)              DONE
Phase 1: The Creature Moves       (fast loop, minimal drives, movement)    DONE
Phase 2: Drives, Affect, and Care (full emotional system, caregiver)       DONE
Phase 3: Memory and Habituation   (past matters, personality forms)        DONE
Phase 3.5: Social Playdates       (Firebase real-time + async fallback)    DONE
Phase 4: The Reflective Layer     (BYO API key, LLM reflection)           DONE
Phase 5: Polish and Persistence   (it feels alive across sessions)
Phase 6: The Caregiver Effect     (the experiment that validates everything)
```

Each phase is roughly additive — Phase 2 adds to Phase 1's creature, Phase 3 adds to Phase 2's emotional system, etc. The architecture doesn't need to be ripped up between phases if the data models are designed with future phases in mind.

**Key architectural decisions to make early (Phase 0-1) that affect everything:**
- Grid system: how rooms and positions are represented
- Event bus: how subsystems communicate (carry forward from CONSTITUTION)
- State shape: the creature state object that all phases will extend
- Tick loop design: interval, what runs per tick, how phases add to it
- Persistence format: what gets saved and how, so Phase 5 isn't a rewrite

---

## Tech Stack (Recommended)

Based on your prior iterations and preferences:

- **Frontend:** SvelteKit + Tailwind (matches Psyche Builder) or plain HTML/Canvas (matches CONSTITUTION terrarium). The choice depends on whether you want component architecture (Svelte) or maximum simplicity (vanilla).
- **Rendering:** HTML5 Canvas for the house grid (matches terrarium pattern, good for animations) or CSS Grid with emoji elements (simpler, possibly sufficient for this project's visual needs).
- **LLM Integration:** Server-side API route (SvelteKit endpoint or simple Express server) that proxies to cloud API. Keeps API keys off the client.
- **Persistence:** localStorage for client state + server-side JSON files for creature state backup and reflection history.
- **State Management:** Svelte stores (if SvelteKit) or a simple pub/sub event bus (if vanilla). The CONSTITUTION's EventBus pattern works well.

---

## What To Build First, Tomorrow

If you're starting fresh:

1. Create the project scaffold
2. Author `house.json` with three rooms and their default objects
3. Render the house as an emoji grid — get it on screen
4. Make it darken at night
5. Add the emoji picker for dropping objects

That's Phase 0. A house with no creature in it. It should take one focused session. And when you're done, you'll have the world your creature will live in.
