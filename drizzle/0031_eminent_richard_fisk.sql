CREATE TABLE `equipment_rental_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`direction` text NOT NULL,
	`transport_mode` text DEFAULT 'carrier' NOT NULL,
	`carrier` text DEFAULT '' NOT NULL,
	`tracking_url` text DEFAULT '' NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equipment_rental_shipments_rental_idx` ON `equipment_rental_shipments` (`rental_id`,`direction`);--> statement-breakpoint
ALTER TABLE `equipment_rental_items` ADD `billable_days` integer;--> statement-breakpoint
ALTER TABLE `equipment_rental_items` ADD `driver_id` text;--> statement-breakpoint
ALTER TABLE `equipment_rental_items` ADD `driver_name_snapshot` text DEFAULT '' NOT NULL;