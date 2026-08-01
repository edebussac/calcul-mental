import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Operation } from "@/lib/game/operations";

/**
 * Transposition SQLite du schéma Postgres du banc d'essai web. La **forme**
 * (tables, colonnes, contraintes) est identique ; seuls les types changent :
 *
 * | Postgres            | SQLite                                  |
 * | ------------------- | --------------------------------------- |
 * | `serial`            | `integer` + `autoIncrement`             |
 * | `varchar(n)`        | `text({ length: n })`                   |
 * | `timestamp`         | `integer({ mode: "timestamp" })`        |
 * | `boolean`           | `integer({ mode: "boolean" })`          |
 *
 * Les modes `timestamp` et `boolean` sont essentiels : ils font rendre à Drizzle
 * de vrais `Date` et de vrais booléens, ce qui permet aux services d'être repris
 * sans modification (`createdAt.toISOString()`, `createdAt.getTime()`,
 * `answers.filter(a => a.isCorrect)`).
 *
 * `operation` est stockée en texte (et non en enum) volontairement : ajouter une
 * opération ne nécessite alors aucune migration.
 */

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name", { length: 50 }).notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  /**
   * Identifiant tiré par le client, pour reconnaître un profil créé hors ligne
   * sur un téléphone autrement que par son prénom. Cf. `sessions.clientUuid`.
   */
  clientUuid: text("client_uuid", { length: 36 }).unique(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profiles.id),
  operation: text("operation", { length: 20 }).$type<Operation>().notNull(),
  level: integer("level").notNull().default(1),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  durationSeconds: integer("duration_seconds").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  correctCount: integer("correct_count").notNull(),
  score: integer("score").notNull(),
  // Mode de sélection des questions (analyse) : classique (aléatoire) ou adaptatif.
  mode: text("mode", { length: 16 })
    .$type<"classic" | "adaptive">()
    .notNull()
    .default("classic"),
  /**
   * Support de saisie de la partie. Répondre au clavier d'un Mac et au pouce
   * sur une dalle tactile ne donne pas les mêmes `response_ms` : sans cette
   * colonne, un historique qui mêle les deux fausse les percentiles dont
   * s'auto-calibre `playerRefs()` (cf. MIGRATION-MOBILE.md §4.2).
   *
   * Le défaut reste `web` par symétrie avec le banc d'essai, mais l'app native
   * renseigne toujours `ios` ou `android` explicitement.
   */
  platform: text("platform", { length: 16 })
    .$type<"web" | "ios" | "android">()
    .notNull()
    .default("web"),
  /**
   * L'énoncé était-il lu à voix haute ?
   *
   * Même raison d'être que `platform` ci-dessus : entendre « 10 fois 9 » pendant
   * qu'on le lit ne donne pas les mêmes `response_ms` que le lire seul, et le
   * modèle adaptatif se calibre précisément sur ces temps (MIGRATION-MOBILE.md
   * §4.2). Sans cette colonne, un historique qui mêle les deux fausse les
   * percentiles de `playerRefs()` — et rien ne permet de les retrier après coup.
   *
   * Le défaut `false` vaut aussi pour les parties d'avant la fonctionnalité,
   * qui étaient bien toutes silencieuses.
   */
  voice: integer("voice", { mode: "boolean" }).notNull().default(false),
  /**
   * Identifiant tiré par le client, une fois par partie. Deux téléphones en
   * SQLite local produisent chacun une session `id = 1` : c'est lui, et non
   * `id`, qui identifie une partie lors d'une synchro, ce qui la rend
   * idempotente (un renvoi après échec réseau ne crée pas de doublon).
   */
  clientUuid: text("client_uuid", { length: 36 }).unique(),
});

export const answers = sqliteTable("answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  operandA: integer("operand_a").notNull(),
  operandB: integer("operand_b").notNull(),
  operation: text("operation", { length: 20 }).$type<Operation>().notNull(),
  expected: integer("expected").notNull(),
  given: integer("given").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  responseMs: integer("response_ms").notNull(),
  /**
   * Plus longue plage sans appui pendant la question. Sépare le calcul
   * difficile (long, mais frappes régulières) de l'absence (long et écran
   * figé) : seule la seconde est écartée du modèle adaptatif.
   */
  maxIdleMs: integer("max_idle_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
