import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  taskId: string;
  fileName: string;
  mode?: "upload" | "download";
  filePath?: string; // for download mode
  expiresIn?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // user-context client (validates JWT and applies RLS)
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.taskId) {
      return new Response(JSON.stringify({ error: "taskId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RLS check via SELECT on task — confirms user can access this task
    const { data: task, error: taskErr } = await userClient
      .from("tasks").select("id, company_id").eq("id", body.taskId).maybeSingle();
    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: "Task not accessible" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, service);
    const expiresIn = Math.min(Math.max(body.expiresIn ?? 600, 60), 3600);
    const mode = body.mode ?? "upload";

    if (mode === "download") {
      if (!body.filePath) {
        return new Response(JSON.stringify({ error: "filePath required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await admin.storage
        .from("task-attachments")
        .createSignedUrl(body.filePath, expiresIn);
      if (error) throw error;
      return new Response(JSON.stringify({ url: data.signedUrl, expiresIn }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // upload
    const safe = (body.fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const objectPath = `${body.taskId}/${crypto.randomUUID()}-${safe}`;

    const { data, error } = await admin.storage
      .from("task-attachments")
      .createSignedUploadUrl(objectPath);
    if (error) throw error;

    return new Response(
      JSON.stringify({ url: data.signedUrl, token: data.token, path: objectPath, expiresIn }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
