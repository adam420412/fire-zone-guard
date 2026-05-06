import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, Activity, FileQuestion,
  UserX, PhoneOff, Clock, TrendingDown, Loader2, ShieldAlert
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";

interface HealthIssue {
  id: string;
  label: string;
  meta?: string;
  link?: string;
}

interface HealthSection {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  severity: "critical" | "warning" | "info";
  issues: HealthIssue[];
}

function useSystemAudit() {
  return useQuery({
    queryKey: ["system-audit"],
    queryFn: async (): Promise<HealthSection[]> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString();

      const [
        orphanTasks,
        unassignedTasks,
        overdueTasks,
        staleLeads,
        orphanQuotes,
        contactsNoPhone,
        buildingsNoIbp,
        devicesNoService,
      ] = await Promise.all([
        // Tasks without building or company
        supabase.from("tasks")
          .select("id, title, created_at")
          .or("building_id.is.null,company_id.is.null")
          .neq("status", "Zamknięte")
          .limit(20),
        // Tasks without assignee
        supabase.from("tasks")
          .select("id, title, created_at, priority")
          .is("assignee_id", null)
          .neq("status", "Zamknięte")
          .order("created_at", { ascending: false })
          .limit(20),
        // Overdue tasks
        supabase.from("tasks")
          .select("id, title, deadline")
          .lt("deadline", today)
          .neq("status", "Zamknięte")
          .order("deadline", { ascending: true })
          .limit(20),
        // Stale leads (no update 7+ days)
        supabase.from("sales_opportunities")
          .select("id, company_name, updated_at, status")
          .lt("updated_at", sevenDaysAgo)
          .not("status", "in", "(zlecenie,archiwum)")
          .order("updated_at", { ascending: true })
          .limit(20),
        // Quotes without task or opportunity link
        supabase.from("quotes")
          .select("id, quote_number, created_at, status")
          .is("task_id", null)
          .is("opportunity_id", null)
          .order("created_at", { ascending: false })
          .limit(20),
        // Contacts without phone
        supabase.from("contacts")
          .select("id, name, company_id")
          .or("phone.is.null,phone.eq.")
          .limit(20),
        // Buildings with expired/missing IBP
        supabase.from("buildings")
          .select("id, name, ibp_valid_until")
          .or(`ibp_valid_until.is.null,ibp_valid_until.lt.${today.split("T")[0]}`)
          .limit(20),
        // Devices without next service date
        supabase.from("devices")
          .select("id, name, building_id")
          .is("next_service_date", null)
          .eq("status", "aktywne")
          .limit(20),
      ]);

      return [
        {
          key: "orphan-tasks",
          title: "Zadania bez kontekstu",
          description: "Zadania bez przypisanego obiektu lub firmy",
          icon: FileQuestion,
          severity: "critical",
          issues: (orphanTasks.data || []).map((t) => ({
            id: t.id,
            label: t.title,
            meta: `Utworzone ${formatDistanceToNow(new Date(t.created_at), { locale: pl, addSuffix: true })}`,
            link: `/kanban`,
          })),
        },
        {
          key: "unassigned-tasks",
          title: "Zadania bez wykonawcy",
          description: "Otwarte zadania bez przypisanego serwisanta",
          icon: UserX,
          severity: "warning",
          issues: (unassignedTasks.data || []).map((t) => ({
            id: t.id,
            label: t.title,
            meta: t.priority,
            link: `/kanban`,
          })),
        },
        {
          key: "overdue-tasks",
          title: "Przeterminowane zadania",
          description: "Zadania po terminie deadline",
          icon: Clock,
          severity: "critical",
          issues: (overdueTasks.data || []).map((t) => ({
            id: t.id,
            label: t.title,
            meta: t.deadline ? `Termin: ${new Date(t.deadline).toLocaleDateString("pl-PL")}` : "",
            link: `/kanban`,
          })),
        },
        {
          key: "stale-leads",
          title: "Zaniedbane szanse sprzedaży",
          description: "Leady bez aktywności od 7+ dni",
          icon: TrendingDown,
          severity: "warning",
          issues: (staleLeads.data || []).map((l) => ({
            id: l.id,
            label: l.company_name,
            meta: `Status: ${l.status} • ${formatDistanceToNow(new Date(l.updated_at), { locale: pl, addSuffix: true })}`,
            link: `/crm`,
          })),
        },
        {
          key: "orphan-quotes",
          title: "Oferty bez powiązań",
          description: "Oferty niepołączone z zadaniem lub szansą",
          icon: ShieldAlert,
          severity: "info",
          issues: (orphanQuotes.data || []).map((q) => ({
            id: q.id,
            label: q.quote_number || `Oferta ${q.id.slice(0, 8)}`,
            meta: `Status: ${q.status}`,
            link: `/finance`,
          })),
        },
        {
          key: "contacts-no-phone",
          title: "Kontakty bez telefonu",
          description: "Kontakty firmowe bez numeru telefonu",
          icon: PhoneOff,
          severity: "info",
          issues: (contactsNoPhone.data || []).map((c) => ({
            id: c.id,
            label: c.name,
            link: `/companies`,
          })),
        },
        {
          key: "buildings-no-ibp",
          title: "Obiekty bez ważnego IBP",
          description: "Brakujący lub wygasły Instrukcja Bezpieczeństwa Pożarowego",
          icon: ShieldAlert,
          severity: "critical",
          issues: (buildingsNoIbp.data || []).map((b) => ({
            id: b.id,
            label: b.name,
            meta: b.ibp_valid_until ? `Wygasł: ${b.ibp_valid_until}` : "Brak IBP",
            link: `/buildings/${b.id}`,
          })),
        },
        {
          key: "devices-no-service",
          title: "Urządzenia bez planu serwisu",
          description: "Aktywne urządzenia bez ustawionego terminu kolejnego przeglądu",
          icon: AlertTriangle,
          severity: "warning",
          issues: (devicesNoService.data || []).map((d) => ({
            id: d.id,
            label: d.name,
            link: `/buildings/${d.building_id}/devices`,
          })),
        },
      ];
    },
    refetchInterval: 60000,
  });
}

const severityStyles = {
  critical: "border-destructive/40 bg-destructive/5",
  warning: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-blue-500/40 bg-blue-500/5",
};

const severityIconStyles = {
  critical: "text-destructive",
  warning: "text-yellow-500",
  info: "text-blue-500",
};

export default function SystemAuditPage() {
  const { data: sections, isLoading } = useSystemAudit();

  const totalIssues = sections?.reduce((sum, s) => sum + s.issues.length, 0) ?? 0;
  const criticalCount = sections?.filter((s) => s.severity === "critical")
    .reduce((sum, s) => sum + s.issues.length, 0) ?? 0;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Audyt Systemu
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Health-check procesu: braki danych, sieroty, zaniedbania
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={criticalCount > 0 ? "destructive" : "secondary"}>
            {criticalCount} krytyczne
          </Badge>
          <Badge variant="outline">{totalIssues} łącznie</Badge>
        </div>
      </div>

      {/* Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections?.map((section) => {
          const Icon = section.icon;
          const isClean = section.issues.length === 0;
          return (
            <Card
              key={section.key}
              className={isClean ? "border-green-500/30 bg-green-500/5" : severityStyles[section.severity]}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isClean ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Icon className={`h-5 w-5 ${severityIconStyles[section.severity]}`} />
                    )}
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                  <Badge variant={isClean ? "secondary" : "outline"}>
                    {section.issues.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </CardHeader>
              {!isClean && (
                <CardContent className="pt-0">
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {section.issues.slice(0, 8).map((issue) => (
                      <li key={issue.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{issue.label}</p>
                          {issue.meta && (
                            <p className="truncate text-xs text-muted-foreground">{issue.meta}</p>
                          )}
                        </div>
                        {issue.link && (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Link to={issue.link}>Otwórz</Link>
                          </Button>
                        )}
                      </li>
                    ))}
                    {section.issues.length > 8 && (
                      <li className="text-xs text-muted-foreground italic pt-1">
                        + {section.issues.length - 8} więcej…
                      </li>
                    )}
                  </ul>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
