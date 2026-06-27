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
  ui = new UI(uiRoot, engine, audio);
  if (import.meta.env.DEV) {
    (window as unknown as { __engine: Engine }).__engine = engine;
  }

  const rebuildKnights = (): void => {
    const kc = Math.max(16, Math.min(30, Math.round(screen.cols * 0.24)));
    const kr = Math.max(10, Math.round(kc * 0.62));
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

  const onResize = (): void => sizeAll();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 100));
  window.addEventListener("load", () => setTimeout(onResize, 50));

  const detachKeyboard = attachKeyboard({
    onAnswer: (i) => {
      audio.resume();
      engine.answer(i.player, i.choice);
    },
    onConfirm: () => {
      audio.resume();
      engine.confirm();
    },
    onBack: () => engine.back(),
  });

  const loop = new Loop({
    update: (dt, now) => {
      engine.update(dt, now);
      arena.update(dt);
    },
    render: () => {
      arena.draw(engine);
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
