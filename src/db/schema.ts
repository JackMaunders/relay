import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  method: text('method').notNull(),
  headers: text('headers').notNull(),
  body: text('body'),
  receivedAt: text('received_at').notNull(),
  status: text('status', {
    enum: ['success', 'pending', 'replayed', 'failed'],
  })
    .notNull()
    .default('pending'),
  replayCount: integer('replay_count').notNull().default(0),
  lastReplayedAt: text('last_replayed_at'),
  lastReplayTarget: text('last_replay_target'),
});
