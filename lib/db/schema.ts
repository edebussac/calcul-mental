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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
