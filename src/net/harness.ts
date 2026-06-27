// Test-only helpers (imported by *.test.ts, tree-shaken out of the bundle).
// Builds an Engine with inert deps and drives it on a controllable clock so the
// netcode can be exercised headlessly — no DOM, no audio, no real networking.
import { Engine, type EngineDeps } from "../game/engine";

export function noopDeps(): EngineDeps {
  const audio = new Proxy({}, { get: () => () => undefined }) as unknown as EngineDeps["audio"];
  const shake = {
    add: () => undefined,
    update: () => undefined,
    offset: () => ({ x: 0, y: 0, rot: 0 }),
    get value() {
      return 0;
    },
  } as unknown as EngineDeps["shake"];
  return { audio, shake, onUiChange: () => undefined };
}

export function makeEngine(): Engine {
  return new Engine(noopDeps());
}

const FRAME = 1000 / 60;

/** Steps an Engine on a monotonic clock, mirroring the real fixed-timestep loop. */
export class Driver {
  now = 0;
  constructor(public engine: Engine) {}

  step(dt = FRAME): void {
    this.now += dt;
    this.engine.update(dt, this.now);
  }

  advance(ms: number): void {
    const target = this.now + ms;
    while (this.now < target) {
      const dt = Math.min(FRAME, target - this.now);
      this.step(dt);
    }
  }

  /** Run from the title into the first live exchange. */
  toPlaying(): void {
    this.engine.startMatch();
    let guard = 0;
    while (this.engine.screen !== "playing" && guard++ < 1000) this.step();
  }

  /** Advance until a brand-new exchange begins (past the inter-exchange cooldown). */
  waitNextProblem(prevId: number): void {
    let guard = 0;
    while (this.engine.problemId === prevId && this.engine.screen === "playing" && guard++ < 1000) {
      this.step();
    }
  }
}
