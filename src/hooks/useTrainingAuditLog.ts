// =============================================================================
// useTrainingAuditLog — historia zmian szkolenia i jego uczestników.
// Czyta z tabeli `training_audit_log` (zapisy generowane przez triggery DB).
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TrainingAuditEntry {
  id: string;
  training_id: string;
  participant_id: string | null;
  action: "created" | "updated" | "deleted";
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export const FIELD_LABELS: Record<string, string> = {
  status: "Status szkolenia",
  scheduled_at: "Data zaplanowana",
  completed_at: "Data zakończenia",
  title: "Tytuł",
  trainer_name: "Prowadzący",
  type: "Typ szkolenia",
  trainer_signed_at: "Podpis prowadzącego",
  attendance_status: "Frekwencja",
  passed: "Zaliczenie",
  score: "Wynik",
  signed_at: "Podpis uczestnika",
  certificate_url: "Certyfikat",
  participant: "Uczestnik",
};

export function useTrainingAuditLog(trainingId: string | null) {
  return useQuery({
    queryKey: ["training-audit-log", trainingId],
    enabled: !!trainingId,
    queryFn: async (): Promise<TrainingAuditEntry[]> => {
      const { data, error } = await supabase
        .from("training_audit_log" as any)
        .select("*")
        .eq("training_id", trainingId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as TrainingAuditEntry[];
    },
  });
}
