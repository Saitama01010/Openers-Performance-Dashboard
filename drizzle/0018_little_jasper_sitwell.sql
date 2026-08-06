CREATE TABLE `coaching_report_revisions` (
	`id` varchar(36) NOT NULL,
	`report_id` varchar(36) NOT NULL,
	`revision` int NOT NULL,
	`snapshot` json NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coaching_report_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaching_report_revision_unique` UNIQUE(`report_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `coaching_reports` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`coaching_session_id` varchar(36) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`coach_profile_id` varchar(36) NOT NULL,
	`template_id` varchar(36) NOT NULL,
	`template_version` int NOT NULL,
	`criterion_scores` json NOT NULL,
	`strengths` text,
	`improvement_areas` text,
	`action_items` json,
	`follow_up_date` date,
	`overall_score` decimal(7,2) NOT NULL,
	`coaching_report_status` enum('draft','finalized','published','acknowledged') NOT NULL DEFAULT 'draft',
	`revision` int NOT NULL DEFAULT 1,
	`finalized_by_id` varchar(36),
	`finalized_at` datetime,
	`published_by_id` varchar(36),
	`published_at` datetime,
	`acknowledged_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaching_report_session_agent_unique` UNIQUE(`coaching_session_id`,`agent_profile_id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_rubric_templates` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`version` int NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`sections` json NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_rubric_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaching_rubric_template_version_unique` UNIQUE(`organization_id`,`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `employment_status_events` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`employment_status` enum('active','deactivated','terminated') NOT NULL DEFAULT 'active',
	`effective_at` datetime NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employment_status_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manual_flag_case_events` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`actor_profile_id` varchar(36) NOT NULL,
	`event_type` varchar(120) NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `manual_flag_case_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manual_flag_cases` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`team_id_snapshot` varchar(36) NOT NULL,
	`raised_by_id` varchar(36) NOT NULL,
	`assigned_owner_id` varchar(36),
	`category` varchar(120) NOT NULL,
	`manual_flag_severity` enum('low','medium','high','critical') NOT NULL,
	`reason` text NOT NULL,
	`internal_notes` text,
	`manual_flag_status` enum('open','under_review','action_required','coaching_scheduled','resolved','dismissed') NOT NULL DEFAULT 'open',
	`related_coaching_session_id` varchar(36),
	`action_due_date` date,
	`required_action` text,
	`resolution` text,
	`published_to_agent` boolean NOT NULL DEFAULT false,
	`resolved_by_id` varchar(36),
	`resolved_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manual_flag_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performance_targets` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`team_id` varchar(36),
	`performance_target_metric` enum('transfers','closed_deals','conversion') NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	`effective_from` date NOT NULL,
	`effective_to` date,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performance_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadowing_sessions` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`team_id_snapshot` varchar(36) NOT NULL,
	`assigned_leader_id` varchar(36) NOT NULL,
	`scheduled_date` date NOT NULL,
	`completed_at` datetime,
	`shadowing_status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`objective` text NOT NULL,
	`internal_notes` text,
	`published_outcome` text,
	`follow_up_action` text,
	`published_to_agent` boolean NOT NULL DEFAULT false,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shadowing_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_transfer_requests` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`source_team_id` varchar(36) NOT NULL,
	`destination_team_id` varchar(36) NOT NULL,
	`reason` text NOT NULL,
	`requested_by_id` varchar(36) NOT NULL,
	`requested_at` datetime NOT NULL,
	`team_transfer_request_status` enum('draft','submitted','approved','rejected','applied','cancelled') NOT NULL DEFAULT 'draft',
	`reviewed_by_id` varchar(36),
	`review_note` text,
	`reviewed_at` datetime,
	`applied_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_transfer_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenure_thresholds` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`team_id` varchar(36),
	`band_label` varchar(120) NOT NULL,
	`minimum_days` int NOT NULL,
	`maximum_days` int,
	`is_ramp` boolean NOT NULL DEFAULT false,
	`minimum_transfers` decimal(12,2),
	`minimum_closed_deals` decimal(12,2),
	`minimum_conversion` decimal(7,2),
	`minimum_shift_coverage` decimal(7,2),
	`effective_from` date NOT NULL,
	`effective_to` date,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenure_thresholds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profiles` ADD `employment_start_date` date;--> statement-breakpoint
ALTER TABLE `profiles` ADD `employment_end_date` date;--> statement-breakpoint
ALTER TABLE `profiles` ADD `employment_status` enum('active','deactivated','terminated') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `coaching_report_revisions` ADD CONSTRAINT `coaching_report_revisions_report_id_coaching_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `coaching_reports`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_report_revisions` ADD CONSTRAINT `coaching_report_revisions_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_coaching_session_id_coaching_sessions_id_fk` FOREIGN KEY (`coaching_session_id`) REFERENCES `coaching_sessions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_coach_profile_id_profiles_id_fk` FOREIGN KEY (`coach_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_template_id_coaching_rubric_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `coaching_rubric_templates`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_finalized_by_id_profiles_id_fk` FOREIGN KEY (`finalized_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_reports` ADD CONSTRAINT `coaching_reports_published_by_id_profiles_id_fk` FOREIGN KEY (`published_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_rubric_templates` ADD CONSTRAINT `coaching_rubric_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_rubric_templates` ADD CONSTRAINT `coaching_rubric_templates_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_status_events` ADD CONSTRAINT `employment_status_events_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_status_events` ADD CONSTRAINT `employment_status_events_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employment_status_events` ADD CONSTRAINT `employment_status_events_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_case_events` ADD CONSTRAINT `manual_flag_case_events_case_id_manual_flag_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `manual_flag_cases`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_case_events` ADD CONSTRAINT `manual_flag_case_events_actor_profile_id_profiles_id_fk` FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_team_id_snapshot_teams_id_fk` FOREIGN KEY (`team_id_snapshot`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_raised_by_id_profiles_id_fk` FOREIGN KEY (`raised_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_assigned_owner_id_profiles_id_fk` FOREIGN KEY (`assigned_owner_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_related_session_fk` FOREIGN KEY (`related_coaching_session_id`) REFERENCES `coaching_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manual_flag_cases` ADD CONSTRAINT `manual_flag_cases_resolved_by_id_profiles_id_fk` FOREIGN KEY (`resolved_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_targets` ADD CONSTRAINT `performance_targets_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_targets` ADD CONSTRAINT `performance_targets_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_targets` ADD CONSTRAINT `performance_targets_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shadowing_sessions` ADD CONSTRAINT `shadowing_sessions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shadowing_sessions` ADD CONSTRAINT `shadowing_sessions_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shadowing_sessions` ADD CONSTRAINT `shadowing_sessions_team_id_snapshot_teams_id_fk` FOREIGN KEY (`team_id_snapshot`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shadowing_sessions` ADD CONSTRAINT `shadowing_sessions_assigned_leader_id_profiles_id_fk` FOREIGN KEY (`assigned_leader_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shadowing_sessions` ADD CONSTRAINT `shadowing_sessions_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_source_team_id_teams_id_fk` FOREIGN KEY (`source_team_id`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_destination_team_id_teams_id_fk` FOREIGN KEY (`destination_team_id`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_requested_by_id_profiles_id_fk` FOREIGN KEY (`requested_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_transfer_requests` ADD CONSTRAINT `team_transfer_requests_reviewed_by_id_profiles_id_fk` FOREIGN KEY (`reviewed_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenure_thresholds` ADD CONSTRAINT `tenure_thresholds_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenure_thresholds` ADD CONSTRAINT `tenure_thresholds_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenure_thresholds` ADD CONSTRAINT `tenure_thresholds_created_by_id_profiles_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coaching_report_agent_status_idx` ON `coaching_reports` (`agent_profile_id`,`coaching_report_status`,`published_at`);--> statement-breakpoint
CREATE INDEX `coaching_report_organization_status_idx` ON `coaching_reports` (`organization_id`,`coaching_report_status`);--> statement-breakpoint
CREATE INDEX `coaching_rubric_template_active_idx` ON `coaching_rubric_templates` (`organization_id`,`active`);--> statement-breakpoint
CREATE INDEX `employment_events_profile_effective_idx` ON `employment_status_events` (`profile_id`,`effective_at`);--> statement-breakpoint
CREATE INDEX `employment_events_organization_idx` ON `employment_status_events` (`organization_id`);--> statement-breakpoint
CREATE INDEX `manual_flag_event_case_idx` ON `manual_flag_case_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `manual_flag_agent_status_idx` ON `manual_flag_cases` (`agent_profile_id`,`manual_flag_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `manual_flag_team_status_idx` ON `manual_flag_cases` (`team_id_snapshot`,`manual_flag_status`);--> statement-breakpoint
CREATE INDEX `manual_flag_owner_status_idx` ON `manual_flag_cases` (`assigned_owner_id`,`manual_flag_status`);--> statement-breakpoint
CREATE INDEX `performance_targets_resolution_idx` ON `performance_targets` (`organization_id`,`team_id`,`performance_target_metric`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE INDEX `shadowing_agent_status_idx` ON `shadowing_sessions` (`agent_profile_id`,`shadowing_status`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `shadowing_team_status_idx` ON `shadowing_sessions` (`team_id_snapshot`,`shadowing_status`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `team_transfer_agent_status_idx` ON `team_transfer_requests` (`agent_profile_id`,`team_transfer_request_status`);--> statement-breakpoint
CREATE INDEX `team_transfer_source_status_idx` ON `team_transfer_requests` (`source_team_id`,`team_transfer_request_status`);--> statement-breakpoint
CREATE INDEX `team_transfer_destination_status_idx` ON `team_transfer_requests` (`destination_team_id`,`team_transfer_request_status`);--> statement-breakpoint
CREATE INDEX `team_transfer_organization_status_idx` ON `team_transfer_requests` (`organization_id`,`team_transfer_request_status`);--> statement-breakpoint
CREATE INDEX `tenure_thresholds_resolution_idx` ON `tenure_thresholds` (`organization_id`,`team_id`,`effective_from`,`effective_to`,`minimum_days`);
--> statement-breakpoint
INSERT INTO `permissions` (`permission_key`, `description`) VALUES
  ('dashboard.view_own', 'View the personal role dashboard'),
  ('dashboard.view_team', 'View assigned-team dashboard metrics'),
  ('dashboard.view_company', 'View company-wide dashboard metrics'),
  ('dashboard.export_team', 'Export assigned-team dashboard reporting'),
  ('dashboard.export_company', 'Export company-wide dashboard reporting'),
  ('targets.manage', 'Manage effective-dated targets and tenure thresholds'),
  ('rubrics.manage', 'Manage coaching rubric templates'),
  ('coaching.submit_rubric_team', 'Submit team coaching rubric reports'),
  ('coaching.publish_team', 'Finalize and publish team coaching reports'),
  ('shadowing.manage_team', 'Manage assigned-team shadowing'),
  ('flags.raise_team_case', 'Raise assigned-team manual flag cases'),
  ('flags.update_team_case', 'Update assigned-team manual flag cases'),
  ('transfers.request_team', 'Request assigned-team agent transfers'),
  ('transfers.approve_company', 'Approve and apply company transfer requests'),
  ('users.create_team_agent', 'Create agents in assigned teams'),
  ('users.deactivate_team_agent', 'Deactivate agents in assigned teams'),
  ('users.terminate_team_agent', 'Terminate agents in assigned teams')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_key`) VALUES
  ('agent', 'dashboard.view_own'),
  ('manager', 'dashboard.view_team'),
  ('manager', 'dashboard.export_team'),
  ('manager', 'coaching.submit_rubric_team'),
  ('manager', 'coaching.publish_team'),
  ('manager', 'shadowing.manage_team'),
  ('manager', 'flags.raise_team_case'),
  ('manager', 'flags.update_team_case'),
  ('manager', 'transfers.request_team'),
  ('manager', 'users.create_team_agent'),
  ('manager', 'users.deactivate_team_agent'),
  ('manager', 'users.terminate_team_agent'),
  ('admin', 'dashboard.view_own'),
  ('admin', 'dashboard.view_team'),
  ('admin', 'dashboard.view_company'),
  ('admin', 'dashboard.export_team'),
  ('admin', 'dashboard.export_company'),
  ('admin', 'targets.manage'),
  ('admin', 'rubrics.manage'),
  ('admin', 'coaching.submit_rubric_team'),
  ('admin', 'coaching.publish_team'),
  ('admin', 'shadowing.manage_team'),
  ('admin', 'flags.raise_team_case'),
  ('admin', 'flags.update_team_case'),
  ('admin', 'transfers.request_team'),
  ('admin', 'transfers.approve_company'),
  ('admin', 'users.create_team_agent'),
  ('admin', 'users.deactivate_team_agent'),
  ('admin', 'users.terminate_team_agent')
ON DUPLICATE KEY UPDATE `permission_key` = VALUES(`permission_key`);
