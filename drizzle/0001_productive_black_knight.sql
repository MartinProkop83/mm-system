ALTER TABLE `engines` ADD `family` text DEFAULT 'OKN' NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `ignition` text DEFAULT 'PVL' NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `kz_generation` text;--> statement-breakpoint
ALTER TABLE `engines` ADD `current_configuration` text;--> statement-breakpoint
ALTER TABLE `engines` ADD `upgrade_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engines` ADD `purchase_date` text;