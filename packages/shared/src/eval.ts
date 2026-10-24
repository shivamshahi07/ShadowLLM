import { ToolCall } from './types.js';

/**
 * Calculates Cosine Similarity between two numerical vectors:
 * Cosine(A, B) = (A • B) / (||A|| * ||B||)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, Number(sim.toFixed(4))));
}

/**
 * Deterministic character 3-gram & word feature vectorizer for offline embedding fallback.
 * Maps arbitrary text to a normalized dense vector of fixed dimensions.
 */
export function generateFallbackEmbedding(text: string, dimensions = 64): number[] {
  if (!text || text.trim() === '') {
    return new Array(dimensions).fill(0);
  }

  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const vector = new Array(dimensions).fill(0);

  // 1. Word tokens
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    let hash = 0;
    for (let i = 0; i < w.length; i++) {
      hash = (hash << 5) - hash + w.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vector[idx] += 1.5;
  }

  // 2. Character 3-grams
  for (let i = 0; i <= clean.length - 3; i++) {
    const gram = clean.substring(i, i + 3);
    let hash = 0;
    for (let j = 0; j < gram.length; j++) {
      hash = (hash << 5) - hash + gram.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vector[idx] += 1.0;
  }

  // L2 Normalize vector
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  const sqrtNorm = Math.sqrt(norm);
  if (sqrtNorm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = vector[i] / sqrtNorm;
    }
  }

  return vector;
}

/**
 * Retrieves embeddings using Google AI Studio, OpenAI, or the offline deterministic vectorizer.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const provider = process.env.EMBEDDING_PROVIDER || 'mock';
  const apiKey = process.env.EMBEDDING_API_KEY;

  if (apiKey && provider !== 'mock') {
    try {
      if (provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: { parts: [{ text }] },
            }),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as { embedding?: { values?: number[] } };
          if (data.embedding?.values) {
            return data.embedding.values;
          }
        }
      } else {
        // OpenAI text-embedding-3-small
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: text,
            model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
          if (data.data?.[0]?.embedding) {
            return data.data[0].embedding;
          }
        }
      }
    } catch (err) {
      console.warn('[Eval] Remote embedding API failed, using fallback vectorizer:', err);
    }
  }

  return generateFallbackEmbedding(text);
}

export interface DriftEvaluationResult {
  semanticSimilarity: number;
  toolIntentMatched: boolean;
  hasDriftWarning: boolean;
  driftReason: string | null;
}

/**
 * Evaluates semantic drift and tool intent match between primary and shadow responses.
 */
export async function evaluateDrift(
  primaryText: string,
  shadowText: string,
  primaryTools?: ToolCall[] | null,
  shadowTools?: ToolCall[] | null,
  driftThreshold = 0.85
): Promise<DriftEvaluationResult> {
  const reasons: string[] = [];
  let toolIntentMatched = true;

  // 1. Evaluate tool call intent
  const pHasTools = Array.isArray(primaryTools) && primaryTools.length > 0;
  const sHasTools = Array.isArray(shadowTools) && shadowTools.length > 0;

  if (pHasTools !== sHasTools) {
    toolIntentMatched = false;
    reasons.push(
      pHasTools
        ? 'Primary model invoked tools, but shadow model generated direct text.'
        : 'Shadow model attempted tool execution when primary answered directly.'
    );
  } else if (pHasTools && sHasTools) {
    const pTool = primaryTools![0];
    const sTool = shadowTools![0];

    if (pTool.function.name !== sTool.function.name) {
      toolIntentMatched = false;
      reasons.push(
        `Tool mismatch: Primary selected '${pTool.function.name}', Shadow selected '${sTool.function.name}'.`
      );
    } else {
      try {
        const pArgs = JSON.parse(pTool.function.arguments);
        const sArgs = JSON.parse(sTool.function.arguments);
        if (JSON.stringify(pArgs) !== JSON.stringify(sArgs)) {
          // Check if parameters are semantically equivalent or drifting
          const pKeys = Object.keys(pArgs).sort();
          const sKeys = Object.keys(sArgs).sort();
          if (JSON.stringify(pKeys) !== JSON.stringify(sKeys)) {
            toolIntentMatched = false;
            reasons.push(`Tool argument schema deviated: Primary keys [${pKeys.join(', ')}] vs Shadow [${sKeys.join(', ')}].`);
          }
        }
      } catch {
        if (pTool.function.arguments !== sTool.function.arguments) {
          toolIntentMatched = false;
          reasons.push('Tool argument string mismatch.');
        }
      }
    }
  }

  // 2. Semantic Similarity via Cosine Distance of Embeddings
  let semanticSimilarity = 1.0;

  if (primaryText || shadowText) {
    const [vecP, vecS] = await Promise.all([
      getEmbedding(primaryText || ''),
      getEmbedding(shadowText || ''),
    ]);
    semanticSimilarity = cosineSimilarity(vecP, vecS);

    if (semanticSimilarity < driftThreshold) {
      reasons.push(
        `Semantic similarity (${semanticSimilarity}) breached alert threshold (${driftThreshold}).`
      );
    }
  }

  const hasDriftWarning = !toolIntentMatched || semanticSimilarity < driftThreshold;
  const driftReason = reasons.length > 0 ? reasons.join(' ') : null;

  return {
    semanticSimilarity,
    toolIntentMatched,
    hasDriftWarning,
    driftReason,
  };
}
