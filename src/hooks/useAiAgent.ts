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

export function useAiAgent() {
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Cześć! Jestem asystentem Fire Zone. Mogę sprawdzić stan systemu, znaleźć dane lub zaproponować akcje do zatwierdzenia. Jak mogę pomóc?",
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

      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: {
          message: text,
          context: {
            path: location.pathname,
            buildingId: extractBuildingId(location.pathname),
            userId,
          },
          history,
        },
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "Przepraszam, nie mogę teraz odpowiedzieć.",
        timestamp: new Date(),
        action: data.action,
        actionState: data.action ? "pending" : undefined,
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
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, actionState: "approved" } : m));

    try {
      await executeAction(action);
      const confirmMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✅ Gotowe! ${action.label} zostało wykonane pomyślnie.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Nie udało się wykonać akcji: ${String(err)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }, []);

  const rejectAction = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, actionState: "rejected" } : m));
  }, []);

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

async function executeAction(action: ProposedAction) {
  const { type, data } = action;

  if (type === "create_task") {
    const { error } = await supabase.from("tasks").insert({
      title: data.title as string,
      description: data.description as string,
      priority: ((data.priority as string) || "średni") as "krytyczny" | "wysoki" | "średni" | "niski",
      status: "Nowe",
      building_id: data.building_id as string | undefined,
      deadline: data.deadline as string | undefined,
      assignee_id: data.assignee_id as string | undefined,
    } as any);
    if (error) throw error;
  } else if (type === "create_sla_ticket") {
    const { error } = await supabase.from("sla_tickets").insert({
      description: (data.description as string) || (data.title as string) || "",
      priority: ((data.priority as string) || "normal") as any,
      building_id: data.building_id as string | undefined,
      company_id: data.company_id as string | undefined,
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
    const { error } = await supabase.from("audits").insert({
      building_id: data.building_id as string,
      performed_at: data.date as string,
      status: "zaplanowany",
      type: (data.audit_type as string) || "PPOŻ",
    });
    if (error) throw error;
  } else if (type === "bulk_create_tasks") {
    const items = (data.items as any[]) || [];
    if (!items.length) throw new Error("Brak elementów do utworzenia");
    const rows = items.map((it) => ({
      title: it.title,
      description: it.description ?? null,
      priority: (it.priority || "średni") as any,
      status: "Nowe",
      building_id: it.building_id ?? null,
      deadline: it.deadline ?? null,
      assignee_id: it.assignee_id ?? null,
      company_id: it.company_id ?? null,
    }));
    const { error } = await supabase.from("tasks").insert(rows as any);
    if (error) throw error;
  } else if (type === "create_device_service_tasks") {
    const deviceIds = (data.device_ids as string[]) || [];
    if (!deviceIds.length) throw new Error("Brak urządzeń");
    const { data: devices, error: devErr } = await supabase
      .from("devices").select("id, name, building_id, location_in_building").in("id", deviceIds);
    if (devErr) throw devErr;
    const deadline = (data.deadline as string) || null;
    const assigneeId = (data.assignee_id as string) || null;
    const rows = (devices ?? []).map((d: any) => ({
      title: `Serwis: ${d.name}${d.location_in_building ? ` (${d.location_in_building})` : ""}`,
      description: `Automatyczne zlecenie serwisowe wygenerowane przez asystenta AI.`,
      priority: "średni" as any,
      status: "Nowe",
      type: "przegląd" as any,
      building_id: d.building_id,
      deadline,
      assignee_id: assigneeId,
    }));
    const { error } = await supabase.from("tasks").insert(rows as any);
    if (error) throw error;
  } else if (type === "bulk_reassign_tasks") {
    const ids = (data.task_ids as string[]) || [];
    const assignee = data.assignee_id as string;
    if (!ids.length || !assignee) throw new Error("Brak zadań lub osoby");
    const { error } = await supabase.from("tasks").update({ assignee_id: assignee } as any).in("id", ids);
    if (error) throw error;
  } else if (type === "reschedule_overdue_tasks") {
    const ids = (data.task_ids as string[]) || [];
    const shiftDays = Number(data.shift_days ?? 7);
    if (!ids.length) throw new Error("Brak zadań");
    const { data: tasks, error: e1 } = await supabase.from("tasks").select("id, deadline").in("id", ids);
    if (e1) throw e1;
    const updates = (tasks ?? []).map((t: any) => {
      const base = t.deadline ? new Date(t.deadline) : new Date();
      const shifted = new Date(base.getTime() + shiftDays * 86400000);
      return supabase.from("tasks").update({ deadline: shifted.toISOString() } as any).eq("id", t.id);
    });
    await Promise.all(updates);
  } else if (type === "close_task") {
    const { error } = await supabase.from("tasks").update({
      status: "Zamknięte",
      closed_at: new Date().toISOString(),
    } as any).eq("id", data.task_id as string);
    if (error) throw error;
  } else if (type === "follow_up_sla") {
    const ids = (data.ticket_ids as string[]) || [];
    if (!ids.length) throw new Error("Brak ticketów");
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
      user_id: it.user_id ?? null,
      related_table: it.related_table ?? null,
      related_id: it.related_id ?? null,
    }));
    const { error } = await supabase.from("notifications_outbox").insert(rows as any);
    if (error) throw error;
  } else if (type === "schedule_training") {
    const { error } = await supabase.from("building_trainings").insert({
      building_id: data.building_id as string,
      title: (data.title as string) || "Szkolenie PPOŻ",
      type: ((data.training_type as string) || "ppoz") as any,
      scheduled_at: data.scheduled_at as string,
      status: "planned" as any,
    } as any);
    if (error) throw error;
  } else if (type === "generate_protocol") {
    // Trigger existing report generator
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

// Codzienne automatyzacje — szybkie skróty zawsze widoczne w panelu (dla każdego użytkownika)
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

