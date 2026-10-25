import cors from '@fastify/cors';
import {
  CanaryConfig,
  ChatCompletionRequest,
  getDatabase,
} from '@shadow-llm/shared';
import { ShadowWorker } from '@shadow-llm/worker';
import Fastify from 'fastify';
import { handleChatCompletions } from './proxy.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN;

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-shadow-trace-id'],
    exposedHeaders: ['x-shadow-trace-id', 'x-shadow-forked'],
  });

  // Auth Hook for /v1/* endpoints if PROXY_AUTH_TOKEN is configured
  fastify.addHook('onRequest', async (req, reply) => {
    if (PROXY_AUTH_TOKEN && req.url.startsWith('/v1/')) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== PROXY_AUTH_TOKEN) {
        reply.status(401).send({ error: 'Unauthorized: Invalid or missing Bearer token' });
      }
    }
  });

  // 1. Health check & keep-alive endpoint
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'shadow-llm-proxy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // 2. OpenAI-compatible /v1/models endpoint
  fastify.get('/v1/models', async () => {
    return {
      object: 'list',
      data: [
        { id: 'gpt-4o', object: 'model', created: 1715367049, owned_by: 'openai' },
        { id: 'gpt-4o-mini', object: 'model', created: 1721240000, owned_by: 'openai' },
        { id: 'llama-3.3-70b-versatile', object: 'model', created: 1733000000, owned_by: 'groq' },
        { id: 'llama-3.1-8b-instant', object: 'model', created: 1722000000, owned_by: 'groq' },
        { id: 'gemini-2.0-flash', object: 'model', created: 1734000000, owned_by: 'google' },
        { id: 'claude-3-5-sonnet', object: 'model', created: 1718841600, owned_by: 'anthropic' },
        { id: 'mock-primary', object: 'model', created: 1700000000, owned_by: 'shadowllm' },
        { id: 'mock-shadow', object: 'model', created: 1700000000, owned_by: 'shadowllm' },
      ],
    };
  });

  // 3. Drop-in OpenAI-compatible /v1/chat/completions endpoint
  fastify.post<{ Body: ChatCompletionRequest }>(
    '/v1/chat/completions',
    async (req, reply) => {
      await handleChatCompletions(req, reply);
    }
  );

  // 4. Canary Management & Configuration Endpoints
  fastify.get('/api/v1/canary/config', async () => {
    const db = await getDatabase();
    return db.getCanaryConfig();
  });

  fastify.post<{ Body: Partial<CanaryConfig> }>('/api/v1/canary/config', async (req, reply) => {
    const db = await getDatabase();
    const updated = await db.updateCanaryConfig(req.body);
    return reply.send({ success: true, config: updated });
  });

  fastify.get('/api/v1/canary/stats', async () => {
    const db = await getDatabase();
    return db.getStats();
  });

  fastify.get<{
    Querystring: { limit?: string; offset?: string; driftOnly?: string };
  }>('/api/v1/canary/traces', async (req) => {
    const db = await getDatabase();
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const driftOnly = req.query.driftOnly === 'true';
    const traces = await db.getTraces(limit, offset, driftOnly);
    return { traces, limit, offset, count: traces.length };
  });

  fastify.get<{ Params: { id: string } }>('/api/v1/canary/traces/:id', async (req, reply) => {
    const db = await getDatabase();
    const trace = await db.getTraceById(req.params.id);
    if (!trace) {
      return reply.status(404).send({ error: 'Trace not found' });
    }
    const mutations = await db.getMutations(req.params.id);
    return { trace, mutations };
  });

  fastify.get('/api/v1/canary/mutations', async () => {
    const db = await getDatabase();
    const mutations = await db.getMutations();
    return { mutations };
  });

  fastify.post('/api/v1/canary/promote', async () => {
    const db = await getDatabase();
    const updated = await db.promoteShadow();
    return {
      success: true,
      message: `Successfully promoted ${updated.primary_model} to production primary`,
      config: updated,
    };
  });

  return fastify;
}

async function start() {
  const server = await buildServer();

  // Initialize DB
  const db = await getDatabase();
  await db.init();

  // Start embedded background shadow worker if enabled
  if (process.env.RUN_EMBEDDED_WORKER !== 'false') {
    const worker = new ShadowWorker();
    worker.start();
    console.log('[ShadowLLM Server] Embedded background worker started');
  }

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`[ShadowLLM Proxy] Gateway listening on http://${HOST}:${PORT}`);
    console.log(`[ShadowLLM Proxy] Health check at http://${HOST}:${PORT}/health`);
    console.log(`[ShadowLLM Proxy] Canary dashboard API at http://${HOST}:${PORT}/api/v1/canary/stats`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  start();
}
