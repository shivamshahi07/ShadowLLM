import assert from 'node:assert';
import test, { describe } from 'node:test';
import {
  cosineSimilarity,
  evaluateDrift,
  generateFallbackEmbedding,
} from './eval.js';
import { ToolCall } from './types.js';

describe('Semantic Drift & Evaluation Engine', () => {
  test('Calculates exact cosine similarity for known vectors', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    assert.strictEqual(cosineSimilarity(v1, v2), 1.0);

    const v3 = [0, 1, 0];
    assert.strictEqual(cosineSimilarity(v1, v3), 0.0);

    const v4 = [1, 1, 0];
    const sim = cosineSimilarity(v1, v4);
    assert.ok(sim > 0.70 && sim < 0.72);
  });

  test('Fallback vectorizer computes realistic semantic similarity', () => {
    const textA = 'Deploying a reverse proxy for shadow testing production LLM traffic.';
    const textB = 'Routing live LLM traffic through a reverse proxy for shadow evaluation.';
    const textC = 'Chocolate cake recipe with dark fudge and butter frosting.';

    const vecA = generateFallbackEmbedding(textA);
    const vecB = generateFallbackEmbedding(textB);
    const vecC = generateFallbackEmbedding(textC);

    const simAB = cosineSimilarity(vecA, vecB);
    const simAC = cosineSimilarity(vecA, vecC);

    assert.ok(simAB > 0.80, `Expected simAB > 0.80, got ${simAB}`);
    assert.ok(simAC < 0.60, `Expected simAC < 0.60, got ${simAC}`);
    assert.ok(simAB > simAC, 'Related text must have higher similarity than unrelated text');
  });

  test('Flags drift warning when semantic similarity falls below threshold', async () => {
    const primary = 'Your total balance is $450.00 and no pending transactions exist.';
    const shadowDivergent = 'Error 500: System database timeout while retrieving account details.';

    const evalRes = await evaluateDrift(primary, shadowDivergent, null, null, 0.85);

    assert.strictEqual(evalRes.hasDriftWarning, true);
    assert.ok(evalRes.semanticSimilarity < 0.85);
    assert.ok(evalRes.driftReason?.includes('Semantic similarity'));
  });

  test('Flags drift warning when tool call intent deviates', async () => {
    const primaryTools: ToolCall[] = [
      {
        id: 'call_p1',
        type: 'function',
        function: { name: 'get_balance', arguments: JSON.stringify({ user: 'u1' }) },
      },
    ];

    const shadowTools: ToolCall[] = [
      {
        id: 'call_s1',
        type: 'function',
        function: { name: 'delete_account', arguments: JSON.stringify({ user: 'u1' }) },
      },
    ];

    const evalRes = await evaluateDrift('', '', primaryTools, shadowTools, 0.85);

    assert.strictEqual(evalRes.hasDriftWarning, true);
    assert.strictEqual(evalRes.toolIntentMatched, false);
    assert.ok(evalRes.driftReason?.includes('Tool mismatch'));
  });

  test('Confirms compliance when models agree on tools and outputs', async () => {
    const textP = 'Executing payout of $100 to user usr_42.';
    const textS = 'Executing payout of $100 to user usr_42.';

    const primaryTools: ToolCall[] = [
      {
        id: 'call_p1',
        type: 'function',
        function: { name: 'execute_payout', arguments: JSON.stringify({ user: 'usr_42', amount: 100 }) },
      },
    ];

    const shadowTools: ToolCall[] = [
      {
        id: 'call_s1',
        type: 'function',
        function: { name: 'execute_payout', arguments: JSON.stringify({ user: 'usr_42', amount: 100 }) },
      },
    ];

    const evalRes = await evaluateDrift(textP, textS, primaryTools, shadowTools, 0.85);

    assert.strictEqual(evalRes.hasDriftWarning, false);
    assert.strictEqual(evalRes.toolIntentMatched, true);
    assert.strictEqual(evalRes.driftReason, null);
  });
});
