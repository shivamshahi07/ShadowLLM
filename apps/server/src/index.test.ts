import assert from 'node:assert';
import test, { describe } from 'node:test';
import { buildServer } from './index.js';

describe('Fastify Streaming Reverse Proxy Gateway', () => {
  test('GET /health returns healthy status', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'shadow-llm-proxy');
    assert.ok(body.uptime >= 0);
  });

  test('GET /v1/models returns model catalog', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/models',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.object, 'list');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some((m: any) => m.id === 'gpt-4o'));
    assert.ok(body.data.some((m: any) => m.id === 'llama-3.3-70b-versatile'));
  });

  test('POST /v1/chat/completions handles JSON response with trace ID', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Explain zero double-mutations' }],
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['x-shadow-trace-id']);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.object, 'chat.completion');
    assert.ok(body.choices.length > 0);
    assert.ok(body.choices[0].message.content.length > 0);
    assert.ok(body.usage.total_tokens > 0);
  });

  test('POST /v1/chat/completions handles streaming SSE chunks', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4o',
        stream: true,
        messages: [{ role: 'user', content: 'Hello streaming test' }],
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(String(res.headers['content-type']).includes('text/event-stream'));
    assert.ok(res.headers['x-shadow-trace-id']);
    assert.ok(res.body.includes('data: '));
    assert.ok(res.body.includes('[DONE]'));
  });

  test('GET /api/v1/canary/config and POST /api/v1/canary/config', async () => {
    const app = await buildServer();

    // Read config
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/canary/config',
    });
    assert.strictEqual(getRes.statusCode, 200);
    const initialConfig = JSON.parse(getRes.body);
    assert.ok('sample_rate' in initialConfig);

    // Update config
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/v1/canary/config',
      payload: {
        sample_rate: 0.35,
        drift_alert_threshold: 0.88,
      },
    });
    assert.strictEqual(postRes.statusCode, 200);
    const updated = JSON.parse(postRes.body);
    assert.strictEqual(updated.config.sample_rate, 0.35);
    assert.strictEqual(updated.config.drift_alert_threshold, 0.88);
  });
});
