ALTER TABLE `users` ADD `vk_user_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `max_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_vk_idx` ON `users` (`vk_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_max_idx` ON `users` (`max_user_id`);