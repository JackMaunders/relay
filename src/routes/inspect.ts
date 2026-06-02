import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import z from 'zod';
import { eq, and } from 'drizzle-orm';
import { webhookEvents } from '../db/schema.js';

import type { SQL } from 'drizzle-orm';

const inspectRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        querystring: z.object({
          source: z
            .string()
            .min(1)
            .max(50)
            .regex(/^[a-z0-9-]+$/)
            .optional(),
          status: z.enum(['success', 'pending', 'replayed', 'failed']).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
      },
    },
    async (request, reply) => {
      const { source, status, limit } = request.query;

      const filters: SQL[] = [];

      if (source) {
        filters.push(eq(webhookEvents.source, source));
      }

      if (status) {
        filters.push(eq(webhookEvents.status, status));
      }

      const events = await fastify.drizzle
        .select()
        .from(webhookEvents)
        .where(filters.length ? and(...filters) : undefined)
        .limit(limit);

      return reply.send(events);
    }
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.nanoid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const event = await fastify.drizzle
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, id));

      if (!event) {
        return reply.code(404).send({ message: 'Webhook event not found' });
      }

      return reply.send(event);
    }
  );
};

export default inspectRoutes;
