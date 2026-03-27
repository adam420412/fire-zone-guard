import { useState, useCallback, useEffect } from "react";
import { useTasks, useUpdateTask } from "@/hooks/useSupabaseData";
import { kanbanStatuses, statusColors } from "@/lib/constants";
import type { TaskStatus } from "@/lib/constants";
import TaskCard from "@/components/TaskCard";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import CreateTaskDialog from "@/components/CreateTaskDialog";
import { cn } from "@/lib/utils";
import { Filter, Search, Plus, Download } from "lucide-react";
import { KanbanSkeleton } from "@/components/PageSkeleton";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";

export default function KanbanPage() {
  const { data: tasks, isLoading } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  // Local state for optimistic drag & drop
  const [localTasks, setLocalTasks] = useState<any[]>([]);

  useEffect(() => {
    if (tasks) {
      setLocalTasks(tasks);
    }
  }, [tasks]);

  const filteredTasks = localTasks.filter((t: any) => {
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assigneeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.buildingName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
    return matchesSearch && matchesPriority;
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

  const getTasksForStatus = useCallback((status: TaskStatus) => {
    return filteredTasks.filter((t: any) => t.status === status);
  }, [filteredTasks]);

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
                        {columnTasks.map((task: any, index: number) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "transition-transform",
                                  snapshot.isDragging && "opacity-90 shadow-2xl scale-105 z-50 ring-2 ring-primary/50"
                                )}
                                style={{
                                  ...provided.draggableProps.style,
                                }}
                              >
                                <TaskCard task={task} onClick={() => setSelectedTask(task)} />
                              </div>
                            )}
                          </Draggable>
                        ))}
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
