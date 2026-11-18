// Keyboard, mouse and touch input. Held keys give a movement vector, a throttle
// and a steering value; one-shot presses (enter car, punch, mission, pause, mute)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_MISSION = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;
export const ACTION_RACE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ENTER = new Set(['KeyE', 'KeyF']);
const PUNCH = new Set(['KeyQ', 'KeyX']);
const MISSION = new Set(['KeyM']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Space', 'Enter']);
const MUTE = new Set(['KeyN']);
const RACE = new Set(['KeyR']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  const touch = { up: false, down: false, left: false, right: false, run: false };

  function press(code) {
    if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(code)) actions |= ACTION_PUNCH;
    else if (MISSION.has(code)) actions |= ACTION_MISSION;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else if (RACE.has(code)) actions |= ACTION_RACE;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || ENTER.has(event.code) || PUNCH.has(event.code) || MISSION.has(event.code)
      || PAUSE.has(event.code) || CONFIRM.has(event.code) || MUTE.has(event.code)
      || RACE.has(event.code) || RUN.has(event.code)) {
      event.preventDefault();
    }
    press(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });

  // On-screen touch buttons (shown on coarse pointers): data-touch names the key.
  for (const btn of document.querySelectorAll('[data-touch]')) {
    const name = btn.getAttribute('data-touch');
    const on = (e) => { e.preventDefault(); touch[name] = true; if (name === 'enter') actions |= ACTION_ENTER; if (name === 'punch') actions |= ACTION_PUNCH; };
    const off = (e) => { e.preventDefault(); touch[name] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  }

  const has = (set) => {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  };

  return {
    moveX() {
      const r = (has(RIGHT) || touch.right ? 1 : 0) - (has(LEFT) || touch.left ? 1 : 0);
      return r;
    },
    moveY() {
      return (has(DOWN) || touch.down ? 1 : 0) - (has(UP) || touch.up ? 1 : 0);
    },
    run() { return has(RUN) || touch.run; },
    // Driving: W/up = gas, S/down = reverse, A/D = steer, Space = handbrake.
    throttle() {
      if (has(UP) || touch.up) return 1;
      if (has(DOWN) || touch.down) return -1;
      return 0;
    },
    steer() {
      return (has(RIGHT) || touch.right ? 1 : 0) - (has(LEFT) || touch.left ? 1 : 0);
    },
    brake() { return keys.has('Space'); },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
