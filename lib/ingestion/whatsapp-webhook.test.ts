import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhookPayload } from "./whatsapp-webhook";

function payloadWithMessages(messages: unknown[]) {
  return {
    entry: [{ changes: [{ value: { messages } }] }],
  };
}

describe("parseWhatsAppWebhookPayload", () => {
  it("extracts from/text.body from the documented Meta payload shape", () => {
    const payload = payloadWithMessages([{ from: "15551234567", text: { body: "Class cancelled tomorrow" } }]);
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([
      { from: "15551234567", body: "Class cancelled tomorrow" },
    ]);
  });

  it("extracts multiple messages across multiple entries/changes", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ from: "111", text: { body: "first" } }] } }] },
        { changes: [{ value: { messages: [{ from: "222", text: { body: "second" } }] } }] },
      ],
    };
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([
      { from: "111", body: "first" },
      { from: "222", body: "second" },
    ]);
  });

  it("skips a message with no text.body (e.g. an image message) rather than throwing", () => {
    const payload = payloadWithMessages([
      { from: "111", type: "image", image: { id: "abc" } },
      { from: "222", text: { body: "a real text message" } },
    ]);
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([{ from: "222", body: "a real text message" }]);
  });

  it("returns an empty array for a status-update callback (no messages key at all)", () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.abc", status: "delivered" }] } }] }],
    };
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([]);
  });

  it("returns an empty array, not a throw, for a payload with no entry array at all", () => {
    expect(parseWhatsAppWebhookPayload({})).toEqual([]);
    expect(parseWhatsAppWebhookPayload(null)).toEqual([]);
    expect(parseWhatsAppWebhookPayload("not json")).toEqual([]);
  });

  it("returns an empty array when entry exists but changes is missing", () => {
    expect(parseWhatsAppWebhookPayload({ entry: [{}] })).toEqual([]);
  });
});
