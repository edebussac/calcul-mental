/**
 * Validation/parsing des payloads d'API, sans dépendance externe.
 * Isolé ici pour être testable unitairement et réutilisable par les routes.
 */

import type { Platform, SaveSessionInput } from "@/lib/services/sessions";
import type { AnswerRecord } from "@/lib/game/engine";
import { isBaseOperation, isOperation } from "@/lib/game/operations";

const PLATFORMS: readonly Platform[] = ["web", "ios", "android"];

function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
}

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
    // Compat : un client encore en cache (PWA) n'envoie pas `maxIdleMs`. On
    // suppose alors le pire — tout le temps de réponse était du silence — ce
    // qui reproduit exactement l'ancien filtre (> 10 s → écarté du modèle).
    maxIdleMs: isFiniteNumber(a.maxIdleMs) ? a.maxIdleMs : a.responseMs,
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
  const mode = b.mode === "adaptive" ? "adaptive" : "classic";

  // Compat, comme pour `maxIdleMs` : un client encore en cache (PWA) n'envoie
  // ni `platform` ni `clientUuid`. Une session sans support déclaré vient du
  // web — le seul client déployé à ce jour.
  const platform = isPlatform(b.platform) ? b.platform : "web";
  const clientUuid =
    typeof b.clientUuid === "string" ? b.clientUuid : undefined;

  return {
    profileId: b.profileId,
    operation: b.operation,
    level,
    durationSeconds: b.durationSeconds,
    mode,
    platform,
    clientUuid,
    answers,
  };
}
