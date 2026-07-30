import { beforeEach, describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/testDb";
import type { Database } from "@/lib/db/client";
import {
  getOrCreateProfile,
  getProfileByName,
  listProfiles,
} from "@/lib/services/profiles";
import {
  bestScoreFor,
  bestScores,
  recentSessions,
  saveSession,
} from "@/lib/services/sessions";
import type { AnswerRecord } from "@/lib/game/engine";

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

const answer = (a: number, b: number, given: number): AnswerRecord => ({
  a,
  b,
  operation: "multiplication",
  expected: a * b,
  given,
  isCorrect: given === a * b,
  responseMs: 1200,
  maxIdleMs: 0,
});

/** Socle commun : `platform` est requis dans l'app native (cf. sessions.ts). */
const sessionBase = (profileId: number) => ({
  profileId,
  operation: "multiplication" as const,
  durationSeconds: 60,
  platform: "ios" as const,
});

describe("profiles service", () => {
  it("crée un profil puis le réutilise (idempotent, casse ignorée)", async () => {
    const p1 = await getOrCreateProfile(db, "Léa");
    const p2 = await getOrCreateProfile(db, "  léa ");
    expect(p2.id).toBe(p1.id);
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it("liste les profils par ordre alphabétique", async () => {
    await getOrCreateProfile(db, "Zoé");
    await getOrCreateProfile(db, "Adam");
    await getOrCreateProfile(db, "Manon");
    const names = (await listProfiles(db)).map((p) => p.name);
    expect(names).toEqual(["Adam", "Manon", "Zoé"]);
  });

  it("retrouve un profil par nom insensible à la casse", async () => {
    const created = await getOrCreateProfile(db, "Noé");
    const found = await getProfileByName(db, "NOÉ");
    expect(found?.id).toBe(created.id);
  });

  it("ne duplique pas un prénom accentué saisi en majuscules", async () => {
    // Régression : le `lower()` de SQLite est ASCII et laisse « É » intact.
    // Comparer en SQL créait donc un second profil pour THÉO / Théo.
    const first = await getOrCreateProfile(db, "THÉO");
    const second = await getOrCreateProfile(db, "théo");
    expect(second.id).toBe(first.id);
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it("rejette un nom vide", async () => {
    await expect(getOrCreateProfile(db, "   ")).rejects.toThrow();
  });
});

describe("sessions service", () => {
  it("persiste une session et son détail, totaux dérivés des réponses", async () => {
    const profile = await getOrCreateProfile(db, "Emma");
    const answers = [
      answer(4, 3, 12), // ok
      answer(6, 7, 42), // ok
      answer(8, 9, 70), // faux
    ];

    const session = await saveSession(db, {
      ...sessionBase(profile.id),
      answers,
    });

    expect(session.id).toBeGreaterThan(0);
    expect(session.totalQuestions).toBe(3);
    expect(session.correctCount).toBe(2);
    // Le score EST le nombre de bonnes réponses.
    expect(session.score).toBe(2);
    expect(session.operation).toBe("multiplication");

    const recent = await recentSessions(db, profile.id);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(session.id);
  });

  it("agrège le meilleur score (max de bonnes réponses) par opération", async () => {
    const profile = await getOrCreateProfile(db, "Tom");
    const base = sessionBase(profile.id);
    // 1, puis 3, puis 2 bonnes réponses → record = 3.
    await saveSession(db, { ...base, answers: [answer(2, 2, 4)] });
    await saveSession(db, {
      ...base,
      answers: [answer(2, 2, 4), answer(3, 3, 9), answer(4, 4, 16)],
    });
    await saveSession(db, {
      ...base,
      answers: [answer(2, 2, 4), answer(3, 3, 9)],
    });

    const scores = await bestScores(db, profile.id);
    expect(scores).toEqual([
      { operation: "multiplication", bestScore: 3, plays: 3 },
    ]);
    expect(await bestScoreFor(db, profile.id, "multiplication")).toBe(3);
  });

  it("renvoie 0 comme meilleur score sans partie jouée", async () => {
    const profile = await getOrCreateProfile(db, "Lucas");
    expect(await bestScoreFor(db, profile.id, "multiplication")).toBe(0);
    expect(await bestScores(db, profile.id)).toEqual([]);
  });

  it("persiste le mode (classic par défaut, adaptive si fourni)", async () => {
    const profile = await getOrCreateProfile(db, "Nina");
    const base = { ...sessionBase(profile.id), answers: [answer(2, 2, 4)] };
    const classic = await saveSession(db, base);
    const adaptive = await saveSession(db, { ...base, mode: "adaptive" });
    expect(classic.mode).toBe("classic");
    expect(adaptive.mode).toBe("adaptive");
  });

  it("persiste la plateforme, qui est obligatoire ici", async () => {
    // Le banc d'essai web testait le défaut `web`. Ce test n'a plus d'objet
    // dans l'app native : `platform` y est requis, précisément pour qu'un oubli
    // ne puisse pas étiqueter une partie au pouce comme une partie clavier.
    const profile = await getOrCreateProfile(db, "Jules");
    const base = { ...sessionBase(profile.id), answers: [answer(2, 2, 4)] };
    const ios = await saveSession(db, { ...base, platform: "ios" });
    const android = await saveSession(db, { ...base, platform: "android" });
    expect(ios.platform).toBe("ios");
    expect(android.platform).toBe("android");
  });

  it("persiste le clientUuid, absent par défaut", async () => {
    const profile = await getOrCreateProfile(db, "Chloé");
    const base = { ...sessionBase(profile.id), answers: [answer(2, 2, 4)] };
    const withoutUuid = await saveSession(db, base);
    const withUuid = await saveSession(db, { ...base, clientUuid: "uuid-a" });
    expect(withoutUuid.clientUuid).toBeNull();
    expect(withUuid.clientUuid).toBe("uuid-a");
  });

  it("refuse deux parties portant le même clientUuid", async () => {
    // C'est la garantie qui rendra la synchro idempotente : renvoyer une partie
    // après un échec réseau ne doit pas créer un doublon.
    const profile = await getOrCreateProfile(db, "Hugo");
    const base = {
      ...sessionBase(profile.id),
      answers: [answer(2, 2, 4)],
      clientUuid: "uuid-b",
    };
    await saveSession(db, base);
    await expect(saveSession(db, base)).rejects.toThrow();
    expect(await recentSessions(db, profile.id)).toHaveLength(1);
  });

  it("laisse coexister plusieurs parties sans clientUuid", async () => {
    // L'historique déjà en base a client_uuid NULL : la contrainte UNIQUE ne
    // doit pas l'empêcher de grandir.
    const profile = await getOrCreateProfile(db, "Alice");
    const base = { ...sessionBase(profile.id), answers: [answer(2, 2, 4)] };
    await saveSession(db, base);
    await saveSession(db, base);
    expect(await recentSessions(db, profile.id)).toHaveLength(2);
  });

  it("refuse une partie rattachée à un profil inexistant", async () => {
    // Propre à SQLite : les clés étrangères n'y sont pas appliquées par défaut.
    // Ce test échouerait si le PRAGMA foreign_keys du harnais sautait.
    await expect(
      saveSession(db, { ...sessionBase(9999), answers: [answer(2, 2, 4)] }),
    ).rejects.toThrow();
  });
});
