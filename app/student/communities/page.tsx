import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shapeAnnouncements } from "@/lib/dashboard/shape-announcements";
import { dedupeByLinkUrl } from "@/lib/dashboard/community-links";
import { CanvasBackground } from "@/components/canvas-background";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import { TwoCirclesIcon } from "@/components/icons";
import { CommunityCard } from "./community-card";
import shellStyles from "../shell.module.css";
import styles from "./communities.module.css";

// Same reasoning as the other real student screens: per-student, RLS-scoped
// fetch, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Server Component for the Communities directory (docs/product-spec.md
 * Area A.3 — Society/Group Link Directory): a browsable, non-time-sensitive
 * list of society/class group links extracted from announcements. Reads
 * through the RLS-respecting client like every other real student screen,
 * but is otherwise the simplest of the three so far — no engagement writes
 * happen on this page at all, so there's no Client Component wrapper here;
 * `CommunityCard` (its own "use client" file, for the trace-to-source
 * toggle only) is the one interactive leaf in an otherwise server-rendered
 * tree, same as `CanvasBackground`/`AppHeader`/`TabRow` being plain
 * Server-Component-safe pieces with no hooks of their own.
 *
 * Query: `category = 'society_link'` with a non-null `link_url` — an
 * entry with no link at all isn't directory-worthy for a page whose whole
 * purpose is "browsable list of links" — ordered by `title` so
 * dedupeByLinkUrl()'s "first occurrence wins" is a stable, alphabetical
 * choice rather than an arbitrary one.
 */
export default async function StudentCommunitiesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated student reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  const { data: announcementRows, error: announcementsError } = await supabase
    .from("announcements")
    .select(
      "id, category, title, why_it_matters, what_to_do_next, confidence, confidence_note, event_date, start_time, end_time, deadline_at, link_url, link_verified, seat_count, seats_unclear, priority_score, created_at, updated_at",
    )
    .eq("category", "society_link")
    .not("link_url", "is", null)
    .order("title", { ascending: true });

  if (announcementsError) {
    throw new Error(`Failed to load announcements: ${announcementsError.message}`);
  }

  const announcementIds = (announcementRows ?? []).map((a) => a.id);

  const { data: sourceLinkRows, error: sourceLinkError } =
    announcementIds.length > 0
      ? await supabase.from("announcement_sources").select("announcement_id, message_id").in("announcement_id", announcementIds)
      : { data: [], error: null };

  if (sourceLinkError) {
    throw new Error(`Failed to load announcement sources: ${sourceLinkError.message}`);
  }

  const messageIds = [...new Set((sourceLinkRows ?? []).map((s) => s.message_id))];
  const { data: messageRows, error: messagesError } =
    messageIds.length > 0
      ? await supabase.from("messages").select("id, raw_text, source_group_name, created_at").in("id", messageIds)
      : { data: [], error: null };

  if (messagesError) {
    throw new Error(`Failed to load source messages: ${messagesError.message}`);
  }

  const shaped = shapeAnnouncements(announcementRows ?? [], [], [], sourceLinkRows ?? [], messageRows ?? []);
  const links = dedupeByLinkUrl(shaped);
  const now = new Date();

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={now} heroCount={links.length} heroLabel="societies & groups you can join" />

        <TabRow active="communities" />

        <p className={shellStyles.sectionLabel}>
          <TwoCirclesIcon />
          Communities
        </p>

        <p className={styles.pageNote}>
          This directory updates live from messages shared by students across the platform — not just
          your class — so you&apos;ll see society and event links as they&apos;re announced anywhere.
        </p>

        {links.length === 0 ? (
          <div className={shellStyles.emptyState}>
            <h2>No community links yet</h2>
            <p>They&apos;ll show up here as they&apos;re shared in your groups.</p>
          </div>
        ) : (
          <div className={shellStyles.cards}>
            {links.map((link) => (
              <CommunityCard key={link.id} link={link} now={now} />
            ))}
          </div>
        )}
      </div>
    </CanvasBackground>
  );
}
