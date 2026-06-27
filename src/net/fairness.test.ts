// The fairness milestone: the host resolves every exchange by REACTION TIME
// (time since each player's own device showed the prompt), never by packet
// arrival. These drive the Engine in online mode directly — answerRemote()
// injects a precise guest reaction; answer() uses the host's local clock.
import { describe, it, expect } from "vitest";
import { makeEngine, Driver } from "./harness";
import { SETTLE_MS_ONLINE } from "../game/engine";
import type { ChallengeKind } from "../game/problems";

function atPlay(challenge: ChallengeKind = "arithmetic") {
  const e = makeEngine();
  e.settings.mode = "online";
  e.settings.challenge = challenge;
  e.settings.rounds = 5;
  const d = new Driver(e);
  d.toPlaying();
  const correct = e.problem ? e.problem.correct : 0;
  const wrong = (correct + 1) % (e.problem ? e.problem.choices.length : 4);
  return { e, d, pid: e.problemId, correct, wrong };
}

describe("reaction-time fairness (online)", () => {
  it("the latency case: a faster guest whose packet lands after the host still wins", () => {
    const { e, d, pid, correct } = atPlay();
    d.advance(500); // host reacts ~500ms after the prompt, on its own local clock
    e.answer(0, correct); // local correct → settle window opens
    expect(e.isRevealing()).toBe(false); // not yet resolved — waiting for the foe
    // the guest's genuinely-faster 300ms reaction arrives during the window
    e.answerRemote(1, pid, correct, 300, false);
    expect(e.match.knights[1].strides).toBe(1); // guest won the stride
    expect(e.match.knights[0].strides).toBe(0);
    expect(e.isRevealing()).toBe(true);
  });

  it("inverse: guest's input arrives first but is slower → host wins after settle", () => {
    const { e, pid, correct } = atPlay();
    e.answerRemote(1, pid, correct, 600, false);
    e.answerRemote(0, pid, correct, 400, false);
    expect(e.match.knights[0].strides).toBe(1);
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("a lone correct answer resolves only after the settle window elapses", () => {
    const { e, d, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, 400, false);
    expect(e.isRevealing()).toBe(false); // still waiting for a possible faster foe
    d.advance(SETTLE_MS_ONLINE + 20);
    expect(e.isRevealing()).toBe(true);
    expect(e.match.knights[0].strides).toBe(1);
  });

  it("equal reactions break to the lower player index, regardless of arrival order", () => {
    const { e, pid, correct } = atPlay();
    e.answerRemote(1, pid, correct, 400, false); // guest's input arrives first
    e.answerRemote(0, pid, correct, 400, false);
    expect(e.match.knights[0].strides).toBe(1); // tie → host (player 0)
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("both wrong → no winner, no stride", () => {
    const { e, pid, wrong } = atPlay();
    e.answerRemote(0, pid, wrong, 400, false);
    e.answerRemote(1, pid, wrong, 400, false);
    expect(e.isRevealing()).toBe(true);
    expect(e.match.knights[0].strides).toBe(0);
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("wrong-then-correct across the wire → the correct answer wins", () => {
    const { e, pid, correct, wrong } = atPlay();
    e.answerRemote(0, pid, wrong, 200, false); // host locks itself out
    e.answerRemote(1, pid, correct, 600, false); // guest answers correctly
    expect(e.match.knights[1].strides).toBe(1);
    expect(e.attempts[0].state).toBe("wrong");
  });

  it("stale input from a past exchange is ignored", () => {
    const { e, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, 400, false);
    e.answerRemote(1, pid - 1, correct, 100, false); // wrong problemId
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("clamps a superhuman reaction up to the human floor", () => {
    const { e, d, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, 5, false);
    d.advance(SETTLE_MS_ONLINE + 20);
    expect(e.match.knights[0].reactionSum).toBe(80); // MIN_HUMAN_MS
  });

  it("clamps an AFK reaction down to the grief ceiling", () => {
    const { e, d, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, 1e9, false);
    d.advance(SETTLE_MS_ONLINE + 20);
    expect(e.match.knights[0].reactionSum).toBe(30000); // MAX_REACTION_MS
  });

  it("settle-window bound: a faster guest arriving after the window closes loses", () => {
    const { e, d, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, 500, false); // host answers, window opens
    d.advance(SETTLE_MS_ONLINE + 20); // window closes → host resolved
    e.answerRemote(1, pid, correct, 300, false); // faster, but too late on the wire
    expect(e.match.knights[0].strides).toBe(1);
    expect(e.match.knights[1].strides).toBe(0);
  });

  it("quickdraw: a false start is a lockout, never a win", () => {
    const { e, pid } = atPlay("quickdraw");
    e.answerRemote(1, pid, 0, -100, true); // guest flinched early
    e.answerRemote(0, pid, 0, 200, false); // host strikes cleanly
    expect(e.match.knights[0].strides).toBe(1);
    expect(e.attempts[1].state).toBe("wrong");
  });

  it("quickdraw: the faster clean strike wins", () => {
    const { e, pid } = atPlay("quickdraw");
    e.answerRemote(0, pid, 0, 300, false);
    e.answerRemote(1, pid, 0, 100, false);
    expect(e.match.knights[1].strides).toBe(1);
    expect(e.match.knights[0].strides).toBe(0);
  });

  it("a non-finite reaction is treated as the ceiling, never poisons the compare", () => {
    const { e, pid, correct } = atPlay();
    e.answerRemote(0, pid, correct, NaN, false); // forged
    e.answerRemote(1, pid, correct, 500, false); // legit, faster than the ceiling
    expect(e.match.knights[1].strides).toBe(1); // guest (500) beats NaN→30000
  });

  it("online: confirm at matchOver is inert — only LEAVE/REMATCH exit", () => {
    const e = makeEngine();
    e.settings.mode = "online";
    e.screen = "matchOver";
    e.confirm();
    expect(e.screen).toBe("matchOver"); // a stray Enter can't orphan the guest
  });
});
