// Exact topology of integral laminations on the n-punctured disk via
// Dynnikov coordinates. All arithmetic is BigInt max-plus: no rounding,
// no overflow, ever.
//
// A lamination is { n, a: BigInt[n-2], b: BigInt[n-2] }.
// Punctures are 0-indexed q = 0..n-1 sitting on the real axis at x = q.
// Gap g = 0..n-2 is the vertical line x = g + 1/2 between punctures g, g+1.
// Interior puncture q = 1..n-2 owns coordinate index i = q-1.

const Z = 0n;
const pos = (x) => (x > Z ? x : Z);
const neg = (x) => (x < Z ? x : Z);
const abs = (x) => (x < Z ? -x : x);
const max = (x, y) => (x > y ? x : y);

export function lamination(n, a, b) {
  if (n < 3) throw new Error('Dynnikov coordinates need n >= 3');
  return { n, a: a.map(BigInt), b: b.map(BigInt) };
}

export function clone(L) {
  return { n: L.n, a: L.a.slice(), b: L.b.slice() };
}

export function equal(L, M) {
  if (L.n !== M.n) return false;
  for (let k = 0; k < L.a.length; k++) if (L.a[k] !== M.a[k] || L.b[k] !== M.b[k]) return false;
  return true;
}

/** Dehornoy's standard lamination E = (0,1,0,1,...): nested loops {0,1} ⊂ {0,1,2} ⊂ ... */
export function standard(n) {
  return lamination(n, new Array(n - 2).fill(0), new Array(n - 2).fill(1));
}

/**
 * Positive generator sigma_i acting in place. Middle generators use
 * Dynnikov's max-plus rule (in Dehornoy's form); end generators are the
 * degenerations compatible with it (verified by the braid relations in
 * tests/dynnikov.test.mjs).
 */
function sigmaPos(a, b, n, i) {
  if (i === 1) {
    const a0 = a[0], b0 = b[0];
    a[0] = b0 - pos(pos(b0) - a0);
    b[0] = pos(b0) - a0;
  } else if (i === n - 1) {
    const k = n - 3, ak = a[k], bk = b[k];
    a[k] = bk - neg(neg(bk) - ak);
    b[k] = neg(bk) - ak;
  } else {
    const p = i - 2, q = i - 1;
    const ap = a[p], bp = b[p], aq = a[q], bq = b[q];
    const c = ap - neg(bp) - aq + pos(bq);
    a[p] = ap + pos(bp) + pos(pos(bq) - c);
    b[p] = bq - pos(c);
    a[q] = aq + neg(bq) + neg(neg(bp) + c);
    b[q] = bp + pos(c);
  }
}

/**
 * In-place action of one generator g (= +-i, 1 <= i <= n-1).
 * sigma_i^-1 = M sigma_i M where M is the mirror y -> -y, which acts on
 * coordinates by a -> -a (it swaps the arcs above and below each puncture).
 */
export function applyGenInPlace(L, g) {
  const { n, a, b } = L;
  const i = g < 0 ? -g : g;
  if (i < 1 || i > n - 1) throw new Error(`generator ${g} out of range for n=${n}`);
  if (g > 0) {
    sigmaPos(a, b, n, i);
  } else {
    const lo = Math.max(0, i - 2), hi = Math.min(n - 3, i - 1);
    for (let k = lo; k <= hi; k++) a[k] = -a[k];
    sigmaPos(a, b, n, i);
    for (let k = lo; k <= hi; k++) a[k] = -a[k];
  }
  return L;
}

/** Apply a word left-to-right (first letter first), returning a new lamination. */
export function act(L, word) {
  const M = clone(L);
  for (const g of word) applyGenInPlace(M, g);
  return M;
}

/**
 * Laminations only see the mapping class modulo the centre <Δ²> (a full
 * boundary twist moves no curve). Δ^{2k} has exponent sum k·n(n-1), so
 * β = 1 in B_n  ⇔  β·E = E  and  expsum(β) = 0.
 */
export function isCentralBraid(word, n) {
  return equal(act(standard(n), word), standard(n));
}

export function isIdentityBraid(word, n) {
  let e = 0;
  for (const g of word) e += g > 0 ? 1 : -1;
  return e === 0 && isCentralBraid(word, n);
}

/** Minimal intersection numbers nu_g with the gap lines g = 0..n-2. */
export function nu(L) {
  const { n, a, b } = L;
  let m = null;
  let pref = Z;
  for (let k = 0; k < n - 2; k++) {
    const v = abs(a[k]) + pos(b[k]) + pref;
    m = m === null ? v : max(m, v);
    pref += b[k];
  }
  const out = new Array(n - 1);
  let s = Z;
  for (let g = 0; g < n - 1; g++) {
    out[g] = 2n * m - 2n * s;
    if (g < n - 2) s += b[g];
  }
  return out;
}

/**
 * Minimal intersection with the vertical arcs above / below each interior
 * puncture q = 1..n-2. Returns { up: BigInt[n-2], down: BigInt[n-2] }.
 */
export function mu(L, nus = nu(L)) {
  const { n, a, b } = L;
  const up = new Array(n - 2), down = new Array(n - 2);
  for (let k = 0; k < n - 2; k++) {
    const base = (b[k] >= Z ? nus[k] : nus[k + 1]) / 2n;
    // Convention fixed by geometric cross-validation (tests/convention.test.mjs):
    // a_k > 0 means the lamination crosses the arc *below* puncture k+1 more often.
    up[k] = base - a[k];
    down[k] = base + a[k];
  }
  return { up, down };
}

/** Total minimal intersection number I(L) = sum(nu) + sum(mu). A norm: I > 0 unless L empty. */
export function intersectionNorm(L) {
  const ns = nu(L);
  const { up, down } = mu(L, ns);
  let s = Z;
  for (const v of ns) s += v;
  for (let k = 0; k < up.length; k++) s += up[k] + down[k];
  return s;
}

/** Coordinates from minimal crossing counts (inverse of nu/mu). */
export function fromCounts(n, nus, up, down) {
  const a = [], b = [];
  for (let k = 0; k < n - 2; k++) {
    a.push((BigInt(down[k]) - BigInt(up[k])) / 2n);
    b.push((BigInt(nus[k]) - BigInt(nus[k + 1])) / 2n);
  }
  return { n, a, b };
}

/**
 * Tightened train-track decomposition. For every puncture q returns the
 * strand groups of the minimal-position representative:
 *   L  loops arriving from the left gap and turning around q
 *   R  loops arriving from the right gap and turning around q
 *   up / down  strands passing above / below q
 */
export function trainTrack(L) {
  const n = L.n;
  const ns = nu(L);
  const { up, down } = mu(L, ns);
  const cells = [];
  for (let q = 0; q < n; q++) {
    const left = q > 0 ? ns[q - 1] : Z;
    const right = q < n - 1 ? ns[q] : Z;
    const Lq = pos((left - right) / 2n);
    const Rq = pos((right - left) / 2n);
    let tu, td;
    if (q === 0 || q === n - 1) { tu = Z; td = Z; }
    else { tu = up[q - 1] - Lq - Rq; td = down[q - 1] - Lq - Rq; }
    cells.push({ q, left, right, L: Lq, R: Rq, up: tu, down: td });
  }
  return { nu: ns, cells };
}

/** Sanity check that a coordinate vector is a genuine (nonnegative) lamination picture. */
export function isAdmissible(L) {
  const { cells } = trainTrack(L);
  for (const c of cells) {
    if (c.up < Z || c.down < Z) return false;
    if (c.up + c.down + 2n * c.L !== c.left) return false;
    if (c.up + c.down + 2n * c.R !== c.right) return false;
  }
  return true;
}

export function toVector(L) {
  return [...L.a, ...L.b];
}

export function fromVector(n, v) {
  const m = n - 2;
  return { n, a: v.slice(0, m), b: v.slice(m) };
}

/** Exact ratio x/y of two positive BigInts as a double. */
export function bigRatio(x, y) {
  if (y === Z) return Infinity;
  const SCALE = 10n ** 18n;
  // Keep the numerator in a sane range for Number conversion.
  const q = (x * SCALE) / y;
  return Number(q) / 1e18;
}

/** log of a positive BigInt as a double (handles thousands of digits). */
export function bigLog(x) {
  if (x <= Z) return -Infinity;
  const s = x.toString(16);
  const lead = s.slice(0, 13);
  return Math.log(parseInt(lead, 16)) + (s.length - lead.length) * Math.log(16);
}
