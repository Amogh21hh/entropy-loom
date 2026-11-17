// Entropy of a stirring protocol, three independent ways:
//   1. growth ratio of exact minimal intersection numbers under iteration,
//   2. exact piecewise-linear Jacobian on the attracting cone → integer
//      characteristic polynomial → λ as an algebraic number,
//   3. Burau(t = -1) spectral radius as a rigorous lower bound
//      (and for n = 3, the exact SL(2,Z) classification).
import * as D from './dynnikov.js';
import { charPoly, stripCyclotomic, roots, newtonRealRoot, matVec, polyDiv, isZeroPoly } from './poly.js';
import { burauBound, classify3 } from './burau.js';
import { permutation, cycleType } from './braid.js';

/** Generic filling lamination: E perturbed so it is not invariant under simple reducible braids. */
export function probeLamination(n, seed = 0) {
  const PR = [7, -3, 11, -13, 5, 17, -19, 23, -29, 31, 37, -41, 43, -47];
  const a = [], b = [];
  for (let k = 0; k < n - 2; k++) {
    a.push(BigInt(PR[(k + seed) % PR.length] * (seed + 1)));
    b.push(BigInt(PR[(k + 5 + 2 * seed) % PR.length] * (seed + 2)));
  }
  return D.lamination(n, a, b);
}

function ratioSeries(word, n, L0, maxIter, maxBits) {
  let L = D.clone(L0);
  let prev = D.intersectionNorm(L);
  const series = [D.bigLog(prev)];
  const ratios = [];
  for (let k = 0; k < maxIter; k++) {
    for (const g of word) D.applyGenInPlace(L, g);
    const cur = D.intersectionNorm(L);
    ratios.push(D.bigRatio(cur, prev));
    series.push(D.bigLog(cur));
    prev = cur;
    if (cur.toString(16).length * 4 > maxBits) break;
    const m = ratios.length;
    if (m > 8 && Math.abs(ratios[m - 1] - ratios[m - 2]) < 1e-14 && Math.abs(ratios[m - 2] - ratios[m - 3]) < 1e-14) break;
  }
  return { L, ratios, series };
}

/** Exact Jacobian of the PL map at v (columns β(v+e_j) − β(v)); verified linear and homogeneous. */
export function jacobianAt(word, n, L) {
  const v = D.toVector(L);
  const base = D.toVector(D.act(L, word));
  const m = v.length;
  const J = Array.from({ length: m }, () => new Array(m).fill(0n));
  let linear = true;
  for (let j = 0; j < m; j++) {
    const v1 = v.slice(); v1[j] += 1n;
    const v2 = v.slice(); v2[j] += 2n;
    const im1 = D.toVector(D.act(D.fromVector(n, v1), word));
    const im2 = D.toVector(D.act(D.fromVector(n, v2), word));
    for (let i = 0; i < m; i++) {
      J[i][j] = im1[i] - base[i];
      if (im2[i] - base[i] !== 2n * J[i][j]) linear = false;
    }
  }
  // PL maps here are positively homogeneous: on a linear cone, β(v) = J v exactly.
  const Jv = matVec(J, v);
  const homogeneous = Jv.every((x, i) => x === base[i]);
  return { J, linear: linear && homogeneous };
}

export function analyze(word, n, opts = {}) {
  const maxIter = opts.maxIter ?? 400;
  const maxBits = opts.maxBits ?? 6000;
  const res = {
    n, word: word.slice(), perm: permutation(word, n), lambdaRatio: 1, lambda: 1, entropy: 0,
    poly: null, corePoly: null, exact: false, burau: 1, sl2: null, type: 'identity', trivial: false,
    converged: false, series: [],
  };
  res.cycles = cycleType(res.perm);
  if (!word.length) { res.trivial = true; return res; }
  res.trivial = D.isIdentityBraid(word, n);
  res.burau = burauBound(word, n);
  if (n === 3) res.sl2 = classify3(word);
  if (res.trivial) { res.type = 'trivial'; return res; }

  const probes = [D.standard(n), probeLamination(n, 0), probeLamination(n, 1), probeLamination(n, 2)];
  let best = null;
  const runs = [];
  for (const P of probes) {
    const s = ratioSeries(word, n, P, maxIter, maxBits);
    const last = s.ratios[s.ratios.length - 1] ?? 1;
    runs.push({ ...s, last });
    if (!best || last > best.last) best = runs[runs.length - 1];
  }
  // The displayed growth curve always follows the standard lamination E.
  const eRun = runs[0];
  res.series = eRun.series;
  const rs = best.ratios;
  res.lambdaRatio = best.last;
  res.converged = rs.length > 3 && Math.abs(rs[rs.length - 1] - rs[rs.length - 2]) < 1e-9;

  const periodic = isPeriodicPower(word, n);
  if (periodic) {
    res.type = 'periodic';
    res.lambda = 1;
  } else if (res.lambdaRatio > 1 + 1e-6) {
    let J = null, linear = false;
    for (const r of [best, ...runs]) {
      if (Math.abs(r.last - best.last) > 1e-9 * best.last) continue;
      const jac = jacobianAt(word, n, r.L);
      J = jac.J; linear = jac.linear;
      if (linear) break;
    }
    if (linear) {
      const cp = charPoly(J);
      const { core } = stripCyclotomic(cp);
      res.poly = cp;
      const target = core.length > 1 ? core : null;
      // Choose the real root closest to the measured growth ratio and polish it.
      const cand = target ? roots(target)
        .filter(([, im]) => Math.abs(im) < 1e-7)
        .map(([re]) => re)
        .sort((x, y) => Math.abs(x - res.lambdaRatio) - Math.abs(y - res.lambdaRatio)) : [];
      if (cand.length && Math.abs(cand[0] - res.lambdaRatio) < 1e-6 * res.lambdaRatio && cand[0] > 1 + 1e-9) {
        res.lambda = newtonRealRoot(target, cand[0]);
        res.corePoly = minimalFactorFor(target, res.lambda);
        res.exact = true;
      }
    }
    if (res.exact) res.type = 'chaotic';
    else if (res.converged && res.lambdaRatio > 1.001) { res.type = 'chaotic'; res.lambda = res.lambdaRatio; }
    else { res.type = 'reducible'; res.lambda = 1; }
  } else {
    res.type = 'reducible';
    res.lambda = 1;
  }
  res.entropy = Math.log(res.lambda);
  if (n === 3 && res.sl2) {
    // Exact override for 3 rods.
    if (res.sl2.type === 'pseudo-Anosov') { res.lambda = res.sl2.lambda; res.entropy = Math.log(res.lambda); res.corePoly = res.sl2.poly; res.exact = true; }
    res.type = res.sl2.type === 'reducible' && res.type === 'periodic' ? 'periodic' : res.sl2.type;
  }
  return res;
}

/**
 * Reduce a (palindromic-ish) core polynomial to an irreducible-looking
 * factor containing λ by trying small integer quadratic/linear factors. If no
 * smaller factor contains λ the core is returned.
 */
function minimalFactorFor(core, lambda) {
  // Linear factor x - λ (λ an integer), then quadratics x² - t x + s, s = ±1,
  // accepted only if they divide the core exactly.
  const cands = [];
  if (Math.abs(lambda - Math.round(lambda)) < 1e-9) cands.push([1n, BigInt(-Math.round(lambda))]);
  for (const s of [1, -1]) {
    const t = lambda + s / lambda;
    // λ + s/λ = t  ⇔  λ² − tλ + s = 0
    if (Math.abs(t - Math.round(t)) < 1e-9) cands.push([1n, BigInt(-Math.round(t)), BigInt(s)]);
  }
  for (const f of cands) {
    const { q, r } = polyDiv(core, f);
    if (q && isZeroPoly(r)) return f;
  }
  return core;
}

/** β is periodic iff some power β^k (k <= 2n(n-1)) equals a power of Δ² (central). */
function isPeriodicPower(word, n) {
  const E = D.standard(n);
  // Δ² acts trivially on laminations of the disk up to boundary twist; Dynnikov
  // coordinates see Δ² as the identity, so periodic ⇔ β^k·E = E for some k.
  let L = D.clone(E);
  for (let k = 1; k <= 2 * n * (n - 1) + 2; k++) {
    for (const g of word) D.applyGenInPlace(L, g);
    if (D.equal(L, E)) return true;
  }
  return false;
}
