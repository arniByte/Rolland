# Roland — project memory & vibe (read me first)

> This file is the cross-session brain for **Roland**. Future agents (and the
> next context window) should read it before doing anything, keep it updated as
> decisions change, and protect the established vibe. The owner passes this file
> between sessions on purpose — treat it as the source of truth.

## What Roland is
A **blue‑on‑cream, dithered‑ASCII jousting duel** with a medieval *illuminated
manuscript* soul, rendered like a phosphor terminal. Two knights charge by
**answering challenges faster than each other**; the quicker mind unhorses the
foe. Plays great on **phone and desktop**. Live at **https://rolland-psi.vercel.app/**.

The feeling we are chasing: *a living illuminated manuscript you can duel inside.*
Calm, crafted, tactile, a little CRT. Never busy or "gamer-RGB". Everything on
screen should read as **hand-made ASCII**.

## Visual language (the vibe — guard this)
- **Palette is strictly THREE families** (owner's call — do not add others):
  - **Blue** — the ink / duotone ramp (deep ultramarine → pale). Primary. Also **Player 1's identity**.
  - **Cream / parchment** — the "white" ground (`#F1E9D2`, shades to `#D6CCA9`).
  - **Red** — the *single* accent (rubrication-style). Used for **HP hearts**, **Player 2's identity**, crits, danger, key headings. (~`#D33A2C` / deep `#9E2B22`.)
  - ❌ **Gold and any other hue are removed.** (Earlier builds used gold/vermilion accents — phase them out.) Red is now the precious accent, like red-lead rubric ink on a manuscript: historically correct and on-vibe.
- **Everything should look ASCII.** UI (answer boxes, banners, menu welcome text,
  HP, dialogs) should be rendered/styled as ASCII art — box-drawing frames,
  block-shaded fills, glyph ornaments — not plain web widgets. Aim for *super
  stylish* ASCII.
- **Dithering** is the signature: ordered (Bayer 4×4) dither, glyph ramps
  (`" .:-=+*#%@"`) for big art, block ramp (`" ░▒▓█"`) for clean shaded sprites.
- **Type:** display = blackletter (UnifrakturMaguntia, self-hosted); grid/UI =
  JetBrains Mono (self-hosted). Fonts must stay local (offline / single-file).
- **Post:** subtle CRT scanlines + vignette. Optional future WebGL pass for true
  per-pixel dither + bloom + chromatic-aberration-on-impact (progressive
  enhancement, canvas fallback). This is the real "graphics upgrade" lever.
- **Knights** are drawn procedurally (vector silhouette → dithered-block ASCII in
  `knightgen.ts`) and mirrored for P2. No external image assets are required.

## Core gameplay
- Match = **best of N rounds** (3/5/7). Each round is one **tilt** down the lists.
- Both players get the **same challenge**. First **correct** answer wins the
  exchange and **gallops a stride** toward centre. A **wrong** answer locks that
  player out of the exchange.
- Reach centre first → **land the blow**. Damage scales with **lead**, **speed**
  (avg reaction), and a **clean ride** (no mistakes → crit).
- Drop a knight to **0 HP** to unhorse early, else most HP after the final round
  wins; ties → **sudden death**. (Logic is pure & unit-tested in `src/game/`.)
- HP is shown as **hearts** (red), not bars.

### Modes
- **Two Knights** — local 2P on one device (portrait = head-to-head split, P2's
  pad rotated 180°; landscape = side by side).
- **Vs Squire AI** — solo vs bot (squire/knight/champion). Engine is
  *opponent-agnostic* so adding opponents/modes is cheap.
- **Challenge types** (the duel's "question"): currently **arithmetic**. Planned:
  swipe in the menu to a **mode-select world** to pick *other* engaging
  challenge types (reflex/timing, memory runes, etc.) — see Roadmap.

## Architecture (file map)
```
src/
  core/   loop.ts (fixed timestep+interp) · input.ts (kbd+pointer→intents)
          audio.ts (WebAudio SFX + medieval loop) · easing.ts · mathx.ts
  game/   rng.ts · problems.ts · match.ts · ai.ts   (PURE, unit-tested)
          engine.ts  (screen FSM + round orchestration + view state)
  render/ screen.ts (ASCII canvas) · palette.ts · frame.ts (boxes/meters/dither)
          sprites.ts (knight meta+fallback) · knightgen.ts (vector→ASCII)
          raster.ts (image→dithered ASCII) · arena.ts (the scene) · art.ts (baked registry)
          particles.ts · shake.ts (trauma)
  ui/     ui.ts (responsive HTML overlay: menus + answer pads)
  assets/art/*.json  (baked dithered-ASCII art; picked up by art.ts via glob)
scripts/  gen-ascii.mjs   (offline image→dithered-ASCII baker; SVG emblem + raw-art/)
docs/     screenshots
```
- **Engine emits `events[]`** (hoof/wrong/clash); the renderer drains them to
  spawn particles (it owns the cell coordinates). Keep this split.
- **Pure logic never imports DOM**; time is passed in (fixed timestep).

## Key decisions & constraints
- **Stack:** Vite + TypeScript (strict) + Vitest. **Zero runtime deps.** Bundle ~39KB.
- **Graphics live on `<canvas>` as ASCII** — *not* DOM. Therefore **Tailwind/Next.js
  do not help the visuals** (they style HTML/SSR). Don't introduce them for looks.
  Node is used only for tooling; a tiny WS server (or PartyKit/Ably) is the plan
  for future online play — not Next.js.
- **Higgsfield image gen works but its CloudFront URLs are 403 from the build
  sandbox** (CDN ACL) — cannot fetch bytes here. So art is **procedural +
  the baker**. The owner will drop their own refs into `raw-art/` and run
  `npm run gen:art` to bake richer art later.
- **Deploy:** Vercel git-integration on **`main`** → every push to `main`
  auto-deploys. Dev work happens on `claude/roland-ascii-game-u4xnyr`; merge to
  `main` (with owner's OK) to ship.
- Vercel `*.vercel.app` is **blocked by egress policy** from this sandbox, so I
  can't screenshot prod here; verify locally (builds are identical).

## Dev workflow
```bash
npm install
npm run dev            # localhost:5173
npm test               # vitest (keep green)
npm run build          # dist/  (prod)
npm run build:single   # dist/index.html (offline, keep fonts/ beside it)
npm run gen:art        # bake raw-art/*.{png,jpg,webp} + SVG emblem → src/assets/art
```
**Visual QA via headless Chromium** (Playwright is installed `--no-save`; prod
hosts are blocked, only use localhost):
- executablePath: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
- `window.__engine` is exposed for scripted playthroughs (answer/confirm/screen).
- Screenshots can be huge → downscale with `sharp` before viewing.

## Conventions
- Dev branch: `claude/roland-ascii-game-u4xnyr`. Never push `main` without explicit OK.
- Strict TS, `noUncheckedIndexedAccess` on — index tuples with `[0,1] as const`.
- Commit trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Keep it lightweight and mobile-first. Test on a 390×844 portrait viewport.
- Match the surrounding code's style; comments explain *why*, sparingly.

## Roadmap / TODO (owner's priorities)
1. **[DONE] Foundation audit & bug fixes** — 60-agent audit found 42 confirmed
   issues; all critical/high + most medium/low fixed (see Changelog). Deferred:
   ditherFill→offscreen cache (perf nicety, runs fine at 60fps now); the
   "both players wrong" exchange is by-design (you must answer correctly to
   advance — not a hard lock; AI always eventually answers).
2. **[DONE] Super-stylish ASCII UI** — answer pads, per-player equation header,
   hearts, menus styled with double box-borders, blackletter, ornaments. Can keep
   pushing (box-drawing corner glyphs, animated menu) in future passes.
3. **[DONE] Gameplay/feel + environment** — adaptive wide grid + adaptive knight
   size → LONG lane on phone; animated clouds/birds/fluttering banners; ambient
   motes + embers; palette → blue/cream/red (gold removed); **HP as hearts**.
4. **[DONE] Swipe mode-select world + new mechanic** — title → a swipeable
   carousel of "trials" (`renderModes` in ui.ts; arrows/swipe/dots) backed by
   `CHALLENGES` in problems.ts. Shipped two: **ARITHMETIC** and **QUICK DRAW**
   (a reflex duel — hold, then STRIKE the instant the rune flares; early = false
   start). `settings.challenge` routes `nextProblem`/`answer`; quickdraw judges by
   timing (revealMs) and reuses the whole round/clash/damage flow. Next modes
   (memory runes, rhythm, anagram) plug in via the same path. Future: a formal
   `Challenge` interface if a mode needs input beyond "tap one of N" / "strike".
5. **[DONE] Visual-bug fixes** — mobile prompt now a big per-player header that
   rotates for P2 (readable across the table); corner music button removed →
   sound toggle lives in the title + setup menus.
6. **[DONE] WebGL deluxe post-FX** — `render/postfx.ts`: scene drawn to an
   OFFSCREEN Canvas2D, visible `#arena` is a WebGL pass adding ink-bloom, ordered
   Bayer dither halftone, chromatic aberration eased up on impact (uShake =
   trauma), scanlines, vignette, grain. Day/parchment palette kept. Graceful
   fallback to a 2D blit (+ arena's own CRT) when WebGL is unavailable
   (`arena.skipCRT`). Owner chose: keep day look + deluxe (not night-glow).
7. **[NEXT] Online 2-player** — rooms by code. Owner chose **WebRTC P2P
   (Trystero)** — no server, works on the current Vercel static host. Plan:
   host-authoritative; fairness by *reaction time* (compare time-since-each-
   player-saw-the-prompt, not packet arrival). Build a `Transport` interface with
   a `LoopbackTransport` (in-process, for tests) + `TrysteroTransport` (prod);
   refactor Arena/UI to render from a `GameView` the host Engine and a guest
   `RemoteView` both implement; works for arithmetic AND quickdraw. NOTE: the
   sandbox egress likely blocks public WebRTC signaling, so test the netplay
   logic via loopback here; the owner verifies real P2P with a friend.
8. **[future]** Owner-generated art via `raw-art/` + `gen:art` (now REP-quality
   capable); more trials (memory runes, rhythm, anagram); optional night-glow toggle.

## Changelog
- **Iteration 3 (modes world + reflex duel):** title → `modes` swipe carousel of
  trials (ARITHMETIC, QUICK DRAW); `settings.challenge` plumbed through engine;
  QUICK DRAW reflex mechanic (timing-judged, AI gets a reaction model + early
  flinches); per-player STRIKE pad; central HOLD→STRIKE cue on canvas. Engine is
  now challenge-agnostic at the exchange level.
- **Iteration 2 (palette/UI/feel + audit):** palette → blue/cream/red, removed gold;
  HP hearts (in HTML pad headers, always visible); adaptive grid (`screen.ts`
  targets a wide field) + adaptive knight size (`main.ts` rebuilds `knightgen` on
  resize) for a long lane; arena rewritten (animated env, ambient particles,
  pips moved above knights); equation moved into per-player pad header (fixes tiny
  mobile prompt; P2 header rotates 180° via the pad transform — verified taps still
  hit correctly); music button removed → menu toggle; engine controls music
  lifecycle (stops on title); fonts moved to `src/assets/fonts` + `src/fonts.css`
  imported so single-file build inlines them (one ~350KB self-contained html);
  many audit fixes: RNG bound-swap, MatchConfig validation, clear `problem` on
  result/matchOver, sudden-death banner, clean `back()` reset, particle pool
  prefers dead slots, glyph/text bounds guards, Escape preventDefault, focus
  styles + aria-labels, viewport allows zoom, favicon, `__engine` DEV-only,
  HMR-safe boot, gen-ascii error context.

## Open design questions to revisit
- Alt-mode to ship first in the swipe world + its addictive hook (lean: reflex/timing duel).
- Optional WebGL post-FX as the next big "wow" graphics lever (owner liked the dithered look).
- ditherFill offscreen cache if low-end phones ever struggle.

_Keep this file current. It is how Roland remembers itself._
