import { describe, it, expect } from "vitest";
import { PROTO, isNetMsg, type NetMsg, type Snapshot, type NetSettings } from "./protocol";
import { RemoteView } from "./remoteView";

const NS: NetSettings = {
  difficulty: "knight",
  rounds: 5,
  challenge: "arithmetic",
  names: ["ROLAND", "OLIVIER"],
  mode: "online",
};

function mkSnap(p: Partial<Snapshot>): Snapshot {
  return {
    screen: "playing",
    problemId: 1,
    problem: null,
    attempts: [{ state: "idle" }, { state: "idle" }],
    knights: [
      { progress: 0, bob: 0, flash: 0, lance: 0, hp: 100 },
      { progress: 0, bob: 0, flash: 0, lance: 0, hp: 100 },
    ],
    exchangeAge: 0,
    isRevealing: false,
    banner: "",
    lastDamage: 0,
    events: [],
    match: {
      round: 0,
      phase: "playing",
      matchWinner: null,
      config: { maxHp: 100, stridesToClash: 6, rounds: 5 },
      knights: [
        { hp: 100, strides: 0 },
        { hp: 100, strides: 0 },
      ],
      results: [],
    },
    ...p,
  };
}

const mkRemote = (): RemoteView => new RemoteView(() => undefined, () => undefined, NS);

describe("protocol", () => {
  it("every message variant JSON round-trips and is recognised", () => {
    const msgs: NetMsg[] = [
      { v: PROTO, t: "hello", name: "OLIVIER" },
      { v: PROTO, t: "welcome", you: 1, settings: NS },
      { v: PROTO, t: "settings", settings: NS },
      { v: PROTO, t: "start", seed: 123, settings: NS },
      { v: PROTO, t: "snap", seq: 7, s: mkSnap({}) },
      { v: PROTO, t: "input", problemId: 3, choice: 2, reactionMs: 410, falseStart: false },
      { v: PROTO, t: "confirm", screen: "roundResult" },
      { v: PROTO, t: "ping" },
      { v: PROTO, t: "pong" },
      { v: PROTO, t: "bye", reason: "left" },
    ];
    for (const m of msgs) {
      const round = JSON.parse(JSON.stringify(m)) as unknown;
      expect(isNetMsg(round)).toBe(true);
      expect((round as NetMsg).t).toBe(m.t);
    }
  });

  it("rejects malformed / wrong-version payloads", () => {
    expect(isNetMsg(null)).toBe(false);
    expect(isNetMsg({ t: "hello" })).toBe(false); // no version
    expect(isNetMsg({ v: 0, t: "hello" })).toBe(false); // wrong version
    expect(isNetMsg({ v: PROTO, t: "nope" })).toBe(false); // unknown type
    expect(isNetMsg("hello")).toBe(false);
  });

  it("a guest keeps its cached problem when a snap omits it (unchanged exchange)", () => {
    const r = mkRemote();
    r.apply(mkSnap({ problemId: 1, problem: { text: "7 × 8", choices: [54, 56, 63, 48], correct: 1, kind: "arithmetic" } }), 1);
    expect(r.problem?.text).toBe("7 × 8");
    // a heartbeat snap for the SAME exchange carries no problem payload
    r.apply(mkSnap({ problemId: 1, problem: null }), 2);
    expect(r.problem?.text).toBe("7 × 8"); // still cached
    // a new exchange swaps it
    r.apply(mkSnap({ problemId: 2, problem: { text: "3 + 4", choices: [7, 8, 6, 5], correct: 0, kind: "arithmetic" } }), 3);
    expect(r.problem?.text).toBe("3 + 4");
  });

  it("accumulates each event exactly once and drops duplicate/old seqs", () => {
    const r = mkRemote();
    expect(r.apply(mkSnap({ events: [{ type: "hoof", player: 0 }] }), 1)).toBe(true);
    expect(r.apply(mkSnap({ events: [{ type: "hoof", player: 0 }] }), 1)).toBe(false); // duplicate seq
    expect(r.apply(mkSnap({ events: [{ type: "clash", crit: true }] }), 2)).toBe(true);
    expect(r.apply(mkSnap({ events: [{ type: "wrong", player: 1 }] }), 1)).toBe(false); // stale seq
    expect(r.events).toHaveLength(2); // hoof + clash, each once
    expect(r.events[0]).toEqual({ type: "hoof", player: 0 });
    expect(r.events[1]).toEqual({ type: "clash", crit: true });
  });
});
