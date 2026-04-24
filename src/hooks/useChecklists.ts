// =============================================================================
// useChecklists — hooki do modułu Checklisty / Audyty (iter 8).
//
// Tabele (ścieżka: /sessions/.../supabase/migrations/20260424220000_iter8_checklists.sql):
//   checklist_templates       — szablony wielokrotnego użytku (system + per-firma)
//   checklist_template_items  — punkty szablonu pogrupowane sekcjami
//   checklist_runs            — instancja: konkretny audyt na konkretnym obiekcie
//   checklist_run_items       — snapshot template_item per run + status + zdjęcia
//
// Fallback patterns (do migracji):
//   * 42P01 (table missing) → []  (przed zaaplikowaniem migracji)
//   * 42703 (column missing) → ignorujemy w whitelistach
// =============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ----- Typy ------------------------------------------------------------------
export type ChecklistScope = "audyt" | "sprzet" | "bhp" | "inne";
export type ChecklistRunStatus = "in_progress" | "completed" | "cancelled";
export type ChecklistRunItemStatus = "pending" | "ok" | "nie_ok" | "na";
export type ChecklistSeverity = "niski" | "średni" | "wysoki" | "krytyczny";

export interface ChecklistTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scope: ChecklistScope;
  device_category: string | null;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  sort_order: number;
  section: string | null;
  label: string;
  description: string | null;
  default_severity: ChecklistSeverity;
  requires_photo: boolean;
  requires_note_on_fail: boolean;
  created_at: string;
}

export interface ChecklistTemplateWithItems extends ChecklistTemplate {
  items: ChecklistTemplateItem[];
}

export interface ChecklistRun {
  id: string;
  template_id: string;
  template_code: string;
  template_name: string;
  building_id: string | null;
  company_id: string | null;
  performed_by: string | null;
  performer_name: string | null;
  status: ChecklistRunStatus;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
  protocol_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined helpers (best-effort)
  building_name?: string | null;
  building_address?: string | null;
  // counters (computed client-side)
  total_items?: number;
  ok_count?: number;
  nie_ok_count?: number;
  na_count?: number;
  pending_count?: number;
}

export interface ChecklistRunItem {
  id: string;
  run_id: string;
  template_item_id: string | null;
  sort_order: number;
  section: string | null;
  label: string;
  description: string | null;
  default_severity: ChecklistSeverity;
  requires_photo: boolean;
  requires_note_on_fail: boolean;
  status: ChecklistRunItemStatus;
  note: string | null;
  photo_urls: string[];
  task_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistRunWithItems extends ChecklistRun {
  items: ChecklistRunItem[];
}

// ----- Etykiety dla UI -------------------------------------------------------
export const SCOPE_LABELS: Record<ChecklistScope, string> = {
  audyt: "Audyt",
  sprzet: "Przegląd sprzętu",
  bhp: "BHP",
  inne: "Inne",
};

export const RUN_STATUS_LABELS: Record<ChecklistRunStatus, string> = {
  in_progress: "W trakcie",
  completed: "Zakończona",
  cancelled: "Anulowana",
};

export const ITEM_STATUS_LABELS: Record<ChecklistRunItemStatus, string> = {
  pending: "Do sprawdzenia",
  ok: "OK",
  nie_ok: "NIE OK",
  na: "Nie dotyczy",
};

export const SEVERITY_LABELS: Record<ChecklistSeverity, string> = {
  niski: "Niski",
  średni: "Średni",
  wysoki: "Wysoki",
  krytyczny: "Krytyczny",
};

export const TEMPLATES_KEY = ["checklist_templates"] as const;
export const RUNS_KEY = ["checklist_runs"] as const;

// ----- Helpers ---------------------------------------------------------------
function isMissingRelation(err: unknown): boolean {
  // PostgREST: 42P01 = relation does not exist
  return !!err && typeof err === "object" && (err as { code?: string }).code === "42P01";
}

function summarizeRun<T extends ChecklistRun>(run: T, items: ChecklistRunItem[]): T {
  const counters = { ok: 0, nie_ok: 0, na: 0, pending: 0 };
  for (const it of items) {
    if (it.status in counters) counters[it.status as keyof typeof counters] += 1;
  }
  return {
    ...run,
    total_items: items.length,
    ok_count: counters.ok,
    nie_ok_count: counters.nie_ok,
    na_count: counters.na,
    pending_count: counters.pending,
  };
}

// ============================================================================
// SZABLONY
// ============================================================================

export function useChecklistTemplates(filters?: {
  scope?: ChecklistScope | "all";
  active?: boolean;
}) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, filters ?? {}],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      let query: any = (supabase.from as any)("checklist_templates").select("*");
      if (filters?.scope && filters.scope !== "all") query = query.eq("scope", filters.scope);
      if (filters?.active !== undefined) query = query.eq("is_active", filters.active);
      query = query.order("is_system", { ascending: false }).order("name", { ascending: true });

      const { data, error } = await query;
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data ?? []) as ChecklistTemplate[];
    },
  });
}

export function useChecklistTemplate(id: string | undefined) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<ChecklistTemplateWithItems | null> => {
      const { data: tpl, error: tErr } = await (supabase.from as any)("checklist_templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (tErr) {
        if (isMissingRelation(tErr)) return null;
        throw tErr;
      }
      if (!tpl) return null;

      const { data: items, error: iErr } = await (supabase.from as any)("checklist_template_items")
        .select("*")
        .eq("template_id", id)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      return { ...(tpl as ChecklistTemplate), items: (items ?? []) as ChecklistTemplateItem[] };
    },
  });
}

// ============================================================================
// URUCHOMIENIA (RUNS)
// ============================================================================

export function useChecklistRuns(filters?: {
  building_id?: string | null;
  status?: ChecklistRunStatus | "all";
  limit?: number;
}) {
  return useQuery({
    queryKey: [...RUNS_KEY, filters ?? {}],
    queryFn: async (): Promise<ChecklistRun[]> => {
      let query: any = (supabase.from as any)("checklist_runs")
        .select("*, buildings(name, address)");
      if (filters?.building_id) query = query.eq("building_id", filters.building_id);
      if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
      query = query
        .order("started_at", { ascending: false })
        .limit(filters?.limit ?? 200);

      const { data, error } = await query;
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        building_name: r.buildings?.name ?? null,
        building_address: r.buildings?.address ?? null,
      })) as ChecklistRun[];
    },
  });
}

export function useChecklistRun(id: string | undefined) {
  return useQuery({
    queryKey: [...RUNS_KEY, "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<ChecklistRunWithItems | null> => {
      const { data: run, error: rErr } = await (supabase.from as any)("checklist_runs")
        .select("*, buildings(name, address)")
        .eq("id", id)
        .maybeSingle();
      if (rErr) {
        if (isMissingRelation(rErr)) return null;
        throw rErr;
      }
      if (!run) return null;

      const { data: items, error: iErr } = await (supabase.from as any)("checklist_run_items")
        .select("*")
        .eq("run_id", id)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      const baseRun: ChecklistRun = {
        ...(run as ChecklistRun),
        building_name: (run as any).buildings?.name ?? null,
        building_address: (run as any).buildings?.address ?? null,
      };
      const items_ = (items ?? []) as ChecklistRunItem[];
      return { ...summarizeRun(baseRun, items_), items: items_ };
    },
  });
}

// ----- Start nowego runu (snapshot wszystkich items z szablonu) --------------
export interface StartChecklistRunInput {
  template_id: string;
  building_id?: string | null;
  company_id?: string | null;
  performer_name?: string | null;
  notes?: string | null;
}

export function useStartChecklistRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartChecklistRunInput): Promise<ChecklistRun> => {
      // 1. odczytaj szablon (z items)
      const { data: tpl, error: tErr } = await (supabase.from as any)("checklist_templates")
        .select("*")
        .eq("id", input.template_id)
        .single();
      if (tErr) throw tErr;

      const { data: tplItems, error: iErr } = await (supabase.from as any)("checklist_template_items")
        .select("*")
        .eq("template_id", input.template_id)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      // 2. spróbuj wziąć dane usera (z timeoutem, bo navigator.locks bywa wredne)
      type GetUserResult = Awaited<ReturnType<typeof supabase.auth.getUser>>;
      let userId: string | null = null;
      try {
        const result = await Promise.race<GetUserResult>([
          supabase.auth.getUser(),
          new Promise<GetUserResult>((_, reject) =>
            setTimeout(() => reject(new Error("auth-getUser-timeout")), 800),
          ),
        ]);
        userId = result?.data?.user?.id ?? null;
      } catch {
        userId = null;
      }

      // 3. utwórz run (z snapshotem template_code/name)
      const runPayload: Record<string, unknown> = {
        template_id: tpl.id,
        template_code: tpl.code,
        template_name: tpl.name,
        building_id: input.building_id ?? null,
        company_id: input.company_id ?? null,
        performed_by: userId,
        performer_name: input.performer_name ?? null,
        notes: input.notes ?? null,
        status: "in_progress",
      };
      const { data: runRow, error: runErr } = await (supabase.from as any)("checklist_runs")
        .insert(runPayload)
        .select()
        .single();
      if (runErr) throw runErr;

      // 4. zsnapshotuj wszystkie items szablonu
      const itemsPayload = ((tplItems ?? []) as ChecklistTemplateItem[]).map((ti) => ({
        run_id: runRow.id,
        template_item_id: ti.id,
        sort_order: ti.sort_order,
        section: ti.section,
        label: ti.label,
        description: ti.description,
        default_severity: ti.default_severity,
        requires_photo: ti.requires_photo,
        requires_note_on_fail: ti.requires_note_on_fail,
        status: "pending",
      }));
      if (itemsPayload.length > 0) {
        const { error: insErr } = await (supabase.from as any)("checklist_run_items").insert(itemsPayload);
        if (insErr) throw insErr;
      }

      return runRow as ChecklistRun;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}

// ----- Update pojedynczego item ---------------------------------------------
export function useUpdateRunItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ChecklistRunItem, "status" | "note" | "photo_urls">>;
    }): Promise<ChecklistRunItem> => {
      const safe: Record<string, unknown> = {};
      if ("status" in patch) safe.status = patch.status;
      if ("note" in patch) safe.note = patch.note;
      if ("photo_urls" in patch) safe.photo_urls = patch.photo_urls;
      // jeśli zamykamy item -> ustaw completed_at
      if (patch.status && patch.status !== "pending") {
        safe.completed_at = new Date().toISOString();
      }

      const { data, error } = await (supabase.from as any)("checklist_run_items")
        .update(safe)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ChecklistRunItem;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RUNS_KEY });
      // odśwież detail runu zawierającego ten item — łatwiej puścić cały klucz
      qc.invalidateQueries({ queryKey: [...RUNS_KEY, "detail"] });
      void vars; // używamy jako placeholder — lint
    },
  });
}

// ----- Update samego runu (notes / summary / protocol_url / cancelled) ------
export function useUpdateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ChecklistRun, "notes" | "summary" | "protocol_url" | "status">>;
    }) => {
      const safe: Record<string, unknown> = {};
      for (const k of ["notes", "summary", "protocol_url", "status"] as const) {
        if (k in patch) safe[k] = (patch as any)[k];
      }
      if (patch.status === "completed" || patch.status === "cancelled") {
        safe.completed_at = new Date().toISOString();
      }
      const { data, error } = await (supabase.from as any)("checklist_runs")
        .update(safe)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ChecklistRun;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("checklist_runs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}

// ============================================================================
// FINALIZE — kończy run + tworzy zadania w Naprawach per NIE_OK item
// ============================================================================
export interface FinalizeRunInput {
  run_id: string;
  summary?: string | null;
  protocol_url?: string | null;
}

export interface FinalizeRunResult {
  run: ChecklistRun;
  created_tasks: number;
  failed_tasks: number;
}

export function useFinalizeRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FinalizeRunInput): Promise<FinalizeRunResult> => {
      // 1. odczytaj run + items
      const { data: run, error: rErr } = await (supabase.from as any)("checklist_runs")
        .select("*")
        .eq("id", input.run_id)
        .single();
      if (rErr) throw rErr;

      const { data: items, error: iErr } = await (supabase.from as any)("checklist_run_items")
        .select("*")
        .eq("run_id", input.run_id)
        .eq("status", "nie_ok");
      if (iErr) throw iErr;

      const failedItems = ((items ?? []) as ChecklistRunItem[]).filter((it) => !it.task_id);

      // 2. jeśli mamy budynek i firmę -> twórz zadania
      let created = 0;
      let failed = 0;
      if (run.building_id && run.company_id && failedItems.length > 0) {
        for (const item of failedItems) {
          const taskPayload: Record<string, unknown> = {
            company_id: run.company_id,
            building_id: run.building_id,
            type: "usterka",
            title: `Audyt: ${item.label}`.slice(0, 200),
            description: [
              `Wykryto NIE OK podczas audytu „${run.template_name}".`,
              item.section ? `Sekcja: ${item.section}` : null,
              item.note ? `Notatka audytora: ${item.note}` : null,
              item.photo_urls && item.photo_urls.length > 0
                ? `Zdjęcia:\n${item.photo_urls.join("\n")}`
                : null,
            ]
              .filter(Boolean)
              .join("\n\n"),
            priority: item.default_severity,
            status: "Nowe",
            sla_hours: item.default_severity === "krytyczny" ? 8 : 72,
          };
          const { data: created_task, error: cErr } = await (supabase.from as any)("tasks")
            .insert(taskPayload)
            .select("id")
            .single();
          if (cErr || !created_task) {
            failed += 1;
            // nie przerywamy — best-effort
            console.warn("[finalizeRun] task insert failed", cErr);
            continue;
          }
          // zlinkuj item z zadaniem
          await (supabase.from as any)("checklist_run_items")
            .update({ task_id: created_task.id })
            .eq("id", item.id);
          created += 1;
        }
      }

      // 3. zamknij run
      const { data: closedRun, error: clErr } = await (supabase.from as any)("checklist_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          summary: input.summary ?? null,
          protocol_url: input.protocol_url ?? null,
        })
        .eq("id", input.run_id)
        .select()
        .single();
      if (clErr) throw clErr;

      return {
        run: closedRun as ChecklistRun,
        created_tasks: created,
        failed_tasks: failed,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RUNS_KEY });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ============================================================================
// STORAGE — upload zdjęć + PDF protokołów audytu
// ============================================================================
export async function uploadAuditPhoto(file: File, runId?: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const folder = runId ? runId : new Date().toISOString().slice(0, 7);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("audit-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("audit-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadAuditProtocol(blob: Blob, runId: string): Promise<string> {
  const path = `${runId}/protokol-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("audit-protocols").upload(path, blob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("audit-protocols").getPublicUrl(path);
  return data.publicUrl;
}
