-- Custom SQL migration file, put your code below! --
ALTER TABLE `dialer_import_batches` DROP INDEX `dialer_import_file_unique`;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `detected_headers` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `missing_required_headers` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `raw_file_content` text;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `expires_at` datetime;--> statement-breakpoint
UPDATE `dialer_import_batches`
SET
  `raw_file_content` = coalesce(`raw_file_content`, ''),
  `expires_at` = coalesce(`expires_at`, date_add(now(), interval 30 minute));--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY `raw_file_content` text NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY `expires_at` datetime NOT NULL;--> statement-breakpoint
CREATE INDEX `dialer_import_file_hash_idx` ON `dialer_import_batches` (`source`,`file_hash`);--> statement-breakpoint
CREATE INDEX `dialer_import_expires_at_idx` ON `dialer_import_batches` (`expires_at`);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `logged_in_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `ready_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `talk_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `ringing_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `wrap_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `paused_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `idle_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `untracked_seconds` int NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `dialer_agent_hourly_metrics`
SET
  `logged_in_seconds` = time_to_sec(`login_time`),
  `ready_seconds` = time_to_sec(`ready_time`),
  `talk_seconds` = time_to_sec(`talk_time`),
  `ringing_seconds` = time_to_sec(`ringing_time`),
  `wrap_seconds` = time_to_sec(`wrap_time`),
  `paused_seconds` = time_to_sec(`paused_time`),
  `idle_seconds` = time_to_sec(`idle_time`),
  `untracked_seconds` = time_to_sec(`untracked_time`);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `login_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `ready_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `talk_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `ringing_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `wrap_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `paused_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `idle_time`;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` DROP COLUMN `untracked_time`;
