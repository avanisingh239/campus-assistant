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
