// Invariant 1 & 2: the max-plus engine is a genuine, faithful B_n action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../web/core/dynnikov.js';
import { mulberry32, randBig, randomWord, randInt } from '../web/core/rng.js';
import { garsideDelta, inverseWord, exponentSum } from '../web/core/braid.js';
import { isTrivialArtin } from '../web/core/freegroup.js';

const randomLam = (rng, n, digits) =>
  D.lamination(n, Array.from({ length: n - 2 }, () => randBig(rng, digits)), Array.from({ length: n - 2 }, () => randBig(rng, digits)));

test('inverse generators cancel on arbitrary integer vectors (incl. 10^120)', () => {
  const rng = mulberry32(101);
  for (let t = 0; t < 4000; t++) {
    const n = randInt(rng, 3, 9);
    const L = randomLam(rng, n, t % 10 === 0 ? 120 : 14);
    const i = randInt(rng, 1, n - 1);
    assert.ok(D.equal(D.act(L, [i, -i]), L), `σ${i}σ${i}⁻¹ n=${n}`);
    assert.ok(D.equal(D.act(L, [-i, i]), L), `σ${i}⁻¹σ${i} n=${n}`);
  }
});

test('braid relation σᵢσᵢ₊₁σᵢ = σᵢ₊₁σᵢσᵢ₊₁ holds for all signs and positions', () => {
  const rng = mulberry32(202);
  for (let t = 0; t < 4000; t++) {
    const n = randInt(rng, 3, 9);
    const L = randomLam(rng, n, 18);
    const i = randInt(rng, 1, n - 2);
    const s = rng() < 0.5 ? 1 : -1;
    const a = s * i, b = s * (i + 1);
    assert.ok(D.equal(D.act(L, [a, b, a]), D.act(L, [b, a, b])), `n=${n} i=${i} s=${s}`);
  }
});

test('far commutation σᵢσⱼ = σⱼσᵢ for |i−j| ≥ 2', () => {
  const rng = mulberry32(303);
  let checked = 0;
  for (let t = 0; t < 6000; t++) {
    const n = randInt(rng, 4, 9);
    const i = randInt(rng, 1, n - 1), j = randInt(rng, 1, n - 1);
    if (Math.abs(i - j) < 2) continue;
    const L = randomLam(rng, n, 18);
    const si = rng() < 0.5 ? i : -i, sj = rng() < 0.5 ? j : -j;
    assert.ok(D.equal(D.act(L, [si, sj]), D.act(L, [sj, si])));
    checked++;
  }
  assert.ok(checked > 2000);
});

test('Δ² (full twist) is central and invisible to laminations; word problem uses exponent sum', () => {
  const rng = mulberry32(404);
  for (let n = 3; n <= 9; n++) {
    const d = garsideDelta(n);
    const d2 = [...d, ...d];
    for (let t = 0; t < 40; t++) {
      const L = randomLam(rng, n, 25);
      assert.ok(D.equal(D.act(L, d2), L), `Δ² acts trivially n=${n}`);
    }
    assert.ok(D.isCentralBraid(d2, n));
    assert.equal(D.isIdentityBraid(d2, n), false, 'Δ² is not the identity');
    // Δ σᵢ Δ⁻¹ = σ_{n-i}
    for (let i = 1; i < n; i++) {
      const L = randomLam(rng, n, 10);
      assert.ok(D.equal(D.act(L, [...d, i, ...inverseWord(d)]), D.act(L, [n - i])), `Δσ${i}Δ⁻¹ = σ${n - i}`);
    }
  }
});

test('word problem agrees with Artin’s free-group action (independent oracle)', () => {
  const rng = mulberry32(505);
  let trivial = 0;
  for (let t = 0; t < 600; t++) {
    const n = randInt(rng, 3, 6);
    let w;
    if (t % 2 === 0) {
      // Build a trivial braid by inserting relators into u·u⁻¹.
      const u = randomWord(rng, n, randInt(rng, 1, 6));
      const i = randInt(rng, 1, n - 2 || 1);
      const rel = n >= 3 && i < n - 1 ? [i, i + 1, i, -(i + 1), -i, -(i + 1)] : [];
      w = [...u, ...rel, ...inverseWord(u)];
    } else {
      w = randomWord(rng, n, randInt(rng, 1, 7));
    }
    const dyn = D.isIdentityBraid(w, n);
    const art = isTrivialArtin(w, n);
    assert.equal(dyn, art, `disagreement on ${w} n=${n}`);
    if (dyn) trivial++;
  }
  assert.ok(trivial >= 300, 'constructed trivial braids recognised');
});

test('nontrivial braids move E (faithfulness modulo centre)', () => {
  const rng = mulberry32(606);
  for (let t = 0; t < 500; t++) {
    const n = randInt(rng, 3, 7);
    const w = randomWord(rng, n, randInt(rng, 1, 9));
    if (exponentSum(w) % (n * (n - 1)) !== 0) assert.equal(D.isIdentityBraid(w, n), false);
  }
});

test('every orbit point of E is an admissible lamination; ν/μ ↔ coordinates round-trip', () => {
  const rng = mulberry32(707);
  for (let t = 0; t < 400; t++) {
    const n = randInt(rng, 3, 8);
    const L = D.act(D.standard(n), randomWord(rng, n, randInt(rng, 0, 40)));
    assert.ok(D.isAdmissible(L));
    const nu = D.nu(L);
    const { up, down } = D.mu(L, nu);
    for (const v of [...nu, ...up, ...down]) assert.ok(v >= 0n);
    assert.ok(D.equal(D.fromCounts(n, nu, up, down), L));
    assert.ok(D.intersectionNorm(L) > 0n);
  }
});

test('standard lamination E has the nested-loop crossing pattern', () => {
  for (let n = 3; n <= 9; n++) {
    const nu = D.nu(D.standard(n));
    nu.forEach((v, g) => assert.equal(v, BigInt(2 * (n - 2 - g))));
  }
});

test('exactness at scale: 3000-letter words and their inverses return E bit-for-bit', () => {
  const rng = mulberry32(808);
  for (const n of [3, 5, 8]) {
    const w = randomWord(rng, n, 3000);
    const L = D.act(D.standard(n), w);
    assert.ok(D.intersectionNorm(L).toString().length > 20, 'coordinates really grew');
    assert.ok(D.equal(D.act(L, inverseWord(w)), D.standard(n)));
  }
});

test('bigLog and bigRatio are accurate for huge values', () => {
  const x = 10n ** 400n * 7n;
  assert.ok(Math.abs(D.bigLog(x) - (400 * Math.log(10) + Math.log(7))) < 1e-9);
  assert.ok(Math.abs(D.bigRatio(x * 3n, x) - 3) < 1e-15);
});
