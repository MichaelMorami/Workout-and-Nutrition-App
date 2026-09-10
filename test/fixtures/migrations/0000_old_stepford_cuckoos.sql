CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`weight` real NOT NULL,
	`body_fat_pct` real,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_metrics_local_date_idx` ON `body_metrics` (`local_date`);--> statement-breakpoint
CREATE TABLE `food_log` (
	`id` text PRIMARY KEY NOT NULL,
	`logged_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`food_id` text,
	`qty` real DEFAULT 1 NOT NULL,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`slot` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `food_log_local_date_idx` ON `food_log` (`local_date`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_label` text NOT NULL,
	`serving_grams` real,
	`kcal_per_serving` real NOT NULL,
	`protein_per_serving` real NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`archived` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `foods_last_used_at_idx` ON `foods` (`last_used_at`);--> statement-breakpoint
CREATE INDEX `foods_use_count_idx` ON `foods` (`use_count`);