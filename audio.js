/* ==========================================================================
   finalarc — audio
   The track, a latency-compensated song clock and everything the visuals react
   to. The song was mapped offline (audio/song.js: 132 bpm grid, sections, every
   silence and every kick / snare / hat), so the drop and the beats land exactly
   even before the Web Audio analyser has data, and when opened from disk.
   Public: window.AUDIO = { F, track, play, pause, toggle, seek, setVolume, on }
   ========================================================================== */
(() => {
  const SONG = window.SONG;
  if (!SONG) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const decay = (v, dt, tau) => v * Math.exp(-dt / tau);
  const BEAT = 60 / SONG.bpm, BAR = BEAT * 4;
  const T = (n) => SONG.offset + n * BAR;
  const DROPS = [SONG.drop, T(80), T(112)];
  const FRAMES = Uint8Array.from(atob(SONG.frames.data), (c) => c.charCodeAt(0));
  const http = /^https?:$/.test(location.protocol);

  const listeners = { beat: [], kick: [], drop: [], state: [], ended: [] };
  const emit = (ev, ...a) => { for (const fn of listeners[ev]) try { fn(...a); } catch (e) { console.warn(e); } };

  /* ------------------------------------------------------------------------
     Track: <audio> → (Web Audio analyser) → gain → speakers
     ------------------------------------------------------------------------ */
  const track = {
    el: document.createElement("audio"),
    ctx: null, an: null, gain: null, live: false, freq: null, wave: null,
    ready: false, playing: false, waiting: false, ended: false, failed: false, streaming: false,
    volume: 1, muted: false,
    init() {
      const el = this.el;
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      el.addEventListener("canplaythrough", () => (this.ready = true));
      el.addEventListener("playing", () => { this.playing = true; this.waiting = false; this.ended = false; clock.sync(); emit("state"); });
      el.addEventListener("pause", () => { this.playing = false; this.waiting = false; emit("state"); });
      el.addEventListener("waiting", () => { this.waiting = true; emit("state"); });
      el.addEventListener("loadstart", () => { this.waiting = false; });
      el.addEventListener("seeked", () => clock.sync());
      el.addEventListener("ended", () => { this.playing = false; this.ended = true; emit("state"); emit("ended"); });
      el.addEventListener("error", () => { this.failed = true; this.ready = true; emit("state"); });
      this.preload();
    },
    // the whole track downloads behind the gate (with real progress) and plays from memory:
    // nothing buffers mid-song. Opened from disk it streams instead.
    async preload() {
      const L = window.LOAD, mb = (n) => (n / 1048576).toFixed(1);
      let src = SONG.src;
      if (http && window.fetch && window.ReadableStream) {
        try {
          const res = await fetch(SONG.src);
          if (!res.ok || !res.body) throw new Error(res.status);
          const total = +res.headers.get("content-length") || 0;
          const reader = res.body.getReader(), chunks = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); got += value.length;
            L?.set("track", total ? got / total * .97 : Math.min(.95, got / 7e6), total ? `${mb(got)} / ${mb(total)} mb` : `${mb(got)} mb`);
          }
          src = URL.createObjectURL(new Blob(chunks, { type: "audio/mpeg" }));
        } catch (e) { console.warn("track preload", e); }
      }
      if (this.streaming) { if (src !== SONG.src) URL.revokeObjectURL(src); L?.done("track", "streaming"); return; }
      this.el.src = src;
      await new Promise((res) => {
        if (this.ready) return res();
        this.el.addEventListener("canplaythrough", res, { once: true });
        this.el.addEventListener("error", res, { once: true });
        setTimeout(res, 9000);
      });
      L?.done("track", this.failed ? "unavailable" : "");
    },
    wire() {
      if (this.ctx || !http) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: "interactive" });
        const src = this.ctx.createMediaElementSource(this.el);
        this.an = this.ctx.createAnalyser();
        this.an.fftSize = 2048;
        this.an.smoothingTimeConstant = .5;
        this.an.minDecibels = -88;
        this.an.maxDecibels = -18;
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.muted ? 0 : this.volume;
        src.connect(this.an); this.an.connect(this.gain); this.gain.connect(this.ctx.destination);
        this.freq = new Uint8Array(this.an.frequencyBinCount);
        this.wave = new Float32Array(this.an.fftSize);
        this.live = true;
      } catch (e) { console.warn("web audio", e); this.live = false; }
    },
    // entered before the download finished (slow connection): stream rather than wait on silence
    ensureSrc() { if (!this.el.getAttribute("src")) { this.streaming = true; this.el.src = SONG.src; } },
    play() {
      this.ensureSrc();
      this.wire();
      this.ctx?.resume?.();
      if (this.ended) { this.el.currentTime = 0; this.ended = false; }
      return this.el.play();
    },
    pause() { this.el.pause(); },
    applyGain() {
      const v = this.muted ? 0 : this.volume;
      if (this.gain) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, .04);
      else { this.el.volume = v; }
    },
    latency() { return this.ctx ? Math.min(.3, (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) : 0; },
  };

  // smooth song clock: media time + performance.now(), nudged back toward the media clock
  const clock = {
    base: 0, perf: 0,
    sync() { this.base = track.el.currentTime; this.perf = performance.now(); },
    now() {
      const el = track.el, mt = el.currentTime;
      if (!track.playing || el.paused) { this.base = mt; this.perf = performance.now(); return mt; }
      let t = this.base + ((performance.now() - this.perf) / 1000) * (el.playbackRate || 1);
      const err = mt - t;
      if (Math.abs(err) > .15) { this.sync(); t = mt; } else this.base += err * .05;
      return t;
    },
  };

  /* ------------------------------------------------------------------------
     Features
     ------------------------------------------------------------------------ */
  const NB = 64;
  const F = {
    t: 0, spec: new Float32Array(NB), u8: new Uint8Array(NB),
    db: -90, level: 0, low: 0, mid: 0, high: 0,
    kick: 0, snare: 0, hat: 0, beat: 0, drop: 0, dropIdx: -1, sinceDrop: 99,
    beatN: -1, bar: 0, inBar: 0, frac: 0,
    section: SONG.sections[0], gap: false, tension: 0, countdown: null, on: false,
  };
  const EDGES = [];
  for (let i = 0; i <= NB; i++) EDGES.push(30 * Math.pow(16000 / 30, i / NB));

  function liveSpectrum() {
    const an = track.an, fq = track.freq;
    an.getByteFrequencyData(fq);
    const hz = track.ctx.sampleRate / an.fftSize;
    for (let i = 0; i < NB; i++) {
      const a = EDGES[i] / hz, b = EDGES[i + 1] / hz;
      let v;
      if (b - a < 1) { const p = (a + b) / 2, i0 = Math.floor(p), fr = p - i0; v = fq[i0] * (1 - fr) + fq[i0 + 1] * fr; }
      else { v = 0; for (let k = Math.floor(a); k < Math.ceil(b); k++) v = Math.max(v, fq[k]); }
      F.spec[i] = Math.pow(clamp((v / 255) * (1 + .3 * (i / NB))), 2.6);   // mastered loud: expand the top
    }
    an.getFloatTimeDomainData(track.wave);
    let s = 0;
    for (let i = 0; i < track.wave.length; i++) s += track.wave[i] * track.wave[i];
    const rms = Math.sqrt(s / track.wave.length);
    F.db = rms > 1e-5 ? 20 * Math.log10(rms) : -90;
  }
  // from disk (no analyser): the precomputed 3-band envelopes, shaped into a spectrum
  function mapSpectrum(t, now) {
    const n = SONG.frames.bands, i = clamp(Math.floor(t / SONG.frames.dt), 0, FRAMES.length / n - 1) * n;
    const low = FRAMES[i] / 255, mid = FRAMES[i + 1] / 255, high = FRAMES[i + 2] / 255, lvl = FRAMES[i + 3] / 255;
    F.db = track.playing ? -36 + lvl * 34 : -90;
    for (let b = 0; b < NB; b++) {
      const x = b / (NB - 1);
      const base = x < .3 ? lerp(low, mid, smoothstep(.18, .3, x)) : x < .7 ? lerp(mid, high, smoothstep(.55, .7, x)) : high * (1 - (x - .7) * .9);
      const wob = .82 + .18 * Math.sin(b * 12.9898 + now * (7 + (b % 5)));
      F.spec[b] = track.playing ? clamp(base * wob * (1 - x * .25) + (x < .2 ? F.kick * .25 : 0)) : 0;
    }
  }

  const cur = { k: 0, s: 0, h: 0 };
  const firstAfter = (arr, t, get) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (get(arr[m]) < t) lo = m + 1; else hi = m; } return lo; };
  function reseek(t) {
    cur.k = firstAfter(SONG.kicks, t, (x) => x[0]);
    cur.s = firstAfter(SONG.snares, t, (x) => x[0]);
    cur.h = firstAfter(SONG.hats, t, (x) => x);
    F.beatN = Math.floor((t - SONG.offset) / BEAT);
  }

  function update(now, dt) {
    const prev = F.t;
    const t = clock.now() - track.latency();
    F.t = t;
    F.on = track.playing || track.waiting;
    const jumped = t < prev - .05 || t - prev > .5;
    if (jumped) reseek(t);

    if (track.live && track.playing) liveSpectrum();
    else mapSpectrum(t, now / 1000);
    let lo = 0, mi = 0, hi = 0;
    for (let i = 0; i < NB; i++) { F.u8[i] = F.spec[i] * 255; if (i < 14) lo += F.spec[i]; else if (i < 42) mi += F.spec[i]; else hi += F.spec[i]; }
    F.low = lo / 14; F.mid = mi / 28; F.high = hi / 22;
    F.level = clamp((F.db + 30) / 26);

    F.kick = decay(F.kick, dt, .11);
    F.snare = decay(F.snare, dt, .14);
    F.hat = decay(F.hat, dt, .06);
    F.beat = decay(F.beat, dt, .2);
    F.drop = decay(F.drop, dt, .55);
    F.sinceDrop += dt;

    if (track.playing && !jumped) {
      const K = SONG.kicks, S = SONG.snares, H = SONG.hats;
      while (cur.k < K.length && K[cur.k][0] <= t) { const s = K[cur.k][1]; F.kick = Math.max(F.kick, .35 + .65 * s); emit("kick", s); cur.k++; }
      while (cur.s < S.length && S[cur.s][0] <= t) { F.snare = Math.max(F.snare, .4 + .6 * S[cur.s][1]); cur.s++; }
      while (cur.h < H.length && H[cur.h] <= t) { F.hat = 1; cur.h++; }
      const bn = Math.floor((t - SONG.offset) / BEAT);
      if (bn !== F.beatN) { F.beatN = bn; F.beat = 1; emit("beat", bn); }
      for (let i = 0; i < DROPS.length; i++) if (prev < DROPS[i] && t >= DROPS[i]) { F.drop = 1; F.dropIdx = i; F.sinceDrop = 0; emit("drop", i); }
    }
    const g = (t - SONG.offset) / BEAT;
    F.frac = g - Math.floor(g);
    F.bar = Math.floor(g / 4);
    F.inBar = ((Math.floor(g) % 4) + 4) % 4;
    F.section = SONG.sections.find((s) => t >= s.from && t < s.to) || SONG.sections[SONG.sections.length - 1];
    F.gap = track.playing && SONG.gaps.some((x) => t >= x[0] && t < x[1]);

    // tension: the run-ups into each drop
    let ten = 0, cd = null;
    if (t >= T(14) && t < SONG.drop) { ten = t >= SONG.silence[0] ? 1 : Math.pow(clamp((t - T(14)) / (SONG.silence[0] - T(14))), 1.7); cd = SONG.drop - t; }
    else if (t >= T(78) && t < T(80)) { ten = .55 * Math.pow(clamp((t - T(78)) / (2 * BAR)), 2); cd = T(80) - t; }
    else if (t >= T(111) && t < T(112)) { ten = .6; cd = T(112) - t; }
    F.tension = track.playing ? ten : 0;
    F.countdown = track.playing ? cd : null;
  }

  track.init();

  window.AUDIO = {
    F, track, SONG, BEAT, BAR, T, DROPS,
    update,
    on(ev, fn) { listeners[ev]?.push(fn); },
    unlock() { track.wire(); track.ctx?.resume?.(); },
    play() { return track.play(); },
    pause() { track.pause(); },
    toggle() { if (track.playing || track.waiting) { track.pause(); return Promise.resolve(); } return track.play(); },
    seek(t) {
      t = clamp(t, 0, SONG.duration - .05);
      track.ensureSrc();
      track.el.currentTime = t;
      track.ended = false;
      clock.sync();
      F.t = t;
      reseek(t);
      emit("state");
    },
    setVolume(v) { track.volume = clamp(v); track.muted = track.volume === 0; track.applyGain(); emit("state"); },
    setMuted(m) { track.muted = m; track.applyGain(); emit("state"); },
    get duration() { return track.el.duration || SONG.duration; },
  };
})();
