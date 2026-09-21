CREATE TABLE `availability_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `availability_blocks_date_idx` ON `availability_blocks` (`date`);