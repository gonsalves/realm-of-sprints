/**
 * ProceduralAnimalBuilder — builds maquette-style animal figurines.
 *
 * Returns a model instance conforming to the Animal interface contract:
 *
 *   group               — THREE.Group to add to scene
 *   animate(action, dt) — 'walk' or 'idle'
 *   faceDirection(dx, dz, dt)
 *   dispose()
 */

import * as THREE from 'three';
import { createShadowDisc } from '../utils/Geometry.js';
import { THEME } from '../utils/Theme.js';

// Animal colors — should eventually move into Theme.js
const ANIMAL_COLORS = {
  cat: {
    body: 0xEDE6DD,
    ears: 0xE0C8BC,
  },
  dog: {
    body: 0xDDD8D0,
    ears: 0xC8C0B8,
  },
  penguin: {
    body: 0x555555,
    belly: 0xF5F5F5,
    beak: 0xE8A030,
    feet: 0xE8A030,
  },
};

const MAT_OPTS = { flatShading: true, roughness: 0.9, metalness: 0 };

export function buildProceduralAnimal(options = {}) {
  const { type = 'cat' } = options;

  const group = new THREE.Group();
  const parts = {};
  let walkPhase = Math.random() * Math.PI * 2;
  let facingAngle = Math.random() * Math.PI * 2;

  // ─── Build model based on type ─────────────────────────────────

  switch (type) {
    case 'cat': _buildCat(group, parts); break;
    case 'dog': _buildDog(group, parts); break;
    case 'penguin': _buildPenguin(group, parts); break;
  }

  // Shadow
  const shadow = createShadowDisc(0.18);
  group.add(shadow);

  group.rotation.y = facingAngle;

  // ─── Animation ─────────────────────────────────────────────────

  function animateWalk(dt) {
    walkPhase += dt * (type === 'penguin' ? 8 : 6);

    if (type === 'penguin') {
      parts.body.rotation.z = Math.sin(walkPhase) * 0.15;
      parts.head.rotation.z = Math.sin(walkPhase) * 0.08;
      if (parts.leftWing) {
        parts.leftWing.rotation.z = 0.15 + Math.sin(walkPhase * 0.5) * 0.2;
        parts.rightWing.rotation.z = -0.15 - Math.sin(walkPhase * 0.5) * 0.2;
      }
    } else {
      const swing = Math.sin(walkPhase) * 0.35;
      const legs = parts.legs;
      if (legs && legs.length === 4) {
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing;
        legs[3].rotation.x = swing;
      }
      parts.body.position.y += Math.abs(Math.sin(walkPhase * 2)) * 0.005;

      if (parts.tail) {
        parts.tail.rotation.z = Math.sin(walkPhase * 1.5) * 0.3;
      }
    }
  }

  function animateIdle(dt) {
    walkPhase += dt * 1.5;
    const restY = type === 'penguin' ? 0.18 : (type === 'cat' ? 0.14 : 0.16);
    const bob = Math.sin(walkPhase) * 0.005;
    parts.body.position.y = restY + bob;

    if (parts.tail && type === 'dog') {
      parts.tail.rotation.z = Math.sin(walkPhase * 2) * 0.4;
    }
  }

  // ─── Public interface (Animal contract) ────────────────────────

  return {
    group,
    type,

    animate(action, dt) {
      switch (action) {
        case 'walk':
          animateWalk(dt);
          break;
        case 'idle':
          animateIdle(dt);
          break;
      }
    },

    faceDirection(dx, dz, dt) {
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - facingAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      facingAngle += diff * Math.min(1, dt * 6);
      group.rotation.y = facingAngle;
    },

    dispose() {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    },
  };
}

// ─── Internal builders ─────────────────────────────────────────────

function _buildCat(group, parts) {
  const C = ANIMAL_COLORS.cat;
  const mat = new THREE.MeshStandardMaterial({ color: C.body, ...MAT_OPTS });
  const earMat = new THREE.MeshStandardMaterial({ color: C.ears, ...MAT_OPTS });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), mat);
  body.position.y = 0.14;
  body.castShadow = true;
  group.add(body);
  parts.body = body;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat);
  head.position.set(0, 0.2, 0.16);
  head.castShadow = true;
  group.add(head);
  parts.head = head;

  const earGeo = new THREE.ConeGeometry(0.03, 0.07, 4);
  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.position.set(-0.04, 0.28, 0.16);
  group.add(leftEar);
  const rightEar = new THREE.Mesh(earGeo, earMat);
  rightEar.position.set(0.04, 0.28, 0.16);
  group.add(rightEar);

  const tailGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.22, 4);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, 0.22, -0.16);
  tail.rotation.x = -0.5;
  group.add(tail);
  parts.tail = tail;

  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 4);
  const positions = [[-0.05, 0.05, 0.08], [0.05, 0.05, 0.08], [-0.05, 0.05, -0.08], [0.05, 0.05, -0.08]];
  parts.legs = [];
  for (const [x, y, z] of positions) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x, y, z);
    group.add(leg);
    parts.legs.push(leg);
  }
}

function _buildDog(group, parts) {
  const C = ANIMAL_COLORS.dog;
  const mat = new THREE.MeshStandardMaterial({ color: C.body, ...MAT_OPTS });
  const earMat = new THREE.MeshStandardMaterial({ color: C.ears, ...MAT_OPTS });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.32), mat);
  body.position.y = 0.16;
  body.castShadow = true;
  group.add(body);
  parts.body = body;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), mat);
  head.position.set(0, 0.22, 0.2);
  head.castShadow = true;
  group.add(head);
  parts.head = head;

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), mat);
  snout.position.set(0, 0.19, 0.3);
  group.add(snout);

  const earGeo = new THREE.BoxGeometry(0.05, 0.08, 0.04);
  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.position.set(-0.08, 0.22, 0.2);
  leftEar.rotation.z = 0.3;
  group.add(leftEar);
  const rightEar = new THREE.Mesh(earGeo, earMat);
  rightEar.position.set(0.08, 0.22, 0.2);
  rightEar.rotation.z = -0.3;
  group.add(rightEar);

  const tailGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.16, 4);
  const tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, 0.24, -0.18);
  tail.rotation.x = -0.7;
  group.add(tail);
  parts.tail = tail;

  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 4);
  const positions = [[-0.06, 0.06, 0.1], [0.06, 0.06, 0.1], [-0.06, 0.06, -0.1], [0.06, 0.06, -0.1]];
  parts.legs = [];
  for (const [x, y, z] of positions) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x, y, z);
    group.add(leg);
    parts.legs.push(leg);
  }
}

function _buildPenguin(group, parts) {
  const C = ANIMAL_COLORS.penguin;
  const bodyMat = new THREE.MeshStandardMaterial({ color: C.body, ...MAT_OPTS });
  const bellyMat = new THREE.MeshStandardMaterial({ color: C.belly, ...MAT_OPTS });
  const accentMat = new THREE.MeshStandardMaterial({ color: C.beak, ...MAT_OPTS });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.28, 8), bodyMat);
  body.position.y = 0.18;
  body.castShadow = true;
  group.add(body);
  parts.body = body;

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bellyMat);
  belly.position.set(0, 0.16, 0.05);
  belly.scale.set(1, 1.2, 0.6);
  group.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bodyMat);
  head.position.set(0, 0.36, 0);
  head.castShadow = true;
  group.add(head);
  parts.head = head;

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), accentMat);
  beak.position.set(0, 0.34, 0.08);
  beak.rotation.x = Math.PI / 2;
  group.add(beak);

  const wingGeo = new THREE.BoxGeometry(0.03, 0.16, 0.08);
  const leftWing = new THREE.Mesh(wingGeo, bodyMat);
  leftWing.position.set(-0.1, 0.2, 0);
  leftWing.rotation.z = 0.15;
  group.add(leftWing);
  parts.leftWing = leftWing;

  const rightWing = new THREE.Mesh(wingGeo, bodyMat);
  rightWing.position.set(0.1, 0.2, 0);
  rightWing.rotation.z = -0.15;
  group.add(rightWing);
  parts.rightWing = rightWing;

  const footGeo = new THREE.BoxGeometry(0.04, 0.02, 0.06);
  const leftFoot = new THREE.Mesh(footGeo, accentMat);
  leftFoot.position.set(-0.04, 0.01, 0.03);
  group.add(leftFoot);
  const rightFoot = new THREE.Mesh(footGeo, accentMat);
  rightFoot.position.set(0.04, 0.01, 0.03);
  group.add(rightFoot);

  parts.legs = [];
}
