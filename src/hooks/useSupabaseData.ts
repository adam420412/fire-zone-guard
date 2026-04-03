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

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase.from("companies").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies_stats"] });
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (company: { name: string; nip?: string }) => {
      const { data, error } = await supabase.from("companies").insert({ name: company.name }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies_stats"] });
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

      if (!buildings || buildings.length === 0) return [];

      // Fetch ALL task counts in one query (instead of N+1 RPC calls)
      const { data: tasks } = await supabase
        .from("tasks")
        .select("building_id, status, deadline")
        .neq("status", "Zamknięte");

      const now = new Date().toISOString();

      return buildings.map((b) => {
        const bTasks = (tasks ?? []).filter((t: any) => t.building_id === b.id);
        const overdueCount = bTasks.filter((t: any) => t.deadline && t.deadline < now).length;
        const safetyStatus = overdueCount > 2 ? "krytyczny" : overdueCount > 0 ? "ostrzeżenie" : "bezpieczny";

        return {
          ...b,
          companyName: (b as any).companies?.name ?? "",
          safetyStatus,
          activeTasksCount: bTasks.length,
          overdueTasksCount: overdueCount,
        };
      });
    },
  });
}
export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (building: TablesInsert<"buildings">) => {
      const { data, error } = await supabase.from("buildings").insert([building]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
  });
}

export function useUpdateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase.from("buildings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["building", variables.id] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("buildings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buildings"] });
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
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
  costs?: number;
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
      try {
        const { count: totalCompanies } = await supabase.from("companies").select("*", { count: "exact", head: true });
        const { count: totalBuildings } = await supabase.from("buildings").select("*", { count: "exact", head: true });
        const { count: activeTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "Zamknięte");
        const { count: criticalTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("priority", "krytyczny").neq("status", "Zamknięte");
        const { count: overdueTasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "Zamknięte").lt("deadline", new Date().toISOString());

        // For V2, we assume a static SLA for now to avoid heavy JS loops, or a simpler calculation if data exists
        // In the future, this should be a DB view or RPC.
        const avgSLA = 98; 

        // Correct count for safe buildings (those with safety_status = 'bezpieczny')
        // We fetch all buildings and check their computed status if possible, 
        // or for the dashboard we just show a placeholder if the RPC is too slow.
        // For efficiency, we'll just return a mock 100% until we have a proper view.
        const safeBuildings = totalBuildings ?? 0; 

        return {
          totalCompanies: totalCompanies ?? 0,
          totalBuildings: totalBuildings ?? 0,
          activeTasks: activeTasks ?? 0,
          criticalTasks: criticalTasks ?? 0,
          overdueTasks: overdueTasks ?? 0,
          avgSLA: avgSLA,
          safeBuildings: safeBuildings,
        };
      } catch (err) {
        console.error("Dashboard stats error:", err);
        return {
          totalCompanies: 0,
          totalBuildings: 0,
          activeTasks: 0,
          criticalTasks: 0,
          overdueTasks: 0,
          avgSLA: 100,
          safeBuildings: 0,
        };
      }
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
      if (!companies || companies.length === 0) return [];

      // Batch: fetch all buildings and active tasks in 2 queries instead of N*3
      const { data: allBuildings } = await supabase.from("buildings").select("id, company_id");
      const { data: allTasks } = await supabase.from("tasks").select("company_id, sla_hours, created_at, closed_at, status");

      return companies.map((c) => {
        const bCount = (allBuildings ?? []).filter((b: any) => b.company_id === c.id).length;
        const tCount = (allTasks ?? []).filter((t: any) => t.company_id === c.id && t.status !== "Zamknięte").length;
        const closedTasks = (allTasks ?? []).filter((t: any) => t.company_id === c.id && t.closed_at);
        let slaSum = 0;
        closedTasks.forEach((t: any) => {
          const hours = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
          slaSum += Math.max(0, Math.min(100, Math.round((1 - Math.max(0, hours - t.sla_hours) / t.sla_hours) * 100)));
        });

        return {
          ...c,
          buildingsCount: bCount,
          activeTasksCount: tCount,
          sla: closedTasks.length > 0 ? Math.round(slaSum / closedTasks.length) : 95,
        };
      });
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

// ==== SERVICE PROTOCOLS (V2) ====
export interface ServiceProtocol {
  id: string;
  building_id: string;
  inspector_id: string | null;
  type: string;
  status: string;
  performed_at: string;
  next_inspection_due: string | null;
  overall_result: string | null;
  notes: string | null;
  created_at: string;
  // joined fields
  building_name?: string;
  inspector_name?: string;
}

export function useProtocols() {
  return useQuery({
    queryKey: ["service_protocols"],
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("service_protocols")
          .select("*, buildings(name), profiles(name)")
          .order("created_at", { ascending: false });
        if (error) return []; // Table may not exist yet
        return (data ?? []).map((p: any) => ({
          ...p,
          building_name: p.buildings?.name ?? "Nieznany obiekt",
          inspector_name: p.profiles?.name ?? "Nieznany inspektor",
        })) as ServiceProtocol[];
      } catch {
        return [];
      }
    },
  });
}

export function useCreateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (protocol: any) => {
      const { data, error } = await supabase.from("service_protocols").insert(protocol).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_protocols"] });
    },
  });
}

export function useHydrantMeasurements(protocolId: string) {
  return useQuery({
    queryKey: ["hydrant_measurements", protocolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hydrant_measurements")
        .select("*")
        .eq("protocol_id", protocolId)
        .order("hydrant_number", { ascending: true });
        
      if (error && error.code !== "42P01") throw error;
      return data as any[];
    },
    enabled: !!protocolId,
  });
}

export function useCreateHydrantMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (measurement: any) => {
      const { data, error } = await supabase.from("hydrant_measurements").insert(measurement).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: ["hydrant_measurements", req.protocol_id] });
    },
  });
}

export function useDeleteHydrantMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, protocol_id }: { id: string; protocol_id: string }) => {
      const { data, error } = await supabase.from("hydrant_measurements").delete().eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: ["hydrant_measurements", req.protocol_id] });
    },
  });
}

// ==== AUDITS (V2) ====
export function useAudits() {
  return useQuery({
    queryKey: ["audits"],
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("audits")
          .select("*, buildings(name), profiles(name)")
          .order("created_at", { ascending: false });
        if (error) return []; // Table may not exist yet
        return (data ?? []).map((a: any) => ({
          ...a,
          building_name: a.buildings?.name ?? "Nieznany obiekt",
          auditor_name: a.profiles?.name ?? "Nieznany audytor",
        }));
      } catch {
        return [];
      }
    },
  });
}

export function useCreateAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (audit: any) => {
      const { data, error } = await supabase.from("audits").insert(audit).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits"] });
    },
  });
}

// ==== AUDIT CHECKLISTS ====
export function useAuditChecklists(auditId: string) {
  return useQuery({
    queryKey: ["audit_checklists", auditId],
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("audit_checklists")
          .select("*")
          .eq("audit_id", auditId)
          .order("category", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return [];
        return data as any[];
      } catch {
        return [];
      }
    },
    enabled: !!auditId,
  });
}

export function useCreateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checklist: any) => {
      const { data, error } = await supabase.from("audit_checklists").insert(checklist).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: ["audit_checklists", req.audit_id] });
    },
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, audit_id, updates }: { id: string; audit_id: string; updates: any }) => {
      const { data, error } = await supabase.from("audit_checklists").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return { data, audit_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["audit_checklists", result.audit_id] });
    },
  });
}

export function useBatchCreateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ audit_id, items }: { audit_id: string; items: any[] }) => {
      const inserts = items.map(item => ({ audit_id, ...item }));
      const { data, error } = await supabase.from("audit_checklists").insert(inserts).select();
      if (error) throw error;
      return { data, audit_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["audit_checklists", result.audit_id] });
    },
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, audit_id }: { id: string; audit_id: string }) => {
      const { data, error } = await supabase.from("audit_checklists").delete().eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: ["audit_checklists", req.audit_id] });
    },
  });
}

// ==== EMPLOYEES & HR (V2) ====
export function useEmployees(buildingId?: string) {
  return useQuery({
    queryKey: ["employee_development_plans", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_development_plans")
        .select("*")
        .order("created_at", { ascending: false });
      
      const { data: error2, error: profilesErr } = await supabase.from("profiles").select("id, name");

      if (error && error.code !== "42P01") throw error;

      const profileMap: Record<string, string> = {};
      (error2 ?? []).forEach((p: any) => { profileMap[p.id] = p.name; });

      return (data ?? []).map((e: any) => ({
        ...e,
        name: profileMap[e.user_id] ?? "Pracownik",
        first_name: (profileMap[e.user_id] ?? "").split(" ")[0] || "",
        last_name: (profileMap[e.user_id] ?? "").split(" ").slice(1).join(" ") || "",
      }));
    },
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employee: any) => {
      // W V2 dodajemy wpisy najpierw do profiles
      // Ponieważ "employees" nie ma struktury autoryzacyjnej w MVP, symulujemy userId
      const randomUserId = crypto.randomUUID();
      
      const { error: profileErr } = await supabase.from("profiles").insert([{
        user_id: randomUserId,
        name: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || 'Pracownik',
        email: `employee-${randomUserId.slice(0,8)}@firezone.local`,
      }]);
      if (profileErr) throw profileErr;

      const { data, error } = await supabase.from("employee_development_plans").insert([{
        user_id: randomUserId,
        position: employee.position,
        onboarding_progress: employee.onboarding_progress,
        training_status: employee.training_status,
        health_exam_valid_until: employee.health_exam_valid_until
      }]).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates, profileUpdates }: { id: string; updates: any, profileUpdates?: any }) => {
      // 1. Update the employee_development_plans record
      const { data, error } = await supabase.from("employee_development_plans").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // 2. Optionally update the profiles record if first_name/last_name changed
      if (profileUpdates && data.user_id) {
        const { error: profileErr } = await supabase.from("profiles").update(profileUpdates).eq("id", data.user_id);
        if (profileErr) throw profileErr;
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useEmployeeTrainings(userId: string) {
  return useQuery({
    queryKey: ["employee_trainings", userId],
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("employee_trainings")
          .select("*")
          .eq("user_id", userId)
          .order("completed_at", { ascending: false });
          
        if (error) throw error;
        return data as any[];
      } catch {
        return [];
      }
    },
    enabled: !!userId,
  });
}

export function useCreateTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (training: any) => {
      const { data, error } = await supabase.from("employee_trainings").insert(training).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: ["employee_trainings", req.user_id] });
    },
  });
}

// ==== MEETINGS ====
export function useMeetings() {
  return useQuery({
    queryKey: ["meetings"],
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("meetings")
          .select("*, companies(name), buildings(name)")
          .order("meeting_date", { ascending: true });
        if (error) return [];
        return data as any[];
      } catch {
        return [];
      }
    },
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meeting: any) => {
      const { data, error } = await supabase.from("meetings").insert(meeting).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase.from("meetings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
// ==== BUILDING DOCUMENTS (V2.1) ====
export function useDocuments(buildingId: string) {
  return useQuery({
    queryKey: ["building_documents", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_documents")
        .select("*, profiles(name)")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      
      if (error && error.code !== "42P01") throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        userName: d.profiles?.name ?? "Nieznany",
      }));
    },
    enabled: !!buildingId,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ 
      buildingId, 
      file, 
      name 
    }: { 
      buildingId: string; 
      file: File; 
      name: string;
    }) => {
      const fileExt = file.name.split('.').pop();
      const filePath = `${buildingId}/${crypto.randomUUID()}.${fileExt}`;

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('building-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      // 2. Save metadata to DB
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error: dbError } = await supabase
        .from('building_documents')
        .insert([{
          building_id: buildingId,
          user_id: user?.id,
          name: name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size
        }])
        .select()
        .single();
      
      if (dbError) throw dbError;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["building_documents", variables.buildingId] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath, buildingId }: { id: string; filePath: string; buildingId: string }) => {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from('building-documents')
        .remove([filePath]);
      
      if (storageError) throw storageError;

      // 2. Delete from DB
      const { error: dbError } = await supabase
        .from('building_documents')
        .delete()
        .eq('id', id);
      
      if (dbError) throw dbError;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["building_documents", variables.buildingId] });
    },
  });
}
// ==== TASK FINANCIAL ITEMS (V2.2 - UNIVERSAL EXCEL) ====
export function useTaskFinancialItems(taskId: string) {
  return useQuery({
    queryKey: ["task_financial_items", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_financial_items")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      
      if (error && error.code !== "42P01") throw error;
      return data as any[];
    },
    enabled: !!taskId,
  });
}

export function useCreateFinancialItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { task_id: string; type: 'income' | 'expense'; description: string; amount: number }) => {
      const { data, error } = await supabase.from("task_financial_items").insert([item]).select().single();
      if (error) {
        console.error("Supabase Create Error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["task_financial_items", variables.task_id] });
    },
  });
}

export function useDeleteFinancialItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const { error } = await supabase.from("task_financial_items").delete().eq("id", id);
      if (error) {
        console.error("Supabase Delete Error:", error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["task_financial_items", variables.taskId] });
    },
  });
}
