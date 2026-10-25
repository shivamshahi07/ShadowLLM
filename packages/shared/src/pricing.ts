export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-2024-08-06': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gpt-4-turbo': { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  'gpt-3.5-turbo': { inputPerMillion: 0.50, outputPerMillion: 1.50 },

  // Anthropic (via proxy/compatible)
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-haiku': { inputPerMillion: 0.80, outputPerMillion: 4.00 },

  // Groq (Llama / OSS / Qwen)
  'openai/gpt-oss-120b': { inputPerMillion: 0.60, outputPerMillion: 0.80 },
  'openai/gpt-oss-20b': { inputPerMillion: 0.10, outputPerMillion: 0.20 },
  'qwen/qwen3.8-27b': { inputPerMillion: 0.20, outputPerMillion: 0.30 },
  'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  'mixtral-8x7b-32768': { inputPerMillion: 0.24, outputPerMillion: 0.24 },

  // Google Gemini
  'gemini-3.8-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-3.5-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-3.5-flash-lite': { inputPerMillion: 0.05, outputPerMillion: 0.20 },
  'gemini-2.5-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-2.0-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-2.0-flash-exp': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },

  // Mocks
  'mock-primary': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'mock-shadow': { inputPerMillion: 0.50, outputPerMillion: 0.80 },
};

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Normalize model name (remove prefix or timestamp if needed)
  const normalized = model.toLowerCase();
  let pricing = MODEL_PRICING[normalized];

  if (!pricing) {
    for (const key of Object.keys(MODEL_PRICING)) {
      if (normalized.includes(key)) {
        pricing = MODEL_PRICING[key];
        break;
      }
    }
  }

  // Default fallback if unknown: assume modest mid-tier pricing ($1 / $3)
  if (!pricing) {
    pricing = { inputPerMillion: 1.00, outputPerMillion: 3.00 };
  }

  const promptCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const completionCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  const total = promptCost + completionCost;

  return Number(total.toFixed(6));
}
