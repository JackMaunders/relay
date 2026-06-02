import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { webhookEvents } from '../db/schema.js'
import { replayEvent } from '../helpers/replayer.js'

const ParamsSchema = z.object({
  source: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/)
})

const ingestRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post('/:source', {
    schema: {
      params: ParamsSchema
    }
  }, async (request, reply) => {
    const webhookEvent = {
      id: nanoid(),
      source: request.params.source,
      method: request.method,
      headers: JSON.stringify(request.headers),
      body: request.body ? JSON.stringify(request.body) : null,
      receivedAt: new Date().toISOString()
    }

    await fastify.drizzle.insert(webhookEvents).values(webhookEvent)

    // Tempted to swap this and type out webhookEvent fully to avoid an extra db read
    const stored = fastify.drizzle
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, webhookEvent.id))
      .get()

    if (process.env.REPLAY_TARGET_URL && stored) {
      const result = await replayEvent(stored, process.env.REPLAY_TARGET_URL)

      await fastify.drizzle
        .update(webhookEvents)
        .set({ status: result.success ? 'delivered' : 'failed' })
        .where(eq(webhookEvents.id, webhookEvent.id))
    }

    return reply.code(201).send({ id: webhookEvent.id })
  })
}

export default ingestRoutes
