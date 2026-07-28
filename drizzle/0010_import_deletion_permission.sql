INSERT INTO `permissions` (`permission_key`, `description`)
VALUES (
	'imports.delete',
	'Permanently delete eligible historical imports'
)
ON DUPLICATE KEY UPDATE
	`description` = VALUES(`description`);--> statement-breakpoint
INSERT INTO `roles` (`id`, `name`, `description`)
VALUES (
	'admin',
	'Administrator',
	'Company-wide administration'
)
ON DUPLICATE KEY UPDATE
	`name` = VALUES(`name`),
	`description` = VALUES(`description`);--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_key`)
VALUES ('admin', 'imports.delete')
ON DUPLICATE KEY UPDATE
	`permission_key` = VALUES(`permission_key`);
