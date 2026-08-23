CREATE TABLE `race_followup_notes` (
	`race_id` text PRIMARY KEY NOT NULL,
	`next_race` text DEFAULT '' NOT NULL,
	`consumed` text DEFAULT '' NOT NULL,
	`missing` text DEFAULT '' NOT NULL,
	`other_notes` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `race_deliveries` ADD `is_delivered` integer DEFAULT false NOT NULL;