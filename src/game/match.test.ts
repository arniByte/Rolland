import { describe, it, expect } from "vitest";
import {
  createMatch,
  beginRound,
  applyExchange,
  resolveClash,
  advanceRound,
  computeDamage,
  DEFAULT_CONFIG,
  type MatchState,
  type ExchangeResult,
} from "./match";

const win = (winner: 0 | 1, reactionMs = 2000): ExchangeResult => ({
  winner,
  reactionMs,
  wrong: [false, false],
});

function rideToClash(s: MatchState, winner: 0 | 1, reactionMs = 2000) {
  while (s.phase === "playing") applyExchange(s, win(winner, reactionMs));
}

describe("match flow", () => {
  it("creates a fresh match", () => {
    const s = createMatch();
    expect(s.phase).toBe("idle");
    expect(s.knights[0].hp).toBe(DEFAULT_CONFIG.maxHp);
    expect(s.knights[1].hp).toBe(DEFAULT_CONFIG.maxHp);
  });

  it("reaches a clash after stridesToClash winning exchanges", () => {
    const s = beginRound(createMatch());
    rideToClash(s, 0);
    expect(s.phase).toBe("clash");
    expect(s.pendingClashWinner).toBe(0);
    expect(s.knights[0].strides).toBe(DEFAULT_CONFIG.stridesToClash);
  });

  it("applies damage on clash and records the round", () => {
    const s = beginRound(createMatch());
    rideToClash(s, 0);
    resolveClash(s);
    expect(s.phase).toBe("roundEnd");
    expect(s.results).toHaveLength(1);
    expect(s.knights[1].hp).toBeLessThan(DEFAULT_CONFIG.maxHp);
    expect(s.lastRound?.winner).toBe(0);
  });

  it("counts wrong answers and reduces the clean bonus", () => {
    const s = beginRound(createMatch());
    applyExchange(s, { winner: 0, reactionMs: 2000, wrong: [false, true] });
    expect(s.knights[1].wrongCount).toBe(1);
  });

  it("faster reactions and clean rides hit harder", () => {
    const fast = computeDamage(
      { hp: 100, strides: 6, exchangesWon: 6, wrongCount: 0, reactionSum: 6000, reactionCount: 6 },
      { hp: 100, strides: 1, exchangesWon: 1, wrongCount: 0, reactionSum: 0, reactionCount: 0 },
    );
    const slow = computeDamage(
      { hp: 100, strides: 6, exchangesWon: 6, wrongCount: 3, reactionSum: 24000, reactionCount: 6 },
      { hp: 100, strides: 5, exchangesWon: 5, wrongCount: 0, reactionSum: 0, reactionCount: 0 },
    );
    expect(fast.damage).toBeGreaterThan(slow.damage);
    expect(fast.clean).toBe(true);
    expect(slow.clean).toBe(false);
  });

  it("unhorse (hp<=0) ends the match immediately", () => {
    const s = createMatch({ ...DEFAULT_CONFIG, maxHp: 20 });
    beginRound(s);
    rideToClash(s, 0, 1100); // max-speed clean clash => big damage
    resolveClash(s);
    expect(s.phase).toBe("matchEnd");
    expect(s.matchWinner).toBe(0);
  });

  it("decides by remaining hp after the configured rounds", () => {
    const s = createMatch({ ...DEFAULT_CONFIG, rounds: 2 });
    // round 0 -> P0 wins
    beginRound(s);
    rideToClash(s, 0);
    resolveClash(s);
    advanceRound(s);
    // round 1 -> P0 wins again
    rideToClash(s, 0);
    resolveClash(s);
    advanceRound(s);
    expect(s.phase).toBe("matchEnd");
    expect(s.matchWinner).toBe(0);
    expect(s.knights[1].hp).toBeLessThan(s.knights[0].hp);
  });

  it("ties go to sudden death rather than ending", () => {
    const s = createMatch({ ...DEFAULT_CONFIG, rounds: 2 });
    beginRound(s);
    rideToClash(s, 0);
    resolveClash(s);
    advanceRound(s);
    rideToClash(s, 1);
    resolveClash(s);
    // both have taken one symmetric hit at equal speed -> equal hp -> sudden death
    advanceRound(s);
    expect(s.phase).toBe("playing");
    expect(s.matchWinner).toBeNull();
  });

  it("a full simulated match always produces a winner", () => {
    const s = createMatch();
    beginRound(s);
    let guard = 0;
    while (s.phase !== "matchEnd" && guard++ < 1000) {
      if (s.phase === "playing") {
        const w = (Math.floor(guard / 3) % 2) as 0 | 1;
        applyExchange(s, win(w, 1500 + (guard % 5) * 300));
      } else if (s.phase === "clash") {
        resolveClash(s);
      } else if (s.phase === "roundEnd") {
        advanceRound(s);
      }
    }
    expect(s.phase).toBe("matchEnd");
    expect(s.matchWinner === 0 || s.matchWinner === 1).toBe(true);
  });
});
