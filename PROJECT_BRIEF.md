# The House — Project Brief

A digital creature lives in a small house. It eats, sleeps, explores, plays, hides, and develops a personality through experience. You are its caregiver. The house is rendered as an emoji bird's-eye view. The creature's behavior emerges from modular algorithmic subsystems (drives, perception, affect, memory, action selection). Periodically, an LLM reflects on the creature's accumulated experience, consolidating memories and forming new associations that reshape future behavior.

This is the next iteration of the digient project. It reunifies the rich spatial world of the CONSTITUTION terrarium with the sophisticated inner architecture of the Psyche Builder, while keeping scope small enough to actually finish.

---

## Lineage

This project inherits from three prior iterations:

**The CONSTITUTION Terrarium** gave us a working spatial world with emoji creatures that perceive, move, eat, flee, investigate, remember, and develop. It proved that small algorithmic systems can produce legible, charming, autonomous behavior. Its limitation: no cognitive core. The creatures were purely reactive — sophisticated reactions, but reactions.

**The Psyche Builder** gave us composable inner architecture — the Forge, the Psyche Wheel, inter-element modulation, and the LLM voice layer. It proved that personality can emerge from the interaction of simple psychological elements. Its limitation: no world. The creature had a rich mind but nothing to do with it.

**Mochi** gave us the LLM integration pattern — voice as expression layer, not as mind — and the debug console / mind log that makes inner life visible. Its limitation: no persistence, no environment, no drives.

**This iteration** takes the spatial world from the terrarium, the modular inner architecture from the Psyche Builder, and the LLM integration pattern from Mochi, and combines them into one system where a creature with a real mind inhabits a real (small) world.

---

## Core Decisions (Resolved)

These were decided during the design conversation and are not open for revisitation without good reason.

**1. The world is a small house.** Three rooms, emoji objects, bird's-eye view. Not an abstract space, not a vast ecosystem. A house with furniture, food, toys, and comfort objects. Simple enough to build quickly, rich enough to support genuine development.

**2. No Forge.** The psyche is hand-configured via JSON for this iteration. The Infinite Craft-style element discovery game is a UX innovation worth revisiting later, but it's not load-bearing for the core experiment.

**3. The LLM is a reflective layer, not a real-time cortex.** The fast loop (every tick) is purely algorithmic: drives, perception, affect, action selection. The slow loop (periodic, event-triggered) calls the LLM for reflection: memory consolidation, association formation, interest development, and occasional self-initiated speech. This keeps costs manageable and the simulation responsive.

**4. Cloud API for the LLM.** No requirement for local-only Ollama. Cloud APIs provide better model quality for the reflective layer, which doesn't need to be instant.

**5. Day/night tracks the user's real clock.** The house darkens at night (user's local time). The creature gets sleepy. Activity slows. When you visit matters — 2am feels different from noon. This creates natural behavioral rhythms without simulating a clock.

**6. One creature, architecture-ready for more.** The UI is single-creature. All state is namespaced by creature ID so multi-creature support can be added later without refactoring.

**7. The creature is not the LLM.** (Inherited from all prior iterations.) Strip the LLM and the creature still has drives, mood, memories, and decisions. It still moves, eats, sleeps, explores, and reacts. The LLM enriches — it does not constitute.

---

## The World: A Small House

### Rooms

Three rooms connected by doorways. Each room is a discrete zone on the world grid. The creature moves between rooms through doorway tiles.

**Living Room** — The social space. Where the caregiver primarily interacts with the creature.
- 🛋️ Couch (furniture — sit on, sleep on, hide behind)
- 📺 Television (fixture — look at, sit near)
- 📚 Bookshelf (furniture — investigate, look at)
- 🪟 Window (fixture — look at; reflects day/night state)
- 🪴 Plant (decoration — look at, knock over)

**Bedroom** — The creature's refuge. Quiet, enclosed, safe-feeling.
- 🛏️ Bed (furniture — sleep, hide under, sit on)
- 🪔 Lamp (fixture — provides comfort at night)
- 🧸 Stuffed animal (toy — carry, play with, sleep near)
- 📦 Box (furniture — hide in, investigate, carry small objects into)

**Kitchen** — The utility space. Where hunger gets addressed. Also a source of novelty and mild danger.
- 🍳 Stove (fixture — avoid when hot, approach when curious; mild hazard)
- 🧊 Fridge (fixture — contains food, investigate for surprises)
- 🪑 Chair (furniture — sit on)
- 🍽️ Food bowl (fixture — where food appears; the creature eats here)
- 🗑️ Trash can (fixture — investigate, knock over)

### Object Properties

Every object in the house has a consistent data model:

```
Object:
  id: string
  emoji: string
  name: string
  room: string                  # Which room it's in
  position: { x, y }           # Grid position within the room
  type: furniture | food | toy | comfort | fixture | hazard
  affordances: string[]         # What actions the creature can perform with it
  moveable: boolean             # Can the creature or caregiver relocate it?
  carryable: boolean            # Can the creature pick it up and carry it?
  consumable: boolean           # Does it get used up (food)?
  comfortValue: number          # -1 to 1; does proximity affect affect?
  novelty: number               # Current novelty (degrades with interaction via habituation)
  userPlaced: boolean           # Was this dropped by the caregiver?
```

### Affordances (What the Creature Can Do)

The creature's action vocabulary with objects:

| Action | Applies to | Effect |
|--------|-----------|--------|
| **eat** | food | Satisfies hunger. Food is consumed, respawns after a delay. |
| **sleep** | bed, couch, soft surfaces | Satisfies fatigue. Creature enters rest state. |
| **sit_on** | couch, chair, bed | Mild comfort. Low-energy resting. |
| **play_with** | toys | Satisfies curiosity. Reduces boredom. Creature animates playfully. |
| **investigate** | any object with novelty | Satisfies curiosity. Reduces object novelty (habituation). |
| **look_at** | window, TV, bookshelf | Mild curiosity satisfaction. Passive engagement. |
| **carry** | carryable objects (toys, small items) | Creature picks up and moves with the object. Can deposit elsewhere. |
| **hide** | bed, box, couch (behind/under) | Creature retreats from perceived threat or overstimulation. Reduces arousal. |
| **knock_over** | plant, trash can, small objects | Playful or agitated action. Changes world state. Creates a mess. |
| **approach** | any object or room | Movement toward a target. Prerequisite for other interactions. |
| **flee** | hazards, scary stimuli | Rapid movement away. High arousal response. |
| **explore** | empty spaces, new rooms | Self-directed wandering. Satisfies curiosity about space itself. |
| **rest** | anywhere | Stop moving. Low-energy idle. Different from sleep (less restorative, doesn't require furniture). |
| **arrange** | carryable objects | Creature moves an object to a preferred location. Emergent nesting behavior. |

### Day/Night

The house reflects the user's real local time (via browser timezone or geolocation).

**Day (roughly 7am–7pm):** Full brightness. Window shows sky emoji (☀️ or ⛅). Creature has normal drive growth rates. Activity levels are typical.

**Night (roughly 7pm–7am):** Rooms dim. Window shows moon (🌙). Fatigue drive grows faster. Creature biases toward sleep, rest, and comfort-seeking. The lamp in the bedroom provides a small comfort zone. Reduced curiosity growth.

**Transitions:** Dawn and dusk are gradual (30-minute real-time transition). The creature should notice and react to light changes — a percept that feeds into the affect system.

---

## The Creature

An emoji entity (🦞 — lobster, continuing the CONSTITUTION tradition) that lives in the house. Species is configurable but the default is lobster.

### The Fast Loop (Algorithmic — Every Tick)

Runs every tick (default: ~2-4 seconds). No LLM calls. This is the CONSTITUTION terrarium's architecture, adapted for the house.

**1. Drive Decay** — All drives grow toward urgency over time. Growth rates define baseline personality.

| Drive | What It Represents | Satisfied By |
|-------|-------------------|--------------|
| Hunger | Need for food | Eating |
| Fatigue | Need for rest | Sleeping, resting |
| Curiosity | Need for stimulation | Investigating, exploring, playing |
| Comfort | Need for safety/warmth | Being near comfort objects, in familiar spaces, caregiver petting |
| Social | Need for interaction | Caregiver presence, being talked to, being petted |

Drive weights and growth rates are configurable per-creature (the psyche configuration). A creature with high curiosity growth and low comfort growth is bold and exploratory. One with high comfort growth and high social need is clingy and anxious when alone.

**2. Perception** — What's in the current room? What objects are within perception range? Is it day or night? Is the caregiver present? Has anything changed since last tick? Perception is filtered by attention — the creature doesn't notice everything equally. High-drive states bias attention (hungry creature notices food more).

**3. Affect** — Valence (-1 to 1) and arousal (0 to 1) derived from drive state + recent events. Produces mood labels that modulate behavior and expression.

**4. Associative Memory** — Links between objects, rooms, actions, and outcomes. "The bedroom is safe." "Food bowl = hunger relief." "Stove = bad." Strengthened by experience, decays over time. When a drive is high, the creature recalls where that drive was previously satisfied and moves toward it.

**5. Action Selection** — Drive-weighted competition with noise. Available actions are determined by what's in perception. The highest-weight action wins, but noise means the second-best action wins sometimes — producing variability that reads as personality, not randomness. Inhibition prevents impossible actions (can't eat if no food is visible).

**6. Expression** — Bubble speech from canned templates (keyed to mood, action, context). Movement animations reflecting internal state: purposeful walking, idle wandering, startled retreat, sleepy drifting. Visual state indicators (mood label below emoji, trail dots, sparkle effects on discoveries).

### The Slow Loop (LLM Reflection — Periodic)

Triggered by:
- A timer (every N minutes of creature-time)
- Significant events (new object appeared, drive reached crisis, caregiver did something unexpected, creature entered a room for the first time)
- Accumulation threshold (N episodic memories since last reflection)

**The LLM receives a structured snapshot:**
```
Current state:
  Room: kitchen
  Time: night (10:34pm)
  Nearby objects: food bowl (empty), fridge, stove, chair
  Drives: hunger 0.8 (high), curiosity 0.3, fatigue 0.5, comfort 0.4, social 0.7
  Mood: anxious (valence: -0.3, arousal: 0.6)

Recent memories (since last reflection):
  - Ate food from bowl 45 minutes ago
  - Caregiver petted me 2 hours ago
  - Explored bedroom, found stuffed animal, carried it to living room
  - Knocked over plant in living room
  - Caregiver placed plant back upright

Associations:
  - Food bowl: strongly positive (hunger relief)
  - Bedroom: positive (safe, restful)
  - Stove: mildly negative (approached once, flinched)
  - Stuffed animal: positive (carried it, played with it)
  - Caregiver: strongly positive (feeds, pets, comforts)

Personality context:
  High curiosity growth, moderate social need, low fatigue growth.
  Developmental age: young (high plasticity).
```

**The LLM returns structured JSON:**
```
{
  "memory_consolidation": "I spent most of the evening in the kitchen waiting for food. The bowl has been empty for a while. I moved my stuffed animal to the living room earlier — I like having it nearby. The caregiver fixed the plant I knocked over. They weren't angry.",

  "association_updates": [
    { "target": "stuffed_animal", "delta": +0.1, "reason": "carried it, feels comforting" },
    { "target": "living_room", "delta": +0.05, "reason": "my stuffed animal is there now" },
    { "target": "caregiver", "delta": +0.05, "reason": "fixed the plant without punishment" }
  ],

  "interest_formation": [
    { "topic": "carrying_objects", "strength": 0.3, "reason": "I've been moving things around. It feels good to arrange my space." }
  ],

  "speech": "...hungry. where's my food?"
}
```

The reflection outputs feed back into the fast loop:
- `memory_consolidation` is stored as a narrative episodic memory
- `association_updates` modify the associative memory map
- `interest_formation` creates or strengthens interest records that bias future action selection
- `speech` is displayed as a bubble — self-initiated expression, not a response to anything

This is where the creature *develops*. Not through parameter changes in the LLM, but through accumulated state that structures how the algorithmic systems operate.

### Developmental Stages

Carried forward from the CONSTITUTION terrarium, adapted for longer timescales:

| Stage | Duration | Characteristics |
|-------|----------|----------------|
| **Newborn** | First ~2 hours | High plasticity. Learns associations fast. Erratic movement. Everything is novel. High noise in action selection. |
| **Young** | ~2 hours to ~1 week | Associations forming. Personality starting to stabilize. Moderate plasticity. Developing room preferences. |
| **Mature** | After ~1 week | Settled personality. Strong associations. Lower plasticity. Habituates to familiar objects quickly. Hard to surprise. |

Plasticity affects how strongly new experiences modify associations and drive weights. A newborn creature's first experience with the stove shapes its relationship with the stove far more than the same experience would for a mature creature.

---

## The Caregiver Interface

The human interacts with the house and creature spatially, not through a command line.

### Spatial Interactions
- **Tap the creature** → Opens the journal (drives, mood, memory log, developmental stage, interests)
- **Drag the creature** → Pick up and move to a different spot or room. Creature reacts with speech and affect change. Records the event in memory.
- **Tap empty space** → Opens emoji picker to drop an item (food, toy, comfort object)
- **Tap a placed object** → Remove it or move it
- **Tap a room** → Navigate the view (if rooms are shown one at a time) or highlight the room

### Care Actions (Buttons)
- 🤲 **Pet** — Soothes arousal, boosts valence, satisfies social drive
- 🫂 **Comfort** — Reduces social/comfort drives, improves mood
- 🎾 **Play** — Reduces curiosity/impulse drives, raises arousal
- 🌙 **Rest** — Encourages rest, lowers arousal
- 🍽️ **Feed** — Places food in the bowl, satisfies hunger

### Talk
Text input to speak to the creature. Processed as a percept (the emotional content matters more than the literal words at the algorithmic level). The LLM generates a response shaped by current state. Not the primary interaction mode — spatial caretaking is primary.

### What Happens When You're Away
- Drives continue to grow (capped at 24-48 hours of accumulated decay)
- On return: state is loaded, elapsed time is applied, reunion event is generated
- Short absence (<1 hour): barely noticed
- Medium absence (1-12 hours): acknowledgment, some drive urgency
- Long absence (>12 hours): emotional reaction shaped by personality (high social need = relieved/clingy; low social need = indifferent)

---

## The Observer Layer

### Activity Log
Collapsible panel showing color-coded internal events. Carried forward from the CONSTITUTION terrarium with additions:

| Category | Color | Shows |
|----------|-------|-------|
| drive | Red | Drive level changes |
| mood | Teal | Mood/affect transitions |
| decision | Purple | Action selection, inhibition |
| perception | Light green | Objects perceived, room changes |
| memory | Pink | Episodes recorded, recalled, forgotten |
| reflection | Gold | LLM reflection outputs — consolidation, new associations, interests |
| creature | Pale yellow | Eating, carrying, sleeping, stage changes |
| caregiver | Cyan | Objects dropped, creature moved, care actions, speech |
| environment | Blue | Day/night transitions, object respawns |
| system | Yellow | Start/pause/restore messages |

### Journal
Tap the creature to view:
- Species emoji, name (renameable), developmental stage badge, current mood
- Drive bars (visual)
- Recent narrative memories (from LLM consolidation)
- Formed interests
- Associative memory highlights ("likes the bedroom," "avoids the stove")

---

## Visual Language

**Rendering:** HTML5 Canvas or DOM grid. Emoji objects at grid positions. The creature is an emoji with mood label, bubble speech, and movement animations.

**Aesthetic:** Continue the CONSTITUTION terrarium's approach — dark background, emoji sprites, colored trails, sparkle effects, mood-driven animations. Mobile-first, vertical layout. The house should feel cozy and watchable.

**Room Rendering:** Rooms can be shown as:
- Option A: All rooms visible simultaneously (split view or side-by-side)
- Option B: One room at a time with navigation (tap doorway to follow creature or switch rooms)

Option A is better for observation (you can see where the creature is at a glance). Option B is better for intimacy and mobile screen real estate. This is an implementation-time decision.

---

## Persistence

All state persists across sessions:
- Creature state: drives, affect, mood, position, room, developmental stage, memories, associations, interests, interaction counts
- House state: object positions, user-placed items, consumed food timers
- Reflection history: narrative memories, association changelog
- Day/night is always derived from the real clock, never stored

Storage: localStorage for browser-only, or local JSON files if using a server component (needed for LLM API calls). The server component is likely necessary for the cloud LLM integration.

---

## What's Not In This Iteration

- **No Forge.** Psyche configuration is hand-authored JSON.
- **No Psyche Wheel UI.** The psyche exists as config data.
- **No Computing Tasks.** The creature lives in its house, not in your file system.
- **No multi-creature UI.** One creature per house. State is namespaced for future expansion.
- **No pixel art / sprite generation.** Emojis only. This is a feature, not a limitation.
- **No multi-agent social dynamics.** The creature's only social relationship is with the caregiver.

---

## Success Criteria

This iteration succeeds if it passes the Chiang Test criteria at the feature level:

1. **Boundary Test** — The creature reacts differently to the same stimulus at day 1 vs. day 10. Poking it, feeding it, moving it to a new room — the response should reflect accumulated experience.

2. **Personality Test** — Two creatures with different psyche configurations (different drive weights) behave observably differently in the same house. Ask them the same question, give them the same objects — their responses diverge.

3. **Growth Test** — The creature's priorities visibly change over a week. A creature that was chronically hungry early on develops different food-related behavior than one that was always well-fed.

4. **Caregiver Effect** — A creature that receives consistent attention develops differently from one that's neglected. Attachment behavior should be observable.

5. **Surprise Test** — The creature does something you didn't explicitly design. The LLM reflection layer produces an association, interest, or behavior that surprises the creator. This is the most important criterion. If the creature never surprises you, it's a toy.

---

## References

- **CORE_PHILOSOPHY.md** — The theoretical foundation. All principles apply.
- **STOMATOGASTRIC.md** — The architectural north star. Modularity, neuromodulation, CPGs, degeneracy.
- **OBSERVER.md** — The Observer design principles. Legibility, enjoyment, iteration speed.
- **Observer Terrarium (parts-bin/modules/observer-shell/)** — The working spatial world reference. Perception, movement, memory, action selection, emoji rendering.
- **Psyche Builder (src/)** — The inner architecture reference. Tick loop, drives, affect, modulation, LLM voice layer, care actions, reflection.
- **Mochi** — The LLM integration pattern reference. Voice not mind, debug console, interest formation.
