import { describe, it, expect } from "vitest";
import {
  accuracy,
  initialSession,
  recordAnswer,
  type SessionState,
} from "@/lib/game/engine";
import type { Question } from "@/lib/game/generator";

const q = (a: number, b: number): Question => ({
  a,
  b,
  operation: "multiplication",
  answer: a * b,
});

/** Applique une suite de réponses (given) à partir de l'état initial. */
function play(steps: Array<{ q: Question; given: number }>): SessionState {
  return steps.reduce(
    (state, step) =>
      recordAnswer(state, { question: step.q, given: step.given, responseMs: 1000 }),
    initialSession,
  );
}

describe("recordAnswer", () => {
  it("est immuable (ne mute pas l'état d'entrée)", () => {
    const before = initialSession;
    recordAnswer(before, { question: q(4, 3), given: 12, responseMs: 500 });
    expect(before).toEqual(initialSession);
    expect(before.answers).toHaveLength(0);
  });

  it("compte une bonne réponse et enregistre le détail", () => {
    const state = play([{ q: q(4, 3), given: 12 }]);
    expect(state.correctCount).toBe(1);
    expect(state.totalCount).toBe(1);
    expect(state.answers[0]).toMatchObject({
      a: 4,
      b: 3,
      operation: "multiplication",
      expected: 12,
      given: 12,
      isCorrect: true,
    });
  });

  it("marque une mauvaise réponse et remet la série à zéro", () => {
    const state = play([
      { q: q(2, 2), given: 4 },
      { q: q(3, 3), given: 9 },
      { q: q(4, 4), given: 15 }, // faux
    ]);
    expect(state.correctCount).toBe(2);
    expect(state.totalCount).toBe(3);
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(2);
    expect(state.answers[2].isCorrect).toBe(false);
  });

  it("suit la meilleure série même après une coupure", () => {
    const state = play([
      { q: q(1, 1), given: 1 },
      { q: q(2, 2), given: 4 },
      { q: q(3, 3), given: 9 },
      { q: q(4, 4), given: 0 }, // faux → reset
      { q: q(5, 5), given: 25 },
    ]);
    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(3);
  });
});

describe("score = nombre de bonnes réponses", () => {
  it("compte 1 par bonne réponse, 0 pour une mauvaise", () => {
    const state = play([
      { q: q(2, 2), given: 4 }, // ok
      { q: q(3, 3), given: 9 }, // ok
      { q: q(4, 4), given: 15 }, // faux
      { q: q(5, 5), given: 25 }, // ok
    ]);
    expect(state.correctCount).toBe(3);
    expect(state.totalCount).toBe(4);
  });
});

describe("accuracy", () => {
  it("vaut 0 sans réponse", () => {
    expect(accuracy(initialSession)).toBe(0);
  });

  it("calcule un pourcentage arrondi", () => {
    const state = play([
      { q: q(2, 2), given: 4 },
      { q: q(3, 3), given: 0 },
      { q: q(4, 4), given: 16 },
    ]);
    expect(accuracy(state)).toBe(67);
  });
});
