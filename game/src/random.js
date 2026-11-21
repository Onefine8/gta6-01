// Meridian Heat — seeded RNG (mulberry32) + small helpers.
// Every procedural system (city, traffic, peds, missions) draws from one
// seeded stream so a given seed always builds the same Port Meridian.

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

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /** Float in [0, 1). */
  float() { return this.next(); }

  /** Float in [min, max). */
  range(min, max) { return min + this.next() * (max - min); }

  /** Integer in [min, max] inclusive. */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  /** True with probability p (0..1). */
  chance(p) { return this.next() < p; }

  /** Random element of an array. */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** Random element, removed from the array. */
  take(arr) { return arr.splice(Math.floor(this.next() * arr.length), 1)[0]; }

  /** In-place Fisher-Yates shuffle; returns the array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Approximately normal value in [-1, 1] (sum of 3 uniforms). */
  gaussian() {
    return (this.next() + this.next() + this.next() - 1.5) / 1.5;
  }

  /** Random angle in radians. */
  angle() { return this.next() * Math.PI * 2; }

  /** Random unit vector in the XZ plane. */
  dir2() {
    const a = this.angle();
    return { x: Math.cos(a), z: Math.sin(a) };
  }
}

/** Create an RNG from a numeric or string seed. */
export function makeRng(seed) {
  if (typeof seed === 'string') {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    seed = h >>> 0;
  }
  return new RNG(seed);
}

export default RNG;
