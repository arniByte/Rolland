// Translate the host Engine's live state into a wire Snapshot, and rebuild a
// render-ready MatchState from one. toSnapshot() deep-copies every field it
// sends so neither the host's live objects nor successive snaps ever alias the
// guest's view (mirrors what real JSON serialization would do).
import type { Engine, KnightView, Attempt } from "../game/engine";
import type { Snapshot, SnapProblem } from "./protocol";
import {
  type MatchState,
  type MatchPhase,
  type PlayerId,
  type KnightStats,
  type RoundResult,
} from "../game/match";
import type { Difficulty } from "../game/problems";

function copyKnight(k: KnightView): KnightView {
  return { progress: k.progress, bob: k.bob, flash: k.flash, lance: k.lance, hp: k.hp };
}

function copyAttempt(a: Attempt): Attempt {
  return a.choice === undefined ? { state: a.state } : { state: a.state, choice: a.choice };
}

function snapProblem(e: Engine): SnapProblem | null {
  const p = e.problem;
  if (!p) return null;
  return {
    text: p.text,
    choices: [...p.choices],
    correct: p.correct,
    kind: p.kind ?? "arithmetic",
    ...(p.revealMs !== undefined ? { revealMs: p.revealMs } : {}),
  };
}

/**
 * Build the snapshot for this frame. `prevProblemId` lets us omit the (otherwise
 * static) problem payload when the exchange hasn't changed — the guest keeps its
 * cached copy.
 */
export function toSnapshot(e: Engine, prevProblemId: number): Snapshot {
  const m = e.match;
  const problem = e.problemId !== prevProblemId ? snapProblem(e) : null;
  return {
    screen: e.screen,
    problemId: e.problemId,
    problem,
    attempts: [copyAttempt(e.attempts[0]), copyAttempt(e.attempts[1])],
    knights: [copyKnight(e.knights[0]), copyKnight(e.knights[1])],
    exchangeAge: e.exchangeAge,
    isRevealing: e.isRevealing(),
    banner: e.banner,
    lastDamage: e.lastDamage,
    events: e.events.map((ev) => ({ ...ev })),
    match: {
      round: m.round,
      phase: m.phase,
      matchWinner: m.matchWinner,
      config: {
        maxHp: m.config.maxHp,
        stridesToClash: m.config.stridesToClash,
        rounds: m.config.rounds,
      },
      knights: [
        { hp: m.knights[0].hp, strides: m.knights[0].strides },
        { hp: m.knights[1].hp, strides: m.knights[1].strides },
      ],
      results: m.results.map((r) => ({ winner: r.winner })),
    },
  };
}

function statsFrom(hp: number, strides: number): KnightStats {
  return { hp, strides, exchangesWon: 0, wrongCount: 0, reactionSum: 0, reactionCount: 0 };
}

function resultFrom(round: number, winner: PlayerId | null): RoundResult {
  const loser: PlayerId | null = winner === null ? null : winner === 0 ? 1 : 0;
  return { round, winner, loser, damage: 0, clean: false, crit: false, avgReactionMs: 0 };
}

/**
 * Rebuild a structurally-complete MatchState from a snapshot — enough for Arena
 * (matchWinner, results[].winner, round) and UI (knights[].hp, config.maxHp) to
 * render. Fields the renderer never reads are filled with safe defaults.
 */
export function snapToMatch(snap: Snapshot, difficulty: Difficulty): MatchState {
  const sm = snap.match;
  return {
    config: {
      rounds: sm.config.rounds,
      stridesToClash: sm.config.stridesToClash,
      maxHp: sm.config.maxHp,
      difficulty,
    },
    round: sm.round,
    phase: sm.phase as MatchPhase,
    knights: [
      statsFrom(sm.knights[0].hp, sm.knights[0].strides),
      statsFrom(sm.knights[1].hp, sm.knights[1].strides),
    ],
    pendingClashWinner: null,
    lastRound: null,
    results: sm.results.map((r, i) => resultFrom(i, r.winner)),
    matchWinner: sm.matchWinner,
  };
}
