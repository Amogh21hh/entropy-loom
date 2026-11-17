// Invariant 7: entropy computed three independent ways must agree / sandwich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, jacobianAt } from '../web/core/entropy.js';
import { burauBound, classify3 } from '../web/core/burau.js';
import { PRESETS, garsideDelta } from '../web/core/braid.js';
import * as D from '../web/core/dynnikov.js';
import { mulberry32, randomWord, randInt } from '../web/core/rng.js';
import { polyEval } from '../web/core/poly.js';

const PHI2 = (3 + Math.sqrt(5)) / 2;

test('golden taffy puller σ₁σ₂⁻¹: λ = φ², minimal polynomial x² − 3x + 1', () => {
  const a = analyze([1, -2], 3);
  assert.equal(a.type, 'pseudo-Anosov');
  assert.ok(Math.abs(a.lambda - PHI2) < 1e-12);
  assert.deepEqual(a.corePoly, [1n, -3n, 1n]);
  assert.ok(Math.abs(a.lambdaRatio - PHI2) < 1e-12, 'Dynnikov growth ratio agrees with SL(2,Z)');
});

test('silver mixer σ₁²σ₂⁻²: λ = 3 + 2√2', () => {
  const a = analyze([1, 1, -2, -2], 3);
  assert.ok(Math.abs(a.lambda - (3 + 2 * Math.SQRT2)) < 1e-12);
});

test('Ham–Song 4-braid σ₁σ₂σ₃⁻¹: λ is the largest root of x⁴ − 2x³ − 2x + 1', () => {
  const a = analyze([1, 2, -3], 4);
  assert.ok(a.exact);
  assert.deepEqual(a.corePoly, [1n, -2n, 0n, -2n, 1n]);
  assert.ok(Math.abs(polyEval(a.corePoly, a.lambda)) < 1e-10);
  assert.ok(Math.abs(a.lambda - 2.29663026288654) < 1e-12);
});

test('periodic and reducible protocols have zero entropy', () => {
  assert.equal(analyze([1, 2], 3).type, 'periodic');
  assert.equal(analyze([1, 2], 3).lambda, 1);
  for (let n = 3; n <= 7; n++) assert.equal(analyze(garsideDelta(n), n).type, 'periodic', `Δ periodic n=${n}`);
  const r = analyze([1, 1, 3, 3], 4);
  assert.equal(r.type, 'reducible');
  assert.equal(r.lambda, 1);
});

test('hidden identity preset is recognised as trivial', () => {
  const p = PRESETS.find((q) => q.id === 'identity');
  assert.equal(analyze(p.word, p.n).type, 'trivial');
});

test('3-braids: Dynnikov growth ratio equals the exact SL(2,Z) dilatation', () => {
  const rng = mulberry32(31);
  let pA = 0;
  for (let t = 0; t < 250; t++) {
    const w = randomWord(rng, 3, randInt(rng, 1, 8));
    const c = classify3(w);
    const a = analyze(w, 3);
    if (c.type === 'pseudo-Anosov') {
      pA++;
      assert.ok(Math.abs(a.lambdaRatio - c.lambda) < 1e-8 * c.lambda, `${w}: ${a.lambdaRatio} vs ${c.lambda}`);
    } else {
      assert.ok(a.lambda === 1, `${w} non-pA must not stretch exponentially`);
    }
  }
  assert.ok(pA > 50);
});

test('entropy sandwich: Burau(t = −1) spectral radius ≤ λ (n = 3..7, random protocols)', () => {
  const rng = mulberry32(47);
  for (let t = 0; t < 160; t++) {
    const n = randInt(rng, 3, 7);
    const w = randomWord(rng, n, randInt(rng, 2, 9));
    const a = analyze(w, n);
    assert.ok(a.burau <= a.lambda * (1 + 1e-7) + 1e-9, `${w} n=${n}: burau ${a.burau} > λ ${a.lambda}`);
  }
});

test('exact Jacobian on the attracting cone is linear, homogeneous, and its root equals the growth ratio', () => {
  for (const [w, n] of [[[1, 2, -3], 4], [[1, 2, 3, -4], 5], [[1, -2, 3, -4, 5], 6]]) {
    const a = analyze(w, n);
    assert.ok(a.exact, `exact for ${w}`);
    assert.ok(Math.abs(a.lambda - a.lambdaRatio) < 1e-9 * a.lambda);
  }
});

test('entropy is a conjugacy invariant and invariant under inversion', () => {
  const rng = mulberry32(59);
  for (let t = 0; t < 40; t++) {
    const n = randInt(rng, 3, 6);
    const w = randomWord(rng, n, randInt(rng, 2, 6));
    const u = randomWord(rng, n, randInt(rng, 1, 4));
    const conj = [...u, ...w, ...u.slice().reverse().map((g) => -g)];
    const inv = w.slice().reverse().map((g) => -g);
    const a = analyze(w, n), b = analyze(conj, n), c = analyze(inv, n);
    assert.ok(Math.abs(a.lambda - b.lambda) < 1e-7 * a.lambda, `conj ${w} / ${u}`);
    assert.ok(Math.abs(a.lambda - c.lambda) < 1e-7 * a.lambda, `inverse ${w}`);
  }
});

test('Burau bound is exact for 3-braids', () => {
  assert.ok(Math.abs(burauBound([1, -2], 3) - PHI2) < 1e-10);
});

test('jacobianAt detects non-linearity honestly', () => {
  // At E itself the orbit sits on cone boundaries; the routine must not claim linearity falsely.
  const { J, linear } = jacobianAt([1, -2], 3, D.act(D.standard(3), [1, -2, 1, -2, 1, -2, 1, -2]));
  if (linear) {
    const v = D.toVector(D.act(D.standard(3), [1, -2, 1, -2, 1, -2, 1, -2]));
    const img = D.toVector(D.act(D.fromVector(3, v), [1, -2]));
    J.forEach((row, i) => assert.equal(row.reduce((s, x, j) => s + x * v[j], 0n), img[i]));
  }
});

test('reducible characteristic polynomials are cut down to the factor carrying λ', () => {
  // Alternating 6-rod loom: core (x² − 5x + 1)(x² − 3x + 1); λ = (5 + √21)/2.
  const a = analyze([1, -2, 3, -4, 5], 6);
  assert.deepEqual(a.corePoly, [1n, -5n, 1n]);
  assert.ok(Math.abs(a.lambda - (5 + Math.sqrt(21)) / 2) < 1e-12);
});
