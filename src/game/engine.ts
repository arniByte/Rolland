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
import type { GameController } from "./view";

export type Mode = "local2p" | "ai" | "online";
export type ScreenName =
  | "title"
  | "modes"
  | "setup"
  | "lobby"
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

const FEEDBACK_MS = 650;
const INTRO_MS = 2200;
const RESULT_MS = 3000;
const CLASH_IMPACT_MS = 950;
const CLASH_END_MS = 1850;

// Online fairness: the host buffers correct answers for a short window so a
// genuinely-faster guest whose packet lands a touch late still wins the
// exchange (winner = smallest reaction time, never packet-arrival order).
// 0 for local/AI → resolution is byte-identical to the offline game.
export const SETTLE_MS_ONLINE = 120;
const MIN_HUMAN_MS = 80; // clamp floor on any reported reaction (anti-superhuman)
const MAX_REACTION_MS = 30000; // clamp ceiling (anti-grief / AFK)

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

export class Engine implements GameController {
  screen: ScreenName = "title";
  settings: Settings = { ...DEFAULT_SETTINGS };
  match: MatchState = createMatch();
  problem: Problem | null = null;
  attempts: [Attempt, Attempt] = [{ state: "idle" }, { state: "idle" }];
  knights: [KnightView, KnightView] = [freshView(), freshView()];
  /** the Engine is always the HOST/local brain → its local player is 0 */
  readonly localPlayer: PlayerId = 0;
  /** bumps on every new exchange; lets a guest detect a fresh prompt + reject stale inputs */
  problemId = 0;

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

  private rng = new Rng(randomSeed());
  private now = 0;
  private problemShownAt = 0;
  private firstCorrect: { player: PlayerId; reactionMs: number } | null = null;
  private exchangeResolved = false;
  // settle buffer (online fairness): correct answers collect here until either
  // both players have answered or the settle window elapses, then the smallest
  // reaction time wins. For local/AI the window is 0 → resolves instantly.
  private settleT = 0;
  private pending: { player: PlayerId; reactionMs: number }[] = [];
  private cooldown = 0;
  private aiPlan: AiPlan | null = null;
  private aiActed = false;
  private aiReactMs = 300;
  private clashImpactFired = false;

  constructor(private deps: EngineDeps) {}

  // ---- public API -------------------------------------------------------
  startMatch(): void {
    this.rng = new Rng(randomSeed());
    this.match = createMatch({
      rounds: this.settings.rounds,
      stridesToClash: 6,
      maxHp: 100,
      difficulty: this.settings.difficulty,
    });
    this.knights = [freshView(), freshView()];
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
        if (this.settings.mode === "online") this.setScreen("lobby");
        else this.startMatch();
        break;
      case "roundIntro":
        this.enterPlaying();
        break;
      case "roundResult":
        this.continueAfterResult();
        break;
      case "matchOver":
        this.deps.audio.select();
        // online: only the explicit LEAVE / REMATCH buttons exit, so a stray
        // Enter (local or remotely-relayed) can't drop the host to the title
        // and orphan the guest while the room is still live.
        if (this.settings.mode === "online") return;
        this.setScreen("title");
        break;
    }
  }

  back(): void {
    if (this.screen === "title") return;
    if (this.screen === "setup") return this.setScreen("modes");
    if (this.screen === "modes") return this.setScreen("title");
    if (this.screen === "lobby") return this.setScreen("setup");
    // abandon any match in progress and return to the title cleanly
    this.home();
  }

  /** Hard reset to the title — used when leaving an online room. */
  home(): void {
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

  /** sugar used by the answer pads — answer as whoever this device controls */
  answerLocal(choice: number): void {
    this.answer(this.localPlayer, choice);
  }

  /** A local tap: judge it against this device's own clock, then submit. */
  answer(player: PlayerId, choice: number): void {
    if (this.screen !== "playing" || this.exchangeResolved || !this.problem) return;
    if (this.attempts[player].state !== "idle") return;

    const age = this.now - this.problemShownAt;
    let correct: boolean;
    let reactionMs: number;
    if (this.problem.kind === "quickdraw") {
      const reveal = this.problem.revealMs ?? 0;
      correct = age >= reveal; // striking before the rune flares = a false start
      reactionMs = age - reveal;
    } else {
      correct = choice === this.problem.correct;
      reactionMs = age;
    }
    this.submit(player, choice, correct, reactionMs);
  }

  /**
   * A remote (guest) answer arriving over the wire. It carries the guest's OWN
   * measured reaction time (time since the guest's device showed the prompt), so
   * latency never decides the duel. Arithmetic correctness is still host-validated;
   * quickdraw trusts the guest's locally-judged false-start (the host cannot see
   * the guest's reveal timing). Stale inputs (old exchange) are dropped.
   */
  answerRemote(player: PlayerId, problemId: number, choice: number, reactionMs: number, falseStart: boolean): void {
    if (this.screen !== "playing" || this.exchangeResolved || !this.problem) return;
    if (problemId !== this.problemId) return; // belongs to a past exchange
    if (this.attempts[player].state !== "idle") return;
    const correct = this.problem.kind === "quickdraw" ? !falseStart : choice === this.problem.correct;
    this.submit(player, choice, correct, reactionMs);
  }

  /** The shared resolution core for both local taps and remote inputs. */
  private submit(player: PlayerId, choice: number, correct: boolean, reactionMs: number): void {
    const a = this.attempts[player];
    a.choice = choice;
    // a forged/NaN reaction from the wire must never poison the comparison
    if (!Number.isFinite(reactionMs)) reactionMs = MAX_REACTION_MS;
    reactionMs = clamp(reactionMs, MIN_HUMAN_MS, MAX_REACTION_MS);
    const settle = this.settings.mode === "online" ? SETTLE_MS_ONLINE : 0;

    if (correct) {
      a.state = "correct";
      this.pending.push({ player, reactionMs });
      this.deps.audio.correct(player);
      this.knights[player].lance = 1;
      if (settle === 0) {
        this.resolveFromPending(); // local/AI: first correct wins instantly (unchanged)
      } else if (this.settleT <= 0) {
        this.settleT = settle; // online: open the grace window on the first correct
      }
      // once both have committed there is nothing left to wait for
      if (this.bothAnswered()) this.resolveFromPending();
    } else {
      a.state = "wrong";
      this.deps.audio.wrong();
      this.deps.shake.add(0.14);
      this.knights[player].flash = 1;
      this.events.push({ type: "wrong", player });
      if (this.bothAnswered()) {
        if (this.pending.length > 0) this.resolveFromPending();
        else this.resolveExchange(null); // both failed → no stride for anyone
      }
    }
    this.deps.onUiChange();
  }

  private bothAnswered(): boolean {
    return this.attempts[0].state !== "idle" && this.attempts[1].state !== "idle";
  }

  /** Resolve to the buffered correct answer with the smallest reaction time. */
  private resolveFromPending(): void {
    if (this.exchangeResolved || this.pending.length === 0) return;
    let best = this.pending[0] as { player: PlayerId; reactionMs: number };
    for (const p of this.pending) {
      // ties break to the lower player index, deterministically (arrival-order independent)
      if (p.reactionMs < best.reactionMs || (p.reactionMs === best.reactionMs && p.player < best.player)) {
        best = p;
      }
    }
    this.firstCorrect = { player: best.player, reactionMs: best.reactionMs };
    this.resolveExchange(best.player);
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

    // close the online settle window once it elapses (host-authoritative)
    if (this.settleT > 0) {
      this.settleT -= dt;
      if (this.settleT <= 0) this.resolveFromPending();
    }

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        if (this.match.phase === "clash") this.enterClash();
        else this.nextProblem();
      }
      return;
    }

    // AI commits to its answer after a sampled delay
    if (this.settings.mode === "ai" && this.aiPlan && !this.aiActed && this.problem && this.firstCorrect === null) {
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
    this.problemId++;
    this.exchangeAge = 0;
    this.attempts = [{ state: "idle" }, { state: "idle" }];
    this.firstCorrect = null;
    this.exchangeResolved = false;
    this.settleT = 0;
    this.pending.length = 0;
    this.cooldown = 0;
    this.aiActed = false;
    this.aiPlan =
      this.settings.mode === "ai" ? planExchange(this.rng, aiProfile(this.settings.difficulty)) : null;
    // reflex reaction time for the squire AI (faster on harder difficulties)
    const base = this.settings.difficulty === "champion" ? 150 : this.settings.difficulty === "knight" ? 230 : 340;
    this.aiReactMs = Math.round(base + this.rng.next() * base);
    this.deps.onUiChange();
  }

  private resolveExchange(winner: PlayerId | null): void {
    if (this.exchangeResolved) return;
    this.exchangeResolved = true;
    this.settleT = 0;
    this.pending.length = 0;
    const ex: ExchangeResult = {
      winner,
      reactionMs: this.firstCorrect ? this.firstCorrect.reactionMs : 0,
      wrong: [this.attempts[0].state === "wrong", this.attempts[1].state === "wrong"],
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
