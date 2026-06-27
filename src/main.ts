import "./style.css";
import "./fonts.css";
import { Screen } from "./render/screen";
import { Audio } from "./core/audio";
import { Shake } from "./render/shake";
import { Arena } from "./render/arena";
import { Engine } from "./game/engine";
import { UI } from "./ui/ui";
import { Loop } from "./core/loop";
import { attachKeyboard } from "./core/input";
import { buildKnights } from "./render/knightgen";

async function boot(): Promise<void> {
  const canvas = document.getElementById("arena") as HTMLCanvasElement | null;
  const uiRoot = document.getElementById("ui") as HTMLElement | null;
  if (!canvas || !uiRoot) throw new Error("missing #arena / #ui");

  const screen = new Screen(canvas);
  const audio = new Audio();
  const shake = new Shake();
  const arena = new Arena(screen, shake);

  let ui: UI | undefined;
  const engine = new Engine({ audio, shake, onUiChange: () => ui?.render() });
  ui = new UI(uiRoot, engine, audio);
  if (import.meta.env.DEV) {
    (window as unknown as { __engine: Engine }).__engine = engine; // dev/e2e hook only
  }

  // knight sprites scale with the grid so the lane stays long on phones
  const rebuildKnights = (): void => {
    const kc = Math.max(16, Math.min(30, Math.round(screen.cols * 0.24)));
    const kr = Math.max(10, Math.round(kc * 0.62));
    buildKnights(kc, kr);
  };

  // Wait for the webfonts so the monospace grid measures correctly.
  try {
    await document.fonts.ready;
  } catch {
    /* fonts API absent — fall back to system monospace */
  }
  screen.resize();
  rebuildKnights();
  ui.render();

  const onResize = (): void => {
    screen.resize();
    rebuildKnights();
  };
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
    render: () => arena.draw(engine),
  });
  loop.start();

  // clean teardown for HMR / re-boot so listeners & timers don't pile up
  import.meta.hot?.dispose(() => {
    loop.stop();
    detachKeyboard();
    audio.stopMusic();
    window.removeEventListener("resize", onResize);
  });
}

// guard against double-boot (HMR, accidental re-import)
if (!(window as unknown as { __rolandBooted?: boolean }).__rolandBooted) {
  (window as unknown as { __rolandBooted?: boolean }).__rolandBooted = true;
  void boot();
}
