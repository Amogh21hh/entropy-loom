// Braid words: a word is an array of nonzero integers; +i is the Artin
// generator sigma_i (swap rods i, i+1 counter-clockwise), -i is its inverse.

const SUP = { '-': '⁻', '1': '¹' };

export function formatGen(g) {
  const i = Math.abs(g);
  const sub = String(i).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('');
  return 'σ' + sub + (g < 0 ? SUP['-'] + SUP['1'] : '');
}

export function formatWord(w) {
  return w.length ? w.map(formatGen).join(' ') : 'e';
}

/**
 * Parse a protocol string. Accepts "1 -2", "σ1 σ2⁻¹", "s1 s2^-1",
 * "1,-2", and letter notation "aB" (a=σ1, A=σ1⁻¹, b=σ2 ...). Throws on
 * malformed input or generators outside 1..n-1.
 */
export function parseWord(str, n) {
  const src = String(str)
    .replace(/[₀-₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/⁻¹|\^-1|\^\{-1\}|'/g, '~')
    .replace(/[σs]/g, ' ')
    .replace(/[,;()[\]]/g, ' ')
    .trim();
  const out = [];
  if (!src) return out;
  // Letter notation (only letters present).
  if (/^[a-zA-Z\s]+$/.test(src)) {
    for (const ch of src.replace(/\s+/g, '')) {
      const lower = ch.toLowerCase();
      const i = lower.charCodeAt(0) - 96;
      out.push(ch === lower ? i : -i);
    }
  } else {
    const tokens = src.split(/\s+/);
    for (const t of tokens) {
      const m = /^(-?)(\d+)(~?)$/.exec(t);
      if (!m) throw new Error(`Cannot read generator "${t}"`);
      const i = parseInt(m[2], 10);
      const neg = (m[1] === '-') !== (m[3] === '~');
      out.push(neg ? -i : i);
    }
  }
  for (const g of out) {
    const i = Math.abs(g);
    if (i < 1 || i > n - 1) throw new Error(`σ${i} needs ${i + 1} rods (have ${n})`);
  }
  return out;
}

export function inverseWord(w) {
  return w.slice().reverse().map((g) => -g);
}

export function exponentSum(w) {
  return w.reduce((s, g) => s + Math.sign(g), 0);
}

/** Free reduction (cancel adjacent g g^-1). */
export function freeReduce(w) {
  const st = [];
  for (const g of w) {
    if (st.length && st[st.length - 1] === -g) st.pop();
    else st.push(g);
  }
  return st;
}

/** Permutation of slots: perm[slot] = rod identity after applying w to identity. */
export function permutation(w, n) {
  const p = Array.from({ length: n }, (_, k) => k);
  for (const g of w) {
    const i = Math.abs(g);
    const t = p[i - 1];
    p[i - 1] = p[i];
    p[i] = t;
  }
  return p;
}

/** Garside half-twist Delta on n strands. Delta^2 generates the centre. */
export function garsideDelta(n) {
  const w = [];
  for (let k = n - 1; k >= 1; k--) for (let i = 1; i <= k; i++) w.push(i);
  return w;
}

export function cycleType(perm) {
  const seen = new Array(perm.length).fill(false);
  const cyc = [];
  for (let k = 0; k < perm.length; k++) {
    if (seen[k]) continue;
    let len = 0;
    let j = k;
    while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
    cyc.push(len);
  }
  return cyc.sort((a, b) => b - a);
}

/** Curated stirring protocols. */
export const PRESETS = [
  { id: 'golden', n: 3, word: [1, -2], name: 'Golden taffy puller', note: 'σ₁σ₂⁻¹ — the optimal 3-rod mixer, λ = φ² ≈ 2.618' },
  { id: 'silver', n: 3, word: [1, 1, -2, -2], name: 'Silver mixer', note: 'σ₁²σ₂⁻² — λ = 3+2√2 ≈ 5.828 (Boyland–Aref–Stremler)' },
  { id: 'periodic', n: 3, word: [1, 2], name: 'Merry-go-round', note: 'σ₁σ₂ — periodic: rods dance, dye does not stretch (λ = 1)' },
  { id: 'reducible', n: 4, word: [1, 1, 3, 3], name: 'Two private whirlpools', note: 'σ₁²σ₃² — reducible: no exponential mixing' },
  { id: 'hamsong', n: 4, word: [1, 2, -3], name: 'Ham–Song minimizer', note: 'σ₁σ₂σ₃⁻¹ — least chaotic pseudo-Anosov on 4 rods, λ ≈ 2.2966' },
  { id: 'pinwheel5', n: 5, word: [1, 2, 3, -4], name: 'Pinwheel-5', note: 'σ₁σ₂σ₃σ₄⁻¹ — a low-entropy 5-rod pseudo-Anosov' },
  { id: 'alt6', n: 6, word: [1, -2, 3, -4, 5], name: 'Alternating loom', note: 'σ₁σ₂⁻¹σ₃σ₄⁻¹σ₅ — maximally interleaved weave' },
  { id: 'identity', n: 4, word: [1, 2, 1, -2, -1, -2], name: 'Hidden identity', note: 'σ₁σ₂σ₁σ₂⁻¹σ₁⁻¹σ₂⁻¹ — braid relation: stirs then provably un-stirs' },
];
