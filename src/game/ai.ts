import type { Rng } from "./rng";
import type { Difficulty } from "./problems";

export interface AiProfile {
  /** reaction window in ms for a correct answer */
  minMs: number;
  maxMs: number;
  /** probability the AI commits to a wrong answer this exchange */
  errorRate: number;
}

const PROFILES: Record<Difficulty, AiProfile> = {
  squire: { minMs: 1900, maxMs: 4000, errorRate: 0.3 },
  knight: { minMs: 1200, maxMs: 2900, errorRate: 0.18 },
  champion: { minMs: 750, maxMs: 1900, errorRate: 0.09 },
};

export function aiProfile(d: Difficulty): AiProfile {
  return PROFILES[d];
}

export interface AiPlan {
  /** true => AI will tap a wrong choice (and get locked out) */
  willErr: boolean;
  /** ms after the problem appears that the AI taps */
  actMs: number;
}

/** Decide how the AI will play the current exchange. */
export function planExchange(rng: Rng, p: AiProfile): AiPlan {
  const willErr = rng.bool(p.errorRate);
  // mistakes tend to come a touch quicker (over-eager) than careful correct answers
  const lo = willErr ? p.minMs * 0.7 : p.minMs;
  const hi = willErr ? p.maxMs * 0.8 : p.maxMs;
  return { willErr, actMs: Math.round(lo + rng.next() * (hi - lo)) };
}
