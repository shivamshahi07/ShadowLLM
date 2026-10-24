import assert from 'node:assert';
import test, { describe } from 'node:test';
import { getDatabase, ShadowPayload, ToolCall } from '@shadow-llm/shared';
import { classifyTool, diffArguments, virtualizeToolCall } from './sandbox.js';
import { ShadowWorker } from './worker.js';

describe('Side-Effect Virtualization & Worker Engine', () => {
  test('Classifies tool names accurately', () => {
    assert.strictEqual(classifyTool('charge_customer_card'), 'SIDE_EFFECT');
    assert.strictEqual(classifyTool('execute_payout'), 'SIDE_EFFECT');
    assert.strictEqual(classifyTool('update_order_status'), 'SIDE_EFFECT');
    assert.strictEqual(classifyTool('delete_database_row'), 'SIDE_EFFECT');
    assert.strictEqual(classifyTool('send_customer_email'), 'SIDE_EFFECT');

    assert.strictEqual(classifyTool('search_knowledge_base'), 'READ_ONLY');
    assert.strictEqual(classifyTool('get_user_balance'), 'READ_ONLY');
    assert.strictEqual(classifyTool('fetch_order_status'), 'READ_ONLY');
  });

  test('Diffs parameters between primary and shadow', () => {
    const primary = JSON.stringify({ amount: 150, currency: 'USD' });
    const matching = JSON.stringify({ amount: 150, currency: 'USD' });
    const diff = diffArguments(primary, matching);
    assert.strictEqual(diff.match, true);
    assert.strictEqual(diff.diffs.length, 0);

    const deviated = JSON.stringify({ amount: 200, currency: 'USD' });
    const diffDeviated = diffArguments(primary, deviated);
    assert.strictEqual(diffDeviated.match, false);
    assert.ok(diffDeviated.diffs.length > 0);
  });

  test('Virtualizes mutating tool when primary matches', () => {
    const primaryCalls: ToolCall[] = [
      {
        id: 'call_prm_1',
        type: 'function',
        function: {
          name: 'execute_payout',
          arguments: JSON.stringify({ recipient_id: 'usr_1', amount: 100 }),
        },
      },
    ];

    const shadowCall: ToolCall = {
      id: 'call_shd_1',
      type: 'function',
      function: {
        name: 'execute_payout',
        arguments: JSON.stringify({ recipient_id: 'usr_1', amount: 100 }),
      },
    };

    const res = virtualizeToolCall('trc_test_1', shadowCall, primaryCalls);
    assert.strictEqual(res.toolType, 'SIDE_EFFECT');
    assert.strictEqual(res.mutationRecord?.virtualization_action, 'replayed_primary');
    assert.strictEqual(res.mutationRecord?.args_match, true);
  });

  test('Blocks mutating tool when primary never invoked it', () => {
    const shadowCall: ToolCall = {
      id: 'call_shd_rogue',
      type: 'function',
      function: {
        name: 'delete_customer_account',
        arguments: JSON.stringify({ user_id: 'usr_99' }),
      },
    };

    const res = virtualizeToolCall('trc_test_2', shadowCall, []);
    assert.strictEqual(res.toolType, 'SIDE_EFFECT');
    assert.strictEqual(res.mutationRecord?.virtualization_action, 'blocked');
    assert.strictEqual(res.mutationRecord?.args_match, false);
  });

  test('Worker processes payload and records trace update', async () => {
    const db = await getDatabase();
    await db.init();

    const traceId = 'trc_worker_test_1';
    await db.insertTrace({
      id: traceId,
      endpoint: '/v1/chat/completions',
      prompt_tokens: 25,
      prompt_preview: 'Test prompt',
      primary_model: 'gpt-4o',
      primary_response_text: 'Primary baseline answer',
      primary_tool_calls: null,
      primary_latency_ms: 120,
      primary_cost_usd: 0.0003,
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
    });

    const worker = new ShadowWorker();
    const payload: ShadowPayload = {
      traceId,
      request: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What is shadow testing?' }],
      },
      promptPreview: 'What is shadow testing?',
      primaryModel: 'gpt-4o',
      primaryResponseText: 'Primary baseline answer',
      primaryLatencyMs: 120,
      primaryPromptTokens: 25,
      primaryCompletionTokens: 30,
      primaryCostUsd: 0.0003,
      shadowTarget: {
        provider: 'mock',
        model: 'llama-3.3-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      driftThreshold: 0.85,
      timestamp: Date.now(),
    };

    await worker.processPayload(payload);

    const updated = await db.getTraceById(traceId);
    assert.ok(updated);
    assert.strictEqual(updated?.shadow_model, 'llama-3.3-70b-versatile');
    assert.ok(updated?.shadow_response_text);
    assert.ok((updated?.shadow_latency_ms || 0) >= 0);
  });
});
