import { describe, expect, it } from "vitest";
import {
  verifyLink,
  TRUSTED_LINK_DOMAINS,
  detectPaymentRiskPattern,
  assessDomainRisk,
  combinePaymentRiskSeverity,
} from "./verify-link";

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

describe("assessDomainRisk", () => {
  it("flags a .xyz domain combined with 'claim' wording in the domain itself as high-risk", () => {
    const result = assessDomainRisk("https://scholarship-claim-portal.xyz/verify");
    expect(result.risky).toBe(true);
    expect(result.reasons.some((r) => r.includes(".xyz") && r.includes("claim"))).toBe(true);
  });

  it("flags a shortened URL", () => {
    const result = assessDomainRisk("https://bit.ly/abc123");
    expect(result.risky).toBe(true);
    expect(result.reasons.some((r) => r.toLowerCase().includes("shortener"))).toBe(true);
  });

  it("flags a plain http:// link as not using a secure connection", () => {
    const result = assessDomainRisk("http://some-legit-looking-site.com/apply");
    expect(result.risky).toBe(true);
    expect(result.reasons.some((r) => r.toLowerCase().includes("https"))).toBe(true);
  });

  it("scores a well-formed https domain with no shortener and no suspicious TLD as low-risk", () => {
    const result = assessDomainRisk("https://forms.gle/legit-scholarship-form");
    expect(result.risky).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("does not flag a suspicious TLD alone, with no claim-related wording in the domain", () => {
    // A real small organization can legitimately use a .xyz domain —
    // the task's own explicit "especially when combined with" framing
    // means the TLD alone must not be enough.
    const result = assessDomainRisk("https://my-robotics-club.xyz/events");
    expect(result.risky).toBe(false);
  });

  it("flags a claimed institution that doesn't match the link's domain", () => {
    const result = assessDomainRisk(
      "https://random-payout-site.info/verify",
      "You've been selected by the National Merit Foundation for a fully-funded scholarship.",
    );
    expect(result.risky).toBe(true);
    expect(result.reasons.some((r) => r.includes("National Merit Foundation"))).toBe(true);
  });

  it("does not flag an institution mismatch when the domain plausibly relates to the claimed institution", () => {
    const result = assessDomainRisk(
      "https://nationalmerit.org/scholarship",
      "You've been selected by the National Merit Foundation for a fully-funded scholarship.",
    );
    expect(result.risky).toBe(false);
  });

  it("returns risky: false, not a throw, for a malformed URL", () => {
    expect(assessDomainRisk("not a url at all")).toEqual({ risky: false, reasons: [] });
  });
});

describe("combinePaymentRiskSeverity", () => {
  it("returns 'none' with no message when the phrase pattern did not fire, regardless of domain risk", () => {
    // The critical false-positive guard: a legitimate message that merely
    // uses an unfamiliar-but-real domain must never warn on domain signals
    // alone.
    const riskyDomain = assessDomainRisk("http://bit.ly/whatever");
    expect(riskyDomain.risky).toBe(true);
    const result = combinePaymentRiskSeverity(false, riskyDomain);
    expect(result).toEqual({ severity: "none", message: null });
  });

  it("returns 'language_only' when the phrase pattern fired but the domain looks unremarkable", () => {
    const calmDomain = assessDomainRisk("https://forms.gle/legit-scholarship-form");
    const result = combinePaymentRiskSeverity(true, calmDomain);
    expect(result.severity).toBe("language_only");
    expect(result.message).toContain("classic scam pattern");
    expect(result.message).not.toContain("shortener");
  });

  it("returns 'language_and_domain' with a stronger, more specific message when both fire together", () => {
    const riskyDomain = assessDomainRisk("https://bit.ly/claim-now");
    const languageOnly = combinePaymentRiskSeverity(true, { risky: false, reasons: [] });
    const combined = combinePaymentRiskSeverity(true, riskyDomain);

    expect(combined.severity).toBe("language_and_domain");
    expect(combined.message).toContain("classic scam pattern");
    expect(combined.message).toContain("shortener");
    // The combined message is strictly a superset — everything the
    // language-only warning says, plus the domain-specific detail.
    expect(combined.message!.length).toBeGreaterThan(languageOnly.message!.length);
  });
});
