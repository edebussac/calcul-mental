ALTER TABLE "profiles" ADD COLUMN "client_uuid" varchar(36);--> statement-breakpoint
-- Aucun backfill à écrire, contrairement à 0002 : les parties déjà en base ont
-- toutes été jouées sur le banc d'essai web, donc le DEFAULT les étiquette
-- correctement. Et `client_uuid` reste NULL sur l'historique — Postgres tolère
-- plusieurs NULL sous une contrainte UNIQUE.
ALTER TABLE "sessions" ADD COLUMN "platform" varchar(16) DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client_uuid" varchar(36);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_client_uuid_unique" UNIQUE("client_uuid");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_uuid_unique" UNIQUE("client_uuid");