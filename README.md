# finalarc

A personal profile site (a custom guns.lol-style page) with live Roblox stats and Discord presence.
It is plain HTML/CSS/JS with no build step and no dependencies.

## Run it

Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8080
```

### Host on GitHub Pages
Go to repo **Settings → Pages**, set **Source: Deploy from a branch**, then pick the branch and the `/ (root)` folder.

## Live data

| Source | How |
| --- | --- |
| Roblox (profile, avatar, friends, followers, badges, groups, games, past names) | Public Roblox APIs through the `roproxy.com` CORS mirror. If that fails, it falls back to `corsproxy.io` and then `allorigins`. Results are cached in the browser for 10 min. |
| Discord (status, avatar, custom status, game, Spotify) | [Lanyard](https://github.com/Phineas/lanyard). **To turn on live presence, join the Lanyard Discord server: https://discord.gg/lanyard.** Until you do, the card shows a static fallback. |

## Customize

Change IDs and limits in the `CONFIG` block at the top of `main.js`. Change the colors in the `:root` tokens in `styles.css`.
