import * as THREE from 'three';

export class Raycaster {
  constructor(camera, renderer, unitManager, gameMap) {
    this.camera = camera;
    this.renderer = renderer;
    this.unitManager = unitManager;
    this.gameMap = gameMap;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this._avatarClickCallbacks = [];
    this._avatarHoverCallbacks = [];
    this._resourceClickCallbacks = [];
    this._hoveredId = null;
    this._hoveredType = null; // 'avatar' | 'resource'

    const canvas = renderer.domElement;
    canvas.addEventListener('click', (e) => this._onClick(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
  }

  _getNDC(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _getAllPickables() {
    const avatarPicks = this.unitManager.getPickableObjects();
    const resourcePicks = this.gameMap ? this.gameMap.getResourceNodePickables() : [];
    return [...avatarPicks, ...resourcePicks];
  }

  _raycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const pickables = this._getAllPickables();
    return this.raycaster.intersectObjects(pickables, false);
  }

  _classifyHit(hit) {
    const obj = hit.object;
    if (obj.userData.personId) return { type: 'avatar', id: obj.userData.personId };
    if (obj.userData.taskId && obj.userData.isResourceNode) return { type: 'resource', id: obj.userData.taskId };
    return null;
  }

  _onClick(e) {
    if (e.target !== this.renderer.domElement) return;

    this._getNDC(e);
    const hits = this._raycast();

    if (hits.length > 0) {
      const info = this._classifyHit(hits[0]);
      if (!info) return;

      if (info.type === 'avatar') {
        for (const cb of this._avatarClickCallbacks) cb(info.id);
      } else if (info.type === 'resource') {
        for (const cb of this._resourceClickCallbacks) cb(info.id);
      }
    }
  }

  _onMouseMove(e) {
    if (e.target !== this.renderer.domElement) return;

    this._getNDC(e);
    const hits = this._raycast();

    if (hits.length > 0) {
      const info = this._classifyHit(hits[0]);
      if (!info) {
        this._clearHover();
        return;
      }

      if (info.type === 'avatar' && info.id !== this._hoveredId) {
        this._clearHover();
        this._hoveredId = info.id;
        this._hoveredType = 'avatar';

        const avatar = this.unitManager.getAvatars().get(info.id);
        if (avatar) {
          avatar.highlight();
          this.renderer.domElement.style.cursor = 'pointer';
          const screenPos = this._worldToScreen(avatar.group.position);
          for (const cb of this._avatarHoverCallbacks) cb(info.id, screenPos);
        }
      } else if (info.type !== 'avatar' && (info.id !== this._hoveredId || info.type !== this._hoveredType)) {
        this._clearHover();
        this._hoveredId = info.id;
        this._hoveredType = info.type;
        this.renderer.domElement.style.cursor = 'pointer';
      }
    } else {
      this._clearHover();
    }
  }

  _clearHover() {
    if (this._hoveredId && this._hoveredType === 'avatar') {
      const prev = this.unitManager.getAvatars().get(this._hoveredId);
      if (prev) prev.unhighlight();
      for (const cb of this._avatarHoverCallbacks) cb(null, { x: 0, y: 0 });
    }
    if (this._hoveredId) {
      this._hoveredId = null;
      this._hoveredType = null;
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  _worldToScreen(position) {
    const vec = position.clone();
    vec.y += 2;
    vec.project(this.camera);
    return {
      x: (vec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vec.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  onAvatarClick(cb) { this._avatarClickCallbacks.push(cb); }
  onAvatarHover(cb) { this._avatarHoverCallbacks.push(cb); }
  onResourceClick(cb) { this._resourceClickCallbacks.push(cb); }
}
