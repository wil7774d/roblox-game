/* ==========================================================================
   finalarc — data
   Config, small helpers, the preload registry and the live data:
     Roblox  → public web APIs through the roproxy CORS mirror (with fallbacks)
     Discord → Lanyard (https://github.com/Phineas/lanyard)
   app.js draws everything; audio.js plays the song; avatar3d.js is the 3D avatar.
   ========================================================================== */

const CONFIG = {
  robloxId: 461323235,
  discord: [
    { id: "1453897439043125350", name: "finalarcuser", label: "main" },
    { id: "1240134707153473577", name: "tjinooo", label: "alt" },
  ],
  // the original game — Roblox took it down, so its numbers are kept by hand.
  // reuploadPlaceId: the reupload's place id; leave null to use your most-visited public game.
  game: { peakCCU: 497, visits: 500000, reuploadPlaceId: null },
  // the avatar types these in Roblox bubble chat, one after another (the last one shows at the drop)
  bio: ["my game hit 497 players. roblox took it down.", "reuploaded. still building.", "cold."],
  location: "somewhere cold",
  // your time zone for the clock in the corner (e.g. "America/New_York"); null hides the clock
  timezone: null,
  // extra links next to Add Friend: { label, url, icon } — icon: youtube | tiktok | spotify | x | instagram | twitch | github | link
  socials: [],
  badgePages: 5,
  cacheMinutes: 10,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const compact = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const withTimeoutP = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
const mmss = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };

/* --------------------------------------------------------------------------
   Preload registry: every task reports progress; the joining screen waits on all of them
   -------------------------------------------------------------------------- */
const LOAD = {
  tasks: new Map(),
  add(id, weight, label) { this.tasks.set(id, { id, weight, label, p: 0, done: false, note: "" }); },
  set(id, p, note) { const t = this.tasks.get(id); if (!t || t.done) return; t.p = clamp(Math.max(t.p, p)); if (note != null) t.note = note; },
  done(id, note) { const t = this.tasks.get(id); if (!t) return; t.p = 1; t.done = true; if (note != null) t.note = note; },
  get progress() { let w = 0, s = 0; for (const t of this.tasks.values()) { w += t.weight; s += t.weight * t.p; } return w ? s / w : 1; },
  get complete() { for (const t of this.tasks.values()) if (!t.done) return false; return true; },
  get current() { for (const t of this.tasks.values()) if (!t.done) return t; return null; },
};
LOAD.add("track", 45, "Loading the song");
LOAD.add("roblox", 15, "Syncing Roblox");
LOAD.add("images", 15, "Loading your avatar");
LOAD.add("fonts", 5, "Loading fonts");
LOAD.add("avatar3d", 20, "Building the 3D avatar");
window.LOAD = LOAD;

withTimeoutP(Promise.all(["800 44px Montserrat", "700 15px Inter", "500 14px Inter"].map((f) => document.fonts?.load(f).catch(() => {}))), 6000).then(() => LOAD.done("fonts"));

// load + decode images before the gate opens, so nothing pops in afterwards
function preloadImages(urls, task = "images") {
  const list = [...new Set(urls.filter(Boolean))];
  if (!list.length) { LOAD.done(task); return Promise.resolve(); }
  let n = 0;
  return Promise.all(list.map((src) => withTimeoutP(new Promise((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(res);
    img.onerror = res;
    img.src = src;
  }), 9000).then(() => LOAD.set(task, ++n / list.length, `${n} / ${list.length}`)))).then(() => LOAD.done(task));
}

/* --------------------------------------------------------------------------
   Networking
   -------------------------------------------------------------------------- */
function withTimeout(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
async function getJSON(url, ms = 9000, init = {}) {
  const r = await fetch(url, { ...init, signal: withTimeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
// Roblox's API hosts send no CORS headers, so go through mirrors in order
async function rbx(sub, path) {
  const direct = `https://${sub}.roblox.com${path}`;
  const routes = [`https://${sub}.roproxy.com${path}`, `https://corsproxy.io/?url=${encodeURIComponent(direct)}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`];
  let err;
  for (const u of routes) { try { return await getJSON(u); } catch (e) { err = e; } }
  throw err;
}
async function rbxPost(sub, path, body) {
  const direct = `https://${sub}.roblox.com${path}`;
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let err;
  for (const u of [`https://${sub}.roproxy.com${path}`, `https://corsproxy.io/?url=${encodeURIComponent(direct)}`]) {
    try { return await getJSON(u, 7000, init); } catch (e) { err = e; }
  }
  throw err;
}

const cache = {
  key: `fa-cache-v3-${CONFIG.robloxId}`,
  get() { try { const raw = JSON.parse(localStorage.getItem(this.key)); if (raw && Date.now() - raw.t < CONFIG.cacheMinutes * 60e3) return raw.d; } catch {} return null; },
  set(d) { try { localStorage.setItem(this.key, JSON.stringify({ t: Date.now(), d })); } catch {} },
};

/* --------------------------------------------------------------------------
   Roblox
   -------------------------------------------------------------------------- */
async function fetchRoblox() {
  const cached = cache.get();
  if (cached) return cached;
  const id = CONFIG.robloxId, safe = (p) => p.catch(() => null);
  const [user, friends, followers, following, headshot, avatar, groups, games, wearing] = await Promise.all([
    safe(rbx("users", `/v1/users/${id}`)),
    safe(rbx("friends", `/v1/users/${id}/friends/count`)),
    safe(rbx("friends", `/v1/users/${id}/followers/count`)),
    safe(rbx("friends", `/v1/users/${id}/followings/count`)),
    safe(rbx("thumbnails", `/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png&isCircular=false`)),
    safe(rbx("thumbnails", `/v1/users/avatar?userIds=${id}&size=720x720&format=Png&isCircular=false`)),
    safe(rbx("groups", `/v2/users/${id}/groups/roles`)),
    safe(rbx("games", `/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`)),
    safe(rbx("avatar", `/v1/users/${id}/currently-wearing`)),
  ]);
  let badges = 0, capped = false, cursor = "";
  for (let i = 0; i < CONFIG.badgePages; i++) {
    const page = await safe(rbx("badges", `/v1/users/${id}/badges?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ""}`));
    if (!page) break;
    badges += (page.data || []).length;
    cursor = page.nextPageCursor;
    if (!cursor) break;
    if (i === CONFIG.badgePages - 1) capped = true;
  }
  const wearIds = (wearing?.assetIds || []).slice(0, 24);
  const wearIcons = wearIds.length ? await safe(rbx("thumbnails", `/v1/assets?assetIds=${wearIds.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)) : null;
  const icons = Object.fromEntries((wearIcons?.data || []).map((t) => [t.targetId, t.imageUrl]));
  const data = {
    user: user ? { name: user.name, displayName: user.displayName, created: user.created, verified: !!user.hasVerifiedBadge, description: user.description || "" } : null,
    friends: friends?.count ?? null,
    followers: followers?.count ?? null,
    following: following?.count ?? null,
    headshot: headshot?.data?.[0]?.imageUrl || null,
    avatar: avatar?.data?.[0]?.imageUrl || null,
    badges: badges || null, badgesCapped: capped,
    groups: groups?.data ? groups.data.length : null,
    games: (games?.data || []).map((g) => ({ name: g.name, visits: g.placeVisits || 0, place: g.rootPlace?.id || null })).sort((a, b) => b.visits - a.visits),
    wearing: wearIds.map((a) => ({ id: a, icon: icons[a] })).filter((w) => w.icon),
  };
  if (data.user) cache.set(data);
  return data;
}

// presence: 0 offline · 1 online · 2 in game · 3 in Studio (what the public API will tell us)
async function fetchPresence() {
  try {
    const r = await rbxPost("presence", "/v1/presence/users", { userIds: [CONFIG.robloxId] });
    const p = r?.userPresences?.[0];
    return p ? { type: p.userPresenceType, where: p.lastLocation || "" } : null;
  } catch { return null; }
}

/* --------------------------------------------------------------------------
   Discord (Lanyard)
   -------------------------------------------------------------------------- */
async function fetchLanyard(id) {
  try {
    const res = await getJSON(`https://api.lanyard.rest/v1/users/${id}`, 8000);
    return res.success ? res.data : null;
  } catch { return null; }
}
function discordAvatar(u, fallbackId) {
  if (u?.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=128`;
  let i = 0;
  try { i = Number((BigInt(u?.id || fallbackId) >> 22n) % 6n); } catch {}
  return `https://cdn.discordapp.com/embed/avatars/${i}.png`;
}
