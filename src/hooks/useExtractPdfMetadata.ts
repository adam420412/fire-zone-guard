// =============================================================================
// useExtractPdfMetadata — calls extract-pdf-metadata Edge Function.
// Input is a building_documents.id; output is the structured AI extraction.
// =============================================================================
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExtractedDevice {
  type: string;
  quantity: number;
  location?: string | null;
  notes?: string | null;
}

export interface ExtractPdfResult {
  summary: string;
  devices: ExtractedDevice[];
  next_inspection_due: string | null;
  inspector: string | null;
  confidence: "high" | "medium" | "low";
}

export function useExtractPdfMetadata() {
  return useMutation<ExtractPdfResult, Error, string>({
    mutationFn: async (document_id: string) => {
      const { data, error } = await supabase.functions.invoke("extract-pdf-metadata", {
        body: { document_id },
      });
      if (error) throw new Error(error.message ?? "extract-pdf-metadata invocation failed");
      const payload = (data ?? {}) as Partial<ExtractPdfResult> & { error?: string };
      if (payload.error) throw new Error(payload.error);
      return {
        summary:             payload.summary ?? "",
        devices:             payload.devices ?? [],
        next_inspection_due: payload.next_inspection_due ?? null,
        inspector:           payload.inspector ?? null,
        confidence:          payload.confidence ?? "medium",
      };
    },
  });
}
