DROP INDEX `engines_code_unique`;--> statement-breakpoint
ALTER TABLE `engines` ADD `label_color` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `engines`
SET `category` = CASE
	WHEN `family` = 'MINI' AND UPPER(COALESCE(`current_configuration`, '')) LIKE 'BABY%' THEN 'BABY'
	WHEN `family` = 'MINI' THEN 'MINI'
	WHEN `family` IN ('OKN', 'OKN-J') THEN 'OKN'
	ELSE COALESCE(NULLIF(`family`, ''), `category`)
END;--> statement-breakpoint
CREATE UNIQUE INDEX `engines_code_category_unique` ON `engines` (`code`,`category`);
