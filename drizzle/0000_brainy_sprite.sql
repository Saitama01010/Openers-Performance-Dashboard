CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`actor_profile_id` varchar(36),
	`action` varchar(120) NOT NULL,
	`entity_type` varchar(120) NOT NULL,
	`entity_id` varchar(120),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dialer_agent_hourly_metrics` (
	`id` varchar(36) NOT NULL,
	`source` varchar(64) NOT NULL,
	`source_agent_name` varchar(255) NOT NULL,
	`agent_profile_id` varchar(36) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`metric_date` date NOT NULL,
	`metric_hour` int NOT NULL,
	`calls` int NOT NULL DEFAULT 0,
	`login_time` time NOT NULL DEFAULT '00:00:00',
	`ready_time` time NOT NULL DEFAULT '00:00:00',
	`talk_time` time NOT NULL DEFAULT '00:00:00',
	`ringing_time` time NOT NULL DEFAULT '00:00:00',
	`wrap_time` time NOT NULL DEFAULT '00:00:00',
	`paused_time` time NOT NULL DEFAULT '00:00:00',
	`idle_time` time NOT NULL DEFAULT '00:00:00',
	`untracked_time` time NOT NULL DEFAULT '00:00:00',
	`row_hash` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dialer_agent_hourly_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `dialer_hourly_unique` UNIQUE(`source`,`agent_profile_id`,`metric_date`,`metric_hour`)
);
--> statement-breakpoint
CREATE TABLE `dialer_import_batches` (
	`id` varchar(36) NOT NULL,
	`source` varchar(64) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_hash` varchar(64) NOT NULL,
	`import_status` enum('previewed','confirmed','rejected') NOT NULL DEFAULT 'previewed',
	`uploaded_by_id` varchar(36) NOT NULL,
	`row_count` int NOT NULL DEFAULT 0,
	`preview_summary` json,
	`confirmed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dialer_import_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `dialer_import_file_unique` UNIQUE(`source`,`file_hash`)
);
--> statement-breakpoint
CREATE TABLE `import_errors` (
	`id` varchar(36) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`row_number` int NOT NULL,
	`import_row_status` enum('new','changed','unchanged','invalid','unknown','out_of_scope') NOT NULL,
	`message` text NOT NULL,
	`raw_row` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` enum('admin','manager','agent') NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_user_mappings` (
	`id` varchar(36) NOT NULL,
	`source` varchar(64) NOT NULL,
	`source_agent_name` varchar(255) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `source_user_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_user_mapping_unique` UNIQUE(`source`,`source_agent_name`)
);
--> statement-breakpoint
CREATE TABLE `team_memberships` (
	`team_id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`membership_role` enum('manager','agent') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_memberships_team_id_profile_id_pk` PRIMARY KEY(`team_id`,`profile_id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `transfer_fixtures` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`agent_profile_id` varchar(36),
	`occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`status` varchar(64) NOT NULL,
	CONSTRAINT `transfer_fixtures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_profile_id_profiles_id_fk` FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_agent_hourly_metrics_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_agent_hourly_metrics_batch_id_dialer_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_uploaded_by_id_profiles_id_fk` FOREIGN KEY (`uploaded_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_errors` ADD CONSTRAINT `import_errors_batch_id_dialer_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_user_mappings` ADD CONSTRAINT `source_user_mappings_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD CONSTRAINT `team_memberships_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_memberships` ADD CONSTRAINT `team_memberships_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_fixtures` ADD CONSTRAINT `transfer_fixtures_agent_profile_id_profiles_id_fk` FOREIGN KEY (`agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_profile_id`);--> statement-breakpoint
CREATE INDEX `dialer_hourly_agent_date_idx` ON `dialer_agent_hourly_metrics` (`agent_profile_id`,`metric_date`);--> statement-breakpoint
CREATE INDEX `dialer_import_uploaded_by_idx` ON `dialer_import_batches` (`uploaded_by_id`);--> statement-breakpoint
CREATE INDEX `sessions_profile_idx` ON `sessions` (`profile_id`);--> statement-breakpoint
CREATE INDEX `source_user_mappings_profile_idx` ON `source_user_mappings` (`profile_id`);--> statement-breakpoint
CREATE INDEX `team_memberships_profile_idx` ON `team_memberships` (`profile_id`);