CREATE TABLE `equipment_rental_items` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`item_type` text NOT NULL,
	`resource_id` text,
	`code_snapshot` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`daily_price_cents` integer DEFAULT 0 NOT NULL,
	`returned_date` text
);
--> statement-breakpoint
CREATE INDEX `equipment_rental_items_rental_idx` ON `equipment_rental_items` (`rental_id`);--> statement-breakpoint
CREATE INDEX `equipment_rental_items_resource_idx` ON `equipment_rental_items` (`item_type`,`resource_id`,`rental_id`);--> statement-breakpoint
CREATE TABLE `equipment_rentals` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_number` text NOT NULL,
	`customer_id` text,
	`team_id` text,
	`customer_name_snapshot` text NOT NULL,
	`created_date` text NOT NULL,
	`handover_date` text NOT NULL,
	`planned_return_date` text NOT NULL,
	`actual_return_date` text,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`is_paid` integer DEFAULT false NOT NULL,
	`deposit_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_rentals_rental_number_unique` ON `equipment_rentals` (`rental_number`);--> statement-breakpoint
CREATE INDEX `equipment_rentals_customer_idx` ON `equipment_rentals` (`customer_id`,`handover_date`);--> statement-breakpoint
CREATE INDEX `equipment_rentals_team_idx` ON `equipment_rentals` (`team_id`,`handover_date`);--> statement-breakpoint
CREATE INDEX `equipment_rentals_status_idx` ON `equipment_rentals` (`status`,`planned_return_date`);