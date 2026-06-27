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
- **Online** — WebRTC P2P duel by 4-letter room code (host creates, foe joins).
  Host-authoritative; fair by *reaction time*. Each device shows only its own
  upright pad. Works for arithmetic AND quick-draw. (See Roadmap #7.)
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
          view.ts    (GameView/GameController seam — host Engine + guest RemoteView both implement)
  net/    transport.ts (interface) · loopback.ts (in-proc, tests) · trysteroTransport.ts (WebRTC P2P, lazy CDN)
          protocol.ts (wire msgs + Snapshot) · snapshot.ts · remoteView.ts (guest GameController)
          session.ts (Online: host/guest orchestrator + lobby state) · room.ts · constants.ts
  render/ screen.ts (ASCII canvas) · palette.ts · frame.ts (boxes/meters/dither)
          sprites.ts (knight meta+fallback) · knightgen.ts (vector→ASCII)
          raster.ts (image→dithered ASCII) · arena.ts (the scene, renders a GameView) · art.ts (baked registry)
          particles.ts · shake.ts (trauma)
  ui/     ui.ts (responsive HTML overlay: menus + answer pads + online lobby; renders a GameController)
  assets/art/*.json  (baked dithered-ASCII art; picked up by art.ts via glob)
scripts/  gen-ascii.mjs   (offline image→dithered-ASCII baker; SVG emblem + raw-art/)
docs/     screenshots
```
- **Engine emits `events[]`** (hoof/wrong/clash); the renderer drains them to
  spawn particles (it owns the cell coordinates). Keep this split.
- **Pure logic never imports DOM**; time is passed in (fixed timestep).

## Key decisions & constraints
- **Stack:** Vite + TypeScript (strict) + Vitest. **Zero *bundled* runtime deps.**
  Core JS bundle ~62KB (was ~39KB pre-netcode; +~15KB is the pure-TS online layer).
  Online play uses **Trystero (WebRTC P2P)** but it is *never bundled*: it loads
  via a function-level dynamic `import()` of a pinned ESM CDN URL inside
  `net/trysteroTransport.ts`, which Vite code-splits into a lazy chunk fetched
  only when a player opens a room. So local/AI play and the offline single-file
  build stay dependency-free and unchanged. (To vendor instead: `npm i trystero`
  and swap the URL for the bare specifier — the dynamic import handles either.)
- **Graphics live on `<canvas>` as ASCII** — *not* DOM. Therefore **Tailwind/Next.js
  do not help the visuals** (they style HTML/SSR). Don't introduce them for looks.
  Node is used only for tooling. Online is P2P (Trystero), so **no server** — it
  works on the current static Vercel host.
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
- `window.__engine` + `window.__online` are exposed (DEV) for scripted playthroughs.
  Online can be exercised headlessly by injecting a `LoopbackTransport` via
  `__online.deps.makeTransport` and running an in-page host (see how iteration 5
  was verified) — real WebRTC signalling is egress-blocked here.
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
7. **[DONE] Online 2-player** — WebRTC P2P (Trystero), rooms by 4-letter code, no
   server. **Host-authoritative**: the host runs the real `Engine`; the guest runs
   a `RemoteView` that mirrors host **snapshots** (one per frame) and sends its
   inputs back. Arena/UI render from a `GameView`/`GameController` seam (`game/view.ts`)
   that both implement. **Fairness by reaction time**: each device stamps when *it*
   showed the prompt; the host buffers correct answers for a `SETTLE_MS_ONLINE`
   (120ms) window and the smallest reaction wins — so a genuinely-faster guest whose
   packet lands a touch late still wins (never packet-arrival order). Works for
   arithmetic AND quick-draw. `Transport` seam with `LoopbackTransport` (the whole
   protocol + fairness is proven headlessly in vitest, incl. a delayed-transport
   latency case) + `TrysteroTransport` (lazy CDN, zero bundled deps). Lobby: create
   /join, host decrees settings, single upright pad per device, peer-left + connect
   -timeout handling. **NOTE: real WebRTC signalling is egress-blocked in the sandbox
   — the owner must verify true P2P with a friend** (the netcode logic itself is
   loopback-tested + a guest render was confirmed in-browser over loopback).
   Follow-ups (not blocking): mid-match reconnect, a TURN fallback for strict NATs,
   online spectators, optimistic guest motion smoothing.
8. **[future]** Owner-generated art via `raw-art/` + `gen:art` (now REP-quality
   capable); more trials (memory runes, rhythm, anagram); optional night-glow toggle.

## Changelog
- **Iteration 5 (online 2-player, WebRTC P2P):** new `game/view.ts` seam
  (`GameView`/`GameController`) — Arena + UI now render from it, not the concrete
  Engine; `Engine implements GameController` (declaration-only). New `src/net/`:
  `Transport` interface + `LoopbackTransport` (in-proc, tests) + `TrysteroTransport`
  (lazy CDN dynamic-import, code-split out of core → zero bundled deps preserved);
  `protocol.ts` (typed wire messages + flattened `Snapshot`); `snapshot.ts`
  (`toSnapshot`/`snapToMatch`, deep-copied, problem-omit-when-unchanged, event
  deltas); `remoteView.ts` (guest `GameController` mirroring snapshots + optimistic
  local-attempt feedback + latency-proof reaction stamping); `session.ts` (`Online`
  orchestrator: lobby state machine, host/guest handshake, settings push, ping
  /peer-left/connect-timeout watchdogs); `room.ts` (codes). Engine gained a
  **settle buffer** (`submit`/`answerRemote`/`resolveFromPending`): online resolves
  by smallest reaction time inside a 120ms window (settle=0 for local/AI → behaviour
  byte-identical, regression-tested). `main.ts` wires an `Online` that swaps
  `view`/`controller` for the guest and broadcasts host snapshots; keyboard is
  mode-aware (Esc leaves a room cleanly). UI gained a `lobby` screen, single-pad
  `data-solo` layout, peer-left overlay, host/guest matchOver buttons. 43 tests
  green (incl. full host→guest parity + reaction-fairness over a delayed transport);
  a 60-agent design + 16-agent adversarial review hardened the keyboard-teardown,
  connect-timeout, and malformed-frame edges. Guest render confirmed in-browser
  over loopback. Bundle 46→62KB (pure-TS netcode; Trystero stays an external CDN import).
- **Iteration 4 (WebGL deluxe post-FX):** `render/postfx.ts` — offscreen Canvas2D
  scene → WebGL pass (ink-bloom, Bayer dither halftone, impact-eased chromatic
  aberration, scanlines/vignette/grain), graceful 2D-blit fallback.
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
- **Online polish:** does real P2P connect reliably across NATs (may need a TURN
  fallback)? Tune `SETTLE_MS_ONLINE` against real-world RTT. Mid-match reconnect?
  Surface the room code more prominently / shareable link?
- Next trial to add to the swipe world (memory runes / rhythm / anagram) + its hook.
- ditherFill offscreen cache if low-end phones ever struggle.

_Keep this file current. It is how Roland remembers itself._
