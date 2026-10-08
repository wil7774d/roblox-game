/* ==========================================================================
   finalarc — the arc meter
   A real VU needle (mass–spring–damper: it overshoots, pegs on the stop and
   bounces) over a segmented LED spectrum arc with falling peak caps, kick
   rings and sparks. One class, two sizes: the deck (corner player) and the
   stage (full screen).
   ========================================================================== */

class ArcMeter {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.cx = canvas.getContext("2d");
    this.big = !!opts.big;
    this.bars = this.big ? 72 : 36;
    this.segs = this.big ? 16 : 9;
    this.lv = new Float32Array(this.bars);      // displayed level per bar
    this.peak = new Float32Array(this.bars);    // peak cap
    this.peakV = new Float32Array(this.bars);   // peak cap fall speed
    this.hold = new Float32Array(this.bars);    // peak hold timer
    this.x = -0.04; this.v = 0;                 // needle position on the scale (0..1) + velocity
    this.trail = [];
    this.rings = [];
    this.sparks = [];
    this.lamp = 0;                              // peak lamp
    this.w = 0; this.h = 0; this.dpr = 1;
    this.resize();
  }

  resize() {
    const r = { width: this.cv.clientWidth, height: this.cv.clientHeight };   // layout size: immune to the wrapper's scale
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    // geometry: pivot near the bottom, everything hangs off one radius
    this.px = this.w / 2;
    this.py = this.h * (this.big ? .9 : .94);
    const room = Math.min(this.w / 2 - 4, this.py - 4);
    this.Rout = room;
    this.Rin = room * (this.big ? .64 : .62);
    this.Rs = room * (this.big ? .5 : .47);
    this.Rn = room * (this.big ? .58 : .56);
    this.A0 = Math.PI + .3;
    this.A1 = Math.PI * 2 - .3;
  }

  // dBVU → position on the scale (VU law: deflection follows voltage, not dB)
  static pos(db) {
    const lo = Math.pow(10, -20 / 20), hi = Math.pow(10, 3 / 20);
    return (Math.pow(10, db / 20) - lo) / (hi - lo);
  }

  angle(p) { return this.A0 + p * (this.A1 - this.A0); }

  kick(strength) {
    if (!this.w) return;
    this.rings.push({ r: this.Rs * .35, life: 1, s: strength });
    if (strength > .55) this.burst(strength * (this.big ? 14 : 5), false);
  }

  // sparks off the top of the loudest bars (or the needle tip when it pegs)
  burst(n, fromNeedle, red) {
    const cap = this.big ? 260 : 70;
    for (let k = 0; k < n && this.sparks.length < cap; k++) {
      let a, r;
      if (fromNeedle) { a = this.angle(Math.min(1, this.x)); r = this.Rn; }
      else {
        let best = 0, bi = 0;
        for (let t = 0; t < 4; t++) { const i = (Math.random() * this.bars) | 0; if (this.lv[i] >= best) { best = this.lv[i]; bi = i; } }
        a = this.A0 + ((bi + .5) / this.bars) * (this.A1 - this.A0);
        r = this.Rin + (this.Rout - this.Rin) * this.lv[bi];
      }
      const sp = (this.big ? 220 : 90) * (.4 + Math.random());
      const spread = (Math.random() - .5) * .9;
      this.sparks.push({
        x: this.px + Math.cos(a) * r, y: this.py + Math.sin(a) * r,
        vx: Math.cos(a + spread) * sp, vy: Math.sin(a + spread) * sp - (this.big ? 60 : 20),
        life: 1, decay: .9 + Math.random() * 1.4, red: !!red || Math.random() < .35,
      });
    }
  }

  /* f: { spec(Float32Array 0..1), db (dBFS rms), kick, drop, hot (blood), on (audio live), dt } */
  draw(f) {
    const { cx: c, dpr } = this;
    if (!this.w) { this.resize(); if (!this.w) return; }
    const dt = Math.min(.05, f.dt || .016);
    const W = this.w, H = this.h, B = this.bars, S = this.segs;
    const hot = f.hot || 0;

    /* --- needle physics: VU ballistics (≈300 ms rise, small overshoot) --- */
    const vu = f.on ? f.db + 5.5 : -40;            // 0 VU at −5.5 dBFS rms: the drops sit in the red
    const target = vu <= -20 ? -.04 : Math.min(1.12, ArcMeter.pos(vu));
    const w0 = 2 * Math.PI * 2.1, zeta = .68;
    const steps = Math.max(1, Math.ceil(dt / .004)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = w0 * w0 * (target - this.x) - 2 * zeta * w0 * this.v;
      this.v += acc * h;
      this.x += this.v * h;
      if (this.x > 1.045) { this.x = 1.045; if (this.v > .6) { this.lamp = 1; this.burst(this.big ? 8 : 3, true, true); } this.v = -this.v * .32; }
      if (this.x < -.045) { this.x = -.045; this.v = -this.v * .25; }
    }
    if (this.x > .97) this.lamp = Math.max(this.lamp, .7);
    this.lamp = Math.max(0, this.lamp - dt * 2.4);
    this.trail.unshift(this.x);
    if (this.trail.length > 7) this.trail.length = 7;

    /* --- spectrum smoothing + peak caps --- */
    const spec = f.spec;
    const n = spec ? spec.length : 0;
    for (let i = 0; i < B; i++) {
      let v = 0;
      if (n && f.on) {
        const p = (i / (B - 1)) * (n - 1), i0 = p | 0, fr = p - i0;
        v = spec[i0] * (1 - fr) + spec[Math.min(n - 1, i0 + 1)] * fr;
      }
      const cur = this.lv[i];
      this.lv[i] = v > cur ? cur + (v - cur) * Math.min(1, dt * 38) : cur + (v - cur) * Math.min(1, dt * 7);
      if (this.lv[i] >= this.peak[i]) { this.peak[i] = this.lv[i]; this.peakV[i] = 0; this.hold[i] = .45; }
      else if (this.hold[i] > 0) this.hold[i] -= dt;
      else { this.peakV[i] += 2.6 * dt; this.peak[i] = Math.max(0, this.peak[i] - this.peakV[i] * dt); }
    }

    /* --- draw --- */
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const shake = (f.drop || 0) * (this.big ? 7 : 2.5);
    if (shake > .05) c.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    const { px, py, Rin, Rout, Rs, Rn, A0, A1 } = this;
    const span = A1 - A0;

    // kick rings (behind everything)
    c.lineCap = "round";
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt * 1.6;
      r.r += dt * (Rout * 1.25);
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      c.strokeStyle = hot > .5 ? `rgba(255,40,52,${r.life * .38 * r.s})` : `rgba(255,120,70,${r.life * .32 * r.s})`;
      c.lineWidth = (this.big ? 2.2 : 1.2) * r.life + .4;
      c.beginPath(); c.arc(px, py, r.r, A0 - .12, A1 + .12); c.stroke();
    }

    // LED spectrum arc
    const segLen = ((Rout - Rin) / S) * .62, segGap = ((Rout - Rin) / S) * .38;
    const barW = Math.max(1.2, ((span * Rin) / B) * .58);
    const off = new Path2D(), ink = new Path2D(), amb = new Path2D(), red = new Path2D(), caps = new Path2D();
    for (let i = 0; i < B; i++) {
      const a = A0 + ((i + .5) / B) * span, ca = Math.cos(a), sa = Math.sin(a);
      const lit = Math.round(this.lv[i] * S);
      for (let j = 0; j < S; j++) {
        const r0 = Rin + j * (segLen + segGap), r1 = r0 + segLen;
        const path = j >= lit ? off : j >= S - Math.max(1, Math.round(S * .16)) ? red : j >= S - Math.round(S * .4) ? amb : ink;
        path.moveTo(px + ca * r0, py + sa * r0);
        path.lineTo(px + ca * r1, py + sa * r1);
      }
      if (this.peak[i] > .03) {
        const rp = Rin + this.peak[i] * (Rout - Rin) + 2;
        caps.moveTo(px + ca * rp, py + sa * rp);
        caps.lineTo(px + ca * (rp + 1.6), py + sa * (rp + 1.6));
      }
    }
    c.lineCap = "butt";
    c.lineWidth = barW;
    c.strokeStyle = "rgba(239,235,228,.07)"; c.stroke(off);
    // bloom pass, then the crisp pass
    c.globalCompositeOperation = "lighter";
    c.lineWidth = barW * 2.6;
    c.strokeStyle = hot > .5 ? "rgba(255,30,45,.16)" : "rgba(255,110,60,.12)"; c.stroke(ink); c.stroke(amb);
    c.strokeStyle = "rgba(255,30,45,.28)"; c.stroke(red);
    c.globalCompositeOperation = "source-over";
    c.lineWidth = barW;
    c.strokeStyle = hot > .5 ? "#ff6a6a" : "#efebe4"; c.stroke(ink);
    c.strokeStyle = hot > .5 ? "#ff2a3a" : "#ff8a3d"; c.stroke(amb);
    c.strokeStyle = "#ff2a3a"; c.stroke(red);
    c.lineWidth = barW * 1.1;
    c.strokeStyle = hot > .5 ? "#ffb3b3" : "#ffffff"; c.stroke(caps);

    // scale: arc, ticks, red zone, labels
    c.lineCap = "round";
    c.strokeStyle = "rgba(239,235,228,.28)";
    c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, Rs, A0, A1); c.stroke();
    const p0 = ArcMeter.pos(0);
    c.strokeStyle = "#ff2a3a";
    c.lineWidth = this.big ? 4 : 2.5;
    c.beginPath(); c.arc(px, py, Rs + (this.big ? 5 : 3), this.angle(p0), A1); c.stroke();
    const marks = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];
    const labels = new Set(Rs > 170 ? [-20, -10, -7, -5, -3, -1, 0, 1, 3] : Rs > 90 ? [-20, -10, -5, 0, 3] : [-20, 0, 3]);
    c.font = `500 ${Rs > 170 ? 13 : Rs > 90 ? 11 : 8.5}px "JetBrains Mono", ui-monospace, monospace`;
    c.textAlign = "center"; c.textBaseline = "middle";
    for (const m of marks) {
      const a = this.angle(ArcMeter.pos(m)), ca = Math.cos(a), sa = Math.sin(a);
      const major = labels.has(m);
      const t0 = Rs - (major ? (this.big ? 12 : 6) : (this.big ? 6 : 3)), t1 = Rs;
      c.strokeStyle = m >= 0 ? "#ff4b4b" : "rgba(239,235,228,.6)";
      c.lineWidth = major ? 1.4 : 1;
      c.beginPath(); c.moveTo(px + ca * t0, py + sa * t0); c.lineTo(px + ca * t1, py + sa * t1); c.stroke();
      if (major) {
        const tl = Rs - (this.big ? 28 : 14);
        c.fillStyle = m >= 0 ? "#ff6262" : "rgba(239,235,228,.72)";
        c.fillText(m > 0 ? `+${m}` : String(m), px + ca * tl, py + sa * tl);
      }
    }
    if (this.big && Rs > 150) {
      c.font = `italic 400 30px "Instrument Serif", Georgia, serif`;
      c.fillStyle = "rgba(239,235,228,.5)";
      c.fillText("vu", px, py - Rs * .42);
    }

    // peak lamp
    const lx = px + Math.cos(A1 - .06) * (Rs * .78), ly = py + Math.sin(A1 - .06) * (Rs * .78);
    const lr = this.big ? 5 : 3;
    if (this.lamp > .02) {
      const g = c.createRadialGradient(lx, ly, 0, lx, ly, lr * 6);
      g.addColorStop(0, `rgba(255,40,52,${.55 * this.lamp})`); g.addColorStop(1, "rgba(255,40,52,0)");
      c.fillStyle = g; c.beginPath(); c.arc(lx, ly, lr * 6, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = this.lamp > .02 ? `rgba(255,${60 + 120 * (1 - this.lamp)},${70 + 100 * (1 - this.lamp)},1)` : "rgba(239,235,228,.16)";
    c.beginPath(); c.arc(lx, ly, lr, 0, Math.PI * 2); c.fill();

    // needle: motion trail, then the needle
    const tipR = Rn, baseR = this.big ? 16 : 7;
    for (let k = this.trail.length - 1; k >= 1; k--) {
      const a = this.angle(Math.max(-.045, Math.min(1.045, this.trail[k])));
      c.strokeStyle = `rgba(239,235,228,${.06 * (1 - k / this.trail.length)})`;
      c.lineWidth = this.big ? 3 : 1.6;
      c.beginPath(); c.moveTo(px + Math.cos(a) * baseR, py + Math.sin(a) * baseR); c.lineTo(px + Math.cos(a) * tipR, py + Math.sin(a) * tipR); c.stroke();
    }
    const a = this.angle(this.x), ca = Math.cos(a), sa = Math.sin(a);
    c.strokeStyle = "#efebe4";
    c.lineWidth = this.big ? 2.4 : 1.4;
    c.beginPath(); c.moveTo(px + ca * baseR, py + sa * baseR); c.lineTo(px + ca * tipR * .86, py + sa * tipR * .86); c.stroke();
    c.strokeStyle = "#ff3b3b";
    c.beginPath(); c.moveTo(px + ca * tipR * .86, py + sa * tipR * .86); c.lineTo(px + ca * tipR, py + sa * tipR); c.stroke();
    // pivot
    c.fillStyle = "#15151c";
    c.beginPath(); c.arc(px, py, baseR, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(239,235,228,.35)"; c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, baseR, 0, Math.PI * 2); c.stroke();
    c.fillStyle = hot > .5 ? "#ff2a3a" : "#ff4b2b";
    c.beginPath(); c.arc(px, py, baseR * .32, 0, Math.PI * 2); c.fill();

    // sparks
    if (this.sparks.length) {
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      const g = this.big ? 520 : 240;
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.vy += g * dt; s.vx *= 1 - dt * .6;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= dt * s.decay;
        if (s.life <= 0 || s.y > H + 20) { this.sparks.splice(i, 1); continue; }
        const k = s.life;
        c.strokeStyle = s.red ? `rgba(255,${50 + 60 * k},${50 + 30 * k},${k})` : `rgba(255,${150 + 90 * k},${90 + 120 * k},${k})`;
        c.lineWidth = (this.big ? 2.2 : 1.3) * (.5 + k * .5);
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * .03, s.y - s.vy * .03); c.stroke();
      }
      c.globalCompositeOperation = "source-over";
    }
  }
}
