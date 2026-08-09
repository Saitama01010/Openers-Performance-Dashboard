ALTER TABLE `user_import_batches` ADD `processing_started_at` datetime;--> statement-breakpoint
ALTER TABLE `user_import_batches` ADD `confirmation_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `user_import_batches` ADD `result_summary` json;--> statement-breakpoint
CREATE INDEX `user_import_processing_idx` ON `user_import_batches` (`user_import_status`,`processing_started_at`);