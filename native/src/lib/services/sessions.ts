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

/** Support de saisie. Le portage natif reprendra ce type tel quel. */
export type Platform = "web" | "ios" | "android";

export interface SaveSessionInput {
  profileId: number;
  operation: Operation;
  level?: number;
  durationSeconds: number;
  mode?: SessionMode;
  /**
   * **Obligatoire ici**, alors qu'il est optionnel côté web (défaut `"web"`).
   *
   * Le défaut du schéma est `"web"` : dans l'app native, un appelant qui
   * oublierait ce champ étiquetterait donc silencieusement une partie jouée au
   * pouce comme une partie clavier — exactement la pollution que la colonne
   * existe pour empêcher (cf. MIGRATION-MOBILE.md §4.2), et qui n'est pas
   * rattrapable après coup. Le rendre requis transforme cet oubli en erreur de
   * typage.
   */
  platform: Platform;
  /** Identifiant de partie tiré par le client — clé de synchro idempotente. */
  clientUuid?: string;
  answers: AnswerRecord[];
}

/**
 * Persiste une session terminée et le détail de ses réponses, dans une même
 * transaction. Les totaux (nb de questions, bonnes réponses) sont dérivés des
 * réponses. Le score = nombre de bonnes réponses.
 *
 * La transaction est **synchrone** : les drivers SQLite (expo-sqlite comme
 * better-sqlite3) rejettent un callback qui rend une promesse. D'où les `.all()`
 * et `.run()` explicites, là où le banc d'essai web `await`-ait. La signature,
 * elle, reste asynchrone — les appelants ne voient aucune différence.
 */
export async function saveSession(
  db: Database,
  input: SaveSessionInput,
): Promise<Session> {
  const totalQuestions = input.answers.length;
  const correctCount = input.answers.filter((a) => a.isCorrect).length;

  return db.transaction((tx) => {
    const [session] = tx
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
        platform: input.platform,
        clientUuid: input.clientUuid,
      })
      .returning()
      .all();

    if (input.answers.length > 0) {
      tx.insert(answersTable)
        .values(
          input.answers.map((a) => ({
            sessionId: session.id,
            operandA: a.a,
            operandB: a.b,
            operation: a.operation,
            expected: a.expected,
            given: a.given,
            isCorrect: a.isCorrect,
            responseMs: a.responseMs,
            maxIdleMs: a.maxIdleMs,
          })),
        )
        .run();
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
