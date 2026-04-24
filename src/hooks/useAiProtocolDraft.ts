// =============================================================================
// useAiProtocolDraft — calls the ai-protocol-draft Edge Function.
// Returns { notes, overall_result, suggestions } shaped by the function.
// =============================================================================
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AiProtocolDraft {
  notes: string;
  overall_result: string;
  suggestions: string[];
}

export function useAiProtocolDraft() {
  return useMutation<AiProtocolDraft, Error, string>({
    mutationFn: async (protocol_id: string) => {
      const { data, error } = await supabase.functions.invoke("ai-protocol-draft", {
        body: { protocol_id },
      });
      if (error) throw new Error(error.message ?? "ai-protocol-draft invocation failed");
      const payload = (data ?? {}) as Partial<AiProtocolDraft> & { error?: string };
      if (payload.error) throw new Error(payload.error);
      return {
        notes:           payload.notes ?? "",
        overall_result:  payload.overall_result ?? "do oceny",
        suggestions:     payload.suggestions ?? [],
      };
    },
  });
}
