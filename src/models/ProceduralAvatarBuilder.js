/**
 * ProceduralAvatarBuilder — builds the maquette-style avatar from Three.js primitives.
 *
 * Returns a model instance conforming to the Avatar interface contract:
 *
 *   group          — THREE.Group to add to scene
 *   animate(action, dt)  — 'walk', 'idle', 'gather', 'build'
 *   faceDirection(dx, dz, dt)
 *   setCarrying(bool)
 *   setEnergy(value)
 *   setHighlight(bool)
 *   setTimeOfDay(t)
 *   setShadowOpacity(opacity)
 *   getPickTargets() — array of meshes for raycasting
 *   dispose()
 */

import * as THREE from 'three';
import { createTextSprite, createShadowDisc } from '../utils/Geometry.js';
import { lerp } from '../utils/Math.js';
import { THEME } from '../utils/Theme.js';

export function buildProceduralAvatar(options = {}) {
  const { id, name, color: colorHex } = options;

  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);

  // Internal state
  let energy = 1.0;
  let carrying = false;
  let walkPhase = Math.random() * Math.PI * 2;
  let facingAngle = 0;
  let gatherPhase = 0;
  let buildPhase = 0;

  // ─── Build body ────────────────────────────────────────────────
  const A = THEME.avatar;

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: A.body.roughness,
    metalness: A.body.metalness,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: A.skin.color,
    flatShading: true,
    roughness: A.skin.roughness,
    metalness: A.skin.metalness,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skinMat);
  head.position.y = 1.45;
  head.castShadow = true;
  group.add(head);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), bodyMat);
  torso.position.y = 0.92;
  torso.castShadow = true;
  group.add(torso);

  const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.55, 6);
  const legMat = bodyMat.clone();
  legMat.color.copy(color).multiplyScalar(A.legDarken);

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.12, 0.3, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.12, 0.3, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.11);
  const leftArm = new THREE.Mesh(armGeo, bodyMat);
  leftArm.position.set(-0.38, 0.9, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, bodyMat);
  rightArm.position.set(0.38, 0.9, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Carried resource cube
  const carryMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({
      color: A.carryCube.color,
      emissive: A.carryCube.emissiveColor,
      emissiveIntensity: A.carryCube.emissiveIntensity,
      roughness: A.carryCube.roughness,
    })
  );
  carryMesh.position.set(0, 1.2, 0.3);
  carryMesh.visible = false;
  group.add(carryMesh);

  // ─── Name label ────────────────────────────────────────────────
  if (name) {
    const ns = A.nameSprite;
    const nameSprite = createTextSprite(name, ns.fontSize, ns.textColor, ns.bgColor);
    nameSprite.position.y = 2.1;
    group.add(nameSprite);
  }

  // ─── Shadow disc ───────────────────────────────────────────────
  const shadowDisc = createShadowDisc(0.4);
  group.add(shadowDisc);

  // ─── Lantern ───────────────────────────────────────────────────
  const L = THEME.lantern;

  const lanternLight = new THREE.PointLight(
    L.avatar.color, 0, L.avatar.range, L.avatar.decay
  );
  lanternLight.position.set(0.3, 1.0, 0.3);
  lanternLight.castShadow = false;
  group.add(lanternLight);

  const lanternMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.08),
    new THREE.MeshStandardMaterial({
      color: L.mesh.color,
      emissive: L.mesh.emissive,
      emissiveIntensity: 0,
    })
  );
  lanternMesh.position.set(0.3, 0.9, 0.3);
  lanternMesh.visible = false;
  group.add(lanternMesh);

  // ─── UserData ──────────────────────────────────────────────────
  group.userData.personId = id;
  group.userData.isAvatar = true;

  // ─── Animation helpers ─────────────────────────────────────────

  function animateWalk(dt, isMoving) {
    if (isMoving) {
      walkPhase += dt * 6;
      const legSwing = Math.sin(walkPhase) * 0.3;
      leftLeg.rotation.x = legSwing;
      rightLeg.rotation.x = -legSwing;
      leftArm.rotation.x = -legSwing * 0.6;
      rightArm.rotation.x = legSwing * 0.6;
      torso.position.y = 0.92 + Math.abs(Math.sin(walkPhase * 2)) * 0.03;
      head.position.y = 1.45 + Math.abs(Math.sin(walkPhase * 2)) * 0.02;

      if (carrying) {
        carryMesh.position.y = 1.2 + Math.abs(Math.sin(walkPhase * 2)) * 0.05;
      }
    } else {
      walkPhase += dt * 1.2;
      const bob = Math.sin(walkPhase) * 0.015;
      torso.position.y = 0.92 + bob;
      head.position.y = 1.45 + bob * 0.5;

      leftLeg.rotation.x = lerp(leftLeg.rotation.x, 0, dt * 5);
      rightLeg.rotation.x = lerp(rightLeg.rotation.x, 0, dt * 5);
      leftArm.rotation.x = lerp(leftArm.rotation.x, 0, dt * 5);
      rightArm.rotation.x = lerp(rightArm.rotation.x, 0, dt * 5);
    }
  }

  function animateGather(dt) {
    gatherPhase += dt * 4;
    const swing = Math.sin(gatherPhase) * 0.8;
    rightArm.rotation.x = -0.3 + swing;
    leftArm.rotation.x = -0.3;
    torso.position.y = 0.92 + Math.abs(Math.sin(gatherPhase * 0.5)) * 0.03;
  }

  function animateBuild(dt) {
    buildPhase += dt * 3;
    const swing = Math.sin(buildPhase) * 0.6;
    rightArm.rotation.x = -0.5 + swing;
    leftArm.rotation.x = -0.5 - swing * 0.3;
    torso.position.y = 0.92 + Math.abs(Math.sin(buildPhase)) * 0.02;
  }

  // ─── Public interface (Avatar contract) ────────────────────────

  return {
    group,

    /**
     * Animate the model.
     * @param {string} action — 'walk', 'idle', 'gather', 'build'
     * @param {number} dt — delta time in seconds
     * @param {object} [context] — additional context (e.g. { isMoving } for walk/idle)
     */
    animate(action, dt, context = {}) {
      switch (action) {
        case 'walk':
          animateWalk(dt, true);
          break;
        case 'idle':
          animateWalk(dt, false);
          break;
        case 'gather':
          animateGather(dt);
          break;
        case 'build':
          animateBuild(dt);
          break;
      }
    },

    faceDirection(dx, dz, dt) {
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - facingAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      facingAngle += diff * Math.min(1, dt * 8);
      group.rotation.y = facingAngle;
    },

    setCarrying(value) {
      carrying = value;
      carryMesh.visible = value;
    },

    setEnergy(value) {
      energy = value;
    },

    getEnergy() {
      return energy;
    },

    setHighlight(on) {
      if (on) {
        bodyMat.emissive.set(A.highlight.emissiveColor);
        bodyMat.emissiveIntensity = A.highlight.emissiveIntensity;
      } else {
        bodyMat.emissive.set(A.unhighlight.emissiveColor);
        bodyMat.emissiveIntensity = A.unhighlight.emissiveIntensity;
      }
    },

    setTimeOfDay(t) {
      const fadeStart = THEME.lantern.fadeStart;
      const raw = Math.max(0, Math.min(1, (t - fadeStart) / (1 - fadeStart)));
      const fade = raw * raw * (3 - 2 * raw);

      lanternLight.intensity = L.avatar.intensity * fade;
      lanternMesh.material.emissiveIntensity = fade * 0.8;
      lanternMesh.visible = t > fadeStart * 0.8;
    },

    setShadowOpacity(opacity) {
      if (shadowDisc && shadowDisc.material) {
        shadowDisc.material.opacity = opacity;
      }
    },

    getPickTargets() {
      return [head, torso, leftLeg, rightLeg, leftArm, rightArm];
    },

    dispose() {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    },
  };
}
