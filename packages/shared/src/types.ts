export type ToolType = 'READ_ONLY' | 'SIDE_EFFECT';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: ToolDefinition[];
  tool_choice?: string | { type: 'function'; function: { name: string } };
  [key: string]: any;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface CanaryTargetConfig {
  provider: 'openai' | 'groq' | 'gemini' | 'mock' | string;
  model: string;
  base_url?: string;
  api_key?: string;
  system_prompt_override?: string | null;
}

export interface CanaryConfig {
  id: string;
  is_active: boolean;
  sample_rate: number;
  primary_provider: string;
  primary_model: string;
  primary_base_url: string;
  shadow_provider: string;
  shadow_model: string;
  shadow_base_url: string;
  system_prompt_override?: string | null;
  drift_alert_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutionTrace {
  id: string;
  endpoint: string;
  client_ip_hash?: string | null;
  prompt_tokens: number;
  prompt_preview?: string | null;

  // Primary Model
  primary_model: string;
  primary_response_text: string | null;
  primary_tool_calls: ToolCall[] | null;
  primary_latency_ms: number;
  primary_cost_usd: number;

  // Shadow Model
  shadow_model: string | null;
  shadow_response_text: string | null;
  shadow_tool_calls: ToolCall[] | null;
  shadow_latency_ms: number | null;
  shadow_cost_usd: number | null;

  // Eval Metrics
  semantic_similarity: number | null;
  tool_intent_matched: boolean | null;
  has_drift_warning: boolean;
  drift_reason: string | null;

  created_at: string;
}

export interface VirtualizedToolMutation {
  id: number | string;
  trace_id: string;
  tool_name: string;
  tool_type: ToolType;
  primary_args: Record<string, any> | null;
  shadow_args: Record<string, any> | null;
  args_match: boolean;
  virtualization_action: 'mocked' | 'replayed_primary' | 'blocked';
  created_at: string;
}

export interface ShadowPayload {
  traceId: string;
  request: ChatCompletionRequest;
  clientIpHash?: string;
  promptPreview?: string;
  primaryModel: string;
  primaryResponseText: string;
  primaryToolCalls?: ToolCall[];
  primaryLatencyMs: number;
  primaryPromptTokens: number;
  primaryCompletionTokens: number;
  primaryCostUsd: number;
  shadowTarget: {
    provider: string;
    model: string;
    baseUrl: string;
    systemPromptOverride?: string | null;
  };
  driftThreshold: number;
  timestamp: number;
}

export interface CanaryStats {
  totalRequests: number;
  shadowSampleCount: number;
  sampleRate: number;
  avgSemanticSimilarity: number;
  driftWarningCount: number;
  driftWarningRate: number;
  totalPrimaryCostUsd: number;
  totalShadowCostUsd: number;
  costSavingsUsd: number;
  costSavingsPercent: number;
  p50PrimaryLatencyMs: number;
  p95PrimaryLatencyMs: number;
  p50ShadowLatencyMs: number;
  p95ShadowLatencyMs: number;
  latencyDeltaMs: number;
  virtualizedMutationCount: number;
}
