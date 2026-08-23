CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`vat_id` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'ks' NOT NULL,
	`price_czk_cents` integer DEFAULT 0 NOT NULL,
	`price_eur_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_parts_code_unique` ON `inventory_parts` (`code`);--> statement-breakpoint
CREATE TABLE `service_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_czk_cents` integer DEFAULT 0 NOT NULL,
	`price_eur_cents` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `sales` ADD `team_id` text;