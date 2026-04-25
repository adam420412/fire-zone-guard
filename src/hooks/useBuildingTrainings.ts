// =============================================================================
// useBuildingTrainings — CRUD szkoleń PPOŻ przypisanych do obiektów + uczestnicy.
// Tabele: building_trainings, building_training_participants
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TRAINING_TYPE_LABELS: Record<string, string> = {
  ogolne_ppoz:         "Ogólne PPOŻ (wszyscy pracownicy)",
  obslugowo_uzytkowe:  "Obsługowo-użytkowe (wyznaczeni)",
  probna_ewakuacja:    "Próbna ewakuacja",
  medyczne:            "Pierwsza pomoc / medyczne",
  inne:                "Inne",
};

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  zaplanowane: "Zaplanowane",
  w_trakcie:   "W trakcie",
  zakonczone:  "Zakończone",
  odwolane:    "Odwołane",
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  zaplanowany:      "Zaplanowany",
  obecny:           "Obecny",
  nieobecny:        "Nieobecny",
  usprawiedliwiony: "Usprawiedliwiony",
};

export interface BuildingTraining {
  id: string;
  building_id: string;
  company_id: string | null;
  type: keyof typeof TRAINING_TYPE_LABELS;
  title: string;
  description: string | null;
  trainer_name: string | null;
  trainer_user_id: string | null;
  scheduled_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  status: keyof typeof TRAINING_STATUS_LABELS;
  recurrence_months: number | null;
  next_due_date: string | null;
  certificate_url: string | null;
  protocol_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  participants_count?: number;
}

export interface TrainingParticipant {
  id: string;
  training_id: string;
  employee_id: string | null;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  attendance_status: keyof typeof ATTENDANCE_LABELS;
  passed: boolean | null;
  score: number | null;
  certificate_url: string | null;
  signed_at: string | null;
  signature_url: string | null;
  notes: string | null;
  created_at: string;
  // joined
  employee?: { first_name: string | null; last_name: string | null; email: string | null } | null;
  profile?: { name: string | null; email: string | null } | null;
}

// ---------- LIST trainings per building --------------------------------------
export function useBuildingTrainings(buildingId: string | null) {
  return useQuery({
    queryKey: ["building_trainings", buildingId],
    enabled: !!buildingId,
    queryFn: async (): Promise<BuildingTraining[]> => {
      if (!buildingId) return [];
      const { data, error } = await supabase
        .from("building_trainings" as any)
        .select("*")
        .eq("building_id", buildingId)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as any[] as BuildingTraining[];
      if (list.length === 0) return [];

      // count participants
      const ids = list.map((t) => t.id);
      const { data: parts } = await supabase
        .from("building_training_participants" as any)
        .select("training_id")
        .in("training_id", ids);
      const counts: Record<string, number> = {};
      ((parts ?? []) as any[]).forEach((p: any) => {
        counts[p.training_id] = (counts[p.training_id] ?? 0) + 1;
      });
      return list.map((t) => ({ ...t, participants_count: counts[t.id] ?? 0 }));
    },
  });
}

// ---------- Participants of a training ---------------------------------------
export function useTrainingParticipants(trainingId: string | null) {
  return useQuery({
    queryKey: ["training_participants", trainingId],
    enabled: !!trainingId,
    queryFn: async (): Promise<TrainingParticipant[]> => {
      if (!trainingId) return [];
      const { data, error } = await supabase
        .from("building_training_participants" as any)
        .select("*")
        .eq("training_id", trainingId)
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as any[] as TrainingParticipant[];
      if (rows.length === 0) return rows;

      const empIds = rows.map((r) => r.employee_id).filter(Boolean) as string[];
      const userIds = rows.map((r) => r.user_id).filter(Boolean) as string[];

      let employees: Record<string, any> = {};
      let profiles: Record<string, any> = {};

      if (empIds.length) {
        const { data: emp } = await supabase
          .from("employee_development_plans" as any)
          .select("id, first_name, last_name, email")
          .in("id", empIds);
        ((emp ?? []) as any[]).forEach((e: any) => (employees[e.id] = e));
      }
      if (userIds.length) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", userIds);
        ((prof ?? []) as any[]).forEach((p: any) => (profiles[p.id] = p));
      }

      return rows.map((r) => ({
        ...r,
        employee: r.employee_id ? employees[r.employee_id] ?? null : null,
        profile: r.user_id ? profiles[r.user_id] ?? null : null,
      }));
    },
  });
}

// ---------- Mutations --------------------------------------------------------
export function useCreateTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BuildingTraining>) => {
      const { data, error } = await supabase
        .from("building_trainings" as any)
        .insert([payload as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["building_trainings", vars.building_id] });
    },
  });
}

export function useUpdateTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<BuildingTraining> }) => {
      const { data, error } = await supabase
        .from("building_trainings" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["building_trainings", data?.building_id] });
    },
  });
}

export function useDeleteTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, building_id }: { id: string; building_id: string }) => {
      const { error } = await supabase.from("building_trainings" as any).delete().eq("id", id);
      if (error) throw error;
      return { id, building_id };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["building_trainings", data.building_id] });
    },
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TrainingParticipant>) => {
      const { data, error } = await supabase
        .from("building_training_participants" as any)
        .insert([payload as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["training_participants", vars.training_id] });
      qc.invalidateQueries({ queryKey: ["building_trainings"] });
    },
  });
}

export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TrainingParticipant> }) => {
      const { data, error } = await supabase
        .from("building_training_participants" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["training_participants", data?.training_id] });
    },
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, training_id }: { id: string; training_id: string }) => {
      const { error } = await supabase
        .from("building_training_participants" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { id, training_id };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["training_participants", data.training_id] });
      qc.invalidateQueries({ queryKey: ["building_trainings"] });
    },
  });
}

// ---------- Attendance matrix per building (all trainings × participants) ----
export interface AttendanceRow {
  participantKey: string;       // employee_id | user_id | guest_email | guest_name
  name: string;
  email: string | null;
  kind: "employee" | "user" | "guest";
  total: number;                // szkolenia, na które był zapisany
  present: number;              // obecny
  excused: number;              // usprawiedliwiony
  absent: number;               // nieobecny
  planned: number;              // zaplanowany (jeszcze nie odbyte)
  attendancePct: number;        // present / (present + absent + excused) * 100
}

export function useBuildingAttendance(
  buildingId: string | null,
  typeFilter: string | "all" = "all",
) {
  return useQuery({
    queryKey: ["building_attendance", buildingId, typeFilter],
    enabled: !!buildingId,
    queryFn: async (): Promise<AttendanceRow[]> => {
      if (!buildingId) return [];

      // 1. szkolenia w obiekcie (z opcjonalnym filtrem typu)
      let q = supabase
        .from("building_trainings" as any)
        .select("id, type")
        .eq("building_id", buildingId);
      if (typeFilter !== "all") q = q.eq("type", typeFilter);
      const { data: trainings, error: tErr } = await q;
      if (tErr) throw tErr;
      const trainingIds = ((trainings ?? []) as any[]).map((t) => t.id);
      if (trainingIds.length === 0) return [];

      // 2. uczestnicy tych szkoleń
      const { data: parts, error: pErr } = await supabase
        .from("building_training_participants" as any)
        .select("training_id, employee_id, user_id, guest_name, guest_email, attendance_status")
        .in("training_id", trainingIds);
      if (pErr) throw pErr;
      const rows = (parts ?? []) as any[];

      // 3. dociągnij dane pracowników/profili
      const empIds = Array.from(new Set(rows.map((r) => r.employee_id).filter(Boolean))) as string[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      const employees: Record<string, any> = {};
      const profiles: Record<string, any> = {};
      if (empIds.length) {
        const { data } = await supabase
          .from("employee_development_plans" as any)
          .select("id, first_name, last_name, email")
          .in("id", empIds);
        ((data ?? []) as any[]).forEach((e: any) => (employees[e.id] = e));
      }
      if (userIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", userIds);
        ((data ?? []) as any[]).forEach((p: any) => (profiles[p.id] = p));
      }

      // 4. agreguj per uczestnik
      const map = new Map<string, AttendanceRow>();
      for (const r of rows) {
        let key: string;
        let name = "—";
        let email: string | null = null;
        let kind: AttendanceRow["kind"] = "guest";
        if (r.employee_id) {
          key = `emp:${r.employee_id}`;
          const e = employees[r.employee_id];
          name = e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email || "—" : "—";
          email = e?.email ?? null;
          kind = "employee";
        } else if (r.user_id) {
          key = `usr:${r.user_id}`;
          const p = profiles[r.user_id];
          name = p?.name ?? p?.email ?? "—";
          email = p?.email ?? null;
          kind = "user";
        } else {
          key = `g:${(r.guest_email ?? r.guest_name ?? "").toLowerCase()}`;
          name = r.guest_name ?? r.guest_email ?? "Gość";
          email = r.guest_email ?? null;
        }
        const cur =
          map.get(key) ??
          { participantKey: key, name, email, kind, total: 0, present: 0, excused: 0, absent: 0, planned: 0, attendancePct: 0 };
        cur.total += 1;
        if (r.attendance_status === "obecny") cur.present += 1;
        else if (r.attendance_status === "nieobecny") cur.absent += 1;
        else if (r.attendance_status === "usprawiedliwiony") cur.excused += 1;
        else cur.planned += 1;
        map.set(key, cur);
      }

      const list = Array.from(map.values()).map((r) => {
        const denom = r.present + r.absent + r.excused;
        r.attendancePct = denom > 0 ? Math.round((r.present / denom) * 100) : 0;
        return r;
      });
      list.sort((a, b) => b.attendancePct - a.attendancePct || a.name.localeCompare(b.name));
      return list;
    },
  });
}

// ---------- Helper: list candidate employees of a company --------------------
export interface EmployeeCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_id: string | null;
}
export function useCompanyEmployees(companyId: string | null) {
  return useQuery({
    queryKey: ["company_employees", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<EmployeeCandidate[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("employee_development_plans" as any)
        .select("id, first_name, last_name, email, user_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("last_name", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
