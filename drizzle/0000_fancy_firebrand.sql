CREATE TABLE `dashboard_snapshots` (
	`id` integer PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`revision` integer NOT NULL,
	`observed_ms` integer NOT NULL,
	`saved_at` text NOT NULL
);
