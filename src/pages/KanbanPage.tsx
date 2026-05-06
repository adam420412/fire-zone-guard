import { useState, useCallback, useEffect, useMemo } from "react";
import { useTasks, useUpdateTask } from "@/hooks/useSupabaseData";
import { kanbanStatuses, statusColors } from "@/lib/constants";
import type { TaskStatus } from "@/lib/constants";
import TaskCard from "@/components/TaskCard";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import CreateTaskDialog from "@/components/CreateTaskDialog";
import { cn } from "@/lib/utils";
import { Filter, Search, Plus, Download, ArrowUpDown, LayoutGrid, List as ListIcon, FileText } from "lucide-react";
import { KanbanSkeleton } from "@/components/PageSkeleton";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { formatRelative } from "@/lib/relativeTime";

type SortMode = "deadline" | "priority" | "created" | "title" | "updated";
type GroupMode = "none" | "building" | "assignee";
type DueFilter = "all" | "overdue" | "today" | "week";
type QuoteFilter = "all" | "any" | "none" | "draft" | "sent" | "accepted" | "rejected" | "expired";
type RecencyFilter = "all" | "24h" | "7d" | "30d";
type ViewMode = "kanban" | "list";

const PRIORITY_RANK: Record<string, number> = { krytyczny: 0, wysoki: 1, "średni": 2, niski: 3 };

// Skróty statusów ofert (zgodnie z TaskCard)
const QUOTE_FILTER_LABELS: Record<Exclude<QuoteFilter, "all" | "any" | "none">, string> = {
  draft: "Wersja robocza",
  sent: "Wysłana",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  expired: "Wygasła",
};

// "Ostatnia aktywność" zadania = max(created_at, quoteUpdatedAt)
function taskLastActivityMs(t: any): number {
  const created = t.created_at ? new Date(t.created_at).getTime() : 0;
  const quote = t.quoteUpdatedAt ? new Date(t.quoteUpdatedAt).getTime() : 0;
  return Math.max(created, quote);
}

export default function KanbanPage() {
  const { data: tasks, isLoading } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [groupValueFilter, setGroupValueFilter] = useState<string>("all");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("all");
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  // Local state for optimistic drag & drop
  const [localTasks, setLocalTasks] = useState<any[]>([]);

  useEffect(() => {
    if (tasks) {
      setLocalTasks(tasks);
    }
  }, [tasks]);

  // Reset value filter when group mode changes
  useEffect(() => {
    setGroupValueFilter("all");
  }, [groupMode]);

  // Compute available group values (buildings or assignees) from current dataset
  const groupValueOptions = useMemo(() => {
    if (groupMode === "none") return [];
    const set = new Map<string, number>();
    localTasks.forEach((t: any) => {
      const key = groupMode === "building"
        ? (t.buildingName || "— bez obiektu —")
        : (t.assigneeName || "— nieprzypisane —");
      set.set(key, (set.get(key) ?? 0) + 1);
    });
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pl"))
      .map(([label, count]) => ({ label, count }));
  }, [localTasks, groupMode]);

  const isWithinRange = (deadline: string | null | undefined, status: string) => {
    if (dueFilter === "all") return true;
    if (!deadline) return false;
    const d = new Date(deadline);
    const now = new Date();
    const isClosed = status === "Zamknięte";
    if (dueFilter === "overdue") return !isClosed && d < now;
    if (dueFilter === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (dueFilter === "week") {
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      return d >= now && d <= in7;
    }
    return true;
  };

  const filteredTasks = localTasks.filter((t: any) => {
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assigneeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.buildingName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
    const matchesDue = isWithinRange(t.deadline, t.status);
    const matchesGroupValue = groupValueFilter === "all" || groupMode === "none" || (
      groupMode === "building"
        ? (t.buildingName || "— bez obiektu —") === groupValueFilter
        : (t.assigneeName || "— nieprzypisane —") === groupValueFilter
    );
    return matchesSearch && matchesPriority && matchesDue && matchesGroupValue;
  });

  const handleExportCSV = () => {
    const headers = ["ID", "Tytul", "Obiekt", "Przypisany", "Priorytet", "Status", "Deadline", "Typ"];
    const rows = filteredTasks.map((t: any) => [
      t.id.slice(0, 8),
      `"${t.title.replace(/"/g, '""')}"`,
      `"${(t.buildingName || "").replace(/"/g, '""')}"`,
      `"${(t.assigneeName || "").replace(/"/g, '""')}"`,
      t.priority,
      t.status,
      t.deadline || "",
      t.type
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `firezone_zadania_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortTasks = useCallback((arr: any[]) => {
    const sorted = [...arr];
    if (sortMode === "deadline") {
      sorted.sort((a, b) => {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return ad - bd;
      });
    } else if (sortMode === "priority") {
      sorted.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
    } else if (sortMode === "title") {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", "pl"));
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [sortMode]);

  const getTasksForStatus = useCallback((status: TaskStatus) => {
    return sortTasks(filteredTasks.filter((t: any) => t.status === status));
  }, [filteredTasks, sortTasks]);

  // Group rendering helper — returns sections [{key, label, tasks}]
  const groupTasks = useCallback((statusTasks: any[]) => {
    if (groupMode === "none") return [{ key: "_all", label: "", tasks: statusTasks }];
    const map = new Map<string, { key: string; label: string; tasks: any[] }>();
    statusTasks.forEach((t) => {
      const key = groupMode === "building"
        ? (t.buildingName || "— bez obiektu —")
        : (t.assigneeName || "— nieprzypisane —");
      const entry = map.get(key) ?? { key, label: key, tasks: [] };
      entry.tasks.push(t);
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }, [groupMode]);

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as TaskStatus;

    // Optimistic UI Update
    setLocalTasks(prev => 
      prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t)
    );

    updateTask(
      { id: draggableId, status: newStatus },
      {
        onError: () => {
          toast.error("Nie udało się zaktualizować statusu zadania.");
          // Revert optimistic update
          if (tasks) setLocalTasks(tasks);
        }
      }
    );
  };

  if (isLoading) return <KanbanSkeleton />;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban zadań</h1>
          <p className="text-sm text-muted-foreground">Globalny widok wszystkich zadań operacyjnych</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 focus-within:border-primary transition-colors">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj..."
              className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
          >
            <option value="all">Priorytety: Wszystkie</option>
            <option value="krytyczny">Krytyczny</option>
            <option value="wysoki">Wysoki</option>
            <option value="średni">Średni</option>
            <option value="niski">Niski</option>
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
            title="Sortowanie kart w kolumnie"
          >
            <option value="deadline">Sort: Termin</option>
            <option value="priority">Sort: Priorytet</option>
            <option value="created">Sort: Data utworzenia</option>
            <option value="title">Sort: Tytuł A-Z</option>
          </select>
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
            title="Grupowanie zadań w kolumnie"
          >
            <option value="none">Grupuj: brak</option>
            <option value="building">Grupuj: Obiekt</option>
            <option value="assignee">Grupuj: Wykonawca</option>
          </select>
          {groupMode !== "none" && groupValueOptions.length > 0 && (
            <select
              value={groupValueFilter}
              onChange={(e) => setGroupValueFilter(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer max-w-[220px]"
              title={groupMode === "building" ? "Filtr: Obiekt" : "Filtr: Wykonawca"}
            >
              <option value="all">
                {groupMode === "building" ? "Obiekt: Wszystkie" : "Wykonawca: Wszyscy"}
              </option>
              {groupValueOptions.map((g) => (
                <option key={g.label} value={g.label}>{g.label} ({g.count})</option>
              ))}
            </select>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Download className="h-4 w-4" />
            Eksportuj
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-md fire-gradient px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nowe zadanie
          </button>
        </div>
      </div>

      {/* Quick due-date filter chips */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
          Termin:
        </span>
        {([
          { key: "all", label: "Wszystkie" },
          { key: "overdue", label: "Przeterminowane" },
          { key: "today", label: "Dziś" },
          { key: "week", label: "7 dni" },
        ] as { key: DueFilter; label: string }[]).map((opt) => {
          const active = dueFilter === opt.key;
          const count = (() => {
            if (opt.key === "all") return localTasks.length;
            return localTasks.filter((t: any) => {
              if (!t.deadline) return false;
              const d = new Date(t.deadline);
              const now = new Date();
              const closed = t.status === "Zamknięte";
              if (opt.key === "overdue") return !closed && d < now;
              if (opt.key === "today") return d.toDateString() === now.toDateString();
              if (opt.key === "week") {
                const in7 = new Date(); in7.setDate(in7.getDate() + 7);
                return d >= now && d <= in7;
              }
              return false;
            }).length;
          })();
          return (
            <button
              key={opt.key}
              onClick={() => setDueFilter(opt.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                active
                  ? opt.key === "overdue"
                    ? "border-critical/50 bg-critical/15 text-critical"
                    : "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card hover:bg-secondary text-muted-foreground"
              )}
            >
              {opt.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                active ? "bg-background/40" : "bg-muted/60"
              )}>
                {count}
              </span>
            </button>
          );
        })}
        {(dueFilter !== "all" || groupValueFilter !== "all" || filterPriority !== "all" || search) && (
          <button
            onClick={() => {
              setDueFilter("all");
              setGroupValueFilter("all");
              setFilterPriority("all");
              setSearch("");
            }}
            className="ml-2 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Wyczyść filtry
          </button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto pb-4 select-none">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 min-w-max h-full">
            {kanbanStatuses.map((status) => {
              const columnTasks = getTasksForStatus(status);
              return (
                <div key={status} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card/40">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusColors[status])}>
                      {status}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground/60">{columnTasks.length}</span>
                  </div>
                  
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin min-h-[150px] max-h-[calc(100vh-250px)] transition-colors duration-200",
                          snapshot.isDraggingOver && "bg-secondary/30"
                        )}
                      >
                        {(() => {
                          const groups = groupTasks(columnTasks);
                          const nodes: JSX.Element[] = [];
                          let runningIndex = 0;
                          groups.forEach((group) => {
                            if (groupMode !== "none") {
                              nodes.push(
                                <div
                                  key={`hdr-${group.key}`}
                                  className="sticky top-0 z-10 flex items-center justify-between bg-card/80 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border"
                                >
                                  <span className="truncate">{group.label}</span>
                                  <span className="ml-2 shrink-0">{group.tasks.length}</span>
                                </div>
                              );
                            }
                            group.tasks.forEach((task: any) => {
                              const realIndex = runningIndex++;
                              nodes.push(
                                <Draggable key={task.id} draggableId={task.id} index={realIndex}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={cn(
                                        "transition-transform",
                                        snapshot.isDragging && "opacity-90 shadow-2xl scale-105 z-50 ring-2 ring-primary/50"
                                      )}
                                      style={{ ...provided.draggableProps.style }}
                                    >
                                      <TaskCard task={task} onClick={() => setSelectedTask(task)} />
                                    </div>
                                  )}
                                </Draggable>
                              );
                            });
                          });
                          return nodes;
                        })()}
                        {provided.placeholder}
                        {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                            <Filter className="h-8 w-8 mb-2" />
                            <p className="text-[11px] font-medium">Brak zadań</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      <CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
    </div>
  );
}
