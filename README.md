# Realm of Sprints

A fantasy atlas that turns your team's sprint progress into a living world. Built with Three.js.

## The Idea

Your team members are **adventurers** exploring a vast realm. Each task is a **quest marker** placed in a biome that matches its work stage. Completed work becomes **treasure** brought back to the castle. As a manager, you open the map and immediately see where everyone is, what they're working on, and who might need help.

### How work maps to the world

| Work concept | World equivalent |
|---|---|
| **Person** | Adventurer avatar with color, name, and stamina |
| **Task** | Quest marker in a biome — size reflects effort (S/M/L) |
| **Work stage** | Biome zone — planning near the castle, building in the forest, presenting at the summit |
| **Task completion** | Town portal opens, gem flies back to the castle treasury |
| **Milestone** | Structure that fills in as contributing tasks complete |
| **Deadline pressure** | Marker glows amber (at risk) or red (overdue) with pulsing |
| **Stagnation** | Marker dims and slows when stuck too long in the same stage |
| **Workload** | Overloaded team members flagged in their detail panel |

### The map

A ~180° fan-shaped continent radiates from the castle at the left edge. Eight biomes arc outward in roughly concentric bands:

**Castle → Meadow → Hills → Forest → Quarry → Scriptorium → Market → Summit**

Boundaries are noise-warped for an organic feel. Each biome has its own terrain palette and tile distribution. Tasks are placed in the biome matching their current work stage — when a task's stage changes, its marker relocates to the new biome.

### The castle

The castle is home base — the origin of all journeys. Avatars spawn here, and completed task gems accumulate in a treasury courtyard. The castle visually evolves through five levels as the team completes work, from a modest wooden fort to a golden fortress with glowing accents.

### Health signals

The system watches for two problems automatically:

- **Deadline pressure** — markers glow amber within 3 days of deadline, red when overdue
- **Stagnation** — markers dim and slow their rotation when a task sits in the same stage too long without progress (configurable per-stage thresholds)

Clicking any marker or avatar surfaces these signals in the UI alongside action buttons (email, schedule 1:1, open in source tool).

## Running Locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Data Sources

By default, the app uses **seed data** (6 people, 10 tasks, 2 milestones). To connect a Google Sheet:

1. Publish your sheet to the web (File → Share → Publish to web → CSV)
2. Set `DATA_SOURCE: 'google-sheets'` and your `GOOGLE_SHEET_ID` in `src/utils/Config.js`

The sheet should have three tabs: **People**, **Tasks**, and **Milestones**.

## Tech

- **Three.js** — isometric orthographic camera, InstancedMesh terrain, DataTexture fog
- **Vite** — dev server and production builds
- **Vanilla JS** — no framework, ES modules throughout
- **localStorage** — persists progress across sessions
- **A\* pathfinding** — on an 80×80 tile grid with procedural biome terrain

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`.

## License

MIT
