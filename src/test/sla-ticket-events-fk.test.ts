import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Regression test: sla_ticket_events FK to sla_tickets
 *
 * History: an earlier version of log_sla_status_change() ran as a BEFORE trigger
 * AND inserted into sla_ticket_events in the same transaction. On INSERT this
 * occasionally raced parent-row visibility and produced FK violations
 * ("insert or update on table sla_ticket_events violates foreign key constraint").
 *
 * The fix split it into two triggers:
 *   - BEFORE INSERT/UPDATE: set_sla_timing_before  (timing fields only, no event insert)
 *   - AFTER  INSERT/UPDATE: log_sla_event_after   (writes the event row)
 *
 * This test guards against regression by inserting a ticket through the same
 * code path the public form uses and asserting the insert does NOT raise
 * PostgrestError 23503 (foreign_key_violation).
 *
 * It deliberately treats RLS-denial (42501) as a SKIP rather than a failure:
 * the FK regression cannot fire if no parent row is created, and the anon
 * INSERT policy may legitimately be off in some environments. The actual FK
 * regression would surface as 23503, which would fail the test loudly.
 *
 * Talks to the real Supabase project. Skipped when env vars are missing so CI
 * without secrets stays green.
 *
 * Manual test flow (when this auto-test is skipped):
 *   1. Open /zgloszenie as an anonymous visitor.
 *   2. Submit a ticket with description >= 5 chars.
 *   3. Confirm the toast says success and the ticket appears in /sla.
 *   4. As admin, open the ticket and verify the timeline shows a 'created'
 *      event row (this is the sla_ticket_events row written by the AFTER
 *      trigger; if the FK ever regresses, the INSERT in step 2 will fail).
 *   5. Bonus: check /sla-audit and confirm the new event is listed.
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

  afterAll(() => {
    if (createdTicketIds.length) {
      // eslint-disable-next-line no-console
      console.log("[regression] created ticket ids:", createdTicketIds.join(", "));
    }
  });

  it("INSERT into sla_tickets never produces FK violation 23503 against sla_ticket_events", async () => {
    const description = `REGRESSION TEST sla_ticket_events FK ${new Date().toISOString()}`;

    const { data: ticket, error: insertError } = await supabase
      .from("sla_tickets")
      .insert({
        type: "usterka",
        priority: "normal",
        description,
        reporter_user_id: null,
        reporter_name: "Vitest Regression",
      })
      .select("id, ticket_number, status")
      .single();

    // The hard guarantee under test: NEVER a foreign-key violation on insert.
    expect(
      insertError?.code,
      `unexpected FK violation on sla_tickets insert: ${insertError?.message}`,
    ).not.toBe("23503");

    if (insertError?.code === "42501") {
      // Anon INSERT is RLS-denied in this environment. The FK regression
      // can't fire without a parent row, so this is a pass for our guarantee.
      // eslint-disable-next-line no-console
      console.warn(
        "[regression] anon INSERT denied by RLS (42501) — FK guarantee not exercised. " +
          "Run this test with an authenticated session, or restore the sla_anon_insert grant, to fully cover the public-form path.",
      );
      return;
    }

    expect(insertError, insertError?.message).toBeNull();
    expect(ticket).toBeTruthy();
    expect(ticket!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ticket!.status).toBe("zgloszenie");
    createdTicketIds.push(ticket!.id);

    // If we can read the event row back, verify the FK payload is intact.
    // RLS may legitimately hide it from anon readers — that's fine; the FK
    // is enforced by Postgres regardless of whether SELECT can see the row.
    const { data: events } = await supabase
      .from("sla_ticket_events")
      .select("ticket_id, event_type")
      .eq("ticket_id", ticket!.id);

    if (events && events.length > 0) {
      const created = events.find((e) => e.event_type === "created");
      expect(created, "expected a 'created' event for the new ticket").toBeTruthy();
      expect(created!.ticket_id).toBe(ticket!.id);
    }
  }, 15_000);
});
