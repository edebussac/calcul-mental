import { describe, it, expect } from "vitest";
import {
  ADAPTIVE_PARAMS,
  analyzeFacts,
  buildFactPool,
  confidence,
  difficulty,
  emaResponseMs,
  factKey,
  factToQuestion,
  multiplicationFacts,
  pickFact,
  reviewNeed,
  type FactStat,
} from "@/lib/game/adaptive";

/** RNG déterministe rejouant une séquence. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const weightOf = (pool: { a: number; b: number; weight: number }[], a: number, b: number) =>
  pool.find((f) => factKey(f.a, f.b) === factKey(a, b))!.weight;

describe("helpers", () => {
  it("multiplicationFacts = 55 paires non ordonnées", () => {
    const facts = multiplicationFacts();
    expect(facts).toHaveLength(55);
    expect(facts.every((f) => f.a <= f.b)).toBe(true);
  });

  it("emaResponseMs privilégie les tentatives récentes", () => {
    // Récent lent (5000) doit tirer la moyenne au-dessus du simple avg.
    const rt = emaResponseMs([5000, 1000, 1000], 0.6)!;
    expect(rt).toBeGreaterThan((5000 + 1000 + 1000) / 3);
    expect(emaResponseMs([], 0.6)).toBeNull();
  });

  it("confidence croît avec n", () => {
    expect(confidence(0, 5)).toBe(0);
    expect(confidence(1, 5)).toBeLessThan(confidence(20, 5));
    expect(confidence(20, 5)).toBeGreaterThan(0.9);
  });

  it("difficulty borne 0..1", () => {
    expect(difficulty(1000, 1500, 6000)).toBe(0);
    expect(difficulty(6000, 1500, 6000)).toBe(1);
    expect(difficulty(3750, 1500, 6000)).toBeCloseTo(0.5, 5);
  });

  it("reviewNeed : 0 si jamais vu, croît avec le délai", () => {
    expect(reviewNeed(undefined, 10)).toBe(0);
    expect(reviewNeed(10, 10)).toBeCloseTo(0.5, 5);
    expect(reviewNeed(30, 10)).toBeGreaterThan(reviewNeed(10, 10));
  });
});

describe("buildFactPool", () => {
  it("pondère plus fort un fait lent qu'un fait rapide", () => {
    const stats: FactStat[] = [
      { a: 2, b: 2, recentMs: Array(8).fill(1000) }, // rapide
      { a: 3, b: 3, recentMs: Array(8).fill(6000) }, // lent
    ];
    const pool = buildFactPool(stats, ADAPTIVE_PARAMS, [
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    expect(weightOf(pool, 3, 3)).toBeGreaterThan(weightOf(pool, 2, 2));
  });

  it("confiance : un fait lent vu 1 fois pèse moins que vu 20 fois", () => {
    const stats: FactStat[] = [
      { a: 2, b: 2, recentMs: [6000] }, // n=1
      { a: 3, b: 3, recentMs: Array(20).fill(6000) }, // n=20
    ];
    const pool = buildFactPool(stats, ADAPTIVE_PARAMS, [
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    expect(weightOf(pool, 3, 3)).toBeGreaterThan(weightOf(pool, 2, 2));
  });

  it("introduit les faits jamais vus (poids > plancher)", () => {
    const pool = buildFactPool([], ADAPTIVE_PARAMS, [{ a: 7, b: 8 }]);
    expect(weightOf(pool, 7, 8)).toBeGreaterThan(ADAPTIVE_PARAMS.floor);
  });

  it("borne le ratio des poids à ratioMax", () => {
    const stats: FactStat[] = [
      { a: 2, b: 2, recentMs: Array(20).fill(300) }, // très rapide
      { a: 9, b: 9, recentMs: Array(20).fill(9000) }, // très lent
      { a: 3, b: 4, recentMs: Array(20).fill(4000) },
      { a: 5, b: 6, recentMs: Array(20).fill(2000) },
      { a: 7, b: 8, recentMs: Array(20).fill(5000) },
    ];
    const pool = buildFactPool(stats);
    const weights = pool.map((f) => f.weight);
    const ratio = Math.max(...weights) / Math.min(...weights);
    expect(ratio).toBeLessThanOrEqual(ADAPTIVE_PARAMS.ratioMax + 1e-9);
    expect(Math.min(...weights)).toBeGreaterThan(0);
  });
});

describe("pickFact", () => {
  const pool = [
    { a: 2, b: 2, weight: 1 },
    { a: 3, b: 3, weight: 9 },
  ];

  it("échantillonne proportionnellement au poids (rng contrôlé)", () => {
    // jitter neutralisé (0,5 → facteur 1) puis sélection.
    // total=10 ; r=0,05*10=0,5 < 1 → premier fait.
    expect(pickFact(pool, seq([0.5, 0.5, 0.05]))).toEqual({ a: 2, b: 2 });
    // r=0,5*10=5 → dépasse 1, tombe dans le second.
    expect(pickFact(pool, seq([0.5, 0.5, 0.5]))).toEqual({ a: 3, b: 3 });
  });

  it("exclut les faits récemment posés", () => {
    const got = pickFact(pool, seq([0.5, 0.5, 0.99]), [factKey(3, 3)]);
    expect(got).toEqual({ a: 2, b: 2 });
  });
});

describe("factToQuestion", () => {
  it("construit une multiplication correcte, ordre randomisé", () => {
    const q1 = factToQuestion({ a: 3, b: 7 }, () => 0.9); // pas de swap
    expect(q1).toMatchObject({ a: 3, b: 7, operation: "multiplication", answer: 21 });
    const q2 = factToQuestion({ a: 3, b: 7 }, () => 0.1); // swap
    expect(q2).toMatchObject({ a: 7, b: 3, answer: 21 });
  });
});

describe("analyzeFacts", () => {
  it("classe du moins au mieux maîtrisé (lent d'abord)", () => {
    const stats: FactStat[] = [
      { a: 2, b: 2, recentMs: Array(8).fill(1000) }, // rapide
      { a: 3, b: 3, recentMs: Array(8).fill(6000) }, // lent
      { a: 4, b: 4, recentMs: Array(8).fill(3500) }, // moyen
    ];
    const ranked = analyzeFacts(stats);
    expect(ranked.map((f) => factKey(f.a, f.b))).toEqual([
      factKey(3, 3),
      factKey(4, 4),
      factKey(2, 2),
    ]);
    expect(ranked[0].difficulty).toBeGreaterThan(ranked[2].difficulty);
  });

  it("exclut les faits jamais tentés", () => {
    const stats: FactStat[] = [{ a: 2, b: 2, recentMs: [1000] }];
    const ranked = analyzeFacts(stats);
    expect(ranked).toHaveLength(1);
  });

  it("à temps égal, départage par confiance (n=20 avant n=1)", () => {
    const stats: FactStat[] = [
      { a: 2, b: 2, recentMs: [6000] }, // lent mais 1 seule fois
      { a: 3, b: 3, recentMs: Array(20).fill(6000) }, // lent, confirmé
    ];
    const ranked = analyzeFacts(stats);
    expect(factKey(ranked[0].a, ranked[0].b)).toBe(factKey(3, 3));
    expect(ranked[0].attempts).toBe(20);
    expect(ranked[1].attempts).toBe(1);
  });

  it("le temps prime sur la confiance : un temps plus lent passe devant, même avec moins d'essais", () => {
    const stats: FactStat[] = [
      { a: 5, b: 5, recentMs: [8000] }, // très lent, n=1 (peu fiable)
      { a: 6, b: 6, recentMs: Array(20).fill(2000) }, // rapide, n=20 (très fiable)
    ];
    const ranked = analyzeFacts(stats);
    // Le temps (8000 > 2000) l'emporte sur la confiance : 5×5 devant.
    expect(factKey(ranked[0].a, ranked[0].b)).toBe(factKey(5, 5));
  });

  it("renvoie une liste vide sans données", () => {
    expect(analyzeFacts([])).toEqual([]);
  });
});
