// =============================================================================
// useAdminData — hooki CRUD dla super_admin (iter 9):
//  - checklist_templates + checklist_template_items
//  - device_requirement_rules
//  - dictionaries (typy urządzeń, statusy SLA, klasy budynków)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------- CHECKLIST TEMPLATES ----------
export interface ChecklistTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scope: "audyt" | "sprzet" | "bhp" | "inne";
  device_category: string | null;
  is_system: boolean;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  items_count?: number;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  sort_order: number;
  section: string | null;
  label: string;
  description: string | null;
  default_severity: "niski" | "średni" | "wysoki" | "krytyczny";
  requires_photo: boolean;
  requires_note_on_fail: boolean;
  created_at: string;
}

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["checklist_templates"],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const { data, error } = await supabase
        .from("checklist_templates" as any)
        .select("*")
        .order("scope")
        .order("name");
      if (error) throw error;

      const tpls = (data ?? []) as any[];
      if (tpls.length === 0) return [];

      // Counts items per template (single query, group client-side)
      const { data: items } = await supabase
        .from("checklist_template_items" as any)
        .select("template_id");

      const counts: Record<string, number> = {};
      ((items ?? []) as any[]).forEach((it: any) => {
        counts[it.template_id] = (counts[it.template_id] ?? 0) + 1;
      });

      return tpls.map((t: any): ChecklistTemplate => ({
        ...t,
        items_count: counts[t.id] ?? 0,
      }));
    },
  });
}

export function useChecklistTemplateItems(templateId: string | null) {
  return useQuery({
    queryKey: ["checklist_template_items", templateId],
    enabled: !!templateId,
    queryFn: async (): Promise<ChecklistTemplateItem[]> => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from("checklist_template_items" as any)
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: Partial<ChecklistTemplate>) => {
      const { data, error } = await supabase
        .from("checklist_templates" as any)
        .insert([tpl as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ChecklistTemplate> }) => {
      const { data, error } = await supabase
        .from("checklist_templates" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_templates"] }),
  });
}

export function useCreateTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<ChecklistTemplateItem>) => {
      const { data, error } = await supabase
        .from("checklist_template_items" as any)
        .insert([item as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["checklist_template_items", vars.template_id] });
      qc.invalidateQueries({ queryKey: ["checklist_templates"] });
    },
  });
}

export function useUpdateTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ChecklistTemplateItem> }) => {
      const { data, error } = await supabase
        .from("checklist_template_items" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["checklist_template_items", data?.template_id] });
    },
  });
}

export function useDeleteTemplateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, template_id }: { id: string; template_id: string }) => {
      const { error } = await supabase.from("checklist_template_items" as any).delete().eq("id", id);
      if (error) throw error;
      return { id, template_id };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["checklist_template_items", data.template_id] });
      qc.invalidateQueries({ queryKey: ["checklist_templates"] });
    },
  });
}

// ---------- DEVICE REQUIREMENT RULES ----------
export interface DeviceRequirementRule {
  id: string;
  building_class: string | null;
  area_min: number | null;
  area_max: number | null;
  required_device_type: string;
  quantity_formula: string | null;
  legal_basis: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export function useDeviceRequirementRules() {
  return useQuery({
    queryKey: ["device_requirement_rules"],
    queryFn: async (): Promise<DeviceRequirementRule[]> => {
      const { data, error } = await supabase
        .from("device_requirement_rules" as any)
        .select("*")
        .order("building_class")
        .order("area_min");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<DeviceRequirementRule>) => {
      const { data, error } = await supabase
        .from("device_requirement_rules" as any)
        .insert([rule as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device_requirement_rules"] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DeviceRequirementRule> }) => {
      const { data, error } = await supabase
        .from("device_requirement_rules" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device_requirement_rules"] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("device_requirement_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device_requirement_rules"] }),
  });
}

// ---------- DICTIONARIES ----------
// Stale slowniki — nie sa w DB (zaszyte w kodzie). Eksportujemy zeby inne
// komponenty mogly importowac w jednym miejscu i super_admin widzial co istnieje.

export const BUILDING_CLASSES = [
  { value: "ZL I",   label: "ZL I — uzytecznosci publicznej (kina, teatry...)" },
  { value: "ZL II",  label: "ZL II — przeznaczone dla osob o ograniczonej zdolnosci poruszania sie" },
  { value: "ZL III", label: "ZL III — uzytecznosci publicznej, niezakwalifikowane do ZL I i II" },
  { value: "ZL IV",  label: "ZL IV — mieszkalne" },
  { value: "ZL V",   label: "ZL V — zamieszkania zbiorowego, niezakwalifikowane do ZL I i II" },
  { value: "PM",     label: "PM — produkcyjno-magazynowe" },
  { value: "IN",     label: "IN — inwentarskie" },
];

export const DEVICE_CATEGORIES = [
  { value: "G",         label: "G — Gasnice (ogolny)" },
  { value: "G_GP6",     label: "G-GP6 — Gasnica proszkowa 6 kg" },
  { value: "G_GP12",    label: "G-GP12 — Gasnica proszkowa 12 kg" },
  { value: "G_GS5",     label: "G-GS5 — Gasnica sniegowa CO2 5 kg" },
  { value: "H",         label: "H — Hydranty (ogolny)" },
  { value: "H_DN25",    label: "H-DN25 — Hydrant DN25" },
  { value: "H_DN52",    label: "H-DN52 — Hydrant DN52" },
  { value: "SSP",       label: "SSP — System Sygnalizacji Pozarowej" },
  { value: "DSO",       label: "DSO — Dzwiekowy System Ostrzegawczy" },
  { value: "OS_AWAR",   label: "OS-AWAR — Oswietlenie awaryjne" },
  { value: "BSP",       label: "BSP — Brama Stref Pozarowych" },
  { value: "WENT_ODD",  label: "WENT-ODD — Wentylacja oddymiajaca" },
  { value: "TRANSPARENTS", label: "Oznakowanie ewakuacyjne" },
];

export const SLA_STATUSES = [
  { value: "new",         label: "Nowe",         color: "bg-blue-500" },
  { value: "acknowledged", label: "Potwierdzone", color: "bg-yellow-500" },
  { value: "assigned",    label: "Przypisane",   color: "bg-orange-500" },
  { value: "in_progress", label: "W trakcie",    color: "bg-purple-500" },
  { value: "resolved",    label: "Rozwiazane",   color: "bg-green-500" },
  { value: "closed",      label: "Zamkniete",    color: "bg-zinc-500" },
];

export const TASK_PRIORITIES = [
  { value: "krytyczny", label: "Krytyczny", color: "text-critical" },
  { value: "wysoki",    label: "Wysoki",    color: "text-warning" },
  { value: "średni",    label: "Sredni",    color: "text-primary" },
  { value: "niski",     label: "Niski",     color: "text-muted-foreground" },
];

export const TASK_STATUSES = [
  { value: "Otwarte",   label: "Otwarte" },
  { value: "W trakcie", label: "W trakcie" },
  { value: "Zamknięte", label: "Zamkniete" },
];

// ---------- BUILDING COST SUMMARY (analytics) ----------
export interface BuildingCostRow {
  building_id: string;
  building_name: string;
  company_id: string | null;
  cost_12m: number;
  paid_tasks_12m: number;
  service_tasks_12m: number;
  last_closed_at: string | null;
}

export function useBuildingCostSummary() {
  return useQuery({
    queryKey: ["building_cost_summary"],
    queryFn: async (): Promise<BuildingCostRow[]> => {
      const { data, error } = await supabase
        .from("building_cost_summary" as any)
        .select("*")
        .order("cost_12m", { ascending: false });
      if (error) {
        // 42P01 = view not yet migrated
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as any[];
    },
  });
}

// ---------- MTBF (mean-time-between-failures) per device_type ----------
// Liczone client-side z service_protocols + ich repair_summary
// (gdy nie mamy bardziej szczegolowych eventow, agregujemy po protokolach
// ze stanem `wymaga naprawy`).
export interface MtbfRow {
  device_type: string;
  mtbf_days: number;
  failure_count: number;
}

export function useMtbfByDeviceType() {
  return useQuery({
    queryKey: ["mtbf_by_device_type"],
    queryFn: async (): Promise<MtbfRow[]> => {
      // Pobierz wszystkie pomiary z hydrant_measurements gdzie repair_needed=true
      // — to nasz najlepszy proxy na "failure event"
      const { data: measurements, error } = await supabase
        .from("hydrant_measurements" as any)
        .select("created_at, hydrant_type, repair_needed")
        .eq("repair_needed", true)
        .order("created_at");
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }

      const byType: Record<string, Date[]> = {};
      ((measurements ?? []) as any[]).forEach((m: any) => {
        const t = m.hydrant_type || "H_DN25";
        if (!byType[t]) byType[t] = [];
        byType[t].push(new Date(m.created_at));
      });

      const rows: MtbfRow[] = [];
      for (const [deviceType, dates] of Object.entries(byType)) {
        if (dates.length < 2) continue;
        let totalDays = 0;
        for (let i = 1; i < dates.length; i++) {
          const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
          totalDays += diff;
        }
        rows.push({
          device_type: deviceType,
          mtbf_days: Math.round(totalDays / (dates.length - 1)),
          failure_count: dates.length,
        });
      }
      return rows.sort((a, b) => b.failure_count - a.failure_count);
    },
  });
}
