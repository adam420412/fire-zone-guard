// One-off: reset bkwasizur@gmail.com password + ensure super_admin role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL = "bkwasizur@gmail.com";
const NEW_PASSWORD = "FireZone2026!Bartek";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    let page = 1;
    while (page <= 20 && !userId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const found = data.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
      if (found) userId = found.id;
      if (data.users.length < 200) break;
      page++;
    }

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL, password: NEW_PASSWORD, email_confirm: true,
        user_metadata: { name: "Bartek Kwasizur" },
      });
      if (error) throw error;
      userId = data.user!.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: NEW_PASSWORD, email_confirm: true,
      });
      if (error) throw error;
    }

    await admin.from("profiles").upsert(
      { user_id: userId, email: EMAIL, name: "Bartek Kwasizur" },
      { onConflict: "user_id" },
    );
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "super_admin" },
      { onConflict: "user_id,role" },
    );

    return new Response(JSON.stringify({ ok: true, email: EMAIL, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
