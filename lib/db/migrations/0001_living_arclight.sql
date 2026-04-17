CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`background_color` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`sync_token` text,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`account_email` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`access_expires_at` text,
	`scopes` text NOT NULL,
	`connected_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_sync_at` text,
	`last_sync_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_provider_unique` ON `integrations` (`provider`);--> statement-breakpoint
ALTER TABLE `events` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
UPDATE events SET source = 'holiday' WHERE type = 'holiday';
CREATE UNIQUE INDEX IF NOT EXISTS events_google_unique ON events (google_calendar_id, google_event_id) WHERE google_event_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD `google_event_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `google_calendar_id` text;