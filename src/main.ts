import "./style.css";
import "./fonts.css";
import { Screen } from "./render/screen";
import { Audio } from "./core/audio";
import { Shake } from "./render/shake";
import { Arena } from "./render/arena";
import { PostFX } from "./render/postfx";
import { Engine } from "./game/engine";
import { UI } from "./ui/ui";
import { Loop } from "./core/loop";
import { attachKeyboard } from "./core/input";
import { buildKnights } from "./render/knightgen";
import { Online } from "./net/session";
import type { Transport } from "./net/transport";
import { setSingleHue } from "./render/palette";

async function boot(): Promise<void> {
  const visible = document.getElementById("arena") as HTMLCanvasElement | null;
  const uiRoot = document.getElementById("ui") as HTMLElement | null;
  if (!visible || !uiRoot) throw new Error("missing #arena / #ui");

  // The scene is drawn to an OFFSCREEN Canvas2D; the visible canvas is the WebGL
  // post-processed output (or a plain blit when WebGL is unavailable).
  const sceneCanvas = document.createElement("canvas");
  const screen = new Screen(sceneCanvas);
  const audio = new Audio();
  const shake = new Shake();
  const arena = new Arena(screen, shake);

  const postfx = new PostFX(visible);
  arena.skipCRT = postfx.ok;
  const vis2d = postfx.ok ? null : visible.getContext("2d");

  let ui: UI | undefined;
  const engine = new Engine({ audio, shake, onUiChange: () => ui?.render() });

  // Trystero is dynamically imported ONLY here, so Vite code-splits it into a
  // lazy chunk fetched the first time a player opens an online room — the core
  // bundle (title/local2p/AI/offline) stays dependency-free.
  const makeTransport = async (code: string): Promise<Transport> => {
    const { createTrysteroTransport } = await import("./net/trysteroTransport");
    return createTrysteroTransport(code);
  };
  const online = new Online({ engine, onUiChange: () => ui?.render(), makeTransport });

  ui = new UI(uiRoot, online, audio);

  // single-hue mode (config flag): both fighters become a green→white ramp.
  // Flip via ?hue=single in the URL, or window.__singleHue(true) in dev.
  if (new URLSearchParams(location.search).get("hue") === "single") setSingleHue(true);
  if (import.meta.env.DEV) {
    const w = window as unknown as { __engine: Engine; __online: Online; __singleHue: (on: boolean) => void };
    w.__engine = engine;
    w.__online = online;
    w.__singleHue = setSingleHue;
  }

  const rebuildKnights = (): void => {
    // scale the knight with the (now much denser) grid so it stays a bold ~22%
    // of the lane rather than capping out tiny on wide desktop fields
    const kc = Math.max(22, Math.min(46, Math.round(screen.cols * 0.22)));
    const kr = Math.max(14, Math.round(kc * 0.62));
    buildKnights(kc, kr);
  };

  const sizeAll = (): void => {
    const rect = visible.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    screen.resize(w, h);
    const dpr = screen.dpr;
    if (postfx.ok) postfx.resize(w, h, dpr);
    else {
      visible.width = sceneCanvas.width;
      visible.height = sceneCanvas.height;
    }
    rebuildKnights();
  };

  try {
    await document.fonts.ready;
  } catch {
    /* fonts API absent — system monospace fallback */
  }
  sizeAll();
  ui.render();

  // shareable invite deep-link: #join=CODE → open the lobby and join straight away
  const joinMatch = /[#&]join=([A-Za-z0-9]+)/.exec(location.hash);
  if (joinMatch && import.meta.env.MODE !== "single") {
    void online.openAndJoin(joinMatch[1] as string);
  }

  const onResize = (): void => sizeAll();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 100));
  window.addEventListener("load", () => setTimeout(onResize, 50));

  const detachKeyboard = attachKeyboard({
    onAnswer: (i) => {
      audio.resume();
      // local 2P uses both key banks (one per player); every other mode answers
      // as whoever this device controls.
      if (engine.settings.mode === "local2p") engine.answer(i.player, i.choice);
      else online.controller.answerLocal(i.choice);
    },
    onConfirm: () => {
      audio.resume();
      online.controller.confirm();
    },
    // in a room, Escape always leaves cleanly (sends bye, closes the transport,
    // resets to the title) instead of letting the Engine wander off and orphan
    // the peer; offline it's the usual back.
    onBack: () => {
      if (online.active) online.leave();
      else online.controller.back();
    },
  });

  const loop = new Loop({
    update: (dt, now) => {
      online.update(dt, now);
      // the guest's match is driven by host snapshots, not its own Engine
      if (!online.guestInMatch) engine.update(dt, now);
      arena.update(dt);
    },
    render: () => {
      if (online.hostInMatch) online.hostBroadcast();
      arena.draw(online.view);
      if (postfx.ok) postfx.render(sceneCanvas, performance.now(), shake.value);
      else if (vis2d) vis2d.drawImage(sceneCanvas, 0, 0, sceneCanvas.width, sceneCanvas.height);
    },
  });
  loop.start();

  import.meta.hot?.dispose(() => {
    loop.stop();
    detachKeyboard();
    audio.stopMusic();
    window.removeEventListener("resize", onResize);
  });
}

if (!(window as unknown as { __rolandBooted?: boolean }).__rolandBooted) {
  (window as unknown as { __rolandBooted?: boolean }).__rolandBooted = true;
  void boot();
}
