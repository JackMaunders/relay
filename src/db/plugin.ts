import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fastifyPlugin from 'fastify-plugin'
import * as schema from './schema.js'

import type { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    drizzle: BetterSQLite3Database<typeof schema>
  }
}

const fastifyDrizzle: FastifyPluginAsync<{ filename?: string }> = async (fastify, options) => {
  const sqlite = new Database(options.filename || ':memory:')
  const db = drizzle(sqlite, { schema })

  fastify.decorate('drizzle', db)
  fastify.addHook('onClose', () => sqlite.close())
}

export default fastifyPlugin(fastifyDrizzle)
