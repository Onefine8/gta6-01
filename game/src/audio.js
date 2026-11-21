// Meridian Heat — synthesized audio (WebAudio, no audio files).
// Engine hum, siren, gunshots, crashes, UI blips and a tiny synth radio.
// The AudioContext is created ONLY after a user gesture (or never, in
// ?shot= screenshot mode, where audio stays silent). Nothing here plays
// before the player interacts, so browsers never block the game.
import { CONFIG } from './config.js';

const cfg = CONFIG;

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let sirenTimer = null;
let sirenOn = false;
let radioTimer = null;
let radioOn = false;
let radioStep = 0;
let muted = false;
let enabled = true; // false in ?shot= mode

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function noiseBuffer(duration = 0.5) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// --- Engine ---------------------------------------------------------------
function startEngine() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0.0;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
}

function setEngine(speedNorm, driving) {
  if (!ctx) return;
  if (!driving) {
    if (engineGain) engineGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.1);
    return;
  }
  startEngine();
  const rpm = 55 + speedNorm * 140;
  engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
  engineFilter.frequency.setTargetAtTime(320 + speedNorm * 900, ctx.currentTime, 0.1);
  engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.07, ctx.currentTime, 0.1);
}

function stopEngine() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch (e) { /* already stopped */ }
  engineOsc = null;
  engineGain = null;
  engineFilter = null;
}

// --- Siren ----------------------------------------------------------------
function setSiren(on) {
  if (on === sirenOn) return;
  sirenOn = on;
  if (on) {
    if (!ctx) return;
    let high = true;
    sirenTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      blip(high ? 880 : 660, 0.28, 'sine', 0.07);
      high = !high;
    }, 300);
  } else if (sirenTimer !== null) {
    window.clearInterval(sirenTimer);
    sirenTimer = null;
  }
}

// --- One-shots ------------------------------------------------------------
function shot() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.18);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
  blip(160, 0.08, 'square', 0.25);
}

function crash(strength = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4 * strength, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

function pickup() {
  blip(660, 0.09, 'sine', 0.2);
  blip(990, 0.14, 'sine', 0.2, 0.09);
}

function missionComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => blip(n, 0.22, 'triangle', 0.22, i * 0.12));
}

function missionFail() {
  const notes = [392, 330, 262];
  notes.forEach((n, i) => blip(n, 0.3, 'sawtooth', 0.14, i * 0.16));
}

function uiClick() {
  blip(740, 0.06, 'sine', 0.15);
}

function wantedUp() {
  blip(220, 0.15, 'square', 0.16);
  blip(220, 0.15, 'square', 0.16, 0.18);
}

function horn() {
  blip(370, 0.18, 'square', 0.12);
  blip(466, 0.18, 'square', 0.1);
}

function skid() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1100;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

function footstep(run) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.07);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(run ? 0.14 : 0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
}

function doorSlam() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.12);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
  blip(90, 0.1, 'sine', 0.25);
}

function reload() {
  blip(1200, 0.05, 'square', 0.1);
  blip(900, 0.05, 'square', 0.1, 0.12);
  blip(1400, 0.06, 'square', 0.12, 0.26);
}

// --- Radio: tiny 8-step synth loop, three stations ------------------------
const RADIO_STATIONS = [
  { name: 'MERIDIAN FM', bpm: 112, bass: [55, 0, 65.4, 0, 55, 0, 49, 58.3], lead: [220, 262, 330, 262, 294, 330, 392, 330] },
  { name: 'NEON NIGHTS', bpm: 96, bass: [49, 49, 0, 58.3, 49, 0, 65.4, 0], lead: [196, 0, 247, 294, 247, 220, 196, 0] },
  { name: 'HARBOR JAZZ', bpm: 80, bass: [65.4, 0, 0, 82.4, 0, 65.4, 0, 73.4], lead: [330, 370, 415, 370, 330, 294, 262, 294] },
];
let stationIndex = 0;

function radioTick() {
  if (!ctx || muted || !radioOn) return;
  const station = RADIO_STATIONS[stationIndex];
  const stepDur = 60 / station.bpm / 2;
  const bass = station.bass[radioStep % 8];
  const lead = station.lead[radioStep % 8];
  if (bass) blip(bass, stepDur * 0.9, 'triangle', 0.16);
  if (lead) blip(lead, stepDur * 0.7, 'square', 0.05);
  radioStep += 1;
  radioTimer = window.setTimeout(radioTick, stepDur * 1000);
}

function setRadio(on) {
  radioOn = on;
  if (on) {
    if (!ctx) return;
    radioStep = 0;
    radioTick();
  } else if (radioTimer !== null) {
    window.clearTimeout(radioTimer);
    radioTimer = null;
  }
}

function nextStation() {
  stationIndex = (stationIndex + 1) % RADIO_STATIONS.length;
  return RADIO_STATIONS[stationIndex].name;
}

// ---------------------------------------------------------------------------
export function init(G) {
  const params = new URLSearchParams(window.location.search);
  if (params.has('shot')) {
    // Screenshot mode: stay completely silent.
    enabled = false;
    muted = true;
  }

  // Create the context only after the first real gesture.
  if (G.events) {
    G.events.on('first-gesture', () => {
      if (enabled && !muted) ensureContext();
    });
  }
  window.addEventListener('pointerdown', () => {
    if (enabled && !muted) ensureContext();
  }, { once: false });

  G.audio = {
    ensureContext,
    setEngine,
    startEngine,
    stopEngine,
    setSiren,
    shot,
    crash,
    skid,
    footstep,
    doorSlam,
    reload,
    pickup,
    missionComplete,
    missionFail,
    uiClick,
    wantedUp,
    horn,
    setRadio,
    nextStation,
    currentStation() {
      return RADIO_STATIONS[stationIndex].name;
    },
    isRadioOn() {
      return radioOn;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    play(name, arg) {
      switch (name) {
        case 'shot': shot(); break;
        case 'crash': crash(arg); break;
        case 'skid': skid(); break;
        case 'footstep': footstep(!!arg); break;
        case 'doorSlam': doorSlam(); break;
        case 'reload': reload(); break;
        case 'pickup': pickup(); break;
        case 'missionComplete': missionComplete(); break;
        case 'missionFail': missionFail(); break;
        case 'uiClick': uiClick(); break;
        case 'wantedUp': wantedUp(); break;
        case 'horn': horn(); break;
        default: break;
      }
    },
  };
  return G.audio;
}

export function update(G, dt) {
  void dt;
  // Keep the engine hum in sync with the player's vehicle, if any.
  if (!ctx || muted) return;
  const v = G.vehicles && G.vehicles.current ? G.vehicles.current : null;
  if (v && G.player && G.player.inVehicle) {
    const norm = Math.min(1, Math.abs(v.speed || 0) / cfg.VEHICLE.maxSpeed);
    setEngine(norm, true);
  } else {
    setEngine(0, false);
  }
  // Siren follows the nearest pursuing police car.
  const chasing = G.police && typeof G.police.anyChasing === 'function'
    ? G.police.anyChasing()
    : !!(G.police && G.police.chasing);
  setSiren(!!chasing && G.state === 'playing');
}

export default { init, update };
