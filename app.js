// Entropy Loom — controller: couples the geometric stirrer, the exact
// Dynnikov engine, the renderers and the synthesiser.
import { Stirrer, GEOM } from './core/fluid.js';
import * as D from './core/dynnikov.js';
import { analyze } from './core/entropy.js';
import { PRESETS, parseWord, formatGen, formatWord, exponentSum, permutation, inverseWord, garsideDelta } from './core/braid.js';
import { formatPoly } from './core/poly.js';
import { LoomAudio } from './audio.js';
import { fitCanvas, makeView, drawFluid, drawBraid, drawChart, drawBars, fmtBig } from './render.js';

const $ = (id) => document.getElementById(id);
const MAX_POINTS = 240000;

const ui = {
  fluid: $('fluid'), braid: $('braid'), chart: $('chart'), bars: $('bars'),
  rodSeg: $('rodSeg'), preset: $('preset'), presetNote: $('presetNote'), protocol: $('protocol'), protocolErr: $('protocolErr'),
  play: $('btnPlay'), step: $('btnStep'), undo: $('btnUndo'), reverse: $('btnReverse'), reset: $('btnReset'),
  speed: $('speed'), speedOut: $('speedOut'), seed: $('seed'), ghost: $('ghost'), glow: $('glow'),
  sound: $('btnSound'), help: $('btnHelp'), dialog: $('help'), hear: $('btnHear'),
};

const audio = new LoomAudio();
// Virtual clock offset: lets automated checks advance animation deterministically
// even when the page is backgrounded and requestAnimationFrame is throttled.
let clockOffset = 0;
const clock = () => performance.now() + clockOffset;

const st = {
  n: 3,
  S: null,
  L: null, // exact lamination β·E
  word: [], // freely reduced move history
  entries: [], // braid strip: { g, ids }
  queue: [],
  playing: false,
  protocol: [1, -2],
  analysis: null,
  t: 0,
  series: [],
  pred: null,
  L0: 1, I0: 1n, curveLen0: [], curveLen: [],
  hover: null,
  drag: null,
  anim: null, // { g, start, dur, swap }
  lastCross: null,
  inv: {},
  lastLenLog: 0, rate: 0,
  fps: 60, lastFrame: performance.now(),
  hintShown: true,
  revError: null,
};

// ───────────────────────── setup ─────────────────────────

function buildRodSeg() {
  ui.rodSeg.innerHTML = '';
  for (let n = 3; n <= 8; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === st.n));
    b.onclick = () => { if (n !== st.n) { st.n = n; trimProtocol(); resetAll(); } };
    ui.rodSeg.appendChild(b);
  }
}

function buildPresets() {
  ui.preset.innerHTML = '<option value="">— custom —</option>' +
    PRESETS.map((p) => `<option value="${p.id}">${p.name} · ${p.n} rods</option>`).join('');
  ui.preset.onchange = () => {
    const p = PRESETS.find((q) => q.id === ui.preset.value);
    if (!p) return;
    st.n = p.n;
    setProtocol(p.word.slice(), true);
    resetAll();
    ui.presetNote.textContent = p.note;
    startLoop();
  };
}

function trimProtocol() {
  const ok = st.protocol.every((g) => Math.abs(g) <= st.n - 1);
  if (!ok) setProtocol([1, -2], true);
}

function setProtocol(w, updateField) {
  st.protocol = w;
  if (updateField) ui.protocol.value = w.map((g) => String(g)).join(' ');
  ui.protocolErr.textContent = '';
  try { history.replaceState(null, '', `#n=${st.n}&p=${w.join(',')}`); } catch { /* sandboxed */ }
  runAnalysis();
}

function runAnalysis() {
  const w = st.protocol;
  st.analysis = w.length ? analyze(w, st.n) : null;
  renderEntropy();
}

function resetAll() {
  st.S = new Stirrer(st.n, { seed: ui.seed.value, maxPoints: MAX_POINTS });
  st.L = D.standard(st.n);
  st.word = [];
  st.entries = [];
  st.queue = [];
  st.anim = null;
  st.t = 0;
  st.L0 = st.S.length();
  st.curveLen0 = st.S.curveLengths();
  st.curveLen = st.curveLen0.slice();
  st.I0 = D.intersectionNorm(st.L);
  st.series = [{ t: 0, dye: 0, topo: 0 }];
  st.pred = null;
  st.lastLenLog = 0;
  st.revError = null;
  st.hashStr = st.S.hash();
  [...ui.rodSeg.children].forEach((b) => b.setAttribute('aria-checked', String(+b.textContent === st.n)));
  if (PRESETS.find((p) => p.id === ui.preset.value)?.n !== st.n) { ui.preset.value = ''; ui.presetNote.textContent = ''; }
  if (!st.analysis || st.analysis.n !== st.n) runAnalysis();
  checkInvariants();
  renderPanels();
}

// ───────────────────────── moves ─────────────────────────

function moveDuration() {
  const v = +ui.speed.value / 100;
  return 1500 * Math.pow(0.085, v);
}

function enqueue(gs) {
  for (const g of gs) if (Math.abs(g) >= 1 && Math.abs(g) <= st.n - 1) st.queue.push(g);
}

function beginNext(now) {
  const g = st.queue.shift();
  const i = Math.abs(g);
  st.entries.push({ g, ids: st.S.rodId.slice(), pending: true });
  st.S.beginMove(g);
  const dur = moveDuration();
  const pan = (q) => ((q - (st.n - 1) / 2) / Math.max(1, (st.n - 1) / 2)) * 0.8;
  const swap = audio.swapStart(st.S.rodId[i - 1], st.S.rodId[i], pan(i - 1), pan(i), g > 0, dur / 1000);
  st.anim = { g, start: now, dur, swap };
  if (st.hintShown) { st.hintShown = false; $('stageHint').style.opacity = '0'; }
}

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep

function stepAnimation(now) {
  if (!st.anim) {
    if (!st.queue.length && st.playing) refillLoop();
    if (st.queue.length) beginNext(now);
    return;
  }
  const a = st.anim;
  const p = Math.min(1, (now - a.start) / a.dur);
  if (p < 1) {
    st.S.setTheta(Math.PI * ease(p));
    const i = Math.abs(a.g);
    const pan = (x) => ((x - (st.n - 1) / 2) / Math.max(1, (st.n - 1) / 2)) * 0.8;
    audio.swapUpdate(a.swap, pan(st.S.rodX[i - 1]), pan(st.S.rodX[i]));
  } else {
    st.S.endMove();
    st.anim = null;
    onMoveEnd(a.g);
    if (st.queue.length) beginNext(now);
    else if (st.playing && refillLoop()) beginNext(now);
  }
}

function onMoveEnd(g) {
  D.applyGenInPlace(st.L, g);
  const last = st.entries[st.entries.length - 1];
  if (last) last.pending = false;
  const wasNonEmpty = st.word.length > 0;
  if (st.word.length && st.word[st.word.length - 1] === -g) st.word.pop();
  else st.word.push(g);
  st.t++;
  st.curveLen = st.S.curveLengths();
  const len = st.curveLen.reduce((s, x) => s + x, 0);
  const I = D.intersectionNorm(st.L);
  const dyeLog = Math.log10(len / st.L0);
  st.rate = Math.max(0, (dyeLog - st.lastLenLog) * Math.LN10);
  st.lastLenLog = dyeLog;
  st.series.push({ t: st.t, dye: dyeLog, topo: (D.bigLog(I) - D.bigLog(st.I0)) / Math.LN10 });
  if (st.series.length > 4000) st.series.splice(1, st.series.length - 4000);
  if (wasNonEmpty && st.word.length === 0) st.revError = st.S.reversibilityError();
  st.hashStr = st.S.hash();
  checkInvariants();
  renderPanels();
  audio.drone(st.rate, dyeLog);
}

/**
 * Queue another period of the protocol. A saturated dye (point budget hit)
 * auto-pauses the loop; explicit moves, undo and reverse stay available because
 * every point is still an exact image — only new resolution stops being added.
 */
function refillLoop() {
  if (st.S.saturated) { stopLoop(); return false; }
  enqueue(st.protocol);
  return true;
}

function startLoop() {
  if (!st.protocol.length) return;
  if (st.S.saturated) { st.S.seed(ui.seed.value); resetAll(); }
  st.playing = true;
  const last = st.series[st.series.length - 1];
  if (st.analysis && st.analysis.lambda > 1) {
    st.pred = { t0: last.t, y0: last.topo, slope: Math.log10(st.analysis.lambda) / st.protocol.length };
  } else st.pred = null;
  ui.play.textContent = '❚❚ pause';
}

function stopLoop() {
  st.playing = false;
  ui.play.textContent = '▶ loop';
}

function undo() {
  if (st.anim || st.queue.length) return;
  if (!st.word.length) return;
  enqueue([-st.word[st.word.length - 1]]);
}

function reverseAll() {
  if (!st.word.length) return;
  stopLoop();
  st.queue = [];
  enqueue(inverseWord(st.word));
}

// ───────────────────────── invariants ─────────────────────────

function checkInvariants() {
  const S = st.S, n = st.n;
  const inv = {};
  const sat = S.saturated;
  // 1. exact state = E·β recomputed from scratch (group action consistency)
  if (st.word.length <= 600) {
    const fresh = D.act(D.standard(n), st.word);
    inv.action = { ok: D.equal(fresh, st.L), val: `|β| = ${st.word.length}` };
  }
  // 2. incompressibility
  const A0 = S.initialAreas, A = S.areas();
  let drift = 0;
  A.forEach((a, k) => { drift = Math.max(drift, Math.abs(a - A0[k]) / Math.abs(A0[k])); });
  inv.area = { ok: drift < 5e-3, warn: sat, val: `drift ${drift.toExponential(1)}` };
  // 3. rods impenetrable
  const clr = S.minRodClearance();
  inv.rods = { ok: clr >= GEOM.rodR * (1 - 1e-9), warn: sat, val: `min gap ${(clr - GEOM.rodR).toFixed(3)}` };
  // 4. geometric ≥ minimal on every arc
  const c = S.crossings();
  const nu = D.nu(st.L), mu = D.mu(st.L, nu);
  let okX = true, tight = 0, arcs = 0;
  nu.forEach((v, k) => { arcs++; if (BigInt(c.nu[k]) < v) okX = false; if (BigInt(c.nu[k]) === v) tight++; });
  mu.up.forEach((v, k) => {
    arcs += 2;
    if (BigInt(c.up[k]) < v || BigInt(c.down[k]) < mu.down[k]) okX = false;
    if (BigInt(c.up[k]) === v) tight++;
    if (BigInt(c.down[k]) === mu.down[k]) tight++;
  });
  inv.cross = { ok: okX, warn: sat, val: `${tight}/${arcs} arcs tight` };
  st.lastCross = { geo: c.nu, topo: nu };
  // 5. permutation consistency
  const perm = permutation(st.word, n);
  inv.perm = { ok: perm.every((v, k) => v === S.rodId[k]), val: perm.map((v) => v + 1).join('') };
  // 6. entropy sandwich
  if (st.analysis && st.analysis.n === n) {
    const a = st.analysis;
    inv.sandwich = { ok: a.burau <= a.lambda * (1 + 1e-9), val: `${a.burau.toFixed(4)} ≤ ${a.lambda.toFixed(4)}` };
  }
  // 7. reversibility
  if (st.revError !== null) inv.rev = { ok: st.revError < 1e-9, val: `err ${st.revError.toExponential(1)}` };
  // 8. Dynnikov picture admissible (nonnegative train track)
  inv.adm = { ok: D.isAdmissible(st.L), val: 'train track ≥ 0' };
  st.inv = inv;
}

const INV_LABELS = [
  ['action', 'Exact action ≡ E·β from scratch'],
  ['adm', 'Lamination admissible'],
  ['area', 'Area preserved (det DT = 1)'],
  ['rods', 'Rods never penetrated'],
  ['cross', 'Geometric ≥ minimal crossings'],
  ['perm', 'Rods follow perm(β)'],
  ['sandwich', 'Burau(−1) ≤ λ'],
  ['rev', 'β·β⁻¹ returns every dye point'],
];

// ───────────────────────── panels ─────────────────────────

function renderPanels() {
  const w = st.word;
  const wv = $('wordView');
  if (!w.length) wv.innerHTML = '<span class="empty">e — the dye is untouched</span>';
  else {
    const shown = w.slice(-80);
    wv.innerHTML = (w.length > 80 ? `<span class="empty">… ${w.length - 80} more</span>` : '') +
      shown.map((g) => `<span class="g${g < 0 ? ' n' : ''}">${formatGen(g)}</span>`).join('');
    wv.scrollTop = wv.scrollHeight;
  }
  $('fLen').textContent = w.length;
  $('fExp').textContent = exponentSum(w);
  $('fPerm').textContent = permutation(w, st.n).map((v) => v + 1).join(' ');
  const I = D.intersectionNorm(st.L);
  $('fNorm').textContent = fmtBig(I);
  const badge = $('wordBadge');
  if (!w.length) { badge.textContent = 'e'; badge.className = 'badge'; }
  else if (D.isIdentityBraid(w, st.n)) { badge.textContent = 'trivial — proved'; badge.className = 'badge good'; }
  else if (D.isCentralBraid(w, st.n)) {
    const k = exponentSum(w) / (st.n * (st.n - 1));
    badge.textContent = `central: Δ^${2 * k}`; badge.className = 'badge cool';
  } else { badge.textContent = 'nontrivial'; badge.className = 'badge hot'; }

  const list = $('invList');
  list.innerHTML = INV_LABELS.filter(([k]) => st.inv[k]).map(([k, label]) => {
    const r = st.inv[k];
    const cls = r.ok ? 'ok' : r.warn ? 'wait' : 'fail';
    const sym = r.ok ? '✓' : r.warn ? '…' : '✗';
    return `<li><span class="${cls}">${sym}</span><span>${label}</span><span class="val">${r.ok || !r.warn ? r.val : 'saturated'}</span></li>`;
  }).join('');

  const S = st.S;
  $('dyeInfo').textContent = `${S.pointCount.toLocaleString()} points · ${S.curves.length} loop${S.curves.length > 1 ? 's' : ''} · ` +
    (S.saturated ? 'resolution saturated — press C to re-seed' : `refinement h = ${GEOM.h}`);
  const len = st.curveLen.reduce((s, x) => s + x, 0);
  $('heroLength').textContent = `×${fmtNum(len / st.L0)}`;
}

function fmtNum(x) {
  if (x < 1000) return x.toFixed(x < 10 ? 2 : 1);
  return x.toExponential(2).replace('e+', 'e');
}

function renderEntropy() {
  const a = st.analysis;
  const tb = $('typeBadge');
  if (!a) {
    $('eLambda').textContent = '—'; $('ePoly').textContent = '—'; $('eBurau').textContent = '—'; $('ePerMove').textContent = '—';
    tb.textContent = '—'; tb.className = 'badge'; $('eExplain').textContent = 'Type a protocol to analyse it.';
    $('heroLambda').textContent = '—'; $('heroEntropy').textContent = '—';
    return;
  }
  const lam = a.lambda;
  $('eLambda').textContent = lam > 1 ? `${lam.toFixed(12)}${a.exact ? '' : ' (numerical)'}` : '1 (no exponential stretching)';
  $('ePoly').textContent = a.corePoly ? `${formatPoly(a.corePoly)} = 0` : a.type === 'trivial' ? 'β = e' : '—';
  $('eBurau').textContent = a.burau.toFixed(6);
  $('ePerMove').textContent = (a.entropy / a.word.length).toFixed(5);
  $('heroLambda').textContent = lam > 1 ? lam.toFixed(6) : '1';
  $('heroEntropy').textContent = a.entropy.toFixed(6);
  const names = {
    'pseudo-Anosov': ['pseudo-Anosov', 'hot'], chaotic: ['chaotic · λ > 1', 'hot'], periodic: ['periodic', 'cool'],
    reducible: ['reducible', 'cool'], trivial: ['trivial', 'good'],
  };
  const [label, cls] = names[a.type] || [a.type, ''];
  tb.textContent = label; tb.className = 'badge ' + cls;
  const ex = {
    'pseudo-Anosov': 'Exact Thurston–Nielsen class (SL(2,ℤ) trace). Every loop of this protocol multiplies the length of every essential curve by λ.',
    chaotic: a.exact ? 'λ is read off as a root of the integer characteristic polynomial of the exact piecewise-linear Jacobian on the attracting cone.' : 'λ is estimated from the converged growth ratio of exact intersection numbers.',
    periodic: 'Some power of β is central, so the rods just dance. The dye never stretches exponentially.',
    reducible: 'Stretching is sub-exponential. An invariant curve system keeps the rods in separate whirlpools.',
    trivial: 'β is the identity braid. Stirring it looks like mixing, but the dye can be pulled tight back to its start.',
  };
  $('eExplain').textContent = ex[a.type] || '';
}

// ───────────────────────── input ─────────────────────────

function worldAt(ev) {
  const r = ui.fluid.getBoundingClientRect();
  const dpr = ui.fluid.width / r.width;
  const view = makeView(st.n, ui.fluid.width, ui.fluid.height);
  return view.inv((ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr);
}

function gapAt(x, y) {
  if (Math.abs(y) > 1.35 || x < -0.6 || x > st.n - 0.4) return null;
  const gap = Math.max(0, Math.min(st.n - 2, Math.floor(x)));
  return { gap, positive: y >= 0 };
}

function rodAt(x, y) {
  for (let q = 0; q < st.n; q++) if (Math.hypot(x - q, y) < 0.2) return q;
  return null;
}

ui.fluid.addEventListener('pointermove', (ev) => {
  const [x, y] = worldAt(ev);
  if (st.drag) {
    st.drag.maxY = Math.abs(y) > Math.abs(st.drag.maxY) ? y : st.drag.maxY;
    st.drag.x = x;
    st.hover = null;
    return;
  }
  st.hover = rodAt(x, y) === null ? gapAt(x, y) : null;
  ui.fluid.style.cursor = rodAt(x, y) !== null ? 'grab' : st.hover ? 'pointer' : 'crosshair';
});
ui.fluid.addEventListener('pointerleave', () => { st.hover = null; });
ui.fluid.addEventListener('pointerdown', (ev) => {
  audio.ensure();
  const [x, y] = worldAt(ev);
  const q = rodAt(x, y);
  if (q !== null && !st.anim) {
    st.drag = { q, x0: x, x, maxY: 0 };
    ui.fluid.setPointerCapture(ev.pointerId);
    return;
  }
  const g = gapAt(x, y);
  if (g) { stopLoop(); enqueue([g.positive ? g.gap + 1 : -(g.gap + 1)]); }
});
ui.fluid.addEventListener('pointerup', () => {
  const d = st.drag;
  st.drag = null;
  if (!d) return;
  const dx = d.x - d.x0;
  if (Math.abs(dx) < 0.35) return;
  const right = dx > 0;
  const nb = right ? d.q + 1 : d.q - 1;
  if (nb < 0 || nb >= st.n) return;
  const gen = Math.min(d.q, nb) + 1;
  // Moving right over the top is clockwise (σ⁻¹); moving left over the top is CCW (σ).
  const over = d.maxY >= 0;
  const positive = right ? !over : over;
  stopLoop();
  enqueue([positive ? gen : -gen]);
});

window.addEventListener('keydown', (ev) => {
  if (ev.target === ui.protocol || ev.target.tagName === 'SELECT') return;
  if (ui.dialog.open) return;
  const m = /^Digit([1-9])$/.exec(ev.code);
  if (m) {
    const i = +m[1];
    if (i <= st.n - 1) { stopLoop(); enqueue([ev.shiftKey ? -i : i]); ev.preventDefault(); }
    return;
  }
  switch (ev.key) {
    case ' ': ev.preventDefault(); st.playing ? stopLoop() : startLoop(); break;
    case 'Backspace': case 'z': case 'Z': ev.preventDefault(); undo(); break;
    case 'r': case 'R': reverseAll(); break;
    case 'g': case 'G': ui.ghost.checked = !ui.ghost.checked; break;
    case 'm': case 'M': toggleSound(); break;
    case 'c': case 'C': stopLoop(); resetAll(); break;
    case '?': ui.dialog.showModal(); break;
    default: break;
  }
});

ui.protocol.addEventListener('input', () => {
  try {
    const w = parseWord(ui.protocol.value, st.n);
    if (!w.length) throw new Error('Empty protocol');
    ui.preset.value = ''; ui.presetNote.textContent = '';
    setProtocol(w, false);
  } catch (e) {
    ui.protocolErr.textContent = e.message;
  }
});
ui.protocol.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ui.protocol.blur(); startLoop(); } });

ui.play.onclick = () => (st.playing ? stopLoop() : startLoop());
ui.step.onclick = () => { stopLoop(); enqueue(st.protocol); };
ui.undo.onclick = undo;
ui.reverse.onclick = reverseAll;
ui.reset.onclick = () => { stopLoop(); resetAll(); };
ui.seed.onchange = () => { stopLoop(); resetAll(); };
ui.speed.oninput = () => { ui.speedOut.textContent = `${Math.round(moveDuration())} ms`; };
ui.help.onclick = () => ui.dialog.showModal();
ui.hear.onclick = async () => {
  if (!audio.enabled) await toggleSound();
  audio.hearLambda(st.analysis ? st.analysis.lambda : 1);
};
ui.sound.onclick = () => toggleSound();
$('btnAdopt').onclick = () => {
  if (!st.word.length) return;
  ui.preset.value = ''; ui.presetNote.textContent = 'Your own braid, analysed as a periodic stirring protocol.';
  setProtocol(st.word.slice(), true);
};

async function toggleSound() {
  const on = !audio.enabled;
  const ok = await audio.setEnabled(on);
  if (!ok) { ui.sound.textContent = '♪ unavailable'; return; }
  ui.sound.setAttribute('aria-pressed', String(on));
  ui.sound.textContent = on ? '♪ sound on' : '♪ sound off';
}

// ───────────────────────── frame loop ─────────────────────────

function frame(rafNow) {
  const now = rafNow + clockOffset;
  const dt = now - st.lastFrame;
  st.lastFrame = now;
  st.fps = st.fps * 0.92 + (1000 / Math.max(1, dt)) * 0.08;
  try {
    stepAnimation(now);
    draw();
  } catch (e) {
    console.error(e);
    stopLoop();
  }
  requestAnimationFrame(frame);
}

function draw() {
  const f = fitCanvas(ui.fluid);
  const ctx = ui.fluid.getContext('2d');
  const view = makeView(st.n, f.w, f.h);
  // Curve lengths only drive dye brightness: refresh every few frames while moving.
  if (st.anim && (st.frameNo = (st.frameNo || 0) + 1) % 6 === 0) st.curveLen = st.S.curveLengths();
  drawFluid(ctx, f.w, f.h, view, st.S, {
    dpr: f.dpr, hover: st.hover, glow: ui.glow.checked, ghost: ui.ghost.checked && !st.anim,
    lamination: st.L, curveLen0: st.curveLen0, curveLen: st.curveLen,
  });
  const b = fitCanvas(ui.braid);
  const cur = st.anim ? { g: st.anim.g, ids: st.entries[st.entries.length - 1].ids, t: Math.min(1, (clock() - st.anim.start) / st.anim.dur) } : null;
  drawBraid(ui.braid.getContext('2d'), b.w, b.h, st.n, st.entries.filter((e) => !e.pending), cur, b.dpr);
  const c = fitCanvas(ui.chart);
  drawChart(ui.chart.getContext('2d'), c.w, c.h, st.series, st.pred, c.dpr);
  const bb = fitCanvas(ui.bars);
  if (st.lastCross) drawBars(ui.bars.getContext('2d'), bb.w, bb.h, st.lastCross.geo, st.lastCross.topo, bb.dpr);
  const m = st.anim ? `${formatGen(st.anim.g)}  ${Math.round(Math.min(1, (clock() - st.anim.start) / st.anim.dur) * 100)}%` : st.playing ? 'looping' : 'idle';
  $('stageStatus').textContent = `${m}\n${st.S.pointCount.toLocaleString()} pts · ${Math.round(st.fps)} fps\nstate ${st.hashStr}`;
  if (!st.anim) audio.drone(st.rate * 0.97, st.lastLenLog);
  st.rate *= 0.995;
}

// ───────────────────────── boot ─────────────────────────

function readHash() {
  const m = /n=(\d)&p=([-\d,]+)/.exec(location.hash || '');
  if (!m) return false;
  const n = +m[1];
  if (n < 3 || n > 8) return false;
  try {
    const w = parseWord(m[2], n);
    if (!w.length) return false;
    st.n = n;
    st.protocol = w;
    return true;
  } catch { return false; }
}

function boot() {
  const fromHash = readHash();
  buildRodSeg();
  buildPresets();
  if (!fromHash) { ui.preset.value = 'golden'; ui.presetNote.textContent = PRESETS[0].note; }
  ui.protocol.value = st.protocol.join(' ');
  ui.speedOut.textContent = `${Math.round(moveDuration())} ms`;
  runAnalysis();
  resetAll();
  if (!fromHash) { ui.preset.value = 'golden'; ui.presetNote.textContent = PRESETS[0].note; }
  // Expose a read-only handle for automated end-to-end checks.
  window.__loom = {
    st, enqueue, startLoop, stopLoop, resetAll, setProtocol, garsideDelta, formatWord,
    /** Advance the animation by ms of virtual time in 16 ms steps, then render once. */
    advance(ms, step = 16) {
      for (let t = 0; t < ms; t += step) { clockOffset += step; stepAnimation(clock()); }
      draw();
      return { t: st.t, word: st.word.slice(), busy: !!st.anim, queue: st.queue.length };
    },
  };
  requestAnimationFrame((t) => { st.lastFrame = t; frame(t); });
  // A short overture so the first thing you see is the fluid mixing: four periods, then rest.
  if (!fromHash) setTimeout(() => { if (!st.word.length && !st.queue.length && !st.anim) enqueue([1, -2, 1, -2, 1, -2, 1, -2]); }, 900);
}

boot();
