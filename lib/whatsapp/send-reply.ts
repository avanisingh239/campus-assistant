import "server-only";

/**
 * Best-effort confirmation reply via the WhatsApp Cloud API's Send Message
 * endpoint (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) —
 * optional per the task that added app/api/whatsapp-webhook/route.ts:
 * silently no-ops (resolves, doesn't throw) when `WHATSAPP_ACCESS_TOKEN`/
 * `WHATSAPP_PHONE_NUMBER_ID` aren't set, so the webhook's actual job
 * (feeding lib/ingestion/ingest.ts) works end-to-end without this.
 *
 * The caller (the webhook route) is responsible for not letting a failure
 * here affect anything else — see that file's own try/catch around this call.
 */
export async function sendWhatsAppReply(to: string, body: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${errorText}`);
  }
}
