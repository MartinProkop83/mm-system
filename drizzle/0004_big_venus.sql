ALTER TABLE `engines` ADD `baseline_total_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `baseline_piston_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `baseline_rod_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `baseline_last_oppama_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `baseline_piston_size` text DEFAULT '' NOT NULL;