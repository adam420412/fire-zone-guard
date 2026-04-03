import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---- CONTACTS ----
export function useContacts(companyId?: string) {
  return useQuery({
    queryKey: ["contacts", companyId],
    queryFn: async () => {
      let query = supabase.from("contacts").select("*, companies(name)").order("name");
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        ...c,
        company_name: c.companies?.name ?? "Brak firmy",
      }));
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contact: any) => {
      const { data, error } = await supabase.from("contacts").insert(contact).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("contacts").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

// ---- SERVICES CATALOG ----
export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("category").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---- QUOTES ----
export function useQuotes(companyId?: string) {
  return useQuery({
    queryKey: ["quotes", companyId],
    queryFn: async () => {
      let query = supabase.from("quotes").select("*, companies(name), contacts(name)").order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((q: any) => ({
        ...q,
        company_name: q.companies?.name ?? "",
        contact_name: q.contacts?.name ?? "",
      }));
    },
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quote: any) => {
      const { data, error } = await supabase.from("quotes").insert(quote).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useQuoteItems(quoteId: string) {
  return useQuery({
    queryKey: ["quote_items", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateQuoteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await supabase.from("quote_items").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["quote_items"] }),
  });
}

export function useDeleteQuoteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quote_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_items"] }),
  });
}
