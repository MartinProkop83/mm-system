CREATE TABLE `race_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `race_templates_name_unique` ON `race_templates` (`name`);--> statement-breakpoint
ALTER TABLE `races` ADD `race_template_id` text;