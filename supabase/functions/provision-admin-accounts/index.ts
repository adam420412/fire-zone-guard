// Provisions a fixed list of super-admin accounts with random passwords.
// Returns the generated passwords ONCE in the response. Idempotent: if a
// user already exists, the existing user is reused and a new password is set.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAILS = [
  "tymoteusz.zgrabka@gmail.com",
  "bkwasizur@gmail.com",
  "lucyna.zgrabka@gmail.com",
  "zuzannakwasizur@gmail.com",
];

function generatePassword(length = 16): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const results: Array<{
      email: string;
      password: string;
      user_id: string;
      created: boolean;
    }> = [];

    for (const email of TARGET_EMAILS) {
      const password = generatePassword(16);
      let userId: string | null = null;
      let created = false;

      // Try to create the user with email auto-confirmed
      const { data: createData, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: email.split("@")[0] },
        });

      if (createData?.user) {
        userId = createData.user.id;
        created = true;
      } else {
        // User probably exists — find them and reset password
        const msg = (createErr?.message || "").toLowerCase();
        if (
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("exists")
        ) {
          // Look up existing user by paging through admin list (small project)
          let page = 1;
          while (page <= 20 && !userId) {
            const { data: list, error: listErr } =
              await admin.auth.admin.listUsers({ page, perPage: 200 });
            if (listErr) break;
            const found = list.users.find(
              (u) => (u.email || "").toLowerCase() === email.toLowerCase(),
            );
            if (found) {
              userId = found.id;
              break;
            }
            if (list.users.length < 200) break;
            page++;
          }
          if (userId) {
            await admin.auth.admin.updateUserById(userId, {
              password,
              email_confirm: true,
            });
          }
        } else {
          return new Response(
            JSON.stringify({
              error: `createUser failed for ${email}: ${createErr?.message}`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      if (!userId) {
        return new Response(
          JSON.stringify({ error: `could not resolve user id for ${email}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Ensure profile exists (handle_new_user trigger usually does this,
      // but upsert defensively for pre-existing users).
      await admin.from("profiles").upsert(
        { user_id: userId, email, name: email.split("@")[0] },
        { onConflict: "user_id" },
      );

      // Grant super_admin role (idempotent via unique (user_id, role))
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role: "super_admin" }, {
          onConflict: "user_id,role",
        });
      if (roleErr) {
        return new Response(
          JSON.stringify({
            error: `role assignment failed for ${email}: ${roleErr.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      results.push({ email, password, user_id: userId, created });
    }

    return new Response(
      JSON.stringify({ ok: true, accounts: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
