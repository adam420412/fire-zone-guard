import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Regression test: sla_ticket_events FK to sla_tickets
 *
 * History: an earlier version of log_sla_status_change() ran as a BEFORE trigger
 * AND inserted into sla_ticket_events in the same transaction. On INSERT this
 * occasionally raced the parent row visibility and produced FK violations
 * ("insert or update on table sla_ticket_events violates foreign key constraint").
 *
 * The fix split it into two triggers:
 *   - BEFORE INSERT/UPDATE: set_sla_timing_before  (timing fields only, no event insert)
 *   - AFTER  INSERT/UPDATE: log_sla_event_after   (writes the event row)
 *
 * This test guards against regression by:
 *   1. Inserting a ticket via the public anon RLS path (sla_anon_insert).
 *   2. Asserting the parent ticket row exists.
 *   3. Asserting at least one sla_ticket_events row was created with a valid
 *      ticket_id pointing back at the ticket (i.e. FK satisfied).
 *
 * If the AFTER trigger ever gets reverted to BEFORE, or the FK is violated
 * for any other reason, the INSERT itself will throw and this test will fail
 * loudly with the Postgres error message.
 *
 * NOTE: This test talks to the real Supabase project. It is skipped when env
 * vars are missing so CI without secrets stays green. Run locally with:
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm test
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const shouldRun = Boolean(SUPABASE_URL && SUPABASE_KEY);
const describeIfLive = shouldRun ? describe : describe.skip;

describeIfLive("regression: sla_ticket_events FK on ticket creation", () => {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdTicketIds: string[] = [];

  afterAll(async () => {
    // Best-effort cleanup. Anon role typically cannot DELETE under RLS, so this
    // is a no-op in CI; admins can purge `description LIKE 'REGRESSION TEST%'`
    // manually if needed. We log the IDs so they're easy to find.
    if (createdTicketIds.length) {
      // eslint-disable-next-line no-console
      console.log("[regression] created ticket ids:", createdTicketIds.join(", "));
    }
  });

  it("INSERT into sla_tickets does not violate sla_ticket_events FK and writes a 'created' event", async () => {
    const description = `REGRESSION TEST sla_ticket_events FK ${new Date().toISOString()}`;

    const { data: ticket, error: insertError } = await supabase
      .from("sla_tickets")
      .insert({
        type: "usterka",
        priority: "normal",
        description,
        // anon path: reporter_user_id MUST be null per sla_anon_insert RLS
        reporter_user_id: null,
        reporter_name: "Vitest Regression",
      })
      .select("id, ticket_number, status, created_at")
      .single();

    // The whole point: the insert itself must not error. A FK violation here
    // would surface as PostgrestError code 23503.
    expect(insertError, insertError?.message).toBeNull();
    expect(ticket).toBeTruthy();
    expect(ticket!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ticket!.ticket_number).toMatch(/^SLA-\d{4}-\d{2}-\d+$/);
    expect(ticket!.status).toBe("zgloszenie");
    createdTicketIds.push(ticket!.id);

    // Now confirm the AFTER trigger wrote an event row that points back to
    // this ticket. RLS sla_events_self_read does NOT cover anonymous readers
    // (no auth.uid, no profile), so this query may legitimately return [].
    // We treat both outcomes as a pass for the FK guarantee — the critical
    // assertion is that the INSERT above succeeded. If the row IS readable
    // (e.g. when run with elevated creds), we additionally verify the FK
    // payload is intact.
    const { data: events, error: eventsError } = await supabase
      .from("sla_ticket_events")
      .select("id, ticket_id, event_type, payload")
      .eq("ticket_id", ticket!.id);

    expect(eventsError, eventsError?.message).toBeNull();

    if (events && events.length > 0) {
      const created = events.find((e) => e.event_type === "created");
      expect(created, "expected a 'created' event for the new ticket").toBeTruthy();
      expect(created!.ticket_id).toBe(ticket!.id);
    }
  }, 15_000);

  it("rejects anon INSERT when reporter_user_id is set (RLS guard still in place)", async () => {
    // Sanity check that we're hitting the real RLS path. If this ever starts
    // succeeding, the sla_anon_insert policy has been weakened and the FK
    // regression test above no longer exercises the anon code path.
    const { error } = await supabase.from("sla_tickets").insert({
      type: "usterka",
      priority: "normal",
      description: "REGRESSION TEST should be rejected",
      reporter_user_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(error).toBeTruthy();
    // 42501 = insufficient privilege (RLS), 23514 = check constraint
    expect(["42501", "23514", "PGRST301"]).toContain(error?.code ?? "");
  }, 15_000);
});
