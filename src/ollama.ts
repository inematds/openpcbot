import { logger } from './logger.js';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

export interface OllamaResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

const DEFAULT_URL = 'http://localhost:11434';

export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || DEFAULT_URL;
}

/**
 * Send a chat completion request to Ollama.
 * Returns the assistant message content.
 */
export async function ollamaChat(
  model: string,
  messages: OllamaMessage[],
  options?: { temperature?: number; timeout?: number },
): Promise<OllamaResult> {
  const url = `${getOllamaUrl()}/api/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 300_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(options?.temperature != null ? { options: { temperature: options.temperature } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return {
      content: data.message.content,
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if Ollama is reachable and the model is available.
 */
export async function ollamaHealthCheck(model?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };

    if (model) {
      const data = (await res.json()) as { models: Array<{ name: string }> };
      const names = data.models.map((m) => m.name);
      const found = names.some((n) => n === model || n.startsWith(model + ':'));
      if (!found) return { ok: false, error: `Model "${model}" not found. Available: ${names.join(', ')}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Ollama unreachable at ${getOllamaUrl()}` };
  }
}

/**
 * List available Ollama models.
 */
export async function ollamaListModels(): Promise<string[]> {
  try {
    const res = await fetch(`${getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}
