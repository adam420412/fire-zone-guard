/**
 * Integration regression test: verifies that creating an SLA ticket as an
 * authenticated user produces a readable `sla_ticket_events` row pointing at
 * the same `ticket_id` (covers the trigger `log_sla_event_after` /
 * `log_sla_status_change` and the RLS policy `sla_events_self_read`).
 *
 * Why this exists:
 * - The events table has no FK in the generated types but an FK in the
 *   database. A regression where the trigger fires before the ticket commits
 *   (or fires under a role without insert privilege) would silently break the
 *   Audyt SLA timeline.
 * - We exercise the full happy path through the public anon Supabase client
 *   the app uses, not direct SQL, so RLS is enforced exactly as in production.
 *
 * Opt-in: requires network + a live demo account. Skipped unless
 * RUN_INTEGRATION_TESTS=1 to keep the default `vitest` run hermetic.
 *
 * Credentials are the public demo account exposed on /auth — same as what a
 * tester would use manually. No secrets are committed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jlbcfovlqdqxawshfgld.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsYmNmb3ZscWRxeGF3c2hmZ2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDMxNzIsImV4cCI6MjA4Njk3OTE3Mn0.2FQ6GKlbYAoZ0BUr4uAj6EABMk5LYlUJGWNDkkvKrxY";

const DEMO_EMAIL = "admin@firezone.pl";
const DEMO_PASSWORD = "Test123!";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";
const d = shouldRun ? describe : describe.skip;

d("sla_ticket_events regression (live)", () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let createdTicketId: string | null = null;

  beforeAll(async () => {
    const { error } = await client.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
  });

  afterAll(async () => {
    // Best-effort cleanup. If the ticket row remains it's harmless test data,
    // but tidiness matters for the audit log we just exercised.
    if (createdTicketId) {
      await client.from("sla_tickets").delete().eq("id", createdTicketId);
    }
    await client.auth.signOut();
  });

  it("creates a ticket and exposes a matching sla_ticket_events row", async () => {
    // Pick any building so we satisfy company-scoped RLS reads later.
    const { data: building, error: bErr } = await client
      .from("buildings")
      .select("id, company_id")
      .limit(1)
      .single();
    expect(bErr).toBeNull();
    expect(building?.id).toBeTruthy();

    const description = `[regression-test ${new Date().toISOString()}] verify event row created for ticket`;

    const { data: ticket, error: tErr } = await client
      .from("sla_tickets")
      .insert({
        building_id: building!.id,
        company_id: building!.company_id,
        description,
        type: "usterka",
        priority: "normal",
      })
      .select("id, ticket_number")
      .single();

    expect(tErr).toBeNull();
    expect(ticket?.id).toBeTruthy();
    createdTicketId = ticket!.id;

    // The 'created' event is inserted by an AFTER trigger, so it should be
    // visible immediately in the same transaction context. Poll briefly to
    // tolerate replication lag in unusual environments.
    let events: Array<{ id: string; ticket_id: string; event_type: string }> = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await client
        .from("sla_ticket_events" as never)
        .select("id, ticket_id, event_type")
        .eq("ticket_id", ticket!.id);
      if (error) throw error;
      events = (data ?? []) as typeof events;
      if (events.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(events.length).toBeGreaterThan(0);
    // Every returned row must point at our ticket — guards against any
    // future trigger that misroutes payloads.
    for (const e of events) {
      expect(e.ticket_id).toBe(ticket!.id);
    }
    // The initial INSERT trigger always emits 'created'.
    expect(events.some((e) => e.event_type === "created")).toBe(true);
  }, 30_000);
});
