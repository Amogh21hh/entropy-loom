// Exact integer linear algebra and polynomial tools.
// Polynomials are BigInt coefficient arrays, highest degree first: [1n, -3n, 1n] = x^2 - 3x + 1.

export function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)));
}

export function matMul(A, B) {
  const n = A.length, m = B[0].length, k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0n));
  for (let i = 0; i < n; i++)
    for (let t = 0; t < k; t++) {
      const v = A[i][t];
      if (v === 0n) continue;
      for (let j = 0; j < m; j++) C[i][j] += v * B[t][j];
    }
  return C;
}

export function matVec(A, v) {
  return A.map((row) => row.reduce((s, x, j) => s + x * v[j], 0n));
}

/**
 * Characteristic polynomial det(xI - A) by Faddeev–LeVerrier. For integer
 * A every division is exact, so the result is exact.
 */
export function charPoly(A) {
  const n = A.length;
  const c = new Array(n + 1).fill(0n);
  c[0] = 1n;
  let M = identity(n).map((r) => r.map(() => 0n));
  for (let k = 1; k <= n; k++) {
    // M_k = A M_{k-1} + c_{k-1} I
    const AM = matMul(A, M);
    for (let i = 0; i < n; i++) AM[i][i] += c[k - 1];
    M = AM;
    const AMk = matMul(A, M);
    let tr = 0n;
    for (let i = 0; i < n; i++) tr += AMk[i][i];
    if (tr % BigInt(k) !== 0n) throw new Error('Faddeev–LeVerrier: inexact division (non-integer matrix?)');
    c[k] = -tr / BigInt(k);
  }
  return c;
}

export function polyEval(p, x) {
  let r = 0;
  for (const c of p) r = r * x + Number(c);
  return r;
}

export function polyDeriv(p) {
  const d = p.length - 1;
  return p.slice(0, -1).map((c, k) => c * BigInt(d - k));
}

/** Exact division p / q; returns { q, r } (requires q monic or exact). */
export function polyDiv(p, d) {
  const out = [];
  const r = p.slice();
  const lead = d[0];
  for (let k = 0; k <= r.length - d.length; k++) {
    const coef = r[k];
    if (coef % lead !== 0n) return { q: null, r: null };
    const f = coef / lead;
    out.push(f);
    for (let j = 0; j < d.length; j++) r[k + j] -= f * d[j];
  }
  const rem = r.slice(r.length - d.length + 1);
  return { q: out, r: rem };
}

export function isZeroPoly(p) {
  return !p || p.every((c) => c === 0n);
}

/** Cyclotomic polynomial Φ_m (exact, by recursive division). */
const cycCache = new Map();
export function cyclotomic(m) {
  if (cycCache.has(m)) return cycCache.get(m);
  // x^m - 1
  let p = [1n, ...new Array(m - 1).fill(0n), -1n];
  for (let d = 1; d < m; d++) if (m % d === 0) p = polyDiv(p, cyclotomic(d)).q;
  cycCache.set(m, p);
  return p;
}

/**
 * Strip factors x, and all cyclotomic factors Φ_m (m <= 60). What remains
 * carries the non-root-of-unity spectrum: for pseudo-Anosov stirring it is
 * (a power of) the minimal polynomial of the dilatation λ, up to reciprocal pairs.
 */
export function stripCyclotomic(p) {
  let q = p.slice();
  while (q.length > 1 && q[q.length - 1] === 0n) q = q.slice(0, -1);
  const removed = [];
  for (let m = 1; m <= 60; m++) {
    const c = cyclotomic(m);
    if (c.length > q.length) continue;
    for (;;) {
      const { q: qq, r } = polyDiv(q, c);
      if (qq && isZeroPoly(r)) { q = qq; removed.push(m); } else break;
      if (q.length < c.length) break;
    }
  }
  if (q[0] < 0n) q = q.map((x) => -x);
  return { core: q, removed };
}

/** All complex roots by the Aberth–Ehrlich method. Returns [[re, im], ...]. */
export function roots(p) {
  let coeffs = p.map(Number);
  while (coeffs.length > 1 && coeffs[0] === 0) coeffs = coeffs.slice(1);
  const d = coeffs.length - 1;
  if (d < 1) return [];
  const a0 = coeffs[0];
  const c = coeffs.map((x) => x / a0);
  // Cauchy bound for initial circle.
  let R = 0;
  for (let k = 1; k <= d; k++) R = Math.max(R, Math.abs(c[k]));
  R = 1 + R;
  const zr = [], zi = [];
  for (let k = 0; k < d; k++) {
    const ang = (2 * Math.PI * k) / d + 0.4;
    zr.push(R * 0.5 * Math.cos(ang));
    zi.push(R * 0.5 * Math.sin(ang));
  }
  const evalC = (xr, xi) => {
    let pr = 1, pi = 0, dr = 0, di = 0;
    for (let k = 1; k <= d; k++) {
      // derivative first: d = d*z + p
      const ndr = dr * xr - di * xi + pr, ndi = dr * xi + di * xr + pi;
      dr = ndr; di = ndi;
      const npr = pr * xr - pi * xi + c[k], npi = pr * xi + pi * xr;
      pr = npr; pi = npi;
    }
    return [pr, pi, dr, di];
  };
  for (let iter = 0; iter < 500; iter++) {
    let maxStep = 0;
    for (let k = 0; k < d; k++) {
      const [pr, pi, dr, di] = evalC(zr[k], zi[k]);
      const den = dr * dr + di * di;
      if (den === 0 && pr === 0 && pi === 0) continue;
      // ratio = p/p'
      let rr, ri;
      if (den === 0) { rr = 1e-3; ri = 1e-3; }
      else { rr = (pr * dr + pi * di) / den; ri = (pi * dr - pr * di) / den; }
      // sum 1/(z_k - z_j)
      let sr = 0, si = 0;
      for (let j = 0; j < d; j++) {
        if (j === k) continue;
        const ur = zr[k] - zr[j], ui = zi[k] - zi[j];
        const uu = ur * ur + ui * ui || 1e-300;
        sr += ur / uu; si += -ui / uu;
      }
      // w = ratio / (1 - ratio * s)
      const tr = 1 - (rr * sr - ri * si), ti = -(rr * si + ri * sr);
      const tt = tr * tr + ti * ti || 1e-300;
      const wr = (rr * tr + ri * ti) / tt, wi = (ri * tr - rr * ti) / tt;
      zr[k] -= wr; zi[k] -= wi;
      maxStep = Math.max(maxStep, Math.hypot(wr, wi) / (1 + Math.hypot(zr[k], zi[k])));
    }
    if (maxStep < 1e-15) break;
  }
  return zr.map((r, k) => [r, zi[k]]);
}

export function spectralRadius(p) {
  const rs = roots(p);
  return rs.reduce((m, [r, i]) => Math.max(m, Math.hypot(r, i)), 0);
}

/** Polish a real root with Newton iterations on the exact polynomial. */
export function newtonRealRoot(p, x0) {
  const dp = polyDeriv(p);
  let x = x0;
  for (let k = 0; k < 60; k++) {
    const f = polyEval(p, x), f1 = polyEval(dp, x);
    if (f1 === 0) break;
    const nx = x - f / f1;
    if (!Number.isFinite(nx)) break;
    if (Math.abs(nx - x) < 1e-16 * Math.max(1, Math.abs(x))) { x = nx; break; }
    x = nx;
  }
  return x;
}

export function formatPoly(p, v = 'x') {
  const d = p.length - 1;
  const sup = (k) => String(k).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
  let s = '';
  p.forEach((c, k) => {
    if (c === 0n) return;
    const e = d - k;
    const ac = c < 0n ? -c : c;
    const sign = c < 0n ? ' − ' : s ? ' + ' : '';
    const coef = ac === 1n && e > 0 ? '' : ac.toString();
    const mon = e === 0 ? '' : e === 1 ? v : v + sup(e);
    s += sign + coef + mon;
  });
  return s || '0';
}
