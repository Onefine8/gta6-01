// Meridian Heat — keyboard + mouse input.
// Listeners fill `keys` / `pressed`; each frame main.js calls update() first,
// which promotes `pressed` into `justPressed` (read by gameplay modules
// during that frame) and banks the mouse deltas. Nothing else reads events.

import { CFG } from './config.js';

export const input = {
  keys: {}, // code -> bool (held)
  pressed: {}, // code -> bool (pressed since last frame, raw)
  justPressed: {}, // code -> bool (pressed this frame, consumed by modules)
  mouseDX: 0,
  mouseDY: 0,
  mouseDown: false,
  pointerLocked: false,
  anyGesture: false, // set on first key/mouse gesture (audio unlock hook)
};

let _canvas = null;

function onKeyDown(e) {
  if (e.repeat) return;
  input.keys[e.code] = true;
  input.pressed[e.code] = true;
  input.anyGesture = true;
  if (e.code === CFG.KEYS.JUMP || e.code === 'Space') e.preventDefault();
}

function onKeyUp(e) {
  input.keys[e.code] = false;
}

function onMouseMove(e) {
  if (input.pointerLocked) {
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  } else if (input.mouseDown) {
    // Drag-to-orbit fallback when pointer lock is unavailable.
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  }
}

function onMouseDown(e) {
  input.mouseDown = true;
  input.anyGesture = true;
  if (e.button === 0) {
    input.keys.Mouse0 = true;
    input.pressed.Mouse0 = true;
  }
  if (e.button === 2) {
    input.keys.Mouse2 = true;
    input.pressed.Mouse2 = true;
  }
}

function onMouseUp(e) {
  input.mouseDown = false;
  if (e.button === 0) input.keys.Mouse0 = false;
  if (e.button === 2) input.keys.Mouse2 = false;
}

function onContextMenu(e) {
  e.preventDefault();
}

function onPointerLockChange() {
  input.pointerLocked = document.pointerLockElement === _canvas;
}

export function init(G) {
  G.input = input;
  _canvas = document.getElementById('game-canvas');
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  // Clicking the canvas grabs the mouse for orbit + aim.
  _canvas.addEventListener('click', () => {
    if (G.state === 'playing' && !input.pointerLocked && _canvas.requestPointerLock) {
      _canvas.requestPointerLock();
    }
  });
  return input;
}

/** Held? */
export function isDown(code) {
  return !!input.keys[code];
}

/** Pressed on this frame? (valid after input.update runs in the loop) */
export function wasPressed(code) {
  return !!input.justPressed[code];
}

/** WASD drive/walk axes in [-1, 1]. */
export function moveAxis() {
  const k = CFG.KEYS;
  const x = (isDown(k.RIGHT) ? 1 : 0) - (isDown(k.LEFT) ? 1 : 0);
  const y = (isDown(k.FORWARD) ? 1 : 0) - (isDown(k.BACK) ? 1 : 0);
  return { x, y };
}

/** Mouse deltas since last frame; calling consumes them. */
export function consumeMouse() {
  const out = { dx: input.mouseDX, dy: input.mouseDY };
  input.mouseDX = 0;
  input.mouseDY = 0;
  return out;
}

export function update(G, dt) {
  void dt;
  void G;
  // Promote raw presses into this frame's justPressed, then clear raw.
  input.justPressed = input.pressed;
  input.pressed = {};
}

export default input;
