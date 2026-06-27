// End-to-end netcode over the in-process LoopbackTransport: handshake, settings
// agreement, host→guest snapshot parity across a whole match, peer-leave, stale
// input rejection, and a latency case proving reaction-time fairness survives a
// real (delayed) transport.
import { describe, it, expect } from "vitest";
import { Online } from "./session";
import { loopbackPair } from "./loopback";
import { makeEngine } from "./harness";
import { PROTO } from "./protocol";
import type { Engine } from "../game/engine";
import type { GameController } from "../game/view";

const FRAME = 1000 / 60;

function pairOf(delay = 0) {
  const pair = loopbackPair(delay);
  const hostEngine = makeEngine();
  const guestEngine = makeEngine();
  const host = new Online({ engine: hostEngine, onUiChange: () => undefined, makeTransport: async () => pair.a });
  const guest = new Online({ engine: guestEngine, onUiChange: () => undefined, makeTransport: async () => pair.b });
  host.localName = "ROLAND";
  guest.localName = "OLIVIER";
  return { pair, host, guest, hostEngine, guestEngine };
}

async function handshake(host: Online, guest: Online, pair: ReturnType<typeof loopbackPair>) {
  await host.createGame();
  await guest.joinGame("ABCD");
  pair.connect(); // synchronous with delay 0
}

function parity(g: GameController, h: Engine): void {
  expect(g.screen).toBe(h.screen);
  expect(g.banner).toBe(h.banner);
  expect(g.isRevealing()).toBe(h.isRevealing());
  expect(g.match.round).toBe(h.match.round);
  expect(g.match.matchWinner).toBe(h.match.matchWinner);
  expect(g.match.knights[0].hp).toBe(h.match.knights[0].hp);
  expect(g.match.knights[1].hp).toBe(h.match.knights[1].hp);
  expect(g.match.knights[0].strides).toBe(h.match.knights[0].strides);
  expect(g.match.knights[1].strides).toBe(h.match.knights[1].strides);
  expect(g.match.results.map((r) => r.winner)).toEqual(h.match.results.map((r) => r.winner));
  expect(g.knights[0].progress).toBeCloseTo(h.knights[0].progress);
  expect(g.knights[1].hp).toBeCloseTo(h.knights[1].hp);
  if (h.screen === "playing" && h.problem) {
    expect(g.problem?.text).toBe(h.problem.text);
    expect(g.problem?.correct).toBe(h.problem.correct);
    expect(g.problem?.choices).toEqual([...h.problem.choices]);
  }
}

describe("online session over loopback", () => {
  it("handshake assigns roles and exchanges names", async () => {
    const { pair, host, guest, hostEngine } = pairOf();
    await handshake(host, guest, pair);
    expect(host.state).toBe("connected");
    expect(guest.state).toBe("connected");
    expect(host.role).toBe("host");
    expect(guest.role).toBe("guest");
    expect(hostEngine.settings.names[1]).toBe("OLIVIER"); // guest's name reached the host
  });

  it("host settings edits propagate to the guest lobby", async () => {
    const { pair, host, guest, hostEngine } = pairOf();
    await handshake(host, guest, pair);
    hostEngine.settings.rounds = 7;
    hostEngine.settings.difficulty = "champion";
    hostEngine.settings.challenge = "quickdraw";
    host.pushSettings();
    expect(guest.remoteSettings?.rounds).toBe(7);
    expect(guest.remoteSettings?.difficulty).toBe("champion");
    expect(guest.remoteSettings?.challenge).toBe("quickdraw");
  });

  it("the guest's RemoteView mirrors the host Engine across a full match", async () => {
    const { pair, host, guest, hostEngine } = pairOf();
    await handshake(host, guest, pair);
    host.start();
    expect(guest.guestInMatch).toBe(true);
    expect(guest.controller.localPlayer).toBe(1);

    let now = 0;
    let pid = -1;
    let guard = 0;
    while (hostEngine.screen !== "matchOver" && guard++ < 8000) {
      now += FRAME;
      hostEngine.update(FRAME, now);
      host.hostBroadcast(); // → guest.onSnap → remote.apply (sync, delay 0)
      guest.update(FRAME, now);
      parity(guest.controller, hostEngine);
      if (hostEngine.screen === "playing" && !hostEngine.isRevealing() && hostEngine.problem && hostEngine.problemId !== pid) {
        pid = hostEngine.problemId;
        // guest answers (wrong, via the real wire) then the host wins the stride
        const wrong = (hostEngine.problem.correct + 1) % hostEngine.problem.choices.length;
        guest.controller.answerLocal(wrong);
        hostEngine.answer(0, hostEngine.problem.correct);
      }
      // mirror the renderer draining events each frame
      hostEngine.events.length = 0;
      guest.controller.events.length = 0;
    }
    expect(hostEngine.screen).toBe("matchOver");
    expect(hostEngine.match.matchWinner).toBe(0);
    parity(guest.controller, hostEngine);
  });

  it("a peer leaving flips the other side to peerLeft", async () => {
    const { pair, host, guest } = pairOf();
    await handshake(host, guest, pair);
    host.leave(); // sends bye, tears down
    expect(guest.state).toBe("peerLeft");
    expect(host.state).toBe("idle");
  });

  it("a stale input (old problemId) changes nothing", async () => {
    const { pair, host, guest, hostEngine } = pairOf();
    await handshake(host, guest, pair);
    host.start();
    let now = 0;
    let guard = 0;
    while (hostEngine.screen !== "playing" && guard++ < 1000) {
      now += FRAME;
      hostEngine.update(FRAME, now);
      host.hostBroadcast();
      guest.update(FRAME, now);
    }
    // a forged input from a past exchange, straight onto the wire
    pair.b.send({ v: PROTO, t: "input", problemId: hostEngine.problemId - 5, choice: 0, reactionMs: 50, falseStart: false });
    expect(hostEngine.match.knights[1].strides).toBe(0);
  });

  it("a guest that finds no live host times out to a visible error", async () => {
    const pair = loopbackPair(0);
    const guest = new Online({ engine: makeEngine(), onUiChange: () => undefined, makeTransport: async () => pair.b });
    await guest.joinGame("ZZZZ"); // nobody on the other end; connect() is never called
    let now = 0;
    for (let i = 0; i < 1010; i++) {
      now += FRAME;
      guest.update(FRAME, now);
    } // ~16.8s > CONNECT_TIMEOUT_MS
    expect(guest.state).toBe("error");
    expect(guest.error).toBe("NO KEEP FOUND");
  });

  it("a guest's matchOver confirm cannot drag the host off matchOver", async () => {
    const { pair, host, guest, hostEngine } = pairOf();
    await handshake(host, guest, pair);
    host.start();
    let now = 0;
    let pid = -1;
    let guard = 0;
    while (hostEngine.screen !== "matchOver" && guard++ < 8000) {
      now += FRAME;
      hostEngine.update(FRAME, now);
      host.hostBroadcast();
      guest.update(FRAME, now);
      if (hostEngine.screen === "playing" && !hostEngine.isRevealing() && hostEngine.problem && hostEngine.problemId !== pid) {
        pid = hostEngine.problemId;
        hostEngine.answer(0, hostEngine.problem.correct);
      }
      hostEngine.events.length = 0;
      guest.controller.events.length = 0;
    }
    expect(hostEngine.screen).toBe("matchOver");
    expect(guest.controller.screen).toBe("matchOver");
    guest.controller.confirm(); // guest hits Enter on the result screen
    expect(hostEngine.screen).toBe("matchOver"); // host stays put — no remote abandonment
  });

  it("reaction-time fairness survives a delayed transport (guest faster, lands late, still wins)", async () => {
    const { pair, host, hostEngine } = pairOf(80); // 80ms each way
    await host.createGame();
    pair.connect(); // host sees a peer
    // bring the host to "connected" by feeding a delayed hello
    pair.b.send({ v: PROTO, t: "hello", name: "OLIVIER" });
    let now = 0;
    const tick = (ms: number): void => {
      now += ms;
      hostEngine.update(ms, now);
      pair.flush(now);
    };
    for (let i = 0; i < 12 && host.state !== "connected"; i++) tick(FRAME);
    expect(host.state).toBe("connected");

    host.start();
    let guard = 0;
    while (hostEngine.screen !== "playing" && guard++ < 1000) tick(FRAME);
    const pid = hostEngine.problemId;
    const correct = hostEngine.problem ? hostEngine.problem.correct : 0;

    // host reacts in ~480ms on its own clock, opening the settle window
    const startNow = now;
    while (now - startNow < 480) tick(FRAME);
    hostEngine.answer(0, correct);
    expect(hostEngine.isRevealing()).toBe(false);

    // the guest's genuinely-faster 300ms reaction is sent now but delayed 80ms;
    // it must arrive within the settle window and win the stride.
    pair.b.send({ v: PROTO, t: "input", problemId: pid, choice: correct, reactionMs: 300, falseStart: false });
    for (let i = 0; i < 7; i++) tick(FRAME); // ~112ms: delivers the late packet, settle still open
    expect(hostEngine.match.knights[1].strides).toBe(1);
    expect(hostEngine.match.knights[0].strides).toBe(0);
  });
});
