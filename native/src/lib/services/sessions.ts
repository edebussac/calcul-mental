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
  /**
   * L'énoncé était-il lu à voix haute ? **Obligatoire pour la même raison que
   * `platform`** : la valeur ne se retrouve pas après coup, et une partie
   * énoncée rangée par défaut parmi les parties silencieuses pollue les temps
   * de réponse dont s'auto-calibre le modèle adaptatif.
   */
  voice: boolean;
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
        voice: input.voice,
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
  level: number;
  mode: SessionMode;
  voice: boolean;
  bestScore: number;
  plays: number;
}

/**
 * Meilleur score (= max de bonnes réponses) et nombre de parties, **par
 * conditions de jeu** : une ligne par (opération, niveau, mode, énoncé).
 *
 * Le regroupement est celui de `personalBest`, et ce n'est pas un hasard : cet
 * écran affiche le record que la partie annonce. Regrouper plus large ferait
 * afficher ici un « meilleur » que le jeu ne reconnaîtrait jamais — un 24 hérité
 * de Facile en face d'un joueur qui plafonne à 11 en Légendaire.
 *
 * `mode` fait partie des clés bien qu'il ne concerne que la multiplication : le
 * mode ciblé sert exprès les calculs les plus lents du joueur, ses scores ne se
 * mêlent pas à ceux du mode normal.
 */
export async function bestScores(
  db: Database,
  profileId: number,
): Promise<BestScore[]> {
  const rows = await db
    .select({
      operation: sessions.operation,
      level: sessions.level,
      mode: sessions.mode,
      voice: sessions.voice,
      bestScore: sql<number>`max(${sessions.correctCount})`,
      plays: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(eq(sessions.profileId, profileId))
    .groupBy(sessions.operation, sessions.level, sessions.mode, sessions.voice);

  // Certains drivers renvoient les agrégats en texte → on normalise en nombre.
  return rows.map((r) => ({
    operation: r.operation,
    level: Number(r.level),
    mode: r.mode,
    voice: r.voice,
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

/** Les conditions qui rendent deux parties comparables entre elles. */
export interface RecordScope {
  profileId: number;
  operation: Operation;
  level: number;
  mode: SessionMode;
  voice: boolean;
}

/**
 * Record personnel **à conditions identiques**, ou `null` si le joueur n'a
 * encore jamais joué dans celles-ci.
 *
 * Volontairement plus étroit que `bestScoreFor`, qui n'isole que l'opération et
 * sert l'écran des scores, où l'on regarde une opération en bloc. Ici on annonce
 * « record battu » : la promesse doit être vraie, et elle ne l'est qu'à
 * difficulté égale. Chacun des quatre critères a déjà sa raison d'être ailleurs
 * dans le code —
 *
 * - `level` change la plage d'opérandes (`levels.ts`) : un record de Facile est
 *   inatteignable à Légendaire, l'annonce ne se déclencherait jamais ;
 * - `mode` : le mode ciblé sert exprès les calculs les plus lents du joueur ;
 * - `voice` : l'énoncé lu remplace l'énoncé écrit et ne se parcourt pas à
 *   l'œil (cf. la colonne du même nom dans le schéma).
 *
 * Le `null` compte : il distingue « aucune partie » de « une partie à 0 », ce
 * qu'un `0` de repli confondrait — et on n'annonce pas un record battu à
 * quelqu'un qui n'en avait pas.
 */
export async function personalBest(
  db: Database,
  scope: RecordScope,
): Promise<number | null> {
  const rows = await db
    .select({ best: sql<number | null>`max(${sessions.correctCount})` })
    .from(sessions)
    .where(
      and(
        eq(sessions.profileId, scope.profileId),
        eq(sessions.operation, scope.operation),
        eq(sessions.level, scope.level),
        eq(sessions.mode, scope.mode),
        eq(sessions.voice, scope.voice),
      ),
    );

  // `max()` sans ligne rend NULL — c'est ce NULL qui porte « jamais joué ».
  const best = rows[0]?.best;
  return best === null || best === undefined ? null : Number(best);
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
