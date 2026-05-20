// =============================================================================
// ai-agent — conversational AI assistant for Fire Zone Guard operators.
//
// Request:  { message: string, context: PageContext, history: ChatMessage[] }
// Response: { reply: string, action?: ProposedAction }
//
// The agent reads live data from Supabase via tools, then optionally proposes
// an action (create_task, send_notification, etc.) that requires user approval
// before the frontend executes it. The agent never writes directly — writes
// are performed by the frontend after the user confirms.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PageContext {
  path: string;
  buildingId?: string;
  taskId?: string;
  companyId?: string;
  userId?: string;
  userRole?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ActionType =
  | "create_task"
  | "create_sla_ticket"
  | "send_notification"
  | "generate_protocol"
  | "schedule_audit"
  | "bulk_create_tasks"
  | "bulk_reassign_tasks"
  | "reschedule_overdue_tasks"
  | "close_task"
  | "follow_up_sla"
  | "bulk_notify_clients"
  | "create_device_service_tasks"
  | "schedule_training";

interface ProposedAction {
  type: ActionType;
  label: string;
  description: string;
  confirmationLevel: "soft" | "hard";
  data: Record<string, unknown>;
}

const SYSTEM_PROMPT = `Jesteś asystentem operatora systemu Fire Zone Guard — platformy do zarządzania ochroną przeciwpożarową PPOŻ w Polsce. Pomagasz administratorom, koordynatorom, serwisantom i klientom efektywnie zarządzać zleceniami, audytami, urządzeniami i obiektami.

## Styl odpowiedzi (BARDZO WAŻNE)

Zawsze używaj **markdown** ze strukturą:
- **Pogrubienia** dla kluczowych liczb i nazw
- Listy punktowane dla wyliczeń
- Emoji dla statusu: 🔴 krytyczne · 🟡 ostrzeżenie · ✅ OK · 📋 zadanie · 🏢 budynek · ⚡ automat · 🔧 serwis · 📊 raport · 📞 follow-up · 🚨 SLA
- Krótkie nagłówki sekcji (### Nagłówek) gdy odpowiedź ma >2 sekcje
- Polski język, konkretnie, bez wody

## Co robisz

1. Odpowiadasz na pytania o stan systemu (dashboard, zlecenia, SLA, urządzenia, budynki, pracownicy)
2. Szukasz danych przez narzędzia (search_data, get_building_status, get_overdue_items)
3. Proponujesz akcje przez **propose_action** — nigdy nie wykonujesz akcji bez potwierdzenia użytkownika
4. Sugerujesz dopasowane **automatyzacje codzienne** na końcu każdej odpowiedzi

## Automatyzacje codzienne (dla KAŻDEGO użytkownika)

Po każdej merytorycznej odpowiedzi (status, lista, podsumowanie) dołącz na końcu blok:

**⚡ Co mogę dla Ciebie zrobić?**

Wymień 3–4 dopasowane do kontekstu skróty z listy poniżej, jako listę punktowaną z opisem 1-linijkowym. Dobierz do roli i tego o co użytkownik pytał.

Dostępne automatyzacje:
- ☀️ **Brief dnia** — szybki przegląd: zadania, krytyczne, przeterminowane, SLA
- 📋 **Moje zadania** — aktywne zadania użytkownika wg priorytetu/terminu
- ⏰ **Przeterminowane** — zaległe zlecenia + propozycja eskalacji
- 🔴 **Triage krytycznych** — plan reakcji + SLA tickets dla krytycznych
- ➕ **Nowe zlecenie** — kreator: tytuł, priorytet, budynek, deadline
- 🚨 **Zgłoś usterkę SLA** — kreator zgłoszenia SLA z opisem i lokalizacją
- 📊 **Raport tygodnia/dnia** — PDF z otwartymi, zamkniętymi, KPI
- 🔧 **Plan serwisu urządzeń** — bulk-zlecenia dla przeterminowanych przeglądów
- 🏢 **Audyt budynku** — zaplanuj audyt PPOŻ + protokół + checklistę
- 📨 **Powiadom klientów** — masowy update dla firm z otwartymi sprawami
- 📞 **Follow-up po SLA** — zadania follow-up dla zamkniętych SLA z 7 dni
- 🗓️ **Przeplanuj zaległe** — przesuń deadliny przeterminowanych o tydzień

Zakończ pytaniem: _"Który skrót uruchomić?"_ — użytkownik kliknie przycisk lub odpisze.

## Reguły akcji

Gdy użytkownik wybierze automatyzację lub poprosi o stworzenie/wysłanie/zmianę czegoś — ZAWSZE użyj **propose_action**:
- \`confirmation_level: "hard"\` dla akcji masowych (>1 rekord) i nieodwracalnych (wysyłka, generowanie PDF)
- \`confirmation_level: "soft"\` dla pojedynczych, łatwo cofalnych (jedno zlecenie, jedna notatka)
- Pobierz najpierw dane przez narzędzia, zanim wypełnisz \`data\` propozycji

Nigdy nie pisz że "zrobiłeś" coś bez wywołania propose_action — frontend wykonuje akcję dopiero po zatwierdzeniu.`;

const TOOLS = [
  {
    name: "get_dashboard_summary",
    description: "Pobierz podsumowanie dashboardu — otwarte zlecenia, przeterminowane, zgłoszenia SLA, alerty",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_data",
    description: "Szukaj danych w systemie — budynki, zlecenia, firmy, urządzenia, pracownicy",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Fraza do wyszukania" },
        entity: {
          type: "string",
          enum: ["tasks", "buildings", "companies", "employees", "sla_tickets"],
          description: "Typ danych do wyszukania (opcjonalny)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_building_status",
    description: "Pobierz szczegółowy status budynku — urządzenia, audyty, zlecenia, SLA",
    input_schema: {
      type: "object",
      properties: {
        building_id: { type: "string", description: "ID budynku (opcjonalne — jeśli brak, zwróć listę wszystkich)" },
      },
    },
  },
  {
    name: "get_overdue_items",
    description: "Pobierz wszystkie przeterminowane elementy — zlecenia, przeglądy urządzeń, audyty",
    input_schema: {
      type: "object",
      properties: {
        building_id: { type: "string", description: "Ogranicz do konkretnego budynku (opcjonalne)" },
      },
    },
  },
  {
    name: "propose_action",
    description: "Zaproponuj akcję wymagającą potwierdzenia użytkownika. ZAWSZE używaj tego narzędzia gdy chcesz coś stworzyć, wysłać lub zmienić.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["create_task", "create_sla_ticket", "send_notification", "generate_protocol", "schedule_audit"],
          description: "Typ akcji",
        },
        label: { type: "string", description: "Krótki opis akcji dla użytkownika (np. 'Utwórz 3 zlecenia serwisowe')" },
        description: { type: "string", description: "Szczegółowy opis co dokładnie zostanie zrobione" },
        confirmation_level: {
          type: "string",
          enum: ["soft", "hard"],
          description: "soft = toast z cofnięciem, hard = modal z potwierdzeniem",
        },
        data: { type: "object", description: "Dane potrzebne do wykonania akcji" },
      },
      required: ["type", "label", "description", "confirmation_level", "data"],
    },
  },
];

async function callClaude(
  supabase: ReturnType<typeof createClient>,
  messages: Array<{ role: string; content: string | unknown[] }>,
  maxIter = 5,
): Promise<{ reply: string; action?: ProposedAction }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  let currentMessages = [...messages];
  let proposedAction: ProposedAction | undefined;
  let finalReply = "";

  for (let i = 0; i < maxIter; i++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: currentMessages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic API error: ${resp.status} ${err.slice(0, 300)}`);
    }

    const data = await resp.json();

    if (data.stop_reason === "end_turn") {
      const textBlock = data.content?.find((b: any) => b.type === "text");
      finalReply = textBlock?.text ?? "";
      break;
    }

    if (data.stop_reason === "tool_use") {
      const toolUseBlocks = data.content?.filter((b: any) => b.type === "tool_use") ?? [];
      const textBlock = data.content?.find((b: any) => b.type === "text");
      if (textBlock) finalReply = textBlock.text;

      currentMessages.push({ role: "assistant", content: data.content });

      const toolResults: unknown[] = [];

      for (const toolUse of toolUseBlocks) {
        const { id, name, input } = toolUse;
        let result: unknown;

        try {
          if (name === "get_dashboard_summary") {
            result = await getDashboardSummary(supabase);
          } else if (name === "search_data") {
            result = await searchData(supabase, input.query, input.entity);
          } else if (name === "get_building_status") {
            result = await getBuildingStatus(supabase, input.building_id);
          } else if (name === "get_overdue_items") {
            result = await getOverdueItems(supabase, input.building_id);
          } else if (name === "propose_action") {
            proposedAction = {
              type: input.type,
              label: input.label,
              description: input.description,
              confirmationLevel: input.confirmation_level,
              data: input.data,
            };
            result = { status: "action_proposed", message: "Akcja zaproponowana użytkownikowi do potwierdzenia." };
          } else {
            result = { error: `Nieznane narzędzie: ${name}` };
          }
        } catch (e) {
          result = { error: String(e) };
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: JSON.stringify(result),
        });
      }

      currentMessages.push({ role: "user", content: toolResults });

      if (proposedAction) {
        // One more turn to get the final reply text after action proposed
        const finalResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages: currentMessages,
          }),
        });
        if (finalResp.ok) {
          const fd = await finalResp.json();
          const tb = fd.content?.find((b: any) => b.type === "text");
          if (tb) finalReply = tb.text;
        }
        break;
      }
    }
  }

  return { reply: finalReply || "Nie mogę teraz pomóc. Spróbuj ponownie.", action: proposedAction };
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function getDashboardSummary(supabase: ReturnType<typeof createClient>) {
  const today = new Date().toISOString();
  const [tasks, slaTickets, overdueDevices] = await Promise.all([
    supabase.from("tasks").select("id, status, priority, deadline").neq("status", "Zamknięte").limit(200),
    supabase.from("sla_tickets").select("id, status, priority, created_at").neq("status", "zamknięte").limit(50),
    supabase.from("devices").select("id, name, next_service_date").lt("next_service_date", today.split("T")[0]).limit(50),
  ]);

  const allTasks = tasks.data ?? [];
  const overdueTasks = allTasks.filter((t) => t.deadline && t.deadline < today);
  const criticalTasks = allTasks.filter((t) => t.priority === "krytyczny");

  return {
    open_tasks: allTasks.length,
    overdue_tasks: overdueTasks.length,
    critical_tasks: criticalTasks.length,
    open_sla_tickets: (slaTickets.data ?? []).length,
    overdue_devices: (overdueDevices.data ?? []).length,
  };
}

async function searchData(supabase: ReturnType<typeof createClient>, query: string, entity?: string) {
  const q = query.toLowerCase();
  const results: Record<string, unknown[]> = {};

  if (!entity || entity === "buildings") {
    const { data } = await supabase.from("buildings").select("id, name, address, safety_status").ilike("name", `%${q}%`).limit(5);
    if (data?.length) results.buildings = data;
  }
  if (!entity || entity === "companies") {
    const { data } = await supabase.from("companies").select("id, name, nip, contact_email").ilike("name", `%${q}%`).limit(5);
    if (data?.length) results.companies = data;
  }
  if (!entity || entity === "tasks") {
    const { data } = await supabase.from("tasks").select("id, title, status, priority, deadline").ilike("title", `%${q}%`).neq("status", "Zamknięte").limit(5);
    if (data?.length) results.tasks = data;
  }
  if (!entity || entity === "sla_tickets") {
    const { data } = await supabase.from("sla_tickets").select("id, title, status, priority").ilike("title", `%${q}%`).limit(5);
    if (data?.length) results.sla_tickets = data;
  }

  return Object.keys(results).length ? results : { message: `Nie znaleziono wyników dla: "${query}"` };
}

async function getBuildingStatus(supabase: ReturnType<typeof createClient>, buildingId?: string) {
  if (buildingId) {
    const [building, tasks, audits, devices] = await Promise.all([
      supabase.from("buildings").select("id, name, address, safety_status").eq("id", buildingId).maybeSingle(),
      supabase.from("tasks").select("id, title, status, priority").eq("building_id", buildingId).neq("status", "Zamknięte").limit(10),
      supabase.from("audits").select("id, status, performed_at").eq("building_id", buildingId).order("performed_at", { ascending: false }).limit(3),
      supabase.from("devices").select("id, name, device_type, next_service_date").eq("building_id", buildingId).limit(20),
    ]);
    const today = new Date().toISOString().split("T")[0];
    const overdueDevices = (devices.data ?? []).filter((d) => d.next_service_date && d.next_service_date < today);
    return { building: building.data, open_tasks: tasks.data, recent_audits: audits.data, overdue_devices: overdueDevices };
  }

  const { data } = await supabase.from("buildings").select("id, name, safety_status").order("name").limit(20);
  return { buildings: data };
}

async function getOverdueItems(supabase: ReturnType<typeof createClient>, buildingId?: string) {
  const today = new Date().toISOString();
  const todayDate = today.split("T")[0];
  let tasksQuery = supabase.from("tasks").select("id, title, deadline, priority, status, building_id").neq("status", "Zamknięte").lt("deadline", today).limit(20);
  let devicesQuery = supabase.from("devices").select("id, name, device_type, next_service_date, building_id").lt("next_service_date", todayDate).limit(20);

  if (buildingId) {
    tasksQuery = tasksQuery.eq("building_id", buildingId);
    devicesQuery = devicesQuery.eq("building_id", buildingId);
  }

  const [tasks, devices] = await Promise.all([tasksQuery, devicesQuery]);
  return {
    overdue_tasks: tasks.data ?? [],
    overdue_devices: devices.data ?? [],
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { message, context, history = [] } = await req.json() as {
      message: string;
      context: PageContext;
      history: ChatMessage[];
    };

    if (!message) {
      return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const contextNote = context?.path
      ? `\n[Kontekst: użytkownik jest na stronie "${context.path}"${context.buildingId ? `, budynek ID: ${context.buildingId}` : ""}]`
      : "";

    const messages: Array<{ role: string; content: string }> = [
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message + contextNote },
    ];

    const result = await callClaude(supabase, messages);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-agent error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
