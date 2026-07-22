CREATE TABLE `account_invitation_tokens` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`created_by_id` varchar(36),
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`revoked_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `account_invitation_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_invitation_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`revoked_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`permission_key` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permissions_permission_key` PRIMARY KEY(`permission_key`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_records` (
	`id` varchar(36) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`identifier_hash` varchar(64) NOT NULL,
	`window_started_at` datetime NOT NULL,
	`request_count` int NOT NULL DEFAULT 1,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_window_unique` UNIQUE(`scope`,`identifier_hash`,`window_started_at`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` varchar(32) NOT NULL,
	`permission_key` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_role_id_permission_key_pk` PRIMARY KEY(`role_id`,`permission_key`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_permission_overrides` (
	`profile_id` varchar(36) NOT NULL,
	`permission_key` varchar(120) NOT NULL,
	`allowed` boolean NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permission_overrides_profile_id_permission_key_pk` PRIMARY KEY(`profile_id`,`permission_key`)
);
--> statement-breakpoint
ALTER TABLE `source_user_mappings` DROP INDEX `source_user_mapping_unique`;--> statement-breakpoint
ALTER TABLE `profiles` MODIFY COLUMN `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `team_id_snapshot` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `team_name_snapshot` varchar(255);--> statement-breakpoint
ALTER TABLE `profiles` ADD `account_status` enum('invited','active','deactivated','revoked') DEFAULT 'invited' NOT NULL;--> statement-breakpoint
UPDATE `profiles`
SET `account_status` = CASE
	WHEN `active` = true AND `password_hash` IS NOT NULL THEN 'active'
	ELSE 'deactivated'
END;--> statement-breakpoint
ALTER TABLE `profiles` ADD `must_reset_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `last_login_at` datetime;--> statement-breakpoint
ALTER TABLE `profiles` ADD `access_revoked_at` datetime;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_at` datetime;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD `normalized_agent_name` varchar(255);--> statement-breakpoint
UPDATE `source_user_mappings`
SET `normalized_agent_name` = lower(regexp_replace(trim(`source_agent_name`), '[[:space:]]+', ' '));--> statement-breakpoint
ALTER TABLE `source_user_mappings` MODIFY `normalized_agent_name` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD `id` varchar(36);--> statement-breakpoint
UPDATE `team_memberships` SET `id` = uuid();--> statement-breakpoint
ALTER TABLE `team_memberships` MODIFY `id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD `started_at` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD `ended_at` datetime;--> statement-breakpoint
CREATE INDEX `team_memberships_active_team_idx` ON `team_memberships` (`team_id`,`ended_at`);--> statement-breakpoint
ALTER TABLE `team_memberships` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `teams` ADD `active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `dialer_agent_hourly_metrics` AS `metrics`
LEFT JOIN (
	SELECT `memberships`.`profile_id`, min(`memberships`.`team_id`) AS `team_id`
	FROM `team_memberships` AS `memberships`
	WHERE `memberships`.`ended_at` IS NULL
	GROUP BY `memberships`.`profile_id`
) AS `current_team` ON `current_team`.`profile_id` = `metrics`.`agent_profile_id`
LEFT JOIN `teams` ON `teams`.`id` = `current_team`.`team_id`
SET
	`metrics`.`team_id_snapshot` = `current_team`.`team_id`,
	`metrics`.`team_name_snapshot` = `teams`.`name`;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_user_mapping_unique` UNIQUE(`source`,`normalized_agent_name`);--> statement-breakpoint
ALTER TABLE `account_invitation_tokens` ADD CONSTRAINT `account_invitation_tokens_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_invitation_tokens` ADD CONSTRAINT `account_invitation_tokens_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_key_permissions_permission_key_fk` FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`permission_key`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_override_permission_fk` FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`permission_key`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_invitation_profile_idx` ON `account_invitation_tokens` (`profile_id`);--> statement-breakpoint
CREATE INDEX `account_invitation_expires_idx` ON `account_invitation_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `password_reset_profile_idx` ON `password_reset_tokens` (`profile_id`);--> statement-breakpoint
CREATE INDEX `password_reset_expires_idx` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `rate_limit_expires_idx` ON `rate_limit_records` (`expires_at`);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_agent_hourly_metrics_team_id_snapshot_teams_id_fk` FOREIGN KEY (`team_id_snapshot`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
