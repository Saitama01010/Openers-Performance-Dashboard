ALTER TABLE `email_outbox` DROP FOREIGN KEY `email_outbox_organization_id_organizations_id_fk`;
--> statement-breakpoint
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;