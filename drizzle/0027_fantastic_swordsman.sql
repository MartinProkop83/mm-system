ALTER TABLE `race_flights` ADD `trip_kind` text DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
UPDATE `race_flights` SET `trip_kind` = `direction`;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_departure_airport` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_arrival_airport` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_departure_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_arrival_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_airline` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `race_flights` ADD `return_flight_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `travel_attachments` ADD `leg` text DEFAULT 'general' NOT NULL;
