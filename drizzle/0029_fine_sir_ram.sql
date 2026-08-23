ALTER TABLE `race_accommodations` ADD `website_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_accommodations` ADD `booking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_accommodations` ADD `track_distance_km` real;--> statement-breakpoint
ALTER TABLE `race_accommodations` ADD `track_drive_minutes` integer;