ALTER TABLE `inventory_parts` ADD `categories` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_parts` ADD `image_key` text;--> statement-breakpoint
ALTER TABLE `inventory_parts` ADD `image_content_type` text;--> statement-breakpoint
ALTER TABLE `inventory_parts` ADD `image_updated_at` integer;