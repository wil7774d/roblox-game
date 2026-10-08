// Bakes your real 3d Roblox avatar into avatar/ so the site can load it from its own origin.
// Roblox's avatar-3d endpoint needs auth (since March 2026) and its CDN sends no CORS headers,
// so a browser can't fetch it live — run this once (and again whenever you change your fit).
//
//   ROBLOX_API_KEY=...  node tools/fetch-avatar.mjs            (Open Cloud key with thumbnail:read)
//   ROBLOX_COOKIE=...   node tools/fetch-avatar.mjs            (or your .ROBLOSECURITY cookie)
//   node tools/fetch-avatar.mjs <userId> <outDir>              (defaults: CONFIG.robloxId in main.js, avatar/)
//
// Node 18+. Writes avatar.obj, avatar.mtl (map_* rewritten to local files, map_d dropped),
// one png per texture and meta.json, into a temp dir that only replaces avatar/ on full success.
// Commit the folder; stage3d.js picks it up automatically and the blocky fallback steps aside.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// hash → CDN host: XOR seeded with 31 over every character (30DAY- prefix included), mod 8
export function rbxCdnUrl(hash, prefix = "t") {
  if (/^https?:\/\//i.test(hash)) return hash;
  let i = 31;
  for (let n = 0; n < hash.length; n++) i ^= hash.charCodeAt(n);
  return `https://${prefix}${i % 8}.rbxcdn.com/${hash}`;
}
async function fetchCdn(hash) {
  const urls = [...new Set([rbxCdnUrl(hash), ...Array.from({ length: 8 }, (_, k) => `https://t${k}.rbxcdn.com/${hash}`)])];
  for (const url of urls) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`CDN miss for ${hash}`);
}

async function avatar3d(userId, headers) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 401 || r.status === 403) throw new Error(`auth rejected (${r.status}) — check ROBLOX_API_KEY / ROBLOX_COOKIE`);
    if (r.status === 429) { await sleep(1000 * (+r.headers.get("retry-after") || 5)); continue; }
    if (!r.ok) throw new Error(`avatar-3d HTTP ${r.status}`);
    const j = await r.json();
    if (j.state === "Completed" && j.imageUrl) return (await fetch(j.imageUrl)).json();
    if (j.state !== "Pending") throw new Error(`avatar-3d state ${j.state}`);
    process.stdout.write(".");
    await sleep(Math.min(1000 + attempt * 500, 3000));
  }
  throw new Error("avatar-3d is still Pending — try again in a few minutes");
}

async function main() {
  let [userId, outDir = path.join(here, "..", "avatar")] = process.argv.slice(2);
  if (!userId) {
    const src = await readFile(path.join(here, "..", "main.js"), "utf8");
    userId = src.match(/robloxId:\s*(\d+)/)?.[1];
  }
  if (!userId) throw new Error("usage: node tools/fetch-avatar.mjs <userId> [outDir]");
  const headers = process.env.ROBLOX_API_KEY ? { "x-api-key": process.env.ROBLOX_API_KEY }
    : process.env.ROBLOX_COOKIE ? { Cookie: `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}` } : null;
  if (!headers) throw new Error("set ROBLOX_API_KEY (Open Cloud, thumbnail:read) or ROBLOX_COOKIE");

  console.log(`avatar-3d for ${userId}`);
  const meta = await avatar3d(userId, headers);
  const tmp = `${outDir}.tmp`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await writeFile(path.join(tmp, "avatar.obj"), await fetchCdn(meta.obj));
  let mtl = (await fetchCdn(meta.mtl)).toString("utf8");
  for (const h of meta.textures || []) {
    await writeFile(path.join(tmp, `${h}.png`), await fetchCdn(h));
    mtl = mtl.split(h).join(`${h}.png`);
  }
  mtl = mtl.replace(/^\s*map_d\s.*$/gim, "");   // Roblox's alpha map makes the model see-through in three.js
  await writeFile(path.join(tmp, "avatar.mtl"), mtl);
  // body colours too, for reference (the mesh has them baked into its texture)
  const colours = await fetch(`https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  await writeFile(path.join(tmp, "meta.json"), JSON.stringify({
    userId: +userId, bakedAt: new Date().toISOString(), objFile: "avatar.obj", mtlFile: "avatar.mtl",
    camera: meta.camera, aabb: meta.aabb, textures: (meta.textures || []).map((h) => `${h}.png`), bodyColor3s: colours?.bodyColor3s ?? null,
  }, null, 2));
  await rm(outDir, { recursive: true, force: true });
  await rename(tmp, outDir);
  console.log(`\nsaved ${outDir} (${(meta.textures || []).length} textures) — commit it and push`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(`\n${e.message}`); process.exit(1); });
