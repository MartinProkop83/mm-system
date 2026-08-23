CREATE TABLE `carburetor_service_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`carburetor_id` text NOT NULL,
	`service_date` text NOT NULL,
	`service_type` text NOT NULL,
	`mechanic_id` text,
	`mechanic_name_snapshot` text DEFAULT '' NOT NULL,
	`work_done` text DEFAULT '' NOT NULL,
	`replaced_parts` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
