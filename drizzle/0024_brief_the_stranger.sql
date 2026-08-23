ALTER TABLE `sale_items` ADD `description_en_snapshot` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_catalog` ADD `description_cs` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_catalog` ADD `description_en` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `service_catalog` SET `description_cs` = `description` WHERE `description_cs` = '' AND `description` != '';
