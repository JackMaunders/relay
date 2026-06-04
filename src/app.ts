import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyDrizzle from './db/plugin.js';
import ingestRoutes from './routes/ingest.js';
import inspectRoutes from './routes/inspect.js';
import replayRoutes from './routes/replay.js';

export function createApp(opts: { dbFilename?: string; logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifyDrizzle, { filename: opts.dbFilename ?? 'relay.db' });

  app.register(ingestRoutes, { prefix: '/webhooks' });
  app.register(inspectRoutes, { prefix: '/webhooks' });
  app.register(replayRoutes, { prefix: '/webhooks' });

  return app;
}

export default createApp({ logger: true });
