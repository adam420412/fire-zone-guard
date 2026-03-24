import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

// ---- COMPANIES ----
export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;
      return data as Tables<"companies">[];
    },
  });
}

// ---- BUILDINGS with computed safety status ----
export interface BuildingWithStatus extends Tables<"buildings"> {
  companyName?: string;
  safetyStatus?: string;
  activeTasksCount?: number;
  overdueTasksCount?: number;
}

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data: buildings, error } = await supabase
        .from("buildings")
        .select("*, companies(name)")
        .order("name");
      if (error) throw error;

      const result: BuildingWithStatus[] = [];
      for (const b of buildings ?? []) {
        // Calculate safety status via DB function
        const { data: status } = await supabase.rpc("calculate_building_safety_status", {
          _building_id: b.id,
        });

        // Count tasks
        const { count: activeCount } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("building_id", b.id)
          .neq("status", "Zamknięte");

        const { count: overdueCount } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("building_id", b.id)
          .neq("status", "Zamknięte")
          .lt("deadline", new Date().toISOString());

        result.push({
          ...b,
          companyName: (b as any).companies?.name ?? "",
          safetyStatus: status ?? "bezpieczny",
          activeTasksCount: activeCount ?? 0,
          overdueTasksCount: overdueCount ?? 0,
        });
      }
      return result;
    },
  });
}

// ---- TASKS with joins ----
export interface TaskWithDetails extends Tables<"tasks"> {
  companyName?: string;
  buildingName?: string;
  assigneeName?: string;
  isOverdue?: boolean;
  hasReminders?: boolean;
  slaData?: any;
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, companies(name), buildings(name), profiles!tasks_assignee_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Safely fetch reminder counts (table may not exist yet if migration hasn't run)
      let reminderCounts: Record<string, number> = {};
      try {
        const { data: reminders } = await supabase
          .from("task_reminders")
          .select("task_id")
          .not("task_id", "is", null);
        if (reminders) {
          reminders.forEach((r: any) => {
            if (r.task_id) reminderCounts[r.task_id] = (reminderCounts[r.task_id] ?? 0) + 1;
          });
        }
      } catch {
        // task_reminders table not yet migrated — safe to ignore
      }

      return (data ?? []).map((t: any) => ({
        ...t,
        companyName: t.companies?.name ?? "",
        buildingName: t.buildings?.name ?? "",
        assigneeName: t.profiles?.name ?? "Nieprzypisany",
        isOverdue: t.deadline && new Date(t.deadline) < new Date() && t.status !== "Zamknięte",
        hasReminders: (reminderCounts[t.id] ?? 0) > 0,
      })) as TaskWithDetails[];
    },
  });
}

// ---- CREATE TASK ----
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: TablesInsert<"tasks">) => {
      const { data, error } = await supabase.from("tasks").insert(task).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---- UPDATE TASK ----
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Tables<"tasks">>) => {
      const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---- DASHBOARD STATS ----
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { count: totalCompanies } = await supabase.from("companies").select("*", { count: "exact", head: true });
      const { count: totalBuildings } = await supabase.from("buildings").select("*", { count: "exact", head: true });
      const { count: activeTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "Zamknięte");
      const { count: criticalTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("priority", "krytyczny").neq("status", "Zamknięte");
      const { count: overdueTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "Zamknięte").lt("deadline", new Date().toISOString());

      // Get all tasks for SLA calc
      const { data: allTasks } = await supabase.from("tasks").select("sla_hours, created_at, closed_at, first_response_at, status");
      let slaSum = 0;
      let slaCount = 0;
      for (const t of allTasks ?? []) {
        if (t.closed_at) {
          const resolution = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
          const slaPct = Math.max(0, Math.min(100, Math.round((1 - Math.max(0, resolution - t.sla_hours) / t.sla_hours) * 100)));
          slaSum += slaPct;
          slaCount++;
        }
      }

      const { count: safeBuildings } = await supabase.from("buildings").select("*", { count: "exact", head: true });

      return {
        totalCompanies: totalCompanies ?? 0,
        totalBuildings: totalBuildings ?? 0,
        activeTasks: activeTasks ?? 0,
        criticalTasks: criticalTasks ?? 0,
        overdueTasks: overdueTasks ?? 0,
        avgSLA: slaCount > 0 ? Math.round(slaSum / slaCount) : 95,
        safeBuildings: safeBuildings ?? 0,
      };
    },
  });
}

// ---- PROFILES (for assignee picker) ----
export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("name");
      if (error) throw error;
      return data as Tables<"profiles">[];
    },
  });
}

// ---- TASK HISTORY ----
export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: ["task_history", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_history")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });
}

// ---- COMPANIES WITH STATS ----
export interface CompanyWithStats extends Tables<"companies"> {
  buildingsCount: number;
  activeTasksCount: number;
  sla: number;
}

export function useCompaniesWithStats() {
  return useQuery({
    queryKey: ["companies_stats"],
    queryFn: async () => {
      const { data: companies, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;

      const result: CompanyWithStats[] = [];
      for (const c of companies ?? []) {
        const { count: bCount } = await supabase.from("buildings").select("*", { count: "exact", head: true }).eq("company_id", c.id);
        const { count: tCount } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("company_id", c.id).neq("status", "Zamknięte");

        // SLA for company
        const { data: tasks } = await supabase.from("tasks").select("sla_hours, created_at, closed_at").eq("company_id", c.id);
        let slaSum = 0, slaCount = 0;
        for (const t of tasks ?? []) {
          if (t.closed_at) {
            const hours = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
            slaSum += Math.max(0, Math.min(100, Math.round((1 - Math.max(0, hours - t.sla_hours) / t.sla_hours) * 100)));
            slaCount++;
          }
        }

        result.push({
          ...c,
          buildingsCount: bCount ?? 0,
          activeTasksCount: tCount ?? 0,
          sla: slaCount > 0 ? Math.round(slaSum / slaCount) : 95,
        });
      }
      return result;
    },
  });
}

// ==== SUBTASKS ====
export interface SubtaskWithAssignee extends Tables<"subtasks"> {
  assigneeName?: string;
}

export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtasks")
        .select("*, profiles!subtasks_assignee_id_fkey(name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        assigneeName: s.profiles?.name ?? "Nieprzypisany",
      })) as SubtaskWithAssignee[];
    },
    enabled: !!taskId,
  });
}

export function useCreateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subtask: TablesInsert<"subtasks">) => {
      const { data, error } = await supabase.from("subtasks").insert(subtask).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["subtasks", variables.task_id] });
    },
  });
}

export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Tables<"subtasks">>) => {
      const { data, error } = await supabase.from("subtasks").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["subtasks", data.task_id] });
    },
  });
}

export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("subtasks").delete().eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.task_id) {
        qc.invalidateQueries({ queryKey: ["subtasks", data.task_id] });
      }
    },
  });
}

// ==== TASK REMINDERS ====
export function useTaskReminders(taskId: string) {
  return useQuery({
    queryKey: ["task_reminders", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_reminders")
        .select("*")
        .eq("task_id", taskId)
        .order("remind_at", { ascending: true });
      if (error) throw error;
      return data as Tables<"task_reminders">[];
    },
    enabled: !!taskId,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reminder: TablesInsert<"task_reminders">) => {
      const { data, error } = await supabase.from("task_reminders").insert(reminder).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.task_id) qc.invalidateQueries({ queryKey: ["task_reminders", data.task_id] });
    },
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("task_reminders").delete().eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.task_id) qc.invalidateQueries({ queryKey: ["task_reminders", data.task_id] });
    },
  });
}
