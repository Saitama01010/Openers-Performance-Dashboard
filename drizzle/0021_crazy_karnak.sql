CREATE TABLE `email_outbox` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36),
	`profile_id` varchar(36),
	`reference_id` varchar(36),
	`message_type` varchar(80) NOT NULL,
	`recipient_email` varchar(255) NOT NULL,
	`encrypted_payload` longtext,
	`idempotency_key` varchar(190) NOT NULL,
	`email_outbox_status` enum('queued','processing','retry','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
	`attempt_count` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 5,
	`next_attempt_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`processing_started_at` datetime,
	`lease_owner` varchar(120),
	`lease_expires_at` datetime,
	`sent_at` datetime,
	`failed_at` datetime,
	`provider` varchar(40),
	`provider_message_id` varchar(255),
	`failure_code` varchar(80),
	`failure_reason` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_outbox_idempotency_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`actor_profile_id` varchar(36),
	`import_type` varchar(64) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`background_job_status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`attempt_count` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`available_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`queued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`processing_started_at` datetime,
	`heartbeat_at` datetime,
	`lease_owner` varchar(120),
	`lease_expires_at` datetime,
	`completed_at` datetime,
	`failed_at` datetime,
	`failure_code` varchar(80),
	`failure_reason` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_jobs_batch_unique` UNIQUE(`batch_id`)
);
--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `raw_file_content` longtext;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `processed_preview` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `processed_validation` json;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `raw_file_retain_until` datetime;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `raw_file_purged_at` datetime;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_actor_profile_id_profiles_id_fk` FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_batch_id_dialer_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `dialer_import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `email_outbox_claim_idx` ON `email_outbox` (`email_outbox_status`,`next_attempt_at`,`lease_expires_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_outbox_organization_created_idx` ON `email_outbox` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_outbox_profile_idx` ON `email_outbox` (`profile_id`);--> statement-breakpoint
CREATE INDEX `email_outbox_reference_idx` ON `email_outbox` (`reference_id`);--> statement-breakpoint
CREATE INDEX `email_outbox_provider_message_idx` ON `email_outbox` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `import_jobs_claim_idx` ON `import_jobs` (`background_job_status`,`available_at`,`lease_expires_at`,`queued_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_organization_created_idx` ON `import_jobs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_actor_idx` ON `import_jobs` (`actor_profile_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_created_idx` ON `audit_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `dialer_dataset_scope_status_version_idx` ON `dialer_dataset_versions` (`scope_key`,`dataset_version_status`,`version_number`);--> statement-breakpoint
CREATE INDEX `email_delivery_status_created_idx` ON `email_delivery_attempts` (`email_delivery_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_errors_batch_row_idx` ON `import_errors` (`batch_id`,`row_number`);--> statement-breakpoint
CREATE INDEX `import_errors_batch_status_idx` ON `import_errors` (`batch_id`,`import_row_status`);--> statement-breakpoint
CREATE INDEX `profiles_organization_access_idx` ON `profiles` (`organization_id`,`role`,`account_status`,`active`);--> statement-breakpoint
CREATE INDEX `sessions_cleanup_idx` ON `sessions` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_last_seen_idx` ON `sessions` (`last_seen_at`);