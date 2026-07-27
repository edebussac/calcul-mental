ALTER TABLE "answers" ADD COLUMN "max_idle_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill : les réponses déjà en base n'ont pas de trace d'activité. On leur
-- prête le pire cas (tout le temps de réponse était du silence), ce qui
-- reproduit à l'identique l'ancien filtre `response_ms > 10 s` → écartée.
-- Sans ça, les anciennes absences remonteraient d'un coup dans le modèle.
UPDATE "answers" SET "max_idle_ms" = "response_ms";
