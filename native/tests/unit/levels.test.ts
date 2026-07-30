import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEVEL,
  LEVELS,
  LEVEL_CONFIG,
  isLevel,
  levelRange,
  maxAnswer,
  maxAnswerDigits,
  type Level,
} from "@/lib/game/levels";
import { generateQuestion } from "@/lib/game/generator";
import { BASE_OPERATIONS } from "@/lib/game/operations";

describe("plages de niveaux", () => {
  it("va de 1–10 à 1–100, en s'élargissant à chaque palier", () => {
    expect(levelRange(1)).toEqual({ min: 1, max: 10 });
    expect(levelRange(4).max).toBe(100);

    const maxima = LEVELS.map((l) => LEVEL_CONFIG[l].max);
    const croissant = maxima.every((m, i) => i === 0 || m > maxima[i - 1]);
    expect(croissant).toBe(true);
  });

  it("garde Facile identique au comportement d'avant les niveaux", () => {
    // Le générateur avait `min = 1, max = 10` par défaut. Si cette plage
    // changeait, les scores d'avant les niveaux deviendraient incomparables.
    expect(levelRange(DEFAULT_LEVEL)).toEqual({ min: 1, max: 10 });
  });

  it("reconnaît les niveaux valides et rejette le reste", () => {
    expect(isLevel(1)).toBe(true);
    expect(isLevel(4)).toBe(true);
    expect(isLevel("3")).toBe(true); // vient de l'URL, donc en texte
    expect(isLevel(0)).toBe(false);
    expect(isLevel(5)).toBe(false);
    expect(isLevel("bonjour")).toBe(false);
    expect(isLevel(undefined)).toBe(false);
  });
});

describe("plafond des réponses", () => {
  it("dépend de l'opération, pas seulement du niveau", () => {
    // À Légendaire (2–100) les plafonds n'ont rien à voir entre eux.
    expect(maxAnswer("multiplication", 4)).toBe(10_000);
    expect(maxAnswer("addition", 4)).toBe(200);
    expect(maxAnswer("division", 4)).toBe(100);
    expect(maxAnswer("subtraction", 4)).toBe(98);
  });

  it("retient le plus large des plafonds pour Aléatoire", () => {
    expect(maxAnswer("all", 4)).toBe(maxAnswer("multiplication", 4));
  });

  it("donne 3 chiffres à Facile, comme la constante figée d'avant", () => {
    // Le banc d'essai web codait MAX_ANSWER_DIGITS = 3 en dur.
    expect(maxAnswerDigits("multiplication", 1)).toBe(3);
  });

  it("donne 5 chiffres à Légendaire — une borne figée bloquerait la saisie", () => {
    expect(maxAnswerDigits("multiplication", 4)).toBe(5);
  });
});

describe("cohérence avec le générateur", () => {
  /** Générateur déterministe : parcourt [0,1) pour couvrir toute la plage. */
  const sweepRng = () => {
    let i = 0;
    const steps = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 0.999];
    return () => steps[i++ % steps.length];
  };

  it("ne produit jamais une réponse plus longue que ce qui est saisissable", () => {
    for (const level of LEVELS) {
      for (const operation of BASE_OPERATIONS) {
        const rng = sweepRng();
        const limite = maxAnswerDigits(operation, level);
        for (let n = 0; n < 200; n++) {
          const q = generateQuestion(operation, {
            ...levelRange(level),
            rng,
          });
          expect(String(q.answer).length).toBeLessThanOrEqual(limite);
        }
      }
    }
  });

  it("respecte les bornes du niveau sur les opérandes", () => {
    for (const level of LEVELS) {
      const { min, max } = levelRange(level);
      const rng = sweepRng();
      for (let n = 0; n < 200; n++) {
        const q = generateQuestion("multiplication", { min, max, rng });
        expect(q.a).toBeGreaterThanOrEqual(min);
        expect(q.a).toBeLessThanOrEqual(max);
        expect(q.b).toBeGreaterThanOrEqual(min);
        expect(q.b).toBeLessThanOrEqual(max);
      }
    }
  });

  it("garde des réponses entières et positives à tous les niveaux", () => {
    for (const level of LEVELS) {
      for (const operation of BASE_OPERATIONS) {
        const rng = sweepRng();
        for (let n = 0; n < 200; n++) {
          const q = generateQuestion(operation, { ...levelRange(level), rng });
          expect(Number.isInteger(q.answer)).toBe(true);
          expect(q.answer).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("libellés", () => {
  it("nomme les quatre niveaux de la maquette", () => {
    const labels = LEVELS.map((l: Level) => LEVEL_CONFIG[l].label);
    expect(labels).toEqual(["Facile", "Moyen", "Difficile", "Légendaire"]);
  });
});
