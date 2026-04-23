// =============================================================================
// dispatch-notifications
// Reads pending rows from public.notifications_outbox and dispatches them.
// Currently supports channel = 'telegram'. Email + in_app are no-op stubs.
//
// Recipient resolution for Telegram:
//   - if row.user_id IS NOT NULL → fetch profiles.telegram_chat_id for that user
//   - else if payload.recipient_role = 'admin' → fan-out to all admin profiles
//     that have telegram_chat_id set
//
// Triggered manually (POST) or via Supabase cron.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OutboxRow {
  id: string;
  user_id: string | null;
  channel: "telegram" | "email" | "in_app";
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  scheduled_for: string;
  status: "pending" | "sent" | "failed" | "skipped";
  related_table: string | null;
  related_id: string | null;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    return { ok: false, error: "Missing LOVABLE_API_KEY or TELEGRAM_API_KEY" };
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: `Telegram ${response.status}: ${JSON.stringify(data)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramPayload(row: OutboxRow): string {
  const subject = row.subject ? `<b>${escapeHtml(row.subject)}</b>\n\n` : "";
  const body = row.body ? escapeHtml(row.body) : "";
  return `${subject}${body}`.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Pull pending batch
    const nowIso = new Date().toISOString();
    const { data: rows, error: qErr } = await supabase
      .from("notifications_outbox")
      .select("id, user_id, channel, subject, body, payload, scheduled_for, status, related_table, related_id")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (qErr) {
      return new Response(
        JSON.stringify({ error: qErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const queue = (rows ?? []) as OutboxRow[];

    if (queue.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Pre-fetch profile chat_ids we'll need
    const userIds = new Set<string>();
    let needAdmins = false;
    for (const r of queue) {
      if (r.user_id) userIds.add(r.user_id);
      const role = (r.payload as any)?.recipient_role;
      if (role === "admin") needAdmins = true;
    }

    const chatByProfile = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, telegram_chat_id")
        .in("id", Array.from(userIds));
      for (const p of (profs ?? []) as Array<{ id: string; telegram_chat_id: string | null }>) {
        if (p.telegram_chat_id) chatByProfile.set(p.id, p.telegram_chat_id);
      }
    }

    let adminChatIds: string[] = [];
    if (needAdmins) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id, telegram_chat_id, role")
        .eq("role", "admin")
        .not("telegram_chat_id", "is", null);
      adminChatIds = ((admins ?? []) as Array<{ telegram_chat_id: string | null }>)
        .map((a) => a.telegram_chat_id!)
        .filter(Boolean);
    }

    // 3. Process each row
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of queue) {
      // Channel routing
      if (row.channel === "email" || row.channel === "in_app") {
        // Not implemented yet — mark skipped so we don't retry forever.
        await supabase
          .from("notifications_outbox")
          .update({
            status: "skipped",
            error: `channel ${row.channel} not implemented`,
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        skipped += 1;
        continue;
      }

      if (row.channel !== "telegram") {
        await supabase
          .from("notifications_outbox")
          .update({
            status: "skipped",
            error: `unknown channel: ${row.channel}`,
          })
          .eq("id", row.id);
        skipped += 1;
        continue;
      }

      // Build recipient list for telegram
      const recipients: string[] = [];
      if (row.user_id) {
        const cid = chatByProfile.get(row.user_id);
        if (cid) recipients.push(cid);
      } else if ((row.payload as any)?.recipient_role === "admin") {
        recipients.push(...adminChatIds);
      } else if ((row.payload as any)?.telegram_chat_id) {
        recipients.push(String((row.payload as any).telegram_chat_id));
      }

      if (recipients.length === 0) {
        await supabase
          .from("notifications_outbox")
          .update({
            status: "skipped",
            error: "no telegram recipients (user has no chat_id linked)",
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        skipped += 1;
        continue;
      }

      const text = formatTelegramPayload(row);
      const errors: string[] = [];
      let anyOk = false;
      for (const chat of recipients) {
        const r = await sendTelegramMessage(chat, text);
        if (r.ok) anyOk = true;
        else errors.push(`${chat}: ${r.error}`);
      }

      if (anyOk && errors.length === 0) {
        await supabase
          .from("notifications_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id);
        sent += 1;
      } else if (anyOk) {
        // Partial: still mark sent but record errors
        await supabase
          .from("notifications_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error: `partial: ${errors.join("; ")}`,
          })
          .eq("id", row.id);
        sent += 1;
      } else {
        await supabase
          .from("notifications_outbox")
          .update({
            status: "failed",
            error: errors.join("; ").slice(0, 1000),
          })
          .eq("id", row.id);
        failed += 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: queue.length,
        sent,
        failed,
        skipped,
        elapsed_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
