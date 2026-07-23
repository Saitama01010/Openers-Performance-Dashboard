ALTER TABLE `email_delivery_attempts` MODIFY COLUMN `email_delivery_status` enum('sent','accepted','failed') NOT NULL;--> statement-breakpoint
ALTER TABLE `email_delivery_attempts` ADD `provider_message_id` varchar(255);--> statement-breakpoint
ALTER TABLE `email_delivery_attempts` ADD `accepted_at` datetime;--> statement-breakpoint
ALTER TABLE `email_delivery_attempts` ADD `delivered_at` datetime;
