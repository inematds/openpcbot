import { logger } from './logger.js';
import { readEnvFile } from './env.js';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterChoice {
  message: { role: string; content: string };
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
  options?: { temperature?: number; timeout?: number },
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
        'HTTP-Referer': 'https://github.com/claudeclaw',
        'X-Title': 'ClaudeClaw',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenRouter error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty response');

    if (data.usage) {
      logger.info(
        { model, promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens },
        'OpenRouter usage',
      );
    }

    return {
      content,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
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
