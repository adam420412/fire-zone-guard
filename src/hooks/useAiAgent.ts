import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: ProposedAction;
  actionState?: "pending" | "approved" | "rejected";
  /** ID wpisu w ai_action_log (jeśli akcja została zalogowana). */
  logId?: string;
}

export type ActionType =
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

export interface ProposedAction {
  type: ActionType;
  label: string;
  description: string;
  confirmationLevel: "soft" | "hard";
  data: Record<string, unknown>;
}

// ─── Audit logging helpers ───────────────────────────────────────────────────

async function logProposal(params: {
  action: ProposedAction;
  userId: string;
  companyId: string | null;
  context: Record<string, unknown>;
  messageId: string;
  sourcePage: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_action_log")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      action_type: params.action.type,
      action_label: params.action.label,
      action_description: params.action.description,
      confirmation_level: params.action.confirmationLevel,
      payload: params.action.data as any,
      context: params.context as any,
      status: "pending",
      message_id: params.messageId,
      source_page: params.sourcePage,
    } as any)
    .select("id")
    .single();
  if (error) {
    console.warn("[ai_action_log] failed to log proposal:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function logDecision(logId: string, decision: "approved" | "rejected", note?: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const decidedBy = sessionData.session?.user?.id ?? null;
  const { error } = await supabase
    .from("ai_action_log")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
      decision_note: note ?? null,
    } as any)
    .eq("id", logId);
  if (error) console.warn("[ai_action_log] failed to log decision:", error.message);
}

async function logExecution(logId: string, ok: boolean, error?: string) {
  const { error: updErr } = await supabase
    .from("ai_action_log")
    .update({
      status: ok ? "executed" : "failed",
      executed_at: new Date().toISOString(),
      execution_error: ok ? null : (error ?? "unknown error"),
    } as any)
    .eq("id", logId);
  if (updErr) console.warn("[ai_action_log] failed to log execution:", updErr.message);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAiAgent() {
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Cześć! Jestem asystentem Fire Zone. Mogę sprawdzić stan systemu, znaleźć dane lub zaproponować akcje do zatwierdzenia. Każda akcja jest logowana w dzienniku aktywności AI.",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      // Pobierz kontekst użytkownika: profile_id/company_id/rola są potrzebne AI,
      // bo zadania i powiadomienia wskazują na profiles.id, nie auth.users.id.
      let companyId: string | null = null;
      let profileId: string | null = null;
      let userRole: string | null = null;
      if (userId) {
        const [{ data: prof }, { data: roleRow }] = await Promise.all([
          supabase.from("profiles").select("id, company_id").eq("user_id", userId).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId).order("role").limit(1).maybeSingle(),
        ]);
        profileId = (prof as any)?.id ?? null;
        companyId = (prof as any)?.company_id ?? null;
        userRole = (roleRow as any)?.role ?? null;
      }

      const context = {
        path: location.pathname,
        buildingId: extractBuildingId(location.pathname),
        userId,
        profileId,
        companyId,
        userRole,
      };

      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: { message: text, context, history },
      });

      if (error) throw error;

      const assistantId = crypto.randomUUID();
      let logId: string | null = null;

      if (data.action && userId) {
        logId = await logProposal({
          action: data.action,
          userId,
          companyId,
          context,
          messageId: assistantId,
          sourcePage: location.pathname,
        });
      }

      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: data.reply || "Przepraszam, nie mogę teraz odpowiedzieć.",
        timestamp: new Date(),
        action: data.action,
        actionState: data.action ? "pending" : undefined,
        logId: logId ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Wystąpił błąd połączenia. Spróbuj ponownie.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, location.pathname]);

  const approveAction = useCallback(async (messageId: string, action: ProposedAction) => {
    const msg = messages.find((m) => m.id === messageId);
    const logId = msg?.logId;

    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, actionState: "approved" } : m));
    if (logId) await logDecision(logId, "approved");

    try {
      await executeAction(action);
      if (logId) await logExecution(logId, true);
      const confirmMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✅ Gotowe! ${action.label} zostało wykonane. Wpis zapisany w dzienniku AI.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err: any) {
      const errStr = formatActionError(err);
      console.error("[AI executeAction] failed:", err);
      if (logId) await logExecution(logId, false, errStr);
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Nie udało się wykonać akcji: ${errStr}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }, [messages]);

  const rejectAction = useCallback(async (messageId: string, note?: string) => {
    const msg = messages.find((m) => m.id === messageId);
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, actionState: "rejected" } : m));
    if (msg?.logId) await logDecision(msg.logId, "rejected", note);
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Historia wyczyszczona. Jak mogę pomóc?",
      timestamp: new Date(),
    }]);
  }, []);

  return { messages, isLoading, sendMessage, approveAction, rejectAction, clearHistory };
}

function extractBuildingId(path: string): string | undefined {
  const match = path.match(/\/buildings\/([^/]+)/);
  return match?.[1];
}

function formatActionError(err: any): string {
  if (!err) return "Nieznany błąd";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  // PostgrestError / Supabase functions invoke error
  const parts = [err.message, err.details, err.hint, err.code && `(${err.code})`]
    .filter((p) => typeof p === "string" && p.trim().length);
  if (parts.length) return parts.join(" — ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return UUID_RE.test(v.trim()) ? v.trim() : null;
}
function cleanUuidList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(cleanUuid).filter((x): x is string => !!x);
}

const PRIORITY_MAP: Record<string, "niski" | "średni" | "wysoki" | "krytyczny"> = {
  low: "niski", niski: "niski",
  medium: "średni", normal: "średni", "średni": "średni", sredni: "średni",
  high: "wysoki", wysoki: "wysoki",
  urgent: "krytyczny", critical: "krytyczny", krytyczny: "krytyczny",
};
function mapPriority(v: unknown): "niski" | "średni" | "wysoki" | "krytyczny" {
  const k = String(v ?? "").toLowerCase().trim();
  return PRIORITY_MAP[k] ?? "średni";
}

const SLA_PRIORITY_MAP: Record<string, "low" | "normal" | "high" | "critical"> = {
  niski: "low", low: "low",
  średni: "normal", sredni: "normal", medium: "normal", normal: "normal",
  wysoki: "high", high: "high",
  krytyczny: "critical", critical: "critical", urgent: "critical",
};
function mapSlaPriority(v: unknown): "low" | "normal" | "high" | "critical" {
  return SLA_PRIORITY_MAP[String(v ?? "").toLowerCase().trim()] ?? "normal";
}

const TRAINING_TYPE_MAP: Record<string, "ogolne_ppoz" | "obslugowo_uzytkowe" | "probna_ewakuacja" | "medyczne" | "inne"> = {
  ppoz: "ogolne_ppoz", fire: "ogolne_ppoz", ogolne_ppoz: "ogolne_ppoz",
  obslugowo_uzytkowe: "obslugowo_uzytkowe", equipment: "obslugowo_uzytkowe",
  probna_ewakuacja: "probna_ewakuacja", ewakuacja: "probna_ewakuacja", evacuation: "probna_ewakuacja",
  medyczne: "medyczne", medical: "medyczne",
  inne: "inne", other: "inne",
};
function mapTrainingType(v: unknown) {
  return TRAINING_TYPE_MAP[String(v ?? "").toLowerCase().trim()] ?? "ogolne_ppoz";
}

async function getUserContext() {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("Brak zalogowanego użytkownika.");
  const { data: prof } = await supabase
    .from("profiles").select("id, company_id").eq("user_id", userId).maybeSingle();
  return {
    userId,
    profileId: (prof as any)?.id as string | undefined,
    companyId: (prof as any)?.company_id as string | undefined,
  };
}

async function resolveBuildingCompany(buildingId: string | null, fallbackCompanyId?: string) {
  if (!buildingId) return fallbackCompanyId ?? null;
  const { data } = await supabase.from("buildings").select("company_id").eq("id", buildingId).maybeSingle();
  return ((data as any)?.company_id as string | undefined) ?? fallbackCompanyId ?? null;
}

async function resolveProfileId(id: unknown, fallbackProfileId?: string) {
  const uuid = cleanUuid(id);
  if (!uuid) return fallbackProfileId ?? null;
  const { data } = await supabase.from("profiles").select("id").or(`id.eq.${uuid},user_id.eq.${uuid}`).limit(1).maybeSingle();
  return ((data as any)?.id as string | undefined) ?? uuid;
}

async function executeAction(action: ProposedAction) {
  const { type, data } = action;
  const ctx = await getUserContext();

  if (type === "create_task") {
    const buildingId = cleanUuid(data.building_id);
    if (!buildingId) throw new Error("Brak prawidłowego ID obiektu (UUID) — wybierz budynek dla zadania.");
    const companyId = (await resolveBuildingCompany(buildingId, ctx.companyId)) ?? null;
    if (!companyId) throw new Error("Nie udało się ustalić firmy dla zadania.");
    const { error } = await supabase.from("tasks").insert({
      title: data.title as string,
      description: (data.description as string) ?? "",
      priority: mapPriority(data.priority),
      status: "Nowe",
      company_id: companyId,
      building_id: buildingId,
      deadline: data.deadline as string | undefined,
      assignee_id: cleanUuid(data.assignee_id) ?? undefined,
    } as any);
    if (error) throw error;
  } else if (type === "create_sla_ticket") {
    const { error } = await supabase.from("sla_tickets").insert({
      description: (data.description as string) || (data.title as string) || "",
      priority: ((data.priority as string) || "normal") as any,
      building_id: cleanUuid(data.building_id) ?? undefined,
      company_id: cleanUuid(data.company_id) ?? ctx.companyId ?? undefined,
    } as any);
    if (error) throw error;
  } else if (type === "send_notification") {
    await supabase.from("notifications_outbox").insert({
      subject: data.subject as string,
      body: data.body as string,
      channel: "in_app",
      status: "pending",
    });
  } else if (type === "schedule_audit") {
    const buildingId = cleanUuid(data.building_id);
    if (!buildingId) throw new Error("Brak prawidłowego ID obiektu (UUID).");
    const { error } = await supabase.from("audits").insert({
      building_id: buildingId,
      performed_at: data.date as string,
      status: "zaplanowany",
      type: (data.audit_type as string) || "PPOŻ",
    });
    if (error) throw error;
  } else if (type === "bulk_create_tasks") {
    const items = (data.items as any[]) || [];
    if (!items.length) throw new Error("Brak elementów do utworzenia");
    const rows = await Promise.all(items.map(async (it) => {
      const buildingId = cleanUuid(it.building_id);
      if (!buildingId) throw new Error("Każde zadanie musi mieć prawidłowe building_id (UUID).");
      const companyId = cleanUuid(it.company_id) ?? (await resolveBuildingCompany(buildingId, ctx.companyId));
      if (!companyId) throw new Error("Nie udało się ustalić firmy dla zadania.");
      return {
        title: it.title,
        description: it.description ?? "",
        priority: mapPriority(it.priority),
        status: "Nowe",
        building_id: buildingId,
        company_id: companyId,
        deadline: it.deadline ?? null,
        assignee_id: cleanUuid(it.assignee_id),
      };
    }));
    const { error } = await supabase.from("tasks").insert(rows as any);
    if (error) throw error;
  } else if (type === "create_device_service_tasks") {
    const deviceIds = cleanUuidList(data.device_ids);
    if (!deviceIds.length) throw new Error("Brak prawidłowych ID urządzeń (UUID).");
    const { data: devices, error: devErr } = await supabase
      .from("devices").select("id, name, building_id, location_in_building").in("id", deviceIds);
    if (devErr) throw devErr;
    const deadline = (data.deadline as string) || null;
    const assigneeId = cleanUuid(data.assignee_id);
    const rows = await Promise.all((devices ?? []).map(async (d: any) => ({
      title: `Serwis: ${d.name}${d.location_in_building ? ` (${d.location_in_building})` : ""}`,
      description: `Automatyczne zlecenie serwisowe wygenerowane przez asystenta AI.`,
      priority: "średni" as any,
      status: "Nowe",
      type: "przegląd" as any,
      building_id: d.building_id,
      company_id: (await resolveBuildingCompany(d.building_id, ctx.companyId)) ?? ctx.companyId,
      deadline,
      assignee_id: assigneeId,
    })));
    if (!rows.length) throw new Error("Nie znaleziono urządzeń o podanych ID.");
    const { error } = await supabase.from("tasks").insert(rows as any);
    if (error) throw error;
  } else if (type === "bulk_reassign_tasks") {
    const ids = cleanUuidList(data.task_ids);
    const assignee = cleanUuid(data.assignee_id);
    if (!ids.length || !assignee) throw new Error("Brak prawidłowych ID zadań lub osoby (UUID).");
    const { error } = await supabase.from("tasks").update({ assignee_id: assignee } as any).in("id", ids);
    if (error) throw error;
  } else if (type === "reschedule_overdue_tasks") {
    const ids = cleanUuidList(data.task_ids);
    const shiftDays = Number(data.shift_days ?? 7);
    if (!ids.length) throw new Error("Brak prawidłowych ID zadań (UUID).");
    const { data: tasks, error: e1 } = await supabase.from("tasks").select("id, deadline").in("id", ids);
    if (e1) throw e1;
    const updates = (tasks ?? []).map((t: any) => {
      const base = t.deadline ? new Date(t.deadline) : new Date();
      const shifted = new Date(base.getTime() + shiftDays * 86400000);
      return supabase.from("tasks").update({ deadline: shifted.toISOString() } as any).eq("id", t.id);
    });
    await Promise.all(updates);
  } else if (type === "close_task") {
    const taskId = cleanUuid(data.task_id);
    if (!taskId) throw new Error("Brak prawidłowego ID zadania (UUID).");
    const { error } = await supabase.from("tasks").update({
      status: "Zamknięte",
      closed_at: new Date().toISOString(),
    } as any).eq("id", taskId);
    if (error) throw error;
  } else if (type === "follow_up_sla") {
    const ids = cleanUuidList(data.ticket_ids);
    if (!ids.length) throw new Error("Brak prawidłowych ID ticketów (UUID).");
    const { data: tickets, error: e1 } = await supabase.from("sla_tickets")
      .select("id, ticket_number, building_id, company_id, description").in("id", ids);
    if (e1) throw e1;
    const rows = (tickets ?? []).map((t: any) => ({
      title: `Follow-up: ${t.ticket_number ?? "SLA"}`,
      description: `Kontakt z klientem po zamknięciu SLA. Oryginalne zgłoszenie: ${t.description ?? "—"}`,
      priority: "niski" as any,
      status: "Nowe",
      building_id: t.building_id,
      company_id: t.company_id,
      deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
    }));
    const { error } = await supabase.from("tasks").insert(rows as any);
    if (error) throw error;
  } else if (type === "bulk_notify_clients") {
    const items = (data.items as any[]) || [];
    if (!items.length) throw new Error("Brak odbiorców");
    const rows = items.map((it) => ({
      subject: (data.subject as string) || "Powiadomienie Fire Zone",
      body: it.body || (data.body as string) || "",
      channel: "in_app",
      status: "pending",
      user_id: cleanUuid(it.user_id),
      related_table: it.related_table ?? null,
      related_id: cleanUuid(it.related_id),
    }));
    const { error } = await supabase.from("notifications_outbox").insert(rows as any);
    if (error) throw error;
  } else if (type === "schedule_training") {
    const buildingId = cleanUuid(data.building_id);
    if (!buildingId) throw new Error("Brak prawidłowego ID obiektu (UUID).");
    const { error } = await supabase.from("building_trainings").insert({
      building_id: buildingId,
      title: (data.title as string) || "Szkolenie PPOŻ",
      type: ((data.training_type as string) || "ppoz") as any,
      scheduled_at: data.scheduled_at as string,
      status: "planned" as any,
    } as any);
    if (error) throw error;
  } else if (type === "generate_protocol") {
    const { error } = await supabase.functions.invoke("generate-report", { body: data });
    if (error) throw error;
  }
}

export const SUGGESTIONS_BY_PAGE: Record<string, string[]> = {
  "/": ["Pokaż przeterminowane zlecenia", "Jaki jest status SLA dziś?", "Co wymaga mojej uwagi?"],
  "/kanban": ["Ile mam otwartych zleceń?", "Pokaż zlecenia krytyczne", "Utwórz nowe zlecenie"],
  "/sla": ["Pokaż nowe zgłoszenia", "Które SLA są zagrożone?", "Eskaluj krytyczne zgłoszenia"],
  "/buildings": ["Które budynki mają usterki?", "Pokaż przeterminowane przeglądy", "Status wszystkich obiektów"],
  "/audits": ["Zaplanuj audyt", "Które audyty są opóźnione?", "Generuj raport z audytów"],
  "/employees": ["Kto ma wygasające certyfikaty?", "Zaplanuj szkolenie", "Pokaż dyspozycyjność zespołu"],
  "/finance": ["Które faktury są przeterminowane?", "Podsumowanie finansowe miesiąca", "Faktury do wystawienia"],
};

export interface QuickAutomation {
  id: string;
  icon: string;
  label: string;
  prompt: string;
}

export const QUICK_AUTOMATIONS: QuickAutomation[] = [
  { id: "morning",     icon: "☀️", label: "Brief dnia",          prompt: "Daj mi krótki brief poranny: ile mam dziś zleceń, co krytyczne, co przeterminowane i jakie SLA wymagają reakcji." },
  { id: "my-tasks",    icon: "📋", label: "Moje zadania",        prompt: "Pokaż moje aktywne zadania uporządkowane wg priorytetu i terminu." },
  { id: "overdue",     icon: "⏰", label: "Przeterminowane",     prompt: "Wymień wszystkie przeterminowane zlecenia i przeglądy urządzeń z propozycją co zrobić." },
  { id: "critical",    icon: "🔴", label: "Krytyczne",           prompt: "Pokaż zlecenia krytyczne i zaproponuj triage." },
  { id: "new-task",    icon: "➕", label: "Nowe zlecenie",       prompt: "Pomóż mi utworzyć nowe zlecenie — zapytaj o tytuł, priorytet i budynek, potem zaproponuj akcję." },
  { id: "report-sla",  icon: "🚨", label: "Zgłoś usterkę",       prompt: "Pomóż mi zgłosić usterkę SLA — zapytaj o opis, lokalizację i priorytet, potem zaproponuj akcję." },
  { id: "weekly",      icon: "📊", label: "Raport tygodnia",     prompt: "Podsumuj tydzień: zamknięte zlecenia, otwarte SLA, KPI i co wymaga uwagi w przyszłym tygodniu." },
  { id: "devices",     icon: "🔧", label: "Przeglądy",           prompt: "Które urządzenia mają przeterminowany lub zbliżający się przegląd? Zaproponuj plan serwisu." },
  { id: "buildings",   icon: "🏢", label: "Stan obiektów",       prompt: "Pokaż status bezpieczeństwa wszystkich budynków i wskaż te wymagające interwencji." },
];
