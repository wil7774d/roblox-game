/* ==========================================================================
   finalarc — the page
   Joining screen → one card. Everything here reads live data (main.js) and the
   song clock (audio.js); avatar3d.js mounts the real 3D avatar if it's baked.
   ========================================================================== */
(() => {
  const A = window.AUDIO, F = A?.F, SONG = window.SONG;
  const body = document.body, root = document.documentElement;
  const isPhone = () => innerWidth <= 760;
  const T = (n) => (SONG ? SONG.offset + n * (240 / SONG.bpm) : 0);
  const DROP = SONG?.drop ?? 29.09;
  let entered = false;

  /* ------------------------------------------------------------------------
     Static bits: the Roblox verified seal, tape text
     ------------------------------------------------------------------------ */
  {
    let d = "";
    for (let i = 0; i <= 160; i++) { const t = i / 160 * Math.PI * 2, r = 10.4 + 1.2 * Math.cos(8 * t); d += (i ? "L" : "M") + (12 + r * Math.sin(t)).toFixed(2) + " " + (12 - r * Math.cos(t)).toFixed(2); }
    $$(".seal-path").forEach((p) => p.setAttribute("d", d + "Z"));
    $$(".tape-track").forEach((t) => { const txt = esc(t.dataset.text); t.innerHTML = `<span>${txt}<i></i></span>`.repeat(14); });
  }

  const toastEl = $("#toast");
  let toastT = 0;
  function toast(msg, ms = 2400) { toastEl.textContent = msg; toastEl.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("is-on"), ms); }

  /* ------------------------------------------------------------------------
     Roblox data → the card
     ------------------------------------------------------------------------ */
  const ICON = {
    pin: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    cal: '<svg class="ic" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    clock: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    studio: '<svg viewBox="0 0 24 24"><path d="M14 6.5 17.5 10M4 20l9-9M12.5 4.5l7 7-2.5 2.5-7-7z"/></svg>',
    game: '<svg viewBox="0 0 24 24"><path d="M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.8A3 3 0 0 1 3 14v-2a3 3 0 0 1 3-3z"/></svg>',
  };
  const BADGES = (year, years) => [
    { tip: `OG · on Roblox since ${year || "2017"}${years ? ` · ${Math.floor(years)} years` : ""}`, svg: '<svg viewBox="0 0 24 24"><path d="M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3z" fill="#f5c451"/><path d="m12 7.4 1.4 2.9 3.2.4-2.3 2.2.6 3.2L12 14.6l-2.9 1.5.6-3.2-2.3-2.2 3.2-.4z" fill="#3a2a00"/></svg>' },
    { tip: `Creator · peaked at ${CONFIG.game.peakCCU} players`, svg: '<svg viewBox="0 0 24 24"><path d="M12.6 2.5c.4 3-1.2 4.6-2.6 6.1-1.5 1.6-3.2 3.3-3.2 6.2a5.2 5.2 0 0 0 10.4 0c0-2.3-1-4-2.2-5.4.1 1.4-.4 2.6-1.4 3.1.4-3.4-.4-7-1-10z" fill="#ff7a45"/><path d="M12 13.2c.9 1 1.6 2 1.6 3.1a1.6 1.6 0 0 1-3.2 0c0-1.1.7-2.1 1.6-3.1z" fill="#ffd2b8"/></svg>' },
    { tip: "Survived a takedown", svg: '<svg viewBox="0 0 24 24"><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" fill="#ff3344"/><path d="M12 7.6v5.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.35" fill="#fff"/></svg>' },
  ];
  const SOCIAL = {
    discord: '<svg viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    spotify: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm4.8 15.1a.7.7 0 0 1-1 .2c-2.6-1.6-5.9-2-9.8-1.1a.7.7 0 1 1-.3-1.4c4.2-1 7.9-.5 10.8 1.3.3.2.4.7.3 1zm1.3-2.9a.9.9 0 0 1-1.2.3c-3-1.8-7.5-2.4-11-1.3a.9.9 0 1 1-.5-1.7c4-1.2 9-.6 12.4 1.5.4.2.5.8.3 1.2zm.1-3c-3.6-2.1-9.5-2.3-12.9-1.3a1 1 0 1 1-.6-2c3.9-1.2 10.5-.9 14.6 1.5a1 1 0 0 1-1.1 1.8z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.2s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1.1-.1-1.4-.1-4.1s0-3 .1-4.2C3.9 5.1 5.2 3.8 7.9 3.7c1.1-.1 1.4-.1 4.1-.1zM12 2c-2.7 0-3.1 0-4.2.1C4.2 2.2 2.2 4.2 2.1 7.8 2 8.9 2 9.3 2 12s0 3.1.1 4.2c.1 3.6 2.1 5.6 5.7 5.7 1.1.1 1.5.1 4.2.1s3.1 0 4.2-.1c3.6-.1 5.6-2.1 5.7-5.7.1-1.1.1-1.5.1-4.2s0-3.1-.1-4.2c-.1-3.6-2.1-5.6-5.7-5.7C15.1 2 14.7 2 12 2z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24"><path d="M4.3 2 3 5.4v13.5h4.6V22h2.6l3.1-3.1h3.8l5-5V2H4.3zm15.8 11L17.2 16h-4.6l-2.6 2.6V16H6V3.7h14.1V13zM17.4 6.6v5.3h-1.7V6.6h1.7zm-4.7 0v5.3H11V6.6h1.7z"/></svg>',
    github: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  };

  const profileUrl = `https://www.roblox.com/users/${CONFIG.robloxId}/profile`;
  function showImg(img, src) {
    if (!img || !src) return;
    img.onload = () => img.classList.add("is-in");
    img.src = src;
    if (img.complete && img.naturalWidth) img.classList.add("is-in");
  }

  function renderRoblox(d) {
    const u = d.user;
    const created = u ? new Date(u.created) : null;
    const years = created ? (Date.now() - created) / 31557600000 : null;
    const name = u?.displayName || "finalarc", handle = `@${u?.name || "finalarc"}`;
    $("#displayName").childNodes[0].nodeValue = name;
    $("#displayName").dataset.text = name;
    setText("username", handle);
    setText("plName", u?.name || name);
    setText("gateName", name);
    setText("gateUser", handle);
    if (created) setText("gateSince", ` · on Roblox since ${created.getFullYear()}`);
    $("#seal").toggleAttribute("hidden", !u?.verified);       // SVG elements have no .hidden
    $(".gate-title .seal").toggleAttribute("hidden", !u?.verified);
    document.title = `${name} · roblox`;

    showImg($("#headshot"), d.headshot);
    showImg($("#plHead"), d.headshot);
    showImg($("#gateIcon"), d.headshot);
    showImg($("#render"), d.avatar);

    const metaBits = [
      CONFIG.location ? `<span>${ICON.pin}${esc(CONFIG.location)}</span>` : "",
      created ? `<span>${ICON.cal}Joined <b>${created.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</b></span>` : "",
      years != null ? `<span>${ICON.clock}<b>${Math.floor(years)} yrs</b> on Roblox</span>` : "",
    ].join("");
    $("#meta").innerHTML = metaBits;
    $("#metaPhone").innerHTML = metaBits;

    $("#badges").innerHTML = BADGES(created?.getFullYear(), years).map((b) => `<span class="badge" tabindex="0" data-tip="${esc(b.tip)}">${b.svg}</span>`).join("");

    const v = (x) => (x == null ? "—" : x >= 10000 ? compact(x) : fmt(x));
    setText("sFriends", v(d.friends));
    setText("sFollowers", v(d.followers));
    setText("sFollowing", v(d.following));
    setText("sBadges", d.badges == null ? "—" : v(d.badges) + (d.badgesCapped ? "+" : ""));
    setText("sGroups", v(d.groups));
    $("#statsLive").classList.toggle("is-off", !u);
    if (!u) $("#statsLive").lastChild.nodeValue = "Roblox is unreachable right now";

    // the taken-down game + the reupload
    setText("gPeak", fmt(CONFIG.game.peakCCU));
    setText("gVisits", compact(CONFIG.game.visits) + "+");
    const re = CONFIG.game.reuploadPlaceId ? { place: CONFIG.game.reuploadPlaceId } : d.games[0];
    const play = $("#playReupload");
    if (re?.place) play.href = `https://www.roblox.com/games/${re.place}`;
    else { play.href = profileUrl; }
    if (d.games[0]?.visits) setText("reNote", `reupload · ${compact(d.games[0].visits)} visits`);
    drawSpark(d.games[0]?.visits || 0);

    // currently wearing
    const w = d.wearing || [];
    const shown = w.slice(0, isPhone() ? 6 : 6);
    $("#tiles").innerHTML = shown.map((it, i) => (i === 5 && w.length > 6
      ? `<a class="tile more" href="${profileUrl}" target="_blank" rel="noopener" data-tip="See all ${w.length} items">+${w.length - 5}</a>`
      : `<a class="tile" href="https://www.roblox.com/catalog/${it.id}" target="_blank" rel="noopener" data-tip="View item"><img src="${esc(it.icon)}" alt="" decoding="async"></a>`)).join("");
    setText("wearCount", w.length ? `${w.length} item${w.length > 1 ? "s" : ""}` : "");
    $("#wearingWrap").hidden = !w.length;

    $("#friendBtn").href = profileUrl;
    $("#viewRoblox").href = profileUrl;
  }

  // the sparkline: the climb to 497, the moderation drop to 0, then the reupload's dashed climb
  function drawSpark(reVisits) {
    const el = $("#spark");
    const W = el.clientWidth || 176, H = el.clientHeight || 92, pl = 4, pr = 22, top = 22, bot = 18;
    const pts = [12, 18, 15, 30, 44, 40, 66, 92, 120, 108, 150, 196, 240, 228, 290, 350, 330, 402, 447, 430, CONFIG.game.peakCCU];
    const n = pts.length + 5, max = CONFIG.game.peakCCU, base = H - bot;
    const x = (i) => pl + i * (W - pl - pr) / (n - 1), y = (v) => base - (v / max) * (base - top);
    let d = "";
    pts.forEach((v, i) => { d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); });
    const px = x(pts.length - 1), py = y(max), dx = x(pts.length), y0 = y(0), ex = x(n - 1);
    const rise = reVisits ? Math.min(.32, .08 + Math.log10(Math.max(10, reVisits)) / 30) : .12;
    const ey = y(max * rise);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ff" stop-opacity=".2"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></linearGradient></defs>
      <line x1="${pl}" x2="${W - 4}" y1="${base}" y2="${base}" stroke="rgba(255,255,255,.1)" stroke-dasharray="2 3"/>
      <path d="${d}L${px} ${base}L${pl} ${base}Z" fill="url(#sg)"/>
      <path d="${d}" fill="none" stroke="#e9eef6" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M${px} ${py}L${dx} ${y0}" fill="none" stroke="#ff3344" stroke-width="1.8" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #ff3344)"/>
      <path d="M${dx} ${y0}C${(dx + ex) / 2} ${y0} ${(dx + ex) / 2} ${ey} ${ex} ${ey}" fill="none" stroke="#e9eef6" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="3 3" stroke-linecap="round"/>
      <circle cx="${px}" cy="${py}" r="7" fill="#fff" opacity=".12"/><circle cx="${px}" cy="${py}" r="3.2" fill="#fff"/>
      <circle cx="${dx}" cy="${y0}" r="2.6" fill="#ff3344"/><circle cx="${ex}" cy="${ey}" r="2.4" fill="#e9eef6"/>
    </svg>
    <span class="lbl" style="left:${Math.max(0, px - 46)}px;top:${Math.max(0, py - 19)}px">PEAK ${fmt(max)}</span>
    <span class="lbl" style="left:${Math.max(0, dx - 8)}px;top:${base + 6}px;color:#ff6b77">0</span>
    <span class="lbl" style="right:0;top:${Math.max(0, ey - 16)}px;color:var(--ink-3)">v2</span>`;
  }
  addEventListener("resize", () => drawSpark(window.__reVisits || 0));

  /* ------------------------------------------------------------------------
     Presence: Roblox (Studio / in game / online) first, Discord as the fallback
     ------------------------------------------------------------------------ */
  let robloxPresence = null, discordStatus = null;
  const DC_TXT = { online: "Online on Discord", idle: "Idle on Discord", dnd: "Do not disturb", offline: "Offline" };
  function paintPresence() {
    const badge = $("#presence"), text = $("#presText");
    let p = "offline", label = "Offline", tip = "Offline";
    const rp = robloxPresence;
    if (rp?.type === 3) { p = "studio"; label = "In Studio — still building"; tip = "In Roblox Studio"; badge.innerHTML = ICON.studio; }
    else if (rp?.type === 2) { p = "game"; label = rp.where ? `Playing ${rp.where}` : "In a game"; tip = "In game"; badge.innerHTML = ICON.game; }
    else if (rp?.type === 1) { p = "online"; label = "Online on Roblox"; tip = "Online"; badge.innerHTML = ""; }
    else if (discordStatus && discordStatus !== "offline") { p = `dc-${discordStatus}`; label = DC_TXT[discordStatus]; tip = label; badge.innerHTML = ""; }
    else { badge.innerHTML = ""; }
    badge.dataset.p = p; badge.dataset.tip = tip; badge.hidden = false;
    text.dataset.p = p; text.lastChild.textContent = label;
  }
  async function refreshPresence() { robloxPresence = await fetchPresence(); paintPresence(); }

  /* ------------------------------------------------------------------------
     Discord tiles (Lanyard), refreshed every 30 s
     ------------------------------------------------------------------------ */
  const spotifyBars = new Map();
  function renderDiscordShell() {
    $("#dcGrid").innerHTML = CONFIG.discord.map((acc) => `
      <a class="dc" data-dc="${acc.id}" href="https://discord.com/users/${acc.id}" target="_blank" rel="noopener">
        <div class="dc-av"><img alt="" decoding="async" src="${esc(discordAvatar(null, acc.id))}"><span class="dc-st" data-s="offline"></span></div>
        <div class="dc-txt">
          <div class="dc-name"><span class="dc-n">${esc(acc.name)}</span><span class="tag">${esc(acc.label)}</span></div>
          <div class="dc-act"><span>checking presence…</span></div>
        </div>
      </a>`).join("");
  }
  const SPOTIFY = '<svg class="sp" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.7-1.1 7.8-.8 11 1M7.2 12.4c3-.9 6.3-.6 9 .9M7.8 15.3c2.4-.6 4.9-.4 7 .8" stroke="#0b0d10" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
  async function refreshDiscord(firstRun) {
    await Promise.all(CONFIG.discord.map(async (acc, i) => {
      const tile = $(`[data-dc="${acc.id}"]`);
      if (!tile) return;
      const p = await fetchLanyard(acc.id);
      if (!p) {
        if (!tile.dataset.live) $(".dc-act", tile).innerHTML = "<span>add me — presence is warming up</span>";
        if (i === 0) { discordStatus = null; paintPresence(); }
        return;
      }
      tile.dataset.live = "1";
      const u = p.discord_user || {};
      const img = $(".dc-av img", tile), src = discordAvatar(u, acc.id);
      if (img.getAttribute("src") !== src) img.src = src;
      $(".dc-st", tile).dataset.s = p.discord_status || "offline";
      $(".dc-n", tile).textContent = u.global_name || u.display_name || u.username || acc.name;
      if (i === 0) { discordStatus = p.discord_status; paintPresence(); }
      const acts = p.activities || [];
      const custom = acts.find((a) => a.type === 4);
      const game = acts.find((a) => a.type === 0 || a.type === 1 || a.type === 3);
      let act = "", cover = "";
      spotifyBars.delete(tile);
      if (p.listening_to_spotify && p.spotify) {
        const sp = p.spotify;
        act = `${SPOTIFY}<span>${esc(sp.song)} — ${esc(sp.artist)}</span>`;
        cover = sp.album_art_url;
        spotifyBars.set(tile, sp.timestamps);
      } else if (game) {
        act = `<span>${game.type === 1 ? "Streaming" : game.type === 3 ? "Watching" : "Playing"} ${esc(game.name)}</span>`;
        const li = game.assets?.large_image;
        if (li) cover = li.startsWith("mp:") ? `https://media.discordapp.net/${li.slice(3)}` : `https://cdn.discordapp.com/app-assets/${game.application_id}/${li}.png`;
      } else if (custom?.state || custom?.emoji?.name) {
        act = `<span>${esc([custom.emoji?.name && !custom.emoji.id ? custom.emoji.name : "", custom.state].filter(Boolean).join(" "))}</span>`;
      } else {
        act = `<span>${{ online: "Online", idle: "Idle", dnd: "Do not disturb", offline: "Offline" }[p.discord_status] || "Offline"}</span>`;
      }
      $(".dc-act", tile).innerHTML = act;
      let c = $(".dc-cover", tile);
      if (cover) { if (!c) { c = document.createElement("img"); c.className = "dc-cover"; c.alt = ""; tile.append(c); } if (c.getAttribute("src") !== cover) c.src = cover; }
      else c?.remove();
      let bar = $(".dc-prog", tile);
      if (spotifyBars.has(tile)) { if (!bar) { bar = document.createElement("div"); bar.className = "dc-prog"; bar.innerHTML = "<i></i>"; $(".dc-txt", tile).append(bar); } }
      else bar?.remove();
    }));
  }
  function tickSpotify() {
    for (const [tile, ts] of spotifyBars) { const i = $(".dc-prog i", tile); if (i && ts?.end) i.style.transform = `scaleX(${clamp((Date.now() - ts.start) / (ts.end - ts.start))})`; }
  }

  /* socials: Discord (copies the username) + whatever's in CONFIG.socials */
  {
    const main = CONFIG.discord[0];
    const extra = (CONFIG.socials || []).map((s) => `<a class="soc" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.label)}" data-tip="${esc(s.label)}">${SOCIAL[s.icon] || SOCIAL.link}</a>`).join("");
    $("#socials").innerHTML = `<button class="soc" type="button" id="dcCopy" aria-label="Copy Discord username" data-tip="Discord · ${esc(main.name)}">${SOCIAL.discord}</button>${extra}`;
    $("#dcCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(main.name); toast(`copied “${main.name}” — add me on Discord`); }
      catch { toast(`Discord: ${main.name}`); }
    });
  }

  /* ------------------------------------------------------------------------
     Roblox bubble chat: the avatar types the bio
     ------------------------------------------------------------------------ */
  const bubblesEl = $("#bubbles");
  const LINES = CONFIG.bio.length ? CONFIG.bio : ["hi."];
  const CALM = LINES.length > 1 ? LINES.slice(0, -1) : LINES, COLD = LINES[LINES.length - 1];
  let chat = { line: -1, typed: 0, timer: 0, hold: 0, override: null };
  function paintBubbles(oldTxt, curTxt, n, opts = {}) {
    let h = "";
    if (oldTxt) h += `<div class="bubble old">${esc(oldTxt)}</div>`;
    if (curTxt != null) h += `<div class="bubble cur${opts.red ? " red" : ""}"><span class="tx">${esc(curTxt.slice(0, n))}</span>${n < curTxt.length || opts.caret ? '<span class="caret"></span>' : ""}</div>`;
    bubblesEl.innerHTML = h;
  }
  function typeLine(text, prev, opts = {}) {
    clearInterval(chat.timer);
    let n = reduced ? text.length : 0;
    paintBubbles(prev, text, n, opts);
    const cur = bubblesEl.lastElementChild, tx = cur?.querySelector(".tx");
    if (reduced || !tx) return;
    chat.timer = setInterval(() => {
      n++;
      tx.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(chat.timer); cur.querySelector(".caret")?.remove(); }
    }, 55);
  }
  let chatPrev = null, chatIdx = 0, chatAt = 0, chatCold = false;
  function chatTick(now) {
    if (!entered) return;
    const cold = body.classList.contains("drop");
    if (cold !== chatCold) {
      chatCold = cold;
      if (cold) { typeLine(COLD, CALM[(chatIdx + CALM.length - 1) % CALM.length], { red: true }); chatPrev = COLD; chatAt = now + 1e9; return; }
      chatAt = now;
    }
    if (cold || now < chatAt) return;
    const line = CALM[chatIdx % CALM.length];
    typeLine(line, chatPrev);
    chatPrev = line;
    chatIdx++;
    chatAt = now + Math.max(3800, line.length * 55 + 2600);
  }
  $("#chatBtn").addEventListener("click", (e) => {
    const off = body.classList.toggle("no-chat");
    e.currentTarget.setAttribute("aria-pressed", String(!off));
    e.currentTarget.setAttribute("aria-label", off ? "Show chat bubbles" : "Hide chat bubbles");
  });

  /* ------------------------------------------------------------------------
     The player: a waveform drawn from the song's real loudness, seek, volume
     ------------------------------------------------------------------------ */
  const wave = $("#wave"), bars = [];
  let barN = 0, playedBar = -2;
  function buildWave() {
    const N = isPhone() ? 54 : 84;
    if (N === barN) return;
    barN = N;
    $$("i", wave).forEach((b) => b.remove());
    bars.length = 0;
    const dur = SONG?.duration || 265;
    let lv = [];
    if (SONG?.frames) {
      const raw = Uint8Array.from(atob(SONG.frames.data), (c) => c.charCodeAt(0)), nb = SONG.frames.bands, frames = raw.length / nb;
      for (let i = 0; i < N; i++) {
        const a = Math.floor(i / N * frames), b = Math.max(a + 1, Math.floor((i + 1) / N * frames));
        let s = 0; for (let f = a; f < b; f++) s += raw[f * nb + 3];
        lv.push(s / (b - a) / 255);
      }
      const lo = Math.min(...lv), hi = Math.max(...lv);
      lv = lv.map((v) => Math.pow((v - lo) / (hi - lo || 1), 1.4));
    } else lv = Array.from({ length: N }, (_, i) => .3 + .5 * Math.abs(Math.sin(i * .7)));
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) { const b = document.createElement("i"); b.style.height = `${Math.round(12 + lv[i] * 88)}%`; frag.append(b); bars.push(b); }
    wave.append(frag);
    $("#dropMark").style.left = `${DROP / dur * 100}%`;
    playedBar = -2;
  }
  buildWave();
  addEventListener("resize", buildWave);
  setText("tDur", mmss(SONG?.duration));

  function paintProgress(t) {
    const dur = SONG?.duration || 265;
    const k = Math.floor(t / dur * barN);
    if (k !== playedBar) {
      playedBar = k;
      for (let i = 0; i < bars.length; i++) bars[i].className = i < k ? "p" : i === k ? "now" : "";
    }
    const s = mmss(t);
    if (s !== paintProgress.s) { paintProgress.s = s; setText("tNow", s); wave.setAttribute("aria-valuenow", Math.floor(t)); wave.setAttribute("aria-valuetext", s); }
  }
  {
    let drag = false;
    const at = (e) => { const r = wave.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * (SONG?.duration || 265); };
    wave.addEventListener("pointerdown", (e) => { drag = true; wave.setPointerCapture(e.pointerId); A?.seek(at(e)); });
    wave.addEventListener("pointermove", (e) => { if (drag) A?.seek(at(e)); });
    wave.addEventListener("pointerup", () => { drag = false; });
    wave.addEventListener("pointercancel", () => { drag = false; });
    wave.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); A?.seek(F.t + (e.key === "ArrowRight" ? 5 : -5)); }
    });
  }
  function play() { return A?.play().catch(() => toast("tap play to start the song")); }
  $("#ppBtn").addEventListener("click", () => { if (A?.track.playing || A?.track.waiting) A.pause(); else play(); });
  $("#prevBtn").addEventListener("click", () => { A?.seek(0); play(); });
  $("#nextBtn").addEventListener("click", () => { A?.seek(Math.max(0, DROP - 4.2)); play(); });
  const vol = $("#vol");
  const setVol = (v) => { A?.setVolume(v); vol.value = v; vol.style.setProperty("--v", `${v * 100}%`); };
  vol.addEventListener("input", () => setVol(+vol.value));
  setVol(+vol.value);
  let lastVol = .8;
  function toggleMute() {
    if (!A) return;
    if (A.track.muted || A.track.volume === 0) setVol(lastVol || .8);
    else { lastVol = A.track.volume; A.setMuted(true); }
  }
  $("#muteBtn").addEventListener("click", toggleMute);
  function syncState() {
    const playing = !!(A?.track.playing || A?.track.waiting);
    body.classList.toggle("is-playing", playing);
    body.classList.toggle("is-muted", !!A?.track.muted);
    $("#ppBtn").setAttribute("aria-label", playing ? "Pause" : "Play");
    $("#muteBtn").setAttribute("aria-label", A?.track.muted ? "Unmute" : "Mute");
  }
  A?.on("state", syncState);
  A?.on("ended", () => toast("that's the song — hit play to run it back"));
  addEventListener("keydown", (e) => {
    if (!entered || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea")) return;
    if (e.key === " " && !e.target.closest?.("button, a, [role=slider]")) { e.preventDefault(); $("#ppBtn").click(); }
    if (e.key === "m" || e.key === "M") toggleMute();
  });
  // lock screen / media keys
  if (navigator.mediaSession && window.MediaMetadata && SONG) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: SONG.title, artist: SONG.artist, album: "finalarc", artwork: [{ src: new URL(SONG.cover, location.href).href, sizes: "640x640", type: "image/jpeg" }] });
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} };
    set("play", () => play());
    set("pause", () => A.pause());
    set("seekto", (d) => A.seek(d.seekTime));
  }

  /* ------------------------------------------------------------------------
     Snow (red ash at the drop) + a soft cursor trail
     ------------------------------------------------------------------------ */
  const snow = (() => {
    const cv = $("#snow"), cx = cv.getContext("2d");
    let W = 1, H = 1, D = 1, red = 0;
    const flakes = [], trail = [];
    const size = () => { D = Math.min(devicePixelRatio || 1, 2); W = cv.width = Math.round(innerWidth * D); H = cv.height = Math.round(innerHeight * D); };
    size(); addEventListener("resize", size);
    const sprite = (rgb) => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.35, `rgba(${rgb},.75)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
    const SNOW = sprite("225,235,255"), ASH = sprite("255,70,85");
    let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const COUNT = reduced ? 40 : isPhone() ? 60 : 130;
    for (let i = 0; i < COUNT; i++) { const z = Math.pow(r(), 1.6); flakes.push({ x: r(), y: r(), r: 1.4 + z * 4.2, vy: .00008 + z * .0004, vx: (r() - .5) * .00008, ph: r() * 6.28, a: .25 + z * .6 }); }
    for (let i = 0; i < (isPhone() ? 5 : 11); i++) flakes.push({ x: r(), y: r(), r: 14 + r() * 26, vy: .00006 + r() * .00008, vx: (r() - .5) * .00004, ph: r() * 6.28, a: .05 + r() * .07 });
    if (finePointer && !reduced) addEventListener("pointermove", (e) => { if (trail.length < 60) trail.push({ x: e.clientX + (Math.random() - .5) * 6, y: e.clientY, life: 700 }); });
    return {
      frame(dtMs, redTarget, speed) {
        red += (redTarget - red) * Math.min(1, dtMs / 200);
        cx.clearRect(0, 0, W, H);
        const sp = (reduced ? .4 : 1) * (1 + red * 1.4) * speed;
        for (const f of flakes) {
          f.y += f.vy * dtMs * sp; f.x += (f.vx + Math.sin(f.ph += .0015 * dtMs) * .00004) * dtMs + red * .00012 * dtMs;
          if (f.y > 1.05) { f.y = -.05; f.x = r(); } if (f.x > 1.05) f.x = -.05;
          const R = f.r * D; cx.globalAlpha = f.a; cx.drawImage(red > .5 ? ASH : SNOW, f.x * W - R, f.y * H - R, R * 2, R * 2);
        }
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i]; p.life -= dtMs; if (p.life <= 0) { trail.splice(i, 1); continue; }
          const k = p.life / 700, R = (2 + k * 5) * D; cx.globalAlpha = k * .55; cx.drawImage(red > .5 ? ASH : SNOW, p.x * D - R, (p.y += dtMs * .02) * D - R, R * 2, R * 2);
        }
        cx.globalAlpha = 1;
      },
    };
  })();

  /* ------------------------------------------------------------------------
     Card: tilt toward the cursor, fit short screens
     ------------------------------------------------------------------------ */
  const card = $("#card");
  if (finePointer && !reduced) {
    let raf = 0, nx = 0, ny = 0;
    addEventListener("pointermove", (e) => {
      if (isPhone() || !entered) return;
      const r = card.getBoundingClientRect();
      nx = clamp((e.clientX - r.left) / r.width, -.2, 1.2) - .5; ny = clamp((e.clientY - r.top) / r.height, -.2, 1.2) - .5;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        card.style.transform = `rotateY(${(nx * 5).toFixed(2)}deg) rotateX(${(-ny * 5).toFixed(2)}deg)`;
        card.style.setProperty("--mx", `${((nx + .5) * 100).toFixed(1)}%`); card.style.setProperty("--my", `${((ny + .5) * 100).toFixed(1)}%`);
      });
    });
    document.addEventListener("pointerleave", () => { card.style.transform = ""; });
  }
  function fit() {
    card.style.zoom = "";
    if (isPhone()) return;
    const k = Math.min(1, (innerHeight - 120) / card.offsetHeight, (innerWidth - 48) / card.offsetWidth);
    if (k < 1) card.style.zoom = Math.max(.55, k).toFixed(3);
  }
  fit(); addEventListener("resize", fit); document.fonts?.ready.then(fit);

  /* ------------------------------------------------------------------------
     The drop: blood, tape, the red takeover — and the smaller hits after it
     ------------------------------------------------------------------------ */
  const blood = (() => {
    const cv = $("#blood"), g = cv.getContext("2d");
    const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    function tear(x, y, s, a, len) {
      g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -s);
      g.bezierCurveTo(s * len * .35, -s * .9, s * len * .7, -s * .25, s * len, 0);
      g.bezierCurveTo(s * len * .7, s * .25, s * len * .35, s * .9, 0, s);
      g.arc(0, 0, s, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill(); g.restore();
    }
    function splat(x, y, R, sd, o = {}) {
      const r = mulberry(sd), dir = o.dir ?? r() * 6.283, spread = o.spread ?? Math.PI, drips = o.drips ?? 0;
      const red = (l) => `hsl(${353 + r() * 5},${84 + r() * 10}%,${l * .9}%)`;
      const ns = Math.round(R * 1.2);
      for (let i = 0; i < ns; i++) { const a = dir + (r() * 2 - 1) * spread, d = R * (1.15 + Math.pow(r(), 1.25) * 5.2), sz = R * .09 * Math.max(0, 1.15 - (d / R) / 6.8) * (.3 + r()); if (sz < .45) continue; g.fillStyle = red(20 + r() * 12); tear(x + Math.cos(a) * d, y + Math.sin(a) * d, sz, a, 1.5 + r() * 2.8); }
      const n = 14 + (r() * 10 | 0);
      for (let i = 0; i < n; i++) {
        const a = dir + (r() * 2 - 1) * spread * .8, L = R * (1.05 + Math.pow(r(), 1.8) * 2.3), w = R * (.035 + r() * .08);
        g.fillStyle = red(22 + r() * 9); g.save(); g.translate(x, y); g.rotate(a); g.beginPath();
        g.moveTo(R * .55, -w); g.quadraticCurveTo(L * .75, -w * .35, L, 0); g.quadraticCurveTo(L * .75, w * .35, R * .55, w); g.closePath(); g.fill();
        if (r() < .55) { g.beginPath(); g.arc(L + w * .4, 0, w * (.7 + r() * .7), 0, 6.283); g.fill(); } g.restore();
      }
      const N = 120, ph = [0, 0, 0, 0, 0].map(() => r() * 6.283), path = new Path2D();
      for (let i = 0; i <= N; i++) {
        const t = i / N * 6.283, k = 1 + .11 * Math.sin(2 * t + ph[0]) + .07 * Math.sin(5 * t + ph[1]) + .05 * Math.sin(9 * t + ph[2]) + .03 * Math.sin(15 * t + ph[3]) + .018 * Math.sin(27 * t + ph[4]);
        const px = x + Math.cos(t) * R * k, py = y + Math.sin(t) * R * k * .93; i ? path.lineTo(px, py) : path.moveTo(px, py);
      }
      path.closePath();
      const gr = g.createRadialGradient(x - R * .25, y - R * .3, R * .05, x, y, R * 1.15);
      gr.addColorStop(0, "#a80f1c"); gr.addColorStop(.6, "#7c0712"); gr.addColorStop(1, "#4a0208");
      g.fillStyle = gr; g.fill(path);
      for (let i = 0; i < drips; i++) {
        const ox = x + (r() - .5) * R * 1.1, oy = y + R * .45, len = R * (1.3 + r() * 3.4), w = R * (.05 + r() * .06);
        const gd = g.createLinearGradient(0, oy, 0, oy + len); gd.addColorStop(0, "#860814"); gd.addColorStop(1, "#5c040c"); g.fillStyle = gd;
        g.beginPath(); g.moveTo(ox - w, oy); g.bezierCurveTo(ox - w * .8, oy + len * .5, ox - w * .55, oy + len * .85, ox - w * .6, oy + len);
        g.lineTo(ox + w * .6, oy + len); g.bezierCurveTo(ox + w * .55, oy + len * .85, ox + w * .8, oy + len * .5, ox + w, oy); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(ox, oy + len, w * 1.25, w * 1.45, 0, 0, 6.283); g.fill();
        g.fillStyle = "rgba(255,190,190,.25)"; g.beginPath(); g.arc(ox - w * .45, oy + len - w * .4, w * .32, 0, 6.283); g.fill();
      }
      g.save(); g.clip(path);
      const hl = g.createRadialGradient(x - R * .35, y - R * .4, 0, x - R * .35, y - R * .4, R * .7); hl.addColorStop(0, "rgba(255,150,150,.28)"); hl.addColorStop(1, "rgba(255,150,150,0)");
      g.fillStyle = hl; g.fillRect(x - R * 2, y - R * 2, R * 4, R * 4); g.restore();
      g.fillStyle = "rgba(255,225,225,.35)"; g.beginPath(); g.ellipse(x - R * .45, y - R * .38, Math.max(1, R * .07), Math.max(.8, R * .035), -.6, 0, 6.283); g.fill();
    }
    function mist(n, sd) {
      const r = mulberry(sd), w = innerWidth, h = innerHeight;
      for (let i = 0; i < n; i++) { const c = r(), x = (c < .5 ? c * c * 2 : 1 - (1 - c) * (1 - c) * 2) * w, y = r() * h, sz = .5 + Math.pow(r(), 4) * 3; g.fillStyle = `hsla(${352 + r() * 6},85%,${24 + r() * 12}%,${.55 + r() * .4})`; tear(x, y, sz, r() * 6.283, 1 + r() * 2); }
    }
    return {
      paint(seed = 0) {
        const D = Math.min(devicePixelRatio || 1, 2);
        cv.width = Math.round(innerWidth * D); cv.height = Math.round(innerHeight * D); g.setTransform(D, 0, 0, D, 0, 0);
        const w = innerWidth, h = innerHeight, s = isPhone() ? .8 : Math.min(w / 1440, h / 900);
        mist(isPhone() ? 40 : 90, 5 + seed);
        splat(w * .015, h * .16, 74 * s, 3 + seed, { dir: .25, spread: .95, drips: 3 });
        splat(w * .99, h * .95, 96 * s, 8 + seed, { dir: 3.55, spread: .9 });
        splat(w * .9, h * .1, 24 * s, 21 + seed, { dir: 2.5, spread: 1.0, drips: 2 });
        splat(w * .12, h * .9, 17 * s, 33 + seed, { dir: -.7, spread: 1.1, drips: 1 });
        splat(w * .53, h * .03, 11 * s, 41 + seed, { dir: 1.7, spread: 1.3, drips: 1 });
      },
    };
  })();

  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function pulse(cls, ms) { body.classList.remove(cls); void body.offsetWidth; body.classList.add(cls); later(() => body.classList.remove(cls), ms); }
  A?.on("drop", (i) => {
    if (!entered) return;
    if (i === 0) {                                        // the takedown
      blood.paint(0);
      body.classList.add("bloody", "tapes");
      if (!reduced) { pulse("flashing", 600); pulse("shaking", 600); }
      later(() => body.classList.remove("tapes"), 2800);
      later(() => body.classList.remove("bloody"), 7000);
      navigator.vibrate?.([70, 40, 160]);
      window.AVATAR3D?.cue("takedown");
    } else if (i === 1) {                                 // drop ii: a hit
      if (!reduced) { pulse("flashing", 600); pulse("shaking", 600); }
      pulse("hit", 2400);
      window.AVATAR3D?.cue("drop");
    } else {                                              // drop iii: the tape comes back
      blood.paint(7);
      body.classList.add("bloody", "tapes");
      if (!reduced) { pulse("flashing", 600); pulse("shaking", 600); }
      later(() => body.classList.remove("tapes"), 2200);
      later(() => body.classList.remove("bloody"), 5000);
      window.AVATAR3D?.cue("takedown");
    }
  });
  // the red takeover holds while the takedown plays out (and through drop iii's first bars)
  const redAt = (t) => (t >= DROP && t < T(24)) || (t >= T(112) && t < T(116));

  /* ------------------------------------------------------------------------
     Clock in the corner
     ------------------------------------------------------------------------ */
  function tickClock() {
    if (!CONFIG.timezone) { setText("clock", "live"); setText("clockTz", "roblox × discord"); $(".hud-tr .live").classList.add("is-dot"); return; }
    try { setText("clock", new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CONFIG.timezone })); setText("clockTz", "local time"); }
    catch { setText("clock", "live"); setText("clockTz", "roblox × discord"); }
  }
  tickClock(); setInterval(tickClock, 15000);

  /* ------------------------------------------------------------------------
     Frame
     ------------------------------------------------------------------------ */
  const beatEls = [$(".bg-beam"), $(".stage"), $(".floor-ring"), $(".pfp-ring"), $("#ppBtn")];
  const kickEls = [$(".cover")];
  let lastNow = performance.now(), beatV = -1, kickV = -1;
  function frame(now) {
    const dt = clamp((now - lastNow) / 1000, .001, .1);
    lastNow = now;
    if (A) {
      A.update(now, dt);
      const playing = A.track.playing && !F.gap;
      const beat = playing ? Math.round(Math.pow(1 - F.frac, 3) * 100) / 100 : 0;
      const kick = playing ? Math.round(F.kick * 100) / 100 : 0;
      if (beat !== beatV) { beatV = beat; for (const el of beatEls) el?.style.setProperty("--beat", beat); }
      if (kick !== kickV) { kickV = kick; for (const el of kickEls) el?.style.setProperty("--kick", kick); }
      paintProgress(F.t);
      const red = entered && redAt(F.t) && (A.track.playing || A.track.waiting || F.t > 0);
      if (red !== body.classList.contains("drop")) body.classList.toggle("drop", red);
      snow.frame(dt * 1000, red ? 1 : 0, playing ? 1 + F.level * .25 : 1);
      window.AVATAR3D?.frame(now, dt, F, red);
    } else snow.frame(dt * 1000, 0, 1);
    chatTick(now);
    tickSpotify();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------------------
     Boot: load everything behind the joining screen, then join
     ------------------------------------------------------------------------ */
  renderDiscordShell();
  LOAD.set("roblox", .1);
  const EMPTY = { user: null, friends: null, followers: null, following: null, headshot: null, avatar: null, badges: null, groups: null, games: [], wearing: [] };
  const data = fetchRoblox()
    .catch((e) => { console.warn(e); return EMPTY; })
    .then((d) => {
      window.__reVisits = d.games[0]?.visits || 0;
      renderRoblox(d);
      fit();
      LOAD.done("roblox", d.user ? "" : "offline");
      return preloadImages([d.headshot, d.avatar, ...(d.wearing || []).slice(0, 6).map((w) => w.icon), "audio/cover.jpg"]).then(() => d);
    });
  window.SITE = { data, toast, card };
  refreshPresence();
  refreshDiscord(true);
  setInterval(() => refreshDiscord(false), 30000);
  setInterval(refreshPresence, 60000);
  // if the 3D module can't run (old browser, file blocked), don't hold the gate for it
  setTimeout(() => { if (!window.AVATAR3D) LOAD.done("avatar3d", "2d"); }, 15000);

  const gate = $("#gate"), bootAt = performance.now();
  let shown = 0, ready = false, queued = null;
  (function loader(now) {
    const elapsed = now - bootAt;
    const done = (LOAD.complete && elapsed > 700) || elapsed > 25000;
    const target = done ? 1 : Math.min(LOAD.progress, .99);
    shown += (target - shown) * .14;
    if (done && shown > .995) shown = 1;
    $("#gateBar").style.transform = `scaleX(${shown.toFixed(4)})`;
    const cur = LOAD.current;
    setText("gateStatus", done ? "Ready" : cur ? `${cur.label}${cur.note ? ` · ${cur.note}` : "…"}` : "Joining server…");
    if (shown < 1) return requestAnimationFrame(loader);
    ready = true;
    gate.classList.add("is-ready");
    setText("gateStatus", "Server ready · 1 / 1");
    if (queued) enter(queued === "sound");
  })(performance.now());

  function enter(sound) {
    if (entered) return;
    if (sound) A?.unlock();                       // still inside the tap: wake the audio context
    if (!ready) { queued = sound ? "sound" : "quiet"; setText("gateStatus", "Almost there…"); return; }
    entered = true;
    gate.classList.add("is-gone");
    body.classList.remove("is-loading");
    body.classList.add("is-entered");
    if (sound) play();
    syncState();
    chatAt = performance.now() + 900;
    window.AVATAR3D?.enter?.();
    setTimeout(fit, 50);
  }
  gate.addEventListener("click", (e) => enter(!e.target.closest("#gateQuiet")));
  gate.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enter(true); } });
  gate.focus?.({ preventScroll: true });
})();
