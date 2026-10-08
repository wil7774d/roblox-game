/* ==========================================================================
   finalarc — the show
   Music + autopilot. The track was mapped offline (audio/song.js): a 132 bpm
   grid, its sections, every silence and every kick / snare / hat. At runtime
   a latency-compensated song clock drives:
     • a director that scrolls the site in time with the music,
     • the drop choreography (blackout → TAKEN DOWN + blood on the hit),
     • the arc meters (deck + stage) and the background arc (via SHOW.gl()).
   Live spectrum comes from a Web Audio analyser when the page is served over
   http(s); opened from disk it falls back to the precomputed envelopes.
   Loaded after main.js and shares its globals ($, scenes, state, …).
   ========================================================================== */

(() => {
  const SONG = window.SONG;
  if (!SONG) return;

  const BEAT = 60 / SONG.bpm, BAR = BEAT * 4;
  const T = (n) => SONG.offset + n * BAR;
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const ENV = unb64(SONG.env.data);
  const FRAMES = unb64(SONG.frames.data);
  const DROPS = [SONG.drop, T(80), T(112)];
  const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOut4 = (t) => 1 - Math.pow(1 - t, 4);
  const decay = (v, dt, tau) => v * Math.exp(-dt / tau);
  const mmss = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
  const root = document.documentElement;

  /* ------------------------------------------------------------------------
     Track: <audio> → (Web Audio analyser) → speakers
     ------------------------------------------------------------------------ */
  const track = {
    el: document.createElement("audio"),
    ctx: null, an: null, gain: null, live: false,
    ready: false, playing: false, waiting: false, ended: false, muted: false, failed: false,
    freq: null, wave: null,
    init() {
      const el = this.el;
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      el.addEventListener("canplaythrough", () => (this.ready = true));
      el.addEventListener("playing", () => { this.playing = true; this.waiting = false; this.ended = false; clock.sync(); });
      el.addEventListener("pause", () => { this.playing = false; this.waiting = false; while (beatQueue.length) beatQueue.shift()(); });
      el.addEventListener("waiting", () => (this.waiting = true));
      el.addEventListener("seeked", () => clock.sync());
      el.addEventListener("ended", () => { this.playing = false; this.ended = true; onEnded(); });
      el.addEventListener("error", () => { this.failed = true; this.ready = true; });
      el.addEventListener("loadstart", () => { this.waiting = false; });
      this.preload();
    },
    // the whole track is downloaded before the gate opens (with real progress), then played from
    // memory: no buffering mid-show, instant seeks. From disk (file://) it streams instead.
    async preload() {
      const el = this.el, L = window.LOAD;
      const mb = (n) => (n / 1048576).toFixed(1);
      let src = SONG.src;
      if (/^https?:$/.test(location.protocol) && window.fetch && window.ReadableStream) {
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
      el.src = src;
      await new Promise((res) => { if (this.ready) return res(); el.addEventListener("canplaythrough", res, { once: true }); el.addEventListener("error", res, { once: true }); setTimeout(res, 9000); });
      L?.done("track", this.failed ? "unavailable" : "");
    },
    wire() {
      if (this.ctx || !/^https?:$/.test(location.protocol)) return;
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
        src.connect(this.an);
        this.an.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.freq = new Uint8Array(this.an.frequencyBinCount);
        this.wave = new Float32Array(this.an.fftSize);
        this.live = true;
      } catch (e) {
        console.warn("web audio", e);
        this.live = false;
      }
    },
    // the visitor got in before the download finished (slow connection, the gate's 30 s escape):
    // stream it rather than leave the show waiting on a silent element
    ensureSrc() {
      if (this.el.getAttribute("src")) return;
      this.streaming = true;
      this.el.src = SONG.src;
    },
    play() {
      this.ensureSrc();
      this.wire();
      this.ctx?.resume?.();
      if (this.ended) { this.el.currentTime = 0; this.ended = false; }
      return this.el.play();
    },
    pause() { this.el.pause(); },
    setMuted(m) {
      this.muted = m;
      if (this.gain) this.gain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, .04);
      else this.el.muted = m;
    },
    latency() { return this.ctx ? Math.min(.3, (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) : 0; },
    buffered() {
      const b = this.el.buffered, d = this.el.duration || SONG.duration;
      return b.length ? clamp(b.end(0) / d) : 0;
    },
  };

  /* smooth song clock: media time + performance.now(), nudged back toward the media clock */
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
  track.init();

  /* ------------------------------------------------------------------------
     Features: what the visuals react to
     ------------------------------------------------------------------------ */
  const NB = 64;
  const F = {
    t: 0, spec: new Float32Array(NB), u8: new Uint8Array(NB),
    db: -60, level: 0, low: 0, mid: 0, high: 0,
    kick: 0, snare: 0, hat: 0, beat: 0, drop: 0, dropIdx: -1, shock: 9,
    beatN: -1, bar: 0, inBar: 0, frac: 0,
    section: SONG.sections[0], gap: false, tension: 0, countdown: null, on: false,
  };
  // log-spaced band edges, 30 Hz → 16 kHz, as analyser bin indices
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
      v = v / 255;
      v = Math.pow(clamp(v * (1 + .3 * (i / NB))), 2.6);   // mastered loud: expand the top so the bars still move
      F.spec[i] = v;
    }
    an.getFloatTimeDomainData(track.wave);
    let s = 0;
    for (let i = 0; i < track.wave.length; i++) s += track.wave[i] * track.wave[i];
    const rms = Math.sqrt(s / track.wave.length);
    F.db = rms > 1e-5 ? 20 * Math.log10(rms) : -90;
  }

  function mapSpectrum(t, now) {
    const n = SONG.frames.bands, i = clamp(Math.floor(t / SONG.frames.dt), 0, FRAMES.length / n - 1) * n;
    const low = FRAMES[i] / 255, mid = FRAMES[i + 1] / 255, high = FRAMES[i + 2] / 255, lvl = FRAMES[i + 3] / 255;
    F.db = track.playing ? -36 + lvl * 34 : -90;
    const k = F.kick;
    for (let b = 0; b < NB; b++) {
      const x = b / (NB - 1);
      const base = x < .3 ? lerp(low, mid, smoothstep(.18, .3, x)) : x < .7 ? lerp(mid, high, smoothstep(.55, .7, x)) : high * (1 - (x - .7) * .9);
      const wob = .82 + .18 * Math.sin(b * 12.9898 + now * (7 + (b % 5)));
      F.spec[b] = track.playing ? clamp(base * wob * (1 - x * .25) + (x < .2 ? k * .25 : 0)) : 0;
    }
  }
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // event cursors into the hit lists
  const cur = { k: 0, s: 0, h: 0, g: 0 };
  const firstAfter = (arr, t, get) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (get(arr[m]) < t) lo = m + 1; else hi = m; } return lo; };
  function reseek(t) {
    cur.k = firstAfter(SONG.kicks, t, (x) => x[0]);
    cur.s = firstAfter(SONG.snares, t, (x) => x[0]);
    cur.h = firstAfter(SONG.hats, t, (x) => x);
    F.beatN = Math.floor((t - SONG.offset) / BEAT);
  }

  const beatQueue = [];
  const listeners = { beat: [], kick: [] };

  function features(now, dt) {
    const prev = F.t;
    const t = clock.now() - track.latency();
    F.t = t;
    F.on = track.playing || track.waiting;
    const jumped = t < prev - .05 || t - prev > .5;
    if (jumped) reseek(t);

    if (track.live && track.playing) liveSpectrum();
    else mapSpectrum(t, now / 1000);
    for (let i = 0; i < NB; i++) F.u8[i] = F.spec[i] * 255;
    let lo = 0, mi = 0, hi = 0;
    for (let i = 0; i < 14; i++) lo += F.spec[i];
    for (let i = 14; i < 42; i++) mi += F.spec[i];
    for (let i = 42; i < NB; i++) hi += F.spec[i];
    F.low = lo / 14; F.mid = mi / 28; F.high = hi / 22;
    F.level = clamp((F.db + 30) / 26);

    F.kick = decay(F.kick, dt, .11);
    F.snare = decay(F.snare, dt, .14);
    F.hat = decay(F.hat, dt, .06);
    F.beat = decay(F.beat, dt, .2);
    F.drop = decay(F.drop, dt, .55);
    F.shock += dt;

    if (track.playing && !jumped) {
      const K = SONG.kicks, S = SONG.snares, H = SONG.hats;
      while (cur.k < K.length && K[cur.k][0] <= t) { const s = K[cur.k][1]; F.kick = Math.max(F.kick, .35 + .65 * s); for (const fn of listeners.kick) fn(s); cur.k++; }
      while (cur.s < S.length && S[cur.s][0] <= t) { F.snare = Math.max(F.snare, .4 + .6 * S[cur.s][1]); cur.s++; }
      while (cur.h < H.length && H[cur.h] <= t) { F.hat = 1; cur.h++; }
      const bn = Math.floor((t - SONG.offset) / BEAT);
      if (bn !== F.beatN) {
        F.beatN = bn;
        F.beat = 1;
        while (beatQueue.length) beatQueue.shift()();
        for (const fn of listeners.beat) fn(bn);
      }
      for (let i = 0; i < DROPS.length; i++) if (prev < DROPS[i] && t >= DROPS[i]) onDrop(i);
      cueCrossings(prev, t);
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

  /* ------------------------------------------------------------------------
     Director: where the page should be at every moment of the song.
     Nodes are (song time → page position). Between cuts they're joined by a
     monotone cubic spline: velocity is continuous through every node, it never
     overshoots or runs backwards, and equal neighbours make a clean hold. A cut
     starts a new run and the view jumps on that downbeat.
     ------------------------------------------------------------------------ */
  const V = window.SITE.view;
  const P = {
    top: () => 0,
    scene: (name, p) => () => { const el = scenes[name]; return el.offsetTop + p * Math.max(0, el.offsetHeight - innerHeight); },
    at: (sel, vh = 0) => () => { const el = $(sel); return el ? Math.max(0, window.SITE.docTop(el) + vh * innerHeight) : 0; },
    bottom: (sel) => () => { const el = $(sel); return el ? Math.max(0, window.SITE.docTop(el) + el.offsetHeight - innerHeight) : 0; },
    end: () => V.max,
  };
  const N = (t, y) => ({ t, y }), C = (t, y) => ({ t, y, cut: true });
  const S = P.scene;
  const NODES = [
    N(0, P.top), N(T(3), P.top),                                          // hero: the avatar spawns + poses on the stutters
    N(T(4), S("manifesto", 0)), N(T(8) - .45, S("manifesto", .94)),     // the manifesto, word by word
    N(T(8) + .5, S("stats", 0)), N(T(12) - .25, S("stats", 1)),        // 808s: the stats fly
    N(T(12) + .4, S("saga", .015)), N(T(14), S("saga", .23)),          // i · the rise
    N(T(15), S("saga", .3)), N(SONG.silence[0], S("saga", .47)),        // ii · the sign, gathering speed
    N(SONG.drop - .001, S("saga", .47)),                                 // dead air
    C(SONG.drop, S("saga", .535)), N(T(23.5), S("saga", .72)),          // THE DROP
    N(T(28) - .2, S("saga", .985)), N(T(28) + .6, S("avatar", .05)),   // iv · reupload → the fit
    N(T(36) - .3, S("avatar", .97)), N(T(36) + .6, P.at("#closet")),
    N(T(48), P.bottom("#closet")), N(T(49), P.at(".insights")),        // the hook
    N(T(64), P.bottom(".insights")), N(T(65), P.at("#vault")),
    N(T(80) - .05, P.bottom("#vault")),
    C(T(80), P.at("#stage")), N(T(104), P.at("#stage")),               // drop ii · now playing
    N(T(105), P.at("#discord")), N(T(111), P.at("#discord")),          // say hi.
    N(T(112) - .02, P.top), N(T(116) - .001, P.top),                    // bass cut → rewind → drop iii
    C(T(116), S("manifesto", .78)), N(T(118) - .001, S("manifesto", .96)),   // the recap: a cut every 2 bars
    C(T(118), S("stats", .28)), N(T(120) - .001, S("stats", .44)),
    C(T(120), S("stats", .74)), N(T(122) - .001, S("stats", .9)),
    C(T(122), S("saga", .06)), N(T(124) - .001, S("saga", .2)),
    C(T(124), S("saga", .535)), N(T(126) - .001, S("saga", .62)),
    C(T(126), S("saga", .8)), N(T(128) - .001, S("saga", .92)),
    C(T(128), S("avatar", .42)), N(T(130) - .001, S("avatar", .72)),
    C(T(130), P.at("#closet", .05)), N(T(132) - .001, P.at("#closet", .45)),
    C(T(132), P.at(".insights", .3)), N(T(134) - .001, P.at(".insights", .7)),
    C(T(134), P.at("#vault", .05)), N(T(136) - .001, P.at("#vault", .35)),
    C(T(136), P.at(".vault__head--groups", -.2)), N(T(138) - .001, P.at(".vault__head--groups", .1)),
    C(T(138), P.at("#stage")), N(T(140) - .001, P.at("#stage")),
    C(T(140), P.at("#discord")), N(T(144), P.at("#discord")),
    N(SONG.duration, P.end),                                              // outro
  ];
  // one-shot cues on the timeline (fired only when the playhead crosses them while driving)
  const CUES = [
    { t: T(8), fx: "808" }, { t: T(111), fx: "rewind" }, { t: T(112), fx: "slam" },
    { t: T(124), fx: "bleed" }, { t: T(144), fx: "outro" },
    ...NODES.filter((n) => n.cut && n.t !== SONG.drop && n.t !== T(80)).map((n) => ({ t: n.t, fx: "cut" })),
  ].sort((a, b) => a.t - b.t);

  let runs = [], runsV = -1;
  function buildRuns() {
    runs = [];
    let cur = null;
    for (const n of NODES) {
      if (!cur || n.cut) { cur = { t0: n.t, pts: [] }; runs.push(cur); }
      cur.pts.push({ t: n.t, y: n.y() });
    }
    for (const r of runs) r.m = slopes(r.pts);
    runsV = V.layoutV;
  }
  // Fritsch–Carlson monotone slopes
  function slopes(p) {
    const n = p.length, d = [], m = new Array(n).fill(0);
    if (n < 2) return m;
    for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1].y - p[i].y) / (p[i + 1].t - p[i].t);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return m;
  }
  function desired(t) {
    if (runsV !== V.layoutV) buildRuns();
    let r = runs[0];
    for (const x of runs) { if (x.t0 <= t) r = x; else break; }
    const p = r.pts, last = p.length - 1;
    if (t <= p[0].t) return p[0].y;
    if (t >= p[last].t) return p[last].y;
    let i = 0;
    while (i < last - 1 && p[i + 1].t <= t) i++;
    const h = p[i + 1].t - p[i].t, s = (t - p[i].t) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p[i].y + (s3 - 2 * s2 + s) * h * r.m[i] + (-2 * s3 + 3 * s2) * p[i + 1].y + (s3 - s2) * h * r.m[i + 1];
  }
  const runIndex = (t) => { let k = 0; for (let i = 0; i < runs.length; i++) if (runs[i].t0 <= t) k = i; return k; };

  /* autopilot: on by default. It owns the view (scroll is locked); turning it off takes two
     deliberate clicks and stops everything. */
  const pilot = {
    on: !reduced, entered: false, armed: 0, from: null, at: 0, run: -1, lastHint: 0,
    get driving() { return this.on && this.entered && !track.ended && !track.failed && !!track.el.getAttribute("src"); },
  };

  function glideFromHere() { pilot.from = V.y; pilot.at = performance.now(); }
  function turnOn(msg = true) {
    pilot.on = true;
    pilot.armed = 0;
    if (track.ended) { track.el.currentTime = 0; clock.sync(); reseek(0); }
    glideFromHere();
    pilot.run = -1;
    track.play().catch(() => say("tap play to start the track"));
    if (msg) say("autopilot on — riding the song");
    syncButtons();
  }
  function turnOff() {
    pilot.on = false;
    pilot.armed = 0;
    track.pause();
    say("ruins your experience with it off gng but you do you", 4200);
    syncButtons();
  }
  function autoClick() {
    if (!pilot.on || !pilot.driving) return turnOn();
    const now = performance.now();
    if (pilot.armed && now - pilot.armed < 4000) return turnOff();
    pilot.armed = now;
    say("click autopilot again to turn it off", 4000);
    syncButtons();
    setTimeout(() => { if (pilot.armed && performance.now() - pilot.armed >= 3950) { pilot.armed = 0; syncButtons(); } }, 4000);
  }

  // while autopilot drives, the page doesn't scroll by hand — say how to take over instead
  let deckPeek = 0;
  function hint() {
    if (!pilot.driving) return;
    deckPeek = performance.now();
    const now = performance.now();
    if (now - pilot.lastHint > 5000) { pilot.lastHint = now; say("autopilot's driving — click autopilot off twice to drive yourself", 3200); }
  }
  addEventListener("wheel", (e) => { if (V.auto) { e.preventDefault(); if (Math.abs(e.deltaY) > 4) hint(); } }, { passive: false });
  addEventListener("touchmove", (e) => { if (V.auto && !e.target.closest?.(".deck")) { e.preventDefault(); hint(); } }, { passive: false });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, [role=slider]")) return;
    const scrollKey = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.key) || (e.key === " " && !e.target.closest?.("button, a"));
    if (scrollKey && V.auto) { e.preventDefault(); hint(); }
    if (!pilot.entered || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "a" || e.key === "A") autoClick();
    if (e.key === "m" || e.key === "M") { track.setMuted(!track.muted); syncButtons(); }
  });

  function direct(now) {
    const driving = pilot.driving;
    V.lock(driving);
    if (!driving) return;
    const t = F.t;
    if (runsV !== V.layoutV) buildRuns();
    const ri = runIndex(t);
    if (ri !== pilot.run) { if (pilot.run !== -1 && pilot.from == null) state.snap = true; pilot.run = ri; }
    let y = desired(t);
    if (pilot.from != null) {
      const k = clamp((now - pilot.at) / 1100);
      y = lerp(pilot.from, y, easeIO(k));
      state.snap = false;
      if (k >= 1) pilot.from = null;
    }
    V.target = clamp(y, 0, V.max);
  }
  function cueCrossings(prev, t) {
    if (!pilot.driving || !track.playing || t < prev || t - prev > .5) return;
    for (const c of CUES) if (prev < c.t && t >= c.t) c.fx === "cut" ? fx.cut() : fx.cue(c.fx);
  }

  /* ------------------------------------------------------------------------
     FX: flash, camera, letterbox, blackout, blood, VHS, cuts
     ------------------------------------------------------------------------ */
  class Blood {
    constructor(cv) {
      this.cv = cv; this.c = cv.getContext("2d");
      this.stain = document.createElement("canvas"); this.s = this.stain.getContext("2d");
      this.p = []; this.drips = []; this.alpha = 0; this.on = false; this.since = 0; this.release = false;
      this.resize();
      addEventListener("resize", () => this.resize());
    }
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = innerWidth; this.h = innerHeight;
      for (const cv of [this.cv, this.stain]) { cv.width = Math.round(this.w * this.dpr); cv.height = Math.round(this.h * this.dpr); }
    }
    burst(x, y, n, power) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (380 + Math.pow(Math.random(), .5) * 1900) * power;
        const r = .7 + Math.pow(Math.random(), 3.2) * 10 * (.6 + power * .4);
        this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .8 - 240 * power, r, t: 0, life: .1 + Math.random() * .45 });
      }
      this.on = true; this.release = false; this.alpha = 1; this.since = 0;
      this.cv.classList.add("is-on");
    }
    // a drop hits the glass: an irregular flat stain, stretched along its travel, with specks thrown ahead
    land(q) {
      // keep the headline readable: only fine spray lands across the middle band
      const cx = q.x / this.w, cy = q.y / this.h;
      if (q.r > 2.2 && cx > .1 && cx < .9 && cy > .3 && cy < .72) q.r = .6 + Math.random() * 1.4;
      const s = this.s, d = this.dpr;
      const a = Math.atan2(q.vy, q.vx), sp = Math.hypot(q.vx, q.vy);
      const stretch = 1 + Math.min(1.8, sp / 700), r = q.r;
      s.save(); s.scale(d, d); s.translate(q.x, q.y); s.rotate(a);
      // body
      const g = s.createRadialGradient(-r * .2, 0, 0, 0, 0, r * stretch);
      g.addColorStop(0, "rgba(150,10,22,.95)"); g.addColorStop(.75, "rgba(112,5,14,.95)"); g.addColorStop(1, "rgba(70,2,8,.95)");
      s.fillStyle = g;
      s.beginPath();
      const n = 14;
      for (let k = 0; k <= n; k++) {
        const t = (k / n) * Math.PI * 2, jr = r * (.82 + Math.random() * .36);
        const px = Math.cos(t) * jr * (Math.cos(t) > 0 ? stretch : 1), py = Math.sin(t) * jr;
        k ? s.lineTo(px, py) : s.moveTo(px, py);
      }
      s.closePath(); s.fill();
      // specks + a tapering tail thrown ahead of the impact
      s.fillStyle = "rgba(118,6,15,.92)";
      const specks = r > 1.6 ? 2 + ((Math.random() * 5) | 0) : 0;
      for (let k = 0; k < specks; k++) {
        const dd = r * stretch * (1.2 + Math.random() * 2.2), off = (Math.random() - .5) * r * 1.4;
        s.beginPath(); s.arc(dd, off, Math.max(.4, r * (.08 + Math.random() * .22)), 0, Math.PI * 2); s.fill();
      }
      if (r > 2.5 && sp > 500) {
        s.beginPath(); s.moveTo(r * stretch * .6, -r * .35); s.quadraticCurveTo(r * stretch * 2.4, 0, r * stretch * .6, r * .35); s.fill();
      }
      // a faint wet edge, not a shine
      s.strokeStyle = "rgba(255,120,120,.10)"; s.lineWidth = Math.max(.5, r * .12);
      s.beginPath(); s.ellipse(-r * .15, -r * .1, r * stretch * .7, r * .62, 0, Math.PI * 1.05, Math.PI * 1.6); s.stroke();
      s.restore();
      if (r > 4.5 && Math.random() < .5) this.drips.push({ x: q.x, y: q.y + r * .7, w: Math.max(1.6, r * (.3 + Math.random() * .2)), v: 14 + Math.random() * 60, left: 50 + Math.random() * 240 });
    }
    frame(dt) {
      if (!this.on) return;
      this.since += dt;
      const c = this.c, d = this.dpr;
      for (let i = this.p.length - 1; i >= 0; i--) {
        const q = this.p[i];
        q.t += dt;
        q.vx *= 1 - dt * 1.8; q.vy = q.vy * (1 - dt * 1.8) + 1500 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.t >= q.life) { this.land(q); this.p.splice(i, 1); }
      }
      const s = this.s;
      s.save(); s.scale(d, d); s.lineCap = "round"; s.strokeStyle = "#7a0710";
      for (let i = this.drips.length - 1; i >= 0; i--) {
        const r = this.drips[i];
        const dy = r.v * dt;
        s.lineWidth = r.w;
        s.strokeStyle = "rgba(112,5,14,.9)";
        s.beginPath(); s.moveTo(r.x, r.y); s.lineTo(r.x + Math.sin(r.y * .05) * .3, r.y + dy); s.stroke();
        r.y += dy; r.left -= dy; r.v *= 1 - dt * .25; r.w *= 1 - dt * .05;
        if (r.left <= 0 || r.v < 4) this.drips.splice(i, 1);
      }
      s.restore();
      if (this.release) this.alpha -= dt / 1.1;
      if (this.alpha <= 0) { this.clear(); return; }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      c.globalAlpha = this.alpha;
      c.drawImage(this.stain, 0, 0);
      c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = "rgba(120,6,15,.95)";
      for (const r of this.drips) { c.beginPath(); c.ellipse(r.x, r.y, r.w * .62, r.w * .8, 0, 0, Math.PI * 2); c.fill(); }
      for (const q of this.p) {
        const sp = Math.hypot(q.vx, q.vy), len = q.r + sp * .014, a = Math.atan2(q.vy, q.vx);
        c.save(); c.translate(q.x, q.y); c.rotate(a);
        c.fillStyle = "rgba(140,8,20,.95)";
        c.beginPath(); c.ellipse(0, 0, len, q.r * .8, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }
    clear() {
      this.on = false; this.p.length = 0; this.drips.length = 0; this.alpha = 0;
      this.s.clearRect(0, 0, this.stain.width, this.stain.height);
      this.c.setTransform(1, 0, 0, 1, 0, 0);
      this.c.clearRect(0, 0, this.cv.width, this.cv.height);
      this.cv.classList.remove("is-on");
    }
  }
  const blood = new Blood($("#bloodfx"));

  const fxEls = {
    flash: $(".fx__flash"), black: $(".fx__black"), vhs: $(".fx__vhs"), tc: $("#vhsTc"),
    capT: $("#capTop"), capB: $("#capBot"), main: $("main"), fx: $(".fx"),
  };
  const fx = {
    flash: 0, flashRed: 0, shake: 0, punch: 0, rewind: 0, hitUntil: 0,
    flashOn(v, red = .6) { this.flash = Math.max(this.flash, v); this.flashRed = red; },
    shakeOn(v) { if (!reduced) this.shake = Math.max(this.shake, v); },
    hit(ms = 900) {
      root.classList.add("is-hit");
      clearTimeout(this._hit);
      this._hit = setTimeout(() => root.classList.remove("is-hit"), ms);
    },
    cut() {
      this.flashOn(.32, .1);
      fx.glitch = 1;
      root.classList.remove("is-cut"); void root.offsetWidth; root.classList.add("is-cut");
      clearTimeout(this._cut);
      this._cut = setTimeout(() => root.classList.remove("is-cut"), 220);
    },
    glitch: 0,
    cue(name) {
      if (name === "808") { this.flashOn(.22, .3); this.shakeOn(9); }
      if (name === "rewind") { this.rewind = 1; root.classList.add("is-rewind"); }
      if (name === "slam") { this.rewindEnd(); }
      if (name === "bleed") { blood.burst(innerWidth / 2, innerHeight * .45, 80, .75); this.flashOn(.6, 1); this.shakeOn(14); this.hit(600); }
      if (name === "outro") { root.classList.add("is-outro"); }
    },
    rewindEnd() { this.rewind = 0; root.classList.remove("is-rewind"); },
  };

  function onDrop(i) {
    F.drop = 1;
    F.shock = 0;
    F.dropIdx = i;
    meters.deck?.burst(10, true, true);
    meters.stage?.burst(60, false, true);
    if (i === 0) {
      const sagaRect = scenes.saga.getBoundingClientRect();
      const onTakedown = pilot.driving || (sagaRect.top < innerHeight * .5 && sagaRect.bottom > innerHeight * .5);
      if (onTakedown) {
        fx.flashOn(1, 1);
        fx.shakeOn(30);
        fx.hit(1100);
        const cx = innerWidth / 2, cy = innerHeight * .46;
        blood.burst(cx, cy, 170, 1);
        setTimeout(() => blood.burst(innerWidth * (.06 + Math.random() * .14), innerHeight * (.12 + Math.random() * .2), 45, .7), 70);
        setTimeout(() => blood.burst(innerWidth * (.8 + Math.random() * .14), innerHeight * (.15 + Math.random() * .3), 50, .75), 140);
        setTimeout(() => blood.burst(innerWidth * (.2 + Math.random() * .6), innerHeight * .9, 35, .6), 210);
        navigator.vibrate?.([70, 40, 160]);
      } else { fx.flashOn(.4, 1); fx.shakeOn(10); }
    } else if (i === 1) {
      fx.flashOn(.85, .35); fx.shakeOn(pilot.driving ? 22 : 8); fx.hit(700);
      $("#stage")?.classList.remove("is-slam"); void root.offsetWidth; $("#stage")?.classList.add("is-slam");
    } else {
      fx.rewindEnd();
      fx.flashOn(1, .5); fx.shakeOn(pilot.driving ? 26 : 9); fx.hit(900);
      const h = $(".hero");
      h.classList.remove("is-slam"); void h.offsetWidth; h.classList.add("is-slam");
      navigator.vibrate?.([60, 30, 90]);
    }
  }

  function onEnded() {
    root.classList.remove("is-outro");
    pilot.run = -1;
    syncButtons();
    say("that's the track — hit replay in the player to run it back");
  }

  function camera(dt) {
    fx.flash = decay(fx.flash, dt, .16);
    fx.shake = decay(fx.shake, dt, .3);
    fx.glitch = decay(fx.glitch, dt, .08);
    const drops = F.section.kind === "drop" && pilot.driving;
    if (drops && F.kick > .9 && !reduced) fx.punch = Math.max(fx.punch, .55);
    fx.punch = decay(fx.punch, dt, .12);

    // flash: white on the hit, bleeding to red
    const fl = clamp(fx.flash);
    fxEls.flash.style.opacity = fl.toFixed(3);
    if (fl > .01) fxEls.flash.style.background = `rgb(255, ${Math.round(255 - fx.flashRed * (1 - fl) * 230)}, ${Math.round(255 - fx.flashRed * (1 - fl) * 225)})`;

    // camera: shake + push-in on the run-up + a punch on the kicks during drops
    const sh = fx.shake;
    const zoom = reduced ? 0 : (pilot.driving ? F.tension * .045 : F.tension * .015) + fx.punch * .012;
    const cam = V.cam, tt = performance.now() / 1000;
    if (sh > .3) {
      cam.x = sh * (Math.sin(tt * 71) * .6 + Math.sin(tt * 113) * .4);
      cam.y = sh * (Math.cos(tt * 83) * .6 + Math.sin(tt * 57) * .4) * .7;
      cam.r = sh * .012 * Math.sin(tt * 47);
    } else { cam.x = cam.y = cam.r = 0; }
    cam.s = zoom > .0005 ? 1 + zoom : 1;

    // letterbox + captions
    if (fx.rewind && (!track.playing || F.t < T(111) || F.t >= T(112))) fx.rewindEnd();
    let lb = F.tension * (pilot.driving ? 11 : 5);
    if (fx.rewind) lb = Math.max(lb, 6);
    fxEls.fx.style.setProperty("--lb", `${lb.toFixed(2)}vh`);
    const showCaps = lb > 3.2;
    fxEls.fx.classList.toggle("has-caps", showCaps);
    if (showCaps) {
      const next = F.t < SONG.drop ? "the takedown" : F.t < T(80) ? "drop ii" : "drop iii";
      fxEls.capT.textContent = fx.rewind ? "◀◀ rewind" : F.t < SONG.drop ? "chapter ii — the sign" : "now playing";
      fxEls.capB.textContent = F.countdown != null ? `${next} in ${F.countdown.toFixed(2)}s` : "";
    }

    // the silence before the drop: blackout + flatline
    const dark = track.playing && F.t >= SONG.silence[0] && F.t < SONG.drop;
    root.classList.toggle("is-blackout", dark);
    fxEls.black.style.opacity = dark ? (pilot.driving ? .96 : .6) : 0;

    // VHS rewind
    if (fx.rewind) fxEls.tc.textContent = `${String(Math.max(0, Math.round(V.y / 7))).padStart(5, "0")}  ◀◀`;

    // blood on the glass: let go once the takedown is off screen
    blood.frame(dt);
    if (blood.on && !blood.release && blood.since > 1.6 && (state.blood < .3 || saga.active !== 2)) blood.release = true;

    root.classList.toggle("is-gap", F.gap);
  }

  /* ------------------------------------------------------------------------
     Deck (corner player) + stage (now playing)
     ------------------------------------------------------------------------ */
  const deck = {
    el: $("#deck"), play: $("#deckPlay"), auto: $("#deckAuto"), mute: $("#deckMute"),
    time: $("#deckTime"), sec: $("#deckSec"), db: $("#deckDb"),
    scrub: $("#deckScrub"), on: $("#deckWaveOn"), base: $("#deckWave"), head: $("#deckHead"), wrap: $("#deckMeterWrap"),
  };
  const meters = {
    deck: $("#deckMeter") ? new ArcMeter($("#deckMeter")) : null,
    stage: $("#stageMeter") ? new ArcMeter($("#stageMeter"), { big: true }) : null,
  };
  const spring = { deck: { x: 0, v: 0 }, stage: { x: 0, v: 0 } };
  function springTo(s, target, dt, k = 260, c = 15) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
    return s.x;
  }

  // the scrubber: the whole song's loudness, coloured by section, drops marked
  function drawWave() {
    for (const [cvs, lit] of [[deck.base, false], [deck.on, true]]) {
      if (!cvs) continue;
      const r = { width: cvs.clientWidth, height: cvs.clientHeight };
      if (!r.width) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = Math.round(r.width * dpr); cvs.height = Math.round(r.height * dpr);
      const c = cvs.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = r.width, H = r.height, n = Math.floor(W / 3);
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * SONG.duration, t1 = ((i + 1) / n) * SONG.duration;
        let m = 0;
        for (let k = Math.floor(t0 / SONG.env.dt); k < Math.ceil(t1 / SONG.env.dt) && k < ENV.length; k++) m = Math.max(m, ENV[k]);
        const v = Math.pow(m / 255, 1.8), h = Math.max(1.5, v * (H - 4));
        const sec = SONG.sections.find((s) => t0 >= s.from && t0 < s.to) || SONG.sections[0];
        c.fillStyle = lit
          ? sec.kind === "drop" ? "#ff3b3b" : sec.kind === "build" ? "#ff8a3d" : sec.kind === "flow" ? "#a08cff" : "#efebe4"
          : "rgba(239,235,228,.22)";
        c.fillRect(i * 3, (H - h) / 2, 2, h);
      }
      c.fillStyle = lit ? "#ffffff" : "rgba(255,59,59,.85)";
      for (const d of DROPS) { const x = (d / SONG.duration) * W; c.fillRect(Math.round(x) - .5, 0, 1, H); }
    }
  }

  function syncButtons() {
    const playing = track.playing || track.waiting;
    deck.play?.setAttribute("aria-label", playing ? "Pause" : track.ended ? "Replay" : "Play");
    deck.play?.classList.toggle("is-playing", playing);
    deck.play?.classList.toggle("is-ended", track.ended);
    const autoOn = pilot.on;
    deck.auto?.setAttribute("aria-pressed", String(autoOn));
    deck.auto?.classList.toggle("is-on", autoOn);
    deck.auto?.classList.toggle("is-armed", !!pilot.armed);
    const lab = deck.auto?.querySelector("span");
    if (lab) lab.textContent = pilot.armed ? "click again" : "autopilot";
    deck.mute?.setAttribute("aria-label", track.muted ? "Unmute" : "Mute");
    deck.mute?.classList.toggle("is-muted", track.muted);
    const sp = $("#stagePlay");
    if (sp) sp.textContent = playing ? "pause" : track.ended ? "replay" : "play the track";
    const np = $("#npChip");
    np?.classList.toggle("is-playing", playing);
    np?.setAttribute("aria-label", playing ? "Pause the track" : "Play the track");
    root.classList.toggle("is-playing", playing);
  }
  ["playing", "pause", "ended", "waiting", "loadstart"].forEach((ev) => track.el.addEventListener(ev, syncButtons));

  function togglePlay() {
    if (track.playing || track.waiting) track.pause();
    else if (pilot.on && (track.ended || !pilot.driving)) turnOn(false);
    else track.play().catch(() => say("couldn't start the track — tap again"));
    syncButtons();
  }
  deck.play?.addEventListener("click", togglePlay);
  $("#stagePlay")?.addEventListener("click", togglePlay);
  $("#npChip")?.addEventListener("click", togglePlay);
  deck.mute?.addEventListener("click", () => { track.setMuted(!track.muted); syncButtons(); });
  deck.auto?.addEventListener("click", autoClick);

  // seeking
  function seekTo(t) {
    t = clamp(t, 0, SONG.duration - .05);
    track.el.currentTime = t;
    track.ended = false;
    clock.sync();
    F.t = t;
    reseek(t);
    blood.release = true;
    fx.rewindEnd();
    root.classList.remove("is-outro");
    if (pilot.on) { glideFromHere(); pilot.run = -1; }
    if (!track.playing && pilot.on) track.play().catch(() => {});
    syncButtons();
  }
  if (deck.scrub) {
    let drag = false;
    const at = (e) => { const r = deck.scrub.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * SONG.duration; };
    deck.scrub.addEventListener("pointerdown", (e) => { drag = true; deck.scrub.setPointerCapture(e.pointerId); seekTo(at(e)); });
    deck.scrub.addEventListener("pointermove", (e) => {
      const r = deck.scrub.getBoundingClientRect();
      deck.scrub.style.setProperty("--hx", `${clamp((e.clientX - r.left) / r.width) * 100}%`);
      deck.scrub.dataset.tip = mmss(at(e));
      if (drag) seekTo(at(e));
    });
    deck.scrub.addEventListener("pointerup", () => (drag = false));
    deck.scrub.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); seekTo(F.t + 5); }
      if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(F.t - 5); }
    });
  }

  const stageEl = $("#stage"), stageWrap = $("#stageMeterWrap");
  let lastUi = 0, lastSec = "", peakDb = -90, peakAt = 0, lastAvoid = 0, blocked = false;
  // the deck steps aside rather than sit on top of a button someone came here to press
  function coversCta() {
    if (!deck.el) return false;
    const w = deck.el.offsetWidth, h = deck.el.offsetHeight, cs = getComputedStyle(deck.el);
    const L = parseFloat(cs.left) || 0, B = innerHeight - (parseFloat(cs.bottom) || 0), T = B - h, R = L + w;
    for (const el of $$(".dc__actions, .foot__links, .stage__meta")) {
      const r = el.getBoundingClientRect();
      if (r.right > L && r.left < R && r.bottom > T - 8 && r.top < B) return true;
    }
    return false;
  }
  function ui(now, dt) {
    const hot = root.classList.contains("blood") ? 1 : F.section.kind === "drop" && F.drop > .2 ? 1 : 0;
    const sr = stageEl?.getBoundingClientRect();
    const stageSeen = sr && sr.bottom > 0 && sr.top < innerHeight;
    const onStage = sr && sr.top < innerHeight * .35 && sr.bottom > innerHeight * .65;   // the big meter has the floor
    if (now - lastAvoid > 150) { lastAvoid = now; blocked = coversCta(); }
    const peek = now - deckPeek < 4000;   // someone tried to scroll: show them where the controls are
    const showDeck = pilot.entered && (peek || (V.y > innerHeight * .42 && !onStage && !blocked));
    root.classList.toggle("has-deck", showDeck);

    // meters: the deck one always, the stage one while it's on screen
    const mf = { spec: F.spec, db: F.db, kick: F.kick, drop: F.drop, hot, on: F.on && !F.gap, dt };
    if (meters.deck && showDeck) {
      meters.deck.draw(mf);
      const s = springTo(spring.deck, reduced ? 0 : F.level * .05 + F.kick * .07 + F.drop * .14, dt);
      deck.wrap.style.transform = `scale(${(1 + s).toFixed(4)})`;
    }
    if (meters.stage && stageSeen) {
      {
        meters.stage.draw(mf);
        const s = springTo(spring.stage, reduced ? 0 : F.level * .07 + F.kick * .1 + F.drop * .22, dt, 220, 13);
        stageWrap.style.transform = `scale(${(1 + s).toFixed(4)})`;
      }
    }

    // scrub head
    const p = clamp(F.t / SONG.duration);
    if (deck.on) deck.on.style.clipPath = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`;
    if (deck.head) deck.head.style.transform = `translateX(${(p * (deck.scrub.clientWidth || 0)).toFixed(1)}px)`;

    if (F.db > peakDb || now - peakAt > 2500) { peakDb = F.db; peakAt = now; }

    // text readouts, 12×/s
    if (now - lastUi < 80) return;
    lastUi = now;
    const dbTxt = F.on && F.db > -60 ? F.db.toFixed(1).replace("-", "−") : "−∞";
    setText("deckDb", dbTxt);
    setText("deckTime", mmss(F.t));
    let sec = F.section.name;
    if (F.countdown != null && F.countdown < 6) sec = `drop in ${F.countdown.toFixed(1)}`;
    else if (track.waiting) sec = "buffering…";
    else if (!F.on) sec = track.ended ? "the end" : "paused";
    if (sec !== lastSec) { setText("deckSec", sec); lastSec = sec; }
    deck.scrub?.setAttribute("aria-valuenow", Math.round(F.t));
    deck.scrub?.setAttribute("aria-valuetext", mmss(F.t));
    setText("stageDb", dbTxt);
    setText("stagePeak", F.on && peakDb > -60 ? peakDb.toFixed(1).replace("-", "−") : "−∞");
    setText("stageBar", `${Math.max(1, F.bar + 1)}.${F.inBar + 1}`);
    setText("stageSec", F.on ? F.section.name : track.ended ? "the end" : "paused");
    setText("stageTime", mmss(F.t));
  }

  // CSS hooks: each var is written only on the elements whose styles read it, and only while their
  // section is on screen — writing them on containers (or <html>) restyles hundreds of nodes a frame
  const HOSTS = {
    kick: [".nav", ".bloodwash", "#splats", ".saga__stamp", "#sagaChart", "#npChip", ".stage__bg", ".stage__live", ".stage__title"],
    beat: ["#deckAuto", ".stage__bg"],
    level: ["#npChip", "#dcDuo"],
    hat: [".grain", "#npChip"],
    snare: ["#npChip"],
    tension: [".grain", ".nav"],
  };
  const hostEls = new Map();
  for (const [k, list] of Object.entries(HOSTS)) for (const q of list) {
    const el = $(q);
    if (!el) continue;
    const sec = el.closest("main > section, main > footer");
    if (!hostEls.has(el)) hostEls.set(el, { sec, top: 0, bot: 0, vars: {} });
    hostEls.get(el).vars[k] = -1;
  }
  let hostsV = -1;
  function cssVars() {
    if (hostsV !== V.layoutV) {
      hostsV = V.layoutV;
      for (const h of hostEls.values()) if (h.sec) { h.top = window.SITE.docTop(h.sec); h.bot = h.top + h.sec.offsetHeight; }
    }
    const live = F.on && !F.gap;
    const next = { kick: live ? F.kick : 0, beat: live ? F.beat : 0, level: live ? F.level : 0, hat: live ? F.hat : 0, snare: live ? F.snare : 0, tension: F.tension };
    const y0 = V.y - innerHeight * .5, y1 = V.y + innerHeight * 1.5;
    for (const [el, h] of hostEls) {
      if (h.sec && (h.bot < y0 || h.top > y1)) continue;
      for (const k in h.vars) {
        const v = Math.round(next[k] * 1000) / 1000;
        if (h.vars[k] === v) continue;
        h.vars[k] = v;
        el.style.setProperty(`--${k}`, v);
      }
    }
  }

  listeners.kick.push((s) => { meters.deck?.kick(s); meters.stage?.kick(s); });

  // lock screen / OS media controls
  function mediaSession() {
    const ms = navigator.mediaSession;
    if (!ms || !window.MediaMetadata) return;
    ms.metadata = new MediaMetadata({ title: SONG.title, artist: SONG.artist, album: "finalarc", artwork: [{ src: new URL(SONG.cover, location.href).href, sizes: "640x640", type: "image/jpeg" }] });
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
    set("play", () => { track.play().catch(() => {}); });
    set("pause", () => track.pause());
    set("seekto", (d) => seekTo(d.seekTime));
    set("seekbackward", () => seekTo(F.t - 10));
    set("seekforward", () => seekTo(F.t + 10));
  }

  /* ------------------------------------------------------------------------
     Public face for main.js
     ------------------------------------------------------------------------ */
  let flow = 0;
  window.SHOW = {
    F, track, pilot,
    get driving() { return pilot.driving; },
    get ready() { return track.ready; },
    buffered: () => track.buffered(),
    enter(sound) {
      pilot.entered = true;
      mediaSession();
      if (!sound) { pilot.on = false; syncButtons(); return; }
      pilot.on = !reduced;
      pilot.run = -1;
      track.play().then(syncButtons).catch((e) => {
        console.warn("play", e);
        pilot.on = false;            // never leave a locked, silent page
        say("tap play in the player to start the track");
        syncButtons();
      });
    },
    // nav links while autopilot drives: jump the show to that part of the song
    goto(hash) {
      if (!pilot.driving) return false;
      const at = { "#top": 0, "#stats": T(8), "#game": T(12), "#closet": T(36), "#vault": T(64), "#stage": T(80), "#discord": T(104) }[hash];
      if (at == null) return false;
      seekTo(at);
      return true;
    },
    get fx() { return fx; },
    unlock() { track.wire(); track.ctx?.resume?.(); },
    onNextBeat(fn) {
      if (!track.playing || reduced) return fn();
      beatQueue.push(fn);
      // never strand anything: if the beat doesn't come (pause, stall) it lands anyway
      setTimeout(() => { const i = beatQueue.indexOf(fn); if (i >= 0) { beatQueue.splice(i, 1); fn(); } }, BEAT * 1000 + 80);
    },
    preFrame(now, dt) {
      features(now, dt);
      direct(now);
    },
    postFrame(now, dt) {
      camera(dt);
      ui(now, dt);
      cssVars();
      flow += dt * (F.gap ? 0 : 1 + (F.on ? F.level * .9 + F.tension * 1.6 : 0));
    },
    gl() {
      return {
        flow, spec: F.u8, kick: F.on && !F.gap ? F.kick : 0, level: F.on && !F.gap ? F.level : 0,
        tension: F.tension, drop: F.drop, shock: F.shock, rewind: Math.max(fx.rewind, fx.glitch), audio: F.on && !F.gap ? 1 : 0,
        dark: root.classList.contains("is-blackout") ? 1 : 0,
      };
    },
    resize() { meters.deck?.resize(); meters.stage?.resize(); drawWave(); },
  };

  addEventListener("resize", () => window.SHOW.resize());
  document.fonts?.ready.then(() => window.SHOW.resize());
  requestAnimationFrame(() => window.SHOW.resize());
  syncButtons();
})();
