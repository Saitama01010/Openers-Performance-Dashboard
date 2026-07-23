ALTER TABLE `email_delivery_attempts` MODIFY COLUMN `email_delivery_status` enum('sent','pending','accepted','delivered','failed') NOT NULL;--> statement-breakpoint
SET @add_provider_message_id := (
	SELECT IF(
		COUNT(*) = 0,
		'ALTER TABLE `email_delivery_attempts` ADD `provider_message_id` varchar(255)',
		'SELECT 1'
	)
	FROM `information_schema`.`columns`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `column_name` = 'provider_message_id'
);--> statement-breakpoint
PREPARE add_provider_message_id_stmt FROM @add_provider_message_id;--> statement-breakpoint
EXECUTE add_provider_message_id_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_provider_message_id_stmt;--> statement-breakpoint
SET @add_accepted_at := (
	SELECT IF(
		COUNT(*) = 0,
		'ALTER TABLE `email_delivery_attempts` ADD `accepted_at` datetime',
		'SELECT 1'
	)
	FROM `information_schema`.`columns`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `column_name` = 'accepted_at'
);--> statement-breakpoint
PREPARE add_accepted_at_stmt FROM @add_accepted_at;--> statement-breakpoint
EXECUTE add_accepted_at_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_accepted_at_stmt;--> statement-breakpoint
SET @add_delivered_at := (
	SELECT IF(
		COUNT(*) = 0,
		'ALTER TABLE `email_delivery_attempts` ADD `delivered_at` datetime',
		'SELECT 1'
	)
	FROM `information_schema`.`columns`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `column_name` = 'delivered_at'
);--> statement-breakpoint
PREPARE add_delivered_at_stmt FROM @add_delivered_at;--> statement-breakpoint
EXECUTE add_delivered_at_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_delivered_at_stmt;--> statement-breakpoint
SET @add_email_delivery_profile_idx := (
	SELECT IF(
		COUNT(*) = 0,
		'CREATE INDEX `email_delivery_profile_idx` ON `email_delivery_attempts` (`profile_id`)',
		'SELECT 1'
	)
	FROM `information_schema`.`statistics`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `index_name` = 'email_delivery_profile_idx'
);--> statement-breakpoint
PREPARE add_email_delivery_profile_idx_stmt FROM @add_email_delivery_profile_idx;--> statement-breakpoint
EXECUTE add_email_delivery_profile_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_email_delivery_profile_idx_stmt;--> statement-breakpoint
SET @add_email_delivery_token_idx := (
	SELECT IF(
		COUNT(*) = 0,
		'CREATE INDEX `email_delivery_token_idx` ON `email_delivery_attempts` (`token_id`)',
		'SELECT 1'
	)
	FROM `information_schema`.`statistics`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `index_name` = 'email_delivery_token_idx'
);--> statement-breakpoint
PREPARE add_email_delivery_token_idx_stmt FROM @add_email_delivery_token_idx;--> statement-breakpoint
EXECUTE add_email_delivery_token_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_email_delivery_token_idx_stmt;--> statement-breakpoint
SET @add_email_delivery_status_idx := (
	SELECT IF(
		COUNT(*) = 0,
		'CREATE INDEX `email_delivery_status_idx` ON `email_delivery_attempts` (`email_delivery_status`)',
		'SELECT 1'
	)
	FROM `information_schema`.`statistics`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `index_name` = 'email_delivery_status_idx'
);--> statement-breakpoint
PREPARE add_email_delivery_status_idx_stmt FROM @add_email_delivery_status_idx;--> statement-breakpoint
EXECUTE add_email_delivery_status_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_email_delivery_status_idx_stmt;--> statement-breakpoint
SET @add_email_delivery_provider_message_idx := (
	SELECT IF(
		COUNT(*) = 0,
		'CREATE INDEX `email_delivery_provider_message_idx` ON `email_delivery_attempts` (`provider_message_id`)',
		'SELECT 1'
	)
	FROM `information_schema`.`statistics`
	WHERE `table_schema` = DATABASE()
	AND `table_name` = 'email_delivery_attempts'
	AND `index_name` = 'email_delivery_provider_message_idx'
);--> statement-breakpoint
PREPARE add_email_delivery_provider_message_idx_stmt FROM @add_email_delivery_provider_message_idx;--> statement-breakpoint
EXECUTE add_email_delivery_provider_message_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_email_delivery_provider_message_idx_stmt;
