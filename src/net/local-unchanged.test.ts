// Regression guard: extracting the settle buffer must leave local2p / AI
// resolution byte-identical (settle window = 0 → first correct wins instantly).
import { describe, it, expect } from "vitest";
import { makeEngine, Driver } from "./harness";

function atPlay(mode: "local2p" | "ai") {
  const e = makeEngine();
  e.settings.mode = mode;
  const d = new Driver(e);
  d.toPlaying();
  return { e, d };
}

describe("local/AI resolution unchanged by the settle refactor", () => {
  it("local2p: the first correct answer resolves synchronously, in the same call", () => {
    const { e } = atPlay("local2p");
    const idx = e.problem ? e.problem.correct : 0;
    expect(e.isRevealing()).toBe(false);
    e.answer(0, idx);
    expect(e.isRevealing()).toBe(true); // no settle wait offline
    expect(e.match.knights[0].strides).toBe(1);
  });

  it("local2p: a second answer after the resolve is ignored", () => {
    const { e } = atPlay("local2p");
    const idx = e.problem ? e.problem.correct : 0;
    e.answer(0, idx);
    e.answer(1, idx);
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("local2p: one wrong answer does not resolve until the other commits", () => {
    const { e } = atPlay("local2p");
    const idx = e.problem ? e.problem.correct : 0;
    const wrong = (idx + 1) % (e.problem ? e.problem.choices.length : 4);
    e.answer(0, wrong);
    expect(e.isRevealing()).toBe(false);
    e.answer(1, wrong);
    expect(e.isRevealing()).toBe(true);
    expect(e.match.knights[0].strides).toBe(0);
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("a full local match still always reaches a winner", () => {
    const { e, d } = atPlay("local2p");
    let guard = 0;
    while (e.screen !== "matchOver" && guard++ < 6000) {
      if (e.screen === "playing" && !e.isRevealing() && e.problem) {
        e.answer(0, e.problem.correct); // P0 always fastest → drives to a result
      }
      d.step();
    }
    expect(e.screen).toBe("matchOver");
    expect(e.match.matchWinner === 0 || e.match.matchWinner === 1).toBe(true);
  });

  it("vs AI: a full match runs to completion with the squire participating", () => {
    const e = makeEngine();
    e.settings.mode = "ai";
    e.settings.difficulty = "champion"; // fast squire → it reliably gets to answer
    const d = new Driver(e);
    d.toPlaying();
    let aiAnswered = false;
    let guard = 0;
    while (e.screen !== "matchOver" && guard++ < 8000) {
      if (e.attempts[1].state !== "idle") aiAnswered = true;
      d.step();
      // the human backstops each exchange so it always resolves (real play has a P1)
      if (e.screen === "playing" && !e.isRevealing() && e.problem && e.attempts[0].state === "idle" && e.exchangeAge > 2200) {
        e.answer(0, e.problem.correct);
      }
    }
    expect(e.screen).toBe("matchOver");
    expect(aiAnswered).toBe(true); // the AI code path actually executed
  });
});
