import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Brak uprawnień" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, building_id } = await req.json();

    if (type === "annual_report") {
      // Generate annual report data
      const { data: companies } = await supabase.from("companies").select("*");
      const { data: buildings } = await supabase.from("buildings").select("*, companies(name)");
      const { data: tasks } = await supabase.from("tasks").select("*");
      const { data: inspections } = await supabase.from("inspections").select("*");
      const { data: evacuations } = await supabase.from("evacuation_drills").select("*");

      const now = new Date();
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      const yearTasks = (tasks ?? []).filter(
        (t) => new Date(t.created_at) >= yearAgo
      );
      const closedTasks = yearTasks.filter((t) => t.status === "Zamknięte");
      const criticalTasks = yearTasks.filter((t) => t.priority === "krytyczny");

      // SLA compliance
      let slaCompliant = 0;
      for (const t of closedTasks) {
        if (t.closed_at) {
          const hours = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
          if (hours <= t.sla_hours) slaCompliant++;
        }
      }

      const report = {
        title: "Raport Roczny PPOŻ",
        generated_at: now.toISOString(),
        period: {
          from: yearAgo.toISOString().split("T")[0],
          to: now.toISOString().split("T")[0],
        },
        summary: {
          total_companies: (companies ?? []).length,
          total_buildings: (buildings ?? []).length,
          total_tasks_created: yearTasks.length,
          tasks_closed: closedTasks.length,
          tasks_critical: criticalTasks.length,
          sla_compliance_pct: closedTasks.length > 0 ? Math.round((slaCompliant / closedTasks.length) * 100) : 100,
          inspections_performed: (inspections ?? []).filter(
            (i) => new Date(i.performed_at) >= yearAgo
          ).length,
          evacuations_performed: (evacuations ?? []).filter(
            (e) => new Date(e.performed_at) >= yearAgo
          ).length,
        },
        buildings_status: await Promise.all(
          (buildings ?? []).map(async (b) => {
            const { data: status } = await supabase.rpc(
              "calculate_building_safety_status",
              { _building_id: b.id }
            );
            return {
              name: b.name,
              company: (b as any).companies?.name ?? "",
              address: b.address,
              safety_status: status ?? "bezpieczny",
              ibp_valid_until: b.ibp_valid_until,
            };
          })
        ),
      };

      return new Response(JSON.stringify(report), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "certificate") {
      if (!building_id) {
        return new Response(
          JSON.stringify({ error: "building_id jest wymagane" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check conditions for certificate
      const { data: building } = await supabase
        .from("buildings")
        .select("*, companies(name)")
        .eq("id", building_id)
        .single();

      if (!building) {
        return new Response(
          JSON.stringify({ error: "Obiekt nie znaleziony" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Condition 1: No critical open tasks
      const { count: criticalCount } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("building_id", building_id)
        .eq("priority", "krytyczny")
        .neq("status", "Zamknięte");

      // Condition 2: IBP valid
      const ibpValid = building.ibp_valid_until && new Date(building.ibp_valid_until) >= new Date();

      // Condition 3: Recent evacuation (last 12 months)
      const { count: recentEvac } = await supabase
        .from("evacuation_drills")
        .select("*", { count: "exact", head: true })
        .eq("building_id", building_id)
        .gte("performed_at", new Date(Date.now() - 365 * 24 * 3600000).toISOString().split("T")[0]);

      // Condition 4: No overdue inspections
      const { count: overdueInsp } = await supabase
        .from("inspections")
        .select("*", { count: "exact", head: true })
        .eq("building_id", building_id)
        .lt("next_due", new Date().toISOString().split("T")[0]);

      const conditions = {
        no_critical_tasks: (criticalCount ?? 0) === 0,
        ibp_valid: !!ibpValid,
        recent_evacuation: (recentEvac ?? 0) > 0,
        no_overdue_inspections: (overdueInsp ?? 0) === 0,
      };

      const canIssue = Object.values(conditions).every(Boolean);

      if (!canIssue) {
        return new Response(
          JSON.stringify({
            can_issue: false,
            conditions,
            message: "Nie spełniono warunków wydania certyfikatu",
            building_name: building.name,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Issue certificate
      const certNumber = `CERT-${building_id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1);

      const { data: cert, error: certError } = await supabase
        .from("certificates")
        .insert({
          building_id,
          certificate_number: certNumber,
          valid_until: validUntil.toISOString(),
          approved_by: user.id,
          status: "active",
        })
        .select()
        .single();

      if (certError) {
        return new Response(
          JSON.stringify({ error: certError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          can_issue: true,
          conditions,
          certificate: {
            ...cert,
            building_name: building.name,
            company_name: (building as any).companies?.name,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Nieznany typ raportu. Użyj: annual_report lub certificate" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
