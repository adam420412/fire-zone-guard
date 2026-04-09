import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyPayload {
  type:
    | "status_change"
    | "deadline_warning"
    | "overdue"
    | "subtask_assigned"
    | "custom_message";
  task_id?: string;
  subtask_id?: string;
  task_title: string;
  old_status?: string;
  new_status?: string;
  deadline?: string;
  days_left?: number;
  assignee_name?: string;
  creator_name?: string;
  custom_text?: string;
  // Recipients: profile IDs to notify
  recipient_profile_ids: string[];
}

async function sendTelegramMessage(chatId: string, text: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");

  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
    console.error(`Telegram API error [${response.status}]:`, data);
  }
  return data;
}

function buildMessage(payload: NotifyPayload): string {
  switch (payload.type) {
    case "status_change":
      return (
        `🔄 <b>Zmiana statusu zadania</b>\n\n` +
        `📋 <b>${payload.task_title}</b>\n` +
        `${payload.old_status} → <b>${payload.new_status}</b>`
      );

    case "deadline_warning": {
      const emoji =
        (payload.days_left ?? 99) <= 2
          ? "🔴"
          : (payload.days_left ?? 99) <= 4
          ? "🟠"
          : "🟡";
      return (
        `${emoji} <b>Zbliża się termin!</b>\n\n` +
        `📋 <b>${payload.task_title}</b>\n` +
        `⏰ Pozostało: <b>${payload.days_left} dni</b>\n` +
        `📅 Termin: ${payload.deadline}`
      );
    }

    case "overdue":
      return (
        `🚨 <b>Zadanie przeterminowane!</b>\n\n` +
        `📋 <b>${payload.task_title}</b>\n` +
        `📅 Termin: ${payload.deadline}`
      );

    case "subtask_assigned":
      return (
        `📋 <b>Nowe podzadanie przypisane</b>\n\n` +
        `<b>${payload.task_title}</b>\n` +
        (payload.creator_name
          ? `👤 Przydzielił: ${payload.creator_name}\n`
          : "") +
        (payload.deadline ? `📅 Termin: ${payload.deadline}` : "")
      );

    case "custom_message":
      return (
        `📩 <b>Wiadomość od administratora</b>\n\n` +
        (payload.task_title ? `📋 Zadanie: <b>${payload.task_title}</b>\n\n` : "") +
        (payload.custom_text || "")
      );

    default:
      return `📢 Powiadomienie: ${payload.task_title}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = (await req.json()) as NotifyPayload;

    if (
      !payload.recipient_profile_ids ||
      payload.recipient_profile_ids.length === 0
    ) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get telegram_chat_id for all recipients
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id")
      .in("id", payload.recipient_profile_ids);

    if (error) throw error;

    const message = buildMessage(payload);
    let sent = 0;

    for (const p of profiles ?? []) {
      if (p.telegram_chat_id) {
        await sendTelegramMessage(p.telegram_chat_id, message);
        sent++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("telegram-notify error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
