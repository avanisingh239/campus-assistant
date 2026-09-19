/**
 * Deterministic, code-only link verification — a real bug found in
 * testing showed the AI extraction layer can't be trusted to catch a
 * spoofed domain: a message containing `https://whatsap-group-join.xyz/
 * abc123` (misspelled "whatsapp," a `.xyz` domain, nothing like
 * WhatsApp's real invite domain) reached students with an effectively
 * "verified" link, because nothing in this codebase had ever actually
 * computed `announcements.link_verified` — it just defaults to `true` at
 * the DB level (see supabase/schema.sql), and `ExtractedAnnouncementSchema`
 * (lib/ai/extraction-schema.ts) never included it in the AI's contract in
 * the first place (docs/ai-contracts.md §3's own removed-fields list
 * confirms this).
 *
 * Same architectural principle as lib/deterministic/ (clash detection,
 * free-slot matching, docs/data-model.md §5's priority formula): an
 * objective, checkable fact — does this URL's domain match a known-
 * legitimate platform? — is deterministic code, not an AI judgment call,
 * especially with real user-safety stakes (a phishing link disguised as
 * a class group invite). No network access here either — this is a pure
 * string check, not a live reachability/reputation lookup.
 *
 * `detectPaymentRiskPattern` below is a second, later-added rule of the
 * exact same shape — deterministic keyword matching, not an AI call — for
 * a different real scam pattern: a message claiming an already-decided
 * positive outcome ("you've been selected") that then asks for payment to
 * release/claim/unlock it. See that function's own doc comment for the
 * full reasoning and CLAUDE.md's own section on it.
 */

/**
 * Exact hostnames (after lowercasing and stripping a leading "www.")
 * trusted for the platforms this product actually deals with — WhatsApp
 * and Telegram group links (docs/product-spec.md Area A.3/§3's "Group
 * Link Directory" names both explicitly) and Google Forms/Docs
 * (common for registration links, e.g. the `opportunity`/`event`
 * category's own test fixtures).
 *
 * Deliberately exact-match only, not a suffix/subdomain check —
 * `docs.google.com` and `google.com` are both listed explicitly rather
 * than relying on something like `hostname.endsWith("google.com")`,
 * which would also match a lookalike domain such as
 * `evil-google.com`. Anything not in this set is unverified by default:
 * the task that added this file was explicit that a false "unverified"
 * (a student double-checks a real link) is far cheaper than a false
 * "verified" (a student trusts a scam link), so this list only grows
 * when a genuinely common legitimate domain shows up, never grows to
 * "probably fine."
 */
export const TRUSTED_LINK_DOMAINS: ReadonlySet<string> = new Set([
  "chat.whatsapp.com", // WhatsApp group/community invite links
  "t.me", // Telegram invite links
  "forms.gle", // Google Forms short links
  "docs.google.com", // Google Forms/Docs long-form links
  "google.com", // Google's own domain
]);

function normalizedHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * True if the raw source text explicitly claims this is a WhatsApp group
 * link — a deliberately simple, literal keyword check (both "whatsapp"
 * and "group" present, case-insensitive), not an AI judgment. This is
 * the specific real bug case: a message that *says* "WhatsApp group" but
 * links somewhere else entirely is a stronger, more specific red flag
 * than a bare domain mismatch on its own, and overrides even an
 * otherwise-allowlisted domain (see `verifyLink` below) — a message
 * can't legitimately claim to be a WhatsApp group link while pointing at
 * Google Forms either.
 */
function claimsWhatsAppGroup(context: string): boolean {
  const lower = context.toLowerCase();
  return lower.includes("whatsapp") && lower.includes("group");
}

/**
 * Whether `url` should be trusted, given the text it was extracted
 * alongside. Pass the original raw message text (or as much of it as is
 * available) as `context` — an empty string is a valid, safe input.
 * Deterministic and pure: same inputs always produce the same output, no
 * network access, no AI call, cheap to unit test (see
 * verify-link.test.ts).
 */
export function verifyLink(url: string, context: string): boolean {
  const hostname = normalizedHostname(url);
  if (hostname === null) return false;

  if (claimsWhatsAppGroup(context) && hostname !== "chat.whatsapp.com") {
    return false;
  }

  return TRUSTED_LINK_DOMAINS.has(hostname);
}

/**
 * Advance-fee scam detection — a real, well-documented fraud pattern
 * ("you've already won, now pay to claim it") distinct from a normal
 * application/registration fee, which is completely legitimate ("pay to
 * apply/compete, outcome not yet known"). Same architecture as
 * `claimsWhatsAppGroup`/`verifyLink` above: a deterministic keyword check,
 * not an AI judgment call, per the task that added this — a blunt "does
 * this message mention money" rule would wrongly flag genuine scholarships
 * with real entrance/application fees, so the actual signal is the
 * CO-OCCURRENCE of two specific phrase groups, not payment language alone.
 *
 * Deliberately two separate, ORed-within/ANDed-between groups rather than
 * one combined list — a message needs at least one phrase from EACH group
 * to flag, not just a high phrase count from either one alone. Both lists
 * are short and literal on purpose (same "false unverified is cheaper than
 * false verified" philosophy `TRUSTED_LINK_DOMAINS`'s own doc comment
 * states) — grow them for a genuinely common real-world phrasing, never for
 * "probably scammy."
 */
const ALREADY_WON_PHRASES = [
  "congratulations",
  "you've been selected",
  "you have been selected",
  "you've won",
  "you have won",
  "you've been chosen",
  "you have been chosen",
  "you've been awarded",
  "you have been awarded",
  "you are the winner",
  "you're the winner",
];

const PAY_TO_CLAIM_PHRASES = [
  "processing fee",
  "claim it",
  "claim your",
  "claim this",
  "to release",
  "release your",
  "unlock your",
  "unlock this",
  "clearance fee",
  "claiming fee",
  "activation fee",
  "to claim",
];

/**
 * True only when the raw source text contains BOTH an "already decided
 * positive outcome" phrase (`ALREADY_WON_PHRASES`) AND a "pay to
 * release/claim/unlock that outcome" phrase (`PAY_TO_CLAIM_PHRASES`) —
 * the actual advance-fee-scam structure, not payment language in
 * isolation. A normal registration/application fee message ("registration
 * fee of ₹500 to apply for the XYZ scholarship exam") has no already-won
 * framing at all, so it correctly never trips this. Deliberately domain-
 * and channel-independent — unlike `verifyLink`, this never looks at the
 * URL or at which pipeline (student paste vs. admin form) the message came
 * through, per the task's own explicit point that neither should be
 * treated as a risk/safety signal on its own; the content pattern alone is
 * the whole signal.
 */
export function detectPaymentRiskPattern(context: string): boolean {
  const lower = context.toLowerCase();
  const hasAlreadyWonClaim = ALREADY_WON_PHRASES.some((phrase) => lower.includes(phrase));
  const hasPayToClaim = PAY_TO_CLAIM_PHRASES.some((phrase) => lower.includes(phrase));
  return hasAlreadyWonClaim && hasPayToClaim;
}

/**
 * Domain-based risk signals for the same advance-fee scam pattern — a
 * SECOND, independent axis alongside `detectPaymentRiskPattern`'s phrase
 * check, added in a later pass once the scenario this whole feature
 * targets ("...here: [suspicious-looking link]") turned out to have no
 * domain check in it at all. Deliberately NOT an allowlist (that's
 * `TRUSTED_LINK_DOMAINS`/`verifyLink` above, for a different job) — an
 * allowlist approach was explicitly rejected for scam detection in the
 * prior pass, because it doesn't scale to the many real, unlisted domains
 * a legitimate private scholarship/foundation/trust might genuinely use.
 * Instead this looks for known, objective phishing-adjacent RED FLAGS —
 * checkable facts about the URL itself, never a judgment call about
 * whether a domain is "legitimate."
 *
 * Per the task that added this: domain signals only ever COMPOUND an
 * already-triggered `payment_risk` warning's severity — they never trigger
 * a warning on their own (see `combinePaymentRiskSeverity` below for where
 * that gating actually happens; this function only ever reports what it
 * sees in the URL, with no opinion on whether that should produce a
 * warning).
 */
export interface DomainRiskAssessment {
  risky: boolean;
  /** Short, human-readable reasons — safe to join into a warning message verbatim. */
  reasons: string[];
}

/**
 * TLDs commonly abused in phishing/scam campaigns because they're cheap
 * and require no real identity verification to register — not an
 * exhaustive list (there's no such thing), just the well-documented,
 * commonly-cited ones, matching the task's own "such as .xyz, .top, .club,
 * .info, or similar" framing. A suspicious TLD alone is NOT enough to
 * flag — plenty of real small organizations use one — so this only
 * contributes a signal when paired with `CLAIM_WORDS_IN_DOMAIN` below.
 */
const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set(["xyz", "top", "club", "info", "online", "click", "site", "icu"]);

/** Words in the domain/subdomain string itself — not the message body — that, combined with a suspicious TLD, suggest a purpose-built scam domain. */
const CLAIM_WORDS_IN_DOMAIN = ["claim", "prize", "winner", "reward"];

/**
 * Well-known URL shorteners — exact hostname match, same reasoning as
 * `TRUSTED_LINK_DOMAINS`'s exact-match approach. A shortener hides the
 * real destination entirely, and per the task's own framing, a legitimate
 * institution essentially never uses one for something as significant as
 * a scholarship/payment claim link — so this is risk-elevating on its own
 * merits, independent of the TLD/claim-word check above.
 */
const URL_SHORTENER_DOMAINS: ReadonlySet<string> = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
]);

/**
 * Nouns that typically end a real institution's name — used to spot a
 * claimed institution/organization inside the message text so its name
 * can be checked against the link's own domain. Deliberately a short,
 * literal list (same philosophy as every other hand-picked list in this
 * file) — a message this doesn't recognize the shape of simply produces
 * no institution match, which is the safe, conservative direction to fail
 * in (see `extractClaimedInstitution`'s own doc comment).
 */
const INSTITUTION_NOUNS = ["university", "college", "institute", "foundation", "trust", "board", "academy", "society", "fund"];

const INSTITUTION_STOPWORDS = new Set([...INSTITUTION_NOUNS, "the", "of", "for", "and", "your"]);

/**
 * Finds a claimed institution/organization name in the message text — a
 * short run of Title-Case words immediately followed by one of
 * `INSTITUTION_NOUNS` (e.g. "the XYZ Foundation", "ABC University"). A
 * deliberately narrow, literal heuristic, not an AI judgment call: this is
 * meant to catch the common, plain-language case a scam message actually
 * uses to sound official ("...selected by the National Merit Foundation
 * for a scholarship..."), not to reliably extract every possible
 * institution name from arbitrary prose. Returns `null` (no claim found)
 * far more often than a false extraction — the same "conservative, fail
 * toward not flagging" principle every other rule in this file follows —
 * since `assessDomainRisk` below only checks a mismatch when this actually
 * finds something to check against.
 */
function extractClaimedInstitution(context: string): string | null {
  // Deliberately no case-insensitive ("i") flag on the whole pattern — that
  // would let the [A-Z] word-start requirement match lowercase words too,
  // defeating the "Title-Case run" heuristic entirely (e.g. matching
  // "been selected by the National" instead of "National Merit"). Instead,
  // both the lowercase and Capitalized spelling of each noun are listed
  // explicitly, since a real institution name capitalizes its own noun
  // ("...National Merit Foundation...").
  const nounPattern = INSTITUTION_NOUNS.map((n) => `${n}|${n[0].toUpperCase()}${n.slice(1)}`).join("|");
  const pattern = new RegExp(`((?:[A-Z][\\w&.'-]*\\s+){1,5})(${nounPattern})\\b`);
  const match = context.match(pattern);
  if (!match) return null;
  return `${match[1].trim()} ${match[2]}`.trim();
}

/**
 * True if the claimed institution's own distinctive words (stripped of
 * generic nouns like "university"/"foundation" and short/common words)
 * plausibly relate to the link's hostname — a simple substring check, not
 * a fuzzy/edit-distance match, matching this file's existing "literal,
 * not clever" philosophy. An institution name with nothing distinctive
 * left after stripping (e.g. just "The Fund") returns `true` — nothing
 * meaningful to check, so this conservatively does NOT report a mismatch
 * rather than guessing one.
 */
function institutionMatchesDomain(institutionName: string, hostname: string): boolean {
  const words = institutionName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !INSTITUTION_STOPWORDS.has(w));
  if (words.length === 0) return true;
  return words.some((w) => hostname.includes(w));
}

/**
 * Assesses `url` for known phishing-adjacent domain red flags. `context`
 * (the surrounding message text, same as `verifyLink`/
 * `detectPaymentRiskPattern` take) is optional and only used for the
 * claimed-institution-mismatch check below — every other signal looks at
 * the URL alone. Pure and deterministic: no network access, no live
 * reachability/reputation lookup, cheap to unit test.
 */
export function assessDomainRisk(url: string, context: string = ""): DomainRiskAssessment {
  const reasons: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { risky: false, reasons };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  // Signal 1: suspicious TLD + claim-related wording in the domain itself
  // — deliberately requires BOTH, per the task's own "especially when
  // combined with" framing; a suspicious TLD alone is too weak a signal
  // by itself (plenty of real small organizations use one).
  const tld = hostname.split(".").pop() ?? "";
  const hasClaimWording = CLAIM_WORDS_IN_DOMAIN.some((word) => hostname.includes(word));
  if (SUSPICIOUS_TLDS.has(tld) && hasClaimWording) {
    reasons.push(`uses a ".${tld}" domain combined with claim-related wording ("${hostname}")`);
  }

  // Signal 2: URL shorteners.
  if (URL_SHORTENER_DOMAINS.has(hostname)) {
    reasons.push("uses a link shortener that hides the real destination");
  }

  // Signal 3: no HTTPS.
  if (parsed.protocol !== "https:") {
    reasons.push("does not use a secure (https) connection");
  }

  // Signal 4: claimed-institution mismatch — same "claims X, doesn't
  // match X" shape as `claimsWhatsAppGroup`/`verifyLink` above, applied to
  // an institution name instead of a specific known platform.
  const institution = extractClaimedInstitution(context);
  if (institution && !institutionMatchesDomain(institution, hostname)) {
    reasons.push(`claims to be from "${institution}" but the domain doesn't match`);
  }

  return { risky: reasons.length > 0, reasons };
}

export type PaymentRiskSeverity = "none" | "language_only" | "language_and_domain";

export interface PaymentRiskWarning {
  severity: PaymentRiskSeverity;
  /** The exact text to show, or null when there's nothing to warn about. */
  message: string | null;
}

/**
 * Combines the (already-computed, stored) `detectPaymentRiskPattern`
 * result with a fresh `assessDomainRisk` result into one severity/message
 * pair — the actual compounding logic the task asked for. Takes
 * `paymentRisk` as a plain boolean rather than recomputing it, since
 * `detectPaymentRiskPattern` itself is untouched and its result is already
 * computed once, at ingestion time, and stored on the row
 * (`announcements.payment_risk`) — this function's whole job is deciding
 * how domain signals compound THAT result, not re-deriving it.
 *
 * Per the task's own explicit three-way rule:
 *   - phrase pattern did NOT fire → "none", no warning at all, regardless
 *     of what the domain looks like (never reintroduce false positives on
 *     a legitimate message that merely uses an unfamiliar real domain).
 *   - phrase pattern fired, domain looks unremarkable → "language_only",
 *     the plain warning.
 *   - phrase pattern fired AND domain risk signals are present →
 *     "language_and_domain", the strongest warning, with the specific
 *     domain red flag(s) named in the message text itself, not just a
 *     generic "risky" badge.
 */
export function combinePaymentRiskSeverity(
  paymentRisk: boolean,
  domainRisk: DomainRiskAssessment,
): PaymentRiskWarning {
  if (!paymentRisk) {
    return { severity: "none", message: null };
  }

  const BASE_WARNING = "Claims you've already won, then asks for payment — a classic scam pattern.";

  if (domainRisk.risky) {
    return {
      severity: "language_and_domain",
      message: `${BASE_WARNING} The link itself is suspicious too: ${domainRisk.reasons.join("; ")}.`,
    };
  }

  return { severity: "language_only", message: BASE_WARNING };
}
