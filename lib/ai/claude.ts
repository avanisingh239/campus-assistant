import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API client for the extraction pipeline (docs/ai-contracts.md).
 * Resolves ANTHROPIC_API_KEY from the environment — never hardcode a key.
 *
 * Model: claude-haiku-4-5-20251001. Extraction against a fixed 9-category
 * taxonomy and a strict Zod schema is a classification-shaped workload —
 * Haiku 4.5 handles it well at roughly 1/5 the cost of claude-opus-5. If the
 * zero-fabrication rule in docs/ai-contracts.md §1 turns out to need more
 * model capability in practice (missed fields, invented values), that's a
 * measured decision to revisit, not a default to size up preemptively.
 */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY. Copy .env.example to .env.local and fill it in.",
      );
    }
    client = new Anthropic();
  }
  return client;
}
