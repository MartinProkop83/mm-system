CREATE TABLE `race_entry_finance` (
	`race_entry_id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`base_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`discount_basis_points` integer DEFAULT 0 NOT NULL,
	`final_price_cents` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT '' NOT NULL,
	`is_paid` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'task' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` text,
	`assignee_name` text DEFAULT '' NOT NULL,
	`race_id` text,
	`completed_by` text,
	`completed_at` integer,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `race_entries` ADD `engine_1_configuration` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_entries` ADD `engine_2_configuration` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_entries` ADD `engine_3_configuration` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sale_items` ADD `line_kind` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `race_id` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `payment_method` text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `is_paid` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `is_delivered` integer DEFAULT false NOT NULL;