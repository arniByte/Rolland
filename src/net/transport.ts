import type { RemoteSub } from "../game/engine";
import type { ChallengeKind, Difficulty } from "../game/problems";

// Wire format. Tiny JSON messages over a reliable ordered channel.
export type NetMessage =
  | {
      t: "start";
      seed: number;
      challenge: ChallengeKind;
      rounds: number;
      difficulty: Difficulty;
      names: [string, string];
    }
  | { t: "input"; sub: RemoteSub }
  | { t: "rematch"; seed: number }
  | { t: "bye" };

export interface Transport {
  /** the creator of the room is the host (= player 0) */
  readonly isHost: boolean;
  send(m: NetMessage): void;
  onMessage(cb: (m: NetMessage) => void): void;
  /** connection state of the (single) peer */
  onPeer(cb: (connected: boolean) => void): void;
  close(): void;
}

/**
 * Two in-process endpoints wired to each other — used for deterministic tests
 * (and as a reference impl). Messages deliver asynchronously like a real link.
 */
export function makeLoopback(): [Transport, Transport] {
  let aMsg: ((m: NetMessage) => void) | null = null;
  let bMsg: ((m: NetMessage) => void) | null = null;
  let aPeer: ((c: boolean) => void) | null = null;
  let bPeer: ((c: boolean) => void) | null = null;
  const defer = (fn: () => void): void => {
    void Promise.resolve().then(fn);
  };

  const a: Transport = {
    isHost: true,
    send: (m) => defer(() => bMsg?.(m)),
    onMessage: (cb) => {
      aMsg = cb;
    },
    onPeer: (cb) => {
      aPeer = cb;
    },
    close: () => {},
  };
  const b: Transport = {
    isHost: false,
    send: (m) => defer(() => aMsg?.(m)),
    onMessage: (cb) => {
      bMsg = cb;
    },
    onPeer: (cb) => {
      bPeer = cb;
    },
    close: () => {},
  };
  defer(() => {
    aPeer?.(true);
    bPeer?.(true);
  });
  return [a, b];
}
