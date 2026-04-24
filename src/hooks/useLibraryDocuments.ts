// =============================================================================
// useLibraryDocuments — fetches library_documents via the FTS-aware RPC.
//
// `q` is forwarded as a plainto_tsquery (server side), `buildingId` scopes to
// that building OR global (NULL building_id), `category` is an exact match.
// Empty string for `q` is treated as "no search, list all by created_at".
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LibraryDoc {
  id: string;
  title: string;
  category: "law" | "guidelines" | "templates" | "internal";
  description: string | null;
  source: string | null;
  url: string | null;
  badge: string | null;
  building_id: string | null;
  rank: number;
}

interface Args {
  q?: string;
  buildingId?: string | null;
  category?: string | null;
  limit?: number;
}

export function useLibraryDocuments({ q = "", buildingId = null, category = null, limit = 50 }: Args = {}) {
  return useQuery<LibraryDoc[], Error>({
    queryKey: ["library_documents", q.trim(), buildingId, category, limit],
    queryFn: async () => {
      // Cast to any: search_library_documents lives in a yet-uncodegen'd migration.
      const { data, error } = await (supabase.rpc as any)("search_library_documents", {
        q: q.trim(),
        p_building_id: buildingId,
        p_category: category,
        p_limit: limit,
      });
      if (error) {
        // Fallback if migration hasn't been deployed yet — just return empty
        // so the UI keeps showing the seed/curated list rather than a hard error.
        if (error.code === "PGRST202" || error.code === "42883") return [];
        throw error;
      }
      return (data ?? []) as LibraryDoc[];
    },
    staleTime: 30_000,
  });
}
