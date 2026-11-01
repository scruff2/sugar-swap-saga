# Sugar Swap Saga

**Play it:** https://scruff2.github.io/sugar-swap-saga/. There is a sister game that follows the Soda rules: [Soda Swap Saga](https://github.com/scruff2/soda-swap-saga).

A Candy Crush–style match-3 saga game. It's a plain HTML5/JavaScript web app with no build step, and it can be installed as a full-screen offline app (PWA). It's built for the Samsung Galaxy Tab A9+ and works in landscape or portrait.

## Features

- A 9×9-style board with shaped layouts and gaps. You can swap candies by dragging or by tapping two candies.
- Six candy types: red jelly bean, orange lozenge, yellow lemon drop, green square, blue lollipop head, purple cluster.
- Special candies:
  - **Striped** (match 4): clears a row or column. The stripe follows the swipe direction.
  - **Wrapped** (L or T shape): explodes twice in a 3×3 area.
  - **Color bomb** (match 5): clears every candy of one color.
- Combos: striped+striped (cross), striped+wrapped (3-wide cross), wrapped+wrapped (5×5 twice), bomb+candy, bomb+striped, bomb+wrapped, bomb+bomb (clears the whole board).
- Blockers: single and double jelly, frosting (1–5 layers), spreading chocolate, licorice locks, and candy time-bombs.
- Level types: score target, clear the jelly, bring down ingredients (cherries and hazelnuts), orders, and timed.
- **Sugar Crush** at the end of a level: leftover moves turn into striped candies that all go off.
- Score cascades, "Sweet! Tasty! Delicious! Divine!" callouts (spoken by a deep announcer voice), hints when you sit idle, and automatic reshuffle when no moves are left.
- A saga map with 60 levels across 4 episodes, 1–3 stars per level, and saved progress.
- Lives: 5 maximum, one comes back every 30 minutes. Settings has an unlimited-lives switch.
- Boosters:
  - In-game: Lollipop Hammer, Free Switch, Shuffle.
  - Before a level: Color Bomb, Striped+Wrapped, +3 Moves.
  - When you run out of moves: +5 Moves.
- Synthesized sound effects and music, with nothing to download. All the art is drawn in code.

## Install

### On an Android phone or tablet (recommended)

1. Open **https://scruff2.github.io/sugar-swap-saga/** in Chrome.
2. Tap **Install**, or use ⋮ → *Add to Home screen* → *Install*.

Sugar Swap Saga installs as a full-screen app that works offline, and it updates itself when the game changes. This works on iPads and PCs too.

### Or download the APK

1. Download the latest `.apk` from **[Releases](https://github.com/scruff2/sugar-swap-saga/releases/latest)** on the device.
2. Open the file. If Android asks, allow your browser to **install unknown apps**, then tap **Install**.

New APK versions install over the old one and keep your progress.

### For development

To run the game from this computer on a tablet connected over Wi-Fi debugging, serve the folder:

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

Then forward the port so the tablet can reach it:

```bash
adb reverse tcp:8765 tcp:8765
```

On the tablet, open `http://localhost:8765`.

## Releasing a new APK

Tag a version and push the tag:

```bash
git tag v1.1.0
```

```bash
git push origin v1.1.0
```

GitHub Actions then packages the game with Capacitor, signs it, and attaches it to a new release. Bump `VERSION` in `sw.js` whenever the game files change, so installed web copies update.

Signing uses two repository secrets, `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD`. Every release must use the same key, otherwise updates won't install over existing copies.

## Development

- `node tools/sim.js [runs] [from] [to]`: a headless bot plays the levels and reports win rates and scores. Use it to balance difficulty.
- `python3 tools/make_icons.py icons`: regenerates the app icons.
- When you change files, bump `VERSION` in `sw.js` so installed copies update.
- Levels live in `js/levels.js`. Levels 1–25 are hand-made and the rest are generated from a seed. The grid legend is at the top of the file.
