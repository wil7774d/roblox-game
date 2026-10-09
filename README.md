# finalarc

A one-screen Roblox profile in the style of guns.lol: live Roblox stats, both Discord accounts, the game Roblox took down, and your avatar. It's scored to a track.
It is plain HTML/CSS/JS with no build step. The only library is three.js, vendored in `vendor/`, and it's used only for the 3D avatar.

## Run it

Serve the folder with anything that supports HTTP range requests:

```sh
npx http-server -c-1 .
```

### Host on GitHub Pages
Go to the repo's **Settings → Pages**, set **Source: Deploy from a branch**, then pick the branch and the `/ (root)` folder.

## What's on it

- **Joining screen**: built like a Roblox "joining experience" screen. Behind it, everything loads with real progress: the whole song, your avatar renders and items, fonts, and the 3D avatar if it's baked. Click to join and the song starts. "Join without sound" is there too.
- **The card**:
  - Your Roblox headshot, display name, verified seal (only if you're verified) and badges.
  - Your Roblox presence (In Studio, in game, online), falling back to your Discord status.
  - Join date and years on Roblox.
  - A Roblox player list ("leaderstats") with friends, followers, following, badges and groups.
- **The avatar**:
  - Your official Roblox full-body render, or your real 3D avatar once it's baked (see below).
  - It types your bio in Roblox bubble chat.
  - Under it, the items you're wearing right now, each linking to the catalog.
- **The game**: "[ Content Deleted ]", moderated. It shows the 497 peak and 500K visits, a chart that climbs to the peak and gets cut to zero, and a Play button for the reupload.
- **Discord**: main and alt, live from Lanyard, with status, Spotify (album art and progress) or the game you're playing.
- **The player**: the waveform is drawn from the song's real loudness. Click or drag it to seek. There's a marker at the 0:29 drop, a skip-to-the-drop button, volume, and media keys.
- **The drop (0:29)**:
  - A white flash, a shake and blood across the screen.
  - "[ CONTENT DELETED ]" moderation tape, and the whole scene goes red.
  - The chat bubble says "cold." and your 3D avatar flips Roblox off with both hands.
  - The red holds until the track settles at 0:43. Drop ii (2:25) hits, and drop iii (3:23) brings the tape back.

Keys: `Space` play/pause, `M` mute, `←`/`→` on the waveform to seek.

## Your real avatar in 3D

Roblox only gives out the 3D avatar file to logged-in or API-key requests, and its CDN blocks other sites, so the page can't fetch it live. Bake it into the repo once with the included GitHub Action:

1. **Make a Roblox API key.**
   - Go to [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials) → **Create API key**.
   - Name it, e.g. `finalarc avatar`.
   - Under **Access permissions**, add the **Thumbnails** API with **Read** (the `thumbnail:read` scope).
   - Under **Security**, add the IP address `0.0.0.0/0` so GitHub can use it.
   - Create the key and copy it.
2. **Add it to the repo.** Go to GitHub → this repo → **Settings → Secrets and variables → Actions → New repository secret**. Set the name to `ROBLOX_API_KEY` and paste the key as the value.
3. **Run the bake.**
   - Open the **Actions** tab → **Bake avatar**.
   - Open the latest run and click **Re-run all jobs**.
   - On the default branch you can use **Run workflow** instead.
   - It commits an `avatar/` folder with your exact mesh, clothes and accessories.

Once it's baked, the avatar panel shows a **2D / 3D** switch.
- In 3D your avatar idles, bobs to the beat and looks at the cursor.
- It waves when you click it. You can drag it to spin it.
- It flips Roblox off at the drop and headbangs through it.

Re-run the bake whenever you change your fit. It also re-runs on Mondays (on the default branch only).

Prefer your own computer? Run `ROBLOX_API_KEY=... node tools/fetch-avatar.mjs` (Node 18+), then commit `avatar/`. Never commit the key itself.

## Customize

Everything personal is in the `CONFIG` block at the top of `main.js`:
- your Roblox id and both Discord accounts
- the taken-down game's numbers, plus `reuploadPlaceId` if the Play button should open a specific place
- the bio lines the avatar types
- your location
- `timezone`, which shows your local time in the corner
- `socials`, extra links next to Add Friend (YouTube, TikTok, Spotify, X, Instagram, Twitch, GitHub or any link)

Colours are the `:root` tokens in `styles.css`.

## Live data

| Source | How |
| --- | --- |
| Roblox: profile, renders, stats, presence, items, games | Public Roblox APIs through the `roproxy.com` CORS mirror. If that fails, it falls back to `corsproxy.io` and then `allorigins`. Results are cached in the browser for 10 min. |
| Discord: main + alt (status, avatar, Spotify, game) | [Lanyard](https://github.com/Phineas/lanyard). Both accounts need to be in the Lanyard Discord server (https://discord.gg/lanyard). |

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css` | The page. |
| `main.js` | `CONFIG`, the preload registry and the live data (Roblox, Lanyard). |
| `app.js` | Everything you see and touch: the joining screen, the card, the chat bubbles, the player, snow, tilt and the drop. |
| `audio.js` | The song: it's downloaded fully before you join, played through Web Audio, with a beat-accurate clock. |
| `audio/aloneagain.mp3`, `audio/cover.jpg`, `audio/song.js` | The track, its cover and its map: 132 bpm, sections, silences, every kick and snare, and loudness. Regenerate the map with `python3 tools/songmap.py audio/aloneagain.mp3 audio/song.js` (needs ffmpeg, numpy, scipy). |
| `avatar3d.js`, `rig.js` | The 3D avatar: loads `avatar/`, rigs it and animates it. |
| `tools/fetch-avatar.mjs`, `.github/workflows/bake-avatar.yml` | The avatar bake. |

The site is public, so the track can draw a copyright takedown. A song you have rights to is the safe choice.
