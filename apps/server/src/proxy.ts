import { FastifyReply, FastifyRequest } from 'fastify';
import {
  calculateCost,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ExecutionTrace,
  getDatabase,
  getStreamQueue,
  MockLLMResponder,
  ShadowPayload,
  ToolCall,
} from '@shadow-llm/shared';

function generateTraceId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `trc_${ts}${rnd}`;
}

/**
 * Handles bifurcated chat completions with zero latency penalty to client.
 */
export async function handleChatCompletions(
  req: FastifyRequest<{ Body: ChatCompletionRequest }>,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  const db = await getDatabase();
  const canaryConfig = await db.getCanaryConfig();
  const queue = getStreamQueue();

  const body = req.body;
  const isStream = Boolean(body.stream);
  const traceId = generateTraceId();
  const clientIp = req.ip;

  // Determine if this request should be sampled for shadowing
  const shouldShadow = canaryConfig.is_active && Math.random() < canaryConfig.sample_rate;

  // Check caller credentials / BYOK headers
  const isMaster = req.headers['x-is-master'] === 'true';
  const userGeminiKey = req.headers['x-gemini-key'] as string | undefined;
  const userGroqKey = req.headers['x-groq-key'] as string | undefined;
  const userOpenRouterKey = req.headers['x-openrouter-key'] as string | undefined;

  // Primary model target
  const primaryModel = body.model || canaryConfig.primary_model;
  const pModelLower = primaryModel.toLowerCase();

  let primaryBaseUrl = canaryConfig.primary_base_url || 'https://api.openai.com/v1';
  let primaryApiKey: string | undefined = undefined;
  let primaryProvider = canaryConfig.primary_provider;

  if (pModelLower.includes('openrouter') || pModelLower.startsWith('deepseek/') || pModelLower.startsWith('mistralai/') || (pModelLower.startsWith('meta-llama/') && !pModelLower.includes('groq'))) {
    primaryProvider = 'openrouter';
    primaryBaseUrl = 'https://openrouter.ai/api/v1';
    primaryApiKey = userOpenRouterKey || (isMaster ? (process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY) : undefined);
  } else if (pModelLower.startsWith('gemini') || pModelLower.includes('google')) {
    primaryProvider = 'google';
    primaryBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
    primaryApiKey = userGeminiKey || (isMaster ? (process.env.GEMINI_API_KEY || process.env.PRIMARY_API_KEY) : undefined);
  } else if (pModelLower.includes('groq') || pModelLower.includes('gpt-oss') || pModelLower.includes('llama') || pModelLower.includes('qwen')) {
    primaryProvider = 'groq';
    primaryBaseUrl = 'https://api.groq.com/openai/v1';
    primaryApiKey = userGroqKey || (isMaster ? (process.env.GROQ_API_KEY || process.env.SHADOW_API_KEY) : undefined);
  } else {
    primaryApiKey = isMaster ? process.env.PRIMARY_API_KEY : undefined;
  }

  // Extract prompt preview for dashboard
  const lastUserMsg = body.messages?.filter((m) => m.role === 'user').pop();
  const promptPreview = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content.substring(0, 150)
    : 'System / Multi-turn Prompt';

  if (isStream) {
    await handleStreamingCompletion({
      body,
      reply,
      startTime,
      traceId,
      promptPreview,
      clientIp,
      shouldShadow,
      canaryConfig,
      primaryProvider,
      primaryModel,
      primaryApiKey,
      primaryBaseUrl,
      db,
      queue,
    });
  } else {
    await handleJsonCompletion({
      body,
      reply,
      startTime,
      traceId,
      promptPreview,
      clientIp,
      shouldShadow,
      canaryConfig,
      primaryProvider,
      primaryModel,
      primaryApiKey,
      primaryBaseUrl,
      db,
      queue,
    });
  }
}

interface CompletionContext {
  body: ChatCompletionRequest;
  reply: FastifyReply;
  startTime: number;
  traceId: string;
  promptPreview: string;
  clientIp?: string;
  shouldShadow: boolean;
  canaryConfig: any;
  primaryProvider: string;
  primaryModel: string;
  primaryApiKey?: string;
  primaryBaseUrl: string;
  db: any;
  queue: any;
}

/**
 * Non-streaming JSON completion handler
 */
async function handleJsonCompletion(ctx: CompletionContext): Promise<void> {
  const {
    body,
    reply,
    startTime,
    traceId,
    promptPreview,
    clientIp,
    shouldShadow,
    canaryConfig,
    primaryProvider,
    primaryModel,
    primaryApiKey,
    primaryBaseUrl,
    db,
    queue,
  } = ctx;

  let responseData: ChatCompletionResponse;
  let promptTokens = 0;
  let completionTokens = 0;
  let responseText = '';
  let toolCalls: ToolCall[] | undefined = undefined;

  // Use live upstream if key exists and not mock mode
  if (primaryApiKey && primaryProvider !== 'mock') {
    try {
      const upstreamRes = await fetch(`${primaryBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${primaryApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        reply.status(upstreamRes.status).send({ error: `Upstream error: ${errText}` });
        return;
      }

      responseData = (await upstreamRes.json()) as ChatCompletionResponse;
      promptTokens = responseData.usage?.prompt_tokens || Math.round(promptPreview.length / 4);
      completionTokens = responseData.usage?.completion_tokens || 20;

      const firstChoice = responseData.choices?.[0]?.message;
      responseText = firstChoice?.content || '';
      toolCalls = firstChoice?.tool_calls;
    } catch (err) {
      console.warn('[Proxy] Upstream live primary failed, falling back to mock:', err);
      const mock = MockLLMResponder.generateResponse(body, false);
      responseData = mock.response;
      promptTokens = mock.promptTokens;
      completionTokens = mock.completionTokens;
      responseText = mock.responseText;
      toolCalls = mock.toolCalls;
    }
  } else {
    // Deterministic mock responder for offline dev / testing
    const mock = MockLLMResponder.generateResponse(body, false);
    responseData = mock.response;
    promptTokens = mock.promptTokens;
    completionTokens = mock.completionTokens;
    responseText = mock.responseText;
    toolCalls = mock.toolCalls;
  }

  const primaryLatencyMs = Date.now() - startTime;
  const primaryCostUsd = calculateCost(primaryModel, promptTokens, completionTokens);

  // Send response back to live client immediately
  reply.header('x-shadow-trace-id', traceId);
  reply.header('x-shadow-forked', shouldShadow ? 'true' : 'false');
  reply.send(responseData);

  // Asynchronous background trace persistence & shadow queue fork
  setImmediate(async () => {
    try {
      const trace: ExecutionTrace = {
        id: traceId,
        endpoint: '/v1/chat/completions',
        client_ip_hash: clientIp ? Buffer.from(clientIp).toString('hex').substring(0, 16) : null,
        prompt_tokens: promptTokens,
        prompt_preview: promptPreview,
        primary_model: primaryModel,
        primary_response_text: responseText,
        primary_tool_calls: toolCalls || null,
        primary_latency_ms: primaryLatencyMs,
        primary_cost_usd: primaryCostUsd,
        shadow_model: null,
        shadow_response_text: null,
        shadow_tool_calls: null,
        shadow_latency_ms: null,
        shadow_cost_usd: null,
        semantic_similarity: null,
        tool_intent_matched: null,
        has_drift_warning: false,
        drift_reason: null,
        created_at: new Date().toISOString(),
      };

      await db.insertTrace(trace);

      if (shouldShadow) {
        const payload: ShadowPayload = {
          traceId,
          request: body,
          clientIpHash: trace.client_ip_hash || undefined,
          promptPreview,
          primaryModel,
          primaryResponseText: responseText,
          primaryToolCalls: toolCalls,
          primaryLatencyMs,
          primaryPromptTokens: promptTokens,
          primaryCompletionTokens: completionTokens,
          primaryCostUsd,
          shadowTarget: {
            provider: canaryConfig.shadow_provider,
            model: canaryConfig.shadow_model,
            baseUrl: canaryConfig.shadow_base_url,
            systemPromptOverride: canaryConfig.system_prompt_override,
          },
          driftThreshold: canaryConfig.drift_alert_threshold,
          timestamp: Date.now(),
        };

        await queue.enqueue(payload);
      }
    } catch (err) {
      console.error('[Proxy] Error in async trace/fork:', err);
    }
  });
}

/**
 * Streaming Server-Sent Events (SSE) completion handler
 */
async function handleStreamingCompletion(ctx: CompletionContext): Promise<void> {
  const {
    body,
    reply,
    startTime,
    traceId,
    promptPreview,
    clientIp,
    shouldShadow,
    canaryConfig,
    primaryProvider,
    primaryModel,
    primaryApiKey,
    primaryBaseUrl,
    db,
    queue,
  } = ctx;

  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'x-shadow-trace-id': traceId,
    'x-shadow-forked': shouldShadow ? 'true' : 'false',
  });

  let accumulatedText = '';
  const accumulatedToolCalls: ToolCall[] = [];
  let promptTokens = Math.max(10, Math.round(promptPreview.length / 4));
  let completionTokens = 0;

  if (primaryApiKey && primaryProvider !== 'mock') {
    try {
      const upstreamRes = await fetch(`${primaryBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${primaryApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!upstreamRes.ok || !upstreamRes.body) {
        throw new Error(`Upstream returned ${upstreamRes.status}`);
      }

      // Read live stream chunks and forward immediately
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        raw.write(text);
        buffer += text;

        // Extract tokens non-blockingly
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6)) as ChatCompletionChunk;
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                accumulatedText += delta.content;
                completionTokens++;
              }
              if (delta?.tool_calls) {
                // Collect tool calls
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!accumulatedToolCalls[idx]) {
                    accumulatedToolCalls[idx] = {
                      id: tc.id || `call_${idx}`,
                      type: 'function',
                      function: { name: tc.function?.name || '', arguments: '' },
                    };
                  }
                  if (tc.function?.arguments) {
                    accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch {
              // Ignore partial JSON parses in SSE
            }
          }
        }
      }

      raw.end();
    } catch (err) {
      console.warn('[Proxy] Upstream live stream failed, streaming mock chunks:', err);
      const mock = MockLLMResponder.generateChunks(body, false);
      for (const chunk of mock.chunks) {
        raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      raw.write('data: [DONE]\n\n');
      raw.end();

      accumulatedText = mock.fullText;
      if (mock.toolCalls) {
        accumulatedToolCalls.push(...mock.toolCalls);
      }
      promptTokens = mock.promptTokens;
      completionTokens = mock.completionTokens;
    }
  } else {
    // Deterministic mock SSE chunks
    const mock = MockLLMResponder.generateChunks(body, false);
    for (const chunk of mock.chunks) {
      raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    raw.write('data: [DONE]\n\n');
    raw.end();

    accumulatedText = mock.fullText;
    if (mock.toolCalls) {
      accumulatedToolCalls.push(...mock.toolCalls);
    }
    promptTokens = mock.promptTokens;
    completionTokens = mock.completionTokens;
  }

  const primaryLatencyMs = Date.now() - startTime;
  const primaryCostUsd = calculateCost(primaryModel, promptTokens, completionTokens);

  // Asynchronous fork after stream is closed
  setImmediate(async () => {
    try {
      const trace: ExecutionTrace = {
        id: traceId,
        endpoint: '/v1/chat/completions',
        client_ip_hash: clientIp ? Buffer.from(clientIp).toString('hex').substring(0, 16) : null,
        prompt_tokens: promptTokens,
        prompt_preview: promptPreview,
        primary_model: primaryModel,
        primary_response_text: accumulatedText || null,
        primary_tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : null,
        primary_latency_ms: primaryLatencyMs,
        primary_cost_usd: primaryCostUsd,
        shadow_model: null,
        shadow_response_text: null,
        shadow_tool_calls: null,
        shadow_latency_ms: null,
        shadow_cost_usd: null,
        semantic_similarity: null,
        tool_intent_matched: null,
        has_drift_warning: false,
        drift_reason: null,
        created_at: new Date().toISOString(),
      };

      await db.insertTrace(trace);

      if (shouldShadow) {
        const payload: ShadowPayload = {
          traceId,
          request: body,
          clientIpHash: trace.client_ip_hash || undefined,
          promptPreview,
          primaryModel,
          primaryResponseText: accumulatedText,
          primaryToolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          primaryLatencyMs,
          primaryPromptTokens: promptTokens,
          primaryCompletionTokens: completionTokens,
          primaryCostUsd,
          shadowTarget: {
            provider: canaryConfig.shadow_provider,
            model: canaryConfig.shadow_model,
            baseUrl: canaryConfig.shadow_base_url,
            systemPromptOverride: canaryConfig.system_prompt_override,
          },
          driftThreshold: canaryConfig.drift_alert_threshold,
          timestamp: Date.now(),
        };

        await queue.enqueue(payload);
      }
    } catch (err) {
      console.error('[Proxy] Error in async streaming trace/fork:', err);
    }
  });
}
