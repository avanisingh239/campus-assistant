import { describe, expect, it } from "vitest";
import { verifyLink, TRUSTED_LINK_DOMAINS, detectPaymentRiskPattern } from "./verify-link";

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

describe("detectPaymentRiskPattern", () => {
  it("flags the classic advance-fee scam structure: already-won claim + pay-to-claim ask", () => {
    expect(
      detectPaymentRiskPattern(
        "Congratulations, you've been selected for a scholarship! Pay a processing fee to claim it.",
      ),
    ).toBe(true);
  });

  it("does NOT flag a normal application/registration fee with no already-won framing — the critical false-positive case", () => {
    expect(
      detectPaymentRiskPattern("Registration fee of ₹500 to apply for the XYZ scholarship exam."),
    ).toBe(false);
  });

  it("does NOT flag a normal opportunity message with neither pattern present", () => {
    expect(
      detectPaymentRiskPattern("Robotics workshop this Friday, limited seats — register on the club form."),
    ).toBe(false);
  });

  it("does NOT flag an already-won claim alone, with no payment ask at all", () => {
    expect(
      detectPaymentRiskPattern("Congratulations! You've been selected as this month's top contributor."),
    ).toBe(false);
  });

  it("does NOT flag a payment ask alone, with no already-won claim", () => {
    expect(
      detectPaymentRiskPattern("Please pay the processing fee to submit your scholarship application."),
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(
      detectPaymentRiskPattern("CONGRATULATIONS! YOU'VE BEEN SELECTED — PAY A PROCESSING FEE TO CLAIM IT."),
    ).toBe(true);
  });

  it("fires regardless of domain or link presence — a pure content check, not gated on a URL", () => {
    expect(
      detectPaymentRiskPattern(
        "You've won a fully-funded scholarship! Submit your documents and a small processing fee here: https://forms.gle/legit-looking",
      ),
    ).toBe(true);
  });
});
