import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import z from 'zod';
import { eq, and } from 'drizzle-orm';
import { webhookEvents } from '../db/schema.js';
import { replayEvent } from '../helpers/replayer.js';

import type { SQL } from 'drizzle-orm';

const replayRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/:id/replay',
    {
      schema: {
        params: z.object({
          id: z.nanoid(),
        }),
        body: z.object({
          targetUrl: z.url().optional()
        })
      },
    },
    async (request, reply) => {
      const targetUrl = request.body.targetUrl ?? process.env.REPLAY_TARGET_URL

      if (!targetUrl) {
        return reply.code(400).send({ message: 'No target URL provided and REPLAY_TARGET_URL is not set' })
      }

      const { id } = request.params;

      const event = await fastify.drizzle
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, id))
        .get();

      if (!event) {
        return reply.code(404).send({ message: 'Webhook event not found' });
      }

      const result = await replayEvent(event, targetUrl)

      await fastify.drizzle
        .update(webhookEvents)
        .set({
          status: result.success ? 'replayed' : 'failed',
          replayCount: event.replayCount + 1,
          lastReplayedAt: new Date().toISOString(),
          lastReplayTarget: targetUrl
        })
        .where(eq(webhookEvents.id, event.id))

      return reply.send(result)
    }
  );
};

export default replayRoutes;
