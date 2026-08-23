CREATE TABLE `clothing_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sizes` text DEFAULT '[]' NOT NULL,
	`default_quantity` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mechanic_clothing_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`mechanic_id` text NOT NULL,
	`clothing_item_id` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mechanic_clothing_unique_idx` ON `mechanic_clothing_assignments` (`mechanic_id`,`clothing_item_id`);