/**
 * Validation/parsing des payloads d'API, sans dépendance externe.
 * Isolé ici pour être testable unitairement et réutilisable par les routes.
 */

import type { SaveSessionInput } from "@/lib/services/sessions";
import type { AnswerRecord } from "@/lib/game/engine";
import { isBaseOperation, isOperation } from "@/lib/game/operations";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseAnswer(raw: unknown): AnswerRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(a.a) ||
    !isFiniteNumber(a.b) ||
    !isFiniteNumber(a.expected) ||
    !isFiniteNumber(a.given) ||
    !isFiniteNumber(a.responseMs) ||
    typeof a.isCorrect !== "boolean" ||
    typeof a.operation !== "string" ||
    !isBaseOperation(a.operation)
  ) {
    return null;
  }
  return {
    a: a.a,
    b: a.b,
    operation: a.operation,
    expected: a.expected,
    given: a.given,
    isCorrect: a.isCorrect,
    responseMs: a.responseMs,
  };
}

/**
 * Valide un corps de requête `POST /api/sessions`.
 * Renvoie l'entrée typée, ou `null` si le payload est invalide.
 */
export function parseSaveSessionInput(body: unknown): SaveSessionInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (
    !isFiniteNumber(b.profileId) ||
    !isFiniteNumber(b.durationSeconds) ||
    typeof b.operation !== "string" ||
    !isOperation(b.operation) ||
    !Array.isArray(b.answers)
  ) {
    return null;
  }

  const answers: AnswerRecord[] = [];
  for (const raw of b.answers) {
    const parsed = parseAnswer(raw);
    if (!parsed) return null;
    answers.push(parsed);
  }

  const level = isFiniteNumber(b.level) ? b.level : 1;

  return {
    profileId: b.profileId,
    operation: b.operation,
    level,
    durationSeconds: b.durationSeconds,
    answers,
  };
}
