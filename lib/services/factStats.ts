import { and, desc, eq, lte } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { answers, sessions } from "@/lib/db/schema";
import { ADAPTIVE_PARAMS, factKey, type FactStat } from "@/lib/game/adaptive";

const DAY_MS = 86_400_000;

/**
 * Agrège l'historique de multiplication d'un profil **par fait non ordonné**
 * (4×3 et 3×4 mutualisés) : les `window` dernières tentatives (temps ≤ cap) du
 * plus récent au plus ancien, et l'ancienneté de la dernière tentative.
 *
 * Note : on inclut TOUTES les parties de multiplication (mode classique ET
 * adaptatif) — les deux alimentent le même modèle.
 */
export async function multiplicationFactStats(
  db: Database,
  profileId: number,
  now: Date = new Date(),
): Promise<FactStat[]> {
  const rows = await db
    .select({
      a: answers.operandA,
      b: answers.operandB,
      responseMs: answers.responseMs,
      createdAt: answers.createdAt,
    })
    .from(answers)
    .innerJoin(sessions, eq(answers.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.profileId, profileId),
        eq(answers.operation, "multiplication"),
        lte(answers.responseMs, ADAPTIVE_PARAMS.capMs),
      ),
    )
    .orderBy(desc(answers.createdAt));

  const byKey = new Map<
    string,
    { a: number; b: number; recentMs: number[]; lastSeenMs: number }
  >();

  for (const r of rows) {
    const key = factKey(r.a, r.b);
    let entry = byKey.get(key);
    if (!entry) {
      const [lo, hi] = r.a <= r.b ? [r.a, r.b] : [r.b, r.a];
      // Première ligne rencontrée = la plus récente (tri desc) → lastSeen.
      entry = { a: lo, b: hi, recentMs: [], lastSeenMs: r.createdAt.getTime() };
      byKey.set(key, entry);
    }
    if (entry.recentMs.length < ADAPTIVE_PARAMS.window) {
      entry.recentMs.push(r.responseMs);
    }
  }

  return [...byKey.values()].map((e) => ({
    a: e.a,
    b: e.b,
    recentMs: e.recentMs,
    lastSeenDays: (now.getTime() - e.lastSeenMs) / DAY_MS,
  }));
}
