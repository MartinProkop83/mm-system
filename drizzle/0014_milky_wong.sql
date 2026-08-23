CREATE TABLE `race_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`is_paid` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
