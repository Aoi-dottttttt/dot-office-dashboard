import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const dashboardSnapshots = sqliteTable('dashboard_snapshots', {
  id: integer('id').primaryKey(),
  body: text('body').notNull(),
  revision: integer('revision').notNull(),
  observedMs: integer('observed_ms').notNull(),
  savedAt: text('saved_at').notNull(),
});
