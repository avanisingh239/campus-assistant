import { z } from "zod";

/**
 * Pure parser for Meta's WhatsApp Cloud API webhook POST payload — no
 * network/DB access, so it's cheap to unit test (see
 * whatsapp-webhook.test.ts) the same way lib/ingestion/whatsapp-parser.ts
 * is. Deliberately lenient (every field but `entry` is optional/nullable
 * at the schema level) because Meta sends the same webhook URL a variety
 * of payload shapes — delivery-status callbacks, read receipts, non-text
 * messages (image/audio/location, none of which have a `text.body`) — and
 * this app only cares about plain text messages. Anything else safely
 * parses to zero results rather than throwing.
 */
const WebhookMessageSchema = z.object({
  from: z.string(),
  text: z.object({ body: z.string() }).optional(),
});

const WebhookPayloadSchema = z.object({
  entry: z.array(
    z.object({
      changes: z
        .array(
          z.object({
            value: z.object({
              messages: z.array(WebhookMessageSchema).optional(),
            }),
          }),
        )
        .optional(),
    }),
  ),
});

export interface WhatsAppIncomingMessage {
  /** The sender's phone number, e.g. "15551234567" — Meta sends this with no "+". */
  from: string;
  body: string;
}

/**
 * Extracts every plain-text message from one webhook POST body. Returns
 * an empty array — never throws — for a payload that doesn't match the
 * expected shape at all, or one that matches but contains no text
 * messages (status updates, non-text media, etc.); the route handler
 * treats both the same way: acknowledge Meta with 200, nothing to ingest.
 */
export function parseWhatsAppWebhookPayload(payload: unknown): WhatsAppIncomingMessage[] {
  const result = WebhookPayloadSchema.safeParse(payload);
  if (!result.success) return [];

  const messages: WhatsAppIncomingMessage[] = [];
  for (const entry of result.data.entry) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value.messages ?? []) {
        if (message.text?.body) {
          messages.push({ from: message.from, body: message.text.body });
        }
      }
    }
  }
  return messages;
}
