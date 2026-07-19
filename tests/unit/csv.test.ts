import { describe, it, expect } from "vitest";
import { CSV_HEADERS, toAnswersCsv, type AnswerExportRow } from "@/lib/export/csv";

const row: AnswerExportRow = {
  createdAt: "2026-01-15T12:00:00.000Z",
  profile: "Emma",
  operation: "multiplication",
  mode: "adaptive",
  a: 4,
  b: 3,
  expected: 12,
  given: 12,
  isCorrect: true,
  responseMs: 900,
  sessionId: 7,
};

describe("toAnswersCsv", () => {
  it("écrit l'en-tête puis les lignes", () => {
    const csv = toAnswersCsv([row]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(CSV_HEADERS.join(","));
    expect(lines[1]).toBe(
      "2026-01-15T12:00:00.000Z,Emma,multiplication,adaptive,4,3,12,12,true,900,7",
    );
  });

  it("échappe les virgules et guillemets", () => {
    const tricky: AnswerExportRow = { ...row, profile: 'Jean, "le rapide"' };
    const line = toAnswersCsv([tricky]).split("\n")[1];
    expect(line).toContain('"Jean, ""le rapide"""');
  });

  it("gère une liste vide (en-tête seul)", () => {
    expect(toAnswersCsv([])).toBe(CSV_HEADERS.join(","));
  });
});
