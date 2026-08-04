CREATE TABLE `organizations` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `organizations` (`id`, `name`, `active`)
VALUES ('00000000-0000-4000-8000-000000000000', 'Openers', true)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `active` = true;
--> statement-breakpoint
ALTER TABLE `teams` DROP INDEX `teams_name_unique`;--> statement-breakpoint
DROP INDEX `teams_active_idx` ON `teams`;--> statement-breakpoint
ALTER TABLE `profiles` ADD `organization_id` varchar(36) DEFAULT '00000000-0000-4000-8000-000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `organization_id` varchar(36) DEFAULT '00000000-0000-4000-8000-000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `archived_at` datetime;--> statement-breakpoint
ALTER TABLE `teams` ADD `deleted_at` datetime;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organization_name_unique` UNIQUE(`organization_id`,`name`);--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `profiles_organization_idx` ON `profiles` (`organization_id`);--> statement-breakpoint
CREATE INDEX `teams_visibility_idx` ON `teams` (`organization_id`,`active`,`archived_at`,`deleted_at`);
