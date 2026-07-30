/**
 * Niveaux de difficulté.
 *
 * Un niveau n'est qu'une **plage d'opérandes** : plus les nombres sont grands,
 * plus le calcul est dur. Rien d'autre ne change — ni la durée du round, ni les
 * règles de score.
 *
 * ⚠️ Le niveau est enregistré avec chaque partie (`sessions.level`). Modifier
 * une plage rend donc les scores passés incomparables aux nouveaux, au même
 * titre qu'une constante de règles de jeu (cf. MIGRATION-MOBILE.md §4.3).
 * `Facile` reproduit exactement l'ancien comportement (1–10), ce qui garde
 * l'historique d'avant les niveaux comparable aux parties de ce niveau.
 */

import { BASE_OPERATIONS, type BaseOperation, type Operation } from "./operations";

export const LEVELS = [1, 2, 3, 4] as const;

export type Level = (typeof LEVELS)[number];

export interface LevelConfig {
  id: Level;
  label: string;
  /** Borne basse des opérandes (incluse). */
  min: number;
  /** Borne haute des opérandes (incluse). */
  max: number;
}

/**
 * `min` reste à 1 sur les deux premiers niveaux — c'est le comportement
 * historique — puis passe à 2 : à partir de « Difficile », tirer ×1 ou ÷1
 * donnerait une question triviale au milieu de calculs exigeants.
 */
export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  1: { id: 1, label: "Facile", min: 1, max: 10 },
  2: { id: 2, label: "Moyen", min: 1, max: 20 },
  3: { id: 3, label: "Difficile", min: 2, max: 50 },
  4: { id: 4, label: "Légendaire", min: 2, max: 100 },
};

export const DEFAULT_LEVEL: Level = 1;

export function isLevel(value: unknown): value is Level {
  return (LEVELS as readonly unknown[]).includes(Number(value));
}

/** Plage d'opérandes d'un niveau, prête à passer à `generateQuestion`. */
export function levelRange(level: Level): { min: number; max: number } {
  const { min, max } = LEVEL_CONFIG[level];
  return { min, max };
}

/**
 * Plus grande réponse atteignable pour une opération à un niveau donné.
 *
 * Chaque opération a son propre plafond, et ils sont très différents : à
 * `Légendaire`, une multiplication peut valoir 10 000 alors qu'une soustraction
 * ne dépasse jamais 100.
 */
export function maxAnswer(operation: Operation, level: Level): number {
  const { min, max } = levelRange(level);

  const forBase = (base: BaseOperation): number => {
    switch (base) {
      case "multiplication":
        return max * max;
      case "addition":
        return max + max;
      case "subtraction":
        // b ≤ a, donc au mieux a − min.
        return max - min;
      case "division":
        // La réponse EST le quotient, tiré dans la plage.
        return max;
    }
  };

  if (operation === "all") {
    return Math.max(...BASE_OPERATIONS.map(forBase));
  }
  return forBase(operation);
}

/**
 * Nombre de chiffres que la saisie doit accepter.
 *
 * **Dérivé, jamais écrit en dur.** Le banc d'essai web figeait 3 chiffres, ce
 * qui suffisait tant que les opérandes s'arrêtaient à 10 (10 × 10 = 100). À
 * `Légendaire`, une multiplication atteint 10 000 : une borne figée empêcherait
 * purement et simplement de répondre.
 */
export function maxAnswerDigits(operation: Operation, level: Level): number {
  return String(maxAnswer(operation, level)).length;
}
