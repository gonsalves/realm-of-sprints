/**
 * Theme.js — Single source of truth for ALL visual constants.
 *
 * Every 3D scene color, material property, lighting parameter, and
 * texture setting lives here. Consumer files import THEME and reference
 * values by domain (scene, lighting, terrain, trees, avatar, etc.).
 *
 * To reskin the game, edit this one file.
 */

export const THEME = {

  // ─── Scene ──────────────────────────────────────────────────────
  scene: {
    background: 0xB8D8F0,
    toneMappingExposure: 1.1,
  },

  // ─── Lighting ───────────────────────────────────────────────────
  lighting: {
    ambient: {
      color: 0xffffff,
      intensity: 0.8,
    },
    directional: {
      color: 0xFFF8E8,
      intensity: 0.7,
      position: [20, 40, 15],
      shadow: {
        mapSize: 4096,
        near: 0.5,
        far: 120,
        extent: 50,
        bias: -0.0003,
        normalBias: 0.03,
      },
    },
    fill: {
      color: 0xC8D8F0,
      intensity: 0.3,
      position: [-15, 20, -10],
    },
    hemisphere: {
      skyColor: 0xB8D8F0,
      groundColor: 0x5A8A4A,
      intensity: 0.5,
    },
  },

  // ─── Terrain Tiles ──────────────────────────────────────────────
  terrain: {
    tiles: {
      grass:  0x7EC850,
      dirt:   0xC4A46C,
      stone:  0x9B9B8A,
      water:  0x4A90C4,
      forest: 0x5A8C40,
    },
    fallbackColor: 0x6BA84A,
    material: {
      roughness: 0.92,
      metalness: 0,
    },
  },

  // ─── Biome Colors (v2 fan-shaped map) ───────────────────────────
  biomes: {
    castle:       { primary: 0xC4A46C, secondary: 0xB8976A, accent: 0x8B7355 },  // Warm dirt/stone
    meadow:       { primary: 0x8BD46A, secondary: 0x7EC850, accent: 0xA8E090 },  // Bright greens
    hills:        { primary: 0x9BAA8A, secondary: 0x8A9E7A, accent: 0xBCC8B0 },  // Sage/mist
    forest:       { primary: 0x3D7A37, secondary: 0x2D6A2A, accent: 0x4A8C40 },  // Dark greens
    quarry:       { primary: 0xA89080, secondary: 0x9B8575, accent: 0xC4A896 },  // Warm stone/clay
    scriptorium:  { primary: 0x8A8A7A, secondary: 0x7A7A6A, accent: 0xA0A090 },  // Parchment grey
    market:       { primary: 0xC8B468, secondary: 0xB8A458, accent: 0xD8C878 },  // Sandy gold
    summit:       { primary: 0xB0A8C0, secondary: 0xA098B0, accent: 0xC0B8D0 },  // Cool lavender stone
  },

  // ─── Terrain Textures (Canvas2D procedural generation) ──────────
  terrainTextures: {
    grass: {
      base: '#7EC850',
      noiseScale: 40,
      noiseAmplitude: 8,
    },
    dirt: {
      base: '#C4A46C',
      noiseScale: 30,
      noiseAmplitude: 8,
      crackColor: 'rgba(100, 80, 50, 0.1)',
    },
    stone: {
      base: '#9B9B8A',
      shadeMin: 140,
      shadeRange: 18,
    },
    water: {
      base: '#4A90C4',
      noiseScale: 50,
      noiseAmplitude: 4,
    },
    forest: {
      base: '#5A8C40',
      noiseScale: 35,
      noiseAmplitude: 6,
    },
  },

  // ─── Trees ──────────────────────────────────────────────────────
  trees: {
    trunk: {
      color: 0x8B6B4A,
      roughness: 0.9,
      metalness: 0,
    },
    crown: {
      color: 0x3D8B37,
      roughness: 0.85,
      metalness: 0,
    },
  },

  // ─── Resource Nodes ─────────────────────────────────────────────
  resourceNodes: {
    marker: {
      color: 0xF0A830,
      roughness: 0.4,
      metalness: 0.05,
    },
    pedestal: {
      color: 0x8B7B5A,
      roughness: 0.9,
      metalness: 0,
    },
    depleted: {
      color: 0x888878,
      opacity: 0.35,
    },
    health: {
      stagnant: {
        color: 0x808080,         // desaturated grey
        emissive: 0x000000,
        emissiveIntensity: 0,
        opacity: 0.6,
        rotationSpeed: 0.15,     // slower rotation
      },
      atRisk: {
        color: 0xF0A830,         // amber (same as normal marker, but glows)
        emissive: 0xE8A020,
        emissiveIntensity: 0.5,
        pulseSpeed: 3.0,         // Hz for emissive pulsing
        pulseAmplitude: 0.3,
      },
      overdue: {
        color: 0xCC4444,         // red
        emissive: 0xCC2222,
        emissiveIntensity: 0.7,
        pulseSpeed: 5.0,         // faster pulsing
        pulseAmplitude: 0.4,
        wobbleSpeed: 2.0,        // scale wobble
        wobbleAmplitude: 0.05,
      },
    },
  },

  // ─── Structures (Milestones) ────────────────────────────────────
  structures: {
    wireframe: {
      color: 0xC4956A,
      opacity: 0.5,
    },
    solid: {
      color: 0xE8DDD0,
      roughness: 0.8,
      metalness: 0,
    },
    complete: {
      color: 0xE8DDD0,
      emissiveColor: 0xC4956A,
      emissiveIntensity: 0.08,
    },
    base: {
      color: 0xC4956A,
      opacity: 0.3,
    },
    stages: {
      foundation: { color: 0xC4A070, roughness: 0.9, metalness: 0 },
      walls:      { color: 0xE8D8C0, roughness: 0.8, metalness: 0 },
      roof:       { color: 0xB85C4A, roughness: 0.85, metalness: 0 },
      door:       { color: 0x8B6B4A, roughness: 0.75, metalness: 0 },
    },
  },

  // ─── Base (Castle) ─────────────────────────────────────────────
  base: {
    platform: { color: 0xD2B48C, roughness: 0.8, metalness: 0 },
    walls:    { color: 0xE8D8C0, roughness: 0.8, metalness: 0 },
    roof:     { color: 0xB85C4A, roughness: 0.85, metalness: 0 },
    tower:    { color: 0xDCC8B0, roughness: 0.8, metalness: 0 },
    battlement: { color: 0xD0BCA0, roughness: 0.85, metalness: 0 },
    gate:     { color: 0x8B6B4A, roughness: 0.75, metalness: 0 },
    keep:     { color: 0xF0E0C8, roughness: 0.8, metalness: 0 },
    pole:     { color: 0x8B6B4A, roughness: 0.7 },
    flag:     { color: 0x5F259F, roughness: 0.7 },
  },

  // ─── Avatar ─────────────────────────────────────────────────────
  avatar: {
    skin: {
      color: 0xFFDBAC,
      roughness: 0.8,
      metalness: 0,
    },
    body: {
      roughness: 0.8,
      metalness: 0,
    },
    legDarken: 0.75,
    carryCube: {
      color: 0xF0A830,
      emissiveColor: 0xF0A830,
      emissiveIntensity: 0.15,
      roughness: 0.5,
    },
    nameSprite: {
      textColor: '#FFFFFF',
      bgColor: 'rgba(0,0,0,0.55)',
      fontSize: 32,
    },
    highlight: {
      emissiveColor: 0xFFEECC,
      emissiveIntensity: 0.12,
    },
    unhighlight: {
      emissiveColor: 0x000000,
      emissiveIntensity: 0,
    },
  },

  // ─── Energy Bar (3D in-scene) ───────────────────────────────────
  energyBar: {
    background: { color: 0x444444, opacity: 0.3 },
    fill:       { color: 0x6DBE6D, opacity: 0.9 },
    gradient: {
      depletedColor: 0xCC5544,
      fullColor: 0x6DBE6D,
    },
  },

  // ─── Shadow Disc ────────────────────────────────────────────────
  shadowDisc: {
    color: 0x000000,
    opacity: 0.18,
  },

  // ─── Resource Colors (category hashing) ─────────────────────────
  resourceColors: [
    0xF0A830, 0xE86040, 0x5BA4CF, 0x9B6DC4,
    0x50B860, 0xD4A840, 0xC46A8B, 0x5ABCB0,
  ],

  // ─── Fog of War ─────────────────────────────────────────────────
  fog: {
    color: { r: 180, g: 200, b: 215 },
    revealFloor: 0.55,
    fadeInSpeed: 2.0,
    fadeOutSpeed: 0.8,
  },

  // ─── Lanterns (night-time warm lighting) ─────────────────────────
  lantern: {
    gate:      { color: 0xFFAA44, intensity: 1.5, range: 8, decay: 2 },
    keep:      { color: 0xFFCC66, intensity: 2.0, range: 12, decay: 2 },
    structure: { color: 0xFFAA44, intensity: 1.0, range: 6, decay: 2 },
    avatar:    { color: 0xFFAA44, intensity: 1.2, range: 5, decay: 2 },
    mesh:      { color: 0x8B6B4A, emissive: 0xFFAA44 },
    fadeStart: 0.4,
  },

  // ─── UI Palette (backward compat for EditorPanel, etc.) ─────────
  // NOTE: THEME_NIGHT below overrides select properties for nighttime.
  palette: {
    WHITE:      '#F0EBE3',
    LIGHT_GREY: '#E8E4DC',
    MID_GREY:   '#888888',
    DARK:       '#1A1A1A',

    RED:    '#CC5544',
    BLUE:   '#5BA4CF',
    ORANGE: '#F0A830',
    GREEN:  '#50B860',
    YELLOW: '#D4C040',

    TERRAIN_GRASS:  '#7EC850',
    TERRAIN_DIRT:   '#C4A46C',
    TERRAIN_STONE:  '#9B9B8A',
    TERRAIN_WATER:  '#4A90C4',
    TERRAIN_FOREST: '#5A8C40',

    FOG_COLOR:      '#B4C8D7',
    BASE_COLOR:     '#D2B48C',
    STRUCTURE_GOLD: '#C4956A',

    AVATAR_COLORS: [
      '#D44A3A', '#4A8CC4', '#D4A840', '#5A9A5A',
      '#9B6DC4', '#C46A8B', '#3ABCB0', '#E87040',
      '#6A8BB4', '#B85C8A', '#5AB870', '#C4904A',
    ],
  },
};

// ─── Night overrides (only the properties that change) ──────────
export const THEME_NIGHT = {
  scene: {
    background: 0x1A2040,
    toneMappingExposure: 0.5,
  },
  lighting: {
    ambient:     { color: 0x304068, intensity: 0.25 },
    directional: { color: 0x8090C0, intensity: 0.15, position: [-15, 35, -10] },
    fill:        { color: 0x203050, intensity: 0.08 },
    hemisphere:  { skyColor: 0x1A2040, groundColor: 0x1A2818, intensity: 0.2 },
  },
  fog: { color: { r: 30, g: 35, b: 55 } },
  shadowDisc: { opacity: 0.06 },
};
