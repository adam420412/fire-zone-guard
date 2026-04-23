// =============================================================================
// useLibraryRag — React Query mutation that calls the library-rag Edge Function.
// Returns { answer, citations } shaped by the function's response.
// =============================================================================
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RagCitation {
  index: number;
  doc_title: string;
  doc_source: string | null;
  doc_url: string | null;
  similarity: number;
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
}

export function useLibraryRag() {
  return useMutation<RagAnswer, Error, string>({
    mutationFn: async (question: string) => {
      const { data, error } = await supabase.functions.invoke("library-rag", {
        body: { question },
      });
      if (error) throw new Error(error.message ?? "library-rag invocation failed");
      const payload = (data ?? {}) as Partial<RagAnswer> & { error?: string };
      if (payload.error) throw new Error(payload.error);
      return {
        answer: payload.answer ?? "",
        citations: payload.citations ?? [],
      };
    },
  });
}
