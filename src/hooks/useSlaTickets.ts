import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ----- Typy ------------------------------------------------------------------
export type SlaTicketType = "usterka" | "porada" | "kontrola";
export type SlaTicketPriority = "low" | "normal" | "high" | "critical";
export type SlaTicketStatus =
  | "zgloszenie"
  | "telefon"
  | "wyjazd"
  | "na_miejscu"
  | "diagnoza"
  | "naprawiono"
  | "niezasadne"
  | "zamkniete";

export interface SlaTicket {
  id: string;
  ticket_number: string | null;
  building_id: string | null;
  building_name?: string | null;
  building_address?: string | null;
  company_id: string | null;
  company_name?: string | null;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  type: SlaTicketType;
  priority: SlaTicketPriority;
  device_type: string | null;
  device_id: string | null;
  description: string;
  photo_urls: string[] | null;
  ai_summary: string | null;
  ai_category: Record<string, unknown> | null;
  ai_draft_email: string | null;
  status: SlaTicketStatus;
  diagnosis: string | null;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
  sla_response_due: string | null;
  sla_resolution_due: string | null;
  first_response_at: string | null;
  on_site_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  protocol_url: string | null;
  related_task_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sla_response_breached?: boolean;
  sla_resolution_breached?: boolean;
}

export interface SlaTicketEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_label: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateSlaTicketInput {
  building_id?: string | null;
  company_id?: string | null;
  reporter_user_id?: string | null;
  reporter_name?: string;
  reporter_email?: string;
  reporter_phone?: string;
  type: SlaTicketType;
  priority?: SlaTicketPriority;
  device_type?: string | null;
  description: string;
  photo_urls?: string[];
}

// ----- Konfiguracja statusów (dla UI) -----------------------------------------
export const STATUS_FLOW: SlaTicketStatus[] = [
  "zgloszenie",
  "telefon",
  "wyjazd",
  "na_miejscu",
  "diagnoza",
  "naprawiono",
  "zamkniete",
];

export const STATUS_LABELS: Record<SlaTicketStatus, string> = {
  zgloszenie: "Zgłoszenie",
  telefon: "Kontakt telefoniczny",
  wyjazd: "Wyjazd",
  na_miejscu: "Na miejscu",
  diagnoza: "Diagnoza",
  naprawiono: "Naprawiono",
  niezasadne: "Niezasadne",
  zamkniete: "Zamknięte",
};

export const PRIORITY_LABELS: Record<SlaTicketPriority, string> = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
  critical: "Krytyczny",
};

export const TYPE_LABELS: Record<SlaTicketType, string> = {
  usterka: "Usterka (tryb awaryjny)",
  porada: "Porada prawno-techniczna",
  kontrola: "Kontrola (Instytucja / Ubezpieczyciel)",
};

export const TICKETS_KEY = ["sla_tickets"] as const;

// ----- Hooki ------------------------------------------------------------------

export function useSlaTickets(filters?: {
  status?: SlaTicketStatus | "all";
  priority?: SlaTicketPriority | "all";
  building_id?: string | null;
  reporterOnly?: boolean;
}) {
  return useQuery({
    queryKey: [...TICKETS_KEY, filters ?? {}],
    queryFn: async (): Promise<SlaTicket[]> => {
      // Próbujemy z viewu, fallback na tabelę
      let query: any = (supabase.from as any)("sla_tickets_with_details").select("*");

      if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
      if (filters?.priority && filters.priority !== "all") query = query.eq("priority", filters.priority);
      if (filters?.building_id) query = query.eq("building_id", filters.building_id);
      if (filters?.reporterOnly) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) query = query.eq("reporter_user_id", user.id);
      }

      query = query.order("created_at", { ascending: false }).limit(500);
      const { data, error } = await query;
      if (error) {
        // fallback bez viewu
        const fallback = await (supabase.from as any)("sla_tickets")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []) as SlaTicket[];
      }
      return (data ?? []) as SlaTicket[];
    },
  });
}

export function useSlaTicket(id: string | undefined) {
  return useQuery({
    queryKey: [...TICKETS_KEY, "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<SlaTicket | null> => {
      const { data, error } = await (supabase.from as any)("sla_tickets_with_details")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SlaTicket | null;
    },
  });
}

export function useSlaTicketEvents(ticketId: string | undefined) {
  return useQuery({
    queryKey: [...TICKETS_KEY, "events", ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<SlaTicketEvent[]> => {
      const { data, error } = await (supabase.from as any)("sla_ticket_events")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlaTicketEvent[];
    },
  });
}

export function useCreateSlaTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSlaTicketInput): Promise<SlaTicket> => {
      // Wymuszamy reporter_user_id z aktualnej sesji jeśli istnieje
      const { data: { user } } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        building_id: input.building_id ?? null,
        company_id: input.company_id ?? null,
        reporter_user_id: user?.id ?? input.reporter_user_id ?? null,
        reporter_name: input.reporter_name ?? null,
        reporter_email: input.reporter_email ?? user?.email ?? null,
        reporter_phone: input.reporter_phone ?? null,
        type: input.type,
        priority: input.priority ?? "normal",
        device_type: input.device_type ?? null,
        description: input.description,
        photo_urls: input.photo_urls ?? [],
      };

      const { data, error } = await (supabase.from as any)("sla_tickets")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SlaTicket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

export function useUpdateSlaTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SlaTicket> }) => {
      // Whitelist pól żeby nie nadpisywać systemowych przez przypadek
      const allowed: (keyof SlaTicket)[] = [
        "status", "priority", "type", "diagnosis", "assigned_to", "device_type",
        "device_id", "notes", "ai_summary", "ai_category", "ai_draft_email",
        "protocol_url", "related_task_id", "building_id", "company_id",
      ];
      const safe: Record<string, unknown> = {};
      for (const k of allowed) {
        if (k in patch) safe[k as string] = (patch as any)[k];
      }
      const { data, error } = await (supabase.from as any)("sla_tickets")
        .update(safe)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SlaTicket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

export function useDeleteSlaTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("sla_tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

// ----- Upload zdjęć do Storage ------------------------------------------------
export async function uploadSlaPhoto(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("sla-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("sla-photos").getPublicUrl(path);
  return data.publicUrl;
}

// ----- Helper: derive next allowed statuses -----------------------------------
export function nextAllowedStatuses(current: SlaTicketStatus): SlaTicketStatus[] {
  switch (current) {
    case "zgloszenie": return ["telefon", "wyjazd", "niezasadne"];
    case "telefon":    return ["wyjazd", "niezasadne", "naprawiono"];
    case "wyjazd":     return ["na_miejscu", "niezasadne"];
    case "na_miejscu": return ["diagnoza", "naprawiono"];
    case "diagnoza":   return ["naprawiono", "niezasadne"];
    case "naprawiono": return ["zamkniete"];
    case "niezasadne": return ["zamkniete"];
    case "zamkniete":  return [];
  }
}

export function isTerminalStatus(s: SlaTicketStatus): boolean {
  return s === "zamkniete" || s === "niezasadne";
}
