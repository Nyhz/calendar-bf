CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'event' NOT NULL,
	`color` text NOT NULL,
	`description` text,
	`location` text,
	`recurrence` text DEFAULT 'none',
	`region` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `summaries_date_unique` ON `summaries` (`date`);