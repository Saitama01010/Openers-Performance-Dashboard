ALTER TABLE `dialer_dataset_versions` MODIFY COLUMN `dataset_version_status` enum('draft','active','deactivated','superseded','rolled_back','rejected') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `dialer_import_batches` MODIFY COLUMN `import_status` enum('uploaded','processing','draft','validation_failed','ready_to_publish','active','deactivated','superseded','rolled_back','failed','rejected') NOT NULL DEFAULT 'uploaded';--> statement-breakpoint
INSERT INTO `permissions` (`permission_key`, `description`)
VALUES
  ('imports.deactivate', 'Deactivate active imports and resolve their dataset scopes'),
  ('imports.restore', 'Restore valid historical import versions')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_key`)
VALUES
  ('admin', 'imports.deactivate'),
  ('admin', 'imports.restore')
ON DUPLICATE KEY UPDATE
  `permission_key` = VALUES(`permission_key`);--> statement-breakpoint
UPDATE `permissions`
SET `description` = 'Permanently delete imports, including resolved active imports'
WHERE `permission_key` = 'imports.delete';
