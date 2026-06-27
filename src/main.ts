import "./style.css";
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
  buildKnights(); // procedurally rasterize the knight sprites into dithered ASCII

  let ui: UI | undefined;
  const engine = new Engine({ audio, shake, onUiChange: () => ui?.render() });
  ui = new UI(uiRoot, engine, audio);
  (window as unknown as { __engine: Engine }).__engine = engine; // debug / e2e hook

  // Wait for the webfonts so the monospace grid measures correctly.
  try {
    await document.fonts.ready;
  } catch {
    /* fonts API absent — fall back to system monospace */
  }
  screen.resize();
  ui.render();

  const onResize = (): void => screen.resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 100));
  window.addEventListener("load", () => setTimeout(onResize, 50));

  const wake = (): void => {
    audio.resume();
    audio.startMusic();
  };
  attachKeyboard({
    onAnswer: (i) => {
      wake();
      engine.answer(i.player, i.choice);
    },
    onConfirm: () => {
      wake();
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
}

void boot();
