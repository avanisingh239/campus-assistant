/**
 * Resolves each retrieved announcement's EARLIEST source's
 * `source_group_name`, for display alongside Ask Rescript's citations —
 * the same "which group did this come from" question the dashboard
 * card's trace-to-source section already answers, and the same
 * earliest-source convention `lib/deduplication/sync.ts`'s
 * `resolveEarliestSubmittingClasses` already uses for a different job
 * (the privacy-guard's class match) — a different file here since this
 * one returns a display label, not a security-relevant matching key, but
 * the same "pick the first-ever source" reasoning: an announcement's
 * fields were set by whichever source created it, so its earliest source
 * is the most meaningful single group to show when only one can fit in a
 * compact citation.
 *
 * Pure, no network/DB access — lib/ask/actions.ts does the actual
 * `announcement_sources`/`messages` fetching and passes the raw rows in.
 */

export interface SourceLinkRow {
  announcement_id: string;
  message_id: string;
  created_at: string;
}

export interface MessageGroupNameRow {
  id: string;
  source_group_name: string | null;
}

export function resolveEarliestSourceGroupNames(
  sourceLinks: SourceLinkRow[],
  messages: MessageGroupNameRow[],
): Map<string, string | null> {
  const groupNameByMessageId = new Map(messages.map((m) => [m.id, m.source_group_name]));
  const earliestCreatedAt = new Map<string, string>();
  const result = new Map<string, string | null>();

  for (const link of sourceLinks) {
    const current = earliestCreatedAt.get(link.announcement_id);
    if (!current || link.created_at < current) {
      earliestCreatedAt.set(link.announcement_id, link.created_at);
      result.set(link.announcement_id, groupNameByMessageId.get(link.message_id) ?? null);
    }
  }

  return result;
}
