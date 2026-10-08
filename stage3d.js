/* ==========================================================================
   finalarc — the 3d world
   Your Roblox avatar, live in 3d on top of the page and choreographed to the
   song: it spawns in a forcefield, poses on every stutter of the intro, rides
   the player chart, gets hit by the ban hammer on the drop, comes back and
   flips Roblox off with an army of clones and noobs behind it, headbangs
   through drop ii, and oofs into bricks at the end.
     • avatar: the real mesh if it has been baked into avatar/ (see
       tools/fetch-avatar.mjs), otherwise a blocky R6 built from your live body
       colours, headless/korblox and hats
     • everything is built, uploaded and compiled behind the gate (LOAD "three"
       and "avatar"), so nothing loads or compiles mid-show
     • with autopilot off it calms down: idles in the hero, models the fit in
       the avatar scene, sits on the player
   ========================================================================== */
import * as THREE from "./vendor/three.module.min.js";
import { OBJLoader } from "./vendor/OBJLoader.js";
import { buildR6, rigFromObj, CLIPS, Rig } from "./rig.js";

const SITE = window.SITE, SONG = window.SONG, LOAD = window.LOAD;
const canvas = document.getElementById("stage3d"), labels = document.getElementById("labels3d");

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!SITE || !LOAD || !canvas) {
  LOAD?.done("three", "off"); LOAD?.done("avatar", "2d");
} else {
  boot().catch((e) => {
    console.warn("3d", e);
    LOAD.done("three", "off"); LOAD.done("avatar", "2d");
    canvas.remove();
  });
}

async function boot() {
  const BEAT = 60 / (SONG?.bpm || 132), BAR = BEAT * 4;
  const T = (n) => (SONG?.offset || 0) + n * BAR;
  const DROP = SONG?.drop ?? T(16), SIL = SONG?.silence ?? [DROP - .44, DROP];
  const V = SITE.view;

  /* ------------------------------------------------------------------------
     Renderer, camera, lights
     ------------------------------------------------------------------------ */
  LOAD.set("three", .2, "starting webgl");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: devicePixelRatio < 2, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const FOV = 30, D = 24, TAN = Math.tan((FOV / 2) * Math.PI / 180);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .5, 200);
  camera.position.set(0, 0, D);

  scene.add(new THREE.HemisphereLight(0xfff4ee, 0x30080c, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-6, 9, 14); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2d3d, 3.2); rim.position.set(9, 5, -10); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fa6ff, .55); fill.position.set(10, -3, 9); scene.add(fill);
  const flash = new THREE.PointLight(0xff2030, 0, 60, 1.2); flash.position.set(0, 0, 8); scene.add(flash);

  let W = 1, H = 1, P = false, tier = 2;
  function resize() {
    W = innerWidth; H = innerHeight; P = W < 760 || W < H * .85;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, [1, 1.25, 1.75][tier]));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  // screen px ⇄ world: the camera looks straight down -z, so at depth z one px is u(z) world units
  const u = (z = 0) => (2 * (D - z) * TAN) / H;
  const toWorld = (px, py, z = 0, out = new THREE.Vector3()) => { const k = u(z); return out.set((px - W / 2) * k, (H / 2 - py) * k, z); };
  const proj = new THREE.Vector3();
  const toScreen = (v) => { proj.copy(v).project(camera); return { x: (proj.x * .5 + .5) * W, y: (-proj.y * .5 + .5) * H, z: proj.z }; };
  LOAD.set("three", .5, "webgl");

  /* ------------------------------------------------------------------------
     Shared pieces: blob shadow, forcefield, debris, shockwave
     ------------------------------------------------------------------------ */
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(.55, "rgba(0,0,0,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: .8 });

  // the Roblox spawn forcefield: a blue fresnel shell full of white sparkles
  const ffGeo = new THREE.SphereGeometry(1, 32, 20);
  const ffMaterial = () => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 q = vP * 7. + vec3(0., uT * 1.6, 0.);
        vec3 c = floor(q); float r = h(c); vec3 l = fract(q) - .5;
        float s = step(.9, r) * smoothstep(.32, 0., length(l)) * (.5 + .5 * sin(uT * 9. + r * 60.));
        vec3 col = mix(vec3(.2, .5, 1.), vec3(1.), clamp(s * 1.4 + f * .3, 0., 1.));
        float a = (f * .9 + s * 1.2 + .05) * uA;
        gl_FragColor = vec4(col * a, a);
      }`,
  });

  // bricks: the game getting smashed, and anyone who oofs
  const MAXD = 260;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .62, metalness: .05 }), MAXD);
  debris.frustumCulled = false;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dbP = new Float32Array(MAXD * 3), dbV = new Float32Array(MAXD * 3), dbR = new Float32Array(MAXD * 3), dbW = new Float32Array(MAXD * 3), dbS = new Float32Array(MAXD), dbL = new Float32Array(MAXD);
  const BRICKS = ["#a3a2a5", "#635f62", "#c4281c", "#ff2433", "#1b1b1f", "#e8e8ea", "#da8541"].map((c) => new THREE.Color(c));
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  for (let i = 0; i < MAXD; i++) { debris.setColorAt(i, BRICKS[i % BRICKS.length]); tmpM.makeScale(0, 0, 0); debris.setMatrixAt(i, tmpM); }
  scene.add(debris);
  let dbCursor = 0, dbLive = 0, dbMax = MAXD;
  function burst(at, n, { speed = 12, up = 10, size = .5, spread = 1, colors = null } = {}) {
    n = Math.round(n * dbMax / MAXD);
    for (let k = 0; k < n; k++) {
      const i = dbCursor; dbCursor = (dbCursor + 1) % MAXD;
      const a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .8);
      dbP[i * 3] = at.x + (Math.random() - .5) * spread; dbP[i * 3 + 1] = at.y + (Math.random() - .5) * spread * .5; dbP[i * 3 + 2] = at.z + (Math.random() - .5) * spread;
      dbV[i * 3] = Math.cos(a) * s; dbV[i * 3 + 1] = Math.abs(Math.sin(a)) * s * .6 + up * (.4 + Math.random() * .8); dbV[i * 3 + 2] = (Math.random() - .3) * s * .6;
      for (let j = 0; j < 3; j++) { dbR[i * 3 + j] = Math.random() * 6; dbW[i * 3 + j] = (Math.random() - .5) * 18; }
      dbS[i] = size * (.35 + Math.random() * .9);
      dbL[i] = 2.4 + Math.random();
      dbLive = Math.max(dbLive, dbL[i] + .1);
      if (colors) debris.setColorAt(i, colors[k % colors.length]);
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  function stepDebris(dt) {
    if (dbLive <= 0) return false;
    dbLive -= dt;
    const g = 30;
    for (let i = 0; i < MAXD; i++) {
      if (dbL[i] <= 0) continue;
      dbL[i] -= dt;
      if (dbL[i] <= 0) { debris.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
      dbV[i * 3 + 1] -= g * dt;
      for (let j = 0; j < 3; j++) { dbP[i * 3 + j] += dbV[i * 3 + j] * dt; dbR[i * 3 + j] += dbW[i * 3 + j] * dt; }
      const s = dbL[i] > 0 ? dbS[i] * Math.min(1, dbL[i] * 3) : 0;
      tmpQ.setFromEuler(tmpE.set(dbR[i * 3], dbR[i * 3 + 1], dbR[i * 3 + 2]));
      tmpM.compose(tmpP.set(dbP[i * 3], dbP[i * 3 + 1], dbP[i * 3 + 2]), tmpQ, tmpS.set(s, s * .6, s));
      debris.setMatrixAt(i, tmpM);
    }
    debris.instanceMatrix.needsUpdate = true;
    return true;
  }

  // shockwave rings
  const rings = [0, 1].map((i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 72), new THREE.MeshBasicMaterial({ color: i ? 0xff2433 : 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; m.userData = { t0: -9, delay: i * .07 }; scene.add(m);
    return m;
  });
  let ringAt = new THREE.Vector3(), ringT = -9, ringSize = 8;
  function shock(at, size) { ringAt.copy(at); ringT = performance.now() / 1000; ringSize = size; }
  function stepRings(now) {
    let any = false;
    for (const r of rings) {
      const k = (now - ringT - r.userData.delay) / .55;
      r.visible = k >= 0 && k < 1;
      if (!r.visible) continue;
      any = true;
      const s = ringSize * easeOut(k) + .2;
      r.position.copy(ringAt); r.scale.set(s, s * .62, 1);
      r.material.opacity = (1 - k) * .9;
    }
    return any;
  }
  let shake = 0;

  /* ------------------------------------------------------------------------
     Actors: one rigged character + its shadow, forcefield and oof parts
     ------------------------------------------------------------------------ */
  const world = new THREE.Group();
  scene.add(world);
  const loose = new THREE.Group();   // body parts mid-oof
  scene.add(loose);

  class Actor {
    constructor(rigRoot, name) {
      this.name = name;
      this.root = rigRoot;
      this.rig = new Rig(rigRoot);
      this.top = rigRoot.userData.top || 5.3;
      this.g = new THREE.Group();
      this.g.add(rigRoot);
      this.g.visible = false;
      this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.scale.set(3.4, 2, 1); this.shadow.position.y = .03;
      this.g.add(this.shadow);
      this.ff = new THREE.Mesh(ffGeo, ffMaterial());
      this.ff.position.y = 2.7; this.ff.scale.set(2.4, 3.15, 2.4); this.ff.visible = false;
      this.g.add(this.ff);
      world.add(this.g);
      this.pos = new THREE.Vector3(); this.s = 1; this.yaw = 0; this.spin = 0;
      this.mode = null; this.key = null; this.clock = null;
      this.tc = Math.random() * 9; this.landAt = -9; this.ffAt = -9; this.ffDur = 0; this.hidden = true;
      this.parts = [];
      rigRoot.traverse((o) => { if (o.isMesh) this.parts.push({ m: o, parent: o.parent, p: o.position.clone(), q: o.quaternion.clone(), sc: o.scale.clone(), v: new THREE.Vector3(), w: new THREE.Vector3() }); });
      this.broken = 0;
    }
    forcefield(dur) { this.ffAt = performance.now() / 1000; this.ffDur = dur; }
    // classic oof: every part flies off on its own
    breakApart(power = 1) {
      if (this.broken) return;
      this.broken = performance.now() / 1000;
      this.g.updateMatrixWorld(true);
      const c = this.g.localToWorld(new THREE.Vector3(0, 2.6, 0));
      for (const p of this.parts) {
        if (!p.m.parent) continue;
        loose.attach(p.m);
        p.m.visible = true;
        const d = p.m.getWorldPosition(new THREE.Vector3()).sub(c);
        d.z += .6; d.normalize();
        p.v.copy(d).multiplyScalar((7 + Math.random() * 7) * power * this.s).add(new THREE.Vector3(0, (6 + Math.random() * 6) * power * this.s, 0));
        p.w.set((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14);
      }
    }
    reassemble() {
      if (!this.broken) return;
      this.broken = 0;
      for (const p of this.parts) { p.parent.add(p.m); p.m.position.copy(p.p); p.m.quaternion.copy(p.q); p.m.scale.copy(p.sc); }
    }
    stepParts(dt) {
      if (!this.broken) return false;
      for (const p of this.parts) {
        p.v.y -= 30 * this.s * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += p.w.x * dt; p.m.rotation.y += p.w.y * dt; p.m.rotation.z += p.w.z * dt;
      }
      return performance.now() / 1000 - this.broken < 3;
    }
  }

  /* ------------------------------------------------------------------------
     The avatar: baked mesh → live body colours → defaults
     ------------------------------------------------------------------------ */
  LOAD.done("three");
  LOAD.set("avatar", .05, "looking for your avatar");
  const look = await avatarLook();
  let heroRoot = null;
  try { heroRoot = await bakedAvatar("avatar/"); } catch (e) { if (!/404|missing/.test(String(e.message))) console.warn("baked avatar", e); }
  const real = !!heroRoot;
  if (!heroRoot) heroRoot = buildR6(look);
  LOAD.set("avatar", .7, "rigging");
  const hero = new Actor(heroRoot, "you");

  // the army: clones of you and classic noobs
  const NOOB = { head: "#f5cd30", armL: "#f5cd30", armR: "#f5cd30", torso: "#0d69ac", legL: "#a4bd47", legR: "#a4bd47" };
  const ARMY_MAX = 10;
  const army = [];
  for (let i = 0; i < ARMY_MAX; i++) {
    const r = i % 2 === 0 ? (real ? cloneRig(heroRoot) : buildR6(look)) : buildR6({ colors: NOOB });
    army.push(new Actor(r, i % 2 ? "noob" : "clone"));
  }
  let armyN = ARMY_MAX;

  /* ------------------------------------------------------------------------
     The ban hammer
     ------------------------------------------------------------------------ */
  const hammer = buildHammer();
  scene.add(hammer.pivot);

  /* ------------------------------------------------------------------------
     Labels: chat bubbles + nametag (Roblox style) and the OOF
     ------------------------------------------------------------------------ */
  const mk = (cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; labels.append(d); return d; };
  const bubble = mk("bubble3d"), hBubble = mk("bubble3d bubble3d--sys"), tag = mk("tag3d"), oofEl = mk("oof3d", "OOF");
  SITE.data?.then((d) => { tag.textContent = d?.user?.displayName || d?.user?.name || "finalarc"; });
  tag.textContent = "finalarc";
  const labelState = new Map();
  function placeLabel(el, x, y, on, text) {
    let s = labelState.get(el);
    if (!s) { s = { x: -1, y: -1, on: null, text: null }; labelState.set(el, s); }
    if (text != null && text !== s.text) { s.text = text; el.textContent = text; }
    if (on !== s.on) { s.on = on; el.classList.toggle("is-on", on); }
    if (on && (Math.abs(x - s.x) > .4 || Math.abs(y - s.y) > .4)) { s.x = x; s.y = y; el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`; }
  }

  /* ------------------------------------------------------------------------
     Anchors: where on screen (px) a character stands — feet x/y and height
     ------------------------------------------------------------------------ */
  const $ = (s) => document.querySelector(s);
  const el = { hero: $("#hero"), deck: $("#deck"), avStage: $(".avatar__stage"), avatar: SITE.scenes?.avatar, chart: $("#sagaChart") };
  let frameRects = new Map();
  const rect = (e) => { if (!e) return null; let r = frameRects.get(e); if (!r) { r = e.getBoundingClientRect(); frameRects.set(e, r); } return r; };
  const hasDeck = () => root.classList.contains("has-deck");
  const A = {
    hero: () => { const top = (el.hero ? SITE.docTop(el.hero) : 0) - V.y; return P ? { x: W * .74, y: top + H * .985, h: H * .3 } : { x: W * .6, y: top + H * .99, h: H * .5 }; },
    deck: () => {
      if (!hasDeck()) return A.corner();
      const r = rect(el.deck), h = clamp(H * .19, 96, 168);
      return { x: r.left + r.width * (P ? .86 : .82), y: r.top + h * (2 / 5.2) - 2, h };
    },
    corner: () => ({ x: W - Math.min(W * .14, 150), y: H * .985, h: clamp(H * .24, 110, 210) }),
    cornerL: () => ({ x: Math.min(W * .16, 190), y: H * .985, h: H * (P ? .26 : .42) }),
    cornerR: () => ({ x: W - Math.min(W * .16, 190), y: H * .985, h: H * (P ? .26 : .42) }),
    run: (t) => {
      const k = clamp((t - T(8)) / (T(12) - .5 - T(8)));
      const floor = hasDeck() ? rect(el.deck).top - 3 : H * .97;
      return { x: lerp(W * .1, W * .9, k), y: floor, h: clamp(H * .2, 100, 180), yaw: Math.PI / 2 };
    },
    chart: () => {
      const h = clamp(H * .17, 86, 160), p = SITE.chart?.headPoint?.();
      if (p) return { x: p.x, y: p.y + 2, h, yaw: .5 };
      const r = rect(el.chart);   // not drawn yet: wait at the start of the line
      return r ? { x: r.left + r.width * .05, y: r.bottom - r.height * .06, h, yaw: .5 } : A.center();
    },
    peak: () => { const p = SITE.chart?.peakPoint?.(); return p ? { x: p.x, y: p.y + 2, h: clamp(H * .19, 90, 170) } : A.center(); },
    center: () => ({ x: W * .5, y: H * .94, h: H * (P ? .36 : .5) }),
    showcase: () => {
      const r = rect(el.avStage);
      if (!r) return A.center();
      return real ? { x: r.left + r.width / 2, y: r.bottom - r.height * .05, h: r.height * .86 } : { x: r.left + r.width * (P ? .2 : .12), y: r.bottom - r.height * .02, h: r.height * .52, z: 1.5 };
    },
    stage: () => ({ x: W * (P ? .74 : .8), y: H * .985, h: H * (P ? .3 : .46) }),
    discord: () => ({ x: W * (P ? .78 : .84), y: H * .985, h: H * (P ? .26 : .4) }),
  };
  const anchorOf = (name, t) => (A[name] || A.center)(t);

  /* ------------------------------------------------------------------------
     The choreography (song time). `enter`: spawn | hop | launch | oof | pop
     ------------------------------------------------------------------------ */
  const S = (t, at, clip, o = {}) => ({ t, at, clip, ...o });
  const HERO = [
    S(0, "hero", "idle", { enter: "spawn", dur: .44 }),             // drops in, lands as the track stops dead
    S(.908, "hero", "bob"),
    S(3.408, "hero", "point", { snap: 1 }), S(3.636, "hero", "flex", { snap: 1 }), S(4.318, "hero", "tpose", { snap: 1 }),
    S(4.546, "hero", "flip", { snap: 1 }), S(5.454, "hero", "dance"), S(6.364, "hero", "crouch", { snap: 1 }),
    S(6.822, "deck", "sit", { enter: "hop", dur: .45 }),            // onto the player
    S(11.817, "deck", "sitWave"), S(12.727, "deck", "sitFlip", { snap: 1 }), S(13.635, "deck", "sit"),
    S(14.098, "deck", "crouch", { snap: 1 }),
    S(T(8), "run", "run", { enter: "hop", dur: .35 }),               // the 808s: sprint along the stats
    S(T(12) - .2, "chart", "ride", { enter: "hop", dur: .6 }),      // surf the player count up to 497
    S(T(14), "peak", "lookup", { enter: "hop", dur: .45 }),         // …and the hammer shows up
    S(T(15), "center", "crouch", { enter: "hop", dur: .5 }),
    S(SIL[0], "center", "lookup"),
    S(DROP, "center", "fall", { enter: "launch" }),                  // BONK
    S(DROP + 1.16, "center", "idle", { enter: "spawn", dur: .62 }), // back, mad
    S(DROP + 4 * BEAT, "center", "flip", { snap: 1 }),
    S(T(20), "center", "flip2", { snap: 1 }), S(T(21), "center", "headbang"), S(T(22), "center", "flip", { snap: 1 }), S(T(23), "center", "flip2", { snap: 1 }),
    S(T(24), "deck", "sit", { enter: "hop", dur: .5 }),             // the reupload
    S(T(28), "showcase", "showcase", { enter: "hop", dur: .6 }),    // the fit
    S(T(36), "deck", "sit", { enter: "hop", dur: .5 }),             // the hook: chill on the player
    S(T(40), "deck", "sitWave"), S(T(41), "deck", "sit"), S(T(44), "deck", "sitFlip", { snap: 1 }), S(T(45), "deck", "sit"),
    S(T(52), "deck", "sitWave"), S(T(53), "deck", "sit"), S(T(60), "deck", "sitFlip", { snap: 1 }), S(T(61), "deck", "sit"),
    S(T(68), "deck", "sitWave"), S(T(69), "deck", "sit"), S(T(76), "deck", "sitFlip", { snap: 1 }), S(T(77), "deck", "sit"),
    S(T(79), "deck", "crouch"),
    S(T(80), "stage", "headbang", { enter: "spawn", dur: .3 }),     // drop ii
    S(T(88), "stage", "flip2", { snap: 1 }), S(T(89), "stage", "headbang"), S(T(96), "stage", "flip", { snap: 1 }), S(T(97), "stage", "headbang"),
    S(T(104), "discord", "wave", { enter: "hop", dur: .6 }),
    S(T(106), "discord", "bob"), S(T(110), "discord", "wave"),
    S(T(111), "center", "moonwalk", { enter: "hop", dur: .4 }),     // the rewind
    S(T(112), "hero", "flip2", { enter: "spawn", dur: .2 }),        // drop iii
    S(T(113), "hero", "headbang"), S(T(114), "hero", "flip", { snap: 1 }), S(T(115), "hero", "headbang"),
    ...Array.from({ length: 12 }, (_, c) => S(T(116 + c * 2), c === 6 ? "showcase" : c % 2 ? "cornerL" : "cornerR", ["flip2", "headbang", "flip", "dance"][c % 4], { enter: "pop" })),
    S(T(140), "discord", "wave", { enter: "pop" }), S(T(142), "discord", "flip2", { snap: 1 }),
    S(T(144), "discord", "idle", { enter: "oof" }),                  // oof.
    S(T(144) + 6 * BEAT, "center", "idle", { enter: "spawn", dur: .5 }), S(T(144) + 8 * BEAT, "center", "wave"),
  ];
  const LINES = [
    [1.0, "yo"], [2.0, "welcome to finalarc"], [4.6, "this one's for roblox"], [7.3, "sit back, i drive"],
    [T(8) + .2, "497 players at the peak btw"], [T(12) + .1, "watch it climb"], [T(14) + .3, "uh oh"], [T(15) + .3, "nah nah nah"],
    [DROP + 2.1, "roblox you're a ##### ####"], [T(20) + .2, "ALL of us."], [T(24) + .3, "reuploaded. we back"],
    [T(28) + .8, "the fit tho"], [T(36) + .7, "rate the closet"], [T(49), "still here btw"], [T(65), "the badges are real"],
    [T(80) + .2, "DROP TWO"], [T(104) + .7, "add me on discord"], [T(111) + .1, "wait go back"], [T(112) + .2, "FINAL ARC"],
    [T(144) + 8 * BEAT, "gg"],
  ].map(([t, text]) => ({ t, text, d: Math.min(2.6, Math.max(1.4, text.length * .09)) }));
  const SYS = [[T(14) + 1.2, "[ Content Deleted ]"], [DROP + 1.4, "this experience has been taken down"], [T(124) + .3, "[ Content Deleted ]"]];

  const segAt = (t) => { let i = 0; for (let k = 0; k < HERO.length; k++) if (HERO[k].t <= t) i = k; else break; return i; };

  // the army
  const recapCut = (t) => (t >= T(116) && t < T(140) ? Math.floor((t - T(116)) / (2 * BAR)) : -1);
  function armyCue(i, t) {
    if (i >= armyN) return null;
    const drop1 = DROP + 4 * BEAT;
    if (t >= drop1 + i * BEAT && t < T(24)) return { key: "d1", t0: drop1 + i * BEAT, at: armyLayout("drop", i), clip: (Math.floor((t - SONG.offset) / BAR) + i) % 3 === 2 ? "headbang" : i % 2 ? "flip2" : "flip", enter: "spawn", dur: .35, aim: 1 };
    if (t >= T(24) && t < T(24) + .4 + i * .05) return { key: "d1x", t0: T(24), enter: "poof" };
    if (i < 6 && t >= T(80) + i * BEAT && t < T(104)) return { key: "d2", t0: T(80) + i * BEAT, at: armyLayout("stage", i), clip: (Math.floor((t - SONG.offset) / BAR) % 8 === 7) ? "flip2" : "headbang", enter: "spawn", dur: .3 };
    if (t >= T(112) && t < T(116)) return { key: "d3", t0: T(112), at: armyLayout("drop", i), clip: i % 2 ? "flip2" : "flip", enter: "pop" };
    const c = recapCut(t);
    if (c >= 0 && i < 8) return { key: `r${c}`, t0: T(116 + c * 2), at: armyLayout("recap", i, c), clip: ["flip", "flip2", "headbang"][(c + i) % 3], enter: "pop", aim: c === 4 ? 1 : 0 };
    return null;
  }
  function armyLayout(kind, i, c = 0) {
    if (kind === "drop") {
      const side = i % 2 ? 1 : -1, rank = Math.floor(i / 2);
      return { x: clamp(W / 2 + side * (W * (P ? .22 : .16) + rank * W * (P ? .1 : .085)), W * .04, W * .96), y: H * (.965 - rank * .028), h: H * (P ? .22 : .32) * (1 - rank * .07), z: -rank * 1.4 };
    }
    if (kind === "stage") return { x: W * [.1, .22, .34, .46, .58, .68][i] * (P ? .95 : 1), y: H * .99, h: H * (P ? .18 : .28), z: -1.5 };
    const r = (k) => hash(c * 31 + i * 7 + k);
    return { x: W * (.06 + .88 * r(1)), y: H * (.6 + .38 * r(2)), h: H * (P ? .14 : .16 + .16 * r(3)), z: -4 * r(4), yaw: (r(5) - .5) * .9 };
  }

  // the hammer's state at song time t
  function hammerAt(t) {
    const tgt = A.center();
    const L = Math.min(H * .62, Math.max(W * .44, 300));
    const half = L * (1.9 / 6.6);
    const impact = { x: tgt.x, y: tgt.y - tgt.h * (hero.top / 5.2) * .98 };
    const strike = { x: impact.x + L, y: impact.y - half };            // pivot so the head lands on the hero's head
    const hover = { x: W * (P ? .9 : .86), y: H * (P ? .62 : .8) };
    const off = { x: W + L * .7, y: H * 1.4 };
    const mixP = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
    const COCK = .12, HIT = Math.PI / 2 + .06, SW = .16;
    const swing = (t0) => {                                            // swoop from the hover spot → slam at t0 → recoil
      if (t < t0 - SW) return null;
      if (t < t0) { const k = (t - (t0 - SW)) / SW, e = k * k * k; return { p: mixP(hover, strike, e), th: lerp(COCK, HIT, e) }; }
      if (t < t0 + .3) { const k = (t - t0) / .3; return { p: strike, th: HIT - .16 * Math.sin(k * Math.PI) * (1 - k) }; }
      return null;
    };
    let s = null;
    if (t >= T(14) && t < T(24) + .9) {
      if (t < T(14) + 1) { const k = easeOut((t - T(14)) / 1); s = { p: mixP(off, hover, k), th: lerp(1.2, .42, k) }; }
      else if (t < SIL[0]) { const k = clamp((t - T(14) - 1) / (SIL[0] - T(14) - 1)); s = { p: hover, th: lerp(.42, COCK, k * k), tremble: k, bob: 1 - k }; }
      else if (t < DROP - SW) s = { p: hover, th: COCK };
      else if (t < DROP + .3) s = swing(DROP);
      else if (t < DROP + 1.2) s = { p: strike, th: HIT };
      else if (t < DROP + 2.1) { const k = easeIO((t - DROP - 1.2) / .9); s = { p: mixP(strike, hover, k), th: lerp(HIT, .42, k) }; }
      else if (t < T(24)) s = { p: hover, th: .42 + .07 * Math.sin(t * 2.1), bob: 1 };
      else { const k = easeIO((t - T(24)) / .9); s = { p: mixP(hover, { x: hover.x + W * .2, y: -H * .9 }, k), th: .42 + k * 3 }; }
    } else if (t >= T(124) - 1.4 && t < T(126)) {
      if (t < T(124) - .4) { const k = easeOut((t - T(124) + 1.4) / 1); s = { p: mixP(off, hover, k), th: lerp(1.2, COCK, k) }; }
      else if (t < T(124) - SW) s = { p: hover, th: COCK, tremble: 1 };
      else if (t < T(124) + .3) s = swing(T(124));
      else { const k = easeIO(clamp((t - T(124) - .3) / 1.2)); s = { p: mixP(strike, hover, k), th: lerp(HIT, .42, k) + .07 * Math.sin(t * 2.1) }; }
    }
    if (!s) return null;
    s.L = L;
    s.impact = impact;
    return s;
  }

  /* ------------------------------------------------------------------------
     Per-frame
     ------------------------------------------------------------------------ */
  let entered = false, lastT = 0, lastDriving = null, ready = false, cleared = true;
  const want = new THREE.Vector3(), tmp = new THREE.Vector3();
  let rt = 0;   // real seconds

  // move an actor toward its cue on its own clock (song time on autopilot, real time off it)
  function drive(a, cue, now, clockName, jumped, adt, beats, kick) {
    if (a.clock !== clockName) { a.clock = clockName; a.key = null; a.mode = null; }
    // transitions
    if (!cue) {
      if (!a.hidden && a.mode?.kind !== "poof") { a.hidden = true; }
      a.g.visible = false; a.key = null;
      return;
    }
    if (cue.key !== a.key) {
      const first = a.key == null;
      a.key = cue.key;
      const live = !jumped && now - cue.t0 < .6;
      a.reassemble();
      if (!live || a.mode?.kind === "launch" || a.mode?.kind === "poof") { a.mode = null; a.snap = true; }
      if (cue.enter === "poof") { if (live && !a.hidden) { a.forcefield(.35); a.mode = { kind: "poof", t0: now }; } else { a.hidden = true; } }
      else if (cue.enter === "launch") { if (live && !a.hidden) a.mode = { kind: "launch", t0: cue.t0, from: a.pos.clone(), s: a.s }; else a.hidden = true; }
      else if (cue.enter === "oof") { if (live && !a.hidden) { a.breakApart(1); burst(a.g.localToWorld(tmp.set(0, 2.5, 0)), 26, { speed: 9 * a.s, up: 6 * a.s, size: .45 * a.s * 2 }); oof(a); } a.hidden = true; a.mode = null; }
      else {
        a.hidden = false;
        if (cue.enter === "spawn" && (live || first)) { a.mode = { kind: "spawn", t0: Math.min(cue.t0, now), dur: cue.dur || .45 }; a.forcefield(2.6); }
        else if (cue.enter === "pop") { a.mode = null; a.snap = true; a.forcefield(.8); }
        else if (cue.enter === "hop" && live && !first) a.mode = { kind: "hop", t0: cue.t0, dur: cue.dur || .45, from: a.pos.clone(), fromS: a.s };
        else if (!cue.keepPlace || first) { a.mode = null; a.snap = true; }
      }
    }
    if (a.hidden && a.mode?.kind !== "poof" && a.mode?.kind !== "launch") { a.g.visible = false; return; }

    // where it wants to be
    const at = cue.at;
    let clip = cue.clip || "idle", air = false;
    if (at) {
      toWorld(at.x, at.y, at.z || 0, want);
      const ws = (at.h * u(at.z || 0)) / 5.2;
      const m = a.mode;
      if (!m) { a.pos.copy(want); a.s = ws; }
      else {
        const k = clamp((now - m.t0) / (m.dur || 1));
        if (m.kind === "hop") {
          const e = easeIO(k), hgt = Math.max(1.4 * ws, m.from.distanceTo(want) * .35);
          a.pos.lerpVectors(m.from, want, e); a.pos.y += hgt * 4 * k * (1 - k);
          a.s = lerp(m.fromS, ws, e); clip = "jump"; air = true;
          if (k >= 1) { a.mode = null; a.landAt = now; }
        } else if (m.kind === "spawn") {
          const drop = H * u(at.z || 0) * .75;
          a.pos.set(want.x, want.y + drop * (1 - k * k), want.z); a.s = ws; clip = "fall"; air = true;
          if (k >= 1) { a.mode = null; a.landAt = now; }
        }
      }
      a.yawT = at.yaw ?? clamp((W / 2 - at.x) / W * 1.1, -.55, .55);
    }
    if (a.mode?.kind === "poof" && now - a.mode.t0 > .3) { a.mode = null; a.hidden = true; a.g.visible = false; return; }
    if (a.mode?.kind === "launch") {
      const m = a.mode, dt = Math.max(0, now - m.t0), s = m.s;
      a.pos.set(m.from.x - 9 * s * dt, m.from.y + 26 * s * dt - 10 * s * dt * dt, m.from.z + 3 * s * dt);
      a.spin = dt * 11; clip = "fall"; air = true;
      if (dt > 1.15) { a.mode = null; a.hidden = true; a.g.visible = false; return; }
    } else a.spin = 0;
    if (!air && now - a.landAt < .22 && now >= a.landAt) clip = "land";
    if (cue.aimX != null) a.yawT = clamp((cue.aimX - (at?.x ?? W / 2)) / W * 1.8, -.85, .85);

    // pose
    a.tc += adt;
    const pose = (CLIPS[clip] || CLIPS.idle)(a.tc, beats, kick);
    if (a.snap) { a.rig.update(pose, 1, 60); a.snap = false; }
    else a.rig.update(pose, adt, clip === "land" || cue.snapPose ? 34 : 15);
    a.yaw += (a.yawT - a.yaw) * (1 - Math.exp(-adt * 9));
    a.g.position.copy(a.pos);
    const land = now - a.landAt < .25 && now >= a.landAt ? 1 - (now - a.landAt) / .25 : 0;
    const pop = 1 + .03 * kick * (a === hero ? 1 : .5);
    a.g.scale.set(a.s * pop * (1 + .1 * land), a.s * pop * (1 - .16 * land), a.s * pop * (1 + .1 * land));
    a.g.rotation.set(0, a.yaw, a.spin);
    a.shadow.visible = !air;
    // forcefield
    const fk = (rt - a.ffAt) / a.ffDur;
    a.ff.visible = fk >= 0 && fk < 1;
    if (a.ff.visible) { a.ff.material.uniforms.uT.value = rt; a.ff.material.uniforms.uA.value = Math.min(1, (1 - fk) * 3) * (.75 + .25 * Math.sin(rt * 24)); }
    // offscreen → skip drawing
    const sy = H / 2 - a.pos.y / u(a.pos.z);
    a.g.visible = sy > -H * .4 && sy < H * 2;
  }

  function oof(a) {
    const p = toScreen(a.g.localToWorld(tmp.set(0, 3, 0)));
    oofEl.style.left = `${p.x.toFixed(0)}px`; oofEl.style.top = `${p.y.toFixed(0)}px`;
    oofEl.classList.remove("is-on"); void oofEl.offsetWidth; oofEl.classList.add("is-on");
    shake = Math.max(shake, .5);
  }

  // the hero's cue when nobody's driving: chill wherever the page is
  function manualCue() {
    const y = V.y;
    const av = el.avatar;
    if (y < H * .55) return { key: "m-hero", t0: rt, at: A.hero(), clip: ["idle", "wave", "idle", "flex"][Math.floor(rt / 3.2) % 4], enter: "hop" };
    if (av) { const top = SITE.docTop(av), h = av.offsetHeight; if (y > top - H * .45 && y < top + h - H * .55) return { key: "m-show", t0: rt, at: A.showcase(), clip: ["idle", "flex", "idle", "wave"][Math.floor(rt / 3.2) % 4], enter: "hop" }; }
    if (hasDeck()) return { key: "m-deck", t0: rt, at: A.deck(), clip: Math.floor(rt / 4) % 5 === 4 ? "sitWave" : "sit", enter: "hop" };
    return { key: "m-corner", t0: rt, at: A.corner(), clip: "idle", enter: "hop" };
  }

  function frame(nowMs, dt) {
    if (!ready) return;
    dt = Math.min(dt, .1);
    rt = nowMs / 1000;
    if (!entered) return;
    frameRects = new Map();
    const SHOW = window.SHOW, F = SHOW?.F;
    const driving = !!SHOW?.driving;
    const t = F ? F.t : 0;
    const jumped = driving && (t < lastT - .05 || t - lastT > .5 || lastDriving !== driving);
    lastT = t; lastDriving = driving;
    const gap = driving && F?.gap;
    const adt = gap ? 0 : dt;
    const beats = driving ? (t - (SONG?.offset || 0)) / BEAT : rt * 2.2;
    const kick = driving && F?.on ? F.kick : 0;
    let busy = false;

    // hammer first (the army aims at it)
    const hs = driving ? hammerAt(t) : null;
    hammer.pivot.visible = !!hs;
    let aimX = null;
    if (hs) {
      hammerL = hs.L;
      const z = -1;
      const tr = hs.tremble ? hs.tremble * .04 * Math.sin(rt * 70) : 0;
      toWorld(hs.p.x, hs.p.y + (hs.bob ? Math.sin(rt * 1.7) * H * .012 : 0), z, hammer.pivot.position);
      hammer.pivot.scale.setScalar((hs.L * u(z)) / 6.6);
      hammer.pivot.rotation.z = (gap ? hammer.frozen ?? hs.th : hs.th) + tr;
      if (!gap) hammer.frozen = hs.th;
      hammer.glow.intensity = 1.5 + 3 * (F?.tension || 0) + 4 * kick;
      aimX = hs.p.x - Math.sin(hs.th) * hs.L;
      busy = true;
    }
    // the impacts
    if (driving && !jumped) {
      for (const ti of [DROP, T(124)]) if (lastHitCheck < ti && t >= ti) impact(hammerAt(ti) || hs);
    }
    lastHitCheck = t;

    // hero
    let cue;
    if (driving) {
      const i = segAt(t), seg = HERO[i];
      let at = anchorOf(seg.at, t);
      cue = { key: `h${i}`, t0: seg.t, at, clip: seg.clip, enter: seg.enter || (i > 0 && HERO[i - 1].at !== seg.at ? "hop" : null), dur: seg.dur, keepPlace: !seg.enter && i > 0 && HERO[i - 1].at === seg.at, snapPose: seg.snap };
      if (aimX != null && /flip|lookup|point/.test(seg.clip)) cue.aimX = aimX;
    } else cue = manualCue();
    drive(hero, cue, driving ? t : rt, driving ? "song" : "real", jumped, adt, beats, kick);
    busy ||= hero.g.visible;

    // army
    for (let i = 0; i < ARMY_MAX; i++) {
      const a = army[i];
      const c = driving && !reduced ? armyCue(i, t) : null;
      if (c && aimX != null && c.aim !== 0) c.aimX = aimX;
      drive(a, c, driving ? t : rt, driving ? "song" : "real", jumped, adt, beats + i * .07, kick);
      busy ||= a.g.visible;
    }

    // fx
    busy = stepDebris(dt) || busy;
    busy = stepRings(rt) || busy;
    for (const a of [hero, ...army]) busy = a.stepParts(dt) || busy;
    flash.intensity *= Math.exp(-dt / .18);
    shake *= Math.exp(-dt / .22);
    camera.position.set(Math.sin(rt * 53) * shake * .6, Math.cos(rt * 47) * shake * .5, D);
    camera.rotation.z = Math.sin(rt * 31) * shake * .02;

    // labels
    labelsFrame(driving, t);

    if (busy || hammer.pivot.visible) { renderer.render(scene, camera); cleared = false; }
    else if (!cleared) { renderer.clear(); cleared = true; }
  }
  let lastHitCheck = 0, hammerL = 300;

  function impact(hs) {
    if (!hs) return;
    const at = toWorld(hs.impact.x, hs.impact.y, 0);
    burst(at, 140, { speed: 16, up: 12, size: .7, spread: 1.4 });
    shock(at, 9);
    flash.position.set(at.x, at.y, 6); flash.intensity = 60;
    shake = 1;
  }

  function labelsFrame(driving, t) {
    const vis = hero.g.visible && !hero.broken;
    let line = null;
    if (driving) { for (const l of LINES) if (t >= l.t && t < l.t + l.d) line = l.text; }
    if (vis) {
      const p = toScreen(hero.g.localToWorld(tmp.set(0, hero.top + .35, 0)));
      placeLabel(tag, p.x, p.y, true);
      placeLabel(bubble, p.x, p.y - (P ? 22 : 26), !!line, line);
    } else { placeLabel(tag, 0, 0, false); placeLabel(bubble, 0, 0, false); }
    let sys = null;
    if (driving && hammer.pivot.visible) for (const [t0, text] of SYS) if (t >= t0 && t < t0 + 2.4) sys = text;
    if (sys) {
      const p = toScreen(hammer.head.getWorldPosition(tmp));
      placeLabel(hBubble, clamp(p.x, 150, W - 150), Math.max(80, p.y - hammerL * .2), true, sys);
    } else placeLabel(hBubble, 0, 0, false);
  }

  /* ------------------------------------------------------------------------
     Warm-up: upload every texture, compile every shader, draw once — all
     behind the gate
     ------------------------------------------------------------------------ */
  LOAD.set("avatar", .85, "compiling");
  const prev = [];
  [hero, ...army].forEach((a, i) => { a.g.visible = true; a.ff.visible = true; a.g.position.set((i - 5) * 2, -3, -6); a.g.scale.setScalar(.6); prev.push(a); });
  hammer.pivot.visible = true; hammer.pivot.position.set(0, 0, -8);
  rings.forEach((r) => (r.visible = true));
  scene.traverse((o) => { const m = o.material; if (m) for (const mm of [].concat(m)) for (const k of ["map", "alphaMap", "normalMap"]) if (mm[k]) renderer.initTexture(mm[k]); });
  try { await renderer.compileAsync?.(scene, camera); } catch { renderer.compile(scene, camera); }
  if (!renderer.compileAsync) renderer.compile(scene, camera);
  renderer.render(scene, camera);
  for (const a of prev) { a.g.visible = false; a.ff.visible = false; }
  hammer.pivot.visible = false;
  rings.forEach((r) => (r.visible = false));
  renderer.clear();
  if (real) root.classList.add("has-3d");
  root.classList.add("is-3d");
  ready = true;
  LOAD.done("avatar", real ? "3d mesh" : look.note);

  function setQuality(q) {
    tier = q;
    armyN = [3, 6, 10][q] ?? 10;
    dbMax = [90, 170, 260][q] ?? 260;
    resize();
  }
  setQuality(+(root.dataset.tier ?? 2));

  if (SITE.state?.entered) entered = true;   // the visitor got in before the 3d finished
  window.STAGE3D = {
    frame,
    setQuality,
    enter() { entered = true; lastT = window.SHOW?.F?.t || 0; hero.key = null; },
    get hero() { return hero; },
    real,
  };

  /* ------------------------------------------------------------------------
     Builders
     ------------------------------------------------------------------------ */
  function cloneRig(src) {
    const c = src.clone(true);
    c.userData = { ...src.userData };
    return c;
  }

  function buildHammer() {
    const pivot = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = .62;
    pivot.add(inner);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: .75, roughness: .32 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8d8d96, metalness: .9, roughness: .22 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: .8 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff2433, emissive: 0xff1020, emissiveIntensity: .8, roughness: .5 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, 6.2, 18), grip); handle.position.y = 3.1;
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, 1.5, 18), red); wrap.position.y = .9;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(.4, 16, 12), steel); pommel.position.y = 0;
    const head = new THREE.Group(); head.position.y = 6.6;
    const block = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2, 2), metal);
    const faceA = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, .34, 24), steel); faceA.rotation.z = Math.PI / 2; faceA.position.x = 2.05;
    const faceB = faceA.clone(); faceB.position.x = -2.05;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.5, 2.08, 2.08), red);
    const label = banTexture();
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35), new THREE.MeshBasicMaterial({ map: label, transparent: true }));
    decal.position.z = 1.012;
    const decal2 = decal.clone(); decal2.rotation.y = Math.PI; decal2.position.z = -1.012;
    head.add(block, faceA, faceB, band, decal, decal2);
    inner.add(handle, wrap, pommel, head);
    const glow = new THREE.PointLight(0xff2433, 2, 14, 1.4); glow.position.set(0, 6.6, 2.4); inner.add(glow);
    pivot.visible = false;
    return { pivot, head, glow, frozen: null };
  }
  function banTexture() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 216;
    const x = c.getContext("2d");
    const font = getComputedStyle(document.documentElement).getPropertyValue("--f-display").trim() || "Impact, sans-serif";
    x.font = `900 170px ${font}`;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 14; x.strokeStyle = "#0b0b0d"; x.strokeText("BAN", 256, 116);
    x.fillStyle = "#ff2433"; x.fillText("BAN", 256, 116);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
}

/* --------------------------------------------------------------------------
   Avatar sources
   -------------------------------------------------------------------------- */
// the real mesh, baked by tools/fetch-avatar.mjs into avatar/ (same origin: no CORS, no auth)
async function bakedAvatar(base) {
  const res = await fetch(base + "meta.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status === 404 ? "404" : `meta ${res.status}`);
  const meta = await res.json();
  LOAD.set("avatar", .15, "downloading your avatar");
  const txt = (f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(`missing ${f}`); return r.text(); });
  const [objText, mtlText] = await Promise.all([txt(meta.objFile || "avatar.obj"), txt(meta.mtlFile || "avatar.mtl")]);
  // parse the MTL ourselves: map_d / map_Ka are ignored (they make Roblox avatars see-through) and every texture is awaited
  const info = {}; let cur = null;
  for (const raw of mtlText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const sp = line.indexOf(" ");
    const k = (sp < 0 ? line : line.slice(0, sp)).toLowerCase(), v = sp < 0 ? "" : line.slice(sp + 1).trim();
    if (k === "newmtl") info[v] = cur = {}; else if (cur) cur[k] = v;
  }
  const files = [...new Set(Object.values(info).map((m) => m.map_kd).filter(Boolean))];
  const loader = new THREE.TextureLoader();
  let n = 0;
  const tex = Object.fromEntries(await Promise.all(files.map(async (f) => {
    try { const t = await loader.loadAsync(base + f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return [f, t]; }
    catch { return [f, null]; }
    finally { LOAD.set("avatar", .2 + .4 * (++n / files.length), `textures ${n}/${files.length}`); }
  })));
  const mats = {};
  for (const [name, m] of Object.entries(info)) {
    const mat = new THREE.MeshStandardMaterial({ name, metalness: 0, roughness: .78 });
    if (m.kd) mat.color.setRGB(...m.kd.split(/\s+/).slice(0, 3).map(Number), THREE.SRGBColorSpace);
    if (m.map_kd && tex[m.map_kd]) mat.map = tex[m.map_kd];
    mats[name] = mat;
  }
  LOAD.set("avatar", .62, "building the mesh");
  await new Promise((r) => setTimeout(r, 0));
  const obj = new OBJLoader().setMaterials({ create: (nm) => mats[nm] ?? new THREE.MeshStandardMaterial({ name: nm, color: 0xcccccc }), preload() {}, getAsArray() { return Object.values(mats); } }).parse(objText);
  return rigFromObj(obj, meta);
}

// what the blocky fallback should look like: live body colours, headless/korblox, hats, and the
// shirt + pants colours read off your 2d render
async function avatarLook() {
  const id = SITE.CONFIG?.robloxId;
  const KEY = `fa-look-v1-${id}`;
  try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && Date.now() - c.t < 6 * 3600e3) return c.d; } catch {}
  const look = { colors: {}, headless: false, korblox: false, hats: [], note: "r6" };
  LOAD.set("avatar", .1, "reading your avatar");
  const col = (h) => { const s = "#" + String(h ?? "").replace(/^#/, ""); return /^#[0-9a-f]{6}$/i.test(s) ? s : null; };
  try {
    const av = await timeout(SITE.rbx("avatar", `/v2/avatar/users/${id}/avatar`), 7000);
    const bc = av?.bodyColor3s || {};
    const set = { head: col(bc.headColor3), torso: col(bc.torsoColor3), armL: col(bc.leftArmColor3), armR: col(bc.rightArmColor3), legL: col(bc.leftLegColor3), legR: col(bc.rightLegColor3) };
    for (const [k, v] of Object.entries(set)) if (v) look.colors[k] = v;
    for (const a of av?.assets || []) {
      const nm = `${a.name || ""}`, type = `${a.assetType?.name || ""}`;
      if (/headless/i.test(nm) || (type === "Head" && /headless/i.test(nm))) look.headless = true;
      if (/korblox/i.test(nm) && /RightLeg/i.test(type)) look.korblox = true;
      if (/horn/i.test(nm) && !look.hats.includes("horns")) look.hats.push("horns");
      else if (/crown/i.test(nm) && !look.hats.includes("crown")) look.hats.push("crown");
      else if (/valk/i.test(nm) && !look.hats.includes("valk")) look.hats.push("valk");
    }
    look.note = "live colours";
  } catch (e) { console.warn("avatar look", e.message); look.note = "default look"; }
  // clothes: sample the 2d render (only if the CDN lets us read it)
  try {
    const d = await timeout(SITE.data, 9000);
    if (d?.avatar) {
      LOAD.set("avatar", .2, "matching your fit");
      const c = await timeout(sampleRender(d.avatar), 5000);
      if (c.torso) { look.colors.torso = c.torso; look.note = "your fit"; }
      if (c.legs && !look.korblox) { look.colors.legL = c.legs; look.colors.legR = c.legs; }
      else if (c.legs) look.colors.legL = c.legs;
    }
  } catch {}
  try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: look })); } catch {}
  return look;
}

async function sampleRender(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const N = 160, c = document.createElement("canvas"); c.width = c.height = N;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  const px = x.getImageData(0, 0, N, N).data;   // throws if the CDN sent no CORS headers
  let x0 = N, x1 = 0, y0 = N, y1 = 0;
  for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) if (px[(y * N + i) * 4 + 3] > 60) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 <= x0 || y1 <= y0) return {};
  const mode = (ya, yb, xa, xb) => {
    const bins = new Map();
    for (let y = Math.floor(y0 + (y1 - y0) * ya); y < y0 + (y1 - y0) * yb; y++) {
      for (let i = Math.floor(x0 + (x1 - x0) * xa); i < x0 + (x1 - x0) * xb; i++) {
        const o = (y * N + i) * 4;
        if (px[o + 3] < 200) continue;
        const k = (px[o] >> 4) << 8 | (px[o + 1] >> 4) << 4 | (px[o + 2] >> 4);
        const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += px[o]; b.g += px[o + 1]; b.b += px[o + 2];
        bins.set(k, b);
      }
    }
    let best = null;
    for (const b of bins.values()) if (!best || b.n > best.n) best = b;
    if (!best || best.n < 6) return null;
    const h = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
    return `#${h(best.r)}${h(best.g)}${h(best.b)}`;
  };
  return { torso: mode(.34, .52, .38, .62), legs: mode(.8, .93, .3, .7) };
}
