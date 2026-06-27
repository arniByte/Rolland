import { clamp, remap } from "../core/mathx";
import type { Difficulty } from "./problems";

export type PlayerId = 0 | 1;

export interface MatchConfig {
  /** best-of N rounds (the minimum played; ties go to sudden death) */
  rounds: number;
  /** strides required to reach the centre and land the blow */
  stridesToClash: number;
  maxHp: number;
  difficulty: Difficulty;
}

export const DEFAULT_CONFIG: MatchConfig = {
  rounds: 5,
  stridesToClash: 6,
  maxHp: 100,
  difficulty: "knight",
};

export interface KnightStats {
  hp: number;
  // per-round, reset by beginRound:
  strides: number;
  exchangesWon: number;
  wrongCount: number;
  reactionSum: number;
  reactionCount: number;
}

export interface ExchangeResult {
  /** who answered correctly first; null if both failed */
  winner: PlayerId | null;
  /** winner's reaction time in ms (ignored when winner is null) */
  reactionMs: number;
  /** did each player answer wrongly during this exchange */
  wrong: [boolean, boolean];
}

export interface RoundResult {
  round: number; // 0-based
  winner: PlayerId | null;
  loser: PlayerId | null;
  damage: number;
  clean: boolean; // winner made no mistakes
  crit: boolean; // clean + big lead
  avgReactionMs: number;
}

export type MatchPhase = "idle" | "playing" | "clash" | "roundEnd" | "matchEnd";

export interface MatchState {
  config: MatchConfig;
  round: number;
  phase: MatchPhase;
  knights: [KnightStats, KnightStats];
  pendingClashWinner: PlayerId | null;
  lastRound: RoundResult | null;
  results: RoundResult[];
  matchWinner: PlayerId | null;
}

function freshKnight(hp: number): KnightStats {
  return { hp, strides: 0, exchangesWon: 0, wrongCount: 0, reactionSum: 0, reactionCount: 0 };
}

export function createMatch(config: MatchConfig = DEFAULT_CONFIG): MatchState {
  // guard against invalid configs (keeps clash/crit/round logic well-defined)
  config = {
    ...config,
    rounds: Math.max(1, Math.floor(config.rounds)),
    stridesToClash: Math.max(1, Math.floor(config.stridesToClash)),
    maxHp: Math.max(1, config.maxHp),
  };
  return {
    config,
    round: 0,
    phase: "idle",
    knights: [freshKnight(config.maxHp), freshKnight(config.maxHp)],
    pendingClashWinner: null,
    lastRound: null,
    results: [],
    matchWinner: null,
  };
}

/** Reset per-round counters and start riding. */
export function beginRound(s: MatchState): MatchState {
  for (const k of s.knights) {
    k.strides = 0;
    k.exchangesWon = 0;
    k.wrongCount = 0;
    k.reactionSum = 0;
    k.reactionCount = 0;
  }
  s.pendingClashWinner = null;
  s.phase = "playing";
  return s;
}

/** Apply one resolved exchange. Triggers a clash when someone reaches the centre. */
export function applyExchange(s: MatchState, ex: ExchangeResult): MatchState {
  if (s.phase !== "playing") return s;

  if (ex.wrong[0]) s.knights[0].wrongCount++;
  if (ex.wrong[1]) s.knights[1].wrongCount++;

  if (ex.winner !== null) {
    const k = s.knights[ex.winner];
    k.exchangesWon++;
    k.strides++;
    k.reactionSum += ex.reactionMs;
    k.reactionCount++;
    if (k.strides >= s.config.stridesToClash) {
      s.phase = "clash";
      s.pendingClashWinner = ex.winner;
    }
  }
  return s;
}

export function computeDamage(winner: KnightStats, loser: KnightStats): {
  damage: number;
  clean: boolean;
  crit: boolean;
  avgReactionMs: number;
} {
  const lead = winner.strides - loser.strides;
  const avgReactionMs = winner.reactionCount > 0 ? winner.reactionSum / winner.reactionCount : 3000;
  const speedFactor = remap(avgReactionMs, 1100, 4000, 1.6, 1.0); // faster -> harder
  const clean = winner.wrongCount === 0;
  const cleanFactor = clean ? 1.4 : 1.0;
  const base = 10;
  const raw = (base + lead * 3.5) * speedFactor * cleanFactor;
  const damage = Math.round(clamp(raw, 6, 60));
  const crit = clean && lead >= Math.ceil(winner.strides * 0.6);
  return { damage, clean, crit, avgReactionMs };
}

/** Resolve the charge: compute & apply damage, record the round. */
export function resolveClash(s: MatchState): MatchState {
  if (s.phase !== "clash" || s.pendingClashWinner === null) return s;
  const w = s.pendingClashWinner;
  const l: PlayerId = w === 0 ? 1 : 0;
  const { damage, clean, crit, avgReactionMs } = computeDamage(s.knights[w], s.knights[l]);

  s.knights[l].hp = Math.max(0, s.knights[l].hp - damage);

  const result: RoundResult = {
    round: s.round,
    winner: w,
    loser: l,
    damage,
    clean,
    crit,
    avgReactionMs,
  };
  s.lastRound = result;
  s.results.push(result);

  if (s.knights[l].hp <= 0) {
    s.matchWinner = w;
    s.phase = "matchEnd";
  } else {
    s.phase = "roundEnd";
  }
  return s;
}

/** Move to the next round, or end the match (best-of with sudden death on ties). */
export function advanceRound(s: MatchState): MatchState {
  if (s.phase !== "roundEnd") return s;
  s.round++;
  const roundsDone = s.round >= s.config.rounds;
  const [a, b] = [s.knights[0].hp, s.knights[1].hp];
  if (roundsDone && a !== b) {
    s.matchWinner = a > b ? 0 : 1;
    s.phase = "matchEnd";
  } else {
    // either more rounds to ride, or a tie -> sudden death
    beginRound(s);
  }
  return s;
}

export function totalDamageDealt(s: MatchState, by: PlayerId): number {
  return s.results.filter((r) => r.winner === by).reduce((sum, r) => sum + r.damage, 0);
}
