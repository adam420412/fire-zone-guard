import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    let totalSent = 0;

    // Get all open tasks with deadlines
    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id, title, deadline, assignee_id, status")
      .not("deadline", "is", null)
      .neq("status", "Zamknięte");

    if (tErr) throw tErr;

    // Get all open subtasks with deadlines
    const { data: subtasks, error: sErr } = await supabase
      .from("subtasks")
      .select("id, title, deadline, assignee_id, created_by, status, task_id")
      .not("deadline", "is", null)
      .neq("status", "Zamknięte");

    if (sErr) throw sErr;

    // Collect all profile IDs we need chat_ids for
    const profileIds = new Set<string>();
    for (const t of tasks ?? []) {
      if (t.assignee_id) profileIds.add(t.assignee_id);
    }
    for (const s of subtasks ?? []) {
      if (s.assignee_id) profileIds.add(s.assignee_id);
      if (s.created_by) profileIds.add(s.created_by);
    }

    // Get super admins
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");

    const adminUserIds = (adminRoles ?? []).map((r: any) => r.user_id);

    // Get admin profiles
    if (adminUserIds.length > 0) {
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id")
        .in("user_id", adminUserIds);
      for (const ap of adminProfiles ?? []) profileIds.add(ap.id);
    }

    // Fetch all profiles with telegram_chat_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, name")
      .in("id", [...profileIds]);

    const chatMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.telegram_chat_id) chatMap.set(p.id, p.telegram_chat_id);
    }

    const adminProfileIds = (profiles ?? [])
      .filter((p: any) => adminUserIds.length > 0)
      .map((p: any) => p.id);

    // Process tasks
    for (const task of tasks ?? []) {
      const dl = new Date(task.deadline!);
      const diffDays = Math.ceil(
        (dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let emoji = "";
      let shouldNotify = false;

      if (diffDays < 0) {
        emoji = "🚨";
        shouldNotify = true;
      } else if (diffDays <= 2) {
        emoji = "🔴";
        shouldNotify = true;
      } else if (diffDays <= 4) {
        emoji = "🟠";
        shouldNotify = true;
      } else if (diffDays <= 7) {
        emoji = "🟡";
        shouldNotify = true;
      }

      if (!shouldNotify) continue;

      const deadlineStr = dl.toLocaleDateString("pl-PL");
      const message =
        diffDays < 0
          ? `${emoji} <b>Zadanie przeterminowane!</b>\n\n📋 <b>${task.title}</b>\n📅 Termin: ${deadlineStr}`
          : `${emoji} <b>Zbliża się termin!</b>\n\n📋 <b>${task.title}</b>\n⏰ Pozostało: <b>${diffDays} dni</b>\n📅 Termin: ${deadlineStr}`;

      // Notify assignee
      const recipientIds = new Set<string>();
      if (task.assignee_id && chatMap.has(task.assignee_id)) {
        recipientIds.add(task.assignee_id);
      }

      // Notify admins for critical (<=2 days or overdue)
      if (diffDays <= 2) {
        for (const aid of adminProfileIds) {
          if (chatMap.has(aid)) recipientIds.add(aid);
        }
      }

      for (const rid of recipientIds) {
        const chatId = chatMap.get(rid);
        if (chatId) {
          await sendTelegramMessage(chatId, message);
          totalSent++;
        }
      }
    }

    // Process subtasks similarly
    for (const sub of subtasks ?? []) {
      const dl = new Date(sub.deadline!);
      const diffDays = Math.ceil(
        (dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let shouldNotify = false;
      if (diffDays <= 7) shouldNotify = true;
      if (diffDays < 0) shouldNotify = true;

      if (!shouldNotify) continue;

      const emoji = diffDays < 0 ? "🚨" : diffDays <= 2 ? "🔴" : diffDays <= 4 ? "🟠" : "🟡";
      const deadlineStr = dl.toLocaleDateString("pl-PL");
      const message =
        diffDays < 0
          ? `${emoji} <b>Podzadanie przeterminowane!</b>\n\n📋 <b>${sub.title}</b>\n📅 Termin: ${deadlineStr}`
          : `${emoji} <b>Zbliża się termin podzadania!</b>\n\n📋 <b>${sub.title}</b>\n⏰ Pozostało: <b>${diffDays} dni</b>\n📅 Termin: ${deadlineStr}`;

      // Notify assignee and creator
      const recipientIds = new Set<string>();
      if (sub.assignee_id && chatMap.has(sub.assignee_id)) recipientIds.add(sub.assignee_id);
      if (sub.created_by && chatMap.has(sub.created_by)) recipientIds.add(sub.created_by);

      for (const rid of recipientIds) {
        const chatId = chatMap.get(rid);
        if (chatId) {
          await sendTelegramMessage(chatId, message);
          totalSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("telegram-deadline-check error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
