CREATE TABLE `carburetors` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`family` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`sold_at` integer,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carburetors_code_unique` ON `carburetors` (`code`);--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`team_id` text,
	`default_category` text DEFAULT '' NOT NULL,
	`race_number` text DEFAULT '' NOT NULL,
	`nationality` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mechanics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `race_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `race_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`category` text NOT NULL,
	`driver_id` text NOT NULL,
	`driver_name_snapshot` text NOT NULL,
	`team_id` text,
	`team_name_snapshot` text DEFAULT '' NOT NULL,
	`engine_1_id` text,
	`engine_1_code` text DEFAULT '' NOT NULL,
	`engine_2_id` text,
	`engine_2_code` text DEFAULT '' NOT NULL,
	`engine_3_id` text,
	`engine_3_code` text DEFAULT '' NOT NULL,
	`carburetor_1_id` text,
	`carburetor_1_code` text DEFAULT '' NOT NULL,
	`carburetor_2_id` text,
	`carburetor_2_code` text DEFAULT '' NOT NULL,
	`carburetor_3_id` text,
	`carburetor_3_code` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `race_extras` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`category` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`resource_code_snapshot` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `race_mechanics` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`mechanic_id` text NOT NULL,
	`mechanic_name_snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `race_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`vehicle_name_snapshot` text NOT NULL,
	`license_plate_snapshot` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`item_type` text NOT NULL,
	`resource_id` text,
	`code_snapshot` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`line_total_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_number` text NOT NULL,
	`sale_date` text NOT NULL,
	`customer_name` text NOT NULL,
	`document_number` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_sale_number_unique` ON `sales` (`sale_number`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country_code` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`license_plate` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `engines` ADD `sold_at` integer;--> statement-breakpoint
ALTER TABLE `races` ADD `race_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `departure_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `return_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `organizer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `notes` text DEFAULT '' NOT NULL;