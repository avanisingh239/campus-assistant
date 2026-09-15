import { describe, expect, it } from "vitest";
import { parseWhatsAppExport } from "./whatsapp-parser";

const SAMPLE_EXPORT = `3/10/24, 9:03 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
3/10/24, 9:05 AM - Asha Verma: Hey everyone, reminder that the Data Structures assignment is due this Friday by 11:59 PM on LMS.
3/10/24, 9:06 AM - Rahul Singh: Also heads up — tomorrow's 10 AM Algorithms class is cancelled, Prof. Mehta is out sick.
3/10/24, 9:08 AM - Asha Verma: Robotics Club is hosting a workshop on Saturday 2-4 PM in Lab 204. Only 20 seats available, register on the form:
https://forms.gle/robotics-workshop-demo
3/10/24, 9:10 AM - Priya Nair: Reminder: physics quiz moved to next Monday, room TBD`;

describe("parseWhatsAppExport", () => {
  it("splits a real export into one message per sender turn", () => {
    const result = parseWhatsAppExport(SAMPLE_EXPORT);
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(4);
  });

  it("drops the system-notice line (no sender prefix) rather than treating it as a message", () => {
    const result = parseWhatsAppExport(SAMPLE_EXPORT);
    expect(result!.skippedSystemLines).toBe(1);
    expect(result!.messages.some((m) => m.includes("end-to-end encrypted"))).toBe(false);
  });

  it("keeps a multi-line message (continuation line with no timestamp) attached to its sender turn", () => {
    const result = parseWhatsAppExport(SAMPLE_EXPORT);
    const workshopMessage = result!.messages.find((m) => m.includes("Robotics Club"));
    expect(workshopMessage).toBeDefined();
    expect(workshopMessage).toContain("https://forms.gle/robotics-workshop-demo");
  });

  it("preserves the sender name in each message's text (extraction still sees who said it)", () => {
    const result = parseWhatsAppExport(SAMPLE_EXPORT);
    expect(result!.messages[0]).toMatch(/^Asha Verma:/);
  });

  it("handles 24-hour timestamps with no AM/PM marker", () => {
    const text = "10/03/2024, 14:05 - Asha Verma: Class moved to Room 12.";
    const result = parseWhatsAppExport(text);
    expect(result).not.toBeNull();
    expect(result!.messages).toEqual(["Asha Verma: Class moved to Room 12."]);
  });

  it("handles a seconds-precision timestamp", () => {
    const text = "10/03/2024, 14:05:32 - Asha Verma: Class moved to Room 12.";
    const result = parseWhatsAppExport(text);
    expect(result).not.toBeNull();
    expect(result!.messages).toEqual(["Asha Verma: Class moved to Room 12."]);
  });

  it("strips a leading left-to-right mark some exports prepend", () => {
    const text = "‎3/10/24, 9:05 AM - Asha Verma: Hi there.";
    const result = parseWhatsAppExport(text);
    expect(result).not.toBeNull();
    expect(result!.messages).toEqual(["Asha Verma: Hi there."]);
  });

  it("returns null for text with no WhatsApp timestamp lines at all", () => {
    const result = parseWhatsAppExport("Just some pasted announcement text with no chat export formatting.");
    expect(result).toBeNull();
  });

  it("returns null for an empty file", () => {
    expect(parseWhatsAppExport("")).toBeNull();
  });

  it("returns an empty messages array (not null) when every line is a system notice", () => {
    const text = [
      "3/10/24, 9:00 AM - Asha Verma created group \"CSE Notices\"",
      "3/10/24, 9:01 AM - Messages and calls are end-to-end encrypted.",
    ].join("\n");
    const result = parseWhatsAppExport(text);
    expect(result).not.toBeNull();
    expect(result!.messages).toEqual([]);
    expect(result!.skippedSystemLines).toBe(2);
  });
});
