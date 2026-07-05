import { logger } from './logger.js';

/** A tool call as emitted by Ollama. Note `arguments` is a parsed object (not a
 * JSON string like OpenAI/OpenRouter), and `id` may be absent on some versions. */
export interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on an assistant turn that requested tools (fed back on the next call). */
  tool_calls?: OllamaToolCall[];
  /** Set on a `role: 'tool'` result so Ollama can match it to the call. */
  tool_name?: string;
}

/** Tool definition shape Ollama accepts (same JSON shape as OpenRouter tools). */
export interface OllamaTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OllamaChatResponse {
  message: { role: string; content: string; tool_calls?: OllamaToolCall[]; thinking?: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
  error?: string;
}

export interface OllamaResult {
  content: string;
  toolCalls: OllamaToolCall[];
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
  options?: { temperature?: number; timeout?: number; tools?: OllamaTool[]; keepAlive?: string; think?: boolean },
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
        ...(options?.tools && options.tools.length ? { tools: options.tools } : {}),
        ...(options?.think != null ? { think: options.think } : {}),
        ...(options?.keepAlive ? { keep_alive: options.keepAlive } : {}),
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
      content: data.message.content ?? '',
      toolCalls: data.message.tool_calls ?? [],
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
