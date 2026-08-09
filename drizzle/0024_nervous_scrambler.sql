DROP INDEX `audit_logs_action_created_idx` ON `audit_logs`;--> statement-breakpoint
DROP INDEX `email_outbox_claim_idx` ON `email_outbox`;--> statement-breakpoint
DROP INDEX `import_jobs_claim_idx` ON `import_jobs`;--> statement-breakpoint
CREATE INDEX `audit_logs_organization_action_created_idx` ON `audit_logs` (`organization_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_outbox_available_claim_idx` ON `email_outbox` (`email_outbox_status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_outbox_stale_lease_idx` ON `email_outbox` (`email_outbox_status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `email_outbox_cleanup_idx` ON `email_outbox` (`email_outbox_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_available_claim_idx` ON `import_jobs` (`background_job_status`,`available_at`,`queued_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_stale_lease_idx` ON `import_jobs` (`background_job_status`,`lease_expires_at`);