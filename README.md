# Sugar Swap Saga

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

## Play on the Tab A9+

### Option A: install as an app (recommended, works offline)

Put the folder on any HTTPS static host, such as GitHub Pages, Netlify or Cloudflare Pages. On the tablet:

1. Open the URL in Chrome.
2. Open the ⋮ menu and choose **Add to Home screen**, then **Install**.

It launches full screen like a native app and works offline after the first load.

### Option B: quick test over Wi-Fi from this PC

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

On the tablet (on the same Wi-Fi), open `http://<this-PC's-IP>:8765` in Chrome, then tap **Play**. The game switches to full screen. Offline install needs HTTPS (Option A).

## Development

- `node tools/sim.js [runs] [from] [to]`: a headless bot plays the levels and reports win rates and scores. Use it to balance difficulty.
- `python3 tools/make_icons.py icons`: regenerates the app icons.
- When you change files, bump `VERSION` in `sw.js` so installed copies update.
- Levels live in `js/levels.js`. Levels 1–25 are hand-made and the rest are generated from a seed. The grid legend is at the top of the file.
