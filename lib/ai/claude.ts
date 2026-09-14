import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API client for the extraction pipeline (docs/ai-contracts.md).
 * Resolves ANTHROPIC_API_KEY from the environment — never hardcode a key.
 *
 * Model: claude-opus-5, per this project's model-choice default. Extraction
 * is a classification-shaped workload that could run cheaper on a smaller
 * model or at lower `output_config.effort`, but the zero-fabrication
 * requirement in docs/ai-contracts.md §1 makes correctness the priority
 * here — treat switching model/effort as a deliberate, measured decision
 * (see the claude-api skill's cost-optimization guide), not a default.
 */
export const CLAUDE_MODEL = "claude-opus-5";

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
