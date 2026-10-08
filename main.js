/* ==========================================================================
   finalarc — main
   No dependencies. Live data:
     Roblox  → public web APIs via roproxy (CORS mirror), with proxy fallbacks
     Discord → Lanyard (https://github.com/Phineas/lanyard)
   ========================================================================== */

const CONFIG = {
  robloxId: 461323235,
  discord: [
    { id: "1453897439043125350", name: "finalarcuser", label: "main" },
    { id: "1240134707153473577", name: "tjinooo", label: "alt" },
  ],
  // the original game — taken down by Roblox, so these are kept by hand
  game: { peakCCU: 497, visits: 500000 },
  // a few of the avatar assets; price in Robux
  items: [
    { name: "Stormbreaker Horns", price: 30000, tag: "offsale", art: "horns", hue: 198 },
    { name: "Headless Horseman", price: 31000, tag: "bundle", art: "headless", hue: 26 },
    { name: "Opal King of Knight", price: 50000, tag: "rare", art: "helm", hue: 165 },
    { name: "Violet Valkyrie", price: 50000, tag: "hat", art: "valk", hue: 272 },
    { name: "8-Bit Crown", price: 30000, tag: "hat", art: "crown", hue: 46 },
    { name: "Pactbreaker Bundle", price: 30000, tag: "bundle", art: "pact", hue: 352 },
    { name: "Korblox Deathspeaker", price: 17000, tag: "bundle", art: "korblox", hue: 222 },
  ],
  badgePages: 5,          // up to 100 badges per page
  recentBadges: 12,
  cacheMinutes: 10,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - t, 4);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const compact = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const withTimeoutP = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

/* --------------------------------------------------------------------------
   Preload: every asset reports here, and the gate only opens once all of it
   is in — the track, roblox, every picture, the fonts, the 3d engine and the
   avatar — so nothing loads (or stutters) mid-show.
   -------------------------------------------------------------------------- */
const LOAD = {
  tasks: new Map(),
  add(id, weight, label) { this.tasks.set(id, { id, weight, label, p: 0, done: false, note: "" }); },
  set(id, p, note) { const t = this.tasks.get(id); if (!t || t.done) return; t.p = clamp(p); if (note != null) t.note = note; },
  done(id, note) { const t = this.tasks.get(id); if (!t || t.done) return; t.p = 1; t.done = true; t.note = note ?? ""; },
  get progress() { let w = 0, s = 0; for (const t of this.tasks.values()) { w += t.weight; s += t.weight * t.p; } return w ? s / w : 1; },
  get complete() { for (const t of this.tasks.values()) if (!t.done) return false; return true; },
  get current() { let best = null; for (const t of this.tasks.values()) if (!t.done && (!best || t.weight * (1 - t.p) > best.weight * (1 - best.p))) best = t; return best; },
};
LOAD.add("track", 40, "loading the track");
LOAD.add("roblox", 12, "syncing roblox");
LOAD.add("images", 8, "pictures");
LOAD.add("fonts", 4, "fonts");
LOAD.add("three", 8, "3d engine");
LOAD.add("avatar", 20, "building your avatar");
LOAD.add("warm", 8, "warming up");
window.LOAD = LOAD;

withTimeoutP(Promise.all([
  "900 1em 'Inter Tight'", "800 1em 'Inter Tight'", "700 1em 'Inter Tight'", "600 1em 'Inter Tight'", "500 1em 'Inter Tight'", "400 1em 'Inter Tight'",
  "italic 400 1em 'Instrument Serif'", "500 1em 'JetBrains Mono'", "400 1em 'JetBrains Mono'",
].map((f) => document.fonts?.load(f).catch(() => {}))), 7000).then(() => LOAD.done("fonts"));

// fetch + decode every picture up front so none of them pops in during the show
function preloadImages(urls) {
  const list = [...new Set(urls.filter(Boolean))];
  if (!list.length) { LOAD.done("images"); return Promise.resolve(); }
  let n = 0;
  return Promise.all(list.map((u) => withTimeoutP(new Promise((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(res);
    img.onerror = res;
    img.src = u;
  }), 8000).then(() => LOAD.set("images", ++n / list.length, `${n} / ${list.length}`)))).then(() => LOAD.done("images"));
}

/* --------------------------------------------------------------------------
   Networking
   -------------------------------------------------------------------------- */
function withTimeout(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function getJSON(url, ms = 9000) {
  const r = await fetch(url, { signal: withTimeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// Roblox's own API hosts don't send CORS headers, so try mirrors in order.
async function rbx(sub, path) {
  const direct = `https://${sub}.roblox.com${path}`;
  const routes = [
    `https://${sub}.roproxy.com${path}`,
    `https://corsproxy.io/?url=${encodeURIComponent(direct)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`,
  ];
  let err;
  for (const u of routes) {
    try { return await getJSON(u); } catch (e) { err = e; }
  }
  throw err;
}

const cache = {
  key: `fa-cache-v2-${CONFIG.robloxId}`,
  get() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key));
      if (raw && Date.now() - raw.t < CONFIG.cacheMinutes * 60e3) return raw.d;
    } catch {}
    return null;
  },
  set(d) { try { localStorage.setItem(this.key, JSON.stringify({ t: Date.now(), d })); } catch {} },
};

/* --------------------------------------------------------------------------
   Roblox data
   -------------------------------------------------------------------------- */
async function fetchRoblox() {
  const cached = cache.get();
  if (cached) return cached;

  const id = CONFIG.robloxId;
  const safe = (p) => p.catch(() => null);

  const [user, friends, followers, following, headshot, avatar, groups, games, names, wearing] = await Promise.all([
    safe(rbx("users", `/v1/users/${id}`)),
    safe(rbx("friends", `/v1/users/${id}/friends/count`)),
    safe(rbx("friends", `/v1/users/${id}/followers/count`)),
    safe(rbx("friends", `/v1/users/${id}/followings/count`)),
    safe(rbx("thumbnails", `/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png&isCircular=false`)),
    safe(rbx("thumbnails", `/v1/users/avatar?userIds=${id}&size=720x720&format=Png&isCircular=false`)),
    safe(rbx("groups", `/v2/users/${id}/groups/roles`)),
    safe(rbx("games", `/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`)),
    safe(rbx("users", `/v1/users/${id}/username-history?limit=100&sortOrder=Asc`)),
    safe(rbx("avatar", `/v1/users/${id}/currently-wearing`)),
  ]);

  // badges — paginate
  let badges = [], cursor = "", capped = false;
  for (let i = 0; i < CONFIG.badgePages; i++) {
    const page = await safe(rbx("badges", `/v1/users/${id}/badges?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ""}`));
    if (!page) break;
    badges.push(...(page.data || []));
    cursor = page.nextPageCursor;
    if (!cursor) break;
    if (i === CONFIG.badgePages - 1) capped = true;
  }

  // icons for recent badges + groups
  const recent = badges.slice(0, CONFIG.recentBadges);
  const groupList = groups?.data || [];
  const wearIds = (wearing?.assetIds || []).slice(0, 30);
  const [badgeIcons, groupIcons, wearIcons] = await Promise.all([
    recent.length ? safe(rbx("thumbnails", `/v1/badges/icons?badgeIds=${recent.map((b) => b.id).join(",")}&size=150x150&format=Png&isCircular=false`)) : null,
    groupList.length ? safe(rbx("thumbnails", `/v1/groups/icons?groupIds=${groupList.map((g) => g.group.id).join(",")}&size=150x150&format=Png&isCircular=false`)) : null,
    wearIds.length ? safe(rbx("thumbnails", `/v1/assets?assetIds=${wearIds.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)) : null,
  ]);
  const iconMap = (res) => Object.fromEntries((res?.data || []).map((t) => [t.targetId, t.imageUrl]));
  const bIcons = iconMap(badgeIcons), gIcons = iconMap(groupIcons);

  const data = {
    user,
    friends: friends?.count ?? null,
    followers: followers?.count ?? null,
    following: following?.count ?? null,
    headshot: headshot?.data?.[0]?.imageUrl || null,
    avatar: avatar?.data?.[0]?.imageUrl || null,
    badgeCount: badges.length,
    badgesCapped: capped,
    recentBadges: recent.map((b) => ({ id: b.id, name: b.displayName || b.name, game: b.awardingUniverse?.name || "", icon: bIcons[b.id] || null })),
    groups: groupList
      .map((g) => ({ id: g.group.id, name: g.group.name, members: g.group.memberCount, role: g.role?.name, rank: g.role?.rank, icon: gIcons[g.group.id] || null }))
      .sort((a, b) => b.rank - a.rank),
    games: (games?.data || []).map((g) => ({ name: g.name, visits: g.placeVisits || 0 })),
    names: (names?.data || []).map((n) => n.name),
    wearing: (wearIcons?.data || []).filter((t) => t.imageUrl).map((t) => ({ id: t.targetId, icon: t.imageUrl })),
  };
  if (data.user) cache.set(data);
  return data;
}

function renderRoblox(d) {
  const u = d.user;
  const created = u ? new Date(u.created) : null;
  const days = created ? Math.floor((Date.now() - created) / 864e5) : null;
  const years = days != null ? days / 365.25 : null;

  // hero card
  if (u) {
    setText("rbxDisplay", u.displayName);
    setText("rbxUser", u.name);
    $("#rbxVerified").hidden = !u.hasVerifiedBadge;
    setText("rbxBio", (u.description || "").trim() || "no bio — the stats speak for themselves.");
    setText("chipJoined", created.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toLowerCase());
    setText("chipAge", `${years.toFixed(1)}y`);
    setText("aDisplay", u.displayName);
    setText("aUser", "@" + u.name);
    setText("aCreated", created.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }).toLowerCase());
    setText("aWeekday", created.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase());
    document.title = `${u.displayName} — finalarc`;
  } else {
    setText("rbxUser", "roblox");
    setText("rbxBio", "live roblox data couldn't load right now — tap the button below to view the profile.");
  }
  setText("chipBadges", d.badgeCount ? fmt(d.badgeCount) + (d.badgesCapped ? "+" : "") : "—");

  loadImg($("#rbxHeadshot"), d.headshot);
  loadImg($("#rbxAvatar"), d.avatar);

  // stats
  const stat = (id, v) => { const el = document.getElementById(id); if (!el) return; el.dataset.to = v ?? ""; if (v == null) el.textContent = "—"; };
  stat("sAge", days);
  stat("sFriends", d.friends);
  stat("sFollowers", d.followers);
  stat("sFollowing", d.following);
  stat("sBadges", d.badgeCount || null);
  stat("sGroups", d.groups.length);
  const visits = d.games.reduce((a, g) => a + g.visits, 0);
  stat("sVisits", d.games.length ? visits : null);
  stat("sNames", d.names.length);

  if (years != null) {
    setText("sAgeF", `${years.toFixed(1)} years · since ${created.getFullYear()}`);
    // bar = share of roblox's life (public launch sep 2006)
    const life = (Date.now() - new Date("2006-09-01")) / 864e5;
    $("#sAgeBar").dataset.to = clamp(days / life);
  }
  if (d.followers != null && d.following != null) {
    const r = d.following ? d.followers / d.following : d.followers;
    setText("sRatio", `${r.toFixed(2)} follower : following ratio`);
  }
  setText("sBadgesPlus", d.badgesCapped ? "+" : "");
  if (years && d.badgeCount) setText("sBadgeRate", `≈ ${Math.round(d.badgeCount / years)} per year`);
  setText("sTopGroup", d.groups[0] ? `top rank · ${d.groups[0].role}` : "no public groups");
  setText("sGames", d.games.length ? `across ${d.games.length} public experience${d.games.length > 1 ? "s" : ""}` : "no public experiences");
  setText("sNamesF", d.names.length ? `first known as ${d.names[0]}` : "same name since day one");

  renderWearing(d.wearing || []);
  if (d.games.length && visits) setText("reVisits", `the reupload so far → ${fmt(visits)} visits and counting.`);
  renderBadges(d.recentBadges);
  renderGroups(d.groups);
  renderInsights(d, { created, days, years, visits });
}

function loadImg(img, src) {
  if (!img || !src) return;
  img.onload = () => img.classList.add("loaded");
  img.src = src;
}

function renderBadges(list) {
  const el = $("#badges");
  if (!list.length) { el.innerHTML = `<p class="empty mono">no public badges to show.</p>`; return; }
  el.innerHTML = list.map((b, i) => `
    <article class="badge card" style="--i:${i % 6}" data-tilt>
      <div class="badge__img">${b.icon ? `<img src="${esc(b.icon)}" alt="" decoding="async">` : ""}</div>
      <div class="badge__name">${esc(b.name)}</div>
      <div class="badge__game mono">${esc(b.game || "roblox")}</div>
    </article>`).join("");
  observeReveal($$(".badge", el));
  if (state.entered) $$(".badge", el).forEach((b) => setTimeout(() => b.classList.add("tilt-live"), 1500));
  bindTilt($$(".badge", el));
}

function renderWearing(list) {
  if (!list.length) return;
  $("#wearing").innerHTML = list.map((a) => `<a href="https://www.roblox.com/catalog/${a.id}" target="_blank" rel="noopener" data-cursor="view"><img src="${esc(a.icon)}" alt="" decoding="async"></a>`).join("");
  $("#wearingWrap").hidden = false;
  bindCursor($$("[data-cursor]", $("#wearing")));
  layout();
}

/* --------------------------------------------------------------------------
   Closet
   -------------------------------------------------------------------------- */
const ART = {
  horns: `<path d="M30 72C10 56 11 26 27 11c-2 19 4 36 16 46"/><path d="M70 72c20-16 19-46 3-61 2 19-4 36-16 46"/><path d="M53 36 44 54h10l-8 20" stroke-width="3.5"/>`,
  headless: `<circle cx="50" cy="34" r="17" stroke-dasharray="3 6"/><ellipse cx="50" cy="62" rx="22" ry="7"/><path d="M28 62v10c0 9 44 9 44 0V62"/><path d="M44 58c2-6 10-6 12 0" opacity=".6"/>`,
  helm: `<path d="M28 82V46c0-22 44-22 44 0v36z"/><path d="M28 54h44M50 54v28M36 62h8M56 62h8"/><path d="M50 25c2-12 14-17 24-15-6 3-10 8-12 14"/>`,
  valk: `<path d="M37 76V50c0-16 26-16 26 0v26"/><path d="M37 52C22 46 13 31 11 17c10 8 19 12 27 23"/><path d="M63 52c15-6 24-21 26-35-10 8-19 12-27 23"/><path d="M43 58h14M50 58v14"/>`,
  crown: `<path d="M18 72V34h8v8h8v8h8V28h16v22h8v-8h8v-8h8v38z"/><path d="M18 80h64"/><rect x="46" y="56" width="8" height="8" fill="currentColor"/><rect x="28" y="60" width="6" height="6" fill="currentColor" opacity=".7"/><rect x="66" y="60" width="6" height="6" fill="currentColor" opacity=".7"/>`,
  pact: `<rect x="10" y="40" width="34" height="20" rx="10"/><rect x="56" y="40" width="34" height="20" rx="10"/><path d="M50 30l4 8-6 6 7 8-5 8 3 8" stroke-width="2.5"/><path d="M30 24 50 12l20 12M30 76l20 12 20-12" opacity=".5"/>`,
  korblox: `<path d="M41 10h18l-3 30 4 30 9 16H43l3-16-4-30z"/><circle cx="50" cy="40" r="5"/><circle cx="52" cy="70" r="5"/><path d="M47 22h6M47 52h6" opacity=".6"/>`,
};

function renderCloset() {
  const items = CONFIG.items;
  const total = items.reduce((a, i) => a + i.price, 0);
  $("#closetTotal").dataset.to = total;
  setText("closetUsd", `≈ $${fmt(total * 0.01)}+ in real money`);
  $("#items").innerHTML = items.map((it, i) => `
    <article class="item card" style="--hue:${it.hue};--i:${i % 4}" data-tilt>
      <div class="item__glow"></div>
      <div class="item__holo"></div>
      <div class="item__top mono"><span>${String(i + 1).padStart(2, "0")}</span><span class="item__tag${it.tag === "offsale" ? " item__tag--off" : ""}">${esc(it.tag)}</span></div>
      <div class="item__art"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ART[it.art] || ""}</svg></div>
      <div class="item__name">${esc(it.name)}</div>
      <div class="item__price"><i>R$</i>${fmt(it.price)}</div>
    </article>`).join("");
  observeReveal($$(".item"));
  const closetIO = new IntersectionObserver(([e]) => { if (e.isIntersecting && state.entered) { countUp($("#closetTotal")); closetIO.disconnect(); } }, { threshold: .4 });
  closetIO.observe($(".closet__total"));
}

function renderGroups(list) {
  const el = $("#groups");
  if (!list.length) { el.innerHTML = `<li class="empty mono">no public groups.</li>`; return; }
  el.innerHTML = list.slice(0, 10).map((g) => `
    <li class="group" data-reveal>
      <a href="https://www.roblox.com/communities/${g.id}" target="_blank" rel="noopener" data-cursor="open">
        ${g.icon ? `<img src="${esc(g.icon)}" alt="" decoding="async">` : `<img alt="">`}
        <span class="group__name">${esc(g.name)}</span>
        <span class="group__role mono">${esc(g.role || "member")}</span>
        <span class="group__members mono">${compact(g.members || 0)} members</span>
        <span class="group__go" aria-hidden="true">↗</span>
      </a>
    </li>`).join("");
  observeReveal($$(".group", el));
  bindCursor($$("[data-cursor]", el));
}

function renderInsights(d, { created, days, years, visits }) {
  const out = [];
  if (created) {
    const wd = created.toLocaleDateString("en-US", { weekday: "long" });
    const my = created.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    out.push(`Joined Roblox on a <b>${wd}</b> in <b>${my}</b> — that's <b>${fmt(days)} days</b>, or <em>${years.toFixed(1)} years</em> on the platform.`);
  }
  out.push(`The original game peaked at <b>${fmt(CONFIG.game.peakCCU)}</b> concurrent players and <b>${compact(CONFIG.game.visits)}</b> visits — until one sign got it <em>taken down.</em>`);
  const worth = CONFIG.items.reduce((a, i) => a + i.price, 0);
  const top = [...CONFIG.items].sort((a, b) => b.price - a.price)[0];
  out.push(`Wearing <b>R$ ${compact(worth)}+</b> across just ${CONFIG.items.length} listed pieces — the priciest, <em>${esc(top.name)}</em>, runs <b>R$ ${compact(top.price)}</b>.`);
  if (d.badgeCount && years) {
    const every = Math.max(1, Math.round(days / d.badgeCount));
    out.push(`${d.badgesCapped ? "At least" : "Exactly"} <b>${fmt(d.badgeCount)} badges</b> collected — one roughly every <b>${every} day${every > 1 ? "s" : ""}</b>.`);
  }
  if (d.followers != null && d.following != null) {
    const more = d.followers >= d.following;
    out.push(`<b>${fmt(d.followers)}</b> followers vs <b>${fmt(d.following)}</b> following — <em>${more ? "more watched than watching." : "more watching than watched."}</em>`);
  }
  if (d.groups.length) {
    const g = d.groups[0];
    out.push(`Highest standing: <b>${esc(g.role)}</b> in <b>${esc(g.name)}</b>, a community of <b>${compact(g.members)}</b>.`);
  }
  if (d.recentBadges[0]?.game) out.push(`Most recently spotted earning badges in <b>${esc(d.recentBadges[0].game)}</b>.`);
  if (d.games.length) {
    const top = [...d.games].sort((a, b) => b.visits - a.visits)[0];
    out.push(`Built <b>${d.games.length}</b> public experience${d.games.length > 1 ? "s" : ""} with <b>${compact(visits)}</b> total visits — top pick: <em>${esc(top.name)}</em>.`);
  }
  if (d.names.length) out.push(`Has gone by <b>${d.names.length}</b> other name${d.names.length > 1 ? "s" : ""} — originally <em>${esc(d.names[0])}</em>.`);
  if (!out.length) out.push(`Live insights are offline right now — <em>check back in a moment.</em>`);

  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  $("#insightsList").innerHTML = out.map((t, i) => `<li class="insight" data-reveal><span class="insight__n mono">${roman[i]}</span><p>${t}</p></li>`).join("");
  observeReveal($$("#insightsList .insight"));
}

/* --------------------------------------------------------------------------
   Discord (Lanyard)
   -------------------------------------------------------------------------- */
const STATUS_TXT = { online: "online", idle: "idle", dnd: "do not disturb", offline: "offline" };

function renderDiscordCards() {
  $("#dcDuo").innerHTML = CONFIG.discord.map((acc, i) => `
    <article class="card dc${i ? " dc--alt" : ""}" data-dc="${acc.id}" data-tilt>
      <div class="dc__banner"><div class="dc__banner-art"></div><span class="dc__tag mono">${esc(acc.label)}</span></div>
      <div class="dc__body">
        <div class="dc__avatar">
          <img class="dc-av" alt="" decoding="async">
          <span class="dc__initial dc-initial">${esc(acc.name[0].toUpperCase())}</span>
          <span class="status-dot status-dot--lg dc-status"></span>
        </div>
        <div class="dc__who">
          <div class="dc__name dc-name">${esc(acc.name)}</div>
          <div class="dc__user mono dc-user">${esc(acc.name)}</div>
        </div>
        <div class="dc__custom dc-custom"></div>
        <div class="dc__activity dc-activity">
          <div class="dc__label mono">status</div>
          <div class="dc__act-empty">checking presence…</div>
        </div>
        <div class="dc__actions">
          <button class="btn btn--solid" type="button" data-copy="${esc(acc.name)}" data-cursor="copy" data-magnetic><span class="btn__txt">copy username</span></button>
          <a class="btn" href="https://discord.com/users/${acc.id}" target="_blank" rel="noopener" data-cursor="open" data-magnetic>open profile ↗</a>
        </div>
        <div class="dc__id mono">id · ${acc.id}</div>
      </div>
    </article>`).join("");
}

async function loadDiscordAccount(acc, card, isMain) {
  const q = (c) => $(c, card);
  let p;
  try {
    const res = await getJSON(`https://api.lanyard.rest/v1/users/${acc.id}`, 8000);
    if (!res.success) throw 0;
    p = res.data;
  } catch {
    if (isMain) setStatus(null);
    if (!card.dataset.live) q(".dc-activity").innerHTML = `<div class="dc__label mono">status</div><div class="dc__act-empty">presence is warming up — add me in the meantime.</div>`;
    return;
  }
  card.dataset.live = "1";

  const u = p.discord_user || {};
  if (isMain) setStatus(p.discord_status);
  q(".dc-status").dataset.s = p.discord_status || "offline";
  q(".dc-name").textContent = u.global_name || u.display_name || u.username || acc.name;
  q(".dc-user").textContent = u.username || acc.name;
  q(".dc-initial").textContent = (u.global_name || u.username || acc.name)[0].toUpperCase();
  if (u.avatar) {
    const ext = u.avatar.startsWith("a_") ? "gif" : "png";
    const src = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=256`;
    if (q(".dc-av").getAttribute("src") !== src) loadImg(q(".dc-av"), src);
  }

  const acts = p.activities || [];
  const custom = acts.find((a) => a.type === 4);
  q(".dc-custom").textContent = custom ? [custom.emoji?.name, custom.state].filter(Boolean).join(" ") : "";

  const box = q(".dc-activity");
  if (p.listening_to_spotify && p.spotify) {
    const sp = p.spotify;
    box.innerHTML = `<div class="dc__label mono">listening to spotify</div>
      <div class="dc__act"><img src="${esc(sp.album_art_url)}" alt="">
        <div style="min-width:0"><div class="dc__act-title">${esc(sp.song)}</div><div class="dc__act-sub">by ${esc(sp.artist)}</div>
        <div class="dc__prog"><span class="sp-prog"></span></div></div></div>`;
    spotify.set(card, sp.timestamps);
    return;
  }
  spotify.delete(card);
  const game = acts.find((a) => a.type === 0 || a.type === 1 || a.type === 3);
  if (game) {
    let img = "";
    const li = game.assets?.large_image;
    if (li) img = li.startsWith("mp:") ? `https://media.discordapp.net/${li.slice(3)}` : `https://cdn.discordapp.com/app-assets/${game.application_id}/${li}.png`;
    box.innerHTML = `<div class="dc__label mono">${game.type === 1 ? "streaming" : game.type === 3 ? "watching" : "playing"}</div>
      <div class="dc__act">${img ? `<img src="${esc(img)}" alt="">` : `<img alt="">`}
        <div style="min-width:0"><div class="dc__act-title">${esc(game.name)}</div>
        ${game.details ? `<div class="dc__act-sub">${esc(game.details)}</div>` : ""}${game.state ? `<div class="dc__act-sub">${esc(game.state)}</div>` : ""}</div></div>`;
    return;
  }
  box.innerHTML = `<div class="dc__label mono">status</div><div class="dc__act-empty">${p.discord_status === "offline" ? "offline right now — drop a request anyway." : `${STATUS_TXT[p.discord_status]} and not doing much. say hi.`}</div>`;
}

function loadDiscord() {
  CONFIG.discord.forEach((acc, i) => {
    const card = $(`[data-dc="${acc.id}"]`);
    if (card) loadDiscordAccount(acc, card, i === 0);
  });
}

const spotify = new Map();
function tickSpotify() {
  for (const [card, { start, end }] of spotify) {
    const el = $(".sp-prog", card);
    if (el) el.style.transform = `scaleX(${clamp((Date.now() - start) / (end - start))})`;
  }
}

function setStatus(s) {
  const el = document.getElementById("heroStatus");
  if (el) el.dataset.s = s || "offline";
  setText("heroStatusTxt", s ? STATUS_TXT[s] : "unknown");
}

/* --------------------------------------------------------------------------
   WebGL artwork — a living arc of light through domain-warped smoke
   -------------------------------------------------------------------------- */
const GL = (() => {
  const canvas = $("#gl");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) { document.documentElement.classList.add("no-webgl"); return null; }

  const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
  const fs = `
  precision highp float;
  uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uScroll; uniform float uIntro; uniform float uVel; uniform float uBlood;
  // the music: 64-band spectrum + what the show is doing right now
  uniform sampler2D uSpec; uniform float uKick; uniform float uLevel; uniform float uTension; uniform float uDrop; uniform float uShock; uniform float uRewind; uniform float uAudio; uniform float uDark;

  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0., a = .5;
    mat2 r = mat2(.8,.6,-.6,.8);
    for(int i=0;i<4;i++){ v += a*noise(p); p = r*p*2.02 + 3.1; a *= .5; }
    return v;
  }
  mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

  float spec(float x){ return texture2D(uSpec, vec2(clamp(x, 0., 1.) * .97 + .015, .5)).r; }

  void main(){
    vec2 uv = (gl_FragCoord.xy - .5*uRes) / uRes.y;
    // tape rewind / hard cuts: tracking wobble + torn bands
    if (uRewind > .001) {
      float tear = step(.84, noise(vec2(floor(uv.y * 16.), floor(uTime * 26.))));
      uv.x += ((noise(vec2(uv.y * 34., uTime * 40.)) - .5) * .05 + tear * .09) * uRewind;
    }
    float t = uTime * .06;

    // smoke
    vec2 q = vec2(fbm(uv*1.3 + t), fbm(uv*1.3 - t + 5.2));
    vec2 r = vec2(fbm(uv*1.7 + 2.2*q + vec2(1.7, 9.2) + .15*uMouse + t*.7), fbm(uv*1.7 + 2.2*q + vec2(8.3, 2.8) - t*.5));
    float f = fbm(uv*1.4 + 2.4*r);

    // palette drifts as you scroll
    vec3 ember  = vec3(1.0, .30, .17);
    vec3 amber  = vec3(1.0, .56, .24);
    vec3 violet = vec3(.49, .36, 1.0);
    vec3 deep   = vec3(.10, .05, .20);
    float s = uScroll;
    vec3 a1 = mix(ember, violet, smoothstep(.15, .55, s));
    a1 = mix(a1, amber, smoothstep(.65, .95, s));
    vec3 a2 = mix(violet, ember, smoothstep(.3, .8, s));

    // the takedown — everything bleeds
    a1 = mix(a1, vec3(.8, .03, .06), uBlood);
    a2 = mix(a2, vec3(.38, .0, .03), uBlood);
    deep = mix(deep, vec3(.2, .0, .025), uBlood);

    vec3 col = vec3(.022, .022, .03);
    col += deep * smoothstep(.2, .9, f) * 1.4;
    col += a2 * pow(clamp(length(r), 0., 1.), 3.) * .22;

    // the arc
    vec2 au = uv;
    au -= uMouse * .04;
    au *= rot(sin(s * 3.14159) * .9 - .25 + s * .6);
    vec2 c = vec2(0., -1.05 + .35 * sin(s * 6.2832));
    // the arc breathes with the kick and tightens through every run-up
    float rad = mix(.55, 1.0, uIntro) + .08 * sin(uTime*.25) - uTension * .1 + uKick * .03;
    vec2 d = au - c + (q - .5) * .12;
    d.x += uBlood * (noise(vec2(d.y * 34., uTime * 7.)) - .5) * .06;
    float L = length(d);
    float ang = atan(d.x, d.y);
    // the arc IS the spectrum: bass at the crown, highs out at the tips, mirrored
    float sp = spec(abs(ang) / 1.9) * uAudio;
    float amp = .045 + .09 * uLevel + .05 * uTension;
    float outer = rad + sp * amp, inner = rad - sp * amp * .55;
    float ring = abs(L - outer);
    float ring2 = abs(L - inner);
    float span = smoothstep(1.9, .2, abs(ang)) * uIntro;
    // cracked arc: gaps + flicker while bleeding
    span *= 1. - uBlood * smoothstep(.1, .02, abs(ang - .35));
    span *= 1. - uBlood * smoothstep(.07, .01, abs(ang + .62));
    span *= 1. - uBlood * .6 * step(.9, hash(vec2(floor(uTime * 14.), 7.)));
    float boost = 1. + uKick * .9 + uTension * .9 + uDrop * 1.4;
    float core = .0025 / (ring + .002);
    float glow = .03 / (ring + .03);
    col += a1 * (core * .9 + glow * .45) * span * boost;
    col += vec3(1.) * smoothstep(.004, 0., ring) * span * .6;
    // the echo line inside + the energy between them
    col += a1 * (.0014 / (ring2 + .002)) * span * uAudio * .6;
    float fill = smoothstep(outer + .004, outer - .004, L) * smoothstep(inner - .004, inner + .004, L);
    col += mix(a1, vec3(1.), .25) * fill * span * uAudio * (.1 + uKick * .12);
    // shockwave off every drop
    if (uShock < 2.6) {
      float sw = abs(L - (rad + uShock * 1.7));
      col += mix(a1, vec3(1., .2, .15), .5) * (.014 / (sw + .014)) * (1. - uShock / 2.6) * smoothstep(2.6, .3, abs(ang));
    }

    // light bleed from under the arc
    float under = smoothstep(rad, rad - .9, L) * span;
    col += a1 * under * f * (.25 + uLevel * .12 + uKick * .15);

    // streaks on fast scroll
    col += a1 * smoothstep(.97, 1., noise(vec2(uv.y * 80., t*2.))) * clamp(abs(uVel), 0., 1.) * .25;

    // vignette + dither
    col = mix(col, vec3(dot(col, vec3(.3, .59, .11))) * vec3(1.45, .3, .32), uBlood * .55);
    col += vec3(1., .3, .22) * uDrop * .16;
    col *= 1. - (.55 + uTension * .35) * dot(uv*.75, uv*.75) - uBlood * .2 * dot(uv, uv);
    col *= 1. - uDark * .92;
    col += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
    gl_FragColor = vec4(col, 1.);
  }`;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
  } catch (e) {
    console.warn("webgl", e);
    document.documentElement.classList.add("no-webgl");
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uRes", "uTime", "uMouse", "uScroll", "uIntro", "uVel", "uBlood", "uSpec", "uKick", "uLevel", "uTension", "uDrop", "uShock", "uRewind", "uAudio", "uDark"]) U[n] = gl.getUniformLocation(prog, n);

  // the spectrum lives in a 64×1 texture, refreshed every frame
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(64));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U.uSpec, 0);

  // smoke is soft by nature: it renders below screen resolution, and lower still if frames run long
  let quality = 2;
  function resize() {
    const scale = [.42, .58, innerWidth < 760 ? .66 : .78][quality];
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * scale;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  return {
    setQuality(q) { quality = q; resize(); },
    draw({ time, mx, my, scroll, intro, vel, blood, spec, kick = 0, level = 0, tension = 0, drop = 0, shock = 9, rewind = 0, audio = 0, dark = 0 }) {
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform2f(U.uMouse, mx, my);
      gl.uniform1f(U.uScroll, scroll);
      gl.uniform1f(U.uIntro, intro);
      gl.uniform1f(U.uVel, vel);
      gl.uniform1f(U.uBlood, blood);
      if (spec) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, spec);
      gl.uniform1f(U.uKick, kick);
      gl.uniform1f(U.uLevel, level);
      gl.uniform1f(U.uTension, tension);
      gl.uniform1f(U.uDrop, drop);
      gl.uniform1f(U.uShock, shock);
      gl.uniform1f(U.uRewind, rewind);
      gl.uniform1f(U.uAudio, audio);
      gl.uniform1f(U.uDark, dark);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
})();

/* --------------------------------------------------------------------------
   Text splitting + reveals
   -------------------------------------------------------------------------- */
function split(el) {
  const mode = el.dataset.split;
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  if (mode === "chars") {
    el.innerHTML = [...text].map((ch, i) => `<span class="c" aria-hidden="true"><span style="--i:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</span></span>`).join("");
  } else {
    el.innerHTML = text.split(/\s+/).filter(Boolean).map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`).join(" ");
  }
}
renderDiscordCards();
$$("[data-split]").forEach(split);

// while the track plays, things land on the next beat instead of whenever they scroll in
const reveal = (el) => (window.SHOW ? window.SHOW.onNextBeat(() => el.classList.add("is-in")) : el.classList.add("is-in"));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 });
function observeReveal(els) { els.forEach((el) => io.observe(el)); }
renderCloset();

// text scramble — eyebrows decode themselves when they appear
const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ァカサタナ";
function scramble(el) {
  const text = el.dataset.txt || (el.dataset.txt = el.textContent);
  if (reduced) return;
  let f = 0;
  const total = 18 + text.length;
  clearInterval(el._scr);
  el._scr = setInterval(() => {
    f++;
    const reveal = (f / total) * text.length * 1.4;
    el.textContent = [...text].map((ch, i) => (ch === " " || i < reveal - 4 ? ch : i < reveal ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : "\u00a0")).join("");
    if (f >= total) { el.textContent = text; clearInterval(el._scr); }
  }, 32);
}
$$(".eyebrow, .manifesto__eyebrow").forEach((eb) => {
  const node = [...eb.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!node) return;
  const span = document.createElement("span");
  span.className = "scr";
  span.textContent = node.textContent.trim();
  eb.replaceChild(span, node);
  eb.insertBefore(document.createTextNode(" "), span);
});
const scrIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting && !e.target.closest(".saga__chap")) { scramble(e.target); scrIO.unobserve(e.target); }
}, { threshold: 1 });

// manifesto: word-by-word scrub
const manifesto = $("#manifesto");
const HL = new Set(["template.", "live", "single", "move"]);
manifesto.innerHTML = manifesto.textContent.trim().split(/\s+/).map((w) => `<span class="mw${HL.has(w.toLowerCase()) ? " hl" : ""}">${esc(w)}</span>`).join(" ");
const mWords = $$(".mw", manifesto);

/* --------------------------------------------------------------------------
   Pointer: cursor, magnetic buttons, card tilt — one delegated listener set,
   all motion eased in the frame loop (no per-event transform jumps)
   -------------------------------------------------------------------------- */
const pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, in: false };
const cur = { x: pointer.x, y: pointer.y, rx: pointer.x, ry: pointer.y, w: 34, h: 34, r: 17, down: 0, stick: null, label: "", vis: 0 };
const cursorEl = $(".cursor"), dotEl = $(".cursor__dot"), ringEl = $(".cursor__ring"), tagEl = $(".cursor-tag");
const hasCursor = finePointer && !reduced;
if (hasCursor) document.documentElement.classList.add("has-cursor");

const STICK = ".btn, [data-magnetic], .gate__enter, .gate__quiet, .np, .deck button, .stage__play";
let hoverEl = null, tiltEl = null, magEl = null;

addEventListener("pointermove", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.in = true;
  pointer.nx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
  // glow follows the pointer on every card
  const card = e.target.closest?.(".card");
  if (card) {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }
  const t = e.target.closest?.("[data-tilt]");
  if (t !== tiltEl) { tiltEl?.classList.remove("is-hover"); tiltEl = t; t?.classList.add("is-hover"); }
}, { passive: true });
document.addEventListener("pointerleave", () => { pointer.in = false; });
addEventListener("pointerdown", () => (cur.down = 1));
addEventListener("pointerup", () => (cur.down = 0));

document.addEventListener("pointerover", (e) => {
  const el = e.target.closest?.(`[data-cursor], ${STICK}, a, button, [role=slider]`);
  if (el === hoverEl) return;
  hoverEl = el;
  cur.stick = el && el.matches(STICK) ? el : null;
  cur.label = el && !cur.stick ? el.dataset.cursor || "" : "";
  cursorEl.classList.toggle("is-link", !!el && !cur.stick && !cur.label);
  cursorEl.classList.toggle("is-label", !!cur.label);
  cursorEl.classList.toggle("is-stuck", !!cur.stick);
  tagEl.textContent = cur.label;
  tagEl.classList.toggle("is-on", !!cur.label);
  const m = el?.closest("[data-magnetic]") || null;
  if (m && !m.querySelector(":scope > .btn__in")) {
    const inner = document.createElement("span");
    inner.className = "btn__in";
    while (m.firstChild) inner.append(m.firstChild);
    m.append(inner);
  }
  magEl = m;
});
function bindCursor() {}   // delegated: kept so late-rendered markup can call it harmlessly
function bindTilt() {}

const mags = new Map(), tilts = new Map();
function pointerFrame(dt) {
  const k = (b) => 1 - Math.pow(1 - b, dt * 60);
  // magnetic: the button leans toward the pointer, its label leans a bit further
  if (hasCursor && magEl && !mags.has(magEl)) mags.set(magEl, { x: 0, y: 0, inner: $(":scope > .btn__in", magEl) });
  for (const [el, s] of mags) {
    let tx = 0, ty = 0;
    if (el === magEl && hasCursor && el.isConnected) {
      const r = el.getBoundingClientRect();
      tx = (pointer.x - (r.left + r.width / 2 - s.x)) * .22;
      ty = (pointer.y - (r.top + r.height / 2 - s.y)) * .32;
    }
    s.x = lerp(s.x, tx, k(.16)); s.y = lerp(s.y, ty, k(.16));
    if (el !== magEl && Math.abs(s.x) + Math.abs(s.y) < .05) { el.style.transform = ""; if (s.inner) s.inner.style.transform = ""; mags.delete(el); continue; }
    el.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
    if (s.inner) s.inner.style.transform = `translate3d(${(s.x * .45).toFixed(2)}px, ${(s.y * .45).toFixed(2)}px, 0)`;
  }
  // tilt: small, eased, and only once a card has finished revealing
  if (tiltEl && hasCursor && tiltEl.classList.contains("tilt-live") && !tilts.has(tiltEl)) tilts.set(tiltEl, { rx: 0, ry: 0 });
  for (const [el, s] of tilts) {
    let rx = 0, ry = 0;
    if (el === tiltEl && el.isConnected) {
      const r = el.getBoundingClientRect();
      const px = clamp((pointer.x - r.left) / r.width), py = clamp((pointer.y - r.top) / r.height);
      rx = (.5 - py) * 6; ry = (px - .5) * 8;
    }
    s.rx = lerp(s.rx, rx, k(.12)); s.ry = lerp(s.ry, ry, k(.12));
    if (el !== tiltEl && Math.abs(s.rx) + Math.abs(s.ry) < .02) { el.style.transform = ""; el.classList.remove("is-tilting"); tilts.delete(el); continue; }
    el.classList.add("is-tilting");
    el.style.transform = `perspective(900px) rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg)`;
  }
  if (!hasCursor) return;
  // cursor: dot tracks tight, ring trails — and wraps whatever button you're on
  cur.vis = lerp(cur.vis, pointer.in ? 1 : 0, k(.2));
  cur.x = lerp(cur.x, pointer.x, k(.55)); cur.y = lerp(cur.y, pointer.y, k(.55));
  let tx = pointer.x, ty = pointer.y, tw = 34, th = 34, tr = 17;
  if (cur.stick && cur.stick.isConnected) {
    const r = cur.stick.getBoundingClientRect();
    tx = r.left + r.width / 2; ty = r.top + r.height / 2;
    tw = r.width + 12; th = r.height + 12; tr = th / 2;
  } else if (cur.label) { tw = th = 64; tr = 32; }
  else if (cursorEl.classList.contains("is-link")) { tw = th = 46; tr = 23; }
  const f = cur.stick ? .3 : .2;
  cur.rx = lerp(cur.rx, tx, k(f)); cur.ry = lerp(cur.ry, ty, k(f));
  cur.w = lerp(cur.w, tw, k(.22)); cur.h = lerp(cur.h, th, k(.22)); cur.r = lerp(cur.r, tr, k(.22));
  const kick = window.SHOW?.F.on ? window.SHOW.F.kick : 0;
  dotEl.style.transform = `translate3d(${(cur.x - 3).toFixed(1)}px, ${(cur.y - 3).toFixed(1)}px, 0) scale(${(cur.down ? .5 : 1) * (cur.stick ? .8 : 1)})`;
  ringEl.style.transform = `translate3d(${(cur.rx - cur.w / 2).toFixed(1)}px, ${(cur.ry - cur.h / 2).toFixed(1)}px, 0)`;
  ringEl.style.width = `${cur.w.toFixed(1)}px`;
  ringEl.style.height = `${cur.h.toFixed(1)}px`;
  ringEl.style.borderRadius = `${cur.r.toFixed(1)}px`;
  ringEl.style.opacity = (cur.vis * (cur.stick ? .9 : .55 + kick * .45)).toFixed(3);
  dotEl.style.opacity = cur.vis.toFixed(3);
  tagEl.style.transform = `translate3d(${(cur.x + 20).toFixed(1)}px, ${(cur.y + 18).toFixed(1)}px, 0)`;
}

const toast = $("#toast");
let toastT;
function say(msg, ms = 2400) { toast.textContent = msg; toast.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("is-on"), ms); }
$$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  const v = b.dataset.copy;
  try { await navigator.clipboard.writeText(v); }
  catch { const t = document.createElement("textarea"); t.value = v; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  say(`copied “${v}” — add me on discord`);
}));

/* --------------------------------------------------------------------------
   Scroll engine
   -------------------------------------------------------------------------- */
const scenes = {
  manifesto: $('[data-scene="manifesto"]'),
  stats: $('[data-scene="stats"]'),
  avatar: $('[data-scene="avatar"]'),
  saga: $('[data-scene="saga"]'),
};

/* --- saga: blood splatter + drips, generated once --- */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function splatSVG(seed) {
  const R = rng(seed), n = 34, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 26 + R() * 7;
    if (R() < .3) r += 8 + R() * 18;            // tendrils
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  // closed catmull-rom → bezier
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  let drops = "";
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, dist = 40 + R() * 30, r = .6 + R() * 3.6;
    const x = 50 + Math.cos(a) * dist, y = 50 + Math.sin(a) * dist;
    if (R() < .35) drops += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 2.6).toFixed(1)}" ry="${(r * .8).toFixed(1)}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    else drops += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  }
  return `<svg viewBox="0 0 100 100"><defs><radialGradient id="sg${seed}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#c3141d"/><stop offset=".6" stop-color="#7d0710"/><stop offset="1" stop-color="#3d0207"/></radialGradient></defs><g fill="url(#sg${seed})"><path d="${d}"/>${drops}</g><path d="${d}" fill="none" stroke="rgba(255,120,120,.18)" stroke-width=".6" transform="translate(-.8 -.8)"/></svg>`;
}
const SPLATS = [
  { x: -6, y: 8, s: 34, r: 20, d: 0, o: .85 }, { x: 70, y: -8, s: 30, r: -40, d: .08, o: .8 },
  { x: 78, y: 56, s: 26, r: 110, d: .16, o: .75 }, { x: 4, y: 62, s: 22, r: 200, d: .22, o: .7 },
  { x: 40, y: 74, s: 16, r: 60, d: .3, o: .6 }, { x: 52, y: 10, s: 12, r: 10, d: .36, o: .55 },
];
$("#splats").innerHTML = SPLATS.map((p, i) => `<div class="splat" style="left:${p.x}%;top:${p.y}%;width:${p.s}vw;height:${p.s}vw;--r:${p.r}deg;--d:${p.d}s;--o:${p.o}">${splatSVG(i * 97 + 13)}</div>`).join("");
const drips = (() => {
  const R = rng(4242), out = [];
  for (let i = 0; i < 26; i++) {
    const el = document.createElement("div");
    el.className = "drip";
    el.style.left = `${(i / 26) * 100 + R() * 3}%`;
    el.style.setProperty("--w", `${4 + R() * 11}px`);
    $("#drips").append(el);
    out.push({ el, max: 6 + Math.pow(R(), 1.6) * 46, delay: R() * .55 });
  }
  return out;
})();
const saga = {
  root: scenes.saga, sticky: $(".saga .sticky"),
  chaps: $$(".saga__chap"), hud: $$(".saga__hud span"),
  dripsBox: $("#drips"),
  active: -1, prog: 0, fallen: false,
};

/* --- saga: the player chart ---
   Drawn at the real pixel size (no stretched viewBox), so the peak marker sits
   exactly on the peak. The shape is a reconstruction; the 497 is the record. */
const chart = (() => {
  const box = $("#sagaChart");
  const PEAK = CONFIG.game.peakCCU, YMAX = 550, XPEAK = .56, XRE = .645, DAY = .04;
  const R = rng(497);
  const lg = (x) => 1 / (1 + Math.exp(-(x - .34) * 13));
  const ph = Math.PI / 2 - (XPEAK / DAY) * Math.PI * 2;      // a daily high lands on the peak
  const rise = [], re = [];
  for (let i = 0; i <= 240; i++) {
    const x = (i / 240) * XPEAK;
    const base = (lg(x) - lg(0)) / (lg(XPEAK) - lg(0));
    const day = Math.sin((x / DAY) * Math.PI * 2 + ph);
    const v = (base * (1 + .075 * day * (.3 + .7 * base))) / 1.075 + (i < 240 ? (R() - .5) * .018 * base : 0);
    rise.push([x, i < 240 ? clamp(v, 0, .985) * PEAK : PEAK]);
  }
  for (let i = 0; i <= 120; i++) {
    const x = XRE + (i / 120) * (1 - XRE);
    const base = 1 - Math.exp(-(x - XRE) * 10);
    const day = Math.sin((x / DAY) * Math.PI * 2 + 1.1);
    re.push([x, Math.max(0, base * (.055 + .01 * day) * PEAK + (R() - .5) * 2 * base)]);
  }

  let W = 0, H = 0, els = null, riseLen = 1, drawn = 0, reDrawn = 0;
  const L = 46, RP = 16, TP = 40, BP = 34;
  const sx = (x) => L + x * (W - L - RP);
  const sy = (v) => TP + (1 - v / YMAX) * (H - TP - BP);
  const pathOf = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join("");

  function build() {
    if (!box) return;
    W = box.clientWidth; H = box.clientHeight;
    if (!W || !H) return;
    const px = sx(XPEAK), py = sy(PEAK), base = sy(0);
    const grid = [0, 100, 200, 300, 400, 500].map((v) =>
      `<path class="ch__grid${v ? "" : " ch__grid--zero"}" d="M${L} ${sy(v).toFixed(1)}H${W - RP}"/><text class="ch__y" x="${L - 12}" y="${sy(v).toFixed(1)}">${v}</text>`).join("");
    box.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <defs>
          <linearGradient id="riseGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".34"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></linearGradient>
          <clipPath id="riseClip"><rect class="ch__clip" x="0" y="0" width="0" height="${H}"/></clipPath>
        </defs>
        ${grid}
        <text class="ch__y ch__unit" x="${L - 12}" y="${TP - 22}">ccu</text>
        <path class="ch__area" d="${pathOf(rise)}L${px.toFixed(1)} ${base.toFixed(1)}L${L} ${base.toFixed(1)}Z" fill="url(#riseGrad)" clip-path="url(#riseClip)"/>
        <path class="ch__line ch__rise" pathLength="1" d="${pathOf(rise)}"/>
        <path class="ch__line ch__cliff" pathLength="1" d="M${px.toFixed(1)} ${py.toFixed(1)}V${base.toFixed(1)}"/>
        <path class="ch__line ch__off" d="M${px.toFixed(1)} ${base.toFixed(1)}H${sx(XRE).toFixed(1)}"/>
        <path class="ch__line ch__re" pathLength="1" d="${pathOf(re)}"/>
        <line class="ch__cross" x1="0" x2="0" y1="${TP}" y2="${base.toFixed(1)}"/>
        <circle class="ch__head" r="4.5"/>
        <circle class="ch__dot" r="5"/>
        <g class="ch__peak" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><circle class="ch__peak-ring" r="13"/><circle class="ch__peak-dot" r="5.5"/></g>
        <text class="ch__x" x="${L}" y="${H - 10}" text-anchor="start">launch</text>
        <text class="ch__x ch__x--down" x="${px.toFixed(1)}" y="${H - 10}" text-anchor="middle">taken down</text>
        <text class="ch__x ch__x--off" x="${((px + sx(XRE)) / 2).toFixed(1)}" y="${(base - 10).toFixed(1)}" text-anchor="middle">offline</text>
        <text class="ch__x ch__x--re" x="${sx(XRE).toFixed(1)}" y="${H - 10}" text-anchor="start">reupload</text>
        <text class="ch__x" x="${W - RP}" y="${H - 10}" text-anchor="end">now</text>
      </svg>
      <div class="ch__label mono" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px"><b>${PEAK}</b> ccu · peak</div>
      <div class="ch__tip mono" hidden></div>
      <div class="ch__note mono">players online · shape reconstructed, peak exact</div>`;
    els = {
      rise: $(".ch__rise", box), cliff: $(".ch__cliff", box), off: $(".ch__off", box), re: $(".ch__re", box),
      area: $(".ch__area", box), clip: $(".ch__clip", box), head: $(".ch__head", box), dot: $(".ch__dot", box), cross: $(".ch__cross", box), tip: $(".ch__tip", box),
    };
    riseLen = els.rise.getTotalLength();
  }

  function update(p) {
    if (!els) return;
    drawn = clamp(p / .2);
    reDrawn = clamp((p - .77) / .18);
    els.rise.style.strokeDashoffset = 1 - drawn;
    if (drawn > .002 && drawn < .998) {
      const pt = els.rise.getPointAtLength(drawn * riseLen);
      els.head.setAttribute("cx", pt.x.toFixed(1)); els.head.setAttribute("cy", pt.y.toFixed(1));
      els.head.style.opacity = 1;
      els.clip.setAttribute("width", pt.x.toFixed(1));
    } else {
      els.head.style.opacity = 0;
      els.clip.setAttribute("width", drawn >= .998 ? W : 0);
    }
    els.area.style.opacity = clamp((p - .05) / .15) * (1 - smooth(.5, .56, p) * .7);
    box.classList.toggle("has-peak", p > .195);
    els.cliff.style.strokeDashoffset = 1 - clamp((p - .5) / .02);
    els.off.style.opacity = clamp((p - .52) / .05);
    els.re.style.strokeDashoffset = 1 - reDrawn;
    box.classList.toggle("is-down", p > .5);
    box.classList.toggle("has-re", reDrawn > .05);
  }

  // crosshair: snaps to the curve, only over the part that's been drawn
  function hover(e) {
    if (!els) return;
    const r = box.getBoundingClientRect();
    const x = clamp((e.clientX - r.left - L) / (W - L - RP));
    let v = null, label = "";
    // the peak already wears its own label: light that up instead of stacking a second one
    const atPeak = box.classList.contains("has-peak") && Math.abs(x - XPEAK) < .012;
    box.classList.toggle("is-peak", atPeak);
    if (atPeak) return leave(true);
    if (x <= XPEAK && x <= drawn * XPEAK + .002) {
      const pt = rise[Math.round((x / XPEAK) * 240)];
      v = pt[1];
      label = pt[1] === PEAK ? `<b>${PEAK}</b> ccu · the peak` : `≈ <b>${Math.round(v / 10) * 10}</b> ccu`;
    } else if (x > XPEAK && x < XRE && box.classList.contains("is-down")) {
      v = 0; label = "<b>0</b> · taken down";
    } else if (x >= XRE && x <= XRE + reDrawn * (1 - XRE)) {
      v = re[Math.round(((x - XRE) / (1 - XRE)) * 120)][1]; label = "the reupload";
    }
    if (v == null) return leave();
    const X = sx(x), Y = sy(v);
    els.cross.setAttribute("x1", X.toFixed(1)); els.cross.setAttribute("x2", X.toFixed(1));
    els.dot.setAttribute("cx", X.toFixed(1)); els.dot.setAttribute("cy", Y.toFixed(1));
    els.tip.innerHTML = label;
    els.tip.style.transform = `translate(${X.toFixed(1)}px, ${Y.toFixed(1)}px)`;
    els.tip.hidden = false;
    box.classList.add("is-hover");
  }
  function leave(keepPeak) { if (!els) return; els.tip.hidden = true; box.classList.remove("is-hover"); if (keepPeak !== true) box.classList.remove("is-peak"); }
  box?.addEventListener("pointermove", hover);
  box?.addEventListener("pointerleave", leave);
  // where the line is being drawn right now, and the peak — in viewport pixels (the 3d avatar rides them)
  const centreOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const headPoint = () => (els && drawn > .002 && drawn < .998 ? centreOf(els.head) : els && drawn >= .998 ? peakPoint() : null);
  const peakPoint = () => (els ? centreOf($(".ch__peak-dot", box)) : null);
  return { build, update, headPoint, peakPoint };
})();
const track = $("#statsTrack");
const statCards = $$(".stat", track);
const hero = { l1: $(".hero__line--1"), l2: $(".hero__line--2"), title: $(".hero__title"), grid: $(".hero__grid") };
const avatarEls = { stage: $(".avatar__stage"), ring: $(".avatar__ring"), word: $(".avatar__bgword"), capL: $(".avatar__cap--l"), capR: $(".avatar__cap--r") };
const marquee = $("#marquee");
const bloodwash = $(".bloodwash");
const labelled = $$("[data-label]");

/* --------------------------------------------------------------------------
   View: the whole page is one fixed layer moved by a GPU transform, so motion
   is sub-pixel smooth and never fights the browser's own scrolling.
   • autopilot owns it: the show sets view.target every frame (a smooth spline
     through the song) and a stiff spring follows it; native scroll is locked.
   • by hand: native scroll sets the target and the view eases after it.
   Pinned ("sticky") scenes are pinned with transforms too.
   -------------------------------------------------------------------------- */
const mainEl = $("main");
const spacer = document.createElement("div");
spacer.className = "spacer";
spacer.setAttribute("aria-hidden", "true");
document.body.insertBefore(spacer, mainEl);
document.documentElement.classList.add("vscroll");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const view = {
  y: 0, v: 0, target: 0, max: 0, auto: false, layoutV: 0,
  cam: { x: 0, y: 0, s: 1, r: 0 },              // camera offsets from the show: shake, push-in
  lock(on) {
    if (on === this.auto) return;
    this.auto = on;
    document.documentElement.classList.toggle("is-locked", on);
    if (!on) { scrollTo(0, this.y); this.target = this.y; this.v = 0; }
  },
  jump(y) { this.target = this.y = clamp(y, 0, this.max); this.v = 0; },
};
const pins = $$(".scene").map((el) => ({ el, sticky: $(".sticky", el), top: 0, h: 0, off: -1 }));

// document position of anything inside main, transforms ignored
function docTop(el) { let y = 0; while (el && el !== mainEl) { y += el.offsetTop; el = el.offsetParent; } return y; }

function viewFrame(dt) {
  if (view.auto) {
    if (state.snap) { view.y = view.target; view.v = 0; }
    else {
      // critically damped spring: absorbs any seam in the path without lagging the music
      const w = 30, n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) { view.v += (w * w * (view.target - view.y) - 2 * w * view.v) * h; view.y += view.v * h; }
    }
  } else if (view.pre) {
    view.v = 0;
  } else {
    view.target = scrollY;
    view.y = Math.abs(view.target - view.y) < .05 ? view.target : lerp(view.y, view.target, reduced ? 1 : 1 - Math.pow(.86, dt * 60));
    view.v = 0;
  }
  view.y = clamp(view.y, 0, view.max);
  const c = view.cam, y = view.y;
  if (c.s !== 1 || c.r !== 0) {
    mainEl.style.transformOrigin = `50% ${(y + innerHeight / 2).toFixed(1)}px`;
    mainEl.style.transform = `translate3d(${c.x.toFixed(2)}px, ${(c.y - y).toFixed(2)}px, 0) scale(${c.s.toFixed(4)}) rotate(${c.r.toFixed(3)}deg)`;
  } else mainEl.style.transform = `translate3d(${c.x.toFixed(2)}px, ${(c.y - y).toFixed(2)}px, 0)`;
  for (const p of pins) {
    const off = clamp(y - p.top, 0, Math.max(0, p.h - innerHeight));
    if (Math.abs(off - p.off) > .01) { p.off = off; p.sticky.style.transform = `translate3d(0, ${off.toFixed(2)}px, 0)`; }
  }
}

let docH = 1, trackDist = 0, chartW = 0, chartH = 0;
const cardGeo = [];
function layout() {
  trackDist = Math.max(0, track.scrollWidth - innerWidth);
  scenes.stats.style.height = `${trackDist + innerHeight * 1.15}px`;
  const H = mainEl.offsetHeight;
  spacer.style.height = `${H}px`;
  docH = view.max = Math.max(1, H - innerHeight);
  for (const p of pins) { p.top = p.el.offsetTop; p.h = p.el.offsetHeight; p.off = -1; }
  cardGeo.length = 0;
  for (const c of statCards) cardGeo.push({ c, x: c.offsetLeft + track.offsetLeft, w: c.offsetWidth });
  const cb = $("#sagaChart");
  if (cb && (cb.clientWidth !== chartW || cb.clientHeight !== chartH)) { chartW = cb.clientWidth; chartH = cb.clientHeight; chart.build(); }
  view.layoutV++;
}
addEventListener("resize", layout);
addEventListener("load", layout);
document.fonts?.ready.then(layout);
layout();

function sceneProgress(el) {
  const top = el.offsetTop, h = el.offsetHeight - innerHeight;
  return h > 0 ? clamp((view.y - top) / h) : 0;
}

// keyboard users by hand: bring whatever gets focus into view
document.addEventListener("focusin", (e) => {
  if (view.auto || !mainEl.contains(e.target)) return;
  const r = e.target.getBoundingClientRect();
  if (r.top < 70 || r.bottom > innerHeight - 40) scrollTo(0, clamp(r.top + view.y - innerHeight * .35, 0, view.max));
});

function countUp(el) {
  if (!state.entered || el.dataset.done || el.dataset.to === undefined || el.dataset.to === "") return;
  el.dataset.done = "1";
  const to = +el.dataset.to, start = performance.now(), dur = reduced ? 1 : 1800;
  const big = (el.id === "sVisits" || el.id === "sLifetime" || el.hasAttribute("data-compact")) && to >= 1e5;
  const step = (now) => {
    const k = ease(clamp((now - start) / dur));
    el.textContent = big ? compact(to * k) : fmt(to * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// snap: set by the show on a hard cut so every eased value lands on the same frame
const state = { sy: 0, vel: 0, intro: 0, introTarget: 0, entered: false, mProg: 0, statsProg: 0, avProg: 0, marq: 0, blood: 0, snap: false };
const N_STATS = statCards.length;
setText("statsTotal", String(N_STATS).padStart(2, "0"));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function updateSaga(k) {
  const el = saga.root, h = el.offsetHeight - innerHeight;
  const raw = (view.y - el.offsetTop) / h;
  saga.prog = lerp(saga.prog, clamp(raw), k);
  const p = saga.prog;
  const inView = raw > -1 && raw < 1 + innerHeight / h;

  // chapters
  const ch = Math.min(3, Math.floor(clamp(raw) * 4));
  if (ch !== saga.active && inView) {
    saga.active = ch;
    saga.chaps.forEach((c, i) => c.classList.toggle("is-active", i === ch));
    const eb = $(".scr", saga.chaps[ch]);
    if (eb) scramble(eb);
    $$("[data-num]", saga.chaps[ch]).forEach(countUp);
  }
  saga.hud.forEach((s, i) => { s.classList.toggle("on", i === ch); s.style.setProperty("--f", clamp((p - i * .25) / .25)); });

  chart.update(p);

  // the fall: shake, splatter, drips
  const fallen = p > .5;
  if (fallen !== saga.fallen) {
    saga.fallen = fallen;
    el.classList.toggle("is-fallen", fallen);
    if (fallen && !reduced) { saga.sticky.classList.remove("shake"); void saga.sticky.offsetWidth; saga.sticky.classList.add("shake"); }
  }
  el.classList.toggle("is-splat", p > .52);
  const after = 1 - .65 * smooth(.76, .92, p);
  $("#splats").style.opacity = after;
  saga.dripsBox.style.opacity = after;
  const dk = clamp((p - .5) / .26);
  saga.dripsBox.style.setProperty("--drip-top", clamp(dk * 3));
  for (const d of drips) d.el.style.height = `${ease(clamp((dk - d.delay) / (1 - d.delay))) * d.max}vh`;

  // blood amount, fading out after the scene
  let b = smooth(.47, .56, p) * (1 - .62 * smooth(.76, .92, p));
  b *= 1 - clamp((view.y - (el.offsetTop + h)) / (innerHeight * .7));
  if (raw < 0) b = 0;
  return b;
}

let lastNow = performance.now();
const perf = { ema: 16.7, tier: 2, since: 0 };   // adaptive quality: 2 full, 1 lighter, 0 lightest
function frame(now) {
  const dt = clamp((now - lastNow) / 1000, .001, .1);
  lastNow = now;
  const show = window.SHOW;
  show?.preFrame(now, dt);          // song clock + features; autopilot sets view.target here
  viewFrame(dt);
  // the view is already smooth: everything that follows it can follow tightly
  const follow = (b) => (state.snap || reduced ? 1 : 1 - Math.pow(1 - Math.max(b, .35), dt * 60));
  const t = now / 1000;
  const prevSy = state.sy;
  state.sy = view.y;
  state.vel = state.snap ? 0 : lerp(state.vel, (state.sy - prevSy) / 40, .1);
  state.intro = lerp(state.intro, state.introTarget, .025);

  pointerFrame(dt);

  // progress
  const pageP = clamp(state.sy / docH);
  $("#progress").style.transform = `scaleY(${pageP})`;

  // hero parallax
  const hp = clamp(state.sy / innerHeight);
  if (!reduced && hp < 1.05) {
    hero.l1.style.transform = `translate3d(${-hp * 22}vw, ${hp * 8}vh, 0)`;
    hero.l2.style.transform = `translate3d(${hp * 22}vw, ${hp * 4}vh, 0)`;
    hero.title.style.opacity = 1 - hp * 1.1;
    hero.grid.style.transform = `translate3d(0, ${hp * -12}vh, 0)`;
    hero.grid.style.opacity = 1 - hp * 1.4;
  }

  // manifesto
  const mp = sceneProgress(scenes.manifesto);
  state.mProg = lerp(state.mProg, mp, follow(.15));
  const on = Math.floor(clamp(state.mProg * 1.25) * mWords.length);
  if (on !== state.mOn) { state.mOn = on; mWords.forEach((w, i) => w.classList.toggle("on", i < on)); }
  $(".manifesto__arc-line").style.strokeDashoffset = 850 * (1 - clamp(state.mProg * 1.3));

  // stats horizontal — card positions come from cached geometry, never from layout reads
  const sp = sceneProgress(scenes.stats);
  state.statsProg = lerp(state.statsProg, sp, follow(.1));
  const tx = -state.statsProg * trackDist;
  track.style.transform = `translate3d(${tx.toFixed(2)}px, 0, 0)`;
  $("#statsBar").style.transform = `scaleX(${state.statsProg})`;
  const idx = Math.min(N_STATS, Math.max(1, Math.ceil(state.statsProg * (N_STATS + .2))));
  setText("statsIdx", String(idx).padStart(2, "0"));
  const st = pins.find((p) => p.el === scenes.stats);
  if (st && view.y > st.top - innerHeight && view.y < st.top + st.h) {
    for (const g of cardGeo) {
      const left = g.x + tx, right = left + g.w;
      if (left < innerWidth * .92 && right > 0) {
        countUp($("[data-num]", g.c));
        const bar = $(".stat__bar span", g.c);
        if (bar && bar.dataset.to && !bar.dataset.done && state.entered) { bar.dataset.done = 1; bar.style.transform = `scaleX(${bar.dataset.to})`; }
      }
      if (!reduced && right > -200 && left < innerWidth + 200) {
        const center = (left + g.w / 2) / innerWidth - .5;
        g.c.style.transform = `perspective(1200px) rotateY(${(center * -14).toFixed(2)}deg) translateY(${(Math.abs(center) * 40).toFixed(1)}px)`;
      }
    }
  }

  // avatar
  const ap = sceneProgress(scenes.avatar);
  state.avProg = lerp(state.avProg, ap, follow(.1));
  const a = state.avProg;
  if (!reduced) {
    avatarEls.stage.style.transform = `translate3d(0, ${(1 - ease(clamp(a * 2))) * 30}vh, 0) scale(${.7 + ease(clamp(a * 2)) * .35})`;
    avatarEls.ring.style.transform = `rotate(${a * 260}deg) scale(${.8 + a * .35})`;
    avatarEls.word.style.transform = `translate3d(${(.5 - a) * 50}vw, 0, 0)`;
  }
  avatarEls.capL.style.opacity = clamp(a * 4 - .4);
  avatarEls.capL.style.transform = `translate3d(0, ${(1 - clamp(a * 4 - .4)) * 40}px, 0)`;
  avatarEls.capR.style.opacity = clamp(a * 4 - 1);
  avatarEls.capR.style.transform = `translate3d(0, ${(1 - clamp(a * 4 - 1)) * 40}px, 0)`;

  // marquee: rides the music, stops dead when the music does
  const F = show?.F;
  if (!F?.gap) state.marq -= ((reduced ? 0 : .6) + (F?.on ? F.level * 1.4 + F.kick * 3 : 0) + Math.abs(state.vel) * 6) * dt * 60;
  const mw = marquee.scrollWidth / 2;
  if (mw) marquee.style.transform = `translate3d(${(state.marq % mw).toFixed(2)}px, 0, 0)`;

  tickSpotify();

  // saga + blood theme (the wash reads --blood from its own element: no page-wide restyle)
  const blood = updateSaga(follow(.14));
  state.blood = lerp(state.blood, blood, state.snap || reduced ? 1 : 1 - Math.pow(.92, dt * 60));
  const bv = state.blood.toFixed(3);
  if (bv !== state.bv) { state.bv = bv; bloodwash.style.setProperty("--blood", bv); }
  document.documentElement.classList.toggle("blood", state.blood > .4);

  show?.postFrame(now, dt);         // meters, deck, drop fx
  if (GL) {
    const g = show?.gl();
    GL.draw({ time: g ? 6 + g.flow : t, mx: pointer.nx, my: pointer.ny, scroll: pageP, intro: ease(clamp(state.intro)), vel: state.vel, blood: state.blood, ...g });
  }
  window.STAGE3D?.frame(now, dt);   // the 3d world renders last, on top

  // adaptive quality: if frames run long for a while, step down (never back up mid-show)
  perf.ema = lerp(perf.ema, dt * 1000, .05);
  perf.since += dt;
  if (state.entered && perf.ema > 24 && perf.since > 2.5 && perf.tier > 0) {
    perf.tier--; perf.since = 0;
    document.documentElement.dataset.tier = perf.tier;
    GL?.setQuality?.(perf.tier);
    window.STAGE3D?.setQuality?.(perf.tier);
  }

  state.snap = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// section label in nav
let lastLabel = "";
setInterval(() => {
  const mid = innerHeight / 2;
  for (const el of labelled) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) {
      if (el.dataset.label !== lastLabel) { lastLabel = el.dataset.label; setText("navSection", lastLabel); }
      break;
    }
  }
}, 200);

// clocks
function tickClock() {
  const d = new Date();
  setText("clock", d.toLocaleTimeString("en-GB", { hour12: false }));
  setText("clock2", d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }).toLowerCase());
}
setInterval(tickClock, 1000); tickClock();
setText("year", new Date().getFullYear());

// anchor links: with autopilot on they jump the show to that part of the song; by hand they glide
$$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
  const id = a.getAttribute("href");
  e.preventDefault();
  if (window.SHOW?.goto(id)) return;
  const el = id === "#top" ? null : $(id);
  if (id !== "#top" && !el) return;
  scrollTo({ top: el ? clamp(docTop(el), 0, view.max) : 0, behavior: reduced ? "auto" : "smooth" });
}));

/* --------------------------------------------------------------------------
   Boot: preload everything → gate → enter
   -------------------------------------------------------------------------- */
const gate = $("#gate");
const bootStart = performance.now();
const EMPTY = { user: null, friends: null, followers: null, following: null, headshot: null, avatar: null, badgeCount: 0, badgesCapped: false, recentBadges: [], groups: [], games: [], names: [], wearing: [] };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

LOAD.set("roblox", .15);
const dataPromise = fetchRoblox()
  .then((d) => { renderRoblox(d); setText("updated", `synced ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`); return d; })
  .catch((e) => { console.warn(e); renderRoblox(EMPTY); return EMPTY; })
  .then((d) => {
    LOAD.done("roblox", d.user ? "" : "offline");
    layout();
    return preloadImages([d.headshot, d.avatar, ...d.recentBadges.map((b) => b.icon), ...d.groups.map((g) => g.icon), ...(d.wearing || []).map((w) => w.icon), "audio/cover.jpg"]).then(() => d);
  });

// warm-up: run the camera through every section once behind the gate, so the browser has laid out,
// rasterised and decoded all of it before the show needs it
async function warmUp() {
  await withTimeoutP(dataPromise, 20000);
  await withTimeoutP(document.fonts?.ready ?? Promise.resolve(), 6000);
  layout();
  const stops = [0];
  for (const p of pins) stops.push(p.top, p.top + (p.h - innerHeight) * .5, p.top + Math.max(0, p.h - innerHeight));
  for (const el of $$("main > section:not(.scene), main > footer")) stops.push(docTop(el), docTop(el) + el.offsetHeight * .5);
  stops.push(view.max);
  view.pre = true;
  for (let i = 0; i < stops.length; i++) {
    view.jump(stops[i]);
    await nextFrame();
    LOAD.set("warm", (i + 1) / stops.length);
  }
  view.jump(0);
  view.pre = false;
  await nextFrame();
  LOAD.done("warm");
}
warmUp();

// if the 3d module can't load (old browser, blocked file) the gate must not wait on it
const s3d = document.querySelector('script[src="stage3d.js"]');
const no3d = () => { if (!window.STAGE3D) { LOAD.done("three", "off"); LOAD.done("avatar", "2d"); } };
s3d?.addEventListener("error", no3d);
setTimeout(no3d, 20000);

loadDiscord();
setInterval(loadDiscord, 30000);

let shown = 0, lastList = "";
(function loader(now) {
  const elapsed = now - bootStart;
  const done = (LOAD.complete && elapsed > 900) || elapsed > 30000;
  const target = done ? 1 : Math.min(LOAD.progress, .99);
  shown += (target - shown) * .12;
  if (done && shown > .995) shown = 1;
  setText("gateCount", String(Math.floor(shown * 100)).padStart(3, "0"));
  $("#gateBar").style.transform = `scaleX(${shown})`;
  const cur = LOAD.current;
  setText("gateStatus", done || !cur ? "ready" : `${cur.label}${cur.note ? ` · ${cur.note}` : ""}`);
  const list = [...LOAD.tasks.values()].map((t) => `<span class="${t.done ? "ok" : ""}">${t.id} ${t.done ? "✓" : `${Math.round(t.p * 100)}%`}</span>`).join("");
  if (list !== lastList) { lastList = list; $("#gateList").innerHTML = list; }
  if (shown < 1) return requestAnimationFrame(loader);
  setText("gateStatus", "ready");
  gate.classList.add("is-ready");
  state.introTarget = .35;
  if (enterQueued) setTimeout(() => enter(enterQueued === "quiet" ? false : true), 200);
})(performance.now());

let enterQueued = false;
function enter(sound = true) {
  if (state.entered) return;
  if (sound) window.SHOW?.unlock();   // still inside the tap: wake the audio context now
  if (!gate.classList.contains("is-ready")) { enterQueued = sound ? true : "quiet"; return; }
  state.entered = true;
  view.jump(0);
  window.SHOW?.enter(sound);
  window.STAGE3D?.enter?.(sound);
  state.introTarget = 1;
  gate.classList.add("is-open");
  document.body.classList.remove("is-loading");
  document.documentElement.classList.add("is-entered");
  document.body.classList.add("is-entered");
  setTimeout(() => {
    $$(".hero [data-split], .hero [data-reveal]").forEach((el) => el.classList.add("is-in"));
    observeReveal($$("[data-split]:not(.hero [data-split]), [data-reveal]:not(.hero [data-reveal])"));
    $$(".scr").forEach((e) => scrIO.observe(e));
  }, 120);
  setTimeout(() => { gate.classList.add("is-gone"); $$("[data-tilt]").forEach((el) => el.classList.add("tilt-live")); layout(); }, 1400);
}
gate.addEventListener("click", (e) => enter(!e.target.closest("#gateQuiet")));
addEventListener("keydown", (e) => {
  if (state.entered || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  enter(!document.activeElement?.closest?.("#gateQuiet"));
});

// what the show and the 3d world need from the site
window.SITE = { CONFIG, rbx, view, scenes, pins, docTop, say, state, saga, chart, data: dataPromise, layout };
