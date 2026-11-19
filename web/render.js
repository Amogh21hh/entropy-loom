// Canvas renderers: fluid stage, tightened train-track ghost, braid strip,
// stretch chart and crossing bars. Pure drawing — no state mutation.
import { GEOM } from './core/fluid.js';
import { trainTrack, bigRatio } from './core/dynnikov.js';

export const DYE_HUES = [32, 330, 192, 270, 140, 52, 0];

export function rodColor(id, n, light = 64) {
  const h = (id * 360) / n + 28;
  return `hsl(${h}, 88%, ${light}%)`;
}

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr, cssW: r.width, cssH: r.height };
}

export function makeView(n, w, h) {
  const spanX = n - 1 + 2.9, spanY = 3.15;
  const s = Math.min(w / spanX, h / spanY);
  const cx = w / 2, cy = h / 2;
  const ox = (n - 1) / 2;
  return {
    s, n, ox, cx, cy,
    X: (x) => cx + (x - ox) * s,
    Y: (y) => cy - y * s,
    inv: (px, py) => [(px - cx) / s + ox, -(py - cy) / s],
  };
}

function bg(ctx, w, h, view) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#06080c';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#0c121c');
  g.addColorStop(1, '#05070a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // dotted lattice
  ctx.fillStyle = '#ffffff0d';
  const step = view.s * 0.25;
  if (step > 6) {
    const [x0, y0] = view.inv(0, 0), [x1, y1] = view.inv(w, h);
    for (let x = Math.floor(x0 * 4) / 4; x <= x1; x += 0.25)
      for (let y = Math.floor(y1 * 4) / 4; y <= y0; y += 0.25)
        ctx.fillRect(view.X(x) - 0.75, view.Y(y) - 0.75, 1.5, 1.5);
  }
}

function strokeCurve(ctx, c, view, minPx) {
  const { x, y } = c;
  const N = c.n;
  if (!N) return;
  const { s, ox, cx, cy } = view;
  ctx.beginPath();
  let lx = cx + (x[0] - ox) * s, ly = cy - y[0] * s;
  ctx.moveTo(lx, ly);
  const m2 = minPx * minPx;
  for (let k = 1; k <= N; k++) {
    const j = k === N ? 0 : k;
    const px = cx + (x[j] - ox) * s, py = cy - y[j] * s;
    const dx = px - lx, dy = py - ly;
    if (dx * dx + dy * dy < m2 && k !== N) continue;
    ctx.lineTo(px, py);
    lx = px; ly = py;
  }
  ctx.stroke();
}

// Offscreen dye layer, re-rasterised only when the dye geometry or view changes.
const dyeCache = { canvas: null, key: '' };

function dyeLayer(w, h, view, S, opts) {
  const key = `${S.version}|${w}|${h}|${opts.dpr}|${opts.glow}|${S.n}|${S.seedKind}|${opts.curveLen.map((v) => v.toPrecision(3)).join(',')}`;
  if (!dyeCache.canvas) dyeCache.canvas = document.createElement('canvas');
  const cv = dyeCache.canvas;
  if (dyeCache.key === key && cv.width === w && cv.height === h) return cv;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const dpr = opts.dpr;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const heavy = S.pointCount > 160000;
  S.curves.forEach((c, idx) => {
    const L0 = opts.curveLen0[idx] || 1;
    const len = opts.curveLen[idx] || L0;
    const fade = Math.min(0.95, Math.max(0.24, 0.95 * Math.pow(L0 / len, 0.3)));
    const hue = DYE_HUES[idx % DYE_HUES.length];
    if (opts.glow && !heavy) {
      ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${fade * 0.16})`;
      ctx.lineWidth = 5 * dpr;
      strokeCurve(ctx, c, view, 1.5 * dpr);
    }
    ctx.strokeStyle = `hsla(${hue}, 100%, ${68 + 14 * (1 - fade)}%, ${fade})`;
    ctx.lineWidth = 1.4 * dpr;
    strokeCurve(ctx, c, view, (heavy ? 0.9 : 0.6) * dpr);
  });
  if (opts.glow && heavy) {
    // Cheap bloom for dense dye: blurred self-composite instead of a second stroke pass.
    ctx.globalAlpha = 0.5;
    ctx.filter = `blur(${3 * dpr}px)`;
    ctx.drawImage(cv, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  dyeCache.key = key;
  return cv;
}

export function drawFluid(ctx, w, h, view, S, opts) {
  bg(ctx, w, h, view);
  const n = S.n;
  const dpr = opts.dpr;
  // Twist zone of the current move.
  if (S.move) {
    const cx = view.X(S.move.cx), cy = view.Y(0);
    const g = ctx.createRadialGradient(cx, cy, GEOM.R1 * view.s * 0.6, cx, cy, GEOM.R2 * view.s);
    g.addColorStop(0, '#66d9ff10');
    g.addColorStop(1, '#66d9ff00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, GEOM.R2 * view.s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#66d9ff22';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    for (const R of [GEOM.R1, GEOM.R2]) { ctx.beginPath(); ctx.arc(cx, cy, R * view.s, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // Gap affordance.
  if (opts.hover && !S.move) drawGapHint(ctx, view, opts.hover, dpr);

  // Dye (cached layer).
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(dyeLayer(w, h, view, S, opts), 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  if (opts.ghost && opts.lamination) drawTrainTrack(ctx, view, opts.lamination, dpr);

  // Rods.
  for (let q = 0; q < n; q++) {
    const id = S.rodId[q];
    const px = view.X(S.rodX[q]), py = view.Y(S.rodY[q]);
    // Drawn at least ~8 CSS px so rods stay visible with many rods / small screens.
    const r = Math.max(GEOM.rodR * view.s, 8 * dpr);
    const halo = ctx.createRadialGradient(px, py, r * 0.5, px, py, r * 3.2);
    halo.addColorStop(0, rodColor(id, n, 60).replace('hsl', 'hsla').replace('%)', '%, 0.35)'));
    halo.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(px, py, r * 3.2, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, r * 0.1, px, py, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, rodColor(id, n, 70));
    body.addColorStop(1, rodColor(id, n, 38));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8edf5dd';
    ctx.font = `600 ${Math.round(12 * dpr)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(String(id + 1), px, py + r + 15 * dpr);
  }
  // Slot ticks.
  ctx.fillStyle = '#ffffff22';
  for (let g = 0; g < n - 1; g++) ctx.fillRect(view.X(g + 0.5) - 0.5 * dpr, view.Y(0) - 3 * dpr, 1 * dpr, 6 * dpr);
}

function drawGapHint(ctx, view, hover, dpr) {
  const { gap, positive } = hover;
  const cx = view.X(gap + 0.5), cy = view.Y(0);
  const r = 0.5 * view.s;
  ctx.strokeStyle = positive ? '#ffb35ccc' : '#66d9ffcc';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  // CCW (positive): right rod travels over the top to the left. Screen y is flipped.
  const a0 = positive ? -0.15 : 0.15, a1 = positive ? -Math.PI + 0.15 : Math.PI - 0.15;
  ctx.arc(cx, cy, r, a0, a1, positive);
  ctx.stroke();
  const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
  const tang = a1 + (positive ? -Math.PI / 2 : Math.PI / 2);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(tang) * 9 * dpr, ey + Math.sin(tang) * 9 * dpr);
  ctx.lineTo(ex + Math.cos(tang + 2.5) * 7 * dpr, ey + Math.sin(tang + 2.5) * 7 * dpr);
  ctx.lineTo(ex + Math.cos(tang - 2.5) * 7 * dpr, ey + Math.sin(tang - 2.5) * 7 * dpr);
  ctx.fill();
  ctx.font = `600 ${Math.round(15 * dpr)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  const sub = '₀₁₂₃₄₅₆₇₈₉'[gap + 1];
  ctx.fillText(positive ? `σ${sub}` : `σ${sub}⁻¹`, cx, cy + (positive ? -r - 12 * dpr : r + 22 * dpr));
}

/** Count formatting for exact BigInt counts. */
export function fmtBig(v) {
  const s = (v < 0n ? -v : v).toString();
  const sign = v < 0n ? '−' : '';
  if (s.length <= 7) return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
}

/**
 * The tightened (minimal-position) curve reconstructed purely from the
 * Dynnikov coordinates. Exact strands when few, weighted bands otherwise.
 */
export function drawTrainTrack(ctx, view, L, dpr) {
  const { nu, cells } = trainTrack(L);
  const n = L.n;
  let total = 0n;
  for (const v of nu) total += v;
  const exact = total <= 260n;
  const H = 0.46;
  const rodR = GEOM.rodR;
  const gapY = (g, pos) => {
    // pos: BigInt or fractional position (top = 0)
    const v = nu[g];
    const frac = exact ? (Number(pos) + 0.5) / Number(v) : pos;
    return H - 2 * H * frac;
  };
  const fracCenter = (g, start, count) => bigRatio(2n * start + count, 2n * nu[g]);
  const slotY = (s, count) => {
    const avail = 0.5 - rodR - 0.04;
    const sp = Math.min(0.03, avail / Math.max(1, count));
    return rodR + 0.035 + (s + 0.5) * sp;
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const path = (pts) => {
    ctx.beginPath();
    ctx.moveTo(view.X(pts[0][0]), view.Y(pts[0][1]));
    for (let k = 1; k < pts.length - 1; k++) {
      const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
      ctx.quadraticCurveTo(view.X(pts[k][0]), view.Y(pts[k][1]), view.X(mx), view.Y(my));
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(view.X(last[0]), view.Y(last[1]));
    ctx.stroke();
  };
  const width = (c) => (exact ? 1.4 : 1.4 + 2.4 * Math.log10(1 + Number(c > 10n ** 300n ? 10n ** 300n : c))) * dpr;
  const labels = [];
  for (const cell of cells) {
    const q = cell.q;
    const xL = q - 0.5, xR = q + 0.5;
    const { up, down, L: Lc, R: Rc } = cell;
    const U = Number(up + Lc + Rc > 400n ? 400n : up + Lc + Rc);
    const Dn = Number(down + Lc + Rc > 400n ? 400n : down + Lc + Rc);
    const loops = Lc > 0n ? Lc : Rc;
    const side = Lc > 0n ? -1 : 1; // which gap the loops return to
    ctx.strokeStyle = '#a8f0ffcc';
    if (exact) {
      const nl = Number(loops), nup = Number(up), ndn = Number(down);
      for (let m = 0; m < nup; m++) {
        const s = nl + (nup - 1 - m);
        path([[xL, gapY(q - 1, m)], [xL + 0.25, gapY(q - 1, m)], [q, slotY(s, U)], [xR - 0.25, gapY(q, m)], [xR, gapY(q, m)]]);
      }
      for (let m = 0; m < ndn; m++) {
        const s = nl + m;
        const pl = nup + 2 * Number(Lc) + m, pr = nup + 2 * Number(Rc) + m;
        path([[xL, gapY(q - 1, pl)], [xL + 0.25, gapY(q - 1, pl)], [q, -slotY(s, Dn)], [xR - 0.25, gapY(q, pr)], [xR, gapY(q, pr)]]);
      }
      for (let m = 0; m < nl; m++) {
        const s = nl - 1 - m;
        const g = side < 0 ? q - 1 : q;
        const xg = side < 0 ? xL : xR;
        const p1 = nup + m, p2 = nup + 2 * nl - 1 - m;
        const ya = slotY(s, U), yb = -slotY(s, Dn);
        const reach = q - side * (rodR + 0.035 + (s + 0.5) * Math.min(0.03, (0.5 - rodR - 0.04) / Math.max(1, Math.max(U, Dn))));
        path([[xg, gapY(g, p1)], [xg - side * 0.2, gapY(g, p1)], [q, ya], [reach, ya * 0.9], [reach, 0], [reach, yb * 0.9], [q, yb], [xg - side * 0.2, gapY(g, p2)], [xg, gapY(g, p2)]]);
      }
    } else {
      // Weighted bands at group centres.
      ctx.strokeStyle = '#a8f0ff66';
      if (up > 0n) {
        ctx.lineWidth = width(up);
        const yl = gapY(q - 1, fracCenter(q - 1, 0n, up)), yr = gapY(q, fracCenter(q, 0n, up));
        const ya = 0.5 * (rodR + 0.46);
        path([[xL, yl], [xL + 0.25, yl], [q, ya], [xR - 0.25, yr], [xR, yr]]);
        labels.push([q, ya + 0.07, up]);
      }
      if (down > 0n) {
        ctx.lineWidth = width(down);
        const yl = gapY(q - 1, fracCenter(q - 1, up + 2n * Lc, down)), yr = gapY(q, fracCenter(q, up + 2n * Rc, down));
        const yb = -0.5 * (rodR + 0.46);
        path([[xL, yl], [xL + 0.25, yl], [q, yb], [xR - 0.25, yr], [xR, yr]]);
        labels.push([q, yb - 0.09, down]);
      }
      if (loops > 0n) {
        ctx.lineWidth = width(loops);
        const g = side < 0 ? q - 1 : q;
        const xg = side < 0 ? xL : xR;
        const y1 = gapY(g, fracCenter(g, up, loops)), y2 = gapY(g, fracCenter(g, up + loops, loops));
        const ya = rodR + 0.12, reach = q - side * (rodR + 0.12);
        path([[xg, y1], [xg - side * 0.2, y1], [q, ya], [reach, ya * 0.9], [reach, 0], [reach, -ya * 0.9], [q, -ya], [xg - side * 0.2, y2], [xg, y2]]);
        labels.push([reach - side * 0.02, 0.0, loops, side]);
      }
    }
  }
  if (!exact) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#cfefffdd';
    ctx.font = `${Math.round(11.5 * dpr)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    for (const [x, y, c] of labels) ctx.fillText(fmtBig(c), view.X(x), view.Y(y));
  }
  // Gap totals.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#66d9ffaa';
  ctx.font = `${Math.round(11.5 * dpr)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  for (let g = 0; g < n - 1; g++) ctx.fillText('ν=' + fmtBig(nu[g]), view.X(g + 0.5), view.Y(-H - 0.12));
  ctx.restore();
}

/** Braid strip: entries [{ g, ids }] where ids are rod identities at slots before the move. */
export function drawBraid(ctx, w, h, n, entries, current, dpr) {
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(0, 0, w, h);
  const pad = 14 * dpr;
  const rowH = (h - 2 * pad) / Math.max(1, n - 1);
  const colW = 34 * dpr;
  const maxCols = Math.floor((w - 40 * dpr) / colW);
  const list = entries.slice(-maxCols);
  const yOf = (q) => pad + q * rowH;
  let x = w - 20 * dpr - list.length * colW;
  if (current) x -= colW;
  ctx.lineCap = 'round';
  const seg = (q0, q1, x0, id, lw) => {
    ctx.strokeStyle = rodColor(id, n, 62);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, yOf(q0));
    ctx.bezierCurveTo(x0 + colW * 0.5, yOf(q0), x0 + colW * 0.5, yOf(q1), x0 + colW, yOf(q1));
    ctx.stroke();
  };
  const drawCol = (e, x0, t = 1) => {
    const i = Math.abs(e.g);
    for (let q = 0; q < n; q++) if (q !== i - 1 && q !== i) seg(q, q, x0, e.ids[q], 2 * dpr);
    // Positive (CCW): rod in slot i passes over the top → drawn on top.
    const overFrom = e.g > 0 ? i : i - 1, underFrom = e.g > 0 ? i - 1 : i;
    const target = (q) => (q === i - 1 ? i : i - 1);
    seg(underFrom, target(underFrom), x0, e.ids[underFrom], 2 * dpr);
    ctx.strokeStyle = '#0b0f16';
    ctx.lineWidth = 7 * dpr;
    ctx.beginPath();
    ctx.moveTo(x0, yOf(overFrom));
    ctx.bezierCurveTo(x0 + colW * 0.5, yOf(overFrom), x0 + colW * 0.5, yOf(target(overFrom)), x0 + colW, yOf(target(overFrom)));
    ctx.stroke();
    seg(overFrom, target(overFrom), x0, e.ids[overFrom], 2.4 * dpr);
  };
  for (const e of list) { drawCol(e, x); x += colW; }
  if (current) {
    ctx.globalAlpha = 0.35 + 0.65 * current.t;
    drawCol(current, x);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#8a97ab';
  ctx.font = `${Math.round(11 * dpr)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('braid · time →', 8 * dpr, h - 4 * dpr);
}

/** Stretch chart. series: [{ t, dye, topo }] in log10 units relative to start. */
export function drawChart(ctx, w, h, series, pred, dpr) {
  ctx.clearRect(0, 0, w, h);
  const padL = 34 * dpr, padB = 18 * dpr, padT = 8 * dpr, padR = 8 * dpr;
  const T = Math.max(8, series.length ? series[series.length - 1].t : 0);
  let ymax = 1;
  for (const p of series) ymax = Math.max(ymax, p.dye, p.topo);
  if (pred) ymax = Math.max(ymax, Math.min(pred.y0 + pred.slope * (T - pred.t0), ymax * 1.6));
  ymax = Math.ceil(ymax);
  const X = (t) => padL + ((w - padL - padR) * t) / T;
  const Y = (v) => h - padB - ((h - padB - padT) * Math.max(0, v)) / ymax;
  ctx.strokeStyle = '#1a2230';
  ctx.lineWidth = 1 * dpr;
  ctx.fillStyle = '#8a97ab';
  ctx.font = `${Math.round(11 * dpr)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'right';
  const ystep = Math.max(1, Math.ceil(ymax / 5));
  for (let v = 0; v <= ymax; v += ystep) {
    ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke();
    ctx.fillText(`10${String(v).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('')}`, padL - 4 * dpr, Y(v) + 3 * dpr);
  }
  ctx.textAlign = 'center';
  ctx.fillText('moves', w - 24 * dpr, h - 3 * dpr);
  if (pred) {
    ctx.strokeStyle = '#ff6faecc';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(X(pred.t0), Y(pred.y0));
    const t1 = Math.min(T, pred.t0 + (ymax - pred.y0) / Math.max(1e-9, pred.slope));
    ctx.lineTo(X(t1), Y(pred.y0 + pred.slope * (t1 - pred.t0)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const line = (key, color, width) => {
    if (!series.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    series.forEach((p, k) => (k ? ctx.lineTo(X(p.t), Y(p[key])) : ctx.moveTo(X(p.t), Y(p[key]))));
    ctx.stroke();
  };
  line('topo', '#66d9ff', 2 * dpr);
  line('dye', '#ffb35c', 1.6 * dpr);
}

/** Per-gap crossing bars (log scale): geometric (filled) vs exact minimum (outline). */
export function drawBars(ctx, w, h, geo, topo, dpr) {
  ctx.clearRect(0, 0, w, h);
  if (!geo) return;
  const m = geo.length;
  const padB = 18 * dpr, padT = 16 * dpr;
  const lg = (v) => Math.log10(1 + Number(v > 10n ** 300n ? 10n ** 300n : BigInt(v)));
  let mx = 1;
  for (let k = 0; k < m; k++) mx = Math.max(mx, lg(geo[k]), lg(topo[k]));
  const bw = Math.min(46 * dpr, (w - 10 * dpr) / m);
  const x0 = (w - bw * m) / 2;
  ctx.font = `${Math.round(11 * dpr)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  for (let k = 0; k < m; k++) {
    const x = x0 + k * bw;
    const hg = ((h - padB - padT) * lg(geo[k])) / mx;
    const ht = ((h - padB - padT) * lg(topo[k])) / mx;
    const ok = BigInt(geo[k]) >= topo[k];
    ctx.fillStyle = ok ? '#ffb35c55' : '#ff5c7a';
    ctx.fillRect(x + bw * 0.18, h - padB - hg, bw * 0.64, hg);
    ctx.strokeStyle = '#66d9ff';
    ctx.lineWidth = 1.6 * dpr;
    ctx.strokeRect(x + bw * 0.18, h - padB - ht, bw * 0.64, ht);
    ctx.fillStyle = '#8a97ab';
    ctx.fillText(`ν${'₀₁₂₃₄₅₆₇₈₉'[k + 1]}`, x + bw / 2, h - 3 * dpr);
    ctx.fillStyle = '#9aa7ba';
    ctx.fillText(fmtBig(BigInt(geo[k])), x + bw / 2, h - padB - Math.max(hg, ht) - 3 * dpr);
  }
}
