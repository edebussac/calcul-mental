import { beforeEach, describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/testDb";
import type { Database } from "@/lib/db/client";
import { answers, profiles, sessions } from "@/lib/db/schema";
import { multiplicationFactStats } from "@/lib/services/factStats";
import { factKey } from "@/lib/game/adaptive";

const DAY = 86_400_000;
const BASE = new Date("2026-01-15T12:00:00Z");

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function makeProfile(name = "P"): Promise<number> {
  const [p] = await db.insert(profiles).values({ name }).returning();
  return p.id;
}

async function makeSession(profileId: number): Promise<number> {
  const [s] = await db
    .insert(sessions)
    .values({
      profileId,
      operation: "multiplication",
      durationSeconds: 60,
      totalQuestions: 0,
      correctCount: 0,
      score: 0,
    })
    .returning();
  return s.id;
}

async function addAnswer(
  sessionId: number,
  a: number,
  b: number,
  responseMs: number,
  ageDays: number,
) {
  await db.insert(answers).values({
    sessionId,
    operandA: a,
    operandB: b,
    operation: "multiplication",
    expected: a * b,
    given: a * b,
    isCorrect: true,
    responseMs,
    createdAt: new Date(BASE.getTime() - ageDays * DAY),
  });
}

describe("multiplicationFactStats", () => {
  it("mutualise 3×4 / 4×3 et exclut les temps > 10 s", async () => {
    const pid = await makeProfile();
    const sid = await makeSession(pid);
    await addAnswer(sid, 3, 4, 2000, 1);
    await addAnswer(sid, 4, 3, 3000, 0.5); // même fait, plus récent
    await addAnswer(sid, 4, 3, 99999, 0.1); // > 10 s → ignoré

    const stats = await multiplicationFactStats(db, pid, BASE);
    expect(stats).toHaveLength(1);
    const f = stats[0];
    expect(factKey(f.a, f.b)).toBe(factKey(3, 4));
    expect(f.a).toBe(3);
    expect(f.b).toBe(4);
    // Plus récent en tête ; l'aberrant est absent.
    expect(f.recentMs).toEqual([3000, 2000]);
    expect(f.lastSeenDays).toBeCloseTo(0.5, 5);
  });

  it("ne garde que les K dernières tentatives (les plus récentes)", async () => {
    const pid = await makeProfile();
    const sid = await makeSession(pid);
    // 12 tentatives : age 1..12 jours, responseMs = age*10.
    for (let age = 12; age >= 1; age--) {
      await addAnswer(sid, 6, 7, age * 10, age);
    }
    const stats = await multiplicationFactStats(db, pid, BASE);
    const f = stats.find((s) => factKey(s.a, s.b) === factKey(6, 7))!;
    expect(f.recentMs).toHaveLength(10); // window = 10
    expect(f.recentMs[0]).toBe(10); // plus récent (age 1)
    expect(f.recentMs[9]).toBe(100); // age 10
    expect(f.recentMs).not.toContain(110); // age 11 exclu
  });

  it("ignore les autres opérations et profils", async () => {
    const pid = await makeProfile("A");
    const other = await makeProfile("B");
    const sid = await makeSession(pid);
    const sidOther = await makeSession(other);
    await addAnswer(sid, 2, 2, 1500, 1);
    await addAnswer(sidOther, 5, 5, 1500, 1); // autre profil
    const stats = await multiplicationFactStats(db, pid, BASE);
    expect(stats).toHaveLength(1);
    expect(factKey(stats[0].a, stats[0].b)).toBe(factKey(2, 2));
  });
});
