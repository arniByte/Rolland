# Roland — project memory & vibe (read me first)

> This file is the cross-session brain for **Roland**. Future agents (and the
> next context window) should read it before doing anything, keep it updated as
> decisions change, and protect the established vibe. The owner passes this file
> between sessions on purpose — treat it as the source of truth.

## What Roland is
A **dark‑phosphor, dithered‑ASCII jousting duel** with a medieval soul, rendered
like a CRT terminal glowing in a dark room ("cyber‑medieval"). Two knights charge
by **answering challenges faster than each other**; the quicker mind unhorses the
foe. Plays great on **phone and desktop**. Live at **https://rolland-psi.vercel.app/**.

The feeling we are chasing: *a hacker terminal that happens to be a living
illuminated manuscript.* Calm, crafted, tactile, glowing. Near‑black field,
finely‑shaded glyphs, two acid/cyan combatants. Never busy or "gamer‑RGB".
Everything on screen should read as **hand‑made ASCII**.

> **History:** v1 was blue‑on‑cream parchment. **v2 "DARK PHOSPHOR"** (the
> ROLAND_v2 brief) replaced that palette entirely — near‑black + acid‑lime +
> cyan. If you ever see parchment/blue, it's stale; the tokens below are law.

## Visual language (the vibe — guard this)
- **Palette = DARK PHOSPHOR tokens, single source** (`render/palette.ts` for the
  canvas, mirrored in `style.css :root`). Do not add other hues.
  - **Void** — `#0A0C10` page/arena, `#0E1016` panels, `#1B2026` hairlines. The near‑black ground.
  - **Ink** — `#EAEAE7` primary text, `#5B6670` dim labels. White‑on‑void UI.
  - **Acid lime** — `#C3F53C` (dim `#33420E`, bright `#EAFFB0`): **Roland / Player 1** + the UI signal/focus colour.
  - **Cyan phosphor** — `#3DD6C4` (dim `#0E3B3A`, bright `#B9FFF7`): **Olivier / Player 2** / the rival.
  - **Hit red** — `#FF3B30`: damage / STRIKE flash only. Sparing, brief.
  - World/atmosphere uses a low‑contrast neutral ramp (`worldShade`) so the two fighters pop.
- **Everything should look ASCII.** UI panels are **dark glass** (`--void-2`, thin
  player‑colour border, soft glow on active/focus) — styled like terminal widgets,
  not plain web boxes. Aim for *super stylish* ASCII.
- **Fidelity is the signature:** continuous **luminance‑mapped** shading, NOT flat
  blocks. Sprites bake a greyscale source → glyph via the long ramp (`REP_RAMP` /
  `mode:"ramp"` in `raster.ts`), each cell coloured by `familyShade(player, t)`.
  Ordered (Bayer 4×4) dither underneath. Dense grid (~150‑190 cols desktop / ~90‑108 mobile).
- **Type:** display = blackletter (UnifrakturMaguntia, self‑hosted) recoloured to
  acid with cyan halation; grid/UI + heavy labels = JetBrains Mono 800 (self‑hosted).
  Fonts stay local (offline / single‑file) — we did NOT add Archivo Black/Space Mono.
- **Post (`render/postfx.ts`):** WebGL pass = **phosphor bloom on bright glyphs**,
  scanlines, vignette, gated grain. **No chromatic aberration** (reads as a glitch).
  Respects `prefers-reduced-motion` + a **LOW/HIGH** quality switch (`render/quality.ts`,
  auto‑detected + a title/setup toggle). Graceful 2D‑blit fallback (dark CRT).
- **Knights** are drawn procedurally (vector silhouette → luminance‑ramp ASCII in
  `knightgen.ts`), tinted per‑player (acid/cyan), mirrored for P2. No image assets.
- **Single‑hue mode** (config flag): both fighters → green→white ramp by brightness.
  Flip with `?hue=single` or `setSingleHue(true)`.

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
  upright pad. Works for arithmetic AND quick-draw. (See Roadmap #7.) Reached via a
  prominent **◈ PLAY ONLINE** title button (or Setup → FOES → ONLINE); the host can
  **copy a `#join=CODE` invite link** so a friend joins in one tap (deep-linked).
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
  render/ screen.ts (ASCII canvas, dense grid) · palette.ts (DARK PHOSPHOR tokens + familyShade)
          frame.ts (boxes/meters/dither) · postfx.ts (WebGL phosphor bloom) · quality.ts (LOW/HIGH)
          sprites.ts (knight meta+fallback) · knightgen.ts (vector→luminance-ramp ASCII)
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
  Core JS bundle ~65KB (was ~39KB pre-netcode; +online netcode +DARK PHOSPHOR render).
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
8. **[DONE] DARK PHOSPHOR visual overhaul** (ROLAND_v2 brief) — full reskin from
   blue/cream → near‑black + acid‑lime (Roland) + cyan (Olivier), white UI. Single
   token source (`palette.ts` ↔ `style.css`); luminance‑ramp sprite fidelity
   (`mode:"ramp"`, denser grid); per‑family `familyShade`; smoother knight motion
   (sub‑cell sliding); richer neutral environment; retuned WebGL post (phosphor
   bloom, scanlines, vignette, gated grain, **no chromatic aberration**) with
   `prefers-reduced-motion` + **LOW/HIGH** quality switch (`quality.ts` + UI toggle);
   dark‑glass UI, acid blackletter title; prominent online entry + `#join=` invite
   link. `singleHue` flag (`?hue=single`). Game logic untouched (43 tests green).
   Mobile perf wants a real‑device pass (density/bloom are the levers; LOW auto‑defaults).
9. **[future]** Owner-generated art via `raw-art/` + `gen:art` (now REP-quality
   capable); more trials (memory runes, rhythm, anagram); online polish (TURN
   fallback, reconnect, spectators); real‑device mobile perf tuning.

## Changelog
- **Iteration 6 (DARK PHOSPHOR visual overhaul):** palette replaced blue/cream →
  void/acid/cyan/hit as a single token source (`render/palette.ts` with
  `familyShade`/`worldShade`/`lerpHex`, mirrored in `style.css :root`). Knights/
  emblem switched from flat `block` shading to luminance `ramp` halftone
  (`knightgen.ts`/`raster.ts`); grid densified (`screen.ts` ~150‑190 desktop /
  ~90‑108 mobile) + knight size scaled to match; arena recoloured (void ground,
  neutral receding world, acid/cyan fighters, sub‑cell‑smooth motion, hit/family
  particles). `postfx.ts` retuned for dark phosphor — bright‑glyph bloom, scanlines,
  vignette, gated grain, **chromatic aberration removed** — gated by new
  `render/quality.ts` (LOW/HIGH auto‑detect + persist) and `prefers-reduced-motion`.
  Full UI restyle (`style.css` dark‑glass panels, acid blackletter title with cyan
  halation, JBM‑800 heavy labels, acid/cyan hearts, safe‑area padding). `ui.ts`:
  title **◈ PLAY ONLINE** shortcut + FX toggle, setup GRAPHICS toggle, lobby TRIAL
  picker + **⧉ COPY INVITE LINK**; `main.ts` deep‑link `#join=CODE` auto‑join +
  `?hue=single` flag + `setSingleHue` dev hook; `index.html` theme/favicon recolour.
  Game logic untouched (43 tests still green); verified via headless before/after
  screenshots (desktop + 390×844). Bundle 62→65KB; offline single‑file still builds.
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
