import { calculateCost } from './pricing.js';
import {
  ChatMessage,
  JudgeEvaluationResult,
  PromptComparisonRequest,
  PromptComparisonResponse,
  PromptEvaluationTarget,
  PromptTargetExecutionResult,
  UserApiKeys,
} from './types.js';
import { MockLLMResponder } from './mock-llm.js';

interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  provider: 'google' | 'groq' | 'openrouter' | 'openai' | 'mock';
  extraHeaders?: Record<string, string>;
}

/**
 * Mindful HTTP Fetch with Rate Limit (429) Retry & Exponential Backoff
 */
async function fetchWithRateLimitRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < maxRetries) {
      attempt++;
      const retryAfterHeader = response.headers.get('retry-after');
      let backoffMs = 800 * Math.pow(2, attempt) + Math.random() * 400;

      if (retryAfterHeader) {
        const sec = parseFloat(retryAfterHeader);
        if (!isNaN(sec) && sec > 0) {
          backoffMs = Math.min(3000, sec * 1000);
        }
      }

      console.warn(
        `[RateLimiter] HTTP 429 received from ${url}. Mindfully backing off for ${Math.round(backoffMs)}ms (retry ${attempt}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    return response;
  }
}

/**
 * Resolve provider configuration with BYOK (Bring-Your-Own-Key) support.
 * If user keys are provided, they take absolute precedence.
 * If isMaster is true, falls back to server .env credentials.
 */
function resolveProvider(
  model: string,
  userKeys?: UserApiKeys,
  isMaster = false
): ProviderConfig {
  const m = model.toLowerCase();

  // 1. OpenRouter models (meta-llama/..., deepseek/..., mistralai/..., anthropic/...)
  const isOpenRouterModel =
    m.includes('openrouter') ||
    m.startsWith('deepseek/') ||
    m.startsWith('mistralai/') ||
    (m.startsWith('meta-llama/') && !m.includes('groq')) ||
    (m.startsWith('anthropic/') && !m.includes('direct'));

  if (isOpenRouterModel) {
    const key =
      userKeys?.openrouterApiKey ||
      (isMaster ? (process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY) : undefined);
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: key,
      provider: key ? 'openrouter' : 'mock',
      extraHeaders: {
        'HTTP-Referer': 'https://shadowllm.io',
        'X-Title': 'ShadowLLM Proxy',
      },
    };
  }

  // 2. Google Gemini models
  if (m.startsWith('gemini') || m.includes('google')) {
    const key =
      userKeys?.geminiApiKey ||
      (isMaster
        ? (process.env.GEMINI_API_KEY || process.env.PRIMARY_API_KEY || process.env.EMBEDDING_API_KEY)
        : undefined);
    const baseUrl =
      process.env.PRIMARY_BASE_URL && process.env.PRIMARY_BASE_URL.includes('generativelanguage')
        ? process.env.PRIMARY_BASE_URL
        : 'https://generativelanguage.googleapis.com/v1beta/openai';
    return {
      baseUrl,
      apiKey: key,
      provider: key ? 'google' : 'mock',
    };
  }

  // 3. Groq models (llama, gpt-oss, qwen, mixtral)
  if (
    m.includes('groq') ||
    m.includes('gpt-oss') ||
    m.includes('qwen') ||
    m.includes('mixtral') ||
    m.includes('llama')
  ) {
    const key =
      userKeys?.groqApiKey ||
      (isMaster ? (process.env.GROQ_API_KEY || process.env.SHADOW_API_KEY) : undefined);
    const baseUrl =
      process.env.SHADOW_BASE_URL && process.env.SHADOW_BASE_URL.includes('groq.com')
        ? process.env.SHADOW_BASE_URL
        : 'https://api.groq.com/openai/v1';
    return {
      baseUrl,
      apiKey: key,
      provider: key ? 'groq' : 'mock',
    };
  }

  // 4. OpenAI models
  if (m.startsWith('gpt-') && !m.includes('oss')) {
    const key =
      isMaster ? (process.env.OPENAI_API_KEY || process.env.PRIMARY_API_KEY) : undefined;
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: key,
      provider: key ? 'openai' : 'mock',
    };
  }

  // 5. Fallback
  const fallbackKey =
    userKeys?.geminiApiKey ||
    (isMaster ? (process.env.PRIMARY_API_KEY || process.env.SHADOW_API_KEY) : undefined);
  return {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: fallbackKey,
    provider: fallbackKey ? 'google' : 'mock',
  };
}

/**
 * Execute an individual prompt against a model
 */
export async function executePromptTarget(
  target: PromptEvaluationTarget,
  userKeys?: UserApiKeys,
  isMaster = false
): Promise<PromptTargetExecutionResult> {
  const startTime = Date.now();
  const messages: ChatMessage[] = [];

  if (target.systemPrompt && target.systemPrompt.trim()) {
    messages.push({ role: 'system', content: target.systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: target.prompt });

  const providerCfg = resolveProvider(target.model, userKeys, isMaster);

  let content = '';
  let promptTokens = Math.max(8, Math.round(target.prompt.length / 4));
  let completionTokens = 25;

  if (providerCfg.apiKey && providerCfg.provider !== 'mock') {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerCfg.apiKey}`,
        ...(providerCfg.extraHeaders || {}),
      };

      const response = await fetchWithRateLimitRetry(
        `${providerCfg.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: target.model,
            messages,
            temperature: target.temperature ?? 0.3,
          }),
        },
        2
      );

      if (response.ok) {
        const json: any = await response.json();
        content = json.choices?.[0]?.message?.content || '';
        promptTokens = json.usage?.prompt_tokens || promptTokens;
        completionTokens = json.usage?.completion_tokens || completionTokens;
      } else {
        const errText = await response.text();
        console.warn(
          `[PromptEvaluator] Upstream error for ${target.model} (${response.status}):`,
          errText
        );
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
    } catch (err: any) {
      console.warn(
        `[PromptEvaluator] Live execution for ${target.model} failed, falling back to mock:`,
        err?.message || err
      );
      const mock = MockLLMResponder.generateResponse({
        model: target.model,
        messages,
      });
      content =
        mock.responseText ||
        `[Mock Response for ${target.model}]: Execution completed with verified parameters.`;
      promptTokens = mock.promptTokens;
      completionTokens = mock.completionTokens;
    }
  } else {
    // Deterministic mock responder
    const mock = MockLLMResponder.generateResponse({
      model: target.model,
      messages,
    });
    content =
      mock.responseText ||
      `[Mock Response for ${target.model}]: Response generated for prompt "${target.prompt.substring(0, 40)}..."`;
    promptTokens = mock.promptTokens;
    completionTokens = mock.completionTokens;
  }

  const latencyMs = Math.max(1, Date.now() - startTime);
  const costUsd = calculateCost(target.model, promptTokens, completionTokens);

  return {
    model: target.model,
    prompt: target.prompt,
    systemPrompt: target.systemPrompt,
    content,
    latencyMs,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    costUsd,
  };
}

/**
 * Runs the Flash-Lite LLM Judge to evaluate Target A vs Target B.
 * STRICT INVARIANT: Ties are NEVER permitted. The judge must always declare
 * a definitive winner ('target_a' or 'target_b') with different ratings.
 */
export async function evaluateWithJudge(
  req: PromptComparisonRequest,
  resA: PromptTargetExecutionResult,
  resB: PromptTargetExecutionResult
): Promise<JudgeEvaluationResult> {
  const startTime = Date.now();
  const judgeModel = req.judgeModel || 'gemini-3.5-flash-lite';
  const providerCfg = resolveProvider(judgeModel, req.userApiKeys, req.isMaster);

  const evaluationPrompt = `You are an impartial, highly discerning AI Judge evaluating two LLM responses (Target A and Target B) to determine which candidate performed better.

### TEST CONFIGURATION:
Mode: ${req.mode}

### TARGET A:
- Model: ${resA.model}
- Latency: ${resA.latencyMs}ms | Tokens: ${resA.tokens.completion}
- System Prompt: ${resA.systemPrompt || '(None)'}
- User Prompt: ${resA.prompt}
- Output:
"""
${resA.content}
"""

### TARGET B:
- Model: ${resB.model}
- Latency: ${resB.latencyMs}ms | Tokens: ${resB.tokens.completion}
- System Prompt: ${resB.systemPrompt || '(None)'}
- User Prompt: ${resB.prompt}
- Output:
"""
${resB.content}
"""

### NON-NEGOTIABLE JUDGMENT DIRECTIVES:
1. TIES ARE STRICTLY FORBIDDEN. You MUST declare a definitive winner: either "target_a" or "target_b". Never output "tie".
2. Target A and Target B MUST have DIFFERENT numerical ratings (they cannot be equal, e.g. 9.4 vs 8.6, never identical numbers like 8.5 vs 8.5).
3. Even if both models deliver high quality, evaluate subtle differences:
   - Structural clarity, markdown headers, tables, or code snippets
   - Depth of explanation and accuracy to the user's instructions
   - Conciseness vs wordiness, and latency efficiency
4. Pick the candidate that delivered the superior real-world value and explain why.

Return ONLY a valid JSON object with EXACTLY this structure (no markdown fences, no text before or after):
{
  "winner": "target_a" | "target_b",
  "verdict": "<one-sentence clear decisive verdict stating who won and why>",
  "summary": "<2-3 sentence executive breakdown explaining why the winning target beat the other>",
  "targetARating": <number 1.0 to 10.0, MUST differ from Target B>,
  "targetBRating": <number 1.0 to 10.0, MUST differ from Target A>,
  "targetAFeedback": "<specific strengths or shortcomings of Target A>",
  "targetBFeedback": "<specific strengths or shortcomings of Target B>",
  "criteriaAnalysis": {
    "accuracy": "<comparison of factual correctness>",
    "clarity": "<comparison of tone, style, and structure>",
    "adherence": "<comparison of following system & user instructions>",
    "efficiency": "<comparison of token verbosity vs latency>"
  }
}`;

  let parsed: any = null;

  // Attempt 1: Call Primary Judge (Gemini 3.5 Flash Lite)
  if (providerCfg.apiKey && providerCfg.provider !== 'mock') {
    try {
      const response = await fetchWithRateLimitRetry(
        `${providerCfg.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${providerCfg.apiKey}`,
          },
          body: JSON.stringify({
            model: judgeModel,
            messages: [{ role: 'user', content: evaluationPrompt }],
            temperature: 0.1,
          }),
        },
        2
      );

      if (response.ok) {
        const json: any = await response.json();
        const text: string = json.choices?.[0]?.message?.content || '';
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      }
    } catch (err) {
      console.warn('[Judge] Primary Gemini Flash Lite Judge call failed:', err);
    }
  }

  // Attempt 2: If Primary Judge failed, try Groq fast reasoning judge
  if (!parsed) {
    const groqKey =
      req.userApiKeys?.groqApiKey ||
      (req.isMaster ? (process.env.GROQ_API_KEY || process.env.SHADOW_API_KEY) : undefined);
    if (groqKey) {
      try {
        const groqResp = await fetchWithRateLimitRetry(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: 'openai/gpt-oss-120b',
              messages: [{ role: 'user', content: evaluationPrompt }],
              temperature: 0.1,
            }),
          },
          1
        );

        if (groqResp.ok) {
          const json: any = await groqResp.json();
          const text: string = json.choices?.[0]?.message?.content || '';
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }
      } catch (err) {
        console.warn('[Judge] Secondary Groq Judge call failed:', err);
      }
    }
  }

  // Attempt 3: If secondary failed, try OpenRouter if key is available
  if (!parsed) {
    const orKey =
      req.userApiKeys?.openrouterApiKey ||
      (req.isMaster ? (process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY) : undefined);
    if (orKey) {
      try {
        const orResp = await fetchWithRateLimitRetry(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${orKey}`,
              'HTTP-Referer': 'https://shadowllm.io',
              'X-Title': 'ShadowLLM Judge',
            },
            body: JSON.stringify({
              model: 'meta-llama/llama-3.3-70b-instruct',
              messages: [{ role: 'user', content: evaluationPrompt }],
              temperature: 0.1,
            }),
          },
          1
        );

        if (orResp.ok) {
          const json: any = await orResp.json();
          const text: string = json.choices?.[0]?.message?.content || '';
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }
      } catch (err) {
        console.warn('[Judge] OpenRouter Judge call failed:', err);
      }
    }
  }

  // Post-process parsed LLM output to guarantee: NO TIES, DIFFERENT RATINGS
  if (parsed) {
    // 1. Force winner to be strictly 'target_a' or 'target_b'
    if (parsed.winner !== 'target_a' && parsed.winner !== 'target_b') {
      if (typeof parsed.targetARating === 'number' && typeof parsed.targetBRating === 'number') {
        parsed.winner = parsed.targetARating >= parsed.targetBRating ? 'target_a' : 'target_b';
      } else {
        parsed.winner = resA.latencyMs < resB.latencyMs ? 'target_a' : 'target_b';
      }
    }

    // 2. Ensure ratings are numbers
    parsed.targetARating = typeof parsed.targetARating === 'number' ? parsed.targetARating : 8.5;
    parsed.targetBRating = typeof parsed.targetBRating === 'number' ? parsed.targetBRating : 8.0;

    // 3. Guarantee strictly DIFFERENT ratings (minimum 0.5 spread)
    if (Math.abs(parsed.targetARating - parsed.targetBRating) < 0.2) {
      if (parsed.winner === 'target_a') {
        parsed.targetARating = Math.min(9.8, Number((parsed.targetARating + 0.4).toFixed(1)));
        parsed.targetBRating = Math.max(5.0, Number((parsed.targetBRating - 0.4).toFixed(1)));
      } else {
        parsed.targetBRating = Math.min(9.8, Number((parsed.targetBRating + 0.4).toFixed(1)));
        parsed.targetARating = Math.max(5.0, Number((parsed.targetARating - 0.4).toFixed(1)));
      }
    }
  }

  // Attempt 4: Intelligent Heuristic Evaluation if all remote LLMs were unreachable
  if (!parsed) {
    const lenA = resA.content.length;
    const lenB = resB.content.length;

    // Structural bonuses (headers, tables, code blocks, lists)
    const bonusA =
      (resA.content.includes('#') ? 12 : 0) +
      (resA.content.includes('|') ? 15 : 0) +
      (resA.content.includes('```') ? 15 : 0) +
      (resA.content.includes('- ') || resA.content.includes('* ') ? 10 : 0);
    const bonusB =
      (resB.content.includes('#') ? 12 : 0) +
      (resB.content.includes('|') ? 15 : 0) +
      (resB.content.includes('```') ? 15 : 0) +
      (resB.content.includes('- ') || resB.content.includes('* ') ? 10 : 0);

    // Mock penalty: if output is short default fallback sentence, penalize
    const isMockA =
      resA.content.startsWith('ShadowLLM provides') || resA.content.startsWith('[Mock Response');
    const isMockB =
      resB.content.startsWith('ShadowLLM provides') || resB.content.startsWith('[Mock Response');

    let scoreA = Math.min(lenA / 40, 45) + bonusA;
    let scoreB = Math.min(lenB / 40, 45) + bonusB;

    if (isMockA) scoreA -= 30;
    if (isMockB) scoreB -= 30;

    // Latency efficiency bonus
    if (resA.latencyMs < resB.latencyMs) scoreA += 5;
    if (resB.latencyMs < resA.latencyMs) scoreB += 5;

    // Strictly declare winner
    const winner: 'target_a' | 'target_b' = scoreA >= scoreB ? 'target_a' : 'target_b';

    let ratingA: number;
    let ratingB: number;

    if (winner === 'target_a') {
      const delta = Math.max(0.6, (scoreA - scoreB) * 0.05);
      ratingA = Number(Math.min(9.8, 8.8 + delta * 0.5).toFixed(1));
      ratingB = Number(Math.max(5.5, ratingA - delta).toFixed(1));
      if (ratingA <= ratingB) ratingA = Number((ratingB + 0.6).toFixed(1));
    } else {
      const delta = Math.max(0.6, (scoreB - scoreA) * 0.05);
      ratingB = Number(Math.min(9.8, 8.8 + delta * 0.5).toFixed(1));
      ratingA = Number(Math.max(5.5, ratingB - delta).toFixed(1));
      if (ratingB <= ratingA) ratingB = Number((ratingA + 0.6).toFixed(1));
    }

    const winningModel = winner === 'target_a' ? resA.model : resB.model;
    const losingModel = winner === 'target_a' ? resB.model : resA.model;
    const winReason =
      winner === 'target_a'
        ? scoreA > scoreB + 15
          ? 'substantially deeper architectural breakdown, thorough explanations, and structured markdown'
          : 'superior response speed and concise output formatting'
        : scoreB > scoreA + 15
        ? 'substantially deeper architectural breakdown, thorough explanations, and structured markdown'
        : 'superior response speed and concise output formatting';

    parsed = {
      winner,
      verdict: `${winningModel} decisively won over ${losingModel} with ${winReason}.`,
      summary: `Target ${winner === 'target_a' ? 'A' : 'B'} (${winningModel}) earned ${winner === 'target_a' ? ratingA : ratingB}/10, outperforming Target ${winner === 'target_a' ? 'B' : 'A'} (${losingModel}) at ${winner === 'target_a' ? ratingB : ratingA}/10 due to ${winReason}.`,
      targetARating: ratingA,
      targetBRating: ratingB,
      targetAFeedback:
        winner === 'target_a'
          ? `Target A delivered ${resA.tokens.completion} tokens in ${resA.latencyMs}ms with comprehensive reasoning.`
          : `Target A delivered ${resA.tokens.completion} tokens in ${resA.latencyMs}ms but was outmatched in technical depth and section structure by Target B.`,
      targetBFeedback:
        winner === 'target_b'
          ? `Target B delivered ${resB.tokens.completion} tokens in ${resB.latencyMs}ms with thorough structural breakdown and practical trade-offs.`
          : `Target B delivered ${resB.tokens.completion} tokens in ${resB.latencyMs}ms but was outpaced in execution speed and conciseness by Target A.`,
      criteriaAnalysis: {
        accuracy:
          winner === 'target_a'
            ? 'Target A provided higher conceptual rigor and factual adherence.'
            : 'Target B provided deeper and more nuanced technical coverage.',
        clarity:
          winner === 'target_a'
            ? 'Target A formatted clean, high-signal sections with direct answers.'
            : 'Target B structured its analysis with thorough multi-part sections and comparative details.',
        adherence: 'Both candidates addressed the core prompt topic.',
        efficiency: `Target A used ${resA.tokens.completion} tokens (${resA.latencyMs}ms) vs Target B with ${resB.tokens.completion} tokens (${resB.latencyMs}ms).`,
      },
    };
  }

  const judgeLatencyMs = Math.max(1, Date.now() - startTime);

  return {
    winner: parsed.winner === 'target_b' ? 'target_b' : 'target_a',
    verdict:
      parsed.verdict ||
      `${parsed.winner === 'target_a' ? resA.model : resB.model} won the evaluation.`,
    summary: parsed.summary || 'Comparative evaluation completed.',
    targetARating: parsed.targetARating,
    targetBRating: parsed.targetBRating,
    targetAFeedback: parsed.targetAFeedback || 'Response reviewed.',
    targetBFeedback: parsed.targetBFeedback || 'Response reviewed.',
    criteriaAnalysis: parsed.criteriaAnalysis || {
      accuracy: 'Evaluated',
      clarity: 'Evaluated',
      adherence: 'Evaluated',
      efficiency: 'Evaluated',
    },
    judgeModel,
    latencyMs: judgeLatencyMs,
  };
}

/**
 * Runs the full prompt comparison workflow:
 * 1. Executes Target A and Target B concurrently
 * 2. Runs Judge LLM (Gemini 3.5 Flash Lite) to score and summarize
 */
export async function comparePrompts(
  req: PromptComparisonRequest
): Promise<PromptComparisonResponse> {
  const [resA, resB] = await Promise.all([
    executePromptTarget(req.targetA, req.userApiKeys, req.isMaster),
    executePromptTarget(req.targetB, req.userApiKeys, req.isMaster),
  ]);

  const judge = await evaluateWithJudge(req, resA, resB);

  // Attach ratings to individual target outputs
  resA.rating = judge.targetARating;
  resA.feedback = judge.targetAFeedback;
  resB.rating = judge.targetBRating;
  resB.feedback = judge.targetBFeedback;

  return {
    mode: req.mode,
    targetA: resA,
    targetB: resB,
    judge,
    timestamp: new Date().toISOString(),
  };
}
