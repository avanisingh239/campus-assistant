import { NextResponse, after, type NextRequest } from "next/server";
import { ingestRawText } from "@/lib/ingestion/ingest";
import { parseWhatsAppWebhookPayload, type WhatsAppIncomingMessage } from "@/lib/ingestion/whatsapp-webhook";
import { sendWhatsAppReply } from "@/lib/whatsapp/send-reply";

/**
 * Inbound webhook for Meta's WhatsApp Cloud API — feeds any live 1:1
 * WhatsApp forward into the same ingestion pipeline `/student/ingest`'s
 * bulk paste and `app/(dev)/clash-test`'s predecessor already use
 * (`lib/ingestion/ingest.ts`'s `ingestRawText`). Nothing about that
 * pipeline is duplicated here — this route's only job is turning Meta's
 * webhook payload into the same `(rawText, options)` shape a paste
 * already produces, then handing it off.
 *
 * ⚠️ SECURITY: this endpoint has no way to verify a request actually came
 * from Meta — anyone who discovers this URL can POST an arbitrary payload
 * and have it written to the database through the service-role client
 * (bypasses RLS by design, same as every other ingestion entry point —
 * see lib/supabase/admin.ts). Acceptable for a hackathon demo; before this
 * is reachable by the public internet for real, verify the
 * `X-Hub-Signature-256` header against the Meta app secret (HMAC-SHA256
 * over the raw request body) per
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads
 * — not implemented here, deliberately, per the task that added this route.
 *
 * Not literally docs/requirements-traceability.md Feature 5.3 ("WhatsApp
 * Business Bot," Admin Experience, Stretch, Deferred but Committed) —
 * that feature is CR-scoped structured submission into an
 * `admin_submissions` table that doesn't exist anywhere in
 * supabase/schema.sql yet (every `/admin/submit/*` route is still a
 * placeholder). This route does something narrower and already-buildable:
 * routes an inbound message through the same general, unauthenticated-
 * paste-shaped pipeline `messages`/`announcements` already support, with
 * no admin/CR association at all — an extension of Area 1's ingestion
 * surface, not an implementation of 5.3. See CLAUDE.md's §WhatsApp webhook.
 */

/**
 * Meta's webhook verification handshake
 * (https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests):
 * when you save the webhook URL in the Meta App Dashboard, Meta calls this
 * with `hub.mode=subscribe`, `hub.verify_token` (whatever you configured
 * there), and `hub.challenge` (an arbitrary value it expects echoed back
 * verbatim). Responding with anything else tells Meta the URL isn't ready.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    // Not valid JSON at all — nothing to process, but still acknowledge
    // so Meta doesn't retry.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const messages = parseWhatsAppWebhookPayload(payload);

  // Meta expects a fast 200 and retries (creating duplicate processing) if
  // the response is slow — schedule the actual pipeline work with
  // next/server's after() so it keeps running once this response is sent,
  // instead of racing a fire-and-forget promise against the function
  // freezing right after `return`.
  if (messages.length > 0) {
    after(() => processIncomingMessages(messages));
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processIncomingMessages(messages: WhatsAppIncomingMessage[]): Promise<void> {
  for (const message of messages) {
    let extractedCount: number;
    try {
      const result = await ingestRawText(message.body, {
        sourceType: "whatsapp_bot",
        // No real group name for a 1:1 forward — the sender's own number
        // is the closest thing to one, and matches how the trace-to-source
        // drawer already falls back to "UNKNOWN SOURCE" for a null value.
        sourceGroupName: message.from,
      });
      extractedCount = result.extractedCount;
    } catch (err) {
      // Nothing is waiting on this request anymore (Meta already got its
      // 200) — this is the only way a failure here becomes visible at all.
      console.error(`WhatsApp webhook: failed to ingest message from ${message.from}:`, err);
      continue;
    }

    try {
      await sendWhatsAppReply(
        message.from,
        extractedCount > 0
          ? `Got it! Added ${extractedCount} item${extractedCount === 1 ? "" : "s"} to your action plan.`
          : "Got it — nothing actionable found in that message.",
      );
    } catch (err) {
      // The ingest already succeeded; a failed confirmation reply
      // shouldn't read as a pipeline failure.
      console.error(`WhatsApp webhook: ingested but failed to send confirmation reply to ${message.from}:`, err);
    }
  }
}
