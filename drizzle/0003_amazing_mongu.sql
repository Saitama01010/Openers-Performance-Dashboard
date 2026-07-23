CREATE TABLE `email_delivery_attempts` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36),
	`token_id` varchar(36),
	`message_type` varchar(80) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`recipient_email` varchar(255) NOT NULL,
	`email_delivery_status` enum('sent','failed') NOT NULL,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_delivery_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `source_user_mappings` DROP INDEX `source_user_mapping_unique`;--> statement-breakpoint
ALTER TABLE `account_invitation_tokens` ADD `invitation_delivery_status` enum('pending','accepted','expired','revoked','delivery_failed') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD `created_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `profiles` ADD `password_changed_at` datetime;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `active_mapping_key` varchar(384);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `primary_mapping_key` varchar(384);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `is_primary` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `approved_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `approved_at` datetime;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `deactivated_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `deactivated_at` datetime;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD `active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD `created_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `teams` ADD `deactivated_at` datetime;--> statement-breakpoint
UPDATE `profiles`
SET `password_changed_at` = coalesce(`password_changed_at`, `updated_at`)
WHERE `password_hash` IS NOT NULL;--> statement-breakpoint
UPDATE `account_invitation_tokens`
SET `invitation_delivery_status` = CASE
	WHEN `used_at` IS NOT NULL THEN 'accepted'
	WHEN `revoked_at` IS NOT NULL THEN 'revoked'
	WHEN `expires_at` <= now() THEN 'expired'
	ELSE 'pending'
END;--> statement-breakpoint
UPDATE `team_memberships`
SET `active` = CASE WHEN `ended_at` IS NULL THEN true ELSE false END;--> statement-breakpoint
UPDATE `source_user_mappings`
SET
	`active_mapping_key` = CASE
		WHEN `active` = true THEN concat(`source`, ':', `normalized_agent_name`)
		ELSE NULL
	END,
	`approved_at` = CASE
		WHEN `active` = true THEN coalesce(`approved_at`, `created_at`)
		ELSE `approved_at`
	END;--> statement-breakpoint
UPDATE `source_user_mappings` AS `mappings`
INNER JOIN (
	SELECT `source`, `profile_id`, min(`id`) AS `primary_id`
	FROM `source_user_mappings`
	WHERE `active` = true
	GROUP BY `source`, `profile_id`
) AS `primary_mappings` ON
	`primary_mappings`.`source` = `mappings`.`source`
	AND `primary_mappings`.`profile_id` = `mappings`.`profile_id`
	AND `primary_mappings`.`primary_id` = `mappings`.`id`
SET
	`mappings`.`is_primary` = true,
	`mappings`.`primary_mapping_key` = concat(`mappings`.`source`, ':', `mappings`.`profile_id`);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_active_mapping_unique` UNIQUE(`active_mapping_key`);--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_primary_mapping_unique` UNIQUE(`primary_mapping_key`);--> statement-breakpoint
ALTER TABLE `email_delivery_attempts` ADD CONSTRAINT `email_delivery_attempts_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_delivery_profile_idx` ON `email_delivery_attempts` (`profile_id`);--> statement-breakpoint
CREATE INDEX `email_delivery_token_idx` ON `email_delivery_attempts` (`token_id`);--> statement-breakpoint
CREATE INDEX `email_delivery_message_idx` ON `email_delivery_attempts` (`message_type`,`created_at`);--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_user_mappings_approved_by_id_profiles_id_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_user_mappings_deactivated_by_id_profiles_id_fk` FOREIGN KEY (`deactivated_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD CONSTRAINT `team_memberships_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `profiles_name_idx` ON `profiles` (`name`);--> statement-breakpoint
CREATE INDEX `profiles_role_idx` ON `profiles` (`role`);--> statement-breakpoint
CREATE INDEX `profiles_account_status_idx` ON `profiles` (`account_status`);--> statement-breakpoint
CREATE INDEX `profiles_created_at_idx` ON `profiles` (`created_at`);--> statement-breakpoint
CREATE INDEX `source_user_mappings_normalized_idx` ON `source_user_mappings` (`source`,`normalized_agent_name`);--> statement-breakpoint
CREATE INDEX `team_memberships_active_profile_idx` ON `team_memberships` (`profile_id`,`active`,`ended_at`);--> statement-breakpoint
CREATE INDEX `teams_active_idx` ON `teams` (`active`);
