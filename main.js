/* ==========================================================================
   finalarc — main
   No dependencies. Live data:
     Roblox  → public web APIs via roproxy (CORS mirror), with proxy fallbacks
     Discord → Lanyard (https://github.com/Phineas/lanyard)
   ========================================================================== */

const CONFIG = {
  robloxId: 461323235,
  discordId: "1453897439043125350",
  discordName: "finalarcuser",
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
  key: `fa-cache-${CONFIG.robloxId}`,
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

  const [user, friends, followers, following, headshot, avatar, groups, games, names] = await Promise.all([
    safe(rbx("users", `/v1/users/${id}`)),
    safe(rbx("friends", `/v1/users/${id}/friends/count`)),
    safe(rbx("friends", `/v1/users/${id}/followers/count`)),
    safe(rbx("friends", `/v1/users/${id}/followings/count`)),
    safe(rbx("thumbnails", `/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png&isCircular=false`)),
    safe(rbx("thumbnails", `/v1/users/avatar?userIds=${id}&size=720x720&format=Png&isCircular=false`)),
    safe(rbx("groups", `/v2/users/${id}/groups/roles`)),
    safe(rbx("games", `/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`)),
    safe(rbx("users", `/v1/users/${id}/username-history?limit=100&sortOrder=Asc`)),
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
  const [badgeIcons, groupIcons] = await Promise.all([
    recent.length ? safe(rbx("thumbnails", `/v1/badges/icons?badgeIds=${recent.map((b) => b.id).join(",")}&size=150x150&format=Png&isCircular=false`)) : null,
    groupList.length ? safe(rbx("thumbnails", `/v1/groups/icons?groupIds=${groupList.map((g) => g.group.id).join(",")}&size=150x150&format=Png&isCircular=false`)) : null,
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
      <div class="badge__img">${b.icon ? `<img src="${esc(b.icon)}" alt="" loading="lazy">` : ""}</div>
      <div class="badge__name">${esc(b.name)}</div>
      <div class="badge__game mono">${esc(b.game || "roblox")}</div>
    </article>`).join("");
  observeReveal($$(".badge", el));
  if (state.entered) $$(".badge", el).forEach((b) => setTimeout(() => b.classList.add("tilt-live"), 1500));
  bindTilt($$(".badge", el));
}

function renderGroups(list) {
  const el = $("#groups");
  if (!list.length) { el.innerHTML = `<li class="empty mono">no public groups.</li>`; return; }
  el.innerHTML = list.slice(0, 10).map((g) => `
    <li class="group" data-reveal>
      <a href="https://www.roblox.com/communities/${g.id}" target="_blank" rel="noopener" data-cursor="open">
        ${g.icon ? `<img src="${esc(g.icon)}" alt="" loading="lazy">` : `<img alt="">`}
        <span class="group__name">${esc(g.name)}</span>
        <span class="group__role mono">${esc(g.role || "member")}</span>
        <span class="group__members mono">${compact(g.members || 0)} members</span>
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

  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];
  $("#insightsList").innerHTML = out.map((t, i) => `<li class="insight" data-reveal><span class="insight__n mono">${roman[i]}</span><p>${t}</p></li>`).join("");
  observeReveal($$("#insightsList .insight"));
}

/* --------------------------------------------------------------------------
   Discord (Lanyard)
   -------------------------------------------------------------------------- */
const STATUS_TXT = { online: "online", idle: "idle", dnd: "do not disturb", offline: "offline" };

async function loadDiscord() {
  let p;
  try {
    const res = await getJSON(`https://api.lanyard.rest/v1/users/${CONFIG.discordId}`, 8000);
    if (!res.success) throw 0;
    p = res.data;
  } catch {
    setStatus(null);
    setText("dcState", "live presence unavailable — add me with the button below.");
    return;
  }

  const u = p.discord_user || {};
  setStatus(p.discord_status);
  setText("dcName", u.global_name || u.display_name || u.username || CONFIG.discordName);
  setText("dcUser", u.username || CONFIG.discordName);
  setText("dcInitial", (u.global_name || u.username || "f")[0].toUpperCase());
  if (u.avatar) {
    const ext = u.avatar.startsWith("a_") ? "gif" : "png";
    loadImg($("#dcAvatar"), `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=256`);
  }

  const acts = p.activities || [];
  const custom = acts.find((a) => a.type === 4);
  $("#dcCustom").textContent = custom ? [custom.emoji?.name, custom.state].filter(Boolean).join(" ") : "";

  const box = $("#dcActivity");
  if (p.listening_to_spotify && p.spotify) {
    const s = p.spotify;
    box.innerHTML = `<div class="dc__label mono">listening to spotify</div>
      <div class="dc__act"><img src="${esc(s.album_art_url)}" alt="">
        <div style="min-width:0"><div class="dc__act-title">${esc(s.song)}</div><div class="dc__act-sub">by ${esc(s.artist)}</div>
        <div class="dc__prog"><span id="spProg"></span></div></div></div>`;
    spotifyTimes = s.timestamps;
    return;
  }
  spotifyTimes = null;
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

let spotifyTimes = null;
function tickSpotify() {
  const el = $("#spProg");
  if (!el || !spotifyTimes) return;
  const { start, end } = spotifyTimes;
  el.style.transform = `scaleX(${clamp((Date.now() - start) / (end - start))})`;
}

function setStatus(s) {
  for (const id of ["heroStatus", "dcStatus"]) { const el = document.getElementById(id); if (el) el.dataset.s = s || "offline"; }
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
  uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uScroll; uniform float uIntro; uniform float uVel;

  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0., a = .5;
    mat2 r = mat2(.8,.6,-.6,.8);
    for(int i=0;i<5;i++){ v += a*noise(p); p = r*p*2.02 + 3.1; a *= .5; }
    return v;
  }
  mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

  void main(){
    vec2 uv = (gl_FragCoord.xy - .5*uRes) / uRes.y;
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

    vec3 col = vec3(.022, .022, .03);
    col += deep * smoothstep(.2, .9, f) * 1.4;
    col += a2 * pow(clamp(length(r), 0., 1.), 3.) * .22;

    // the arc
    vec2 au = uv;
    au -= uMouse * .04;
    au *= rot(sin(s * 3.14159) * .9 - .25 + s * .6);
    vec2 c = vec2(0., -1.05 + .35 * sin(s * 6.2832));
    float rad = mix(.55, 1.0, uIntro) + .08 * sin(uTime*.25);
    vec2 d = au - c + (q - .5) * .12;
    float ring = abs(length(d) - rad);
    float ang = atan(d.x, d.y);
    float span = smoothstep(1.9, .2, abs(ang)) * uIntro;
    float core = .0025 / (ring + .002);
    float glow = .03 / (ring + .03);
    col += a1 * (core * .9 + glow * .45) * span;
    col += vec3(1.) * smoothstep(.004, 0., ring) * span * .6;

    // light bleed from under the arc
    float under = smoothstep(rad, rad - .9, length(d)) * span;
    col += a1 * under * f * .25;

    // streaks on fast scroll
    col += a1 * smoothstep(.97, 1., noise(vec2(uv.y * 80., t*2.))) * clamp(abs(uVel), 0., 1.) * .25;

    // vignette + dither
    col *= 1. - .55 * dot(uv*.75, uv*.75);
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
  for (const n of ["uRes", "uTime", "uMouse", "uScroll", "uIntro", "uVel"]) U[n] = gl.getUniformLocation(prog, n);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * (innerWidth < 760 ? .7 : .85);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  return {
    draw({ time, mx, my, scroll, intro, vel }) {
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform2f(U.uMouse, mx, my);
      gl.uniform1f(U.uScroll, scroll);
      gl.uniform1f(U.uIntro, intro);
      gl.uniform1f(U.uVel, vel);
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
$$("[data-split]").forEach(split);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 });
function observeReveal(els) { els.forEach((el) => io.observe(el)); }

// manifesto: word-by-word scrub
const manifesto = $("#manifesto");
const HL = new Set(["template.", "live", "single", "move"]);
manifesto.innerHTML = manifesto.textContent.trim().split(/\s+/).map((w) => `<span class="mw${HL.has(w.toLowerCase()) ? " hl" : ""}">${esc(w)}</span>`).join(" ");
const mWords = $$(".mw", manifesto);

/* --------------------------------------------------------------------------
   Cursor, magnetic, tilt, copy
   -------------------------------------------------------------------------- */
const pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0 };
const cur = { x: pointer.x, y: pointer.y, rx: pointer.x, ry: pointer.y };
const cursorEl = $(".cursor"), dotEl = $(".cursor__dot"), ringEl = $(".cursor__ring"), labelEl = $(".cursor__label");

addEventListener("pointermove", (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.nx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ny = -((e.clientY / innerHeight) * 2 - 1);
}, { passive: true });
if (finePointer && !reduced) document.documentElement.classList.add("has-cursor");
addEventListener("pointerdown", () => cursorEl.classList.add("is-down"));
addEventListener("pointerup", () => cursorEl.classList.remove("is-down"));

function bindCursor(els) {
  els.forEach((el) => {
    el.addEventListener("pointerenter", () => { labelEl.textContent = el.dataset.cursor; cursorEl.classList.add("is-active"); });
    el.addEventListener("pointerleave", () => cursorEl.classList.remove("is-active"));
  });
}
bindCursor($$("[data-cursor]"));

$$("[data-magnetic]").forEach((el) => {
  if (!finePointer || reduced) return;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px, ${(e.clientY - r.top - r.height / 2) * .35}px)`;
  });
  el.addEventListener("pointerleave", () => { el.style.transition = "transform .6s cubic-bezier(.16,1,.3,1), color .45s, border-color .45s"; el.style.transform = ""; setTimeout(() => (el.style.transition = ""), 600); });
});

function bindTilt(els) {
  els.forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      if (!finePointer || reduced || !el.classList.contains("tilt-live")) return;
      el.style.transform = `perspective(1000px) rotateX(${(.5 - py) * 7}deg) rotateY(${(px - .5) * 9}deg)`;
    });
    el.addEventListener("pointerleave", () => { if (el.classList.contains("tilt-live")) el.style.transform = ""; });
  });
}
bindTilt($$("[data-tilt]"));

const toast = $("#toast");
let toastT;
function say(msg) { toast.textContent = msg; toast.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("is-on"), 2200); }
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
};
const track = $("#statsTrack");
const statCards = $$(".stat", track);
const hero = { l1: $(".hero__line--1"), l2: $(".hero__line--2"), title: $(".hero__title"), grid: $(".hero__grid") };
const avatarEls = { stage: $(".avatar__stage"), ring: $(".avatar__ring"), word: $(".avatar__bgword"), capL: $(".avatar__cap--l"), capR: $(".avatar__cap--r") };
const marquee = $("#marquee");
const labelled = $$("[data-label]");

let docH = 1, trackDist = 0;
function layout() {
  trackDist = Math.max(0, track.scrollWidth - innerWidth);
  scenes.stats.style.height = `${trackDist + innerHeight * 1.15}px`;
  docH = Math.max(1, document.documentElement.scrollHeight - innerHeight);
}
addEventListener("resize", layout);
addEventListener("load", layout);
document.fonts?.ready.then(layout);
layout();

function sceneProgress(el) {
  const top = el.offsetTop, h = el.offsetHeight - innerHeight;
  return h > 0 ? clamp((scrollY - top) / h) : 0;
}

function countUp(el) {
  if (el.dataset.done || el.dataset.to === undefined || el.dataset.to === "") return;
  el.dataset.done = "1";
  const to = +el.dataset.to, start = performance.now(), dur = reduced ? 1 : 1800;
  const big = el.id === "sVisits" && to >= 1e5;
  const step = (now) => {
    const k = ease(clamp((now - start) / dur));
    el.textContent = big ? compact(to * k) : fmt(to * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const state = { sy: scrollY, vel: 0, intro: 0, introTarget: 0, entered: false, mProg: 0, statsProg: 0, avProg: 0, marq: 0 };

function frame(now) {
  const t = now / 1000;
  const y = scrollY;
  const prevSy = state.sy;
  state.sy = lerp(state.sy, y, reduced ? 1 : .09);
  state.vel = lerp(state.vel, (state.sy - prevSy) / 40, .1);
  state.intro = lerp(state.intro, state.introTarget, .025);

  // cursor
  cur.x = lerp(cur.x, pointer.x, .5); cur.y = lerp(cur.y, pointer.y, .5);
  cur.rx = lerp(cur.rx, pointer.x, .16); cur.ry = lerp(cur.ry, pointer.y, .16);
  dotEl.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
  const active = cursorEl.classList.contains("is-active");
  ringEl.style.transform = `translate(${cur.rx}px, ${cur.ry}px) scale(${active ? 2.1 : 1})`;

  // progress
  const pageP = clamp(state.sy / docH);
  $("#progress").style.transform = `scaleY(${pageP})`;

  // hero parallax
  const hp = clamp(state.sy / innerHeight);
  if (!reduced) {
    hero.l1.style.transform = `translate3d(${-hp * 22}vw, ${hp * 8}vh, 0)`;
    hero.l2.style.transform = `translate3d(${hp * 22}vw, ${hp * 4}vh, 0)`;
    hero.title.style.opacity = 1 - hp * 1.1;
    hero.grid.style.transform = `translate3d(0, ${hp * -12}vh, 0)`;
    hero.grid.style.opacity = 1 - hp * 1.4;
  }

  // manifesto
  const mp = sceneProgress(scenes.manifesto);
  state.mProg = lerp(state.mProg, mp, reduced ? 1 : .15);
  const on = Math.floor(clamp(state.mProg * 1.25) * mWords.length);
  mWords.forEach((w, i) => w.classList.toggle("on", i < on));
  $(".manifesto__arc-line").style.strokeDashoffset = 850 * (1 - clamp(state.mProg * 1.3));

  // stats horizontal
  const sp = sceneProgress(scenes.stats);
  state.statsProg = lerp(state.statsProg, sp, reduced ? 1 : .1);
  track.style.transform = `translate3d(${-state.statsProg * trackDist}px, 0, 0)`;
  $("#statsBar").style.transform = `scaleX(${state.statsProg})`;
  const idx = Math.min(8, Math.max(1, Math.ceil(state.statsProg * 8.2)));
  $("#statsIdx").textContent = String(idx).padStart(2, "0");
  if (scrollY > scenes.stats.offsetTop - innerHeight) {
    for (const c of statCards) {
      const r = c.getBoundingClientRect();
      if (r.left < innerWidth * .92 && r.right > 0) {
        countUp($("[data-num]", c));
        const bar = $(".stat__bar span", c);
        if (bar && bar.dataset.to && !bar.dataset.done) { bar.dataset.done = 1; bar.style.transform = `scaleX(${bar.dataset.to})`; }
      }
      if (!reduced) {
        const center = (r.left + r.width / 2) / innerWidth - .5;
        c.style.transform = `perspective(1200px) rotateY(${center * -14}deg) translateY(${Math.abs(center) * 40}px)`;
      }
    }
  }

  // avatar
  const ap = sceneProgress(scenes.avatar);
  state.avProg = lerp(state.avProg, ap, reduced ? 1 : .1);
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

  // marquee
  state.marq -= (reduced ? 0 : .6) + Math.abs(state.vel) * 6;
  const mw = marquee.scrollWidth / 2;
  if (mw) marquee.style.transform = `translate3d(${state.marq % mw}px, 0, 0)`;

  tickSpotify();

  if (GL) GL.draw({ time: t, mx: pointer.nx, my: pointer.ny, scroll: pageP, intro: ease(clamp(state.intro)), vel: state.vel });

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

// anchor links — smooth glide
$$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
  const target = a.getAttribute("href") === "#top" ? document.body : $(a.getAttribute("href"));
  if (!target) return;
  e.preventDefault();
  const top = target === document.body ? 0 : target.getBoundingClientRect().top + scrollY;
  scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
}));

/* --------------------------------------------------------------------------
   Boot: loader → gate → enter
   -------------------------------------------------------------------------- */
const gate = $("#gate");
let dataReady = false;
const bootStart = performance.now();

const dataPromise = fetchRoblox()
  .then((d) => { renderRoblox(d); setText("updated", `synced ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`); })
  .catch((e) => { console.warn(e); renderRoblox({ user: null, friends: null, followers: null, following: null, headshot: null, avatar: null, badgeCount: 0, badgesCapped: false, recentBadges: [], groups: [], games: [], names: [] }); })
  .finally(() => { dataReady = true; layout(); });

loadDiscord();
setInterval(loadDiscord, 30000);

let shown = 0;
(function loader(now) {
  const elapsed = now - bootStart;
  const timeP = clamp(elapsed / 2200);
  const target = dataReady || elapsed > 7000 ? 1 : Math.min(timeP, .88);
  shown = lerp(shown, target, .08);
  if (target === 1 && shown > .995) shown = 1;
  setText("gateCount", String(Math.round(shown * 100)).padStart(3, "0"));
  $("#gateBar").style.transform = `scaleX(${shown})`;
  if (!dataReady && elapsed > 1200) setText("gateStatus", "syncing roblox");
  if (shown < 1) return requestAnimationFrame(loader);
  setText("gateStatus", "ready");
  gate.classList.add("is-ready");
  state.introTarget = .35;
  $("#gateEnter").focus({ preventScroll: true });
  if (enterQueued) setTimeout(enter, 350);
})(performance.now());

let enterQueued = false;
function enter() {
  if (state.entered) return;
  if (!gate.classList.contains("is-ready")) { enterQueued = true; return; }
  state.entered = true;
  state.introTarget = 1;
  gate.classList.add("is-open");
  document.body.classList.remove("is-loading");
  document.documentElement.classList.add("is-entered");
  document.body.classList.add("is-entered");
  scrollTo(0, 0);
  setTimeout(() => {
    $$(".hero [data-split], .hero [data-reveal]").forEach((el) => el.classList.add("is-in"));
    observeReveal($$("[data-split]:not(.hero [data-split]), [data-reveal]:not(.hero [data-reveal])"));
  }, 250);
  setTimeout(() => { gate.classList.add("is-gone"); $$("[data-tilt]").forEach((el) => el.classList.add("tilt-live")); layout(); }, 2200);
}
gate.addEventListener("click", enter);
addEventListener("keydown", (e) => { if (!state.entered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); enter(); } });
