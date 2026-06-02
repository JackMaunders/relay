import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import fastifyDrizzle from './db/plugin.js'
import ingestRoutes from './routes/ingest.js'
import inspectRoutes from './routes/inspect.js'
import replayRoutes from './routes/replay.js'

const fastify = Fastify({
  logger: true
})

fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

fastify.register(fastifyDrizzle, { filename: 'relay.db' })

fastify.register(ingestRoutes, { prefix: '/webhooks' })
fastify.register(inspectRoutes, { prefix: '/webhooks' })
fastify.register(replayRoutes, { prefix: '/webhooks' })

const start = async () => {
  try {
    await fastify.listen({ port: 3000 })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
