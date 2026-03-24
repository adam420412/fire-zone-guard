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
