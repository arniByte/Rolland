// Fixed-timestep loop with render interpolation. Guards against the "spiral of
// death" by clamping huge deltas (tab restore) and pausing when hidden.

export interface LoopCallbacks {
  /** advance simulation by a fixed dt (ms) at clock `nowMs` */
  update: (dtMs: number, nowMs: number) => void;
  /** draw; alpha in 0..1 is the fraction into the next fixed step */
  render: (alpha: number) => void;
}

const FIXED_DT = 1000 / 60;
const MAX_FRAME = 250;

export class Loop {
  private cb: LoopCallbacks;
  private acc = 0;
  private last = 0;
  private clock = 0;
  private raf = 0;
  private running = false;

  constructor(cb: LoopCallbacks) {
    this.cb = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = (): void => {
    if (!document.hidden) this.last = performance.now();
  };

  private tick = (t: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden) return;

    let frame = t - this.last;
    this.last = t;
    if (frame > MAX_FRAME) frame = MAX_FRAME;
    this.acc += frame;

    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 5) {
      this.clock += FIXED_DT;
      this.cb.update(FIXED_DT, this.clock);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0; // give up catching up

    this.cb.render(this.acc / FIXED_DT);
  };
}
