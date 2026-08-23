CREATE TABLE `circuits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country_code` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`maps_url` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`distance_km` real,
	`drive_minutes` integer,
	`image_key` text,
	`image_content_type` text,
	`image_updated_at` integer,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `races` ADD `circuit_id` text;