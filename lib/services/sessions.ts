import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  answers as answersTable,
  sessions,
  type Session,
} from "@/lib/db/schema";
import type { AnswerRecord } from "@/lib/game/engine";
import type { Operation } from "@/lib/game/operations";

export type SessionMode = "classic" | "adaptive";

export interface SaveSessionInput {
  profileId: number;
  operation: Operation;
  level?: number;
  durationSeconds: number;
  mode?: SessionMode;
  answers: AnswerRecord[];
}

/**
 * Persiste une session terminée et le détail de ses réponses, dans une même
 * transaction. Les totaux (nb de questions, bonnes réponses) sont dérivés des
 * réponses. Le score = nombre de bonnes réponses.
 */
export async function saveSession(
  db: Database,
  input: SaveSessionInput,
): Promise<Session> {
  const totalQuestions = input.answers.length;
  const correctCount = input.answers.filter((a) => a.isCorrect).length;

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        profileId: input.profileId,
        operation: input.operation,
        level: input.level ?? 1,
        endedAt: new Date(),
        durationSeconds: input.durationSeconds,
        totalQuestions,
        correctCount,
        score: correctCount, // le score EST le nombre de bonnes réponses
        mode: input.mode ?? "classic",
      })
      .returning();

    if (input.answers.length > 0) {
      await tx.insert(answersTable).values(
        input.answers.map((a) => ({
          sessionId: session.id,
          operandA: a.a,
          operandB: a.b,
          operation: a.operation,
          expected: a.expected,
          given: a.given,
          isCorrect: a.isCorrect,
          responseMs: a.responseMs,
        })),
      );
    }

    return session;
  });
}

export interface BestScore {
  operation: Operation;
  bestScore: number;
  plays: number;
}

/** Meilleur score (= max de bonnes réponses) et nb de parties par opération. */
export async function bestScores(
  db: Database,
  profileId: number,
): Promise<BestScore[]> {
  const rows = await db
    .select({
      operation: sessions.operation,
      bestScore: sql<number>`max(${sessions.correctCount})`,
      plays: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(eq(sessions.profileId, profileId))
    .groupBy(sessions.operation);

  // Certains drivers renvoient les agrégats en texte → on normalise en nombre.
  return rows.map((r) => ({
    operation: r.operation,
    bestScore: Number(r.bestScore),
    plays: Number(r.plays),
  }));
}

/** Dernières sessions d'un profil (les plus récentes d'abord). */
export async function recentSessions(
  db: Database,
  profileId: number,
  limit = 10,
): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.profileId, profileId))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);
}

/** Meilleur score (bonnes réponses) pour une opération (0 si aucune partie). */
export async function bestScoreFor(
  db: Database,
  profileId: number,
  operation: Operation,
): Promise<number> {
  const rows = await db
    .select({ bestScore: sql<number>`max(${sessions.correctCount})` })
    .from(sessions)
    .where(
      and(eq(sessions.profileId, profileId), eq(sessions.operation, operation)),
    );
  return Number(rows[0]?.bestScore ?? 0);
}
