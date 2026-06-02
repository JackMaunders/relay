import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import z from 'zod';
import { nanoid } from 'nanoid';

import { webhookEvents } from '../db/schema.js';

const ParamsSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
});

const ingestRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/:source',
    {
      schema: {
        params: ParamsSchema,
      },
    },
    async (request, reply) => {
      const webhookEvent = {
        id: nanoid(),
        source: request.params.source,
        method: request.method,
        headers: JSON.stringify(request.headers),
        body: request.body ? JSON.stringify(request.body) : null,
        receivedAt: new Date().toISOString(),
      };

      await fastify.drizzle.insert(webhookEvents).values(webhookEvent);

      reply.code(201).send({ id: webhookEvent.id });
    }
  );
};

export default ingestRoutes;
