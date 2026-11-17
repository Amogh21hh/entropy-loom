// Artin's faithful action of B_n on the free group F_n = <x_1..x_n>.
// Used as an independent oracle for the word problem (tests cross-check
// it against the Dynnikov solver). Words are arrays of nonzero ints (±j = x_j^{±1}).

function reduce(w) {
  const st = [];
  for (const x of w) {
    if (st.length && st[st.length - 1] === -x) st.pop();
    else st.push(x);
  }
  return st;
}

function invert(w) {
  return w.slice().reverse().map((x) => -x);
}

/** Images of generators under a single sigma_i^{±1} as substitution table. */
function genImages(g, n) {
  const i = Math.abs(g);
  const img = [];
  for (let j = 1; j <= n; j++) img[j] = [j];
  if (g > 0) {
    img[i] = [i, i + 1, -i];
    img[i + 1] = [i];
  } else {
    img[i] = [i + 1];
    img[i + 1] = [-(i + 1), i, i + 1];
  }
  return img;
}

function substitute(w, img) {
  const out = [];
  for (const x of w) {
    const s = img[Math.abs(x)];
    if (x > 0) out.push(...s);
    else out.push(...invert(s));
  }
  return reduce(out);
}

/** Images of x_1..x_n under the automorphism of the braid word (composition left to right). */
export function artinImages(word, n, maxLen = 1e6) {
  let imgs = [];
  for (let j = 1; j <= n; j++) imgs[j] = [j];
  for (const g of word) {
    const gi = genImages(g, n);
    // (φ_word ∘ φ_g)(x_j) = φ_word(φ_g(x_j)): substitute current images into φ_g's table.
    const next = [];
    for (let j = 1; j <= n; j++) {
      next[j] = substitute(gi[j], imgs);
      if (next[j].length > maxLen) throw new Error('free-group word explosion');
    }
    imgs = next;
  }
  return imgs;
}

export function isTrivialArtin(word, n) {
  const imgs = artinImages(word, n);
  for (let j = 1; j <= n; j++) if (imgs[j].length !== 1 || imgs[j][0] !== j) return false;
  return true;
}

export function totalLength(imgs) {
  let s = 0;
  for (let j = 1; j < imgs.length; j++) s += imgs[j].length;
  return s;
}
