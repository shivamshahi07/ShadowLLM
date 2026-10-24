import {
  calculateCost,
  ChatCompletionRequest,
  ChatCompletionResponse,
  evaluateDrift,
  getDatabase,
  getStreamQueue,
  MockLLMResponder,
  ShadowPayload,
  ToolCall,
} from '@shadow-llm/shared';
import { virtualizeToolCall } from './sandbox.js';

export interface ShadowWorkerOptions {
  evaluateDrift?: (
    primaryText: string,
    shadowText: string,
    primaryTools?: ToolCall[] | null,
    shadowTools?: ToolCall[] | null,
    driftThreshold?: number
  ) => Promise<{
    semanticSimilarity: number;
    toolIntentMatched: boolean;
    hasDriftWarning: boolean;
    driftReason: string | null;
  }>;
}

export class ShadowWorker {
  private stopFn: (() => void) | null = null;
  private evalDrift: NonNullable<ShadowWorkerOptions['evaluateDrift']>;

  constructor(options: ShadowWorkerOptions = {}) {
    this.evalDrift = options.evaluateDrift || evaluateDrift;
  }

  setDriftEvaluator(evaluator: NonNullable<ShadowWorkerOptions['evaluateDrift']>) {
    this.evalDrift = evaluator;
  }

  start() {
    const queue = getStreamQueue();
    console.log('[ShadowWorker] Starting Redis Stream / Buffer consumer...');

    this.stopFn = queue.startConsumer(async (payload: ShadowPayload) => {
      await this.processPayload(payload);
    });
  }

  stop() {
    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
      console.log('[ShadowWorker] Stopped consumer');
    }
  }

  async processPayload(payload: ShadowPayload): Promise<void> {
    const startTime = Date.now();
    const db = await getDatabase();

    const {
      traceId,
      request,
      shadowTarget,
      primaryResponseText,
      primaryToolCalls,
      driftThreshold,
    } = payload;

    const shadowModel = shadowTarget.model;
    const shadowProvider = shadowTarget.provider;
    const shadowBaseUrl = shadowTarget.baseUrl || 'https://api.groq.com/openai/v1';
    const shadowApiKey = process.env.SHADOW_API_KEY;

    // Apply system prompt override if specified in canary config
    const shadowRequest: ChatCompletionRequest = {
      ...request,
      model: shadowModel,
      stream: false, // background evaluations run non-streaming for deterministic capture
    };

    if (shadowTarget.systemPromptOverride) {
      const messages = [...shadowRequest.messages];
      const sysIdx = messages.findIndex((m) => m.role === 'system');
      if (sysIdx !== -1) {
        messages[sysIdx] = { role: 'system', content: shadowTarget.systemPromptOverride };
      } else {
        messages.unshift({ role: 'system', content: shadowTarget.systemPromptOverride });
      }
      shadowRequest.messages = messages;
    }

    let shadowResponseText = '';
    let shadowToolCalls: ToolCall[] | undefined = undefined;
    let promptTokens = payload.primaryPromptTokens;
    let completionTokens = 20;

    // 1. Invoke Shadow Model (Live upstream or deterministic mock)
    if (shadowApiKey && shadowProvider !== 'mock') {
      try {
        const res = await fetch(`${shadowBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${shadowApiKey}`,
          },
          body: JSON.stringify(shadowRequest),
        });

        if (res.ok) {
          const data = (await res.json()) as ChatCompletionResponse;
          const choice = data.choices?.[0]?.message;
          shadowResponseText = choice?.content || '';
          shadowToolCalls = choice?.tool_calls;
          promptTokens = data.usage?.prompt_tokens || promptTokens;
          completionTokens = data.usage?.completion_tokens || completionTokens;
        } else {
          throw new Error(`Shadow upstream HTTP ${res.status}: ${await res.text()}`);
        }
      } catch (err) {
        console.warn(`[ShadowWorker] Upstream shadow call failed, using mock fallback:`, err);
        const mock = MockLLMResponder.generateResponse(shadowRequest, true);
        shadowResponseText = mock.responseText;
        shadowToolCalls = mock.toolCalls;
        promptTokens = mock.promptTokens;
        completionTokens = mock.completionTokens;
      }
    } else {
      const mock = MockLLMResponder.generateResponse(shadowRequest, true);
      shadowResponseText = mock.responseText;
      shadowToolCalls = mock.toolCalls;
      promptTokens = mock.promptTokens;
      completionTokens = mock.completionTokens;
    }

    const shadowLatencyMs = Date.now() - startTime;
    const shadowCostUsd = calculateCost(shadowModel, promptTokens, completionTokens);

    // 2. Side-Effect Virtualization
    if (shadowToolCalls && shadowToolCalls.length > 0) {
      for (const stc of shadowToolCalls) {
        const vResult = virtualizeToolCall(traceId, stc, primaryToolCalls);

        if (vResult.mutationRecord) {
          await db.insertMutation(vResult.mutationRecord);
        }
      }
    }

    // 3. Evaluation & Semantic Drift Detection
    const evalRes = await this.evalDrift(
      primaryResponseText,
      shadowResponseText,
      primaryToolCalls,
      shadowToolCalls,
      driftThreshold
    );

    // 4. Update Execution Trace with Shadow & Evaluation results
    await db.updateTrace(traceId, {
      shadow_model: shadowModel,
      shadow_response_text: shadowResponseText || null,
      shadow_tool_calls: shadowToolCalls || null,
      shadow_latency_ms: shadowLatencyMs,
      shadow_cost_usd: shadowCostUsd,
      semantic_similarity: evalRes.semanticSimilarity,
      tool_intent_matched: evalRes.toolIntentMatched,
      has_drift_warning: evalRes.hasDriftWarning,
      drift_reason: evalRes.driftReason,
    });
  }
}
