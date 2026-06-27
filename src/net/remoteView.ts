// The guest's view of the duel. It implements the exact same GameController
// surface as the host Engine, but every read comes from the latest host
// snapshot and every command becomes a message back to the host. Arena/UI render
// it without knowing it isn't a real Engine.
import type { GameController } from "../game/view";
import type { ScreenName, Settings, Attempt, KnightView, EngineEvent } from "../game/engine";
import type { Problem } from "../game/problems";
import { createMatch, type MatchState, type PlayerId } from "../game/match";
import { PROTO, type NetMsg, type Snapshot, type SnapProblem, type NetSettings } from "./protocol";
import { snapToMatch } from "./snapshot";

function freshKnightView(hp: number): KnightView {
  return { progress: 0, bob: 0, flash: 0, lance: 0, hp };
}

function reconstructProblem(sp: SnapProblem): Problem {
  // a/b/op/answer are never read by the renderer — only text/choices/correct/kind/revealMs are.
  return {
    kind: sp.kind,
    text: sp.text,
    a: 0,
    b: 0,
    op: "+",
    answer: 0,
    choices: sp.choices,
    correct: sp.correct,
    ...(sp.revealMs !== undefined ? { revealMs: sp.revealMs } : {}),
  };
}

function settingsFrom(ns: NetSettings): Settings {
  return {
    mode: "online",
    difficulty: ns.difficulty,
    rounds: ns.rounds,
    names: [ns.names[0], ns.names[1]],
    challenge: ns.challenge,
  };
}

export class RemoteView implements GameController {
  readonly localPlayer: PlayerId = 1;

  screen: ScreenName = "roundIntro";
  settings: Settings;
  match: MatchState;
  problem: Problem | null = null;
  attempts: [Attempt, Attempt] = [{ state: "idle" }, { state: "idle" }];
  knights: [KnightView, KnightView] = [freshKnightView(100), freshKnightView(100)];
  exchangeAge = 0;
  banner = "";
  lastDamage = 0;
  events: EngineEvent[] = [];

  private revealing = false;
  private now = 0;
  private problemShownAt = 0;
  private lastProblemId = -1;
  private lastSeq = -1;
  /** our optimistic local attempt, shown instantly until the host's snap confirms it */
  private localAttempt: Attempt | null = null;

  constructor(
    private send: (m: NetMsg) => void,
    private onBack: () => void,
    settings: NetSettings,
  ) {
    this.settings = settingsFrom(settings);
    this.match = createMatch({
      rounds: settings.rounds,
      stridesToClash: 6,
      maxHp: 100,
      difficulty: settings.difficulty,
    });
  }

  /** keep our lobby/settings display in step before the match starts */
  setSettings(ns: NetSettings): void {
    this.settings = settingsFrom(ns);
  }

  isRevealing(): boolean {
    return this.revealing;
  }

  /** advance our local clock (drives reaction timing on this device) */
  tick(now: number): void {
    this.now = now;
  }

  /** Fold a host snapshot into our view. Returns false for stale/duplicate seqs. */
  apply(snap: Snapshot, seq: number): boolean {
    if (seq <= this.lastSeq) return false;
    this.lastSeq = seq;

    if (snap.problemId !== this.lastProblemId) {
      this.lastProblemId = snap.problemId;
      // stamp the moment THIS device first showed the prompt → latency-proof reaction
      this.problemShownAt = this.now;
      this.localAttempt = null;
    }

    this.screen = snap.screen;
    if (snap.problem) this.problem = reconstructProblem(snap.problem);
    else if (snap.screen !== "playing") this.problem = null; // host cleared it

    this.attempts = [{ ...snap.attempts[0] }, { ...snap.attempts[1] }];
    // preserve our instant local feedback until the host confirms (or supersedes) it
    const hostLocal = snap.attempts[this.localPlayer];
    if (hostLocal.state !== "idle") this.localAttempt = null;
    else if (this.localAttempt) this.attempts[this.localPlayer] = this.localAttempt;

    this.knights = [{ ...snap.knights[0] }, { ...snap.knights[1] }];
    this.exchangeAge = snap.exchangeAge;
    this.revealing = snap.isRevealing;
    this.banner = snap.banner;
    this.lastDamage = snap.lastDamage;
    this.match = snapToMatch(snap, this.settings.difficulty);
    for (const ev of snap.events) this.events.push({ ...ev });
    return true;
  }

  // ---- commands → host -------------------------------------------------
  answer(_player: PlayerId, choice: number): void {
    this.answerLocal(choice);
  }

  answerLocal(choice: number): void {
    if (this.screen !== "playing" || !this.problem) return;
    if (this.localAttempt) return; // one input per exchange
    const p = this.problem;
    const age = this.now - this.problemShownAt;
    let correct: boolean;
    let reactionMs: number;
    let falseStart = false;
    if (p.kind === "quickdraw") {
      const reveal = p.revealMs ?? 0;
      falseStart = age < reveal;
      correct = !falseStart;
      reactionMs = age - reveal;
    } else {
      correct = choice === p.correct;
      reactionMs = age;
    }
    // optimistic: the guest knows correctness exactly, so show it instantly
    this.localAttempt = { state: correct ? "correct" : "wrong", choice };
    this.attempts[this.localPlayer] = this.localAttempt;
    this.send({ v: PROTO, t: "input", problemId: this.lastProblemId, choice, reactionMs, falseStart });
  }

  confirm(): void {
    // advisory: ask the host to advance the veil (host owns timing)
    this.send({ v: PROTO, t: "confirm", screen: this.screen });
  }

  back(): void {
    this.onBack();
  }

  // host-driven only — no-ops on the guest
  pickTrial(): void {}
  startMatch(): void {}
}
