// In-process transport pair for tests (and a potential same-tab dev mirror).
// Models latency on a virtual clock so the reaction-fairness case is fully
// deterministic: with delayMs>0, messages are held until `flush(now)` reaches
// their due time, so a guest's faster reaction can demonstrably arrive *after*
// the host's local answer yet still win.
import type { Transport } from "./transport";
import type { NetMsg } from "./protocol";

type MsgCb = (m: NetMsg, peer: string) => void;
type IdCb = (id: string) => void;
type Side = "a" | "b";

class LoopbackEnd implements Transport {
  readonly msgCbs: MsgCb[] = [];
  readonly joinCbs: IdCb[] = [];
  readonly leaveCbs: IdCb[] = [];
  constructor(
    readonly selfId: string,
    private hub: Hub,
    private side: Side,
  ) {}
  send(msg: NetMsg): void {
    this.hub.enqueue(this.side, msg);
  }
  onMessage(cb: MsgCb): void {
    this.msgCbs.push(cb);
  }
  onPeerJoin(cb: IdCb): void {
    this.joinCbs.push(cb);
  }
  onPeerLeave(cb: IdCb): void {
    this.leaveCbs.push(cb);
  }
  close(): void {
    this.hub.leave(this.side);
  }
}

class Hub {
  clock = 0;
  a!: LoopbackEnd;
  b!: LoopbackEnd;
  private q: { dst: Side; msg: NetMsg; dueAt: number }[] = [];

  constructor(public delay: number) {}

  enqueue(from: Side, msg: NetMsg): void {
    const dst: Side = from === "a" ? "b" : "a";
    if (this.delay <= 0) {
      this.deliver(dst, msg);
      return;
    }
    this.q.push({ dst, msg, dueAt: this.clock + this.delay });
  }

  flush(now: number): void {
    this.clock = now;
    const ready = this.q.filter((e) => e.dueAt <= now);
    this.q = this.q.filter((e) => e.dueAt > now);
    for (const e of ready) this.deliver(e.dst, e.msg);
  }

  private deliver(dst: Side, msg: NetMsg): void {
    const end = dst === "a" ? this.a : this.b;
    const peer = dst === "a" ? this.b.selfId : this.a.selfId;
    for (const cb of end.msgCbs) cb(msg, peer);
  }

  connect(): void {
    for (const cb of this.a.joinCbs) cb(this.b.selfId);
    for (const cb of this.b.joinCbs) cb(this.a.selfId);
  }

  leave(side: Side): void {
    const other = side === "a" ? this.b : this.a;
    const goneId = side === "a" ? this.a.selfId : this.b.selfId;
    for (const cb of other.leaveCbs) cb(goneId);
  }
}

export interface LoopbackPair {
  a: Transport;
  b: Transport;
  /** fire the mutual peer-join that kicks off the handshake */
  connect(): void;
  /** deliver messages whose virtual delay has elapsed by `now` (delayed mode) */
  flush(now: number): void;
}

export function loopbackPair(delayMs = 0, ids: [string, string] = ["peerA", "peerB"]): LoopbackPair {
  const hub = new Hub(delayMs);
  hub.a = new LoopbackEnd(ids[0], hub, "a");
  hub.b = new LoopbackEnd(ids[1], hub, "b");
  return {
    a: hub.a,
    b: hub.b,
    connect: () => hub.connect(),
    flush: (now) => hub.flush(now),
  };
}
