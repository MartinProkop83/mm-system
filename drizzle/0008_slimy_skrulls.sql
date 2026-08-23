CREATE TABLE `carburetor_types` (
	`id` text PRIMARY KEY NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `carburetors` ADD `carburetor_type_id` text;--> statement-breakpoint
ALTER TABLE `carburetors` ADD `category` text DEFAULT '' NOT NULL;