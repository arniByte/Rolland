// The render/command seam. Arena + UI depend on these interfaces, NOT on the
// concrete Engine. The host's `Engine` implements `GameController`; the guest's
// `RemoteView` (src/net/remoteView.ts) mirrors the same surface from snapshots.
// This is what makes online play possible without forking the renderer.
import type { ScreenName, Settings, Attempt, KnightView, EngineEvent } from "./engine";
import type { MatchState, PlayerId } from "./match";
import type { Problem, ChallengeKind } from "./problems";

/** Read-only surface that Arena + UI consume. Engine and RemoteView both satisfy it. */
export interface GameView {
  readonly screen: ScreenName;
  readonly settings: Settings;
  readonly match: MatchState;
  readonly problem: Problem | null;
  readonly attempts: readonly [Attempt, Attempt];
  readonly knights: readonly [KnightView, KnightView];
  readonly exchangeAge: number;
  readonly banner: string;
  readonly lastDamage: number;
  /** MUTABLE on purpose — the renderer drains it via `events.length = 0`. */
  readonly events: EngineEvent[];
  isRevealing(): boolean;
}

/** Command surface UI/input call. Online maps everything to the LOCAL player. */
export interface GameController extends GameView {
  /** host / local2p / ai = 0; online guest = 1 */
  readonly localPlayer: PlayerId;
  answer(player: PlayerId, choice: number): void;
  /** sugar for `answer(localPlayer, choice)` — the only call pads make online */
  answerLocal(choice: number): void;
  confirm(): void;
  back(): void;
  pickTrial(kind: ChallengeKind): void;
  startMatch(): void;
}
