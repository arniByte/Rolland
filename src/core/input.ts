import type { PlayerId } from "../game/match";

export interface AnswerIntent {
  player: PlayerId;
  choice: number; // 0..3
}

// Physical key codes (layout-independent) -> answer intents.
// P0 (left): A S D F  and  1 2 3 4
// P1 (right): J K L ;  and  7 8 9 0
const KEYMAP: Record<string, AnswerIntent> = {
  KeyA: { player: 0, choice: 0 },
  KeyS: { player: 0, choice: 1 },
  KeyD: { player: 0, choice: 2 },
  KeyF: { player: 0, choice: 3 },
  Digit1: { player: 0, choice: 0 },
  Digit2: { player: 0, choice: 1 },
  Digit3: { player: 0, choice: 2 },
  Digit4: { player: 0, choice: 3 },
  Numpad1: { player: 0, choice: 0 },
  Numpad2: { player: 0, choice: 1 },
  Numpad3: { player: 0, choice: 2 },
  Numpad4: { player: 0, choice: 3 },

  KeyJ: { player: 1, choice: 0 },
  KeyK: { player: 1, choice: 1 },
  KeyL: { player: 1, choice: 2 },
  Semicolon: { player: 1, choice: 3 },
  Digit7: { player: 1, choice: 0 },
  Digit8: { player: 1, choice: 1 },
  Digit9: { player: 1, choice: 2 },
  Digit0: { player: 1, choice: 3 },
};

export interface InputHandlers {
  onAnswer: (intent: AnswerIntent) => void;
  onConfirm: () => void; // Enter / Space — advance intros & results
  onBack: () => void; // Escape
}

export function attachKeyboard(handlers: InputHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === "Enter" || e.code === "Space") {
      handlers.onConfirm();
      e.preventDefault();
      return;
    }
    if (e.code === "Escape") {
      handlers.onBack();
      e.preventDefault();
      return;
    }
    const intent = KEYMAP[e.code];
    if (intent) {
      handlers.onAnswer(intent);
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

/** Hint strings shown on the answer buttons per player (desktop). */
export const KEY_HINTS: readonly [readonly string[], readonly string[]] = [
  ["A", "S", "D", "F"],
  ["J", "K", "L", ";"],
];
