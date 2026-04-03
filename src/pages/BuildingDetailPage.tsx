import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useBuildingDetail,
  useBuildingDevices,
  useBuildingTasks,
  useTaskTemplates,
  useDeviceTypes,
  useAddDevice,
  useCreateTaskFromTemplate,
} from "@/hooks/useBuildingData";
import { 
  useUpdateBuilding, useCompanies,
  useDocuments, useUploadDocument, useDeleteDocument 
} from "@/hooks/useSupabaseData";
import { safetyStatusConfig, priorityColors, statusColors, taskTypeLabels } from "@/lib/constants";
import type { SafetyStatus, TaskPriority, TaskStatus, TaskType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Building2, MapPin, Shield, Loader2, Plus,
  CheckCircle2, AlertTriangle, Clock, Wrench, ClipboardList,
  ChevronDown, ChevronRight, Package, Edit, QrCode, Save, Printer, FileText, UploadCloud, FolderOpen, Trash2, Download, Hammer
} from "lucide-react";
import CreateTaskDialog from "@/components/CreateTaskDialog";

function EditBuildingDialog({ building, open, onOpenChange }: { building: any, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: companies } = useCompanies();
  const updateBuilding = useUpdateBuilding();
  const { toast } = useToast();
  
  const [name, setName] = useState(building?.name ?? "");
  const [address, setAddress] = useState(building?.address ?? "");
  const [companyId, setCompanyId] = useState(building?.company_id ?? "");
  const [ibpDate, setIbpDate] = useState(building?.ibp_valid_until || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBuilding.mutate({
      id: building.id,
      updates: { name, address, company_id: companyId, ibp_valid_until: ibpDate || null }
    }, {
      onSuccess: () => {
        toast({ title: "Zaktualizowano dane obiektu" });
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edytuj obiekt</DialogTitle>
            <DialogDescription>Zmień podstawowe informacje o budynku.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Firma / Właściciel</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {companies?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Ważność IBP</Label>
              <Input type="date" value={ibpDate} onChange={e => setIbpDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <button type="submit" disabled={updateBuilding.isPending} className="fire-gradient rounded-md px-4 py-2 text-sm font-semibold text-white flex items-center gap-2">
              {updateBuilding.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz zmiany
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QRCodeDialog({ device, open, onOpenChange }: { device: any, open: boolean, onOpenChange: (o: boolean) => void }) {
  if (!device) return null;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(JSON.stringify({ id: device.id, n: device.name, s: device.serial_number }))}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs text-center border-none bg-white p-8">
        <DialogHeader>
          <DialogTitle className="text-black mb-2">{device.name}</DialogTitle>
          <DialogDescription className="text-gray-500">Zeskanuj kod, aby zidentyfikować urządzenie w systemie.</DialogDescription>
        </DialogHeader>
        <div className="my-6 flex justify-center bg-white p-4 rounded-xl border-2 border-dashed border-gray-100">
          <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
        </div>
        <p className="text-[10px] text-gray-400 font-mono mb-4 uppercase">Serial: {device.serial_number || "BRAK"}</p>
        <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-black transition-colors">
          <Printer className="h-4 w-4" /> Drukuj Etykietę
        </button>
      </DialogContent>
    </Dialog>
  );
}

export default function BuildingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const { data: building, isLoading: loadingBuilding } = useBuildingDetail(id ?? "");
  const { data: devices, isLoading: loadingDevices } = useBuildingDevices(id ?? "");
  const { data: tasks } = useBuildingTasks(id ?? "");
  const { data: templates } = useTaskTemplates(id);
  const { data: deviceTypes } = useDeviceTypes();
  const addDevice = useAddDevice();
  const createFromTemplate = useCreateTaskFromTemplate();

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [qrDevice, setQrDevice] = useState<any>(null);
  const [repairDevice, setRepairDevice] = useState<any>(null);
  
  const { data: documents, isLoading: docsLoading } = useDocuments(id || "");
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();

  const [deviceForm, setDeviceForm] = useState({
    device_type_id: "", name: "", manufacturer: "", model: "",
    serial_number: "", location_in_building: "",
  });

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
  const statusConf = safetyStatusConfig[status] || safetyStatusConfig["bezpieczny"];
  const StatusIcon = statusConf.icon;

  const activeTasks = (tasks ?? []).filter((t: any) => t.status !== "Zamknięte");
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary shrink-0">
              <Building2 className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{building.name}</h1>
                <StatusIcon className={cn("h-6 w-6 shrink-0", statusConf.color)} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{building.companyName}</p>
            </div>
            
            {isSuperAdmin && (
              <button onClick={() => setShowEditBuilding(true)} className="rounded-full bg-secondary p-2.5 hover:bg-primary/20 hover:text-primary transition-colors">
                <Edit className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{building.address}</span>
            </div>
            {building.ibp_valid_until && (
              <div className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                new Date(building.ibp_valid_until) < new Date() ? "bg-critical/10 text-critical" : "bg-success/10 text-success"
              )}>
                <Shield className="h-3.5 w-3.5" /> 
                <span>IBP: {new Date(building.ibp_valid_until).toLocaleDateString("pl-PL")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <EditBuildingDialog building={building} open={showEditBuilding} onOpenChange={setShowEditBuilding} />
      <QRCodeDialog device={qrDevice} open={!!qrDevice} onOpenChange={(o) => !o && setQrDevice(null)} />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Aktywne zadania operacyjne", value: activeTasks.length, icon: ClipboardList, color: "text-primary" },
          { label: "Zadania spóźnione", value: overdueTasks.length, icon: AlertTriangle, color: overdueTasks.length > 0 ? "text-critical" : "text-success" },
          { label: "Zainstalowane urządzenia", value: (devices ?? []).length, icon: Package, color: "text-secondary-foreground" },
          { label: "Urządzenia do serwisu", value: devicesNeedingService.length, icon: Wrench, color: devicesNeedingService.length > 0 ? "text-warning" : "text-success" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-secondary", s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <p className={cn("text-3xl font-extrabold tracking-tight", s.color)}>{s.value}</p>
            </div>
            <p className="text-xs font-semibold text-muted-foreground leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full sm:w-[500px] grid-cols-3 mb-6 bg-secondary p-1 rounded-xl">
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Zadania operacyjne
          </TabsTrigger>
          <TabsTrigger value="devices" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Urządzenia PPOŻ
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Dokumentacja
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-6 mt-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-secondary/30 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Aktywne Zlecenia</h3>
              </div>
            </div>
            <div className="p-4">
              {activeTasks.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground opacity-60">
                  <CheckCircle2 className="h-10 w-10 mb-2" />
                  <p className="text-sm font-semibold">Brak aktywnych zadań</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activeTasks.map((task: any) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="flex flex-col rounded-lg border border-border bg-muted/20 p-4 text-left hover:border-primary/50 hover:bg-secondary/50 transition-all text-card-foreground group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className={cn("inline-block rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider", priorityColors[task.priority as TaskPriority])}>
                          {task.priority}
                        </span>
                        <span className={cn("rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider", statusColors[task.status as TaskStatus])}>
                          {task.status}
                        </span>
                      </div>
                      <span className="text-sm font-bold leading-tight group-hover:text-primary transition-colors">{task.title}</span>
                      <div className="mt-auto pt-4 flex flex-wrap items-center gap-y-2 gap-x-4 text-[11px] font-medium text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> 
                          <span className={cn(task.isOverdue && "text-critical font-bold")}>
                            {task.deadline ? new Date(task.deadline).toLocaleDateString("pl-PL") : "Brak daty"}
                          </span>
                        </div>
                        <span className="truncate max-w-[120px]">• {task.assigneeName}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-secondary/30 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Szablony Cykliczne</h3>
              </div>
            </div>
            <div className="p-4">
              {(templates ?? []).length === 0 ? (
                 <p className="py-6 text-center text-sm font-medium text-muted-foreground opacity-60">Brak zdefiniowanych szablonów cyklicznych prac (Maintenance)</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(templates ?? []).map((tpl: any) => (
                    <div key={tpl.id} className="flex flex-col justify-between rounded-lg border border-border bg-muted/10 p-4">
                      <div>
                        <p className="text-sm font-bold text-card-foreground">{tpl.name}</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1">
                          {taskTypeLabels[tpl.type as TaskType] ?? tpl.type} • Powtarza się co {tpl.recurrence_days} dni
                        </p>
                      </div>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleCreateFromTemplate(tpl)}
                          disabled={createFromTemplate.isPending}
                          className="mt-4 flex items-center justify-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Utwórz natychmiast
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="devices" className="mt-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-secondary/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Ewidencja Urządzeń PPOŻ</h3>
              </div>
              {isSuperAdmin && (
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="flex items-center gap-2 rounded-md fire-gradient px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" /> Wynotuj nowe urządzenie
                </button>
              )}
            </div>
            
            <div className="p-0">
              {loadingDevices ? (
                <div className="py-12"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
              ) : (devices ?? []).length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground opacity-60">
                  <Package className="h-10 w-10 mb-3" />
                  <p className="text-sm font-semibold">Brak wprowadzonych urządzeń. Kliknij "Wynotuj nowe" powyżej.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Urządzenie</th>
                        <th className="px-5 py-3 font-semibold">Lokalizacja</th>
                        <th className="px-5 py-3 font-semibold">Numer Seryjny</th>
                        <th className="px-5 py-3 font-semibold">Następny Serwis</th>
                        <th className="px-5 py-3 font-semibold text-right">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(devices ?? []).map((device: any) => {
                        const needsService = device.next_service_date && new Date(device.next_service_date) <= new Date();
                        return (
                          <tr key={device.id} className="hover:bg-muted/10 transition-colors group">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {needsService ? <AlertTriangle className="h-4 w-4 text-warning shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                                <div>
                                  <p className="font-bold text-card-foreground">{device.name}</p>
                                  <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-mono mt-0.5">{(device as any).device_types?.name ?? "Nieznany Typ"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 font-medium text-muted-foreground">{device.location_in_building || "—"}</td>
                            <td className="px-5 py-4 font-mono text-[11px] text-muted-foreground">{device.serial_number || "—"}</td>
                            <td className="px-5 py-4">
                              <span className={cn(
                                "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold", 
                                needsService ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                              )}>
                                {device.next_service_date || "Brak danych"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button 
                                onClick={() => setQrDevice(device)}
                                className="inline-flex items-center justify-center p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                                title="Karta i Kod QR"
                              >
                                <QrCode className="h-5 w-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-secondary/30 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Dokumentacja Techniczna</h3>
              </div>
              {isSuperAdmin && (
                <div className="relative">
                  <input
                    type="file"
                    id="doc-upload"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          await uploadDoc.mutateAsync({
                            buildingId: id || "",
                            file,
                            name: file.name
                          });
                          toast({ title: "Dokument wgrany pomyślnie" });
                        } catch (err: any) {
                          toast({ title: "Błąd wgrywania", description: err.message, variant: "destructive" });
                        }
                      }
                    }}
                  />
                  <label 
                    htmlFor="doc-upload"
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {uploadDoc.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} 
                    Wgraj plik
                  </label>
                </div>
              )}
            </div>

            <div className="p-0">
              {docsLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : documents && documents.length > 0 ? (
                <div className="divide-y divide-border">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-secondary p-2 rounded-lg text-muted-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-card-foreground">{doc.name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                            <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
                            <span className="h-1 w-1 bg-muted-foreground rounded-full" />
                            <span>Wgrano: {new Date(doc.created_at).toLocaleDateString("pl-PL")} przez {doc.userName}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => window.open(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/building-documents/${doc.file_path}`)}
                          className="p-2 hover:text-primary transition-colors hover:bg-secondary rounded-md"
                          title="Pobierz"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {isSuperAdmin && (
                          <button 
                            onClick={async () => {
                              if (confirm("Czy na pewno chcesz usunąć ten dokument?")) {
                                try {
                                  await deleteDoc.mutateAsync({ id: doc.id, filePath: doc.file_path, buildingId: id || "" });
                                  toast({ title: "Dokument usunięty" });
                                } catch (err: any) {
                                  toast({ title: "Błąd usuwania", description: err.message, variant: "destructive" });
                                }
                              }
                            }}
                            className="p-2 hover:text-critical transition-colors hover:bg-secondary rounded-md"
                            title="Usuń"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h4 className="text-base font-bold text-card-foreground mb-1">Brak wgranych dokumentów</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">W tej sekcji znajdować będą się rzuty pięter oraz plany systemów PPOŻ dla budynku.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Device Dialog */}
      <Dialog open={showAddDevice} onOpenChange={setShowAddDevice}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Wprowadź wpis sprzętowy</DialogTitle>
            <DialogDescription>Zarejestruj gaśnicę, klapę, węzeł hydrantowy lub czujkę w tym obiekcie, by monitorować jej terminy serwisów.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddDevice} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Klasa / Typ *</label>
              <select
                value={deviceForm.device_type_id}
                onChange={(e) => setDeviceForm((f) => ({ ...f, device_type_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Wybierz...</option>
                {(deviceTypes ?? []).map((dt: any) => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Nazwa własna *</label>
              <input
                value={deviceForm.name}
                onChange={(e) => setDeviceForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="np. Gaśnica proszkowa 6kg (G15)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Producent</label>
                <input value={deviceForm.manufacturer} onChange={(e) => setDeviceForm((f) => ({ ...f, manufacturer: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Model</label>
                <input value={deviceForm.model} onChange={(e) => setDeviceForm((f) => ({ ...f, model: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Numer Seryjny / SN</label>
                <input value={deviceForm.serial_number} onChange={(e) => setDeviceForm((f) => ({ ...f, serial_number: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Lokalizacja</label>
                <input value={deviceForm.location_in_building} onChange={(e) => setDeviceForm((f) => ({ ...f, location_in_building: e.target.value }))} className={inputCls} placeholder="np. Parter przy recepcji" />
              </div>
            </div>
            <button
              type="submit"
              disabled={addDevice.isPending}
              className="w-full mt-2 rounded-lg fire-gradient py-3 text-sm font-extrabold text-white shadow-lg hover:shadow-primary/25 disabled:opacity-50 transition-all hover:-translate-y-0.5"
            >
              {addDevice.isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Zarejestruj Urządzenie w Bazie"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(o) => !o && setSelectedTask(null)}
      />
    </div>
  );
}
