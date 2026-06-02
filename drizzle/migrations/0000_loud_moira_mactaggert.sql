CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`method` text NOT NULL,
	`headers` text NOT NULL,
	`body` text,
	`received_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`replay_count` integer DEFAULT 0 NOT NULL,
	`last_replayed_at` text,
	`last_replay_target` text
);
