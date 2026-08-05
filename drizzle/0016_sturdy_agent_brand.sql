CREATE TABLE `coaching_session_participants` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`team_id_snapshot` varchar(36),
	`team_name_snapshot` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coaching_session_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaching_participant_session_agent_unique` UNIQUE(`session_id`,`agent_profile_id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_sessions` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`created_by_profile_id` varchar(36) NOT NULL,
	`coach_profile_id` varchar(36) NOT NULL,
	`category` enum('performance','adherence','improvement') NOT NULL,
	`note` varchar(2000),
	`session_date` date NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coaching_session_participants` ADD CONSTRAINT `coaching_session_participants_session_id_coaching_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `coaching_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_session_participants` ADD CONSTRAINT `coaching_session_participants_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_session_participants` ADD CONSTRAINT `coaching_session_participants_team_id_snapshot_teams_id_fk` FOREIGN KEY (`team_id_snapshot`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_sessions` ADD CONSTRAINT `coaching_sessions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_sessions` ADD CONSTRAINT `coaching_sessions_created_by_profile_id_profiles_id_fk` FOREIGN KEY (`created_by_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_sessions` ADD CONSTRAINT `coaching_sessions_coach_profile_id_profiles_id_fk` FOREIGN KEY (`coach_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coaching_participant_agent_idx` ON `coaching_session_participants` (`agent_profile_id`);--> statement-breakpoint
CREATE INDEX `coaching_participant_team_idx` ON `coaching_session_participants` (`team_id_snapshot`);--> statement-breakpoint
CREATE INDEX `coaching_sessions_organization_date_idx` ON `coaching_sessions` (`organization_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `coaching_sessions_coach_date_idx` ON `coaching_sessions` (`coach_profile_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `coaching_sessions_creator_date_idx` ON `coaching_sessions` (`created_by_profile_id`,`session_date`);
--> statement-breakpoint
INSERT INTO `permissions` (`permission_key`, `description`) VALUES
  ('coaching.view_team', 'View coaching for assigned active teams'),
  ('coaching.create_team', 'Create coaching for assigned active teams'),
  ('coaching.view_company', 'View organization-wide coaching'),
  ('coaching.create_company', 'Create organization-wide coaching'),
  ('flags.view_own', 'View own performance and transfer flags'),
  ('flags.view_team', 'View flags for assigned active teams'),
  ('flags.view_company', 'View organization-wide flags')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `roles` (`id`, `name`, `description`) VALUES
  ('admin', 'Administrator', 'Company-wide administration'),
  ('manager', 'Manager', 'Assigned-team operations'),
  ('agent', 'Agent', 'Personal performance access')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`);
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_key`) VALUES
  ('admin', 'coaching.view_team'),
  ('admin', 'coaching.create_team'),
  ('admin', 'coaching.view_company'),
  ('admin', 'coaching.create_company'),
  ('admin', 'flags.view_own'),
  ('admin', 'flags.view_team'),
  ('admin', 'flags.view_company'),
  ('manager', 'coaching.view_team'),
  ('manager', 'coaching.create_team'),
  ('manager', 'flags.view_team'),
  ('agent', 'flags.view_own');
