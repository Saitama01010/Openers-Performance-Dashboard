ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `metric_hour` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `ringing_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `idle_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `untracked_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `metric_granularity` enum('hourly','daily') DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `metric_key` varchar(24);--> statement-breakpoint
UPDATE `dialer_agent_hourly_metrics`
SET `metric_key` = CONCAT('hour:', LPAD(CAST(`metric_hour` AS CHAR), 2, '0'))
WHERE `metric_key` IS NULL;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `metric_key` varchar(24) NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `system_pause_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD `net_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_dataset_versions` ADD `metric_granularity` enum('hourly','daily') DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `metric_granularity` enum('hourly','daily') DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `selected_reporting_date` date;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD `metric_granularity` enum('hourly','daily') DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD `system_pause_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_import_rows` ADD `net_seconds` int;--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_version_metric_key_unique` UNIQUE(`version_id`,`agent_profile_id`,`metric_date`,`metric_key`);
