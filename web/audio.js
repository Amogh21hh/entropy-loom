// Procedural sound for the loom. Every sound is synthesised live:
//  • each rod owns a pitch, so a braid's permutation is audible,
//  • a swap is a pair of FM bells gliding along the rods' arcs,
//  • a drone opens up with the instantaneous stretching rate,
//  • "hear λ" plays the stretch factor as an interval f : f·λ (octave-reduced).

const ROD_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3];
const BASE = 174.61; // F3

export class LoomAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.voices = [];
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    // Generated stereo impulse response → reverb send.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8, 2.6);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.35;
    this.verbSend.connect(this.verb).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.dry.connect(this.master);
    this.buildDrone();
    return ctx;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  buildDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 200;
    this.droneFilter.Q.value = 6;
    this.droneOsc = [];
    for (const [f, det] of [[BASE / 2, -6], [BASE / 2, 7], [BASE * 0.75, 0]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(this.droneFilter);
      o.start();
      this.droneOsc.push(o);
    }
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.dry);
    this.droneGain.connect(this.verbSend);
  }

  async setEnabled(on) {
    this.enabled = on;
    const ctx = this.ensure();
    if (!ctx) return false;
    if (on && ctx.state !== 'running') await ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.08);
    return true;
  }

  rodFreq(id) {
    return BASE * ROD_RATIOS[id % ROD_RATIOS.length];
  }

  /** FM bell. positive=true → bright inharmonic ratio; false → darker. */
  bell(freq, pan, positive, dur = 1.6, gain = 0.18) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    car.frequency.value = freq;
    mod.frequency.value = freq * (positive ? 3.5 : 1.414);
    modGain.gain.setValueAtTime(freq * (positive ? 4 : 2.2), t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.8);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(modGain).connect(car.frequency);
    car.connect(amp);
    let out = amp;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); amp.connect(p); out = p; }
    out.connect(this.dry);
    out.connect(this.verbSend);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  /** Start two gliding voices for a swap; returns a handle to update pans. */
  swapStart(idA, idB, panA, panB, positive, seconds) {
    if (!this.enabled || !this.ctx) return null;
    this.bell(this.rodFreq(idA), panA, positive, 1.4, 0.16);
    this.bell(this.rodFreq(idB) * 2, panB, positive, 1.8, 0.1);
    const ctx = this.ctx, t = ctx.currentTime;
    const mk = (f, pan) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + seconds * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.25);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(g);
      if (p) { p.pan.value = pan; g.connect(p).connect(this.verbSend); } else g.connect(this.verbSend);
      o.start(t); o.stop(t + seconds + 0.3);
      return { o, p };
    };
    return { a: mk(this.rodFreq(idA), panA), b: mk(this.rodFreq(idB), panB) };
  }

  swapUpdate(h, panA, panB) {
    if (!h || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (h.a.p) h.a.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, panA)), t, 0.02);
    if (h.b.p) h.b.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, panB)), t, 0.02);
  }

  /** Drone follows the stretching: rate = d log(length)/dt, level = log length. */
  drone(rate, level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    const g = on * Math.min(0.11, Math.max(0, rate) * 0.05 + (level > 0.2 ? 0.012 : 0));
    this.droneGain.gain.setTargetAtTime(g, t, 0.25);
    this.droneFilter.frequency.setTargetAtTime(160 + Math.min(4200, 260 * Math.max(0, level) + 900 * Math.max(0, rate)), t, 0.3);
  }

  /** Play λ as an interval and as its "λ-scale": λ^k folded into one octave. */
  hearLambda(lambda) {
    if (!this.ctx || !this.enabled) return false;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const fold = (x) => x / Math.pow(2, Math.floor(Math.log2(x)));
    const f0 = BASE * 1.5;
    const tone = (f, start, dur, gain, pan) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(g);
      const out = p ? (p.pan.value = pan, g.connect(p)) : g;
      out.connect(this.dry); out.connect(this.verbSend);
      o.start(start); o.stop(start + dur + 0.05);
    };
    if (lambda <= 1 + 1e-9) {
      tone(f0, t0, 2.5, 0.12, 0); // unison: no stretching
      return true;
    }
    for (let k = 0; k < 6; k++) tone(f0 * fold(Math.pow(lambda, k)), t0 + k * 0.22, 1.2, 0.09, -0.6 + k * 0.24);
    const t1 = t0 + 6 * 0.22 + 0.2;
    tone(f0, t1, 3.2, 0.12, -0.3);
    tone(f0 * fold(lambda), t1, 3.2, 0.12, 0.3);
    return true;
  }
}
