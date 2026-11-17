// Deterministic, seedable PRNG (mulberry32) plus helpers used by the
// property-based tests and the scenario generator.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Random braid word on n strands: nonzero ints in [-(n-1), n-1]. */
export function randomWord(rng, n, len) {
  const w = [];
  for (let k = 0; k < len; k++) {
    const i = randInt(rng, 1, n - 1);
    w.push(rng() < 0.5 ? i : -i);
  }
  return w;
}

/** Random BigInt in [-mag, mag] with up to `digits` decimal digits. */
export function randBig(rng, digits) {
  let s = '';
  const d = randInt(rng, 1, digits);
  for (let k = 0; k < d; k++) s += String(randInt(rng, 0, 9));
  const v = BigInt(s);
  return rng() < 0.5 ? -v : v;
}
