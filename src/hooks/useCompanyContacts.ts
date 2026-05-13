import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyContact {
  id: string;
  company_id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  is_emergency: boolean;
  created_at: string;
  updated_at: string;
  building_ids: string[];
}

export interface CompanyContactInput {
  full_name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  is_primary?: boolean;
  is_emergency?: boolean;
  building_ids: string[];
}

export function useCompanyContacts(companyId: string | undefined) {
  return useQuery<CompanyContact[]>({
    queryKey: ["company_contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: contacts, error } = await (supabase as any)
        .from("company_contacts")
        .select("*")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("full_name");
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      const ids = (contacts ?? []).map((c: any) => c.id);
      let links: any[] = [];
      if (ids.length) {
        const { data: linkData, error: linkErr } = await (supabase as any)
          .from("company_contact_buildings")
          .select("contact_id, building_id")
          .in("contact_id", ids);
        if (linkErr && linkErr.code !== "42P01") throw linkErr;
        links = linkData ?? [];
      }
      return (contacts ?? []).map((c: any) => ({
        ...c,
        building_ids: links.filter((l) => l.contact_id === c.id).map((l) => l.building_id),
      }));
    },
  });
}

export function useCreateCompanyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ company_id, input }: { company_id: string; input: CompanyContactInput }) => {
      const { data, error } = await (supabase as any)
        .from("company_contacts")
        .insert({
          company_id,
          full_name: input.full_name.trim(),
          position: input.position?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          notes: input.notes?.trim() || null,
          is_primary: !!input.is_primary,
          is_emergency: !!input.is_emergency,
        })
        .select()
        .single();
      if (error) throw error;
      if (input.building_ids.length) {
        const { error: linkErr } = await (supabase as any)
          .from("company_contact_buildings")
          .insert(input.building_ids.map((bid) => ({ contact_id: data.id, building_id: bid })));
        if (linkErr) throw linkErr;
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["company_contacts", vars.company_id] });
    },
  });
}

export function useUpdateCompanyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      company_id,
      input,
      previous_building_ids,
    }: {
      id: string;
      company_id: string;
      input: CompanyContactInput;
      previous_building_ids: string[];
    }) => {
      const { error } = await (supabase as any)
        .from("company_contacts")
        .update({
          full_name: input.full_name.trim(),
          position: input.position?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          notes: input.notes?.trim() || null,
          is_primary: !!input.is_primary,
          is_emergency: !!input.is_emergency,
        })
        .eq("id", id);
      if (error) throw error;

      const next = new Set(input.building_ids);
      const prev = new Set(previous_building_ids);
      const toAdd = [...next].filter((b) => !prev.has(b));
      const toRemove = [...prev].filter((b) => !next.has(b));

      if (toRemove.length) {
        const { error: delErr } = await (supabase as any)
          .from("company_contact_buildings")
          .delete()
          .eq("contact_id", id)
          .in("building_id", toRemove);
        if (delErr) throw delErr;
      }
      if (toAdd.length) {
        const { error: insErr } = await (supabase as any)
          .from("company_contact_buildings")
          .insert(toAdd.map((bid) => ({ contact_id: id, building_id: bid })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["company_contacts", vars.company_id] });
    },
  });
}

export function useDeleteCompanyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; company_id: string }) => {
      const { error } = await (supabase as any).from("company_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["company_contacts", vars.company_id] });
    },
  });
}

/** Patch pojedynczego pola kontaktu (np. inline edycja notatki). */
export function usePatchCompanyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      company_id: _company_id,
      patch,
    }: {
      id: string;
      company_id: string;
      patch: Partial<Pick<CompanyContact, "notes" | "full_name" | "position" | "phone" | "email">>;
    }) => {
      const { error } = await (supabase as any)
        .from("company_contacts")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["company_contacts", vars.company_id] });
    },
  });
}
