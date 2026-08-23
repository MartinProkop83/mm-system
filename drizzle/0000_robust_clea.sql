CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`locale` text DEFAULT 'cs' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engines` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`serial_number` text DEFAULT '' NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`total_minutes` integer DEFAULT 0 NOT NULL,
	`service_interval_minutes` integer DEFAULT 360 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engines_code_unique` ON `engines` (`code`);--> statement-breakpoint
CREATE TABLE `races` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`series` text DEFAULT '' NOT NULL,
	`track` text NOT NULL,
	`country_code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
