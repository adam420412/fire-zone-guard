// Liczy postęp uzupełnienia systemu z istniejących tabel (read-only)
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowCounts } from "@/lib/workflowSteps";

const tableMap: { key: keyof WorkflowCounts; table: string }[] = [
  { key: "companies", table: "companies" },
  { key: "buildings", table: "buildings" },
  { key: "contacts", table: "company_contacts" },
  { key: "documents", table: "building_documents" },
  { key: "devices", table: "devices" },
  { key: "floorPlans", table: "floor_plans" },
  { key: "employees", table: "employees" },
  { key: "trainings", table: "employee_trainings" },
  { key: "tasks", table: "tasks" },
  { key: "slaTickets", table: "sla_tickets" },
  { key: "audits", table: "audits" },
  { key: "protocols", table: "protocols" },
  { key: "reports", table: "reports" },
  { key: "aiActions", table: "ai_action_log" },
];

async function fetchCount(table: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(table as any)
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function useWorkflowProgress() {
  return useQuery({
    queryKey: ["workflow-progress"],
    staleTime: 60_000,
    queryFn: async (): Promise<WorkflowCounts> => {
      const results = await Promise.all(tableMap.map((m) => fetchCount(m.table)));
      const out = {} as WorkflowCounts;
      tableMap.forEach((m, i) => {
        out[m.key] = results[i];
      });
      return out;
    },
  });
}
