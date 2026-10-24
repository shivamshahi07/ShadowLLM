import {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolCall,
} from './types.js';

export class MockLLMResponder {
  /**
   * Generates a deterministic mock response for primary or shadow models.
   */
  static generateResponse(
    request: ChatCompletionRequest,
    isShadow = false
  ): {
    response: ChatCompletionResponse;
    toolCalls?: ToolCall[];
    responseText: string;
    promptTokens: number;
    completionTokens: number;
  } {
    const lastMessage = request.messages[request.messages.length - 1];
    const userPrompt = typeof lastMessage?.content === 'string' ? lastMessage.content : '';

    // Check if tools were provided and the user prompt requests a mutating or read action
    const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
    const lower = userPrompt.toLowerCase();

    let toolCalls: ToolCall[] | undefined = undefined;
    let responseText = '';

    if (hasTools && (lower.includes('charge') || lower.includes('payout') || lower.includes('transfer') || lower.includes('refund'))) {
      const tool = request.tools?.find((t) => t.function.name.includes('payout') || t.function.name.includes('charge') || t.function.name.includes('refund')) || request.tools![0];
      const toolName = tool.function.name;

      // Extract amount or default to 150
      const amountMatch = lower.match(/\$?\b(\d+(\.\d+)?)\b/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 150.0;

      // Shadow might subtly format args or match exactly
      const args = isShadow
        ? { recipient_id: 'usr_89234', amount: amount, currency: 'USD', notes: 'Automated disbursement' }
        : { recipient_id: 'usr_89234', amount: amount, currency: 'USD' };

      toolCalls = [
        {
          id: `call_${isShadow ? 'shd' : 'prm'}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        },
      ];
      responseText = '';
    } else if (hasTools && (lower.includes('update') || lower.includes('database') || lower.includes('order'))) {
      const tool = request.tools?.find((t) => t.function.name.includes('update')) || request.tools![0];
      const args = { order_id: 'ord_9941', status: 'COMPLETED', updated_by: 'system' };
      toolCalls = [
        {
          id: `call_${isShadow ? 'shd' : 'prm'}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'function',
          function: {
            name: tool.function.name,
            arguments: JSON.stringify(args),
          },
        },
      ];
      responseText = '';
    } else {
      // Regular text completion
      if (lower.includes('explain') || lower.includes('what is') || lower.includes('how')) {
        responseText = isShadow
          ? `ShadowLLM ensures zero double-mutations by virtualizing side-effect tool calls and calculating live cosine similarity drift between models in real time.`
          : `ShadowLLM provides seamless production shadow testing by intercepting chat completions, bifurcating traffic, and sandboxing mutating actions to prevent duplicate execution.`;
      } else if (lower.includes('hello') || lower.includes('hi')) {
        responseText = isShadow
          ? `Hello! I am the shadow evaluator model running asynchronously to evaluate prompt safety and output quality.`
          : `Hello! I am the production primary model serving your live chat completion request.`;
      } else {
        responseText = isShadow
          ? `Processed prompt with shadow model (${request.model}): verified parameters and evaluated output with zero impact on production.`
          : `Processed prompt with primary model (${request.model}): response delivered with optimal reliability and accuracy.`;
      }
    }

    const promptTokens = Math.max(12, Math.round(userPrompt.length / 4));
    const completionTokens = Math.max(18, Math.round(responseText.length / 4) + (toolCalls ? 25 : 0));

    const response: ChatCompletionResponse = {
      id: `chatcmpl-${isShadow ? 'shd' : 'prm'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseText || null,
            tool_calls: toolCalls,
          },
          finish_reason: toolCalls ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };

    return {
      response,
      toolCalls,
      responseText,
      promptTokens,
      completionTokens,
    };
  }

  /**
   * Generates SSE chunks for streaming responses.
   */
  static generateChunks(
    request: ChatCompletionRequest,
    isShadow = false
  ): {
    chunks: ChatCompletionChunk[];
    fullText: string;
    toolCalls?: ToolCall[];
    promptTokens: number;
    completionTokens: number;
  } {
    const { response, toolCalls, responseText, promptTokens, completionTokens } = this.generateResponse(request, isShadow);

    const chunks: ChatCompletionChunk[] = [];
    const baseId = response.id;
    const created = response.created;

    // First chunk sends role
    chunks.push({
      id: baseId,
      object: 'chat.completion.chunk',
      created,
      model: request.model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
        },
      ],
    });

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        // Stream tool call in 2 parts (name first, then arguments)
        chunks.push({
          id: baseId,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.function.name, arguments: '' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });

        // Arguments chunk
        chunks.push({
          id: baseId,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: tc.function.arguments },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
      }

      // Final tool call finish chunk
      chunks.push({
        id: baseId,
        object: 'chat.completion.chunk',
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          },
        ],
      });
    } else {
      // Break response text into word-sized tokens
      const words = responseText.split(' ');
      for (let i = 0; i < words.length; i++) {
        const word = words[i] + (i < words.length - 1 ? ' ' : '');
        chunks.push({
          id: baseId,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: { content: word },
              finish_reason: null,
            },
          ],
        });
      }

      // Final stop chunk
      chunks.push({
        id: baseId,
        object: 'chat.completion.chunk',
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      });
    }

    return {
      chunks,
      fullText: responseText,
      toolCalls,
      promptTokens,
      completionTokens,
    };
  }
}
