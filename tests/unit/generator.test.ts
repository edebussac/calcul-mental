import { describe, it, expect } from "vitest";
import {
  computeAnswer,
  formatQuestion,
  generateQuestion,
  randInt,
} from "@/lib/game/generator";

/** RNG déterministe : rejoue une séquence fixe de valeurs dans [0, 1). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("randInt", () => {
  it("reste dans les bornes incluses", () => {
    for (let i = 0; i < 500; i++) {
      const v = randInt(1, 10, Math.random);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("mappe l'aléa vers l'entier attendu", () => {
    expect(randInt(1, 10, () => 0.3)).toBe(4);
    expect(randInt(1, 10, () => 0)).toBe(1);
    expect(randInt(1, 10, () => 0.999)).toBe(10);
  });
});

describe("computeAnswer", () => {
  it("calcule chaque opération de base", () => {
    expect(computeAnswer("multiplication", 4, 3)).toBe(12);
    expect(computeAnswer("addition", 4, 3)).toBe(7);
    expect(computeAnswer("subtraction", 4, 3)).toBe(1);
    expect(computeAnswer("division", 12, 3)).toBe(4);
  });
});

describe("generateQuestion — multiplication", () => {
  it("produit des opérandes déterministes avec un rng injecté", () => {
    const q = generateQuestion("multiplication", { rng: seq([0.3, 0.2]) });
    expect(q).toEqual({ a: 4, b: 3, operation: "multiplication", answer: 12 });
  });

  it("garde a et b dans [1, 10] et answer = a × b", () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion("multiplication");
      expect(q.a).toBeGreaterThanOrEqual(1);
      expect(q.a).toBeLessThanOrEqual(10);
      expect(q.b).toBeGreaterThanOrEqual(1);
      expect(q.b).toBeLessThanOrEqual(10);
      expect(q.answer).toBe(q.a * q.b);
    }
  });

  it("respecte des bornes personnalisées", () => {
    for (let i = 0; i < 200; i++) {
      const q = generateQuestion("multiplication", { min: 2, max: 5 });
      expect(q.a).toBeGreaterThanOrEqual(2);
      expect(q.a).toBeLessThanOrEqual(5);
      expect(q.b).toBeGreaterThanOrEqual(2);
      expect(q.b).toBeLessThanOrEqual(5);
    }
  });
});

describe("generateQuestion — soustraction", () => {
  it("ne produit jamais de résultat négatif (a ≥ b)", () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion("subtraction");
      expect(q.a).toBeGreaterThanOrEqual(q.b);
      expect(q.answer).toBe(q.a - q.b);
      expect(q.answer).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("generateQuestion — division", () => {
  it("produit toujours une division entière", () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion("division");
      expect(q.b).toBeGreaterThanOrEqual(1);
      expect(q.a % q.b).toBe(0);
      expect(q.answer).toBe(q.a / q.b);
      expect(Number.isInteger(q.answer)).toBe(true);
    }
  });
});

describe("generateQuestion — aléatoire (all)", () => {
  it("résout `all` vers une opération de base", () => {
    const q = generateQuestion("all", { rng: seq([0, 0.3, 0.2]) });
    expect(q.operation).toBe("multiplication");
    expect(["multiplication", "addition", "subtraction", "division"]).toContain(
      q.operation,
    );
  });
});

describe("formatQuestion", () => {
  it("formate avec le symbole fourni", () => {
    const q = generateQuestion("multiplication", { rng: seq([0.3, 0.2]) });
    expect(formatQuestion(q, "×")).toBe("4 × 3");
  });
});
