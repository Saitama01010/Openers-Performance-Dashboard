ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_actor_profile_id_profiles_id_fk`;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `organization_id` varchar(36);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `actor_display_name` varchar(255);--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD `organization_id` varchar(36) DEFAULT '00000000-0000-4000-8000-000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_import_batches` ADD `organization_id` varchar(36) DEFAULT '00000000-0000-4000-8000-000000000000' NOT NULL;--> statement-breakpoint
UPDATE `audit_logs` AS `audit`
LEFT JOIN `profiles` AS `actor` ON `actor`.`id` = `audit`.`actor_profile_id`
LEFT JOIN `profiles` AS `target` ON `audit`.`entity_type` = 'profile' AND `target`.`id` = `audit`.`entity_id`
SET
  `audit`.`organization_id` = COALESCE(`actor`.`organization_id`, `target`.`organization_id`, '00000000-0000-4000-8000-000000000000'),
  `audit`.`actor_display_name` = `actor`.`name`;--> statement-breakpoint
UPDATE `dialer_import_batches` AS `batch`
INNER JOIN `profiles` AS `uploader` ON `uploader`.`id` = `batch`.`uploaded_by_id`
SET `batch`.`organization_id` = `uploader`.`organization_id`;--> statement-breakpoint
UPDATE `user_import_batches` AS `batch`
INNER JOIN `profiles` AS `uploader` ON `uploader`.`id` = `batch`.`uploaded_by_id`
SET `batch`.`organization_id` = `uploader`.`organization_id`;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_profile_id_profiles_id_fk` FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dialer_import_batches` ADD CONSTRAINT `dialer_import_batches_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_import_batches` ADD CONSTRAINT `user_import_batches_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_organization_created_idx` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_history_idx` ON `audit_logs` (`organization_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dialer_import_organization_status_idx` ON `dialer_import_batches` (`organization_id`,`import_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_import_organization_status_idx` ON `user_import_batches` (`organization_id`,`user_import_status`,`created_at`);
