import { test } from 'node:test';
import assert from 'node:assert/strict';
import { charPoly, cyclotomic, stripCyclotomic, roots, spectralRadius, formatPoly, polyDiv } from '../web/core/poly.js';
import { parseWord, formatWord, permutation, freeReduce, inverseWord, exponentSum, garsideDelta, cycleType } from '../web/core/braid.js';

test('Faddeev–LeVerrier gives exact characteristic polynomials', () => {
  assert.deepEqual(charPoly([[2n, 1n], [1n, 1n]]), [1n, -3n, 1n]);
  assert.deepEqual(charPoly([[0n, 1n, 0n], [0n, 0n, 1n], [1n, 0n, 0n]]), [1n, 0n, 0n, -1n]);
  // Companion matrix of x^4 - 2x^3 - 2x + 1
  const C = [[2n, 0n, 2n, -1n], [1n, 0n, 0n, 0n], [0n, 1n, 0n, 0n], [0n, 0n, 1n, 0n]];
  assert.deepEqual(charPoly(C), [1n, -2n, 0n, -2n, 1n]);
});

test('cyclotomic polynomials and stripping', () => {
  assert.deepEqual(cyclotomic(1), [1n, -1n]);
  assert.deepEqual(cyclotomic(6), [1n, -1n, 1n]);
  assert.deepEqual(cyclotomic(12), [1n, 0n, -1n, 0n, 1n]);
  // (x^2 - 3x + 1)(x + 1)^2 (x^2 + x + 1)
  let p = [1n, -3n, 1n];
  const mul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0n); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return r; };
  p = mul(mul(mul(p, [1n, 1n]), [1n, 1n]), [1n, 1n, 1n]);
  assert.deepEqual(stripCyclotomic(p).core, [1n, -3n, 1n]);
  const { q, r } = polyDiv(p, [1n, 1n]);
  assert.ok(q && r.every((c) => c === 0n));
});

test('Aberth roots recover known roots', () => {
  const rs = roots([1n, -6n, 11n, -6n]).map(([re]) => re).sort((a, b) => a - b);
  [1, 2, 3].forEach((v, k) => assert.ok(Math.abs(rs[k] - v) < 1e-10));
  assert.ok(Math.abs(spectralRadius([1n, -3n, 1n]) - (3 + Math.sqrt(5)) / 2) < 1e-12);
  assert.equal(formatPoly([1n, -2n, 0n, -2n, 1n]), 'x⁴ − 2x³ − 2x + 1');
});

test('protocol parser accepts every notation and rejects nonsense', () => {
  assert.deepEqual(parseWord('1 -2', 3), [1, -2]);
  assert.deepEqual(parseWord('σ1 σ2⁻¹', 3), [1, -2]);
  assert.deepEqual(parseWord('σ₁σ₂⁻¹'.replace('σ₂', ' σ₂'), 3), [1, -2]);
  assert.deepEqual(parseWord('s1 s2^-1', 3), [1, -2]);
  assert.deepEqual(parseWord('aB', 3), [1, -2]);
  assert.deepEqual(parseWord('1,2,-3', 4), [1, 2, -3]);
  assert.throws(() => parseWord('1 5', 4), /needs/);
  assert.throws(() => parseWord('1 x2', 4));
  assert.equal(formatWord([1, -2]), 'σ₁ σ₂⁻¹');
});

test('permutations, free reduction, Garside element', () => {
  assert.deepEqual(permutation([1, -2], 3), [1, 2, 0]);
  assert.deepEqual(freeReduce([1, 2, -2, -1, 3]), [3]);
  assert.deepEqual(inverseWord([1, -2, 3]), [-3, 2, -1]);
  assert.equal(exponentSum([1, -2, 3]), 1);
  for (let n = 3; n <= 8; n++) {
    const d = garsideDelta(n);
    assert.equal(d.length, (n * (n - 1)) / 2);
    assert.deepEqual(permutation(d, n), Array.from({ length: n }, (_, k) => n - 1 - k));
  }
  assert.deepEqual(cycleType([1, 2, 0, 3]), [3, 1]);
});
