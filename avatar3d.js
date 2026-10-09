/* ==========================================================================
   finalarc — your real avatar in 3D
   Only runs once the avatar has been baked into avatar/ (the "Bake avatar"
   GitHub Action, or tools/fetch-avatar.mjs). Until then the official 2D render
   stays and this module steps aside. When it runs, it:
     • loads the exact Roblox mesh + textures behind the joining screen
     • rigs it (rig.js) so it can move: idle, bob to the beat, look at the cursor,
       flip Roblox off on the drop, headbang through it, wave when clicked
     • frames it exactly like the 2D render, so the chat bubbles still sit on its head
   ========================================================================== */
import * as THREE from "./vendor/three.module.min.js";
import { OBJLoader } from "./vendor/OBJLoader.js";
import { rigFromObj, CLIPS, Rig } from "./rig.js";

const LOAD = window.LOAD, SONG = window.SONG;
const canvas = document.getElementById("avatar3d"), wrap = document.getElementById("renderWrap"), toggle = document.getElementById("toggle3d");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BASE = "avatar/";

boot().catch((e) => {
  if (!/^404$/.test(e.message)) console.warn("3d avatar", e);
  LOAD?.done("avatar3d", "2d");
});

async function boot() {
  if (!canvas || !wrap) throw new Error("no stage");
  const res = await fetch(BASE + "meta.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status === 404 ? "404" : `meta ${res.status}`);
  const meta = await res.json();
  LOAD?.set("avatar3d", .1, "downloading");

  /* --- the mesh -------------------------------------------------------------- */
  const txt = (f) => fetch(BASE + f).then((r) => { if (!r.ok) throw new Error(`missing ${f}`); return r.text(); });
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
    try { const t = await loader.loadAsync(BASE + f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return [f, t]; }
    catch { return [f, null]; }
    finally { LOAD?.set("avatar3d", .15 + .5 * (++n / files.length), `textures ${n}/${files.length}`); }
  })));
  const mats = {};
  for (const [name, m] of Object.entries(info)) {
    const mat = new THREE.MeshStandardMaterial({ name, metalness: 0, roughness: .82 });
    if (m.kd) mat.color.setRGB(...m.kd.split(/\s+/).slice(0, 3).map(Number), THREE.SRGBColorSpace);
    if (m.map_kd && tex[m.map_kd]) mat.map = tex[m.map_kd];
    mats[name] = mat;
  }
  LOAD?.set("avatar3d", .7, "rigging");
  await new Promise((r) => setTimeout(r, 0));
  const obj = new OBJLoader().setMaterials({ create: (nm) => mats[nm] ?? new THREE.MeshStandardMaterial({ name: nm, color: 0xcccccc }), preload() {}, getAsArray() { return Object.values(mats); } }).parse(objText);
  const avatar = rigFromObj(obj, meta);
  const rig = new Rig(avatar);
  const top = avatar.userData.top || 5.6;

  /* --- scene, lit like Roblox's own thumbnails -------------------------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.add(avatar);
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6070, 1.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-4, 9, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9d0f5, 1.6); rim.position.set(6, 5, -8); scene.add(rim);
  const rimRed = new THREE.Color(0xff2a3d), rimIce = new THREE.Color(0xb9d0f5);

  // frame it like the 2D render: head top ≈ 7% from the top of the box, feet ≈ 95%
  const FOV = 26;
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 200);
  const Hvis = top / .88, centerY = .45 * Hvis;
  const dist = (Hvis / 2) / Math.tan(FOV / 2 * Math.PI / 180);
  camera.position.set(0, centerY + .2, dist);
  camera.lookAt(0, centerY, 0);

  function resize() {
    const r = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(wrap);

  // compile + upload everything now, behind the joining screen
  for (const m of Object.values(mats)) if (m.map) renderer.initTexture(m.map);
  try { await renderer.compileAsync?.(scene, camera); } catch {}
  renderer.compile(scene, camera);
  renderer.render(scene, camera);

  /* --- interaction --------------------------------------------------------------- */
  let mode = "3d";
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth * .5), -1, 1);
    pointer.y = clamp((e.clientY - (r.top + r.height * .2)) / (innerHeight * .5), -1, 1);
  }, { passive: true });
  let drag = null, spin = 0, spinV = 0, waveUntil = 0, cueName = null, cueAt = 0;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, s: spin, moved: false, t: performance.now() }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", (e) => { if (!drag) return; const d = (e.clientX - drag.x) / 90; if (Math.abs(d) > .05) drag.moved = true; spin = drag.s + d; });
  const release = () => {
    if (!drag) return;
    if (!drag.moved) waveUntil = performance.now() + 2200;   // a click says hi
    drag = null; canvas.style.cursor = "";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function setMode(m) {
    mode = m;
    canvas.hidden = m !== "3d";
    wrap.classList.toggle("is-3d", m === "3d");
    for (const b of toggle.querySelectorAll("button")) b.classList.toggle("on", b.dataset.mode === m);
    try { localStorage.setItem("fa-avatar-mode", m); } catch {}
  }
  toggle.hidden = false;
  toggle.addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });
  let saved = "3d";
  try { saved = localStorage.getItem("fa-avatar-mode") || "3d"; } catch {}
  setMode(saved === "2d" ? "2d" : "3d");

  /* --- per frame (called from app.js with the song features) ----------------------- */
  const BEAT = 60 / (SONG?.bpm || 132);
  let tc = 0, visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(wrap);
  function frame(now, dt, F, red) {
    if (mode !== "3d" || !visible) return;
    const playing = !!F?.on && !F.gap;
    tc += reduced ? dt * .4 : dt;
    const beats = F ? (F.t - (SONG?.offset || 0)) / BEAT : tc * 2.2;
    const kick = playing ? F.kick : 0;
    // what to do right now
    let clip = playing ? "bob" : "idle", rate = 12;
    if (now < waveUntil) clip = "wave";
    else if (cueName && now - cueAt < 2600) { clip = cueName === "takedown" ? "flip2" : "headbang"; rate = 30; }
    else if (red) { clip = Math.floor(beats / 4) % 4 === 3 ? "headbang" : "flip2"; rate = 20; }   // both fingers up at Roblox
    else if (F?.section?.kind === "drop" && playing) clip = Math.floor(beats / 4) % 4 === 3 ? "flip" : "bob";
    const pose = (CLIPS[clip] || CLIPS.idle)(tc, beats, kick);
    // look at the cursor (on top of the clip)
    if (clip === "idle" || clip === "bob") {
      pose.neck = [(pose.neck?.[0] || 0) + pointer.y * .22, (pose.neck?.[1] || 0) * .3 + pointer.x * .5, pose.neck?.[2] || 0];
      pose.torso = [0, pointer.x * .12, 0];
    }
    rig.update(pose, reduced ? dt * .5 : dt, rate);
    // turntable: drag to spin, it settles back facing you
    if (!drag) { spinV += (-spin) * dt * 6; spinV *= Math.exp(-dt * 5); spin += spinV * dt * 4; }
    holder.rotation.y = spin + (drag ? 0 : Math.sin(tc * .35) * .08);
    holder.scale.setScalar(1 + kick * .015);
    rim.color.lerp(red ? rimRed : rimIce, 1 - Math.exp(-dt * 4));
    rim.intensity = (red ? 2.6 : 1.6) + kick * .8;
    renderer.render(scene, camera);
  }

  window.AVATAR3D = {
    frame,
    enter() {},
    cue(name) { cueName = name; cueAt = performance.now(); },
    setMode,
  };
  LOAD?.done("avatar3d", "3d");
}
