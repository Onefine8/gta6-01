// All sound is synthesized with WebAudio — no audio files, no network. A low
// bassline loop plays while driving, the engine hum follows the car's speed, the
// siren wails when the police are close, and short blips mark pickups and clicks.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let heliGain = null;
  let musicTimer = null;
  let muted = false;
  let beat = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Helicopter rotor: a looped noise buffer whose gain is the on/off switch.
      const rotorLen = ctx.sampleRate;
      const rotorBuffer = ctx.createBuffer(1, rotorLen, ctx.sampleRate);
      const rotorData = rotorBuffer.getChannelData(0);
      for (let i = 0; i < rotorLen; i += 1) {
        rotorData[i] = Math.sin((i / rotorLen) * Math.PI * 2 * 13) * 0.5 + (Math.random() * 2 - 1) * 0.2;
      }
      const rotorSrc = ctx.createBufferSource();
      rotorSrc.buffer = rotorBuffer;
      rotorSrc.loop = true;
      const rotorFilter = ctx.createBiquadFilter();
      rotorFilter.type = 'lowpass';
      rotorFilter.frequency.value = 300;
      heliGain = ctx.createGain();
      heliGain.gain.value = 0;
      rotorSrc.connect(rotorFilter);
      rotorFilter.connect(heliGain);
      heliGain.connect(master);
      rotorSrc.start();
    } catch {
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  // A simple four-on-the-floor bassline: A minor groove, 112 BPM.
  const BASS = [55, 0, 55, 65.41, 55, 0, 49, 55, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];
  // Second phrase, so the loop does not wear out: same groove, higher answer.
  const BASS2 = [55, 0, 65.41, 82.41, 65.41, 0, 55, 49, 55, 0, 82.41, 98, 82.41, 0, 73.42, 65.41];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const bar = Math.floor(beat / BASS.length) % 2 === 0 ? BASS : BASS2;
      const freq = bar[beat % bar.length];
      beat += 1;
      if (!freq) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 0.34);
    }, 134);
  }

  // A short burst of filtered noise: a horn is two tones, a skid is noise.
  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq || 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function arpeggio(notes, stepMs, type, vol) {
    if (!ensure() || muted) return;
    notes.forEach((freq, i) => {
      window.setTimeout(() => blip(freq, 0.22, type || 'triangle', vol || 0.14), i * stepMs);
    });
  }

  return {
    unlock() { ensure(); startMusic(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    click() { blip(660, 0.07, 'square', 0.08); },
    pickup() { blip(880, 0.12, 'sine', 0.14); blip(1320, 0.18, 'sine', 0.1); },
    crash() { blip(90, 0.25, 'sawtooth', 0.2); noiseBurst(0.2, 0.16, 500); },
    punch() { blip(180, 0.1, 'square', 0.14); },
    // Two-tone car horn (C), a rising jingle for a repair, a fanfare for a
    // finished mission and a low sting for getting busted or wasted.
    horn() { blip(440, 0.22, 'square', 0.09); blip(554, 0.22, 'square', 0.09); },
    skid() { noiseBurst(0.3, 0.1, 1400); },
    repair() { arpeggio([660, 880, 990], 90, 'sine', 0.12); },
    fanfare() { arpeggio([523, 659, 784, 1047], 110, 'triangle', 0.15); },
    sting() { arpeggio([392, 311, 262], 220, 'sawtooth', 0.12); },
    setHeli(on) {
      if (!ensure() || !heliGain) return;
      heliGain.gain.setTargetAtTime(on && !muted ? 0.05 : 0, ctx.currentTime, 0.2);
    },
    siren(on) {
      if (!ensure()) return;
      sirenGain.gain.value = on && !muted ? 0.045 : 0;
    },
    setEngine(speed, driving) {
      if (!ensure()) return;
      const target = driving ? 0.05 + Math.min(0.09, Math.abs(speed) / 6000) : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.22, ctx.currentTime, 0.1);
      if (sirenOsc && sirenGain.gain.value > 0) {
        sirenOsc.frequency.value = 700 + Math.sin(performance.now() / 280) * 260;
      }
    },
  };
}
