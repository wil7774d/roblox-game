# finalarc

A personal profile site (a custom guns.lol-style page) with live Roblox stats and Discord presence, scored to a track.
It is plain HTML/CSS/JS with no build step. The only library is three.js, vendored in `vendor/`.

## Run it

Serve the folder with anything that supports HTTP range requests (needed to seek in the MP3):

```sh
npx http-server -c-1 .
```

`python3 -m http.server` also works, but it can't seek, so scrubbing in the player jumps back to 0:00. Opening `index.html` straight from disk plays the music, but the meters use the precomputed song map instead of the live analyser.

### Host on GitHub Pages
Go to repo **Settings → Pages**, set **Source: Deploy from a branch**, then pick the branch and the `/ (root)` folder. Pages supports range requests, so everything works there.

## The show

Everything loads behind the gate first: the whole track, every image, the fonts, the 3D engine and the avatar. Shaders are compiled and the camera runs through every section once before the gate opens, so nothing loads mid-show.

Click **click to enter** and the site plays *aloneagain* by NIVEK FFORHS and drives itself in time with it. Your Roblox avatar is in it too, in 3D:

| Time | Bar | What happens |
| --- | --- | --- |
| 0:00 | 1 | Your avatar drops in with a spawn forcefield. Every time the intro stops dead, the page and the avatar freeze with it, then it snaps into a new pose: point, flex, T-pose, the finger. |
| 0:07.27 | 5 | It hops onto the player and sits there through the manifesto. |
| 0:14.55 | 9 | The 808s come in: the stats fly past, a card on every beat, while your avatar sprints along them. |
| 0:21.82 | 13 | Chapter i: your avatar rides the player chart up to its 497 peak. |
| 0:25.46 | 15 | Chapter ii: the **ban hammer** shows up and winds up. Letterbox closes, countdown to the drop. |
| 0:28.65 | — | The track goes silent: blackout, flatline, the hammer frozen over your head. |
| **0:29.09** | **17** | **The drop: the hammer slams you off the screen. TAKEN DOWN, blood, bricks everywhere. You respawn and flip Roblox off, with one clone or noob joining on every beat.** |
| 0:43.64 | 25 | The reupload. Then the avatar scene (in 3D if you've baked your mesh, see below) and the closet. |
| 1:27.27 | 49 | The hook: a calmer glide through insights and the vault, your avatar chilling on the player. |
| 2:25.46 | 81 | Drop ii: **now playing**, the full-screen meter, a row of headbangers. |
| 3:09.09 | 105 | Discord. |
| 3:21.82 | 112 | The bass cuts out: VHS rewind to the top, moonwalking. |
| 3:23.64 | 113 | Drop iii: FINAL ARC slams back in, then a hard cut every 2 bars through the whole site, the army in a new spot each cut. The hammer comes back once. |
| 4:21.82 | 145 | Outro: oof. Your avatar falls apart into bricks, then respawns to say gg. |

Everything also reacts live: the background arc is a 64-band spectrum of the track, it pulses with the kicks and tightens through each run-up. The corner player (the "deck") has a real VU needle that overshoots, pegs and bounces, an LED spectrum with falling peak caps, and a scrubber showing the whole song.

**Autopilot is on by default and it owns the camera.** The camera is a virtual one: the page is moved by transform along a smooth spline through the song, not by scrolling, so it never steps. Scrolling is locked while it drives. To take over, click **autopilot** in the player **twice**, or press `A` twice. That pauses everything and tells you: *ruins your experience with it off gng but you do you*. One click turns it back on where the song left off. `M` mutes. Visitors can also enter without sound, which starts with autopilot off. With *reduce motion* on, nothing scrolls by itself. When autopilot is off, your avatar chills: it idles in the hero, models the fit in the avatar scene, and sits on the player.

If the device can't keep up, quality steps down by itself (background resolution, 3D pixel ratio, army size, debris).

### Files

| File | What it is |
| --- | --- |
| `audio/aloneagain.mp3`, `audio/cover.jpg` | The track and its cover art. |
| `audio/song.js` | The song map: the 132 bpm grid, sections, the 13 silences, 565 kicks, 563 snares, 603 hats and loudness envelopes, measured from the MP3. |
| `show.js` | Audio engine, song clock, the autopilot director (its path is `NODES`, its one-shot cues `CUES`), the drop effects, the deck and the stage. |
| `stage3d.js` | The 3D world: your avatar, its moves on the timeline (`HERO`), the chat lines (`LINES`), the army, the ban hammer, the forcefields, bricks and oof. |
| `rig.js` | The R6 skeleton every character shares, the blocky fallback avatar, the real-mesh rigger and the clips (idle, run, flip, headbang …). |
| `vendor/` | three.js 0.160 (MIT) and the loaders it needs. |
| `tools/fetch-avatar.mjs` | Bakes your real 3D avatar into `avatar/` (see below). |
| `meter.js` | The arc meter (deck and stage). |
| `tools/songmap.py` | Regenerates `audio/song.js`: `python3 tools/songmap.py audio/aloneagain.mp3 audio/song.js` (needs ffmpeg, numpy, scipy). |

To move the camera, change a node's time in `NODES` in `show.js`. To change what the avatar does, edit `HERO` in `stage3d.js`. To use a different song, set its tempo, drop and sections at the top of `tools/songmap.py`, re-run it, then retime `KEYS`.

The site is public, so the track can draw a copyright takedown. A song you have rights to is the safe choice.

## Live data

| Source | How |
| --- | --- |
| Roblox (profile, avatar, friends, followers, badges, groups, games, past names) | Public Roblox APIs through the `roproxy.com` CORS mirror. If that fails, it falls back to `corsproxy.io` and then `allorigins`. Results are cached in the browser for 10 min. |
| Discord: main + alt (status, avatar, custom status, game, Spotify) | [Lanyard](https://github.com/Phineas/lanyard). Both accounts need to be in the Lanyard Discord server (https://discord.gg/lanyard). Until they are, the cards show a static fallback. |

The game chart in chapter iii is a reconstruction. Its shape is illustrative, but the 497-player peak is the real number.

## Your avatar in 3D

By default the 3D avatar is a blocky R6 built from your live Roblox body colours. It also picks up a headless head, a Korblox leg, horns, crowns and Valkyries from what you're wearing, and samples your shirt and pants colours from your 2D render when the CDN allows it.

To put your **real** avatar mesh in, with clothes, accessories and all, bake it once. Roblox's 3D endpoint needs auth, and its CDN has no CORS, so a browser can't fetch it live:

```sh
ROBLOX_API_KEY=your-open-cloud-key node tools/fetch-avatar.mjs
# or: ROBLOX_COOKIE=your-.ROBLOSECURITY-value node tools/fetch-avatar.mjs
```

It needs Node 18+. The API key is an Open Cloud key with *thumbnail:read* (create.roblox.com → Open Cloud → API keys). The script writes `avatar/` (the OBJ, MTL, textures and `meta.json`); commit that folder. The site loads it from its own origin behind the gate, rigs it onto the same skeleton, and swaps the 2D render in the avatar scene for the 3D one. Re-run it whenever you change your fit. Never commit the key or the cookie.

## Customize

Change IDs, Discord accounts, the original game's numbers and the closet items/prices in the `CONFIG` block at the top of `main.js`. Change the colors in the `:root` tokens in `styles.css`.
