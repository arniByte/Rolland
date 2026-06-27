// The transport seam. Netcode logic depends only on this — never on Trystero —
// so the whole protocol is exercised in-process via LoopbackTransport (tests),
// and prod just swaps in TrysteroTransport. Zero dependencies live here.
import type { NetMsg } from "./protocol";

export interface Transport {
  /** stable id for this peer (used only for deterministic host tie-breaks) */
  readonly selfId: string;
  send(msg: NetMsg): void;
  /** messages from the OTHER peer (already validated upstream is the caller's job) */
  onMessage(cb: (m: NetMsg, peer: string) => void): void;
  onPeerJoin(cb: (id: string) => void): void;
  onPeerLeave(cb: (id: string) => void): void;
  close(): void;
}
