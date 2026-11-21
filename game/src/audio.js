// Meridian Heat — synthesized audio (WebAudio, no audio files).
// Engine hum, sirens, gunshots, UI blips, crashes and four radio stations
// are all built from oscillators + filtered noise. The AudioContext is only
// created after a user gesture (see unlock()), never on page load.

import { CFG } from './config.js';

export const audio = {
  ctx: null,
  master: null,
  muted: false,
  station: 0,
  engine: null, // {osc, osc2, gain, filter}
  siren: null, // {osc, gain, lfo}
  radioTimer: 0,
  radioStep: 0,
  radioNextTime: 0,
  _noiseBuf: null,
  _unlocked: false,
};

function makeNoiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Create the AudioContext. Call only from a user gesture. */
export function unlock() {
  if (audio._unlocked) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    audio._noiseBuf = makeNoiseBuffer(audio.ctx, 1);
    audio._unlocked = true;
    startEngine();
    return true;
  } catch (e) {
    console.warn('[audio] unlock failed:', e);
    return false;
  }
}

export function setMuted(m) {
  audio.muted = m;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(m ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}

// --- Engine -----------------------------------------------------------------
function startEngine() {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 28;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  osc.start();
  osc2.start();
  audio.engine = { osc, osc2, gain, filter };
}

function updateEngine(G) {
  const e = audio.engine;
  if (!e || !audio.ctx) return;
  let speed = 0;
  let driving = false;
  if (G.player && G.player.vehicle && G.vehicles && G.vehicles.getActive) {
    const v = G.vehicles.getActive();
    if (v) {
      speed = Math.abs(v.speed || 0);
      driving = true;
    }
  }
  const target = driving ? 0.05 + Math.min(0.16, speed / CFG.CAR.MAX_SPEED * 0.16) : 0;
  e.gain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
  const rpm = 50 + speed * 3.2;
  e.osc.frequency.setTargetAtTime(rpm, audio.ctx.currentTime, 0.08);
  e.osc2.frequency.setTargetAtTime(rpm * 0.5, audio.ctx.currentTime, 0.08);
  e.filter.frequency.setTargetAtTime(280 + speed * 14, audio.ctx.currentTime, 0.1);
}

// --- Siren --------------------------------------------------------------------
function startSiren() {
  if (!audio.ctx || audio.siren) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 700;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.9;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  lfo.start();
  audio.siren = { osc, lfo, gain };
}

function stopSiren() {
  if (!audio.siren || !audio.ctx) return;
  try {
    audio.siren.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.1);
    const s = audio.siren;
    setTimeout(() => {
      try { s.osc.stop(); s.lfo.stop(); } catch (e) { /* already stopped */ }
    }, 400);
  } catch (e) { /* ignore */ }
  audio.siren = null;
}

// --- One-shots ------------------------------------------------------------------
function blip(freq, dur, type, vol) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.02);
}

function noiseBurst(dur, filterFreq, vol, type) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = audio._noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type || 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  src.start();
  src.stop(ctx.currentTime + dur + 0.02);
}

export function playShot() {
  noiseBurst(0.16, 1800, 0.5, 'bandpass');
  blip(160, 0.08, 'square', 0.25);
}

export function playBlip() { blip(880, 0.07, 'sine', 0.18); }
export function playConfirm() { blip(660, 0.09, 'sine', 0.2); setTimeout(() => blip(990, 0.12, 'sine', 0.2), 90); }
export function playError() { blip(220, 0.18, 'sawtooth', 0.15); }
export function playCrash() { noiseBurst(0.4, 500, 0.6); blip(70, 0.3, 'sine', 0.4); }
export function playPickup() { blip(523, 0.08, 'sine', 0.2); setTimeout(() => blip(784, 0.12, 'sine', 0.2), 80); }
export function playHorn() { blip(370, 0.25, 'square', 0.12); blip(466, 0.25, 'square', 0.12); }
export function playSirenBlip() { blip(1200, 0.12, 'triangle', 0.12); setTimeout(() => blip(900, 0.12, 'triangle', 0.12), 130); }
export function playMissionStart() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110));
}
export function playMissionComplete() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'triangle', 0.22), i * 120));
}
export function playBusted() {
  [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.16), i * 160));
}

// --- Radio ----------------------------------------------------------------------
const SCALES = {
  synthwave: [0, 3, 5, 7, 10],
  electro: [0, 2, 3, 7, 8, 10],
  funk: [0, 3, 5, 6, 7, 10],
  talk: null,
};

function radioNote(freq, time, dur, type, vol) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function scheduleRadioStep(G) {
  const station = CFG.RADIO[audio.station % CFG.RADIO.length];
  if (!station || station.genre === 'talk') return;
  const ctx = audio.ctx;
  const stepDur = 60 / station.tempo / 2; // eighth notes
  const now = ctx.currentTime;
  if (audio.radioNextTime < now) audio.radioNextTime = now + 0.05;
  // Schedule a bar ahead.
  while (audio.radioNextTime < now + 0.25) {
    const step = audio.radioStep % 16;
    const t = audio.radioNextTime;
    const scale = SCALES[station.genre] || SCALES.synthwave;
    const root = station.genre === 'funk' ? 110 : 55;
    // Bass on beats 0, 4, 8, 12 (and offbeat for funk).
    if (step % 4 === 0 || (station.genre === 'funk' && step % 4 === 2)) {
      const deg = scale[(step / 4) % scale.length];
      radioNote(root * Math.pow(2, deg / 12), t, stepDur * 1.8, 'sawtooth', 0.10);
    }
    // Sparkle arp on even steps.
    if (step % 2 === 0) {
      const deg = scale[(step * 7) % scale.length];
      radioNote(root * 8 * Math.pow(2, deg / 12), t, stepDur * 0.9, 'square', 0.035);
    }
    // Hat tick on odd steps.
    if (step % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = audio._noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(audio.master);
      src.start(t); src.stop(t + 0.06);
    }
    audio.radioStep++;
    audio.radioNextTime += stepDur;
  }
}

export function nextStation() {
  audio.station = (audio.station + 1) % CFG.RADIO.length;
  audio.radioStep = 0;
  if (audio.ctx) audio.radioNextTime = audio.ctx.currentTime + 0.05;
  return CFG.RADIO[audio.station].name;
}

export function currentStation() {
  return CFG.RADIO[audio.station % CFG.RADIO.length].name;
}

// --- Lifecycle ---------------------------------------------------------------------
export function init(G) {
  G.audio = audio;
  // Unlock on the first gesture anywhere (click / key). Never on load.
  const unlockOnce = () => {
    if (unlock()) {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    }
  };
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('keydown', unlockOnce);
  return audio;
}

export function update(G, dt) {
  void dt;
  if (!audio.ctx || audio.muted) {
    if (audio.siren) stopSiren();
    return;
  }
  updateEngine(G);
  const wanted = (G.police && G.police.wanted) || 0;
  if (wanted >= 1 && G.state === 'playing') startSiren();
  else stopSiren();
  // Radio only while driving and the game is running.
  const driving = !!(G.player && G.player.vehicle);
  if (driving && G.state === 'playing') scheduleRadioStep(G);
}

export default audio;
