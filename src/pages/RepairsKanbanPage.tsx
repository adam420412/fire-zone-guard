import { useMemo, useState } from "react";
import { useTasks, useUpdateTask } from "@/hooks/useSupabaseData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";

// Workflow stages from PDF (Faza 2 — Naprawy & oferty)
// new → offer → accepted → ordered → delivered → in_progress → completed → invoiced
const WORKFLOW_STAGES = [
  { key: "new",         label: "Nowe",        color: "bg-slate-500"  },
  { key: "offer",       label: "Wycena",      color: "bg-blue-500"   },
  { key: "accepted",    label: "Zaakceptowane",color: "bg-purple-500" },
  { key: "ordered",     label: "Zamówione",   color: "bg-indigo-500" },
  { key: "delivered",   label: "Dostarczone", color: "bg-cyan-500"   },
  { key: "in_progress", label: "W trakcie",   color: "bg-orange-500" },
  { key: "completed",   label: "Wykonane",    color: "bg-green-500"  },
  { key: "invoiced",    label: "Zafakturowane",color: "bg-emerald-700"},
] as const;

type WorkflowStage = typeof WORKFLOW_STAGES[number]["key"];

export default function RepairsKanbanPage() {
  const { data: tasks, isLoading } = useTasks();

  // Tylko zadania o source = audit | service | sla (Faza 2 — naprawy z audytu/serwisu/SLA)
  const repairs = useMemo(() => {
    return (tasks ?? []).filter((t: any) =>
      ["audit", "service", "sla"].includes(t.source ?? "")
    );
  }, [tasks]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    WORKFLOW_STAGES.forEach((s) => (map[s.key] = []));
    repairs.forEach((t: any) => {
      const stage: WorkflowStage = t.workflow_stage ?? "new";
      if (!map[stage]) map[stage] = [];
      map[stage].push(t);
    });
    return map;
  }, [repairs]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Wrench className="h-7 w-7 text-orange-500" />
          Naprawy — workflow
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pełny cykl: nowe → oferta → akceptacja → zamówienie → dostawa → wykonanie → faktura.
          Źródła: audyty, serwis, SLA.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {WORKFLOW_STAGES.map((stage) => {
          const items = grouped[stage.key] ?? [];
          return (
            <Card key={stage.key} className="p-3 min-h-[400px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", stage.color)} />
                  <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                </div>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    Brak
                  </p>
                ) : (
                  items.map((t: any) => (
                    <Card key={t.id} className="p-2.5 hover:shadow-md cursor-pointer transition">
                      <p className="text-xs font-medium line-clamp-2">{t.title}</p>
                      {t.buildingName && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{t.buildingName}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 gap-1">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {t.source}
                        </Badge>
                        {t.deadline && (
                          <span className="text-[9px] text-muted-foreground">
                            {format(parseISO(t.deadline), "d MMM", { locale: pl })}
                          </span>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Scaffold Faza 2</p>
            <p className="text-muted-foreground mt-1">
              Widok bazowy gotowy. Drag & drop, integracja z ofertami (sales:create-asset),
              automatyczna eskalacja z SLA → "Naprawiono" → tworzy zadanie typu "naprawa" w stage "new"
              do dorobienia w kolejnej iteracji.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
