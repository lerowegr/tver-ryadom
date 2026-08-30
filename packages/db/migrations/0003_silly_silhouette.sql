CREATE TABLE `bot_drafts` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `reminder_off` integer DEFAULT false NOT NULL;