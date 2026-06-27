// The wire protocol for online play. Host-authoritative: the host runs the real
// Engine and pushes Snapshots; the guest renders them and sends Inputs back.
// All messages are plain JSON-serializable objects (Trystero / Loopback both
// move them verbatim — no manual encode step needed).
import type { Settings, ScreenName, Attempt, KnightView, EngineEvent, Mode } from "../game/engine";
import type { PlayerId, MatchPhase } from "../game/match";
import type { ChallengeKind } from "../game/problems";

export const PROTO = 1 as const;

export type NetMsg =
  | Hello
  | Welcome
  | SettingsMsg
  | Start
  | Snap
  | Input
  | Confirm
  | Ping
  | Pong
  | Bye;

interface Base {
  v: typeof PROTO;
}

/** guest → host: I'm here, this is my name. */
export interface Hello extends Base {
  t: "hello";
  name: string;
}
/** host → guest: you are player `you` (always 1), here are the agreed settings. */
export interface Welcome extends Base {
  t: "welcome";
  you: PlayerId;
  settings: NetSettings;
}
/** host → guest: the host edited the lobby settings. */
export interface SettingsMsg extends Base {
  t: "settings";
  settings: NetSettings;
}
/** host → guest: the tilt begins — switch from lobby to rendering snapshots. */
export interface Start extends Base {
  t: "start";
  seed: number;
  settings: NetSettings;
}
/** host → guest: the authoritative view this frame. */
export interface Snap extends Base {
  t: "snap";
  seq: number;
  s: Snapshot;
}
/** guest → host: a tap, carrying the guest's OWN reaction time (latency-proof). */
export interface Input extends Base {
  t: "input";
  problemId: number;
  choice: number;
  reactionMs: number;
  falseStart?: boolean;
}
/** guest → host: advance an intro/result veil (advisory; host owns timing). */
export interface Confirm extends Base {
  t: "confirm";
  screen: ScreenName;
}
export interface Ping extends Base {
  t: "ping";
}
export interface Pong extends Base {
  t: "pong";
}
/** either side: I'm leaving / you're turned away. */
export interface Bye extends Base {
  t: "bye";
  reason: "left" | "full";
}

/** The slice of Settings that crosses the wire (mode is always "online"). */
export type NetSettings = Pick<Settings, "difficulty" | "rounds" | "challenge"> & {
  names: [string, string];
  mode: Mode;
};

/** Just the problem fields Arena/UI actually render. */
export interface SnapProblem {
  text: string;
  choices: number[];
  correct: number;
  kind: ChallengeKind;
  revealMs?: number;
}

/** Everything a guest needs to render any in-match screen, flattened. */
export interface Snapshot {
  screen: ScreenName;
  problemId: number;
  /** null = unchanged since last snap (guest keeps its cached problem) OR no problem */
  problem: SnapProblem | null;
  attempts: [Attempt, Attempt];
  /** eased animation values, rendered verbatim — no client-side prediction */
  knights: [KnightView, KnightView];
  exchangeAge: number;
  isRevealing: boolean;
  banner: string;
  lastDamage: number;
  /** delta: engine events produced since the previous snap */
  events: EngineEvent[];
  match: {
    round: number;
    phase: MatchPhase;
    matchWinner: PlayerId | null;
    config: { maxHp: number; stridesToClash: number; rounds: number };
    knights: [{ hp: number; strides: number }, { hp: number; strides: number }];
    results: { winner: PlayerId | null }[];
  };
}

const TYPES = new Set([
  "hello",
  "welcome",
  "settings",
  "start",
  "snap",
  "input",
  "confirm",
  "ping",
  "pong",
  "bye",
]);

/** Defensive guard for anything arriving off the wire from an untrusted peer. */
export function isNetMsg(x: unknown): x is NetMsg {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  return m.v === PROTO && typeof m.t === "string" && TYPES.has(m.t);
}
