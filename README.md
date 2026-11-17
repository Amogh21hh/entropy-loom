# Entropy Loom

**A topological-chaos instrument.** You stir a fluid by swapping rods. Every stir is a braid. Integer arithmetic then *proves* how chaotic your stirring is, and the speakers play that number back to you as a musical interval.

```bash
npm start
```

The server prints its address, http://127.0.0.1:5177. Open it in a browser. The app needs Node ≥ 18 and has zero dependencies.

**Live:** https://amogh21hh.github.io/entropy-loom/ (no install needed, runs entirely in the browser).

---

## What was invented

Stirring a viscous fluid with a few rods is the physics behind taffy pullers, industrial mixers and bioreactors. Since the 2000s it has been known that the *topology* of the rods' motion alone forces a minimum amount of mixing (Boyland–Aref–Stremler, "topological chaos"). That minimum is the topological entropy, log λ, of the braid the rods trace out.

Until now this was offline analysis: record trajectories, run MATLAB later. Entropy Loom closes the loop in real time. Two independent engines run side by side, and you watch them agree.

| Geometric engine | Topological engine |
|---|---|
| Dye curves advected by an **exactly area-preserving** twist flow, adaptively refined up to ~240k points | **Dynnikov coordinates** of the same curves, updated with exact BigInt max-plus arithmetic |
| Measures dye length and real crossing counts | Computes the *minimal possible* crossing counts for that topology |
| Can only overshoot | Is the proven floor |

The instrument shows several things at once:

- the minimal ("tightened") curve, rebuilt purely from the integers, drawn over the real dye;
- the braid's word problem, solved exactly ("this stir looks mixed, but it is provably trivial");
- λ as a root of an integer polynomial, extracted from the exact piecewise-linear Jacobian;
- a Burau-representation lower bound that boxes λ in from below;
- λ as sound: an interval f : f·λ and a "λ-scale".

I know of nothing else that couples a live incompressible flow to an exact mapping-class computation, renders the topological skeleton next to the physical curve, and turns the stretch factor into sound.

---

## How it works under the hood

### 1. The stirring flow (`web/core/fluid.js`)
Rods sit at integer points on the x-axis. Swapping rods *i* and *i+1* is the radial twist about their midpoint *c*:

  (ρ, φ) ↦ (ρ, φ + θ·f(ρ))

The profile is f = 1 inside R₁ = 0.6, f = 0 outside R₂ = 1.4, with a cosine ramp in between. In polar coordinates the Jacobian is `[[1, 0], [θ f′(ρ), 1]]`, so **det = 1 exactly**: the flow is incompressible.

- **Rods.** The two swapped rods sit inside the rigid core, and every other rod lies outside the support. So rods move rigidly and never cut the fluid.
- **No drift.** Positions are recomputed every frame from a snapshot taken at the start of the move.
- **Refinement.** A segment longer than h = 0.03 gets a new point at the *exact image of its snapshot midpoint*.
- **Speed.** A per-move cache of f(ρ), an active-index list and block-copied typed buffers keep each frame at a few milliseconds.

A positive generator σᵢ is a counter-clockwise swap. This orientation is not a matter of taste. It is the only one under which geometric crossings never undercut the Dynnikov minima, and the test suite proves it.

### 2. Exact topology (`web/core/dynnikov.js`)
An integral lamination on the *n*-punctured disk has coordinates (a, b) ∈ ℤ^{2n−4}. With x⁺ = max(x, 0) and x⁻ = min(x, 0), the middle generators act by Dynnikov's rule:

```
c   = a_{i-1} − b_{i-1}⁻ − a_i + b_i⁺
a'_{i-1} = a_{i-1} + b_{i-1}⁺ + (b_i⁺ − c)⁺        b'_{i-1} = b_i − c⁺
a'_i     = a_i + b_i⁻ + (b_{i-1}⁻ + c)⁻            b'_i     = b_{i-1} + c⁺
```

- **End generators** use the compatible degenerate rules.
- **Inverses** are mirror-conjugates: σᵢ⁻¹ = M σᵢ M with M: a ↦ −a.
- **Minimal intersections** with the vertical arcs come in closed form:
  - νᵢ = 2·maxₖ(|aₖ| + bₖ⁺ + Σ_{j<k} bⱼ) − 2·Σ_{j<i} bⱼ
  - μ = ν/2 ∓ a
- **Word problem.** Laminations cannot see the full twist Δ², so β = e if and only if β·E = E *and* the exponent sum is 0. Here E = (0, 1, 0, 1, …) is realised physically by the default dye: nested loops around rods {1,2} ⊂ {1,2,3} ⊂ ….
- **Tightened curve.** At each rod, the strands split into loops from the left or right and strands passing above or below:
  - L = (ν_left − ν_right)⁺/2
  - T_up = μ_up − L − R
  
  This lets the renderer draw the minimal-position representative, either as exact strands or as weighted train-track bands labelled with exact counts.

### 3. Entropy, three independent ways (`entropy.js`, `burau.js`, `poly.js`)
1. **Growth ratio.** Compute I(βᵏL)/I(β^{k−1}L), where I = Σν + Σμ, iterated in BigInt until it converges.
2. **Exact algebraic λ.** Once the iterates enter a linear cone of the piecewise-linear map, build the integer Jacobian J column by column as β(v+eⱼ) − β(v). The code checks that it really is linear and homogeneous (β(v) = Jv exactly). It then computes the characteristic polynomial (Faddeev–LeVerrier, exact), strips the cyclotomic factors, and polishes the root with Aberth and Newton. Example: Ham–Song's σ₁σ₂σ₃⁻¹ gives **x⁴ − 2x³ − 2x + 1**.
3. **Burau(t = −1)** spectral radius, a rigorous lower bound. For 3 rods the classification is exact Thurston–Nielsen via the SL(2,ℤ) trace.

### 4. Interface (`web/`)
- **Canvas renderer.** Additive glow, a dye layer that is re-rasterised only when the dye changes, and screen-space decimation.
- **Panels.** A braid diagram strip, a log-length chart (measured dye vs. proven minimum vs. λ prediction), per-gap crossing bars, and a live invariant monitor.
- **Audio.** A WebAudio synthesiser: each rod has its own pitch, so you can hear the permutation. Swaps sound as FM bells, a drone follows the stretching rate, and a generated-impulse reverb sits under everything.

---

## Invariants (proven by `tests/`, re-checked live in the UI)

| # | Invariant | How it is checked |
|---|---|---|
| 1 | The max-plus rules form a **B_n action**: σᵢσᵢ₊₁σᵢ = σᵢ₊₁σᵢσᵢ₊₁, far commutation, σᵢσᵢ⁻¹ = e, and Δσᵢ = σ_{n−i}Δ | 14k randomized cases, coordinates up to 10¹²⁰ |
| 2 | **Faithful word problem** | Agrees with Artin's free-group action on 600 words; nontrivial words always move E |
| 3 | **Incompressibility**: det DT = 1, so every dye loop keeps its area | Finite differences at 3,000 points; loop areas stay within 5·10⁻³ |
| 4 | **Rods are impenetrable** | Minimum dye–rod clearance ≥ rod radius after random stirs |
| 5 | **Geometric ≥ topological** on every arc | Random words for n = 3–6 |
| 6 | **Time reversibility**: β·β⁻¹ returns every seed point | Error < 10⁻⁹ (measured 10⁻¹⁶–10⁻¹¹, even after 250k-point saturation) |
| 7 | **Entropy sandwich**: Burau(−1) ≤ λ, and λ is invariant under conjugation and inversion | Exact SL(2,ℤ) agreement for 3-braids |
| 8 | **Rods follow perm(β)** | Permutation check on random words |
| 9 | **Determinism**: same history ⇒ bit-identical state hash | Hash comparison of repeated runs |

The suite also includes stress tests (3,000-letter words returning E bit-for-bit, 10⁴⁰⁰-scale logs) and a soak run (`npm run verify`). The soak runs 240 stir/reverse cycles with 1,200 invariant checks and a heap-after-GC leak check.

---

## Three experiments to try first

**1. Watch topology bound physics.** Pick *Golden taffy puller* and press **Space**.
- In the chart, the cyan line (proven minimum) climbs at a slope of exactly log₁₀φ² per period.
- The amber dye line climbs *faster*, because the real flow wastes stretching in folds.
- Press **G** to overlay the tightened curve that the integers say the dye *could* be pulled to.
- Press **hear λ**: φ² ≈ 2.618 folds to the interval 1.309, a slightly sharp major third.

**2. A stir that looks chaotic but is provably nothing.** Pick *Hidden identity* (σ₁σ₂σ₁σ₂⁻¹σ₁⁻¹σ₂⁻¹).
- The dye gets visibly twisted, yet the badge reads **trivial — proved**.
- Turn on **G**: the tightened curve is back to the original nested loops.
- Press **R** to reverse. Every dye point returns to within 10⁻¹¹, and the monitor confirms it.

**3. One sign decides everything.** On 4 rods, type the protocol `1 2 3`. It is **periodic**: the rods dance and λ = 1. Now change it to `1 2 -3`.
- It becomes the **least chaotic stir possible on 4 rods** (Ham–Song), with λ ≈ 2.2966, the root of x⁴ − 2x³ − 2x + 1.
- Compare *Silver mixer* (λ = 3 + 2√2) and *Alternating loom* (6 rods, λ = (5 + √21)/2).
- Click above or below gaps yourself and watch the badge flip between periodic, reducible and chaotic.

---

## Controls

| Input | Action |
|---|---|
| Click above / below a gap | σᵢ (counter-clockwise) / σᵢ⁻¹ (clockwise) |
| Drag a rod over or under its neighbour | Swap them in that sense |
| 1–8, Shift+1–8 | σᵢ, σᵢ⁻¹ |
| Space | Loop the protocol |
| Backspace | Undo |
| R | Reverse the whole word (un-mix) |
| G | Tightened curve |
| M | Sound |
| C | Re-seed the dye |
| ? | Help |
| *use β as protocol* | Analyse the braid you just played by hand as a looping protocol |

Protocols accept `1 -2`, `σ1 σ2⁻¹`, `s1 s2^-1` or `aB`. The URL hash keeps the protocol, so a link reopens the same stir.

## Commands

```bash
npm start              # serve on http://127.0.0.1:5177
npm test               # 38 invariant & property tests (node:test, a few seconds)
npm run verify         # tests + soak / leak check
./run.sh               # tests, then serve and open the browser (start.cmd on Windows)
```

## Deploy

The app is pure static files in `web/`, with no build step and no backend. `server.mjs` is only a local dev server, so any static host works.

It is deployed to **GitHub Pages** from the `gh-pages` branch, which holds the contents of `web/` at its root. To publish an update after committing to `main`:

```bash
git push origin `git subtree split --prefix web main`:refs/heads/gh-pages --force
```

Pages then serves the new version within a minute or two. `web/.nojekyll` tells Pages to serve the files as they are. Every path in the app is relative, so it runs under the `/entropy-loom/` sub-path.

You can also deploy `web/` to another static host, such as Netlify, Cloudflare Pages or Vercel: set the output (publish) directory to `web` and leave the build command empty.

## Layout

```
web/core/   dynnikov.js  exact max-plus braid action, ν/μ, word problem, train track
            fluid.js     incompressible twist flow, refinement, crossing counts
            entropy.js   growth ratio · exact Jacobian · algebraic λ
            burau.js     Burau(−1) bound, SL(2,ℤ) classification for 3 rods
            poly.js      Faddeev–LeVerrier, cyclotomic stripping, Aberth roots
            braid.js     words, parser, permutations, presets
            freegroup.js Artin's action (independent word-problem oracle)
web/        app.js · render.js · audio.js · index.html · style.css
tests/      property & invariant suites      scripts/soak.mjs   leak/soak run
```

## Honest limits
- **Measured vs. proven stretching.** The dye's measured rate is ≥ log λ, not equal to it. Thurston–Nielsen gives a lower bound, and a real flow can do more work than it has to.
- **Classification.** For n ≥ 4 the type comes from growth behaviour: chaotic (λ > 1), periodic or reducible. A reducible braid with a pseudo-Anosov piece is reported as chaotic with that piece's λ. The exact pseudo-Anosov test is used for n = 3.
- **Point budget.** The dye's point budget (240k) caps resolution. When it is reached the loop pauses. Moves and reversal stay exact, and the monitor marks the area check as resolution-limited rather than passed or failed.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the formal blueprint and [`GENESIS.md`](GENESIS.md) for the ideation tournament that produced it.
