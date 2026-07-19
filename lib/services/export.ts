import { asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { answers, profiles, sessions, type Answer, type Session } from "@/lib/db/schema";
import { getProfileById } from "@/lib/services/profiles";
import type { AnswerExportRow } from "@/lib/export/csv";

/** Lignes plates (réponses) d'un profil pour l'export CSV. */
export async function exportAnswerRows(
  db: Database,
  profileId: number,
): Promise<AnswerExportRow[]> {
  const rows = await db
    .select({
      createdAt: answers.createdAt,
      profile: profiles.name,
      operation: answers.operation,
      mode: sessions.mode,
      a: answers.operandA,
      b: answers.operandB,
      expected: answers.expected,
      given: answers.given,
      isCorrect: answers.isCorrect,
      responseMs: answers.responseMs,
      sessionId: answers.sessionId,
    })
    .from(answers)
    .innerJoin(sessions, eq(answers.sessionId, sessions.id))
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(eq(sessions.profileId, profileId))
    .orderBy(asc(answers.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export interface ExportJson {
  profile: { id: number; name: string } | undefined;
  exportedAt: string;
  sessions: (Session & { answers: Answer[] })[];
}

/** Export structuré complet (parties + réponses imbriquées) d'un profil. */
export async function exportJson(
  db: Database,
  profileId: number,
): Promise<ExportJson> {
  const profile = await getProfileById(db, profileId);
  const sess = await db
    .select()
    .from(sessions)
    .where(eq(sessions.profileId, profileId))
    .orderBy(asc(sessions.startedAt));

  const ans = await db
    .select()
    .from(answers)
    .innerJoin(sessions, eq(answers.sessionId, sessions.id))
    .where(eq(sessions.profileId, profileId))
    .orderBy(asc(answers.createdAt));

  const bySession = new Map<number, Answer[]>();
  for (const row of ans) {
    const list = bySession.get(row.answers.sessionId) ?? [];
    list.push(row.answers);
    bySession.set(row.answers.sessionId, list);
  }

  return {
    profile: profile ? { id: profile.id, name: profile.name } : undefined,
    exportedAt: new Date().toISOString(),
    sessions: sess.map((s) => ({ ...s, answers: bySession.get(s.id) ?? [] })),
  };
}
