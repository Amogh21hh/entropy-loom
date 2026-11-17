// Linear representations used as independent entropy witnesses.
import { identity, matMul, charPoly, spectralRadius, stripCyclotomic } from './poly.js';

/** Unreduced Burau matrix of a word at t = -1 (integer). Block for sigma_i: [[2,-1],[1,0]]. */
export function burauMinusOne(word, n) {
  let M = identity(n);
  for (const g of word) {
    const i = Math.abs(g) - 1;
    const G = identity(n);
    if (g > 0) { G[i][i] = 2n; G[i][i + 1] = -1n; G[i + 1][i] = 1n; G[i + 1][i + 1] = 0n; }
    else { G[i][i] = 0n; G[i][i + 1] = 1n; G[i + 1][i] = -1n; G[i + 1][i + 1] = 2n; }
    M = matMul(M, G);
  }
  return M;
}

/** Kolev/Fried lower bound: rho(Burau(-1)) <= dilatation. */
export function burauBound(word, n) {
  if (!word.length) return 1;
  // Cyclotomic factors (|root| = 1, often repeated) are removed exactly first so
  // ill-conditioned multiple roots cannot inflate the bound numerically.
  const { core } = stripCyclotomic(charPoly(burauMinusOne(word, n)));
  if (core.length <= 1) return 1;
  return Math.max(1, spectralRadius(core));
}

/** 3-braids → SL(2,Z): sigma1 = [[1,1],[0,1]], sigma2 = [[1,0],[-1,1]]. */
export function sl2(word) {
  let M = [[1n, 0n], [0n, 1n]];
  const S = {
    1: [[1n, 1n], [0n, 1n]], [-1]: [[1n, -1n], [0n, 1n]],
    2: [[1n, 0n], [-1n, 1n]], [-2]: [[1n, 0n], [1n, 1n]],
  };
  for (const g of word) M = matMul(M, S[g]);
  return M;
}

/**
 * Exact Thurston–Nielsen type of a 3-braid (modulo the centre).
 * |tr| > 2: pseudo-Anosov with λ = (|tr| + sqrt(tr² - 4)) / 2.
 */
export function classify3(word) {
  const M = sl2(word);
  const tr = M[0][0] + M[1][1];
  const at = tr < 0n ? -tr : tr;
  if (at > 2n) {
    const t = Number(at);
    return { type: 'pseudo-Anosov', trace: tr, lambda: (t + Math.sqrt(t * t - 4)) / 2, poly: [1n, -at, 1n] };
  }
  if (at < 2n) return { type: 'periodic', trace: tr, lambda: 1, poly: null };
  return { type: 'reducible', trace: tr, lambda: 1, poly: null, note: '|tr| = 2: reducible (or central power)' };
}
