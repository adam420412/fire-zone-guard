import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useBuildingDetail,
  useBuildingDevices,
  useBuildingTasks,
  useTaskTemplates,
  useDeviceTypes,
  useAddDevice,
  useCreateTaskFromTemplate,
} from "@/hooks/useBuildingData";
import { safetyStatusConfig, priorityColors, statusColors, taskTypeLabels } from "@/lib/constants";
import type { SafetyStatus, TaskPriority, TaskStatus, TaskType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Building2, MapPin, Shield, Loader2, Plus,
  CheckCircle2, AlertTriangle, Clock, Wrench, ClipboardList,
  ChevronDown, ChevronRight, Package,
} from "lucide-react";

export default function BuildingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: building, isLoading: loadingBuilding } = useBuildingDetail(id ?? "");
  const { data: devices, isLoading: loadingDevices } = useBuildingDevices(id ?? "");
  const { data: tasks } = useBuildingTasks(id ?? "");
  const { data: templates } = useTaskTemplates(id);
  const { data: deviceTypes } = useDeviceTypes();
  const addDevice = useAddDevice();
  const createFromTemplate = useCreateTaskFromTemplate();

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tasks: true, devices: true, templates: true,
  });
  const [deviceForm, setDeviceForm] = useState({
    device_type_id: "", name: "", manufacturer: "", model: "",
    serial_number: "", location_in_building: "",
  });

  const toggleSection = (key: string) =>
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));

  if (loadingBuilding) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!building) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground">Nie znaleziono obiektu</p>
        <button onClick={() => navigate("/buildings")} className="text-primary underline text-sm">Wróć do listy</button>
      </div>
    );
  }

  const status = (building.safetyStatus ?? "bezpieczny") as SafetyStatus;
  const statusConf = safetyStatusConfig[status];
  const StatusIcon = statusConf.icon;

  const activeTasks = (tasks ?? []).filter((t: any) => t.status !== "Zamknięte");
  const closedTasks = (tasks ?? []).filter((t: any) => t.status === "Zamknięte");
  const overdueTasks = activeTasks.filter((t: any) => t.isOverdue);
  const devicesNeedingService = (devices ?? []).filter(
    (d: any) => d.next_service_date && new Date(d.next_service_date) <= new Date()
  );

  const handleCreateFromTemplate = async (template: any) => {
    try {
      await createFromTemplate.mutateAsync({
        template,
        buildingId: id!,
        companyId: building.company_id,
      });
      toast({ title: "Zadanie utworzone z szablonu!" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.device_type_id || !deviceForm.name.trim()) {
      toast({ title: "Wypełnij wymagane pola", variant: "destructive" });
      return;
    }
    try {
      await addDevice.mutateAsync({ ...deviceForm, building_id: id! });
      toast({ title: "Urządzenie dodane!" });
      setShowAddDevice(false);
      setDeviceForm({ device_type_id: "", name: "", manufacturer: "", model: "", serial_number: "", location_in_building: "" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/buildings")} className="mt-1 rounded-md p-1.5 hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Building2 className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{building.name}</h1>
              <p className="text-sm text-muted-foreground">{building.companyName}</p>
            </div>
            <StatusIcon className={cn("h-6 w-6 ml-2", statusConf.color)} />
            <span className={cn("text-sm font-semibold", statusConf.color)}>{statusConf.label}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{building.address}</span>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Aktywne zadania", value: activeTasks.length, icon: ClipboardList, color: "text-primary" },
          { label: "Zaległe", value: overdueTasks.length, icon: AlertTriangle, color: overdueTasks.length > 0 ? "text-critical" : "text-success" },
          { label: "Urządzenia", value: (devices ?? []).length, icon: Package, color: "text-secondary-foreground" },
          { label: "Do serwisu", value: devicesNeedingService.length, icon: Wrench, color: devicesNeedingService.length > 0 ? "text-warning" : "text-success" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={cn("mt-1 text-2xl font-bold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* === TASKS SECTION === */}
      <Section
        title="Zadania"
        icon={ClipboardList}
        count={activeTasks.length}
        expanded={expandedSections.tasks}
        onToggle={() => toggleSection("tasks")}
      >
        {activeTasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Brak aktywnych zadań</p>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task: any) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="w-full rounded-md border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", priorityColors[task.priority as TaskPriority])}>
                      {task.priority}
                    </span>
                    <span className="text-sm font-medium text-card-foreground">{task.title}</span>
                  </div>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", statusColors[task.status as TaskStatus])}>
                    {task.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{taskTypeLabels[task.type as TaskType] ?? task.type}</span>
                  <span>• {task.assigneeName}</span>
                  {task.isOverdue && (
                    <span className="flex items-center gap-1 text-critical">
                      <AlertTriangle className="h-3 w-3" /> Przeterminowane
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        {closedTasks.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">+ {closedTasks.length} zamkniętych zadań</p>
        )}
      </Section>

      {/* === DEVICES SECTION === */}
      <Section
        title="Urządzenia PPOŻ"
        icon={Package}
        count={(devices ?? []).length}
        expanded={expandedSections.devices}
        onToggle={() => toggleSection("devices")}
        action={
          <button
            onClick={() => setShowAddDevice(true)}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3 w-3" /> Dodaj
          </button>
        }
      >
        {loadingDevices ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
        ) : (devices ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Brak urządzeń – dodaj pierwsze urządzenie</p>
        ) : (
          <div className="space-y-2">
            {(devices ?? []).map((device: any) => {
              const needsService = device.next_service_date && new Date(device.next_service_date) <= new Date();
              return (
                <div key={device.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/50 p-3">
                  <div className="flex items-center gap-3">
                    {needsService ? (
                      <Wrench className="h-4 w-4 text-warning" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(device as any).device_types?.name ?? "—"}
                        {device.location_in_building ? ` • ${device.location_in_building}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-xs font-semibold", needsService ? "text-warning" : "text-muted-foreground")}>
                      {needsService ? "Wymaga serwisu" : "Sprawny"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {device.next_service_date
                        ? `Serwis: ${device.next_service_date}`
                        : "Brak daty serwisu"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* === TEMPLATES SECTION === */}
      <Section
        title="Szablony zadań"
        icon={ClipboardList}
        count={(templates ?? []).length}
        expanded={expandedSections.templates}
        onToggle={() => toggleSection("templates")}
      >
        {(templates ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Brak szablonów</p>
        ) : (
          <div className="space-y-2">
            {(templates ?? []).map((tpl: any) => (
              <div key={tpl.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/50 p-3">
                <div>
                  <p className="text-sm font-medium text-card-foreground">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {taskTypeLabels[tpl.type as TaskType] ?? tpl.type}
                    {(tpl as any).device_types?.name ? ` • ${(tpl as any).device_types.name}` : ""}
                    {" • "}Co {tpl.recurrence_days} dni
                    {tpl.is_global ? " • Globalny" : " • Lokalny"}
                  </p>
                </div>
                <button
                  onClick={() => handleCreateFromTemplate(tpl)}
                  disabled={createFromTemplate.isPending}
                  className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> Utwórz
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Add Device Dialog */}
      <Dialog open={showAddDevice} onOpenChange={setShowAddDevice}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Dodaj urządzenie</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDevice} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Typ urządzenia *</label>
              <select
                value={deviceForm.device_type_id}
                onChange={(e) => setDeviceForm((f) => ({ ...f, device_type_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Wybierz typ...</option>
                {(deviceTypes ?? []).map((dt: any) => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nazwa / oznaczenie *</label>
              <input
                value={deviceForm.name}
                onChange={(e) => setDeviceForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="np. Gaśnica GP-6 – korytarz parter"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Producent</label>
                <input value={deviceForm.manufacturer} onChange={(e) => setDeviceForm((f) => ({ ...f, manufacturer: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <input value={deviceForm.model} onChange={(e) => setDeviceForm((f) => ({ ...f, model: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nr seryjny</label>
                <input value={deviceForm.serial_number} onChange={(e) => setDeviceForm((f) => ({ ...f, serial_number: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Lokalizacja w obiekcie</label>
                <input value={deviceForm.location_in_building} onChange={(e) => setDeviceForm((f) => ({ ...f, location_in_building: e.target.value }))} className={inputCls} placeholder="np. Piętro 2, korytarz" />
              </div>
            </div>
            <button
              type="submit"
              disabled={addDevice.isPending}
              className="w-full rounded-md fire-gradient py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {addDevice.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Dodaj urządzenie"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Task Detail */}
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(o) => !o && setSelectedTask(null)}
      />
    </div>
  );
}

// Collapsible section component
function Section({
  title, icon: Icon, count, expanded, onToggle, action, children,
}: {
  title: string;
  icon: any;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-card-foreground">{title}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </button>
      {expanded && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
