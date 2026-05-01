CREATE TABLE `daily_water_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`totalMl` float NOT NULL DEFAULT 0,
	`drinkingCount` int NOT NULL DEFAULT 0,
	`totalDrinkingTime` int NOT NULL DEFAULT 0,
	`avgDrinkDuration` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_water_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hourly_water_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`hour` int NOT NULL,
	`totalMl` float NOT NULL DEFAULT 0,
	`drinkingCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hourly_water_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `petlibro_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`password` text NOT NULL,
	`region` varchar(20) NOT NULL DEFAULT 'US',
	`deviceSn` varchar(128),
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `petlibro_credentials_id` PRIMARY KEY(`id`)
);
