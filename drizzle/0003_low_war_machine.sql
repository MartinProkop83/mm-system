CREATE TABLE `engine_service_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`engine_id` text NOT NULL,
	`service_date` text NOT NULL,
	`service_type` text NOT NULL,
	`replaced_parts` text DEFAULT '[]' NOT NULL,
	`piston_size` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`piston_minutes_before` integer DEFAULT 0 NOT NULL,
	`rod_minutes_before` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engine_usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`engine_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`oppama_minutes` integer NOT NULL,
	`race_name` text DEFAULT '' NOT NULL,
	`driver_name` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `engine_service_engine_idx` ON `engine_service_entries` (`engine_id`,`service_date`);--> statement-breakpoint
CREATE INDEX `engine_usage_engine_idx` ON `engine_usage_logs` (`engine_id`,`entry_date`);--> statement-breakpoint
ALTER TABLE `engines` ADD `piston_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `rod_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `last_oppama_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `current_piston_size` text DEFAULT '' NOT NULL;
