import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks } from "@/hooks/useSupabaseData";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, AlertTriangle, ExternalLink, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Workflow stages — Faza 2
const WORKFLOW_STAGES = [
  { key: "new",         label: "Nowe",          color: "bg-slate-500",   accent: "border-slate-500/40" },
  { key: "offer",       label: "Wycena",        color: "bg-blue-500",    accent: "border-blue-500/40" },
  { key: "accepted",    label: "Zaakceptowane", color: "bg-purple-500",  accent: "border-purple-500/40" },
  { key: "ordered",     label: "Zamówione",     color: "bg-indigo-500",  accent: "border-indigo-500/40" },
  { key: "delivered",   label: "Dostarczone",   color: "bg-cyan-500",    accent: "border-cyan-500/40" },
  { key: "in_progress", label: "W trakcie",     color: "bg-orange-500",  accent: "border-orange-500/40" },
  { key: "completed",   label: "Wykonane",      color: "bg-green-500",   accent: "border-green-500/40" },
  { key: "invoiced",    label: "Zafakturowane", color: "bg-emerald-700", accent: "border-emerald-700/40" },
] as const;

type WorkflowStage = typeof WORKFLOW_STAGES[number]["key"];

const SOURCE_LABELS: Record<string, string> = {
  audit:   "Audyt",
  service: "Serwis",
  sla:     "SLA",
  manual:  "Ręczne",
};

function useUpdateTaskStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workflow_stage }: { id: string; workflow_stage: WorkflowStage }) => {
      const { data, error } = await (supabase.from as any)("tasks")
        .update({ workflow_stage })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export default function RepairsKanbanPage() {
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useTasks();
  const updateStage = useUpdateTaskStage();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "audit" | "service" | "sla" | "manual">("all");
  const [localTasks, setLocalTasks] = useState<any[]>([]);

  // Tylko naprawy: source w (audit, service, sla)
  const repairs = useMemo(() => {
    return (tasks ?? []).filter((t: any) =>
      ["audit", "service", "sla"].includes(t.source ?? "")
    );
  }, [tasks]);

  // Sync local copy for optimistic DnD
  useEffect(() => {
    setLocalTasks(repairs);
  }, [repairs]);

  const filtered = useMemo(() => {
    return localTasks.filter((t: any) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (t.title ?? "").toLowerCase().includes(q) ||
          (t.buildingName ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [localTasks, search, sourceFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    WORKFLOW_STAGES.forEach((s) => (map[s.key] = []));
    filtered.forEach((t: any) => {
      const stage: WorkflowStage = (t.workflow_stage ?? "new") as WorkflowStage;
      if (!map[stage]) map[stage] = [];
      map[stage].push(t);
    });
    return map;
  }, [filtered]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId as WorkflowStage;
    const movedTask = localTasks.find((t) => t.id === draggableId);
    if (!movedTask) return;
    const oldStage = (movedTask.workflow_stage ?? "new") as WorkflowStage;

    // Optimistic update
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, workflow_stage: newStage } : t))
    );

    try {
      await updateStage.mutateAsync({ id: draggableId, workflow_stage: newStage });
      const newLabel = WORKFLOW_STAGES.find((s) => s.key === newStage)?.label;
      toast.success(`Przeniesiono do: ${newLabel}`);
    } catch (e: any) {
      // Rollback
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, workflow_stage: oldStage } : t))
      );
      toast.error(e?.message ?? "Nie udało się zmienić etapu");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalCount = filtered.length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Wrench className="h-7 w-7 text-orange-500" />
            Naprawy — workflow
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} {totalCount === 1 ? "naprawa" : "napraw"} w pipeline.
            Przeciągnij kartę między kolumnami, aby zmienić etap.
          </p>
        </div>
      </div>

      {/* FILTERS */}
      <Card className="p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po tytule, obiekcie..."
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              <SelectItem value="sla">Z SLA</SelectItem>
              <SelectItem value="audit">Z audytu</SelectItem>
              <SelectItem value="service">Z serwisu</SelectItem>
              <SelectItem value="manual">Ręczne</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* KANBAN */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {WORKFLOW_STAGES.map((stage) => {
            const items = grouped[stage.key] ?? [];
            return (
              <Droppable key={stage.key} droppableId={stage.key}>
                {(provided, snapshot) => (
                  <Card
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "p-3 min-h-[400px] transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5 border-primary/40",
                      stage.accent
                    )}
                  >
                    <div className="flex items-center justify-between mb-3 sticky top-0 bg-card pb-2 border-b">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", stage.color)} />
                        <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                    </div>

                    <div className="space-y-2">
                      {items.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-muted-foreground italic text-center py-4">
                          Brak
                        </p>
                      )}

                      {items.map((t: any, idx: number) => (
                        <Draggable key={t.id} draggableId={t.id} index={idx}>
                          {(provDrag, snapDrag) => (
                            <Card
                              ref={provDrag.innerRef}
                              {...provDrag.draggableProps}
                              {...provDrag.dragHandleProps}
                              className={cn(
                                "p-2.5 cursor-grab active:cursor-grabbing transition",
                                snapDrag.isDragging && "shadow-lg ring-2 ring-primary scale-105"
                              )}
                            >
                              <p className="text-xs font-medium line-clamp-2">{t.title}</p>
                              {t.buildingName && (
                                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                                  📍 {t.buildingName}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-2 gap-1">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1 py-0",
                                    t.source === "sla" && "border-orange-500/50 text-orange-600 dark:text-orange-400",
                                    t.source === "audit" && "border-purple-500/50 text-purple-600 dark:text-purple-400",
                                    t.source === "service" && "border-blue-500/50 text-blue-600 dark:text-blue-400"
                                  )}
                                >
                                  {SOURCE_LABELS[t.source ?? "manual"]}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {t.deadline && (
                                    <span className="text-[9px] text-muted-foreground">
                                      {format(parseISO(t.deadline), "d MMM", { locale: pl })}
                                    </span>
                                  )}
                                  {t.source === "sla" && t.source_id && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/sla/${t.source_id}`);
                                      }}
                                      className="text-muted-foreground hover:text-primary"
                                      title="Otwórz źródłowe SLA"
                                    >
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </Card>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {totalCount === 0 && (
        <Card className="p-8 text-center text-muted-foreground border-dashed">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Brak napraw w pipeline. Naprawy pojawią się tutaj automatycznie po
          oznaczeniu zgłoszeń SLA jako "Naprawiono", lub po skierowaniu zaleceń
          z audytu/serwisu.
        </Card>
      )}
    </div>
  );
}
