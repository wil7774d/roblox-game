/* ==========================================================================
   finalarc — rig
   R6-style characters for the 3d world, all sharing one skeleton:
     root (feet)
      └ pelvis (hip height)
         ├ torso ─┬ neck → head
         │        ├ shL → left arm  (+ fistL: knuckles + middle finger)
         │        └ shR → right arm (+ fistR)
         ├ hipL → left leg
         └ hipR → right leg
   buildR6()     a procedural blocky avatar in your body colours (the fallback)
   rigFromObj()  your real Roblox avatar mesh (avatar-3d OBJ) cut into those parts
   Rig           poses + clips (idle, run, flip, wave, sit, headbang …), blended
   Units are studs; the character faces +z (the camera), its left hand is +x.
   ========================================================================== */
import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";

const JOINTS = ["pelvis", "torso", "neck", "shL", "shR", "hipL", "hipR"];
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: .58, metalness: .03, ...extra });
const group = (name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

/* --- the hand: two curled knuckles and one finger, sized off the arm ------ */
function buildFist(name, mat, armW = 1, armD = 1, endY = -1.5) {
  const g = group(name, 0, endY, 0);
  const u = armW;
  const finger = mesh(new RoundedBoxGeometry(.24 * u, .74 * u, .24 * armD, 2, .05 * u), mat, 0, -.37 * u, .1 * armD);
  const k1 = mesh(new RoundedBoxGeometry(.22 * u, .24 * u, .32 * armD, 2, .05 * u), mat, -.3 * u, -.1 * u, .12 * armD);
  const k2 = mesh(new RoundedBoxGeometry(.22 * u, .24 * u, .32 * armD, 2, .05 * u), mat, .3 * u, -.1 * u, .12 * armD);
  finger.name = "finger";
  g.add(finger, k1, k2);
  g.scale.setScalar(.001);
  g.visible = false;
  return g;
}

/* --- canvas decals ---------------------------------------------------------- */
function faceTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#111";
  x.beginPath(); x.ellipse(88, 104, 15, 26, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(168, 104, 15, 26, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = 12; x.lineCap = "round"; x.strokeStyle = "#111";
  x.beginPath(); x.arc(128, 128, 62, Math.PI * .2, Math.PI * .8); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function logoTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.lineWidth = 22; x.lineCap = "round"; x.strokeStyle = "#ff4b2b";
  x.beginPath(); x.arc(128, 170, 70, Math.PI, 0); x.stroke();
  x.fillStyle = "#ff4b2b"; x.beginPath(); x.arc(128, 170, 13, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --- procedural R6 ------------------------------------------------------------
   colors: head/torso/armL/armR/legL/legR · headless: no head (hats float, like the
   real thing) · korblox: the skinny right leg · hats: "horns" | "crown" | "valk" */
export function buildR6({ colors = {}, headless = false, korblox = false, hats = [] } = {}) {
  const c = { head: "#e9d3bb", torso: "#141418", armL: "#e9d3bb", armR: "#e9d3bb", legL: "#24242c", legR: "#24242c", ...colors };
  const root = group("root");
  const pelvis = group("pelvis", 0, 2, 0);
  const torso = group("torso");
  const neck = group("neck", 0, 2, 0);
  const shL = group("shL", 1.5, 1.5, 0), shR = group("shR", -1.5, 1.5, 0);
  const hipL = group("hipL", .5, 0, 0), hipR = group("hipR", -.5, 0, 0);
  root.add(pelvis); pelvis.add(torso, hipL, hipR); torso.add(neck, shL, shR);

  const limb = new RoundedBoxGeometry(1, 2, 1, 2, .07);
  torso.add(mesh(new RoundedBoxGeometry(2, 2, 1, 2, .07), material(c.torso), 0, 1, 0));
  const logo = mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true }), 0, 1.05, .506);
  torso.add(logo);
  if (!headless) {
    const head = mesh(new RoundedBoxGeometry(1.25, 1.2, 1.25, 4, .4), material(c.head), 0, .62, 0);
    head.name = "head";
    neck.add(head);
    neck.add(mesh(new THREE.PlaneGeometry(.95, .95), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false }), 0, .62, .632));
  }
  const mArmL = material(c.armL), mArmR = material(c.armR);
  shL.add(mesh(limb, mArmL, 0, -.5, 0)); shR.add(mesh(limb, mArmR, 0, -.5, 0));
  hipL.add(mesh(limb, material(c.legL), 0, -1, 0));
  if (korblox) {
    const bone = material("#26324a", { roughness: .4, metalness: .35 });
    hipR.add(mesh(new RoundedBoxGeometry(.42, 1.7, .42, 2, .08), bone, .08, -.85, 0));
    hipR.add(mesh(new RoundedBoxGeometry(.62, .34, .9, 2, .08), bone, .08, -1.83, .12));
    hipR.add(mesh(new THREE.OctahedronGeometry(.2), material("#7fd7ff", { emissive: new THREE.Color("#3aa8ff"), emissiveIntensity: 1.4 }), .08, -.55, .24));
  } else hipR.add(mesh(limb, material(c.legR), 0, -1, 0));
  shL.add(buildFist("fistL", mArmL)); shR.add(buildFist("fistR", mArmR));
  for (const h of hats) { const a = accessory(h); if (a) neck.add(a); }
  root.userData = { height: 5.2, top: headless ? (hats.length ? 5.6 : 4.1) : (hats.length ? 6 : 5.3), kind: "r6" };
  return root;
}

// a few signature accessories, by catalogue name
function accessory(kind) {
  const g = group(`hat-${kind}`);
  if (kind === "horns") {
    const m = material("#dff4ff", { emissive: new THREE.Color("#5ab8ff"), emissiveIntensity: .9, roughness: .3 });
    for (const s of [1, -1]) {
      const horn = mesh(new THREE.ConeGeometry(.17, 1.25, 10), m, .5 * s, 1.55, 0);
      horn.rotation.z = -.55 * s;
      const tip = mesh(new THREE.ConeGeometry(.08, .55, 8), m, .5 * s + .38 * s, 2.2, 0);
      tip.rotation.z = .35 * s;
      g.add(horn, tip);
    }
  } else if (kind === "crown") {
    const gold = material("#ffcf3d", { metalness: .7, roughness: .3, emissive: new THREE.Color("#4a3200"), emissiveIntensity: .5 });
    g.add(mesh(new THREE.BoxGeometry(1.1, .26, 1.1), gold, 0, 1.38, 0));
    for (const [x, z] of [[-.42, -.42], [.42, -.42], [-.42, .42], [.42, .42], [0, .5], [0, -.5], [.5, 0], [-.5, 0]]) g.add(mesh(new THREE.BoxGeometry(.2, .3, .2), gold, x, 1.62, z));
    g.add(mesh(new THREE.BoxGeometry(.22, .22, .06), material("#ff2a3a", { emissive: new THREE.Color("#ff2a3a"), emissiveIntensity: .6 }), 0, 1.4, .56));
  } else if (kind === "valk") {
    const helm = material("#b06bff", { metalness: .5, roughness: .35 }), wing = material("#ffffff", { roughness: .5 });
    g.add(mesh(new RoundedBoxGeometry(1.32, .55, 1.32, 2, .2), helm, 0, 1.12, 0));
    for (const s of [1, -1]) { const w = mesh(new RoundedBoxGeometry(.12, .9, .62, 2, .05), wing, .72 * s, 1.5, -.1); w.rotation.z = -.5 * s; g.add(w); }
  } else return null;
  return g;
}

/* --- your real avatar: the avatar-3d OBJ on the same skeleton -------------------
   Roblox's export is one posed (arms-down) avatar in world space: feet at y≈100,
   facing -z, one `PlayerN` group per body part (15 for R15, 6 for R6 — and the
   numbering differs between avatars) plus `HandleN` accessories. Parts are told
   apart by geometry, not by name: the head is the highest, the torso sits on
   x≈0, everything else splits by side (+x is the avatar's right) and height.
   Each part is re-hung on its joint with attach(), so the world shape is kept. */
export function rigFromObj(obj, info = {}) {
  obj.updateMatrixWorld(true);
  const meshes = [];
  obj.traverse((m) => { if (m.isMesh && m.geometry?.attributes?.position) meshes.push(m); });
  if (!meshes.length) throw new Error("empty avatar mesh");
  let body = meshes.filter((m) => /^player\d*$/i.test(m.name));
  if (!body.length) body = meshes.filter((m) => !/^handle\d*$/i.test(m.name));
  const acc = meshes.filter((m) => !body.includes(m));

  // normalise: feet on 0, centred, ≈5.2 studs tall, facing +z (character's right → -x)
  const box = new THREE.Box3();
  for (const m of body) box.expandByObject(m);
  const centre = box.getCenter(new THREE.Vector3()), H = box.max.y - box.min.y || 5.2, scale = 5.2 / H;
  const norm = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeScale(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  const prep = (m) => { const g = m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, m.matrixWorld)); g.computeBoundingBox(); const n = new THREE.Mesh(g, m.material); n.name = m.name; return n; };
  const parts = body.map(prep), accs = acc.map(prep);
  const C = (m) => m.geometry.boundingBox.getCenter(new THREE.Vector3());
  const BB = (m) => m.geometry.boundingBox;

  // classify (validated on real exports): head = highest part, torso = parts on x≈0,
  // then per side bottom-up: R15 = foot, lower leg, upper leg, hand, lower arm, upper arm; R6 = leg, arm
  const head = parts.reduce((a, m) => (C(m).y > C(a).y ? m : a));
  const rest = parts.filter((m) => m !== head);
  const torsoParts = rest.filter((m) => Math.abs(C(m).x) < .12);
  const limbs = rest.filter((m) => !torsoParts.includes(m));
  const torsoBox = new THREE.Box3(); for (const m of torsoParts) torsoBox.union(BB(m));
  const side = (m) => (C(m).x > 0 ? "L" : "R");                 // after the turn: the character's left is +x
  const arms = { L: [], R: [] }, legs = { L: [], R: [] };
  const r15 = parts.length > 6;
  for (const s of ["L", "R"]) {
    const list = limbs.filter((m) => side(m) === s).sort((a, b) => C(a).y - C(b).y);
    const nLeg = r15 ? Math.min(3, Math.max(1, list.length - 1)) : Math.min(1, list.length);
    legs[s] = list.slice(0, nLeg); arms[s] = list.slice(nLeg);
  }
  const span = (list) => { const b = new THREE.Box3(); for (const m of list) b.union(BB(m)); return b; };
  const legTop = Math.max(...["L", "R"].filter((s) => legs[s].length).map((s) => span(legs[s]).max.y), 0);
  const yHip = torsoParts.length ? Math.max(torsoBox.min.y, Math.min(legTop, torsoBox.min.y + .6)) : legTop || 2;

  // joints
  const neckY = BB(head).min.y;
  // shoulder: top-centre of the upper arm, a little down (15% of its height on R15)
  const jointOf = (list, fallback) => {
    if (!list.length) return fallback;
    const b = BB(list[list.length - 1]), c = b.getCenter(new THREE.Vector3());
    return new THREE.Vector3(c.x, b.max.y - (r15 ? (b.max.y - b.min.y) * .15 : Math.min(.5, (b.max.x - b.min.x) * .5)), c.z);
  };
  const J = {
    pelvis: new THREE.Vector3(0, yHip, torsoParts.length ? torsoBox.getCenter(new THREE.Vector3()).z : 0),
    neck: new THREE.Vector3(0, neckY, C(head).z),
    shL: jointOf(arms.L, new THREE.Vector3(1.5, 3.5, 0)), shR: jointOf(arms.R, new THREE.Vector3(-1.5, 3.5, 0)),
    hipL: legs.L.length ? new THREE.Vector3(span(legs.L).getCenter(new THREE.Vector3()).x, yHip, span(legs.L).getCenter(new THREE.Vector3()).z) : new THREE.Vector3(.5, yHip, 0),
    hipR: legs.R.length ? new THREE.Vector3(span(legs.R).getCenter(new THREE.Vector3()).x, yHip, span(legs.R).getCenter(new THREE.Vector3()).z) : new THREE.Vector3(-.5, yHip, 0),
  };

  // skeleton at the joints, then attach() every part so its world shape stays put
  const root = group("root");
  const pelvis = group("pelvis", J.pelvis.x, J.pelvis.y, J.pelvis.z);
  const torso = group("torso");
  const at = (name, p, parentPos) => { const g = group(name); g.position.copy(p).sub(parentPos); return g; };
  const neck = at("neck", J.neck, J.pelvis), shL = at("shL", J.shL, J.pelvis), shR = at("shR", J.shR, J.pelvis);
  const hipL = at("hipL", J.hipL, J.pelvis), hipR = at("hipR", J.hipR, J.pelvis);
  root.add(pelvis); pelvis.add(torso, hipL, hipR); torso.add(neck, shL, shR);
  root.updateMatrixWorld(true);
  for (const m of torsoParts) torso.attach(m);
  neck.attach(head);
  // arms: exports hang anywhere from straight down to a 30° A-pose. Hang them from a `rest` group
  // that swings them vertical, so every clip reads the same on every body.
  const hang = {}, restAngle = {};
  for (const s of ["L", "R"]) {
    const sh = s === "L" ? shL : shR, list = arms[s];
    const g = group(`rest${s}`); sh.add(g); hang[s] = g;
    restAngle[s] = 0;
    if (!list.length) continue;
    const hand = list[0], hb = BB(hand), J0 = s === "L" ? J.shL : J.shR;
    const d = new THREE.Vector3(hb.getCenter(new THREE.Vector3()).x, hb.min.y, hb.getCenter(new THREE.Vector3()).z).sub(J0);
    restAngle[s] = clampN(Math.atan2(d.x, -d.y), -.7, .7);
  }
  root.updateMatrixWorld(true);
  for (const m of arms.L) hang.L.attach(m);
  for (const m of arms.R) hang.R.attach(m);
  for (const m of legs.L) hipL.attach(m);
  for (const m of legs.R) hipR.attach(m);
  // accessories ride on whatever they sit nearest (hats on the head, wings on the torso …)
  for (const m of accs) {
    const c = C(m);
    const host = c.y >= neckY - .2 ? neck : Math.abs(c.x) > torsoBox.max.x + .15 && c.y > yHip ? (c.x > 0 ? hang.L : hang.R) : c.y < yHip ? (c.x > 0 ? hipL : hipR) : torso;
    host.attach(m);
  }

  // the hands: knuckles + finger in the hand's own colour, at the bottom of each arm
  for (const s of ["L", "R"]) {
    const list = arms[s], J0 = s === "L" ? J.shL : J.shR;
    const hand = list[0] || null, hb = hand ? BB(hand) : null;
    const w = hb ? Math.min(1.1, Math.max(.45, hb.max.x - hb.min.x)) : 1, dpt = hb ? Math.min(1.1, Math.max(.45, hb.max.z - hb.min.z)) : 1;
    const fist = buildFist(`fist${s}`, material(sampleColour(hand) || "#d9c4ad"), w, dpt, -2);
    if (hb) {
      const c = hb.getCenter(new THREE.Vector3());
      fist.position.set(c.x - J0.x, hb.min.y - J0.y + .05, c.z - J0.z);
      fist.rotation.z = restAngle[s];
    }
    hang[s].add(fist);
    hang[s].rotation.z = -restAngle[s];
  }
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  root.userData = { height: 5.2, top: Math.max(...[...parts, ...accs].map((m) => BB(m).max.y)), kind: "real", fov: info.camera?.fov };
  return root;
}

// the hand's colour: Kd if it has no texture, else the texture averaged over its lowest triangles
function sampleColour(m) {
  try {
    if (!m) return null;
    const mat = [].concat(m.material)[0];
    if (!mat) return null;
    if (!mat.map) return mat.color ? "#" + mat.color.getHexString() : null;
    const img = mat.map.image, uv = m.geometry.attributes.uv, pos = m.geometry.attributes.position;
    if (!img?.width || !uv) return mat.color ? "#" + mat.color.getHexString() : null;
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const x = cv.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const minY = m.geometry.boundingBox.min.y;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < pos.count && n < 40; i++) {
      if (pos.getY(i) > minY + .2) continue;
      const d = x.getImageData(Math.min(img.width - 1, Math.max(0, uv.getX(i) * img.width)) | 0, Math.min(img.height - 1, Math.max(0, (1 - uv.getY(i)) * img.height)) | 0, 1, 1).data;
      if (d[3] < 10) continue;
      r += d[0]; g += d[1]; b += d[2]; n++;
    }
    if (!n) return null;
    const c = new THREE.Color(`rgb(${(r / n) | 0}, ${(g / n) | 0}, ${(b / n) | 0})`);
    if (mat.color) c.multiply(mat.color);
    return "#" + c.getHexString();
  } catch { return null; }
}

/* --- poses + clips -----------------------------------------------------------
   A pose is joint rotations (radians, XYZ) plus a few scalars. Clips are pure
   functions of (clip time, song beats, kick) so they stay locked to the music. */
const Z3 = () => [0, 0, 0];
export const blankPose = () => ({ pelvis: Z3(), torso: Z3(), neck: Z3(), shL: Z3(), shR: Z3(), hipL: Z3(), hipR: Z3(), lift: 0, fingerR: 0, fingerL: 0 });
const pulse = (b, sharp = 6) => Math.exp(-((b - Math.floor(b)) * sharp));   // 1 on the beat, decays across it
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

export const CLIPS = {
  idle: (t) => ({ pelvis: [0, .1 * sin(t * .4), 0], neck: [.04 * sin(t * .9), .28 * sin(t * .37), 0], shL: [.05 * sin(t * 1.1), 0, .09 + .02 * sin(t * 2)], shR: [-.05 * sin(t * 1.1), 0, -.09 - .02 * sin(t * 2)], hipL: [0, 0, .03], hipR: [0, 0, -.03], lift: .03 * sin(t * 2) }),
  bob: (t, b) => { const p = pulse(b); return { pelvis: [.06 * p, 0, 0], neck: [.25 * p - .05, .18 * sin(t * .5), 0], shL: [.1, 0, .12], shR: [.1, 0, -.12], hipL: [0, 0, .04], hipR: [0, 0, -.04], lift: -.08 * p }; },
  point: (t, b, k) => ({ pelvis: [.08, -.25, 0], neck: [.05, -.15, .08], shR: [-1.58 - .08 * k, -.1, 0], shL: [.1, 0, .25], hipL: [0, 0, .05], hipR: [-.1, 0, -.08] }),
  flex: (t, b, k) => ({ pelvis: [-.06, 0, 0], neck: [-.15, 0, 0], shL: [-.35, 0, 2.35 + .1 * k], shR: [-.35, 0, -2.35 - .1 * k], hipL: [0, 0, .12], hipR: [0, 0, -.12] }),
  tpose: () => ({ shL: [0, 0, PI / 2], shR: [0, 0, -PI / 2], hipL: [0, 0, .02], hipR: [0, 0, -.02] }),
  flip: (t, b, k) => ({ pelvis: [.14 + .05 * k, .12, 0], neck: [-.08 + .05 * k, .1, .14], shR: [-2.55 - .14 * k, 0, -.14], shL: [-.15, 0, .62], hipL: [-.12, 0, .06], hipR: [.08, 0, -.1], fingerR: 1, lift: -.04 * k }),
  flip2: (t, b, k) => ({ pelvis: [.16 + .06 * k, 0, 0], neck: [-.1 + .06 * k, 0, 0], shR: [-2.5 - .14 * k, 0, -.18], shL: [-2.5 - .14 * k, 0, .18], hipL: [-.1, 0, .14], hipR: [.06, 0, -.14], fingerR: 1, fingerL: 1, lift: -.05 * k }),
  wave: (t) => ({ pelvis: [0, .2, 0], neck: [0, .2, -.1], shR: [-.2, 0, -2.7 + .38 * sin(t * 10)], shL: [0, 0, .12], hipL: [0, 0, .04], hipR: [0, 0, -.04] }),
  run: (t, b) => { const ph = b * PI; return { pelvis: [.24, 0, 0], neck: [-.15, 0, 0], hipL: [.95 * sin(ph), 0, 0], hipR: [-.95 * sin(ph), 0, 0], shL: [-1.05 * sin(ph), 0, .08], shR: [1.05 * sin(ph), 0, -.08], lift: .2 * Math.abs(sin(ph)) }; },
  moonwalk: (t, b) => { const ph = -b * PI; return { pelvis: [-.08, 0, 0], neck: [.1, 0, 0], hipL: [.5 * sin(ph), 0, 0], hipR: [-.5 * sin(ph), 0, 0], shL: [-.4 * sin(ph), 0, .2], shR: [.4 * sin(ph), 0, -.2], lift: .08 * Math.abs(sin(ph)) }; },
  dance: (t, b) => { const s = sin(b * PI), p = pulse(b); return { pelvis: [.05, .2 * s, .12 * s], neck: [.15 * p, .2 * s, 0], shL: [-.3, 0, 1.1 + 1.2 * Math.max(0, s)], shR: [-.3, 0, -1.1 - 1.2 * Math.max(0, -s)], hipL: [0, 0, .12], hipR: [0, 0, -.12], lift: .16 * p }; },
  headbang: (t, b, k) => { const p = pulse(b, 5); return { pelvis: [.22 + .38 * p, 0, 0], neck: [.15 + .55 * p, 0, 0], shL: [-.55 - .3 * p, 0, .35], shR: [-.75 - .3 * p, 0, -.3], hipL: [-.08, 0, .16], hipR: [.06, 0, -.16], lift: -.12 * p, fingerR: k > .8 ? 1 : 0 }; },
  sit: (t, b) => { const p = pulse(b); return { pelvis: [-.08, 0, 0], neck: [.18 * p, .25 * sin(t * .5), 0], hipL: [-PI / 2, 0, .06], hipR: [-PI / 2, 0, -.06], shL: [-.55, 0, .1], shR: [-.55, 0, -.1] }; },
  sitWave: (t, b) => ({ ...CLIPS.sit(t, b), shR: [-.2, 0, -2.7 + .38 * sin(t * 10)] }),
  sitFlip: (t, b, k) => ({ ...CLIPS.sit(t, b), shR: [-2.55 - .1 * k, 0, -.12], fingerR: 1, neck: [-.05, .1, .14] }),
  jump: () => ({ pelvis: [-.05, 0, 0], neck: [-.2, 0, 0], shL: [-.2, 0, 2.6], shR: [-.2, 0, -2.6], hipL: [-.25, 0, .2], hipR: [.2, 0, -.2] }),
  fall: (t) => ({ neck: [.4 * sin(t * 13), 0, 0], shL: [-.5, 0, 1.6 + .7 * sin(t * 21)], shR: [-.5, 0, -1.6 - .7 * sin(t * 19)], hipL: [.7 * sin(t * 17), 0, .3], hipR: [-.7 * sin(t * 17), 0, -.3] }),
  land: () => ({ pelvis: [.55, 0, 0], neck: [-.35, 0, 0], hipL: [-1.25, 0, .12], hipR: [.75, 0, -.12], shR: [.35, 0, -.25], shL: [-.4, 0, .95], lift: -.75 }),
  crouch: () => ({ pelvis: [.45, 0, 0], neck: [-.3, 0, 0], shL: [.45, 0, .2], shR: [.45, 0, -.2], hipL: [-.5, 0, .1], hipR: [-.5, 0, -.1], lift: -.45 }),
  lookup: (t) => ({ pelvis: [-.12, 0, 0], neck: [-.6, .15 * sin(t * 3), 0], shL: [-.25, 0, .55], shR: [-.25, 0, -.55], hipL: [0, 0, .12], hipR: [0, 0, -.12] }),
  ride: (t, b) => { const p = pulse(b); return { pelvis: [.12, .5, .1], neck: [-.1, -.3, 0], shL: [-.2, 0, 1.3 + .2 * p], shR: [.1, 0, -1.2 - .2 * p], hipL: [-.45, 0, .2], hipR: [.35, 0, -.2], lift: -.25 - .05 * p }; },
  showcase: (t, b) => { const s = Math.floor(b / 8) % 4; return s === 0 ? CLIPS.idle(t) : s === 1 ? CLIPS.flex(t, b, 0) : s === 2 ? CLIPS.dance(t, b) : CLIPS.flip(t, b, 0); },
};

export class Rig {
  constructor(root) {
    this.root = root;
    this.j = Object.fromEntries(JOINTS.map((n) => [n, root.getObjectByName(n)]));
    this.fist = { R: root.getObjectByName("fistR"), L: root.getObjectByName("fistL") };
    this.base = this.j.pelvis.position.y;
    this.cur = blankPose();
  }
  // ease every joint toward the target pose; rate in 1/s (snappy ≈ 18, a hit ≈ 40)
  update(target, dt, rate = 14) {
    const k = 1 - Math.exp(-dt * rate), cur = this.cur, tg = { ...blankPose(), ...target };
    for (const n of JOINTS) {
      const a = cur[n], b = tg[n];
      for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k;
      this.j[n].rotation.set(a[0], a[1], a[2]);
    }
    cur.lift += (tg.lift - cur.lift) * k;
    this.j.pelvis.position.y = this.base + cur.lift;
    for (const side of ["R", "L"]) {
      const key = `finger${side}`, f = this.fist[side];
      cur[key] += (tg[key] - cur[key]) * (1 - Math.exp(-dt * 22));
      if (!f) continue;
      const s = Math.max(.001, cur[key]);
      f.visible = s > .02;
      f.scale.setScalar(s);
    }
  }
}
