import { describe, expect, it } from "vitest";
import { verifyLink, TRUSTED_LINK_DOMAINS } from "./verify-link";

describe("verifyLink", () => {
  it("verifies a real chat.whatsapp.com invite link", () => {
    expect(verifyLink("https://chat.whatsapp.com/AbCdEf12345", "Join our WhatsApp group here")).toBe(true);
  });

  it("does NOT verify the actual fake domain from the bug report", () => {
    expect(verifyLink("https://whatsap-group-join.xyz/abc123", "Join our WhatsApp group here")).toBe(false);
  });

  it("verifies a legitimate, allowlisted domain with no claimed-platform context", () => {
    // "No claimed platform" — neutral text, no "whatsapp"/"group" mention at all.
    expect(verifyLink("https://forms.gle/xyz789", "Register for the workshop by Friday.")).toBe(true);
  });

  it("does NOT verify a non-allowlisted domain with no claimed-platform context either", () => {
    // Reasonable default: unknown domain + no strong signal either way -> unverified.
    expect(verifyLink("https://some-random-site.example", "Register for the workshop by Friday.")).toBe(false);
  });

  it("does NOT verify a message claiming 'WhatsApp group' with a non-WhatsApp domain, even an otherwise-legitimate one", () => {
    expect(verifyLink("https://forms.gle/xyz789", "Join our WhatsApp group by clicking this link")).toBe(false);
  });

  it("still verifies a real chat.whatsapp.com link even when the message explicitly claims WhatsApp group", () => {
    expect(verifyLink("https://chat.whatsapp.com/xyz789", "Join our WhatsApp group by clicking this link")).toBe(
      true,
    );
  });

  it("normalizes a leading www. before matching", () => {
    expect(verifyLink("https://www.google.com/forms/d/e/abc", "")).toBe(true);
  });

  it("is case-insensitive on the hostname", () => {
    expect(verifyLink("https://CHAT.WHATSAPP.COM/AbC", "")).toBe(true);
  });

  it("returns false, not a throw, for a malformed URL string", () => {
    expect(verifyLink("not a url at all", "")).toBe(false);
  });

  it("has no domain in the allowlist that isn't an exact hostname (guards against accidental suffix matching)", () => {
    // A lookalike domain that merely contains an allowlisted string should never verify.
    expect(verifyLink("https://evil-google.com/phish", "")).toBe(false);
    expect(TRUSTED_LINK_DOMAINS.has("evil-google.com")).toBe(false);
  });
});
