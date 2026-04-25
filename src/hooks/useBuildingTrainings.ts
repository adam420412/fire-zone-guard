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
