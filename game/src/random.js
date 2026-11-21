// Meridian Heat — seeded random number generation.
// mulberry32: small, fast, deterministic. Same seed => same city, same
// traffic layout, same screenshot staging. Pure module, no browser globals.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string into a 32-bit seed (FNV-1a), so "?seed=meridian" works too.
export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const s = String(value ?? 'meridian');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Create the RNG bundle used everywhere in the game. G.rng is one of these.
export function createRng(seed) {
  const seedValue = hashSeed(seed);
  const next = mulberry32(seedValue);
  return {
    seed: seedValue,
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // Pick one element of an array.
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    // True with probability p (0..1).
    chance(p) {
      return next() < p;
    },
    // Shuffle a copy of an array (Fisher-Yates).
    shuffle(array) {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

export default { mulberry32, hashSeed, createRng };
