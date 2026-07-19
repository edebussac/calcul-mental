/**
 * Construction CSV pure (testable) de l'export des réponses.
 */

export interface AnswerExportRow {
  createdAt: string;
  profile: string;
  operation: string;
  mode: string;
  a: number;
  b: number;
  expected: number;
  given: number;
  isCorrect: boolean;
  responseMs: number;
  sessionId: number;
}

export const CSV_HEADERS = [
  "created_at",
  "profile",
  "operation",
  "mode",
  "a",
  "b",
  "expected",
  "given",
  "is_correct",
  "response_ms",
  "session_id",
] as const;

/** Échappe une valeur CSV (guillemets, virgules, retours ligne). */
function esc(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Sérialise les lignes de réponses en CSV (en-tête inclus). */
export function toAnswersCsv(rows: AnswerExportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.createdAt),
        esc(r.profile),
        esc(r.operation),
        esc(r.mode),
        String(r.a),
        String(r.b),
        String(r.expected),
        String(r.given),
        r.isCorrect ? "true" : "false",
        String(r.responseMs),
        String(r.sessionId),
      ].join(","),
    );
  }
  return lines.join("\n");
}
