// Généré par scripts/build-migrations.mjs — NE PAS ÉDITER À LA MAIN.
// Régénérer avec : npm run db:generate

export default {
  journal: {
    "version": "7",
    "dialect": "sqlite",
    "entries": [
      {
        "idx": 0,
        "version": "6",
        "when": 1785404567760,
        "tag": "0000_confused_madame_masque",
        "breakpoints": true
      }
    ]
  },
  migrations: {
  m0000: "CREATE TABLE `answers` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`session_id` integer NOT NULL,\n\t`operand_a` integer NOT NULL,\n\t`operand_b` integer NOT NULL,\n\t`operation` text(20) NOT NULL,\n\t`expected` integer NOT NULL,\n\t`given` integer NOT NULL,\n\t`is_correct` integer NOT NULL,\n\t`response_ms` integer NOT NULL,\n\t`max_idle_ms` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `profiles` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text(50) NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`client_uuid` text(36)\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint\nCREATE UNIQUE INDEX `profiles_client_uuid_unique` ON `profiles` (`client_uuid`);--> statement-breakpoint\nCREATE TABLE `sessions` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`profile_id` integer NOT NULL,\n\t`operation` text(20) NOT NULL,\n\t`level` integer DEFAULT 1 NOT NULL,\n\t`started_at` integer NOT NULL,\n\t`ended_at` integer,\n\t`duration_seconds` integer NOT NULL,\n\t`total_questions` integer NOT NULL,\n\t`correct_count` integer NOT NULL,\n\t`score` integer NOT NULL,\n\t`mode` text(16) DEFAULT 'classic' NOT NULL,\n\t`platform` text(16) DEFAULT 'web' NOT NULL,\n\t`client_uuid` text(36),\n\tFOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX `sessions_client_uuid_unique` ON `sessions` (`client_uuid`);",
  },
};
