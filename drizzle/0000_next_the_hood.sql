CREATE TABLE `cloud_projects` (
	`owner_email` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`object_key` text NOT NULL,
	PRIMARY KEY(`owner_email`, `kind`, `project_id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_projects_owner_updated_idx` ON `cloud_projects` (`owner_email`,`updated_at`);