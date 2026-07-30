import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { Operation } from "@/lib/game/operations";

/**
 * `operation` est stockée en varchar (et non en enum PG) volontairement :
 * ajouter une opération ne nécessite alors aucune migration d'enum, et pg-mem
 * (utilisé dans les tests d'intégration) la gère sans friction.
 */

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  /**
   * Identifiant tiré par le client, pour reconnaître un profil créé hors ligne
   * sur un téléphone autrement que par son prénom. Cf. `sessions.clientUuid`.
   */
  clientUuid: varchar("client_uuid", { length: 36 }).unique(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profiles.id),
  operation: varchar("operation", { length: 20 }).$type<Operation>().notNull(),
  level: integer("level").notNull().default(1),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  correctCount: integer("correct_count").notNull(),
  score: integer("score").notNull(),
  // Mode de sélection des questions (analyse) : classique (aléatoire) ou adaptatif.
  mode: varchar("mode", { length: 16 })
    .$type<"classic" | "adaptive">()
    .notNull()
    .default("classic"),
  /**
   * Support de saisie de la partie. Répondre au clavier d'un Mac et au pouce
   * sur une dalle tactile ne donne pas les mêmes `response_ms` : sans cette
   * colonne, un historique qui mêle les deux fausse les percentiles dont
   * s'auto-calibre `playerRefs()` (cf. MIGRATION-MOBILE.md §4.2). Non
   * renseignable après coup — d'où son ajout avant la migration native.
   */
  platform: varchar("platform", { length: 16 })
    .$type<"web" | "ios" | "android">()
    .notNull()
    .default("web"),
  /**
   * Identifiant tiré par le client, une fois par partie. Deux téléphones en
   * SQLite local produisent chacun une session `id = 1` : c'est lui, et non
   * `id`, qui identifie une partie lors d'une synchro, ce qui la rend
   * idempotente (un renvoi après échec réseau ne crée pas de doublon).
   * Nullable : les parties déjà en base n'en ont pas.
   */
  clientUuid: varchar("client_uuid", { length: 36 }).unique(),
});

export const answers = pgTable("answers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  operandA: integer("operand_a").notNull(),
  operandB: integer("operand_b").notNull(),
  operation: varchar("operation", { length: 20 }).$type<Operation>().notNull(),
  expected: integer("expected").notNull(),
  given: integer("given").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  responseMs: integer("response_ms").notNull(),
  /**
   * Plus longue plage sans appui pendant la question. Sépare le calcul
   * difficile (long, mais frappes régulières) de l'absence (long et écran
   * figé) : seule la seconde est écartée du modèle adaptatif.
   */
  maxIdleMs: integer("max_idle_ms").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
