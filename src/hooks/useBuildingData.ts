import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---- BUILDING DETAIL ----
export function useBuildingDetail(buildingId: string) {
  return useQuery({
    queryKey: ["building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("*, companies(name)")
        .eq("id", buildingId)
        .single();
      if (error) throw error;

      const { data: status } = await supabase.rpc("calculate_building_safety_status", {
        _building_id: buildingId,
      });

      return {
        ...data,
        companyName: (data as any).companies?.name ?? "",
        safetyStatus: status ?? "bezpieczny",
      };
    },
    enabled: !!buildingId,
  });
}

// ---- DEVICES FOR BUILDING ----
export function useBuildingDevices(buildingId: string) {
  return useQuery({
    queryKey: ["devices", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*, device_types(name, service_interval_days)")
        .eq("building_id", buildingId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!buildingId,
  });
}

// ---- DEVICE TYPES ----
export function useDeviceTypes() {
  return useQuery({
    queryKey: ["device_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("device_types").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---- ADD DEVICE ----
export function useAddDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (device: {
      building_id: string;
      device_type_id: string;
      name: string;
      manufacturer?: string;
      model?: string;
      serial_number?: string;
      location_in_building?: string;
      installed_at?: string;
    }) => {
      // Calculate next service date from device type interval
      const { data: dt } = await supabase
        .from("device_types")
        .select("service_interval_days")
        .eq("id", device.device_type_id)
        .single();

      const nextService = new Date();
      nextService.setDate(nextService.getDate() + (dt?.service_interval_days ?? 365));

      const { data, error } = await supabase
        .from("devices")
        .insert({
          ...device,
          next_service_date: nextService.toISOString().split("T")[0],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["devices", vars.building_id] });
    },
  });
}

// ---- TASK TEMPLATES ----
export function useTaskTemplates(buildingId?: string) {
  return useQuery({
    queryKey: ["task_templates", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_templates")
        .select("*, device_types(name)")
        .or(`is_global.eq.true,building_id.eq.${buildingId}`)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!buildingId,
  });
}

// ---- BUILDING TASKS ----
export function useBuildingTasks(buildingId: string) {
  return useQuery({
    queryKey: ["tasks", "building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, profiles!tasks_assignee_id_fkey(name)")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        assigneeName: t.profiles?.name ?? "Nieprzypisany",
        isOverdue: t.deadline && new Date(t.deadline) < new Date() && t.status !== "Zamknięte",
      }));
    },
    enabled: !!buildingId,
  });
}

// ---- DEVICE SUMMARY (Faza 5) ----
// Aggregate per-type counts using the building_device_summary view.
// Falls back to client-side aggregation if the view is missing
// (e.g. migration not yet deployed).
export interface DeviceSummaryRow {
  device_type_id: string;
  device_type_name: string;
  installed_count: number;
  overdue_count: number;
  earliest_next_service: string | null;
  latest_service: string | null;
}
export function useBuildingDeviceSummary(buildingId: string) {
  return useQuery<DeviceSummaryRow[], Error>({
    queryKey: ["building_device_summary", buildingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("building_device_summary")
        .select("device_type_id, device_type_name, installed_count, overdue_count, earliest_next_service, latest_service")
        .eq("building_id", buildingId);
      if (error) {
        // Fallback: derive from devices + device_types
        const [devicesRes, typesRes] = await Promise.all([
          supabase.from("devices").select("device_type_id, next_service_date, last_service_date, status").eq("building_id", buildingId),
          supabase.from("device_types").select("id, name"),
        ]);
        if (devicesRes.error) throw devicesRes.error;
        if (typesRes.error) throw typesRes.error;
        const today = new Date().toISOString().split("T")[0];
        return (typesRes.data ?? []).map((t: any) => {
          const owned = (devicesRes.data ?? []).filter((d: any) => d.device_type_id === t.id && d.status !== "wycofane");
          return {
            device_type_id: t.id,
            device_type_name: t.name,
            installed_count: owned.length,
            overdue_count: owned.filter((d: any) => d.next_service_date && d.next_service_date <= today).length,
            earliest_next_service: owned.length ? owned.map((d: any) => d.next_service_date).filter(Boolean).sort()[0] ?? null : null,
            latest_service: owned.length ? owned.map((d: any) => d.last_service_date).filter(Boolean).sort().reverse()[0] ?? null : null,
          } as DeviceSummaryRow;
        });
      }
      return (data ?? []) as DeviceSummaryRow[];
    },
    enabled: !!buildingId,
  });
}

// ---- DEVICE REQUIREMENT RULES (Faza 5 — suggestion engine) ----
// Reads `device_requirement_rules` filtered by building_class + area.
// Codes (G_GP6, H_DN25, ...) map to device_types.name in the UI via
// DEVICE_CODE_TO_TYPE_NAME (see constants.ts).
export interface DeviceRequirementRule {
  id: string;
  building_class: string | null;
  area_min: number | null;
  area_max: number | null;
  required_device_type: string;
  quantity_formula: string | null;
  legal_basis: string | null;
  notes: string | null;
}
export function useDeviceRequirementRules(args: { buildingClass?: string | null; area?: number | null } = {}) {
  return useQuery<DeviceRequirementRule[], Error>({
    queryKey: ["device_requirement_rules", args.buildingClass ?? null, args.area ?? null],
    queryFn: async () => {
      let q = (supabase as any).from("device_requirement_rules").select("*").eq("is_active", true);
      if (args.buildingClass) q = q.eq("building_class", args.buildingClass);
      const { data, error } = await q;
      if (error) {
        // Fallback if not yet migrated
        if (error.code === "42P01") return [];
        throw error;
      }
      // Area filter is applied client-side because area_min/max may be null
      const area = args.area ?? null;
      return ((data ?? []) as DeviceRequirementRule[]).filter((r) => {
        if (area === null || area === undefined) return true;
        if (r.area_min !== null && area < Number(r.area_min)) return false;
        if (r.area_max !== null && area > Number(r.area_max)) return false;
        return true;
      });
    },
  });
}

// ---- BULK ADD DEVICES from suggestion ----
export function useBulkAddDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      building_id: string;
      device_type_id: string;
      base_name: string;
      quantity: number;
    }) => {
      const { data: dt } = await supabase
        .from("device_types")
        .select("service_interval_days")
        .eq("id", params.device_type_id)
        .single();
      const nextService = new Date();
      nextService.setDate(nextService.getDate() + (dt?.service_interval_days ?? 365));
      const nextStr = nextService.toISOString().split("T")[0];

      const rows = Array.from({ length: params.quantity }).map((_, i) => ({
        building_id: params.building_id,
        device_type_id: params.device_type_id,
        name: `${params.base_name} #${i + 1}`,
        next_service_date: nextStr,
      }));
      const { data, error } = await supabase.from("devices").insert(rows).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["devices", vars.building_id] });
      qc.invalidateQueries({ queryKey: ["building_device_summary", vars.building_id] });
    },
  });
}

// ---- BUILDING CONTACTS (Iter 6 — Książka adresowa per obiekt) ----
// Per spec PDF (str. 6): "Książka adresowa, osoby funkcyjne (z @ i tel
// + odpowiedzialność)". Tabela `building_contacts` wprowadzona w
// migracji 20260424180000_iter6_contacts_docs_seed.sql.
export interface BuildingContact {
  id: string;
  building_id: string;
  full_name: string;
  role: string;
  responsibility: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  is_emergency: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useBuildingContacts(buildingId: string) {
  return useQuery<BuildingContact[], Error>({
    queryKey: ["building_contacts", buildingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("building_contacts")
        .select("*")
        .eq("building_id", buildingId)
        .order("is_primary", { ascending: false })
        .order("is_emergency", { ascending: false })
        .order("full_name");
      if (error) {
        // graceful fallback if migration not applied yet
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as BuildingContact[];
    },
    enabled: !!buildingId,
  });
}

export interface CreateBuildingContactInput {
  building_id: string;
  full_name: string;
  role: string;
  responsibility?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  is_emergency?: boolean;
  notes?: string | null;
}

export function useCreateBuildingContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBuildingContactInput) => {
      const { data, error } = await (supabase as any)
        .from("building_contacts")
        .insert({
          building_id: input.building_id,
          full_name: input.full_name.trim(),
          role: input.role.trim(),
          responsibility: input.responsibility?.trim() || null,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          is_primary: !!input.is_primary,
          is_emergency: !!input.is_emergency,
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["building_contacts", vars.building_id] });
    },
  });
}

export function useUpdateBuildingContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, building_id, updates }: { id: string; building_id: string; updates: Partial<CreateBuildingContactInput> }) => {
      const allowed: Record<string, any> = {};
      const keys = ["full_name", "role", "responsibility", "email", "phone", "is_primary", "is_emergency", "notes"] as const;
      for (const k of keys) {
        if (k in updates) {
          const v = (updates as any)[k];
          allowed[k] = typeof v === "string" ? v.trim() || null : v;
        }
      }
      const { data, error } = await (supabase as any)
        .from("building_contacts")
        .update(allowed)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data, building_id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["building_contacts", res.building_id] });
    },
  });
}

export function useDeleteBuildingContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, building_id }: { id: string; building_id: string }) => {
      const { error } = await (supabase as any)
        .from("building_contacts")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { id, building_id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["building_contacts", res.building_id] });
    },
  });
}

// ---- DEVICE SERVICES ----
export function useDeviceServices(deviceId: string) {
  return useQuery({
    queryKey: ["device_services", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_services")
        .select("*")
        .eq("device_id", deviceId)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!deviceId,
  });
}

// ---- CREATE TASK FROM TEMPLATE ----
export function useCreateTaskFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      template: any;
      buildingId: string;
      companyId: string;
    }) => {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + params.template.sla_hours);

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: params.template.name,
          description: params.template.description ?? "",
          type: params.template.type,
          priority: params.template.priority,
          sla_hours: params.template.sla_hours,
          building_id: params.buildingId,
          company_id: params.companyId,
          deadline: deadline.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", "building", vars.buildingId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
}
