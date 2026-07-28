CREATE TABLE `dialer_dataset_scopes` (
	`scope_key` varchar(512) NOT NULL,
	`source` varchar(64) NOT NULL,
	`import_type` varchar(64) NOT NULL,
	`reporting_date` date NOT NULL,
	`team_id` varchar(36),
	`dialer_id` varchar(120),
	`active_version_id` varchar(36),
	`revision` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dialer_dataset_scopes_scope_key` PRIMARY KEY(`scope_key`),
	CONSTRAINT `dialer_dataset_scope_fields_unique` UNIQUE(`scope_key`)
);
--> statement-breakpoint
CREATE TABLE `dialer_dataset_versions` (
	`id` varchar(36) NOT NULL,
	`import_batch_id` varchar(36),
	`scope_key` varchar(512) NOT NULL,
	`source` varchar(64) NOT NULL,
	`import_type` varchar(64) NOT NULL,
	`reporting_date` date NOT NULL,
	`team_id` varchar(36),
	`dialer_id` varchar(120),
	`version_number` int NOT NULL,
	`dataset_version_status` enum('draft','active','superseded','rolled_back','rejected') NOT NULL DEFAULT 'draft',
	`previous_version_id` varchar(36),
	`row_count` int NOT NULL DEFAULT 0,
	`matched_agent_count` int NOT NULL DEFAULT 0,
	`unmatched_agent_count` int NOT NULL DEFAULT 0,
	`total_calls` int NOT NULL DEFAULT 0,
	`total_logged_in_seconds` int NOT NULL DEFAULT 0,
	`total_talk_seconds` int NOT NULL DEFAULT 0,
	`total_wrap_seconds` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`activated_at` datetime,
	`superseded_at` datetime,
	CONSTRAINT `dialer_dataset_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `dialer_dataset_scope_version_unique` UNIQUE(`scope_key`,`version_number`),
	CONSTRAINT `dialer_dataset_import_scope_unique` UNIQUE(`import_batch_id`,`scope_key`)
);
--> statement-breakpoint
CREATE TABLE `dialer_import_rows` (
	`id` varchar(36) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`version_id` varchar(36),
	`row_number` int NOT NULL,
	`source_agent_name` varchar(255) NOT NULL,
	`normalized_agent_name` varchar(255) NOT NULL,
	`matched_agent_profile_id` varchar(36),
	`metric_date` date,
	`metric_hour` int,
	`calls` int,
	`logged_in_seconds` int,
	`ready_seconds` int,
	`talk_seconds` int,
	`ringing_seconds` int,
	`wrap_seconds` int,
	`paused_seconds` int,
	`idle_seconds` int,
	`untracked_seconds` int,
	`team_id_snapshot` varchar(36),
	`import_matching_status` enum('mapped','unmapped','ambiguous','out_of_scope','invalid_mapping') NOT NULL,
	`import_validation_status` enum('valid','warning','error') NOT NULL,
	`validation_messages` json,
	`warning_messages` json,
	`row_hash` varchar(64),
	`raw_row` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dialer_import_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `dialer_import_row_number_unique` UNIQUE(`batch_id`,`row_number`)
);
--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP INDEX `dialer_hourly_unique`;--> statement-breakpoint
DROP INDEX `dialer_import_file_hash_idx` ON `dialer_import_batches`;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `import_status` enum(
	'previewed',
	'partially_confirmed',
	'confirmed',
	'uploaded',
	'processing',
	'draft',
	'validation_failed',
	'ready_to_publish',
	'active',
	'superseded',
	'rolled_back',
	'failed',
	'rejected'
) NOT NULL DEFAULT 'uploaded';--> statement-breakpoint
UPDATE `dialer_import_batches`
SET `import_status` = CASE `import_status`
	WHEN 'previewed' THEN 'draft'
	WHEN 'partially_confirmed' THEN 'active'
	WHEN 'confirmed' THEN 'active'
	ELSE `import_status`
END;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `import_status` enum('uploaded','processing','draft','validation_failed','ready_to_publish','active','superseded','rolled_back','failed','rejected') NOT NULL DEFAULT 'uploaded';--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `raw_file_content` longtext NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `expires_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `version_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `import_type` varchar(64) DEFAULT 'agent_hours_performance' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `dialer_id` varchar(120);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `file_size_bytes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `storage_provider` varchar(40) DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `storage_location` varchar(512);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `matched_agent_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `unmatched_agent_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `reporting_start_date` date;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `reporting_end_date` date;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `validation_errors` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `validation_warnings` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `validation_notices` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `parsed_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `published_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `published_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `previous_import_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `warning_override_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `warning_override_reason` text;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `warning_override_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rejected_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rejected_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rolled_back_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rolled_back_at` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `rollback_reason` text;--> statement-breakpoint
UPDATE `dialer_import_batches`
SET
	`file_size_bytes` = octet_length(`raw_file_content`),
	`storage_location` = concat(
		'database://dialer_import_batches/',
		`id`,
		'/raw_file_content'
	),
	`published_by_id` = `confirmed_by_id`,
	`published_at` = `confirmed_at`;--> statement-breakpoint
INSERT INTO `dialer_dataset_versions` (
	`id`,
	`import_batch_id`,
	`scope_key`,
	`source`,
	`import_type`,
	`reporting_date`,
	`team_id`,
	`dialer_id`,
	`version_number`,
	`dataset_version_status`,
	`row_count`,
	`matched_agent_count`,
	`unmatched_agent_count`,
	`total_calls`,
	`total_logged_in_seconds`,
	`total_talk_seconds`,
	`total_wrap_seconds`,
	`activated_at`
)
SELECT
	uuid(),
	substring(
		max(
			concat(
				date_format(
					coalesce(`batches`.`confirmed_at`, `batches`.`created_at`),
					'%Y%m%d%H%i%s'
				),
				`metrics`.`batch_id`
			)
		),
		15
	),
	concat(
		`metrics`.`source`,
		'|agent_hours_performance|',
		date_format(`metrics`.`metric_date`, '%Y-%m-%d'),
		'|team:',
		coalesce(`metrics`.`team_id_snapshot`, 'company'),
		'|dialer:default'
	),
	`metrics`.`source`,
	'agent_hours_performance',
	`metrics`.`metric_date`,
	`metrics`.`team_id_snapshot`,
	NULL,
	1,
	'active',
	count(*),
	count(distinct `metrics`.`agent_profile_id`),
	0,
	coalesce(sum(`metrics`.`calls`), 0),
	coalesce(sum(`metrics`.`logged_in_seconds`), 0),
	coalesce(sum(`metrics`.`talk_seconds`), 0),
	coalesce(sum(`metrics`.`wrap_seconds`), 0),
	now()
FROM `dialer_agent_hourly_metrics` AS `metrics`
INNER JOIN `dialer_import_batches` AS `batches`
	ON `batches`.`id` = `metrics`.`batch_id`
GROUP BY
	`metrics`.`source`,
	`metrics`.`metric_date`,
	`metrics`.`team_id_snapshot`;--> statement-breakpoint
UPDATE `dialer_agent_hourly_metrics` AS `metrics`
INNER JOIN `dialer_dataset_versions` AS `versions`
	ON `versions`.`source` = `metrics`.`source`
	AND `versions`.`reporting_date` = `metrics`.`metric_date`
	AND `versions`.`team_id` <=> `metrics`.`team_id_snapshot`
	AND `versions`.`dataset_version_status` = 'active'
SET `metrics`.`version_id` = `versions`.`id`;--> statement-breakpoint
INSERT INTO `dialer_dataset_scopes` (
	`scope_key`,
	`source`,
	`import_type`,
	`reporting_date`,
	`team_id`,
	`dialer_id`,
	`active_version_id`,
	`revision`
)
SELECT
	`scope_key`,
	`source`,
	`import_type`,
	`reporting_date`,
	`team_id`,
	`dialer_id`,
	`id`,
	1
FROM `dialer_dataset_versions`
WHERE `dataset_version_status` = 'active';--> statement-breakpoint
UPDATE `dialer_import_batches` AS `batches`
LEFT JOIN `dialer_dataset_versions` AS `versions`
	ON `versions`.`import_batch_id` = `batches`.`id`
	AND `versions`.`dataset_version_status` = 'active'
SET `batches`.`import_status` = 'superseded'
WHERE
	`batches`.`import_status` = 'active'
	AND `versions`.`id` IS NULL;--> statement-breakpoint
UPDATE `dialer_import_batches` AS `batches`
INNER JOIN (
	SELECT
		`metrics`.`batch_id`,
		min(`metrics`.`metric_date`) AS `start_date`,
		max(`metrics`.`metric_date`) AS `end_date`,
		count(distinct `metrics`.`agent_profile_id`) AS `matched_agents`
	FROM `dialer_agent_hourly_metrics` AS `metrics`
	GROUP BY `metrics`.`batch_id`
) AS `metric_summary`
	ON `metric_summary`.`batch_id` = `batches`.`id`
SET
	`batches`.`reporting_start_date` = `metric_summary`.`start_date`,
	`batches`.`reporting_end_date` = `metric_summary`.`end_date`,
	`batches`.`matched_agent_count` = `metric_summary`.`matched_agents`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_version_hourly_unique` UNIQUE(`version_id`,`agent_profile_id`,`metric_date`,`metric_hour`);--> statement-breakpoint
ALTER TABLE `dialer_dataset_scopes` ADD CONSTRAINT `dialer_dataset_scopes_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_dataset_scopes` ADD CONSTRAINT `dialer_scope_active_version_fk` FOREIGN KEY (`active_version_id`) REFERENCES `dialer_dataset_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_dataset_versions` ADD CONSTRAINT `dialer_version_import_batch_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_dataset_versions` ADD CONSTRAINT `dialer_dataset_versions_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_dataset_versions` ADD CONSTRAINT `dialer_dataset_previous_version_fk` FOREIGN KEY (`previous_version_id`) REFERENCES `dialer_dataset_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD CONSTRAINT `dialer_import_rows_batch_id_dialer_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD CONSTRAINT `dialer_import_rows_version_id_dialer_dataset_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `dialer_dataset_versions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD CONSTRAINT `dialer_import_rows_matched_agent_profile_id_profiles_id_fk` FOREIGN KEY (`matched_agent_profile_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD CONSTRAINT `dialer_import_rows_team_id_snapshot_teams_id_fk` FOREIGN KEY (`team_id_snapshot`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dialer_dataset_scope_active_idx` ON `dialer_dataset_scopes` (`active_version_id`);--> statement-breakpoint
CREATE INDEX `dialer_dataset_scope_lookup_idx` ON `dialer_dataset_scopes` (`source`,`import_type`,`reporting_date`,`team_id`,`dialer_id`);--> statement-breakpoint
CREATE INDEX `dialer_dataset_version_status_idx` ON `dialer_dataset_versions` (`dataset_version_status`);--> statement-breakpoint
CREATE INDEX `dialer_dataset_version_scope_idx` ON `dialer_dataset_versions` (`source`,`import_type`,`reporting_date`,`team_id`,`dialer_id`);--> statement-breakpoint
CREATE INDEX `dialer_import_row_batch_status_idx` ON `dialer_import_rows` (`batch_id`,`import_validation_status`);--> statement-breakpoint
CREATE INDEX `dialer_import_row_agent_idx` ON `dialer_import_rows` (`matched_agent_profile_id`);--> statement-breakpoint
CREATE INDEX `dialer_import_row_version_idx` ON `dialer_import_rows` (`version_id`);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_hourly_version_fk` FOREIGN KEY (`version_id`) REFERENCES `dialer_dataset_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_published_by_id_profiles_id_fk` FOREIGN KEY (`published_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_warning_override_by_id_profiles_id_fk` FOREIGN KEY (`warning_override_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_rejected_by_id_profiles_id_fk` FOREIGN KEY (`rejected_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_rolled_back_by_id_profiles_id_fk` FOREIGN KEY (`rolled_back_by_id`) REFERENCES `profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_previous_import_fk` FOREIGN KEY (`previous_import_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dialer_hourly_version_idx` ON `dialer_agent_hourly_metrics` (`version_id`);--> statement-breakpoint
CREATE INDEX `dialer_hourly_batch_idx` ON `dialer_agent_hourly_metrics` (`batch_id`);--> statement-breakpoint
CREATE INDEX `dialer_import_status_idx` ON `dialer_import_batches` (`import_status`);--> statement-breakpoint
CREATE INDEX `dialer_import_reporting_idx` ON `dialer_import_batches` (`source`,`import_type`,`reporting_start_date`,`reporting_end_date`);--> statement-breakpoint
CREATE INDEX `dialer_import_published_by_idx` ON `dialer_import_batches` (`published_by_id`);--> statement-breakpoint
CREATE INDEX `dialer_import_file_hash_idx` ON `dialer_import_batches` (`source`,`import_type`,`file_hash`);
