/**
 * Génération pure des questions de calcul mental.
 *
 * Toutes les fonctions sont déterministes si on injecte un `rng` : c'est ce qui
 * rend les tests unitaires simples et fiables (pas de hasard non maîtrisé).
 */

import {
  BASE_OPERATIONS,
  OPERATION_CONFIG,
  type BaseOperation,
  type Operation,
} from "./operations";

export interface Question {
  a: number;
  b: number;
  /** L'opération concrète (jamais `all` : elle est résolue en une opération de base). */
  operation: BaseOperation;
  /** La bonne réponse. */
  answer: number;
}

export interface GeneratorOptions {
  /** Borne basse des opérandes (inclus). Défaut 1. */
  min?: number;
  /** Borne haute des opérandes (inclus). Défaut 10. */
  max?: number;
  /** Source d'aléa injectable, renvoie un nombre dans [0, 1). Défaut `Math.random`. */
  rng?: () => number;
}

/** Entier aléatoire dans [min, max] (bornes incluses). */
export function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Calcule la réponse attendue pour une opération de base donnée. */
export function computeAnswer(
  operation: BaseOperation,
  a: number,
  b: number,
): number {
  switch (operation) {
    case "multiplication":
      return a * b;
    case "addition":
      return a + b;
    case "subtraction":
      return a - b;
    case "division":
      return a / b;
  }
}

/**
 * Génère une question. Pour `all`, une opération de base est tirée au sort.
 * Les opérandes sont contraintes pour garantir des réponses entières et
 * positives (soustraction : a ≥ b ; division : a multiple de b).
 */
export function generateQuestion(
  operation: Operation,
  options: GeneratorOptions = {},
): Question {
  const { min = 1, max = 10, rng = Math.random } = options;

  const resolved: BaseOperation =
    operation === "all"
      ? BASE_OPERATIONS[randInt(0, BASE_OPERATIONS.length - 1, rng)]
      : operation;

  switch (resolved) {
    case "multiplication":
    case "addition": {
      const a = randInt(min, max, rng);
      const b = randInt(min, max, rng);
      return { a, b, operation: resolved, answer: computeAnswer(resolved, a, b) };
    }
    case "subtraction": {
      const a = randInt(min, max, rng);
      const b = randInt(min, a, rng); // b ≤ a → résultat ≥ 0
      return { a, b, operation: resolved, answer: a - b };
    }
    case "division": {
      // On construit a = b × quotient pour garantir une division entière.
      const divisorMin = Math.max(1, min); // pas de division par 0
      const b = randInt(divisorMin, max, rng);
      const quotient = randInt(min, max, rng);
      const a = b * quotient;
      return { a, b, operation: resolved, answer: quotient };
    }
  }
}

/**
 * Nombre de tirages tentés pour éviter de répéter une réponse. Au-delà, on
 * garde le dernier : mieux vaut une répétition qu'une boucle sans fin, et
 * chaque opération dispose de bien assez de réponses distinctes pour que ce
 * plafond ne soit jamais atteint en pratique.
 */
export const MAX_DRAW_ATTEMPTS = 8;

/**
 * Tire une question dont la réponse DIFFÈRE de la précédente.
 *
 * Deux raisons de ne pas enchaîner deux fois le même résultat :
 * le résultat qu'on vient de trouver reste affiché quelques instants à l'écran
 * (écho), donc une question qui a la même réponse est simplement donnée ; et
 * enchaîner 3×4 puis 4×3 fait répéter sans rien faire travailler.
 *
 * Le tirage est injecté, ce qui rend la règle testable sans hasard : elle vaut
 * aussi bien pour le tirage aléatoire que pour le tirage adaptatif.
 */
export function drawDistinctQuestion(
  draw: () => Question,
  previousAnswer: number | null,
  maxAttempts: number = MAX_DRAW_ATTEMPTS,
): Question {
  let question = draw();
  for (let i = 1; i < maxAttempts && question.answer === previousAnswer; i++) {
    question = draw();
  }
  return question;
}

/** Représentation lisible d'une question, ex. "4 × 3". */
export function formatQuestion(question: Question, symbol: string): string {
  return `${question.a} ${symbol} ${question.b}`;
}

/**
 * Énoncé à **prononcer**, ex. « 10 fois 9 ».
 *
 * Contrairement à `formatQuestion`, le symbole n'est pas injecté : il est lu
 * sur `question.operation`. C'est délibéré. L'appelant qui compose l'affichage
 * dispose légitimement du symbole de l'opération *choisie* (`all` en mode
 * aléatoire) ; le faire passer ici ferait prononcer « 7 ? 8 » à chaque question
 * de ce mode. La question, elle, porte toujours son opération résolue.
 *
 * Reste du TypeScript pur — donc testable sous Node, sans moteur vocal.
 */
export function spokenQuestion(question: Question): string {
  const { spokenSymbol } = OPERATION_CONFIG[question.operation];
  return `${question.a} ${spokenSymbol} ${question.b}`;
}
