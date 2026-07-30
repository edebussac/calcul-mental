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
  maxIdleMs: 400,
};

const validBody = {
  profileId: 1,
  operation: "multiplication",
  level: 1,
  durationSeconds: 60,
  answers: [validAnswer],
};

describe("parseSaveSessionInput", () => {
  it("accepte un payload valide", () => {
    const parsed = parseSaveSessionInput(validBody);
    expect(parsed).not.toBeNull();
    expect(parsed?.answers).toHaveLength(1);
    expect(parsed?.level).toBe(1);
  });

  it("conserve maxIdleMs", () => {
    const parsed = parseSaveSessionInput(validBody);
    expect(parsed?.answers[0].maxIdleMs).toBe(400);
  });

  it("replie maxIdleMs sur responseMs si le client ne l'envoie pas", () => {
    // Un client en cache (PWA) poste l'ancien format : on suppose le pire cas
    // (tout le temps était du silence) plutôt que de le créditer d'activité.
    const { maxIdleMs: _idle, ...legacyAnswer } = validAnswer;
    void _idle;
    const parsed = parseSaveSessionInput({
      ...validBody,
      answers: [legacyAnswer],
    });
    expect(parsed?.answers[0].maxIdleMs).toBe(900);
  });

  it("conserve platform et clientUuid", () => {
    const parsed = parseSaveSessionInput({
      ...validBody,
      platform: "ios",
      clientUuid: "3f0c1a6e-8b2d-4c5f-9a71-2e4d6b8c0a13",
    });
    expect(parsed?.platform).toBe("ios");
    expect(parsed?.clientUuid).toBe("3f0c1a6e-8b2d-4c5f-9a71-2e4d6b8c0a13");
  });

  it("suppose le web quand le client ne déclare pas de plateforme", () => {
    // Même compat que maxIdleMs : le web est le seul client déployé à ce jour.
    const parsed = parseSaveSessionInput(validBody);
    expect(parsed).not.toBeNull();
    expect(parsed?.platform).toBe("web");
    expect(parsed?.clientUuid).toBeUndefined();
  });

  it("ignore une plateforme inconnue plutôt que de rejeter la partie", () => {
    // Une partie jouée ne doit jamais être perdue pour un champ annexe.
    const parsed = parseSaveSessionInput({ ...validBody, platform: "watchos" });
    expect(parsed?.platform).toBe("web");
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
    ["durationSeconds manquant", { ...validBody, durationSeconds: "x" }],
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
