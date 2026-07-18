import { describe, it, expect } from "vitest";
import { parseSaveSessionInput } from "@/lib/api/parse";

const validAnswer = {
  a: 4,
  b: 3,
  operation: "multiplication",
  expected: 12,
  given: 12,
  isCorrect: true,
  responseMs: 900,
};

const validBody = {
  profileId: 1,
  operation: "multiplication",
  level: 1,
  durationSeconds: 60,
  score: 40,
  answers: [validAnswer],
};

describe("parseSaveSessionInput", () => {
  it("accepte un payload valide", () => {
    const parsed = parseSaveSessionInput(validBody);
    expect(parsed).not.toBeNull();
    expect(parsed?.answers).toHaveLength(1);
    expect(parsed?.level).toBe(1);
  });

  it("applique level = 1 par défaut", () => {
    const { level: _level, ...noLevel } = validBody;
    void _level;
    expect(parseSaveSessionInput(noLevel)?.level).toBe(1);
  });

  it.each([
    ["corps non-objet", 42],
    ["profileId manquant", { ...validBody, profileId: "x" }],
    ["operation inconnue", { ...validBody, operation: "modulo" }],
    ["answers absent", { ...validBody, answers: undefined }],
    ["score non numérique", { ...validBody, score: "haut" }],
  ])("rejette : %s", (_label, body) => {
    expect(parseSaveSessionInput(body)).toBeNull();
  });

  it("rejette une réponse mal formée dans le tableau", () => {
    const body = {
      ...validBody,
      answers: [validAnswer, { ...validAnswer, operation: "all" }],
    };
    expect(parseSaveSessionInput(body)).toBeNull();
  });
});
