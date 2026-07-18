/**
 * Moteur de session pur : agrège les réponses, calcule série (streak) et score.
 *
 * Sans React ni DB → 100 % testable. L'UI appelle `recordAnswer` à chaque
 * validation et lit l'état renvoyé ; la persistance sérialise `AnswerRecord[]`.
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
  correctCount: number;
  totalCount: number;
  score: number;
}

export const POINTS_PER_CORRECT = 10;
export const STREAK_BONUS_STEP = 2;

export const initialSession: SessionState = {
  answers: [],
  streak: 0,
  bestStreak: 0,
  correctCount: 0,
  totalCount: 0,
  score: 0,
};

/** Points gagnés pour une bonne réponse selon la nouvelle valeur de série. */
export function pointsForCorrect(newStreak: number): number {
  return POINTS_PER_CORRECT + (newStreak - 1) * STREAK_BONUS_STEP;
}

export interface SubmitInput {
  question: Question;
  given: number;
  responseMs: number;
}

/**
 * Enregistre une réponse et renvoie un NOUVEL état (immuable).
 * Bonne réponse → série +1 et points bonifiés ; mauvaise → série remise à 0.
 */
export function recordAnswer(
  state: SessionState,
  { question, given, responseMs }: SubmitInput,
): SessionState {
  const isCorrect = given === question.answer;
  const streak = isCorrect ? state.streak + 1 : 0;
  const gained = isCorrect ? pointsForCorrect(streak) : 0;

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
    score: state.score + gained,
  };
}

/** Précision en pourcentage (0–100), 0 si aucune réponse. */
export function accuracy(state: SessionState): number {
  if (state.totalCount === 0) return 0;
  return Math.round((state.correctCount / state.totalCount) * 100);
}
