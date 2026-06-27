import { Rng, randomSeed } from "./rng";
import { genProblem, genQuickdraw, type Problem, type Difficulty, type ChallengeKind } from "./problems";
import {
  createMatch,
  beginRound,
  applyExchange,
  resolveClash,
  advanceRound,
  type MatchState,
  type PlayerId,
  type ExchangeResult,
} from "./match";
import { aiProfile, planExchange, type AiPlan } from "./ai";
import { damp, clamp } from "../core/mathx";
import type { Audio } from "../core/audio";
import type { Shake } from "../render/shake";

export type Mode = "local2p" | "ai" | "online";
export type ScreenName =
  | "title"
  | "online"
  | "modes"
  | "setup"
  | "roundIntro"
  | "playing"
  | "clash"
  | "roundResult"
  | "matchOver";

export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  rounds: number;
  names: [string, string];
  challenge: ChallengeKind;
}

export interface KnightView {
  progress: number; // eased 0..1
  bob: number;
  flash: number;
  lance: number; // 0..1 lance thrust
  hp: number; // eased
}

export interface Attempt {
  state: "idle" | "wrong" | "correct";
  choice?: number;
}

/** one player's judged input for an exchange (computed locally, shared online) */
export interface Sub {
  correct: boolean;
  reactionMs: number;
  choice: number;
}
export interface RemoteSub extends Sub {
  exchangeId: number;
}
/** online hook: which player is local on this device + how to send our inputs */
export interface NetHook {
  localPlayer: PlayerId;
  send: (sub: RemoteSub) => void;
}

const FEEDBACK_MS = 650;
const INTRO_MS = 2200;
const RESULT_MS = 3000;
const CLASH_IMPACT_MS = 950;
const CLASH_END_MS = 1850;

export type EngineEvent =
  | { type: "hoof"; player: PlayerId }
  | { type: "wrong"; player: PlayerId }
  | { type: "clash"; crit: boolean };

export interface EngineDeps {
  audio: Audio;
  shake: Shake;
  onUiChange: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "local2p",
  difficulty: "knight",
  rounds: 5,
  names: ["ROLAND", "OLIVIER"],
  challenge: "arithmetic",
};

export class Engine {
  screen: ScreenName = "title";
  settings: Settings = { ...DEFAULT_SETTINGS };
  match: MatchState = createMatch();
  problem: Problem | null = null;
  attempts: [Attempt, Attempt] = [{ state: "idle" }, { state: "idle" }];
  knights: [KnightView, KnightView] = [freshView(), freshView()];

  // timers / anim
  introT = 0;
  clashT = 0;
  resultT = 0;
  titleT = 0;
  exchangeAge = 0;
  lastDamage = 0;
  banner = "";
  /** drained by the renderer (which knows cell coordinates) to spawn particles */
  events: EngineEvent[] = [];

  /** online play: set by NetSession (null = local/AI). */
  net: NetHook | null = null;

  private rng = new Rng(randomSeed());
  private now = 0;
  private problemShownAt = 0;
  private subs: [Sub | null, Sub | null] = [null, null];
  private exchangeId = 0;
  private remoteBuffer = new Map<number, RemoteSub>();
  private exchangeResolved = false;
  private cooldown = 0;
  private aiPlan: AiPlan | null = null;
  private aiActed = false;
  private aiReactMs = 300;
  private clashImpactFired = false;

  constructor(private deps: EngineDeps) {}

  // ---- public API -------------------------------------------------------
  startMatch(seed?: number): void {
    // online peers pass a shared seed so the deterministic problem stream matches
    this.rng = new Rng(seed ?? randomSeed());
    this.match = createMatch({
      rounds: this.settings.rounds,
      stridesToClash: 6,
      maxHp: 100,
      difficulty: this.settings.difficulty,
    });
    this.knights = [freshView(), freshView()];
    this.subs = [null, null];
    this.remoteBuffer.clear();
    this.exchangeId = 0;
    this.introT = 0;
    this.clashT = 0;
    this.resultT = 0;
    this.titleT = 0;
    this.deps.audio.startMusic();
    this.enterRoundIntro();
  }

  confirm(): void {
    switch (this.screen) {
      case "title":
        this.setScreen("modes");
        this.deps.audio.select();
        break;
      case "modes":
        this.deps.audio.select();
        this.setScreen("setup");
        break;
      case "setup":
        this.deps.audio.select();
        this.startMatch();
        break;
      case "roundIntro":
        this.enterPlaying();
        break;
      case "roundResult":
        this.continueAfterResult();
        break;
      case "matchOver":
        this.deps.audio.select();
        this.setScreen("title");
        break;
    }
  }

  back(): void {
    if (this.screen === "title") return;
    if (this.screen === "setup") return this.setScreen("modes");
    if (this.screen === "modes") return this.setScreen("title");
    // abandon any match in progress and return to the title cleanly
    this.match = createMatch();
    this.knights = [freshView(), freshView()];
    this.problem = null;
    this.setScreen("title");
  }

  /** choose a trial from the swipe carousel and proceed to setup */
  pickTrial(kind: ChallengeKind): void {
    this.settings.challenge = kind;
    this.deps.audio.select();
    this.setScreen("setup");
  }

  /** A local input from this device's pad. Online: only your own player. */
  answer(player: PlayerId, choice: number): void {
    if (this.screen !== "playing" || this.exchangeResolved || !this.problem) return;
    if (this.net && player !== this.net.localPlayer) return;
    if (this.attempts[player].state !== "idle") return;

    const age = this.now - this.problemShownAt;
    let correct: boolean;
    let reactionMs: number;
    if (this.problem.kind === "quickdraw") {
      const reveal = this.problem.revealMs ?? 0;
      correct = age >= reveal; // striking before the rune flares = a false start
      reactionMs = Math.max(0, age - reveal);
    } else {
      correct = choice === this.problem.correct;
      reactionMs = age;
    }
    const sub: Sub = { correct, reactionMs, choice };
    this.submit(player, sub);
    if (this.net) this.net.send({ ...sub, exchangeId: this.exchangeId });
  }

  /** The opponent's input over the network (online lockstep). */
  submitRemote(rs: RemoteSub): void {
    if (!this.net) return;
    const player: PlayerId = this.net.localPlayer === 0 ? 1 : 0;
    if (rs.exchangeId === this.exchangeId && this.screen === "playing" && !this.exchangeResolved) {
      this.submit(player, rs);
    } else {
      this.remoteBuffer.set(rs.exchangeId, rs); // peer is ahead/behind — apply when we arrive
    }
  }

  private submit(player: PlayerId, sub: Sub): void {
    if (this.attempts[player].state !== "idle") return;
    this.attempts[player] = { state: sub.correct ? "correct" : "wrong", choice: sub.choice };
    this.subs[player] = sub;
    if (sub.correct) {
      this.deps.audio.correct(player);
      this.knights[player].lance = 1;
    } else {
      this.deps.audio.wrong();
      this.deps.shake.add(0.14);
      this.knights[player].flash = 1;
      this.events.push({ type: "wrong", player });
    }
    this.deps.onUiChange();
    this.tryResolve();
  }

  private tryResolve(): void {
    if (this.exchangeResolved) return;
    const [s0, s1] = this.subs;
    const anyCorrect = (s0?.correct ?? false) || (s1?.correct ?? false);
    const both = !!s0 && !!s1;
    // online is deterministic lockstep → wait for both; local/AI resolves on the
    // first correct (real-time race), or once both have missed.
    if (this.net ? both : anyCorrect || both) this.resolveExchange();
  }

  // ---- update -----------------------------------------------------------
  update(dt: number, now: number): void {
    this.now = now;
    this.titleT += dt;

    switch (this.screen) {
      case "roundIntro":
        this.introT -= dt;
        if (this.introT <= 0) this.enterPlaying();
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
      case "clash":
        this.updateClash(dt);
        break;
      case "roundResult":
        this.resultT += dt;
        if (this.resultT >= RESULT_MS) this.continueAfterResult();
        break;
    }
    this.updateViews(dt);
  }

  private updatePlaying(dt: number): void {
    this.exchangeAge = this.now - this.problemShownAt;

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        if (this.match.phase === "clash") this.enterClash();
        else this.nextProblem();
      }
      return;
    }

    // AI commits to its answer after a sampled delay
    if (this.settings.mode === "ai" && this.aiPlan && !this.aiActed && this.problem && !this.exchangeResolved) {
      if (this.problem.kind === "quickdraw") {
        const reveal = this.problem.revealMs ?? 0;
        // a "mistake" here is an early flinch (false start) before the rune flares
        const target = this.aiPlan.willErr ? reveal * 0.55 : reveal + this.aiReactMs;
        if (this.exchangeAge >= target) {
          this.aiActed = true;
          this.answer(1, 0);
        }
      } else if (this.exchangeAge >= this.aiPlan.actMs) {
        this.aiActed = true;
        const choice = this.aiPlan.willErr ? this.wrongChoice(this.problem) : this.problem.correct;
        this.answer(1, choice);
      }
    }
  }

  private updateClash(dt: number): void {
    this.clashT += dt;
    if (!this.clashImpactFired && this.clashT >= CLASH_IMPACT_MS) {
      this.clashImpactFired = true;
      resolveClash(this.match);
      const lr = this.match.lastRound;
      if (lr) {
        this.lastDamage = lr.damage;
        if (lr.loser !== null) this.knights[lr.loser].flash = 1;
        this.deps.shake.add(lr.crit ? 1 : 0.8);
        this.deps.audio.clash();
        this.events.push({ type: "clash", crit: lr.crit });
        this.banner = lr.crit ? "A MIGHTY BLOW!" : "STRUCK!";
      }
    }
    if (this.clashT >= CLASH_END_MS) this.enterRoundResult();
  }

  private updateViews(dt: number): void {
    const inClash = this.screen === "clash";
    for (const i of [0, 1] as const) {
      const v = this.knights[i];
      const k = this.match.knights[i];
      let target = clamp(k.strides / this.match.config.stridesToClash, 0, 1);
      if (inClash) {
        // both ride hard to the centre during the charge
        target = clamp(this.clashT / CLASH_IMPACT_MS, 0, 1);
      }
      v.progress = damp(v.progress, target, 9, dt / 1000);
      v.hp = damp(v.hp, k.hp, 6, dt / 1000);
      v.flash = Math.max(0, v.flash - dt / 220);
      v.lance = Math.max(0, v.lance - dt / 320);
      const riding = this.screen === "playing" || inClash;
      v.bob = riding ? Math.sin(this.now * 0.02 + i * 1.7) : 0;
    }
  }

  // ---- transitions ------------------------------------------------------
  private setScreen(s: ScreenName): void {
    this.screen = s;
    if (s === "title") this.deps.audio.stopMusic();
    this.deps.onUiChange();
  }

  private enterRoundIntro(): void {
    this.introT = INTRO_MS;
    const roundNum = this.match.round + 1;
    this.banner =
      roundNum > this.settings.rounds ? "SUDDEN DEATH" : `ROUND ${roundNum} OF ${this.settings.rounds}`;
    this.problem = null;
    this.setScreen("roundIntro");
  }

  private enterPlaying(): void {
    beginRound(this.match);
    for (const v of this.knights) {
      v.progress = 0;
    }
    this.setScreen("playing");
    this.nextProblem();
  }

  private nextProblem(): void {
    this.problem =
      this.settings.challenge === "quickdraw"
        ? genQuickdraw(this.rng)
        : genProblem(this.rng, this.settings.difficulty);
    this.problemShownAt = this.now;
    this.exchangeAge = 0;
    this.attempts = [{ state: "idle" }, { state: "idle" }];
    this.subs = [null, null];
    this.exchangeId++;
    this.exchangeResolved = false;
    this.cooldown = 0;
    this.aiActed = false;
    this.aiPlan =
      this.settings.mode === "ai" ? planExchange(this.rng, aiProfile(this.settings.difficulty)) : null;
    // reflex reaction time for the squire AI (faster on harder difficulties)
    const base = this.settings.difficulty === "champion" ? 150 : this.settings.difficulty === "knight" ? 230 : 340;
    this.aiReactMs = Math.round(base + this.rng.next() * base);
    this.deps.onUiChange();

    // online: a peer input that arrived early for this exchange now applies
    const buffered = this.remoteBuffer.get(this.exchangeId);
    if (buffered) {
      this.remoteBuffer.delete(this.exchangeId);
      this.submitRemote(buffered);
    }
  }

  private resolveExchange(): void {
    if (this.exchangeResolved) return;
    this.exchangeResolved = true;
    const [s0, s1] = this.subs;
    const c0 = s0?.correct ?? false;
    const c1 = s1?.correct ?? false;
    let winner: PlayerId | null = null;
    if (c0 && c1) winner = (s0 as Sub).reactionMs <= (s1 as Sub).reactionMs ? 0 : 1;
    else if (c0) winner = 0;
    else if (c1) winner = 1;
    const ex: ExchangeResult = {
      winner,
      reactionMs: winner !== null ? (this.subs[winner] as Sub).reactionMs : 0,
      wrong: [s0?.correct === false, s1?.correct === false],
    };
    applyExchange(this.match, ex);
    if (winner !== null) {
      this.deps.audio.gallop();
      this.events.push({ type: "hoof", player: winner });
    }
    this.cooldown = FEEDBACK_MS;
    this.deps.onUiChange();
  }

  private enterClash(): void {
    this.clashT = 0;
    this.clashImpactFired = false;
    this.problem = null;
    this.deps.audio.charge();
    this.banner = "CHARGE!";
    this.setScreen("clash");
  }

  private enterRoundResult(): void {
    this.resultT = 0;
    this.problem = null;
    const lr = this.match.lastRound;
    if (lr && lr.winner !== null) {
      this.banner = `${this.settings.names[lr.winner]} STRIKES FOR ${lr.damage}`;
    }
    this.setScreen("roundResult");
  }

  private continueAfterResult(): void {
    if (this.match.phase === "matchEnd") {
      this.enterMatchOver();
      return;
    }
    advanceRound(this.match);
    if (this.match.matchWinner !== null) this.enterMatchOver();
    else this.enterRoundIntro();
  }

  private enterMatchOver(): void {
    this.problem = null;
    const w = this.match.matchWinner;
    this.banner = w !== null ? `${this.settings.names[w]} IS CHAMPION` : "A DRAW";
    if (w !== null) this.deps.audio.fanfare();
    else this.deps.audio.defeat();
    this.setScreen("matchOver");
  }

  /** true while the correct answer is being revealed between exchanges */
  isRevealing(): boolean {
    return this.exchangeResolved;
  }

  // ---- helpers ----------------------------------------------------------
  private wrongChoice(p: Problem): number {
    let c = this.rng.int(0, p.choices.length - 1);
    if (c === p.correct) c = (c + 1) % p.choices.length;
    return c;
  }
}

function freshView(): KnightView {
  return { progress: 0, bob: 0, flash: 0, lance: 0, hp: 100 };
}
