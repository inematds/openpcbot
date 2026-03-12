import { ollamaChat, OllamaMessage } from './ollama.js';
import { logger } from './logger.js';

export type AgentTarget = 'ollama' | 'claude' | 'codex' | 'openrouter';

export interface RouteDecision {
  action: 'respond' | 'route';
  /** Direct response from the orchestrator (when action === 'respond') */
  response?: string;
  /** Which agent to dispatch to (when action === 'route') */
  agent?: AgentTarget;
  /** Instructions/context to pass to the agent */
  instructions?: string;
}

const ROUTER_SYSTEM_PROMPT = `You are a message router for a personal assistant system. Analyze the user's message and decide how to handle it.

You have these agents available:
- claude: Full coding agent with bash, file editing, web search, sub-agents. Use for code tasks, system operations, multi-step work, anything requiring tools.
- codex: OpenAI coding agent with bash and file editing. Use as alternative to claude for code tasks.
- openrouter: Chat-only API with many models. Use for complex reasoning or specific model requests.

Rules:
- If the message is a simple question, greeting, translation, quick fact, or casual conversation that you can answer well: respond directly.
- If the message requires file editing, running commands, code generation, debugging, system operations, or any tool use: route to an agent.
- If the message is ambiguous, prefer responding directly. Only route when tools are clearly needed.
- When routing, include the original message as instructions (do not modify or summarize it).

Respond ONLY with valid JSON (no markdown, no explanation):
- To respond directly: {"action":"respond","response":"your response here"}
- To route to an agent: {"action":"route","agent":"claude","instructions":"original message"}`;

/**
 * Use Ollama as an orchestrator to classify and route messages.
 * Returns a decision: respond directly or dispatch to an agent.
 */
export async function routeMessage(
  message: string,
  routerModel: string,
): Promise<RouteDecision> {
  const messages: OllamaMessage[] = [
    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ];

  try {
    const result = await ollamaChat(routerModel, messages, { temperature: 0.1, timeout: 30_000 });
    const raw = result.content;

    // Extract JSON from response (handle markdown wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ raw: raw.slice(0, 200) }, 'Router returned non-JSON, falling back to direct response');
      return { action: 'respond', response: raw };
    }

    const parsed = JSON.parse(jsonMatch[0]) as RouteDecision;

    // Validate the decision
    if (parsed.action === 'route') {
      const validAgents: AgentTarget[] = ['claude', 'codex', 'openrouter'];
      if (!parsed.agent || !validAgents.includes(parsed.agent)) {
        parsed.agent = 'claude'; // default to claude if invalid
      }
      if (!parsed.instructions) {
        parsed.instructions = message; // always pass original message
      }
    }

    logger.info(
      { action: parsed.action, agent: parsed.agent },
      'Router decision',
    );

    return parsed;
  } catch (err) {
    logger.error({ err }, 'Router failed, falling back to claude');
    // On any error, route to Claude as the safest fallback
    return { action: 'route', agent: 'claude', instructions: message };
  }
}
