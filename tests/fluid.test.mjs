// Invariants 3–6, 8, 9: the geometric engine is incompressible, impenetrable,
// reversible, deterministic, and never beats the exact topological minimum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stirrer, twist, GEOM, SIGMA_SENSE } from '../web/core/fluid.js';
import * as D from '../web/core/dynnikov.js';
import { analyze } from '../web/core/entropy.js';
import { permutation, inverseWord } from '../web/core/braid.js';
import { mulberry32, randomWord, randInt } from '../web/core/rng.js';

test('twist map has Jacobian determinant 1 everywhere (incompressible)', () => {
  const rng = mulberry32(1);
  const e = 1e-6;
  for (let t = 0; t < 3000; t++) {
    const x = -1 + 3 * rng(), y = -1.6 + 3.2 * rng(), a = (rng() * 2 - 1) * Math.PI;
    const [ax, ay] = twist(x + e, y, 0.5, a), [bx, by] = twist(x - e, y, 0.5, a);
    const [cx, cy] = twist(x, y + e, 0.5, a), [dx, dy] = twist(x, y - e, 0.5, a);
    const J11 = (ax - bx) / (2 * e), J21 = (ay - by) / (2 * e), J12 = (cx - dx) / (2 * e), J22 = (cy - dy) / (2 * e);
    assert.ok(Math.abs(J11 * J22 - J12 * J21 - 1) < 1e-6, `det at (${x},${y})`);
  }
});

test('twist core moves the swapped rods rigidly and leaves the others fixed', () => {
  for (let n = 3; n <= 8; n++)
    for (let i = 1; i < n; i++) {
      const cx = i - 0.5;
      for (let q = 0; q < n; q++) {
        const [x, y] = twist(q, 0, cx, Math.PI);
        if (q === i - 1) assert.ok(Math.abs(x - i) < 1e-12 && Math.abs(y) < 1e-12);
        else if (q === i) assert.ok(Math.abs(x - (i - 1)) < 1e-12 && Math.abs(y) < 1e-12);
        else assert.ok(x === q && y === 0, `rod ${q} must not move under σ${i}`);
        // whole rod disk is inside the rigid core or outside the support
        const d = Math.abs(q - cx);
        assert.ok(d + GEOM.rodR <= GEOM.R1 || d - GEOM.rodR >= GEOM.R2);
      }
    }
});

test('initial dye realises the standard lamination E exactly', () => {
  for (let n = 3; n <= 8; n++) {
    const S = new Stirrer(n);
    const c = S.crossings();
    assert.ok(D.equal(D.fromCounts(n, c.nu, c.up, c.down), D.standard(n)));
  }
});

test(`orientation: σᵢ is ${SIGMA_SENSE > 0 ? 'counter-clockwise' : 'clockwise'} and geometric crossings never undercut Dynnikov minima`, () => {
  const rng = mulberry32(2);
  let tightCases = 0;
  for (let t = 0; t < 90; t++) {
    const n = randInt(rng, 3, 6);
    const S = new Stirrer(n);
    const w = randomWord(rng, n, randInt(rng, 1, 5));
    S.applyWord(w, 14);
    const L = D.act(D.standard(n), w);
    const nu = D.nu(L), mu = D.mu(L, nu);
    const c = S.crossings();
    let tight = true;
    nu.forEach((v, k) => { assert.ok(BigInt(c.nu[k]) >= v, `ν${k} ${w}`); if (BigInt(c.nu[k]) !== v) tight = false; });
    mu.up.forEach((v, k) => {
      assert.ok(BigInt(c.up[k]) >= v && BigInt(c.down[k]) >= mu.down[k], `μ${k} ${w}`);
      if (BigInt(c.up[k]) !== v || BigInt(c.down[k]) !== mu.down[k]) tight = false;
    });
    if (tight) tightCases++;
  }
  assert.ok(tightCases > 10, 'many short words leave the dye exactly in minimal position');
});

test('a ring inside the rigid core is exactly invariant under its own generator', () => {
  for (let n = 3; n <= 7; n++)
    for (const g of [1, -1]) {
      const S = new Stirrer(n, { seed: 'pair' });
      const before = S.crossings();
      S.applyMove(g, 20);
      assert.deepEqual(S.crossings(), before, `n=${n} g=${g}`);
      assert.ok(D.equal(D.act(D.fromCounts(n, before.nu, before.up, before.down), [g]), D.fromCounts(n, before.nu, before.up, before.down)));
    }
});

test('area of every dye loop is conserved; rods are never penetrated', () => {
  const rng = mulberry32(3);
  for (let t = 0; t < 12; t++) {
    const n = randInt(rng, 3, 6);
    const S = new Stirrer(n);
    S.applyWord(randomWord(rng, n, randInt(rng, 3, 9)), 16);
    S.areas().forEach((a, k) => assert.ok(Math.abs(a - S.initialAreas[k]) / Math.abs(S.initialAreas[k]) < 5e-3, `area drift loop ${k}`));
    assert.ok(S.minRodClearance() >= GEOM.rodR, 'dye entered a rod');
    assert.equal(S.projections, 0);
  }
});

test('rod identities follow the braid permutation', () => {
  const rng = mulberry32(4);
  for (let t = 0; t < 20; t++) {
    const n = randInt(rng, 3, 8);
    const w = randomWord(rng, n, randInt(rng, 1, 10));
    const S = new Stirrer(n);
    S.applyWord(w, 4);
    assert.deepEqual(S.rodId, permutation(w, n));
  }
});

test('time reversibility: β then β⁻¹ returns every seed point to within 1e-9', () => {
  const rng = mulberry32(5);
  for (let t = 0; t < 10; t++) {
    const n = randInt(rng, 3, 6);
    const w = randomWord(rng, n, randInt(rng, 2, 8));
    const S = new Stirrer(n);
    S.applyWord(w, 12);
    assert.ok(S.reversibilityError() > 1e-3 || w.length === 0, 'the stir actually moved the dye');
    S.applyWord(inverseWord(w), 12);
    assert.ok(S.reversibilityError() < 1e-9, `error ${S.reversibilityError()}`);
  }
});

test('determinism: identical histories give bit-identical states', () => {
  const w = [1, -2, 3, -2, 1, 2, -3];
  const a = new Stirrer(4), b = new Stirrer(4);
  a.applyWord(w, 17); b.applyWord(w, 17);
  assert.equal(a.hash(), b.hash());
  const c = new Stirrer(4);
  c.applyWord([...w.slice(0, -1), 3], 17);
  assert.notEqual(a.hash(), c.hash());
});

test('measured stretching rate dominates the proven rate log λ (Thurston–Nielsen lower bound)', () => {
  const S = new Stirrer(3);
  const lens = [S.length()];
  for (let k = 0; k < 5; k++) { S.applyWord([1, -2], 20); lens.push(S.length()); }
  const lambda = analyze([1, -2], 3).lambda;
  const rate = Math.log(lens[5] / lens[2]) / 3;
  assert.ok(rate >= Math.log(lambda) - 0.02, `rate ${rate} vs log λ ${Math.log(lambda)}`);
});

test('point budget saturates gracefully instead of exhausting memory', () => {
  const S = new Stirrer(3, { maxPoints: 20000 });
  for (let k = 0; k < 8; k++) S.applyWord([1, -2], 8);
  assert.ok(S.saturated);
  assert.ok(S.pointCount < 60000);
});
