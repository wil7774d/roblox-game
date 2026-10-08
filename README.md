# finalarc

A personal profile site (a custom guns.lol-style page) with live Roblox stats and Discord presence, scored to a track.
It is plain HTML/CSS/JS with no build step and no dependencies.

## Run it

Serve the folder with anything that supports HTTP range requests (needed to seek in the MP3):

```sh
npx http-server -c-1 .
```

`python3 -m http.server` also works, but it can't seek, so scrubbing in the player jumps back to 0:00. Opening `index.html` straight from disk plays the music, but the meters use the precomputed song map instead of the live analyser.

### Host on GitHub Pages
Go to repo **Settings → Pages**, set **Source: Deploy from a branch**, then pick the branch and the `/ (root)` folder. Pages supports range requests, so everything works there.

## The show

Click **click to enter** and the site plays *aloneagain* by NIVEK FFORHS and drives itself in time with it:

| Time | Bar | What happens |
| --- | --- | --- |
| 0:00 | 1 | Hero. Every time the intro stops dead, the page freezes with it. |
| 0:07.27 | 5 | Manifesto, a word per beat. |
| 0:14.55 | 9 | The 808s come in: the stats fly past, a card on every beat. |
| 0:21.82 | 13 | Chapter i: the player chart climbs to its 497 peak. |
| 0:25.46 | 15 | Chapter ii: letterbox closes, camera pushes in, countdown to the drop. |
| 0:28.65 | — | The track goes silent: blackout and a flatline. |
| **0:29.09** | **17** | **The drop: TAKEN DOWN, blood across the screen, shake, everything red.** |
| 0:43.64 | 25 | The reupload. Then the avatar and the closet, pieces landing on the beat. |
| 1:27.27 | 49 | The hook: a calmer glide through insights and the vault. |
| 2:25.46 | 81 | Drop ii: **now playing**, the full-screen meter. |
| 3:09.09 | 105 | Discord. |
| 3:21.82 | 112 | The bass cuts out: VHS rewind to the top. |
| 3:23.64 | 113 | Drop iii: FINAL ARC slams back in, then a hard cut every 2 bars through the whole site. |
| 4:21.82 | 145 | Outro, landing on Discord. |

Everything also reacts live: the background arc is a 64-band spectrum of the track, it pulses with the kicks and tightens through each run-up. The corner player (the "deck") has a real VU needle that overshoots, pegs and bounces, an LED spectrum with falling peak caps, and a scrubber showing the whole song.

**You stay in control.** Scroll, swipe or use the keyboard and autopilot hands you the wheel while the music keeps going. Press **autopilot** in the player (or `A`) to rejoin the song where it is. `M` mutes. Visitors can also enter without sound. With *reduce motion* on, the music plays but nothing scrolls by itself.

### Files

| File | What it is |
| --- | --- |
| `audio/aloneagain.mp3`, `audio/cover.jpg` | The track and its cover art. |
| `audio/song.js` | The song map: the 132 bpm grid, sections, the 13 silences, 565 kicks, 563 snares, 603 hats and loudness envelopes, measured from the MP3. |
| `show.js` | Audio engine, song clock, the autopilot director (its cue list is `KEYS`), the drop effects, the deck and the stage. |
| `meter.js` | The arc meter (deck and stage). |
| `tools/songmap.py` | Regenerates `audio/song.js`: `python3 tools/songmap.py audio/aloneagain.mp3 audio/song.js` (needs ffmpeg, numpy, scipy). |

To move a cue, change its time in `KEYS` in `show.js`. To use a different song, set its tempo, drop and sections at the top of `tools/songmap.py`, re-run it, then retime `KEYS`.

The site is public, so the track can draw a copyright takedown. A song you have rights to is the safe choice.

## Live data

| Source | How |
| --- | --- |
| Roblox (profile, avatar, friends, followers, badges, groups, games, past names) | Public Roblox APIs through the `roproxy.com` CORS mirror. If that fails, it falls back to `corsproxy.io` and then `allorigins`. Results are cached in the browser for 10 min. |
| Discord: main + alt (status, avatar, custom status, game, Spotify) | [Lanyard](https://github.com/Phineas/lanyard). Both accounts need to be in the Lanyard Discord server (https://discord.gg/lanyard). Until they are, the cards show a static fallback. |

The game chart in chapter iii is a reconstruction. Its shape is illustrative, but the 497-player peak is the real number.

## Customize

Change IDs, Discord accounts, the original game's numbers and the closet items/prices in the `CONFIG` block at the top of `main.js`. Change the colors in the `:root` tokens in `styles.css`.
