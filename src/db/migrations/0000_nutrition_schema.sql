CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`measured_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`weight` real NOT NULL,
	`body_fat_pct` real,
	`waist` real,
	`chest` real,
	`arm` real,
	CONSTRAINT "body_metrics_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "body_metrics_local_date_check" CHECK("local_date" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "body_metrics_weight_check" CHECK("weight" > 0),
	CONSTRAINT "body_metrics_body_fat_pct_check" CHECK("body_fat_pct" is null or "body_fat_pct" between 0 and 100),
	CONSTRAINT "body_metrics_waist_check" CHECK("waist" is null or "waist" > 0),
	CONSTRAINT "body_metrics_chest_check" CHECK("chest" is null or "chest" > 0),
	CONSTRAINT "body_metrics_arm_check" CHECK("arm" is null or "arm" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_metrics_local_date_idx` ON `body_metrics` (`local_date`);--> statement-breakpoint
CREATE TABLE `food_log` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`logged_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`local_minute` integer NOT NULL,
	`food_id` text,
	`meal_id` text,
	`qty` real DEFAULT 1 NOT NULL,
	`grams` real,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`slot` text NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "food_log_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "food_log_local_date_check" CHECK("local_date" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "food_log_local_minute_check" CHECK("local_minute" between 0 and 1439),
	CONSTRAINT "food_log_qty_check" CHECK("qty" > 0),
	CONSTRAINT "food_log_grams_check" CHECK("grams" is null or "grams" > 0),
	CONSTRAINT "food_log_kcal_check" CHECK("kcal" >= 0),
	CONSTRAINT "food_log_protein_check" CHECK("protein" >= 0)
);
--> statement-breakpoint
CREATE INDEX `food_log_local_date_idx` ON `food_log` (`local_date`);--> statement-breakpoint
CREATE INDEX `food_log_food_id_idx` ON `food_log` (`food_id`);--> statement-breakpoint
CREATE INDEX `food_log_meal_id_idx` ON `food_log` (`meal_id`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_label` text NOT NULL,
	`serving_grams` real,
	`kcal_per_serving` real NOT NULL,
	`protein_per_serving` real NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`hour_histogram` text,
	`search_text` text DEFAULT '' NOT NULL,
	CONSTRAINT "foods_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "foods_archived_check" CHECK("archived" in (0, 1)),
	CONSTRAINT "foods_serving_grams_check" CHECK("serving_grams" is null or "serving_grams" > 0),
	CONSTRAINT "foods_kcal_check" CHECK("kcal_per_serving" >= 0),
	CONSTRAINT "foods_protein_check" CHECK("protein_per_serving" >= 0),
	CONSTRAINT "foods_use_count_check" CHECK("use_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `foods_use_count_idx` ON `foods` (`use_count`);--> statement-breakpoint
CREATE INDEX `foods_last_used_at_idx` ON `foods` (`last_used_at`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`meal_id` text NOT NULL,
	`food_id` text NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_items_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "meal_items_qty_check" CHECK("qty" > 0)
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_id_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_items_food_id_idx` ON `meal_items` (`food_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`hour_histogram` text,
	`search_text` text DEFAULT '' NOT NULL,
	CONSTRAINT "meals_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "meals_use_count_check" CHECK("use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`kcal_target` real NOT NULL,
	`protein_target` real NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "settings_deleted_check" CHECK("deleted" in (0, 1)),
	CONSTRAINT "settings_kcal_target_check" CHECK("kcal_target" >= 0),
	CONSTRAINT "settings_protein_target_check" CHECK("protein_target" >= 0),
	CONSTRAINT "settings_week_start_check" CHECK("week_start" between 0 and 6)
);
