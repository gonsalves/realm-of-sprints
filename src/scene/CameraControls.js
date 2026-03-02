import { lerp, clamp } from '../utils/Math.js';

export class CameraControls {
  constructor(camera, renderer, bounds, initialFocus) {
    this.camera = camera;
    this.domElement = renderer.domElement;
    this.bounds = bounds;

    // Camera target (what we're looking at, on the XZ plane)
    this.targetX = initialFocus ? initialFocus.x : bounds.centerX;
    this.targetZ = initialFocus ? initialFocus.z : bounds.centerZ;
    this.currentX = this.targetX;
    this.currentZ = this.targetZ;

    // Zoom
    this.zoom = 0.35;
    this.targetZoom = 0.35;
    this.minZoom = 0.2;
    this.maxZoom = 2.5;

    // Drag state
    this._isDragging = false;
    this._lastMouse = { x: 0, y: 0 };

    this._bindEvents();
    this._updateCamera();
  }

  _bindEvents() {
    this.domElement.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', () => this._onPointerUp());
    this.domElement.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Keyboard
    this._keys = new Set();
    window.addEventListener('keydown', (e) => this._keys.add(e.key));
    window.addEventListener('keyup', (e) => this._keys.delete(e.key));
  }

  _onPointerDown(e) {
    // Right-click or middle-click to pan, or left-click on empty space
    if (e.button === 1 || e.button === 2) {
      this._isDragging = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }

  _onPointerMove(e) {
    if (!this._isDragging) return;

    const dx = e.clientX - this._lastMouse.x;
    const dy = e.clientY - this._lastMouse.y;
    this._lastMouse = { x: e.clientX, y: e.clientY };

    // Convert screen movement to world-space pan
    // In isometric view, screen X maps to world X-Z diagonal, screen Y maps to the other diagonal
    const panSpeed = 0.05 / this.zoom;
    this.targetX -= (dx + dy) * panSpeed * 0.7;
    this.targetZ -= (-dx + dy) * panSpeed * 0.7;

    this._clampTarget();
  }

  _onPointerUp() {
    this._isDragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.001;
    this.targetZoom = clamp(this.targetZoom * (1 + zoomDelta * 3), this.minZoom, this.maxZoom);
  }

  _clampTarget() {
    const margin = 5;
    this.targetX = clamp(this.targetX, this.bounds.minX - margin, this.bounds.maxX + margin);
    this.targetZ = clamp(this.targetZ, this.bounds.minZ - margin, this.bounds.maxZ + margin);
  }

  update(dt) {
    // Keyboard pan
    const panSpeed = 15 * dt / this.zoom;
    if (this._keys.has('ArrowLeft') || this._keys.has('a')) this.targetX -= panSpeed;
    if (this._keys.has('ArrowRight') || this._keys.has('d')) this.targetX += panSpeed;
    if (this._keys.has('ArrowUp') || this._keys.has('w')) this.targetZ -= panSpeed;
    if (this._keys.has('ArrowDown') || this._keys.has('s')) this.targetZ += panSpeed;
    this._clampTarget();

    // Smooth interpolation
    const smoothing = 1 - Math.pow(0.001, dt);
    this.currentX = lerp(this.currentX, this.targetX, smoothing);
    this.currentZ = lerp(this.currentZ, this.targetZ, smoothing);
    this.zoom = lerp(this.zoom, this.targetZoom, smoothing);

    this._updateCamera();
  }

  _updateCamera() {
    const dist = 50;
    this.camera.position.set(
      this.currentX + dist,
      dist,
      this.currentZ + dist
    );
    this.camera.lookAt(this.currentX, 0, this.currentZ);

    // Apply zoom by adjusting frustum
    const aspect = window.innerWidth / window.innerHeight;
    const baseFrustum = 20 / this.zoom;
    this.camera.left = -baseFrustum * aspect;
    this.camera.right = baseFrustum * aspect;
    this.camera.top = baseFrustum;
    this.camera.bottom = -baseFrustum;
    this.camera.updateProjectionMatrix();
  }

  // Enable left-click drag as alternative pan mode (when not clicking on avatars)
  enableLeftClickPan() {
    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this._isDragging = true;
        this._lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
  }
}
