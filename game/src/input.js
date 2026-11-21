// Meridian Heat — keyboard + mouse input.
// Tracks held keys, edge-triggered presses, and mouse-drag look deltas.
// Only imports config.js; exposes everything through G.input.
import { CONFIG } from './config.js';

const cfg = CONFIG;

export function init(G) {
  const held = new Set();
  const pressed = new Set(); // edge: cleared each frame by update()
  let lookDx = 0;
  let lookDy = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseDown = false;
  let anyGesture = false;
  // Gamepad state, polled every frame in update().
  let padAxis = { x: 0, y: 0 };
  let padPrevButtons = [];

  function pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pad = pads && pads[0];
    if (!pad || !pad.connected) {
      padAxis = { x: 0, y: 0 };
      padPrevButtons = [];
      return;
    }
    const dead = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    padAxis = { x: dead(pad.axes[0] || 0), y: -dead(pad.axes[1] || 0) };
    // Buttons: 0 jump, 2 enter vehicle, 7 shoot, 9 pause (edge-triggered).
    const map = [[0, cfg.KEYS.jump], [2, cfg.KEYS.enterVehicle], [7, 'Mouse0'], [9, cfg.KEYS.pause]];
    for (const [idx, code] of map) {
      const down = !!(pad.buttons[idx] && pad.buttons[idx].pressed);
      const was = !!padPrevButtons[idx];
      if (down && !was) pressed.add(code);
      if (down) held.add(code);
      else held.delete(code);
    }
    padPrevButtons = Array.from(pad.buttons, (b) => b.pressed);
    if (padAxis.x !== 0 || padAxis.y !== 0) markGesture();
  }

  function markGesture() {
    if (!anyGesture) {
      anyGesture = true;
      if (G.events) G.events.emit('first-gesture');
    }
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    held.add(e.code);
    pressed.add(e.code);
    markGesture();
    // Don't let Space / arrows scroll the page while playing.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    held.delete(e.code);
  }

  function onMouseDown(e) {
    mouseDown = true;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.button === 0) pressed.add('Mouse0');
    markGesture();
  }

  function onMouseUp(e) {
    mouseDown = false;
    dragging = false;
    if (e.button === 0) held.delete('Mouse0');
  }

  function onMouseMove(e) {
    if (!dragging) return;
    lookDx += e.clientX - lastX;
    lookDy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onBlur() {
    held.clear();
    dragging = false;
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  G.input = {
    held,
    pressed,
    isDown(code) {
      return held.has(code);
    },
    // Edge-triggered: true only on the frame the key went down.
    wasPressed(code) {
      return pressed.has(code);
    },
    // Movement axis from WASD/arrows: {x: strafe, y: forward} in [-1, 1].
    // A connected gamepad's left stick adds to the same axis.
    moveAxis() {
      const f = (held.has(cfg.KEYS.forward) || held.has('ArrowUp') ? 1 : 0)
        - (held.has(cfg.KEYS.back) || held.has('ArrowDown') ? 1 : 0);
      const s = (held.has(cfg.KEYS.right) || held.has('ArrowRight') ? 1 : 0)
        - (held.has(cfg.KEYS.left) || held.has('ArrowLeft') ? 1 : 0);
      return {
        x: Math.max(-1, Math.min(1, s + padAxis.x)),
        y: Math.max(-1, Math.min(1, f + padAxis.y)),
      };
    },
    isRunning() {
      return held.has(cfg.KEYS.run) || held.has('ShiftRight');
    },
    consumeLook() {
      if (lookDx === 0 && lookDy === 0) return null;
      const out = { dx: lookDx, dy: lookDy };
      lookDx = 0;
      lookDy = 0;
      return out;
    },
    isMouseDown() {
      return mouseDown;
    },
    hadGesture() {
      return anyGesture;
    },
    hasGamepad() {
      return !!(navigator.getGamepads && navigator.getGamepads()[0]);
    },
    // Called by update() each frame; kept out of the public API by the
    // underscore, but attached so update() (module scope) can reach the
    // closure's pollGamepad.
    _pollGamepad: pollGamepad,
  };
  return G.input;
}

export function update(G, dt) {
  void dt;
  // Poll the gamepad before clearing edge presses, so pad button presses
  // land in the same frame's wasPressed() window as keyboard presses.
  if (G.input) {
    // pollGamepad lives in the init closure; reach it via a stored hook.
    if (typeof G.input._pollGamepad === 'function') G.input._pollGamepad();
  }
  // Clear edge presses so wasPressed() is true for exactly one frame.
  if (G.input) G.input.pressed.clear();
}

export default { init, update };
