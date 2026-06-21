import { logger } from './logger.js';
import { readEnvFile } from './env.js';

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Present on assistant turns that request tools. */
  tool_calls?: OpenRouterToolCall[];
  /** Present on tool-result turns; links back to the originating tool_call. */
  tool_call_id?: string;
  /** Tool name, for tool-result turns. */
  name?: string;
}

/** OpenAI-style function tool definition passed to the model. */
export interface OpenRouterTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OpenRouterChoice {
  message: { role: string; content: string | null; tool_calls?: OpenRouterToolCall[] };
  finish_reason: string;
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface OpenRouterResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  /** Tool calls requested by the model (empty when it answered directly). */
  toolCalls: OpenRouterToolCall[];
  finishReason: string;
}

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  const fromEnv = process.env.OPENROUTER_API_KEY;
  if (fromEnv) return fromEnv;
  const secrets = readEnvFile(['OPENROUTER_API_KEY']);
  return secrets.OPENROUTER_API_KEY ?? '';
}

/**
 * Send a chat completion request to OpenRouter.
 * Returns the assistant message content.
 */
export async function openrouterChat(
  model: string,
  messages: OpenRouterMessage[],
  options?: { temperature?: number; timeout?: number; tools?: OpenRouterTool[]; toolChoice?: 'auto' | 'none' },
): Promise<OpenRouterResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 120_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/inematds/openpcbot',
        'X-Title': 'OpenPCBot',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        ...(options?.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    const toolCalls = choice?.message?.tool_calls ?? [];
    // A response is empty only when there is neither text nor a tool call.
    if (!content && toolCalls.length === 0) throw new Error('OpenRouter returned empty response');

    if (data.usage) {
      logger.info(
        { model, promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, toolCalls: toolCalls.length },
        'OpenRouter usage',
      );
    }

    return {
      content,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      toolCalls,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if OpenRouter API key is configured.
 */
export function openrouterAvailable(): boolean {
  return !!getApiKey();
}
