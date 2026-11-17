// Soak test: hundreds of stir/reseed cycles across every rod count, with
// invariants checked each cycle and the heap sampled after forced GC.
// Fails (exit 1) on any invariant violation or on monotone heap growth.
//   node --expose-gc scripts/soak.mjs
import { Stirrer, GEOM } from '../web/core/fluid.js';
import * as D from '../web/core/dynnikov.js';
import { analyze } from '../web/core/entropy.js';
import { permutation, inverseWord } from '../web/core/braid.js';
import { mulberry32, randomWord, randInt } from '../web/core/rng.js';

const gc = globalThis.gc ?? (() => {});
const rng = mulberry32(2026);
const heap = [];
let checks = 0;
const fail = (msg) => { console.error('SOAK FAILURE:', msg); process.exit(1); };
const t0 = Date.now();

for (let cycle = 0; cycle < 240; cycle++) {
  const n = 3 + (cycle % 6);
  const S = new Stirrer(n, { maxPoints: 60000 });
  const w = randomWord(rng, n, randInt(rng, 2, 10));
  S.applyWord(w, 10);
  const L = D.act(D.standard(n), w);
  const nu = D.nu(L), c = S.crossings();
  if (!S.saturated) {
    nu.forEach((v, k) => { if (BigInt(c.nu[k]) < v) fail(`crossing undercut n=${n} w=${w}`); });
    if (S.minRodClearance() < GEOM.rodR) fail(`rod penetrated n=${n} w=${w}`);
  }
  const satBefore = S.saturated;
  S.applyWord(inverseWord(w), 10);
  if (!satBefore && !S.saturated && S.reversibilityError() > 1e-9) fail(`irreversible n=${n} w=${w}`);
  if (permutation([...w, ...inverseWord(w)], n).some((v, k) => v !== S.rodId[k])) fail('permutation');
  const a = analyze(w, n);
  if (a.burau > a.lambda * (1 + 1e-7) + 1e-9) fail(`sandwich n=${n} w=${w}`);
  checks += 5;
  if (cycle % 20 === 19) {
    gc(); gc();
    heap.push(process.memoryUsage().heapUsed);
  }
}

const mb = heap.map((h) => (h / 1048576).toFixed(1));
console.log(`soak: 240 cycles, ${checks} invariant checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`heap after GC (MB): ${mb.join(' → ')}`);
if (globalThis.gc) {
  const first = heap[2], last = heap[heap.length - 1];
  if (last > first * 1.5 + 8 * 1048576) fail(`heap grew from ${(first / 1048576).toFixed(1)} MB to ${(last / 1048576).toFixed(1)} MB`);
  console.log('heap stable: no leak detected');
} else {
  console.log('(run with --expose-gc for the leak check)');
}
