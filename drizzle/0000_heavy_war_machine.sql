CREATE TABLE `process_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`problem` text NOT NULL,
	`dataset` text NOT NULL,
	`expected` text NOT NULL,
	`email` text
);
--> statement-breakpoint
CREATE INDEX `process_requests_created_at` ON `process_requests` (`created_at`);