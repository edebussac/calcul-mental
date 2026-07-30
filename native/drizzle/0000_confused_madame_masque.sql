CREATE TABLE `answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`operand_a` integer NOT NULL,
	`operand_b` integer NOT NULL,
	`operation` text(20) NOT NULL,
	`expected` integer NOT NULL,
	`given` integer NOT NULL,
	`is_correct` integer NOT NULL,
	`response_ms` integer NOT NULL,
	`max_idle_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(50) NOT NULL,
	`created_at` integer NOT NULL,
	`client_uuid` text(36)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_client_uuid_unique` ON `profiles` (`client_uuid`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`operation` text(20) NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer NOT NULL,
	`total_questions` integer NOT NULL,
	`correct_count` integer NOT NULL,
	`score` integer NOT NULL,
	`mode` text(16) DEFAULT 'classic' NOT NULL,
	`platform` text(16) DEFAULT 'web' NOT NULL,
	`client_uuid` text(36),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_client_uuid_unique` ON `sessions` (`client_uuid`);