import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* =========================================================
   K2 — TaskDetailDialog data layer
   - Załączniki (task_attachments + signed URLs)
   - Komunikacja (task_communications)
   - Powiązania (cross-entity rollup for the task's building/company)
   ========================================================= */

// ---------- ATTACHMENTS ----------
export interface TaskAttachment {
  id: string;
  task_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  kind: "photo" | "document" | "protocol" | "other" | string;
  uploaded_by: string | null;
  created_at: string;
  uploaderName?: string;
}

export function useTaskAttachments(taskId?: string) {
  return useQuery({
    enabled: !!taskId,
    queryKey: ["task_attachments", taskId],
    queryFn: async (): Promise<TaskAttachment[]> => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*, profiles!task_attachments_uploaded_by_fkey(name)")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) {
        // Fallback without join (FK name may differ)
        const { data: d2 } = await supabase
          .from("task_attachments")
          .select("*")
          .eq("task_id", taskId!)
          .order("created_at", { ascending: false });
        return (d2 ?? []) as any;
      }
      return (data ?? []).map((a: any) => ({
        ...a,
        uploaderName: a.profiles?.name ?? null,
      }));
    },
  });
}

/** Signed URL for browser upload (PUT). Path is reserved on server. */
export async function getTaskAttachmentUploadUrl(taskId: string, fileName: string) {
  const { data, error } = await supabase.functions.invoke("task-attachment-sign", {
    body: { taskId, fileName, mode: "upload" },
  });
  if (error) throw error;
  return data as { url: string; token: string; path: string; expiresIn: number };
}

/** Signed URL for download (GET) of a stored object. */
export async function getTaskAttachmentDownloadUrl(taskId: string, filePath: string) {
  const { data, error } = await supabase.functions.invoke("task-attachment-sign", {
    body: { taskId, filePath, mode: "download" },
  });
  if (error) throw error;
  return data as { url: string; expiresIn: number };
}

/** Convenience: upload a File object end-to-end and persist DB row. */
export function useUploadTaskAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      file: File;
      kind?: TaskAttachment["kind"];
    }) => {
      const { taskId, file, kind = "other" } = params;
      const sign = await getTaskAttachmentUploadUrl(taskId, file.name);

      // Direct PUT to Supabase Storage signed URL
      const put = await fetch(sign.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();

      const inferredKind: TaskAttachment["kind"] =
        kind !== "other" ? kind : (file.type.startsWith("image/") ? "photo"
          : file.type === "application/pdf" ? "document" : "other");

      const { data, error } = await supabase
        .from("task_attachments")
        .insert({
          task_id: taskId,
          name: file.name,
          file_path: sign.path,
          file_type: file.type || null,
          file_size: file.size,
          kind: inferredKind,
          uploaded_by: profile?.id ?? null,
        })
        .select().single();
      if (error) throw error;
      return data as TaskAttachment;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["task_attachments", vars.taskId] });
    },
  });
}

export function useDeleteTaskAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (att: TaskAttachment) => {
      // Best-effort: remove storage object (RLS-checked)
      await supabase.storage.from("task-attachments").remove([att.file_path]);
      const { error } = await supabase.from("task_attachments").delete().eq("id", att.id);
      if (error) throw error;
      return att.id;
    },
    onSuccess: (_id, att) => {
      qc.invalidateQueries({ queryKey: ["task_attachments", att.task_id] });
    },
  });
}

// ---------- COMMUNICATIONS ----------
export interface TaskCommunication {
  id: string;
  task_id: string;
  channel: "telegram" | "internal_note" | string;
  direction: "in" | "out" | "internal" | string;
  subject: string | null;
  body: string;
  recipient: string | null;
  author_id: string | null;
  external_ref: string | null;
  payload: Record<string, any>;
  created_at: string;
  authorName?: string | null;
}

export function useTaskCommunications(taskId?: string) {
  return useQuery({
    enabled: !!taskId,
    queryKey: ["task_communications", taskId],
    queryFn: async (): Promise<TaskCommunication[]> => {
      const { data, error } = await supabase
        .from("task_communications")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Resolve author names in one shot
      const ids = Array.from(new Set((data ?? []).map((d: any) => d.author_id).filter(Boolean)));
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
        (profs ?? []).forEach((p: any) => { names[p.id] = p.name; });
      }
      return (data ?? []).map((d: any) => ({ ...d, authorName: d.author_id ? names[d.author_id] ?? null : null }));
    },
  });
}

export function useAddInternalNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { taskId: string; body: string; subject?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", u.user?.id ?? "").maybeSingle();

      const { data, error } = await supabase
        .from("task_communications")
        .insert({
          task_id: params.taskId,
          channel: "internal_note",
          direction: "internal",
          subject: params.subject ?? null,
          body: params.body,
          author_id: profile?.id ?? null,
        }).select().single();
      if (error) throw error;
      return data as TaskCommunication;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["task_communications", vars.taskId] });
    },
  });
}

export function useDeleteTaskCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: TaskCommunication) => {
      const { error } = await supabase.from("task_communications").delete().eq("id", c.id);
      if (error) throw error;
      return c.id;
    },
    onSuccess: (_id, c) => qc.invalidateQueries({ queryKey: ["task_communications", c.task_id] }),
  });
}

/** Telegram messages tied to this task — read from notifications_outbox. */
export function useTaskTelegramLog(taskId?: string) {
  return useQuery({
    enabled: !!taskId,
    queryKey: ["task_telegram_log", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications_outbox")
        .select("id, channel, subject, body, status, sent_at, created_at, payload")
        .eq("channel", "telegram")
        .or(`related_id.eq.${taskId},payload->>task_id.eq.${taskId}`)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });
}

// ---------- LINKS / POWIĄZANIA ----------
export interface TaskLinks {
  opportunity?: { id: string; company_name: string; status: string } | null;
  quotes: Array<{ id: string; quote_number: string; status: string; total: number; created_at: string }>;
  audits: Array<{ id: string; type: string; status: string; performed_at: string | null }>;
  protocols: Array<{ id: string; type: string; status: string; performed_at: string }>;
  inspections: Array<{ id: string; type: string; performed_at: string; next_due: string | null }>;
  buildingTasks: Array<{ id: string; title: string; status: string; priority: string; deadline: string | null }>;
  device?: { id: string; name: string; serial_number: string | null; status: string } | null;
}

export function useTaskLinks(task?: { id: string; building_id?: string | null; company_id?: string | null; opportunity_id?: string | null; source?: string | null; source_id?: string | null }) {
  return useQuery({
    enabled: !!task?.id,
    queryKey: ["task_links", task?.id],
    queryFn: async (): Promise<TaskLinks> => {
      const buildingId = task?.building_id ?? null;
      const taskId = task!.id;

      const [opp, quotes, audits, protocols, inspections, bTasks, device] = await Promise.all([
        task?.opportunity_id
          ? supabase.from("sales_opportunities").select("id, company_name, status").eq("id", task.opportunity_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase.from("quotes")
          .select("id, quote_number, status, total, created_at")
          .or(`task_id.eq.${taskId}${buildingId ? `,building_id.eq.${buildingId}` : ""}`)
          .order("created_at", { ascending: false }).limit(20),
        buildingId
          ? supabase.from("audits").select("id, type, status, performed_at").eq("building_id", buildingId).order("performed_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] } as any),
        buildingId
          ? supabase.from("service_protocols").select("id, type, status, performed_at").eq("building_id", buildingId).order("performed_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] } as any),
        buildingId
          ? supabase.from("inspections").select("id, type, performed_at, next_due").eq("building_id", buildingId).order("performed_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] } as any),
        buildingId
          ? supabase.from("tasks").select("id, title, status, priority, deadline").eq("building_id", buildingId).neq("id", taskId).order("created_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] } as any),
        task?.source === "device" && task?.source_id
          ? supabase.from("devices").select("id, name, serial_number, status").eq("id", task.source_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      return {
        opportunity: (opp as any)?.data ?? null,
        quotes: ((quotes as any)?.data ?? []) as any,
        audits: ((audits as any)?.data ?? []) as any,
        protocols: ((protocols as any)?.data ?? []) as any,
        inspections: ((inspections as any)?.data ?? []) as any,
        buildingTasks: ((bTasks as any)?.data ?? []) as any,
        device: (device as any)?.data ?? null,
      };
    },
  });
}
