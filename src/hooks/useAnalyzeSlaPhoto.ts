// =============================================================================
// useAnalyzeSlaPhoto — wywołuje edge function analyze-sla-photo (gpt-4o vision).
//
// Użycie:
//   const analyze = useAnalyzeSlaPhoto();
//   analyze.mutate({ ticket_id: created.id });   // fire-and-forget po zgłoszeniu
//
// Po sukcesie invalidate'uje cache sla_tickets żeby panel operatora i klienta
// natychmiast pokazał świeże ai_summary / ai_severity_suggestion.
// =============================================================================
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TICKETS_KEY } from "./useSlaTickets";

export interface SlaPhotoAnalysisCategory {
  device_type: string | null;
  issue: string | null;
  visible_damage: boolean;
  recommended_action: string | null;
  confidence?: "high" | "medium" | "low";
}

export interface SlaPhotoAnalysisResult {
  summary: string;
  category: SlaPhotoAnalysisCategory;
  severity: "low" | "normal" | "high" | "critical";
  confidence: "high" | "medium" | "low";
  updated: boolean;
  reason?: string;
}

export interface AnalyzeSlaPhotoInput {
  ticket_id: string;
  photos?: string[];
}

export function useAnalyzeSlaPhoto() {
  const qc = useQueryClient();
  return useMutation<SlaPhotoAnalysisResult, Error, AnalyzeSlaPhotoInput>({
    mutationFn: async ({ ticket_id, photos }) => {
      const { data, error } = await supabase.functions.invoke("analyze-sla-photo", {
        body: { ticket_id, photos },
      });
      if (error) throw new Error(error.message ?? "analyze-sla-photo invocation failed");
      const payload = (data ?? {}) as Partial<SlaPhotoAnalysisResult> & { error?: string };
      if (payload.error) throw new Error(payload.error);
      return {
        summary:    payload.summary ?? "",
        category:   payload.category ?? {
          device_type: null, issue: null, visible_damage: false, recommended_action: null,
        },
        severity:   payload.severity ?? "normal",
        confidence: payload.confidence ?? "medium",
        updated:    payload.updated ?? false,
        reason:     payload.reason,
      };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TICKETS_KEY });
      qc.invalidateQueries({ queryKey: [...TICKETS_KEY, "detail", vars.ticket_id] });
    },
  });
}
