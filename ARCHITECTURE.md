# ENTROPY LOOM — Architecture

## 1. The core breakthrough
You stir a 2-D viscous fluid with *n* rods (3–8). Each stirring move swaps two neighbouring rods, and every sequence of moves is a braid β ∈ Bₙ. Two engines run side by side and check each other:

1. **Geometric engine.** It advects dye curves through an exactly area-preserving twist flow and refines them adaptively.
2. **Topological engine.** It acts on Dynnikov coordinates using exact BigInt max-plus arithmetic. From these it reads off the dye's *minimal* intersection numbers, solves the braid word problem, extracts the exact piecewise-linear Jacobian, and finds the stretch factor λ as the largest root of an integer polynomial.

The integer engine proves the *minimum* stretching rate log λ for that braid (Thurston–Nielsen). The dye's measured stretching can only meet or exceed it. You hear λ as the interval f : f·λ.

## 2. Mathematical engine

### 2.1 Stirring flow (one move σᵢ^{±1})
Rods sit at xₖ = k (k = 0…n−1), y = 0, with radius r = 0.07. A swap rotates about the gap centre c = (i−½, 0) using a radial twist:

  (ρ, φ) ↦ (ρ, φ ± θ(t)·f(ρ)),  f = 1 for ρ ≤ R₁ = 0.6, f = 0 for ρ ≥ R₂ = 1.4, and f = ½(1+cos(π(ρ−R₁)/(R₂−R₁))) in between.

In polar coordinates the Jacobian is [[1,0],[θf′,1]], so det = 1 and the map is **exactly incompressible**. The two swapped rods lie inside R₁ and rotate rigidly. Every other rod lies outside R₂ and stays fixed. Each position comes from a snapshot taken when the move began, x(t) = T_{θ(t)}(x₀), so no error builds up during a move.

**Refinement.** Any segment longer than h = 0.03 gets a new point at the image of its *snapshot* midpoint. Inserted points are therefore always exact images of points on the previous curve.

**Performance.** Each move caches f(ρ) per point and keeps an active-index list, and unchanged runs are block-copied into reusable typed buffers.

**Orientation.** A positive σᵢ is a counter-clockwise swap. The test suite fixes this sign: the opposite sense violates invariant 5 within a few moves.

### 2.2 Dynnikov coordinates (exact topology)
For n punctures, a lamination L has coordinates (a₁…a_{n−2}, b₁…b_{n−2}) ∈ Z^{2n−4}. With x⁺ = max(x,0) and x⁻ = min(x,0), the generators act as follows.

- σ₁: a′ = b₁ − (b₁⁺ − a₁)⁺, b′ = b₁⁺ − a₁
- σ_{n−1}: a′ = b − (b⁻ − a)⁻, b′ = b⁻ − a
- σᵢ (1 < i < n−1), with c = a_{i−1} − b_{i−1}⁻ − aᵢ + bᵢ⁺:
  - a′_{i−1} = a_{i−1} + b_{i−1}⁺ + (bᵢ⁺ − c)⁺
  - b′_{i−1} = bᵢ − c⁺
  - a′ᵢ = aᵢ + bᵢ⁻ + (b_{i−1}⁻ + c)⁻
  - b′ᵢ = b_{i−1} + c⁺
- σᵢ⁻¹ = M σᵢ M, where the mirror M: a ↦ −a swaps the arcs above and below each rod.

The tests verify all of these rules against the braid relations on more than 14,000 random vectors.

**Minimal intersections.**
- νᵢ = 2·maxₖ(|aₖ| + bₖ⁺ + Σ_{j<k} bⱼ) − 2·Σ_{j<i} bⱼ
- μ_{2i−1}, μ_{2i} = ∓(−1)ⁱaᵢ + (νᵢ/2 if bᵢ ≥ 0, else ν_{i+1}/2)

**Word problem.** Laminations cannot see the full twist Δ² (the centre), so β = 1 if and only if β·E = E **and** the exponent sum is 0. Here E = (0,1,…,0,1) is the nested loop family {1,2} ⊂ {1,2,3} ⊂ …, which is the default dye.

### 2.3 Entropy
- **λ (convergence).** For a looped protocol, λ = lim I(βᵏL)/I(β^{k−1}L), where I = Σμ + Σν.
- **λ (exact).** Once iterates enter a linear cone, compute the Jacobian J column by column as β(v+eⱼ) − β(v). λ is the spectral radius of J, read from its integer characteristic polynomial (Faddeev–LeVerrier in BigInt) with Aberth root-finding.
- **Burau lower bound.** At t = −1, σᵢ ↦ I ⊕ [[2,−1],[1,0]] ⊕ I, and ρ(B(β)) ≤ λ.
- **n = 3, exact classification.** Use σ₁ ↦ [[1,1],[0,1]] and σ₂ ↦ [[1,0],[−1,1]] in SL(2,Z):
  - |tr| > 2: pseudo-Anosov, with λ the largest root of x² − |tr|x + 1.
  - |tr| < 2: periodic.
  - |tr| = 2: reducible or periodic.

### 2.4 Tightened train track
At each puncture k, the engine splits the strands into four groups:
- L = max(0, (ν_{k−1} − ν_k)/2)
- R = max(0, (ν_k − ν_{k−1})/2)
- T_up = μ_up − L − R
- T_down = μ_down − L − R

It draws the strands in minimal position when the total is ≤ 300, and otherwise as weighted bands labelled with exact counts.

## 3. Invariants (checked at runtime and in `tests/`)
1. **Group action.** σᵢσᵢ₊₁σᵢ = σᵢ₊₁σᵢσᵢ₊₁, σᵢσⱼ = σⱼσᵢ for |i−j| ≥ 2, and σᵢσᵢ⁻¹ = id, on every integer vector including |x| ~ 10¹⁰⁰.
2. **Faithfulness modulo the centre.** β·E = E if and only if β ∈ ⟨Δ²⟩. Together with exponent sum 0, this means β = 1. It is cross-checked against Artin's free-group action.
3. **Incompressibility.** det DT = 1, and the enclosed area of each dye loop is conserved to discretisation tolerance.
4. **Topological admissibility.** No dye point ever lies inside a rod disk.
5. **Geometric ≥ topological.** For every arc, the dye's crossing count is at least the Dynnikov minimum (μ, ν).
6. **Time reversibility.** Applying β and then β⁻¹ returns every original seed point to within 1e−9. This holds even after the point budget saturates.
7. **Entropy sandwich.** ρ_Burau(−1) ≤ λ_Dynnikov. For n = 3, λ_Dynnikov equals the SL(2,Z) value.
8. **Permutation consistency.** The rod identities on screen equal perm(β).
9. **Determinism.** The same word and seed always give a bit-identical state hash.

## 4. Interface
- **Canvas (60 fps).** Glowing dye with additive blending and colour by stretch age, glowing rods, gap hot-zones (click the top half for σᵢ, the bottom half for σᵢ⁻¹), and an optional ghost overlay of the tightened train track.
- **Keys.** 1–9 plays σᵢ, Shift+1–9 plays σᵢ⁻¹, Backspace undoes, R reverses the whole word, and Space plays or pauses the looped protocol.
- **Panel.**
  - Protocol field and presets: golden taffy σ₁σ₂⁻¹, Ham–Song σ₁σ₂σ₃⁻¹, periodic σ₁σ₂, reducible σ₁².
  - Braid word chips, permutation and identity detector.
  - λ, its polynomial and the Burau bound.
  - A log-length chart comparing the measured dye with the topological minimum.
  - Crossing bars for each gap.
  - A live invariant monitor.
  - A scrolling braid diagram.
- **Audio (WebAudio).**
  - Each rod carries its own pitch, so you hear the permutation.
  - FM bells sound on each swap, panned along the rod's path.
  - A drone's brightness follows the stretching rate.
  - "Hear λ" plays f with f·λ (octave-reduced) through a generated reverb.

## 5. Files
- `server.mjs` — zero-dependency static server (`npm start`).
- `web/core/` — `dynnikov`, `braid`, `poly`, `burau`, `entropy`, `fluid`, `freegroup`, `rng`.
- `web/` — `app`, `render`, `audio`, `index.html`, `style.css`.
- `tests/*.test.mjs` — run with `node --test`.
- `scripts/soak.mjs` — soak and heap-leak run.

## 6. Verification record
- **Tests.** `npm test` runs 38 property and invariant tests, all passing.
- **Soak.** `npm run verify` runs 240 cycles and 1,200 live invariant checks. The heap after GC stays flat at 4.5 → 4.7 MB.
- **Browser end-to-end.** In the browser, every input path was driven: gap clicks, keys, undo, rod drag, loop, reverse, all 8 presets, and "use β as protocol". There were zero console errors, all live invariants passed, and the reversal error was ≤ 1.5e−11.
