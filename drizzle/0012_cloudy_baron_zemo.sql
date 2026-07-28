ALTER TABLE `dialer_agent_hourly_metrics` DROP FOREIGN KEY `dialer_agent_hourly_metrics_batch_id_dialer_import_batches_id_fk`;
--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` MODIFY COLUMN `batch_id` varchar(36);--> statement-breakpoint
ALTER TABLE `dialer_agent_hourly_metrics` ADD CONSTRAINT `dialer_agent_hourly_metrics_batch_id_dialer_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE set null ON UPDATE no action;