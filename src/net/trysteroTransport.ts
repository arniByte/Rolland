// The production transport: WebRTC peer-to-peer via Trystero (no signalling
// server — works from the static Vercel host). This is the ONLY module that
// references Trystero, and it is reached solely through a dynamic import() in
// main.ts, so Vite code-splits it into a lazy chunk and the core game keeps its
// zero-dependency, offline-capable bundle. Trystero itself is fetched from a
// pinned ESM CDN URL at runtime (see TRYSTERO_URL in constants.ts).
//
// NOTE: real WebRTC signalling can't be exercised in the build sandbox (egress
// blocks the trackers), so this path is verified by the owner with a friend; the
// netcode LOGIC is proven headlessly via LoopbackTransport in the test suite.
import type { Transport } from "./transport";
import { isNetMsg, type NetMsg } from "./protocol";

/** Trystero room namespace. */
const APP_ID = "roland-joust";

/**
 * Trystero is loaded lazily from a pinned ESM CDN URL. This keeps Roland at
 * **zero bundled runtime deps** — the core game never imports it and offline
 * local/AI play is untouched. Swap the strategy suffix (`/torrent` → `/nostr`
 * or `/mqtt`) if torrent trackers are blocked on a network. To vendor it
 * instead, replace the URL with the bare specifier `"trystero/torrent"` after
 * `npm i trystero` — the dynamic import below handles either form.
 */
const TRYSTERO_URL = "https://esm.sh/trystero@0.21.5/torrent";

// Structural typing of just the slice of Trystero we use (no dep on its types).
type SendFn = (data: NetMsg, targetPeers?: string | string[]) => void;
type ReceiveFn = (cb: (data: NetMsg, peerId: string) => void) => void;
interface TrysteroRoom {
  makeAction(namespace: string): [SendFn, ReceiveFn, unknown];
  onPeerJoin(cb: (id: string) => void): void;
  onPeerLeave(cb: (id: string) => void): void;
  leave(): void;
}
interface TrysteroModule {
  joinRoom(config: { appId: string }, roomId: string): TrysteroRoom;
  selfId: string;
}

export async function createTrysteroTransport(roomCode: string): Promise<Transport> {
  // A *variable* specifier: tsc treats it as `any` (no module resolution) and
  // @vite-ignore keeps Vite from bundling/resolving it — it stays a runtime
  // import of the CDN URL.
  const url = TRYSTERO_URL;
  const mod = (await import(/* @vite-ignore */ url)) as unknown as TrysteroModule;

  const room = mod.joinRoom({ appId: APP_ID }, roomCode);
  const [sendRaw, onRaw] = room.makeAction("m");

  const msgCbs: ((m: NetMsg, peer: string) => void)[] = [];
  onRaw((data, peerId) => {
    if (isNetMsg(data)) for (const cb of msgCbs) cb(data, peerId);
  });

  return {
    selfId: mod.selfId,
    send: (msg) => sendRaw(msg),
    onMessage: (cb) => {
      msgCbs.push(cb);
    },
    onPeerJoin: (cb) => room.onPeerJoin(cb),
    onPeerLeave: (cb) => room.onPeerLeave(cb),
    close: () => room.leave(),
  };
}
