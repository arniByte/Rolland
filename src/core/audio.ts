// Self-contained WebAudio synth — no dependencies. Procedural SFX + a looping
// medieval-ish theme. AudioContext starts suspended on iOS, so we resume on the
// first user gesture.

type Wave = OscillatorType;

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  muted = false;
  musicOn = true;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private step = 0;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
    }
    return this.ctx;
  }

  /** Call from a pointer/keydown handler. */
  resume(): void {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
  }

  private tone(
    freq: number,
    dur: number,
    opts: { type?: Wave; gain?: number; slideTo?: number; delay?: number; attack?: number } = {},
  ): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + dur);
    const peak = opts.gain ?? 0.3;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, opts: { gain?: number; freq?: number; q?: number; delay?: number } = {}): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.freq ?? 1200;
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master as GainNode);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- SFX -------------------------------------------------------------
  select(): void {
    this.tone(620, 0.07, { type: "square", gain: 0.16 });
  }
  hover(): void {
    this.tone(820, 0.04, { type: "triangle", gain: 0.08 });
  }
  correct(p: 0 | 1 = 0): void {
    const base = p === 0 ? 1 : 1.06;
    this.tone(660 * base, 0.09, { type: "triangle", gain: 0.22 });
    this.tone(990 * base, 0.12, { type: "triangle", gain: 0.2, delay: 0.07 });
  }
  wrong(): void {
    this.tone(200, 0.22, { type: "sawtooth", gain: 0.2, slideTo: 90 });
  }
  gallop(): void {
    this.noise(0.09, { gain: 0.13, freq: 320, q: 2 });
  }
  charge(): void {
    this.tone(180, 0.5, { type: "sawtooth", gain: 0.18, slideTo: 520 });
  }
  clash(): void {
    this.noise(0.5, { gain: 0.5, freq: 900, q: 0.6 });
    this.tone(120, 0.45, { type: "square", gain: 0.4, slideTo: 50 });
    this.tone(70, 0.6, { type: "sine", gain: 0.5, slideTo: 40 });
  }
  fanfare(): void {
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => this.tone(f, 0.35, { type: "triangle", gain: 0.22, delay: i * 0.12 }));
  }
  defeat(): void {
    const seq = [392, 349, 294, 220];
    seq.forEach((f, i) => this.tone(f, 0.4, { type: "sawtooth", gain: 0.18, delay: i * 0.16 }));
  }

  // ---- Music -----------------------------------------------------------
  // A slow D-dorian lead over a drone; scheduled with a lookahead loop.
  private readonly melody = [
    [294, 1], [349, 1], [392, 1], [440, 1.5], [392, 0.5], [349, 1], [330, 1], [294, 2],
    [330, 1], [392, 1], [440, 1], [523, 1.5], [440, 0.5], [392, 1], [349, 1], [294, 2],
  ] as const;

  startMusic(): void {
    if (!this.musicOn) return;
    this.ensure();
    if (this.musicTimer) return;
    this.nextNoteTime = (this.ctx as AudioContext).currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduler(), 60);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
  }

  private scheduler(): void {
    if (this.muted || !this.ctx) return;
    const beat = 0.42; // seconds per beat unit
    while (this.nextNoteTime < this.ctx.currentTime + 0.3) {
      const note = this.melody[this.step % this.melody.length] as readonly [number, number];
      const [freq, dur] = note;
      const t0 = this.nextNoteTime;
      // lead
      this.scheduledTone(freq, dur * beat * 0.95, "triangle", 0.13, t0);
      // soft bass drone every two steps
      if (this.step % 2 === 0) this.scheduledTone(freq / 2, beat * 1.6, "sine", 0.1, t0);
      this.nextNoteTime += dur * beat;
      this.step++;
    }
  }

  private scheduledTone(freq: number, dur: number, type: Wave, gain: number, t0: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}
