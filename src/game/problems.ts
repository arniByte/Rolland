import { Rng } from "./rng";

export type Op = "+" | "-" | "×"; // ×
export type Difficulty = "squire" | "knight" | "champion";

export interface Problem {
  /** rendered prompt, e.g. "7 × 8" */
  readonly text: string;
  readonly a: number;
  readonly b: number;
  readonly op: Op;
  readonly answer: number;
  /** four answer options; exactly one equals `answer` */
  readonly choices: readonly number[];
  /** index into `choices` of the correct one */
  readonly correct: number;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  squire: "SQUIRE",
  knight: "KNIGHT",
  champion: "CHAMPION",
};

interface OpRange {
  ops: Op[];
  addMax: number; // operands for + and -
  mulMax: number; // operands for ×
}

const RANGES: Record<Difficulty, OpRange> = {
  squire: { ops: ["+", "-"], addMax: 20, mulMax: 0 },
  knight: { ops: ["+", "-", "×"], addMax: 60, mulMax: 12 },
  champion: { ops: ["+", "-", "×"], addMax: 100, mulMax: 20 },
};

function compute(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
  }
}

/** Build a single arithmetic problem with 4 plausible, distinct choices. */
export function genProblem(rng: Rng, difficulty: Difficulty): Problem {
  const r = RANGES[difficulty];
  const op = rng.pick(r.ops);

  let a: number;
  let b: number;
  if (op === "×") {
    a = rng.int(2, r.mulMax);
    b = rng.int(2, r.mulMax);
  } else if (op === "-") {
    // keep the result non-negative for friendlier mental math
    a = rng.int(1, r.addMax);
    b = rng.int(0, a);
  } else {
    a = rng.int(1, r.addMax);
    b = rng.int(1, r.addMax);
  }

  const answer = compute(a, b, op);
  const choices = buildChoices(rng, answer, op, a, b);
  const correct = choices.indexOf(answer);

  return {
    text: `${a} ${op} ${b}`,
    a,
    b,
    op,
    answer,
    choices,
    correct,
  };
}

/** Distractors are deliberately "near misses" so guessing is risky. */
function buildChoices(rng: Rng, answer: number, op: Op, a: number, b: number): number[] {
  const set = new Set<number>([answer]);

  const candidates: number[] = [
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
    answer + 10,
    answer - 10,
    // operation slips
    op === "×" ? a * b + a : a + b,
    op === "×" ? a * b - b : Math.abs(a - b),
    op === "+" ? a - b : a + b,
    // digit transposition for two-digit answers
    transpose(answer),
  ];

  const shuffled = rng.shuffle(candidates);
  for (const c of shuffled) {
    if (set.size >= 4) break;
    if (c >= 0 && c !== answer && !set.has(c)) set.add(c);
  }
  // top up if we still lack four (small answers)
  let pad = 1;
  while (set.size < 4) {
    const c = answer + pad;
    if (c >= 0 && !set.has(c)) set.add(c);
    pad = pad > 0 ? -pad : -pad + 1;
  }

  return rng.shuffle([...set]);
}

function transpose(n: number): number {
  const s = String(n);
  if (s.length < 2) return n + 11;
  const arr = s.split("");
  [arr[0], arr[1]] = [arr[1] as string, arr[0] as string];
  return parseInt(arr.join(""), 10);
}
