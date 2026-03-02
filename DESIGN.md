# Realm of Sprints v2 — Design Document

## Vision

Realm of Sprints reimagines team progress tracking as a living fantasy world. Your team members are adventurers exploring a vast realm — each task is a quest, each stage of work is a distinct biome, and completed work becomes treasure brought back to the castle. As a manager, you open the map and immediately see where everyone is, what they're working on, and who might need help.

The goal: replace "let me check the spreadsheet" with "let me look at the realm."

---

## The Map

### Shape and Layout

The map is a wide fan (~180° or more) radiating outward from the castle, which sits at the focal point on the left edge. The realm sprawls outward to the right in a half-circle, giving a sense of a vast territory being explored.

Distance from the castle corresponds roughly to stage progression — early-stage work (planning, ideation) happens in the near biomes, while later-stage work (building, presenting) takes place in the far reaches of the map. This means a quick glance at avatar distance tells you how far along someone's work is.

### Biomes

Each stage of work maps to a distinct biome. The stages are indicative and not all are required for every task — a task can skip stages or move non-sequentially.

| Stage | Biome | Fantasy Metaphor |
|---|---|---|
| **Planning** | Rolling meadows / farmland | Charting the course — open fields near the castle where quests are conceived |
| **Ideating** | Misty hills / standing stones | The oracle grounds — a place of vision and inspiration |
| **Exploration** | Dense forest (Mirkwood-style) | Pathless woods — no clear trails, the adventurer must find their own way |
| **Building** | Quarry / construction grounds | The forge — raw materials shaped into structures; watchtowers, walls, workshops rising |
| **Documenting** | Scriptorium / library ruins | The archive — ancient halls where knowledge is recorded and preserved |
| **Sharing** | Market square / crossroads | The trading post — a social hub where work is exchanged and reviewed |
| **Presenting** | Amphitheatre / summit | The arena — elevated ground where work is shown to the wider world |

> **Note:** The specific stages and biome metaphors should be refined during implementation. The above is a starting framework.

### Biome Boundaries

Biomes are arranged in a roughly concentric pattern (distance from castle = progression), but with **organic, irregular boundaries**. A forest biome might extend further in one direction; the sea might narrow in another. The map should feel like a real landscape, not a diagram.

Transitions between biomes are **smooth gradients** — terrain blends naturally (forest thins out, grass appears, then sand and water). Notable **landmarks** punctuate the boundaries: a stone bridge over a stream, an ancient archway, ruins of an old wall. These give a sense of crossing into new territory without hard borders.

### Terrain Generation

The map is procedurally generated with seeded noise, similar to v1 but adapted for the fan layout:

- Biome placement follows the concentric-but-organic rule
- Terrain textures blend at boundaries
- Landmark structures are placed deterministically at biome edges
- Water features, elevation changes, and vegetation are distributed naturally within each biome

---

## The Castle (Home Base)

The castle sits at the fan's focal point — the origin of all journeys. It serves three purposes:

1. **Spawn point** — all avatars emerge from the castle
2. **Trophy hall** — completed tasks return here as gems
3. **Team progress monument** — the castle visually evolves as work is completed

### Castle Evolution

The castle upgrades at milestone thresholds (e.g., every N completed tasks):

| Level | Appearance |
|---|---|
| Starting | Modest wooden fort with a single tower and palisade |
| Early | Stone walls replace wood, a second tower appears |
| Mid | Full stone castle with courtyard, banners on towers |
| Advanced | Grand castle with multiple towers, stained glass, decorative elements |
| Endgame | Fortress with golden accents, glowing gem treasury visible through windows |

Completed task gems accumulate visibly — displayed in a treasury room, embedded in castle walls, or arranged around the courtyard. The castle is a living record of the team's output.

---

## People (Avatars)

Each team member is represented by a single avatar on the map. Starting scope is 6-7 direct reports; scaling to 60 is deferred.

### Avatar Behavior

Avatars are **autonomous and continuously animated**. Each avatar:

- Has a set of task markers spread across the map (one per active task, placed in the corresponding biome)
- **Moves between their task markers** — walking through the terrain, crossing biome boundaries, spending time at each task
- Uses A* pathfinding to navigate the terrain
- Applies separation steering to avoid overlapping with other avatars

The map should feel alive at all times — people wandering, traveling, working.

### Avatar Identity

Each avatar is visually distinct:

- Unique color
- Name label (floating above)
- Role indicator (subtle visual cue — e.g., shield shape, staff, quill — based on their function)

---

## Tasks (Quest Markers)

Each task is represented as a **quest marker** placed in the biome corresponding to its current stage. Tasks are the primary objects on the map.

### Task Placement

- Tasks are spread naturally across their biome (not clustered)
- Position within a biome is deterministic (seeded by task ID) so the map is stable across reloads
- When a task changes stage, its marker moves to the new biome (with a visible transition animation)

### Task Size

Tasks vary significantly in size and this should be visually reflected:

| Task Size | Visual Representation |
|---|---|
| Small (days) | Small marker — a flag, a signpost, a minor quest icon |
| Medium (1-2 weeks) | Standard marker — a camp, a waypoint structure |
| Large (multi-week) | Prominent marker — a tower under construction, an imposing quest monument |

> Size could be derived from estimated effort, story points, or a manual size field in the data source.

### Task Lifecycle

1. **Task appears** — a new marker materializes in the appropriate biome
2. **Task progresses** — marker may move between biomes as the stage changes; visual state updates (e.g., a tower gains floors as building progresses)
3. **Task completes** — the marker transforms into a gem. A **town portal** opens, the gem is whisked back to the castle treasury with a visual effect. The marker fades from the map.
4. **Gem arrives at castle** — visible accumulation in the treasury; if a milestone threshold is crossed, the castle upgrades

---

## Health Signals

The system detects two types of problems automatically:

### 1. Stagnation (Stuck in Stage)

If a task remains in the same stage for too long without progressing, it is flagged. This could be visualized as:

- The quest marker dimming, gathering dust, or becoming overgrown
- A visual warning indicator (e.g., a flickering red aura)
- The biome around the marker subtly darkening

Thresholds for "too long" should be configurable per stage (exploration might naturally take longer than documenting).

### 2. Deadline Pressure

As a task approaches or passes its deadline, urgency increases. Possible visual treatments:

- The quest marker glows with increasing intensity (amber to red)
- Storm clouds gather near the marker
- The avatar's energy bar drains (similar to v1's stamina system)
- Overdue tasks could show cracked/damaged markers

### Workload Overload

Each person has a **configurable task capacity threshold**. When their active task count exceeds this:

- Their avatar could visually struggle (slower movement, burdened posture)
- A UI indicator shows they're carrying too many quests
- Their task markers could show a "contested" or "scattered" visual state

### Primary Glance Value

The single most important read from the map is: **"Where is everyone?"** — a spatial snapshot of what stage each person is working in, visible within 2 seconds of opening the app.

Health signals are a secondary layer — they surface problems, but the map's primary job is spatial awareness.

---

## Interaction

### Click Avatar

Opens a **detail panel** showing:

- Person's name, role, avatar color
- Current activity / which task they're walking toward
- Full task list with stage badges and deadline status
- Workload indicator (current tasks vs. capacity threshold)
- Health summary (any stagnant or overdue tasks highlighted)
- **Action buttons:** Send email, schedule 1:1, view tasks in source tool (Jira/Sheets)

### Click Task Marker

Opens a **task detail popup** showing:

- Task name, description
- Current stage and time in stage
- Size / effort estimate
- Assignee (with link to their detail panel)
- Deadline and status (on track / at risk / overdue)
- Stage history (timeline of stage transitions)
- **Action buttons:** Open in Jira/Sheets, send message to assignee

---

## Ambient Life and Animation

The map should feel like a **living, breathing world**, not a static dashboard:

- **Day/night cycle** — continuous lighting changes, lanterns at night (carried forward from v1)
- **Ambient creatures** — animals wandering the biomes (deer in the forest, birds near the meadow, fish in the sea)
- **Weather effects** — subtle environmental animation per biome (mist in the hills, leaves falling in the forest, smoke from the forge)
- **Biome-specific ambient animation** — swaying trees, flowing water, flickering forge fires, pages turning in the scriptorium

---

## Data Sources

Existing Jira and Google Sheets connectors from v1 will be reused. The data model needs to support:

| Field | Source |
|---|---|
| Person (name, role, color) | Sheets / Jira |
| Task (name, description, assignee, stage, size, deadline, % complete) | Sheets / Jira |
| Stage | Mapped from Jira status or a Sheets column |
| Task capacity per person | Configuration (Sheets or in-app settings) |

---

## Tech Stack

Carried forward from v1:

- **Three.js** — 3D rendering, isometric orthographic camera
- **Vite** — build tooling
- **Vanilla JS** — no framework
- **localStorage** — state persistence
- **GitHub Pages** — deployment via GitHub Actions

---

## Asset Architecture

The codebase must support **drop-in replacement of 3D models** — starting with procedural primitives but allowing glTF/GLB models to be swapped in without touching game logic.

### Principles

1. **Model Factory** — a central registry maps entity types (`avatar`, `castle`, `structure`, `animal`, etc.) to a model provider. The provider is either a procedural builder (current approach) or a glTF loader. Game code requests models from the factory, never constructs geometry directly.

2. **Interface contracts** — each entity type defines a standard interface that behavior code programs against. For example, an Avatar model must expose:
   - `group` (Three.js Group to add to scene)
   - `animate(action, dt)` (handles walk, gather, build, idle)
   - `getPickTargets()` (meshes for raycasting)
   - `setHighlight(bool)` / `setCarrying(bool)` / `setEnergy(value)`
   
   Behavior code never directly manipulates limbs, materials, or child meshes.

3. **Convention-based loading** — if a `.glb` file exists at `assets/models/{entity-type}.glb`, the factory loads it automatically. Otherwise, it falls back to the procedural builder. This means you can replace models one at a time without an all-or-nothing migration.

4. **Animation mapping** — glTF models can ship with embedded animations. The factory maps game actions (walk, gather, idle) to named animation clips in the glTF file via a simple config.

---

## Scope

### v2.0 (Initial Release)

- Fan-shaped map with organic biome layout
- Castle with gem treasury and visual evolution
- 6-7 avatars with autonomous movement between tasks
- Task markers with size variation and stage-based biome placement
- Town portal completion mechanic
- Stagnation and deadline health signals
- Click interactions (avatar detail panel, task detail popup, action buttons)
- Day/night cycle and ambient animation
- Google Sheets + Jira data connectors (reuse existing)
- Asset factory with interface contracts (procedural primitives first, glTF-ready)

### Deferred

- Scale to 60 people (hierarchical views, drill-down, navigation aids)
- Team-level milestones / shared quests
- Minimap or roster sidebar for quick navigation
- Biome variation by work type
- Manual "blocked" flags

---

## Open Questions

1. **Exact stage list** — the stages listed above are indicative. What is the final set of stages, and what are the biome metaphors for each?
2. **Task size derivation** — should size come from story points, a manual field, or estimated hours?
3. **Stagnation thresholds** — what's the default "too long in stage" duration per stage?
4. **Castle evolution milestones** — at what completed-task counts should the castle upgrade?
5. **Avatar visual language** — how detailed should the geometric avatars be? Flat-shaded primitives (v1 style) or more detailed character models?
6. **Fog of war** — should v2 retain fog of war from v1, or is the biome landscape always fully visible?
