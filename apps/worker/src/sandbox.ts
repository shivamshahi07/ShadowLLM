import {
  ToolCall,
  ToolType,
  VirtualizedToolMutation,
} from '@shadow-llm/shared';

// Known side-effect action patterns
const SIDE_EFFECT_KEYWORDS = [
  'charge',
  'pay',
  'payout',
  'transfer',
  'refund',
  'create',
  'update',
  'delete',
  'insert',
  'remove',
  'send',
  'post',
  'publish',
  'write',
  'modify',
  'cancel',
  'execute',
];

const READ_ONLY_KEYWORDS = [
  'get',
  'read',
  'fetch',
  'search',
  'list',
  'check',
  'lookup',
  'query',
  'find',
  'view',
  'status',
];

/**
 * Classifies a tool as READ_ONLY or SIDE_EFFECT based on name and parameters.
 */
export function classifyTool(toolName: string): ToolType {
  const normalized = toolName.toLowerCase();

  for (const kw of SIDE_EFFECT_KEYWORDS) {
    if (normalized.includes(kw)) {
      return 'SIDE_EFFECT';
    }
  }

  for (const kw of READ_ONLY_KEYWORDS) {
    if (normalized.includes(kw)) {
      return 'READ_ONLY';
    }
  }

  // Default to SIDE_EFFECT for safety in production sandboxing
  return 'SIDE_EFFECT';
}

/**
 * Deep compares arguments between primary and shadow tool calls.
 */
export function diffArguments(
  primaryArgsStr: string,
  shadowArgsStr: string
): { match: boolean; primaryArgs: Record<string, any>; shadowArgs: Record<string, any>; diffs: string[] } {
  let primaryArgs: Record<string, any> = {};
  let shadowArgs: Record<string, any> = {};

  try {
    primaryArgs = typeof primaryArgsStr === 'string' ? JSON.parse(primaryArgsStr) : primaryArgsStr || {};
  } catch {
    primaryArgs = { _raw: primaryArgsStr };
  }

  try {
    shadowArgs = typeof shadowArgsStr === 'string' ? JSON.parse(shadowArgsStr) : shadowArgsStr || {};
  } catch {
    shadowArgs = { _raw: shadowArgsStr };
  }

  const diffs: string[] = [];
  const allKeys = new Set([...Object.keys(primaryArgs), ...Object.keys(shadowArgs)]);

  for (const key of allKeys) {
    const valP = primaryArgs[key];
    const valS = shadowArgs[key];

    if (valP === undefined) {
      diffs.push(`Key '${key}' added in shadow (value: ${JSON.stringify(valS)})`);
    } else if (valS === undefined) {
      diffs.push(`Key '${key}' missing in shadow (expected: ${JSON.stringify(valP)})`);
    } else if (JSON.stringify(valP) !== JSON.stringify(valS)) {
      diffs.push(`Key '${key}' mismatch: Primary=${JSON.stringify(valP)} vs Shadow=${JSON.stringify(valS)}`);
    }
  }

  return {
    match: diffs.length === 0,
    primaryArgs,
    shadowArgs,
    diffs,
  };
}

export interface VirtualizedToolResult {
  toolCall: ToolCall;
  toolType: ToolType;
  mutationRecord?: Omit<VirtualizedToolMutation, 'id' | 'created_at'>;
  simulatedResponse: string;
}

/**
 * Side-Effect Virtualization Sandbox:
 * Intercepts mutating tool calls, diffs arguments against primary model execution,
 * and produces safe mock outputs so shadow agent completes its reasoning loop without duplicate execution.
 */
export function virtualizeToolCall(
  traceId: string,
  shadowToolCall: ToolCall,
  primaryToolCalls?: ToolCall[] | null
): VirtualizedToolResult {
  const toolName = shadowToolCall.function.name;
  const toolType = classifyTool(toolName);

  // Find corresponding tool in primary calls if any
  const primaryMatch = primaryToolCalls?.find((ptc) => ptc.function.name === toolName);

  if (toolType === 'READ_ONLY') {
    return {
      toolCall: shadowToolCall,
      toolType: 'READ_ONLY',
      simulatedResponse: JSON.stringify({
        status: 'read_success',
        source: 'cached_read_replica',
        data: { message: `Simulated safe read for ${toolName}` },
      }),
    };
  }

  // Mutating tool - Virtualize!
  if (primaryMatch) {
    const { match, primaryArgs, shadowArgs } = diffArguments(
      primaryMatch.function.arguments,
      shadowToolCall.function.arguments
    );

    const action = match ? 'replayed_primary' : 'mocked';
    const simulatedResponse = JSON.stringify({
      status: 'virtualized_success',
      virtualized: true,
      action,
      tool: toolName,
      message: match
        ? 'Matched primary execution arguments; replayed safe dry-run output.'
        : 'Arguments deviated from primary; safely sandboxed with zero external mutation.',
    });

    return {
      toolCall: shadowToolCall,
      toolType: 'SIDE_EFFECT',
      mutationRecord: {
        trace_id: traceId,
        tool_name: toolName,
        tool_type: 'SIDE_EFFECT',
        primary_args: primaryArgs,
        shadow_args: shadowArgs,
        args_match: match,
        virtualization_action: action,
      },
      simulatedResponse,
    };
  }

  // Shadow proposed a mutating tool that primary did NOT execute!
  let shadowArgs: Record<string, any> = {};
  try {
    shadowArgs = JSON.parse(shadowToolCall.function.arguments);
  } catch {
    shadowArgs = { _raw: shadowToolCall.function.arguments };
  }

  return {
    toolCall: shadowToolCall,
    toolType: 'SIDE_EFFECT',
    mutationRecord: {
      trace_id: traceId,
      tool_name: toolName,
      tool_type: 'SIDE_EFFECT',
      primary_args: null,
      shadow_args: shadowArgs,
      args_match: false,
      virtualization_action: 'blocked',
    },
    simulatedResponse: JSON.stringify({
      status: 'blocked_mutation',
      virtualized: true,
      action: 'blocked',
      tool: toolName,
      warning: 'Shadow model attempted side-effect action not present in primary baseline.',
    }),
  };
}
