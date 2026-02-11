import Fastify from 'fastify';

async function start() {
  const fastify = Fastify({ logger: true });

  fastify.get('/', async () => {
    return { hello: 'world' };
  });

  fastify.get('/health', async () => {
    return { ok: true };
  });

  try {
    await fastify.listen({ port: 3200, host: '127.0.0.1' });
    console.log('Server running on http://127.0.0.1:3200');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
