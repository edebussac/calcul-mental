/**
 * Moteur de session pur : agrège les réponses et suit le nombre de bonnes
 * réponses (= le score) et la série (streak).
 *
 * Le « score » est simplement le nombre de bonnes réponses : pas de points ni
 * de bonus. Sans React ni DB → 100 % testable.
 */

import type { BaseOperation } from "./operations";
import type { Question } from "./generator";

export interface AnswerRecord {
  a: number;
  b: number;
  operation: BaseOperation;
  /** Réponse attendue. */
  expected: number;
  /** Réponse donnée par le joueur. */
  given: number;
  isCorrect: boolean;
  /** Temps de réponse en millisecondes. */
  responseMs: number;
}

export interface SessionState {
  answers: AnswerRecord[];
  /** Série de bonnes réponses consécutives en cours. */
  streak: number;
  /** Meilleure série atteinte durant la session. */
  bestStreak: number;
  /** Nombre de bonnes réponses = le score. */
  correctCount: number;
  totalCount: number;
}

export const initialSession: SessionState = {
  answers: [],
  streak: 0,
  bestStreak: 0,
  correctCount: 0,
  totalCount: 0,
};

export interface SubmitInput {
  question: Question;
  given: number;
  responseMs: number;
}

/**
 * Enregistre une réponse et renvoie un NOUVEL état (immuable).
 * Bonne réponse → +1 au score et série +1 ; mauvaise → série remise à 0.
 */
export function recordAnswer(
  state: SessionState,
  { question, given, responseMs }: SubmitInput,
): SessionState {
  const isCorrect = given === question.answer;
  const streak = isCorrect ? state.streak + 1 : 0;

  const record: AnswerRecord = {
    a: question.a,
    b: question.b,
    operation: question.operation,
    expected: question.answer,
    given,
    isCorrect,
    responseMs,
  };

  return {
    answers: [...state.answers, record],
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correctCount: state.correctCount + (isCorrect ? 1 : 0),
    totalCount: state.totalCount + 1,
  };
}

/** Précision en pourcentage (0–100), 0 si aucune réponse. */
export function accuracy(state: SessionState): number {
  if (state.totalCount === 0) return 0;
  return Math.round((state.correctCount / state.totalCount) * 100);
}
