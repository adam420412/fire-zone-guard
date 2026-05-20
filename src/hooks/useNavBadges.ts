import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface NavBadges {
  kanban: number;       // otwarte zlecenia
  repairs: number;      // otwarte naprawy
  sla: number;          // nowe/nieodpowiedziane SLA
  audits: number;       // audyty zaplanowane / opóźnione
  finance: number;      // faktury przeterminowane
  officeTasks: number;  // zadania biurowe otwarte
}

async function fetchBadges(): Promise<NavBadges> {
  const today = new Date().toISOString();

  const [tasks, repairs, sla, audits, invoices, officeTasks] = await Promise.allSettled([
    supabase
      .from("tasks")
      .select("id, source")
      .neq("status", "Zamknięte")
      .not("source", "in", '("audit","service","sla")')
      .limit(200),
    supabase
      .from("tasks")
      .select("id")
      .neq("status", "Zamknięte")
      .in("source", ["audit", "service", "sla"])
      .limit(99),
    supabase
      .from("sla_tickets")
      .select("id")
      .in("status", ["zgloszenie", "telefon", "wyjazd", "na_miejscu", "diagnoza"])
      .limit(99),
    supabase
      .from("audits")
      .select("id")
      .in("status", ["zaplanowany", "w przygotowaniu"])
      .limit(99),
    // finance_invoices may not exist yet — handled by allSettled
    supabase
      .from("finance_invoices" as any)
      .select("id")
      .eq("status", "przeterminowana")
      .limit(99),
    // recurring_events overdue (office tasks/terminarz)
    (supabase.from as any)("recurring_events")
      .select("id")
      .lt("next_due_date", new Date().toISOString().split("T")[0])
      .limit(99),
  ]);

  return {
    kanban: tasks.status === "fulfilled" ? (tasks.value.data?.length ?? 0) : 0,
    repairs: repairs.status === "fulfilled" ? (repairs.value.data?.length ?? 0) : 0,
    sla: sla.status === "fulfilled" ? (sla.value.data?.length ?? 0) : 0,
    audits: audits.status === "fulfilled" ? (audits.value.data?.length ?? 0) : 0,
    finance: invoices.status === "fulfilled" ? (invoices.value.data?.length ?? 0) : 0,
    officeTasks: officeTasks.status === "fulfilled" ? (officeTasks.value.data?.length ?? 0) : 0,
  };
}

export function useNavBadges() {
  const qc = useQueryClient();

  // Refresh on realtime task/SLA changes
  useEffect(() => {
    const channel = supabase
      .channel("nav-badges-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["nav-badges"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sla_tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["nav-badges"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audits" }, () => {
        qc.invalidateQueries({ queryKey: ["nav-badges"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ["nav-badges"],
    queryFn: fetchBadges,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
