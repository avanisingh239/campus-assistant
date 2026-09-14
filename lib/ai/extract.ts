import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, getClaudeClient } from "./claude";
import {
  ExtractionBatchSchema,
  type ExtractedAnnouncement,
} from "./extraction-schema";

// Contract 4.2 in docs/ai-contracts.md — keep the two in sync.
const SYSTEM_PROMPT = `You are the extraction engine for Campus Assistant.
Your task is to analyze unstructured campus messages (e.g. from WhatsApp groups) and extract structured announcements.

STRICT RULES:
1. Extract only facts directly stated in the text.
2. If any field (date, time, class/section match, seat count, link) is missing or unclear, output null.
3. NEVER guess or fabricate values.
4. Categorize each announcement into exactly one primary category:
   ['deadline', 'cancellation', 'event', 'opportunity', 'registered_update', 'society_link', 'fyi', 'duplicate', 'uncategorized'].
5. For confidence:
   - 'clear': All necessary operational details are present.
   - 'partial': What is happening is clear, but key operational details (exact time, date, or class match) are missing.
   - 'unclear': Message is vague, incomplete, or ambiguous.
6. Provide a concise 1-sentence 'why_it_matters' (the consequence/impact), or null if none applies.
7. Provide a single verb-led 'what_to_do_next' (e.g., 'Submit assignment on LMS', 'No action needed'), or null.
8. If the message names a class, course, or section that might match a student's timetable, set 'linked_class_name'
   to that name verbatim and 'match_confidence' to your confidence (0-1) that it identifies a specific class —
   do not guess a class that isn't named or clearly implied.
9. Output MUST strictly match the requested JSON schema.
10. A single raw_text payload may contain many forwarded messages concatenated together — extract one
    announcement per distinct notice, not one per input message; unrelated chatter and system lines produce no
    announcement at all.`;

export class ExtractionError extends Error {}

/**
 * Calls the Claude API to extract structured announcements from a raw pasted
 * text payload, validated against ExtractionBatchSchema.
 *
 * `client.messages.parse()` + `zodOutputFormat()` handles the JSON-schema
 * plumbing and validates the response before it's returned — see
 * typescript/claude-api/tool-use.md ("Structured Outputs") in the
 * claude-api skill. lib/ingestion/ingest.ts re-validates each item
 * independently before writing to the database (defense in depth).
 */
export async function extractAnnouncements(
  rawText: string,
): Promise<ExtractedAnnouncement[]> {
  const client = getClaudeClient();

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawText }],
    output_config: {
      format: zodOutputFormat(ExtractionBatchSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError(
      "Claude declined to process this input. Try rephrasing or removing sensitive content.",
    );
  }

  if (!response.parsed_output) {
    throw new ExtractionError(
      "Claude's response did not match the expected extraction schema.",
    );
  }

  return response.parsed_output.announcements;
}
