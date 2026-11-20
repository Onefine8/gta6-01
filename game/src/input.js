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
export const ACTION_HORN = 128;
export const ACTION_HELP = 256;
export const ACTION_REPAIR = 512;
export const ACTION_TAXI = 1024;
export const ACTION_BUSINESS = 2048;
export const ACTION_TUNE = 4096;
export const ACTION_CASINO_SLOTS = 8192;
export const ACTION_CASINO_BLACKJACK = 16384;
export const ACTION_CASINO_ROULETTE = 32768;
export const ACTION_SMUGGLING = 65536;
export const ACTION_DEALERSHIP = 131072;

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
const HELP = new Set(['KeyH']);
const REPAIR = new Set(['KeyG']);
const TAXI = new Set(['KeyT']);
const BUSINESS = new Set(['KeyB']);
const TUNE = new Set(['KeyU']);
const CASINO_SLOTS = new Set(['KeyV']);
const CASINO_BLACKJACK = new Set(['KeyJ']);
const CASINO_ROULETTE = new Set(['KeyK']);
const SMUGGLING = new Set(['KeyZ']);
const DEALERSHIP = new Set(['KeyO']);
const HORN = new Set(['KeyC']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let zoomLevel = 0;
  const touch = { up: false, down: false, left: false, right: false, run: false };

  function press(code) {
    if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(code)) actions |= ACTION_PUNCH;
    else if (MISSION.has(code)) actions |= ACTION_MISSION;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else if (RACE.has(code)) actions |= ACTION_RACE;
    else if (HELP.has(code)) actions |= ACTION_HELP;
    else if (REPAIR.has(code)) actions |= ACTION_REPAIR;
    else if (TAXI.has(code)) actions |= ACTION_TAXI;
    else if (BUSINESS.has(code)) actions |= ACTION_BUSINESS;
    else if (TUNE.has(code)) actions |= ACTION_TUNE;
    else if (CASINO_SLOTS.has(code)) actions |= ACTION_CASINO_SLOTS;
    else if (CASINO_BLACKJACK.has(code)) actions |= ACTION_CASINO_BLACKJACK;
    else if (CASINO_ROULETTE.has(code)) actions |= ACTION_CASINO_ROULETTE;
    else if (SMUGGLING.has(code)) actions |= ACTION_SMUGGLING;
    else if (DEALERSHIP.has(code)) actions |= ACTION_DEALERSHIP;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || ENTER.has(event.code) || PUNCH.has(event.code) || MISSION.has(event.code)
      || PAUSE.has(event.code) || CONFIRM.has(event.code) || MUTE.has(event.code)
      || RACE.has(event.code) || RUN.has(event.code) || HELP.has(event.code)
      || REPAIR.has(event.code) || TAXI.has(event.code) || BUSINESS.has(event.code) || HORN.has(event.code)
      || TUNE.has(event.code) || CASINO_SLOTS.has(event.code)
      || CASINO_BLACKJACK.has(event.code) || CASINO_ROULETTE.has(event.code)
      || SMUGGLING.has(event.code) || DEALERSHIP.has(event.code)) {
      event.preventDefault();
    }
    press(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });
  // Mouse wheel zooms the camera in and out (three steps); the game never
  // scrolls the page, so the wheel is free for the camera.
  target.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomLevel = Math.max(0, Math.min(2, zoomLevel + (event.deltaY < 0 ? 1 : -1)));
  }, { passive: false });

  // On-screen touch buttons (shown on coarse pointers): data-touch names the key.
  for (const btn of document.querySelectorAll('[data-touch]')) {
    const name = btn.getAttribute('data-touch');
    const on = (e) => {
      e.preventDefault();
      touch[name] = true;
      if (name === 'enter') actions |= ACTION_ENTER;
      if (name === 'punch') actions |= ACTION_PUNCH;
      if (name === 'race') actions |= ACTION_RACE;
      if (name === 'mission') actions |= ACTION_MISSION;
      if (name === 'repair') actions |= ACTION_REPAIR;
      if (name === 'business') actions |= ACTION_BUSINESS;
      if (name === 'help') actions |= ACTION_HELP;
    };
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
    // Horn is held, not queued: C (or the horn button) toots while held.
    horn() { return has(HORN); },
    zoomLevel() { return zoomLevel; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
