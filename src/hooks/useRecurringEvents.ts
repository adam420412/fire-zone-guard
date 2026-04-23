import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecurrenceType =
  | "training"
  | "audit"
  | "service"
  | "document_update"
  | "insurance"
  | "contract_renewal"
  | "custom";

export interface RecurringEvent {
  id: string;
  title: string;
  recurrence_type: RecurrenceType;
  building_id: string | null;
  company_id: string | null;
  next_due_date: string | null;
  last_done_date: string | null;
  interval_months: number | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface RecurringEventInput {
  title: string;
  recurrence_type: RecurrenceType;
  building_id?: string | null;
  company_id?: string | null;
  next_due_date?: string | null;
  interval_months?: number | null;
  notes?: string | null;
}

export const RECURRING_KEY = ["recurring_events"] as const;

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  training:         "Szkolenie",
  audit:            "Audyt PPOŻ",
  service:          "Serwis okresowy",
  document_update:  "Aktualizacja IBP",
  insurance:        "Ubezpieczenie",
  contract_renewal: "Wznowienie umowy",
  custom:           "Inne",
};

// Domyślne interwały (miesiące) per typ
export const DEFAULT_INTERVAL_MONTHS: Record<RecurrenceType, number> = {
  training:         12,
  audit:            12,
  service:          12,
  document_update:  24,
  insurance:        12,
  contract_renewal: 12,
  custom:           12,
};

export function useRecurringEvents() {
  return useQuery({
    queryKey: RECURRING_KEY,
    queryFn: async (): Promise<RecurringEvent[]> => {
      const { data, error } = await (supabase.from as any)("recurring_events")
        .select("*")
        .order("next_due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RecurringEvent[];
    },
  });
}

export function useCreateRecurringEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringEventInput): Promise<RecurringEvent> => {
      const payload: Record<string, unknown> = {
        title: input.title,
        recurrence_type: input.recurrence_type,
        building_id: input.building_id ?? null,
        company_id: input.company_id ?? null,
        next_due_date: input.next_due_date ?? null,
        interval_months: input.interval_months ?? DEFAULT_INTERVAL_MONTHS[input.recurrence_type],
        notes: input.notes ?? null,
      };
      const { data, error } = await (supabase.from as any)("recurring_events")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as RecurringEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
  });
}

export function useUpdateRecurringEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RecurringEventInput> }) => {
      const { data, error } = await (supabase.from as any)("recurring_events")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as RecurringEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
  });
}

export function useDeleteRecurringEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("recurring_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
  });
}

// Wykorzystuje funkcję RPC z migracji iteration2
export function useMarkRecurringEventDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done_date }: { id: string; done_date?: string }) => {
      const { data, error } = await (supabase.rpc as any)("mark_recurring_event_done", {
        p_event_id: id,
        p_done_date: done_date ?? null,
      });
      if (error) throw error;
      return data as RecurringEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
  });
}
