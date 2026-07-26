CREATE TABLE `user_import_batches` (
	`id` varchar(36) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_hash` varchar(64) NOT NULL,
	`user_import_status` enum('previewed','confirmed') NOT NULL DEFAULT 'previewed',
	`uploaded_by_id` varchar(36) NOT NULL,
	`raw_file_content` text NOT NULL,
	`row_count` int NOT NULL DEFAULT 0,
	`expires_at` datetime NOT NULL,
	`confirmed_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `email` varchar(255);--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `account_status` enum('invited','active','deactivated','revoked','deleted') NOT NULL DEFAULT 'invited';--> statement-breakpoint
ALTER TABLE `team_memberships` MODIFY COLUMN `membership_role` enum('admin','manager','agent') NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `password_state` enum('temporary','permanent') DEFAULT 'permanent' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `encrypted_temporary_password` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `deleted_at` datetime;--> statement-breakpoint
ALTER TABLE `user_import_batches` ADD CONSTRAINT `user_import_batches_uploaded_by_id_profiles_id_fk` FOREIGN KEY (`uploaded_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_import_uploaded_by_idx` ON `user_import_batches` (`uploaded_by_id`);--> statement-breakpoint
CREATE INDEX `user_import_expires_at_idx` ON `user_import_batches` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_import_file_hash_idx` ON `user_import_batches` (`file_hash`);--> statement-breakpoint
CREATE INDEX `profiles_deleted_at_idx` ON `profiles` (`deleted_at`);--> statement-breakpoint
DELETE FROM `user_permission_overrides`
WHERE `permission_key` NOT IN (
	'teams.view',
	'teams.create',
	'teams.update',
	'teams.deactivate',
	'teams.assign_manager',
	'teams.assign_agents',
	'imports.preview',
	'imports.confirm',
	'imports.view_history',
	'imports.view_errors',
	'imports.company',
	'imports.team'
);
