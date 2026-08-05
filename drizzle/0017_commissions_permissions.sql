INSERT INTO `permissions` (`permission_key`, `description`) VALUES
  ('commissions.view_own', 'View own monthly commissions'),
  ('commissions.view_team', 'View assigned-team monthly commissions'),
  ('commissions.view_company', 'View organization-wide monthly commissions'),
  ('commissions.export_team', 'Export assigned-team monthly commissions'),
  ('commissions.export_company', 'Export organization-wide monthly commissions')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_key`) VALUES
  ('admin', 'commissions.view_own'),
  ('admin', 'commissions.view_team'),
  ('admin', 'commissions.view_company'),
  ('admin', 'commissions.export_team'),
  ('admin', 'commissions.export_company'),
  ('manager', 'commissions.view_team'),
  ('manager', 'commissions.export_team'),
  ('agent', 'commissions.view_own');
