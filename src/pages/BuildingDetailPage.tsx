import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useBuildingDetail,
  useBuildingDevices,
  useBuildingTasks,
  useTaskTemplates,
  useDeviceTypes,
  useAddDevice,
  useUpdateDevice,
  useDeleteDevice,
  useCreateTaskFromTemplate,
  useBuildingContacts,
  useCreateBuildingContact,
  useUpdateBuildingContact,
  useDeleteBuildingContact,
  type BuildingContact,
} from "@/hooks/useBuildingData";
import {
  useUpdateBuilding, useCompanies,
  useDocuments, useUploadDocument, useDeleteDocument
} from "@/hooks/useSupabaseData";
import { useExtractPdfMetadata } from "@/hooks/useExtractPdfMetadata";
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
  ChevronRight, Package, Edit, QrCode, Save, Printer, FileText, UploadCloud, FolderOpen, Trash2, Download, Hammer,
  Sparkles, Users, Mail, Phone, Star, Siren, Tag,
  ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { BUILDING_DOCUMENT_CATEGORIES, BUILDING_DOCUMENT_CATEGORY_LABELS, type BuildingDocumentCategory } from "@/lib/constants";
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

// ---- Iter 9: edit/delete device (super_admin) ----
function EditDeviceDialog({
  device, buildingId, open, onOpenChange,
}: { device: any | null; buildingId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: deviceTypes } = useDeviceTypes();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();
  const { toast } = useToast();

  const [form, setForm] = useState({
    device_type_id: "",
    name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    location_in_building: "",
    installed_at: "",
    next_service_date: "",
  });

  useEffect(() => {
    if (!device) return;
    setForm({
      device_type_id: device.device_type_id ?? "",
      name: device.name ?? "",
      manufacturer: device.manufacturer ?? "",
      model: device.model ?? "",
      serial_number: device.serial_number ?? "",
      location_in_building: device.location_in_building ?? "",
      installed_at: device.installed_at ? String(device.installed_at).slice(0, 10) : "",
      next_service_date: device.next_service_date ? String(device.next_service_date).slice(0, 10) : "",
    });
  }, [device?.id]);

  if (!device) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "Nazwa urządzenia jest wymagana", variant: "destructive" }); return; }
    try {
      await updateDevice.mutateAsync({
        id: device.id,
        building_id: buildingId,
        updates: {
          device_type_id: form.device_type_id || null,
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim() || null,
          model: form.model.trim() || null,
          serial_number: form.serial_number.trim() || null,
          location_in_building: form.location_in_building.trim() || null,
          installed_at: form.installed_at || null,
          next_service_date: form.next_service_date || null,
        },
      });
      toast({ title: "Urządzenie zaktualizowane" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Błąd zapisu", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Usunąć urządzenie „${device.name}"? Operacja nieodwracalna.`)) return;
    try {
      await deleteDevice.mutateAsync({ id: device.id, building_id: buildingId });
      toast({ title: "Urządzenie usunięte" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Błąd", description: err?.message ?? "", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Edytuj urządzenie — {device.name}</DialogTitle>
            <DialogDescription>Zmień typ, lokalizację, daty serwisu lub numer seryjny.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label>Typ urządzenia</Label>
              <Select value={form.device_type_id} onValueChange={v => setForm({ ...form, device_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz typ..." /></SelectTrigger>
                <SelectContent>
                  {(deviceTypes ?? []).map((dt: any) => (
                    <SelectItem key={dt.id} value={dt.id}>{dt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nazwa *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Producent</Label>
                <Input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nr seryjny</Label>
                <Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Lokalizacja</Label>
                <Input value={form.location_in_building} onChange={e => setForm({ ...form, location_in_building: e.target.value })} placeholder="np. piętro 2, sala 204" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data instalacji</Label>
                <Input type="date" value={form.installed_at} onChange={e => setForm({ ...form, installed_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Następny serwis</Label>
                <Input type="date" value={form.next_service_date} onChange={e => setForm({ ...form, next_service_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={handleDelete} disabled={deleteDevice.isPending || updateDevice.isPending}>
              {deleteDevice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Usuń
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button type="submit" disabled={updateDevice.isPending || deleteDevice.isPending}>
                {updateDevice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Zapisz
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Iter 6 — Książka adresowa per obiekt (kontakty + osoby funkcyjne)
// Spec PDF str. 6: pełna lista osób z @ + tel + zakres odpowiedzialności.
// Główny kontakt + kontakt awaryjny mają specjalne flagi (max 1 each).
// =============================================================================
function ContactFormDialog({
  buildingId,
  contact,
  open,
  onOpenChange,
}: {
  buildingId: string;
  contact: BuildingContact | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isEdit = !!contact;
  const create = useCreateBuildingContact();
  const update = useUpdateBuildingContact();
  const { toast } = useToast();

  const [form, setForm] = useState({
    full_name: "",
    role: "",
    responsibility: "",
    email: "",
    phone: "",
    is_primary: false,
    is_emergency: false,
    notes: "",
  });

  // Reset form whenever dialog opens with a (different) contact
  useEffect(() => {
    if (open) {
      if (contact) {
        setForm({
          full_name: contact.full_name,
          role: contact.role,
          responsibility: contact.responsibility ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          is_primary: contact.is_primary,
          is_emergency: contact.is_emergency,
          notes: contact.notes ?? "",
        });
      } else {
        setForm({ full_name: "", role: "", responsibility: "", email: "", phone: "", is_primary: false, is_emergency: false, notes: "" });
      }
    }
  }, [open, contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.role.trim()) {
      toast({ title: "Imię i rola są wymagane", variant: "destructive" });
      return;
    }
    try {
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, building_id: buildingId, updates: form });
        toast({ title: "Zaktualizowano kontakt" });
      } else {
        await create.mutateAsync({ building_id: buildingId, ...form });
        toast({ title: "Dodano kontakt" });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const isPending = create.isPending || update.isPending;
  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj kontakt" : "Nowy kontakt"}</DialogTitle>
          <DialogDescription>
            Osoba funkcyjna / odpowiedzialna za bezpieczeństwo obiektu (zarządca, BHP, konserwator…).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Imię i nazwisko *</label>
              <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className={inputCls} required />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Rola *</label>
              <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="np. Inspektor BHP, Zarządca" required />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Zakres odpowiedzialności</label>
            <Textarea
              value={form.responsibility}
              onChange={(e) => setForm((f) => ({ ...f, responsibility: e.target.value }))}
              placeholder="Za co konkretnie odpowiada w obiekcie"
              rows={2}
              className="bg-secondary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="kontakt@przyklad.pl" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Telefon</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+48 600 000 000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 cursor-pointer hover:border-primary/50">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-xs font-bold">Główny kontakt</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 cursor-pointer hover:border-primary/50">
              <input
                type="checkbox"
                checked={form.is_emergency}
                onChange={(e) => setForm((f) => ({ ...f, is_emergency: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Siren className="h-4 w-4 text-critical" />
              <span className="text-xs font-bold">Awaryjny 24/7</span>
            </label>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider block mb-1.5">Notatka</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="bg-secondary"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEdit ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactsTab({ buildingId, isSuperAdmin }: { buildingId: string; isSuperAdmin: boolean }) {
  const { data: contacts, isLoading } = useBuildingContacts(buildingId);
  const deleteContact = useDeleteBuildingContact();
  const { toast } = useToast();
  const [editing, setEditing] = useState<BuildingContact | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const handleDelete = async (c: BuildingContact) => {
    if (!confirm(`Usunąć kontakt: ${c.full_name}?`)) return;
    try {
      await deleteContact.mutateAsync({ id: c.id, building_id: buildingId });
      toast({ title: "Kontakt usunięty" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-secondary/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Książka adresowa obiektu</h3>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => { setEditing(null); setShowAdd(true); }} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Dodaj kontakt
          </Button>
        )}
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (contacts ?? []).length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground opacity-60 text-center">
            <Users className="h-10 w-10 mb-3" />
            <p className="text-sm font-semibold mb-1">Brak osób funkcyjnych</p>
            <p className="text-xs max-w-sm">
              Dodaj zarządcę, inspektora BHP, konserwatora i kontakty awaryjne.
              Spec PDF wymaga książki adresowej z @ + tel. + zakres odpowiedzialności.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(contacts ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-muted/10 p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-card-foreground">{c.full_name}</p>
                      {c.is_primary && (
                        <Badge className="gap-1 bg-yellow-500/15 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/20" variant="outline">
                          <Star className="h-3 w-3" /> główny
                        </Badge>
                      )}
                      {c.is_emergency && (
                        <Badge className="gap-1 bg-critical/15 text-critical border-critical/30 hover:bg-critical/20" variant="outline">
                          <Siren className="h-3 w-3" /> 24/7
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.role}</p>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(c); setShowAdd(true); }} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-critical transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {c.responsibility && (
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{c.responsibility}</p>
                )}

                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/40 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="font-mono truncate">{c.email}</span>
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="font-mono">{c.phone}</span>
                    </a>
                  )}
                  {c.notes && (
                    <p className="text-[11px] text-muted-foreground/80 italic mt-1">{c.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ContactFormDialog
        buildingId={buildingId}
        contact={editing}
        open={showAdd}
        onOpenChange={(o) => { setShowAdd(o); if (!o) setEditing(null); }}
      />
    </div>
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
  const [editDeviceTarget, setEditDeviceTarget] = useState<any>(null);
  const [editDeviceOpen, setEditDeviceOpen] = useState(false);
  
  const { data: documents, isLoading: docsLoading } = useDocuments(id || "");
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  const extractMeta = useExtractPdfMetadata();
  // Faza 4 — AI ekstrakcja metadanych z PDF: dialog z wynikiem.
  const [extractTarget, setExtractTarget] = useState<{ id: string; name: string } | null>(null);

  const runExtract = async (doc: { id: string; name: string }) => {
    setExtractTarget({ id: doc.id, name: doc.name });
    extractMeta.reset();
    try {
      await extractMeta.mutateAsync(doc.id);
    } catch (err: any) {
      toast({
        title: "AI nie zdołało odczytać dokumentu",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const [deviceForm, setDeviceForm] = useState({
    device_type_id: "", name: "", manufacturer: "", model: "",
    serial_number: "", location_in_building: "",
  });

  // Iter 6 — kategoryzacja dokumentów: aktywny filtr + wybór kategorii uploadu
  const [docFilter, setDocFilter] = useState<BuildingDocumentCategory | null>(null);
  const [uploadCategory, setUploadCategory] = useState<BuildingDocumentCategory>("inne");
  const filteredDocuments = (documents ?? []).filter(
    (d: any) => docFilter === null || (d.category ?? "inne") === docFilter
  );

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
      <EditDeviceDialog
        device={editDeviceTarget}
        buildingId={id ?? ""}
        open={editDeviceOpen}
        onOpenChange={(o) => { setEditDeviceOpen(o); if (!o) setEditDeviceTarget(null); }}
      />

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
        <TabsList className="grid w-full sm:w-[680px] grid-cols-4 mb-6 bg-secondary p-1 rounded-xl">
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Zadania operacyjne
          </TabsTrigger>
          <TabsTrigger value="devices" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Urządzenia PPOŻ
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Dokumentacja
          </TabsTrigger>
          <TabsTrigger value="contacts" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs font-semibold py-2">
            Kontakty
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

        <TabsContent value="devices" className="mt-0 space-y-3">
          <button
            onClick={() => navigate(`/buildings/${id}/devices`)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors px-5 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-bold">Master checklist + silnik sugestii</p>
                <p className="text-xs text-muted-foreground">
                  9 kategorii ppoż. (G/H/SSP/PWP/Oś. awar./DSO/Drzwi/Klapy/Oddymianie) + propozycje zgodne z klasą i powierzchnią
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-primary" />
          </button>

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
                              <div className="flex items-center justify-end gap-1">
                                {isSuperAdmin && (
                                  <button
                                    onClick={() => { setEditDeviceTarget(device); setEditDeviceOpen(true); }}
                                    className="inline-flex items-center justify-center p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                    title="Edytuj urządzenie"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setRepairDevice(device)}
                                  className="inline-flex items-center justify-center p-2 hover:bg-warning/10 rounded-lg text-muted-foreground hover:text-warning transition-colors"
                                  title="Zgłoś naprawę — utwórz zadanie serwisowe"
                                >
                                  <Hammer className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setQrDevice(device)}
                                  className="inline-flex items-center justify-center p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                  title="Karta i Kod QR"
                                >
                                  <QrCode className="h-5 w-5" />
                                </button>
                              </div>
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
            <div className="border-b border-border bg-secondary/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Dokumentacja Techniczna</h3>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as BuildingDocumentCategory)}>
                    <SelectTrigger className="w-[180px] h-9 text-xs">
                      <Tag className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      <SelectValue placeholder="Kategoria…" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILDING_DOCUMENT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                              name: file.name,
                              category: uploadCategory,
                            });
                            toast({ title: "Dokument wgrany pomyślnie", description: `Kategoria: ${BUILDING_DOCUMENT_CATEGORY_LABELS[uploadCategory]}` });
                            // reset input so same file can be re-selected later
                            e.target.value = "";
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
                </div>
              )}
            </div>

            {/* Iter 6 — chip filter row by category */}
            {(documents ?? []).length > 0 && (
              <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDocFilter(null)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    docFilter === null ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  Wszystkie ({documents?.length ?? 0})
                </button>
                {BUILDING_DOCUMENT_CATEGORIES.map((cat) => {
                  const count = (documents ?? []).filter((d: any) => (d.category ?? "inne") === cat.value).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setDocFilter(cat.value)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                        docFilter === cat.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-0">
              {docsLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filteredDocuments && filteredDocuments.length > 0 ? (
                <div className="divide-y divide-border">
                  {filteredDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-secondary p-2 rounded-lg text-muted-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-card-foreground">{doc.name}</p>
                            {doc.category && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1">
                                <Tag className="h-2.5 w-2.5" />
                                {BUILDING_DOCUMENT_CATEGORY_LABELS[doc.category as BuildingDocumentCategory] ?? doc.category}
                              </Badge>
                            )}
                            {doc.valid_until && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] py-0 px-1.5",
                                  new Date(doc.valid_until) < new Date()
                                    ? "border-critical/30 text-critical bg-critical/10"
                                    : "border-success/30 text-success bg-success/10"
                                )}
                              >
                                ważny do: {new Date(doc.valid_until).toLocaleDateString("pl-PL")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
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
                        {isSuperAdmin && (doc.file_type?.includes("pdf") || doc.name?.toLowerCase().endsWith(".pdf")) && (
                          <button
                            onClick={() => runExtract(doc)}
                            disabled={extractMeta.isPending && extractTarget?.id === doc.id}
                            className="p-2 hover:text-orange-500 transition-colors hover:bg-secondary rounded-md disabled:opacity-50"
                            title="Wyciągnij metadane (AI)"
                          >
                            {extractMeta.isPending && extractTarget?.id === doc.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Sparkles className="h-4 w-4" />}
                          </button>
                        )}
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
                  <h4 className="text-base font-bold text-card-foreground mb-1">
                    {docFilter ? "Brak dokumentów w tej kategorii" : "Brak wgranych dokumentów"}
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    {docFilter
                      ? "Zmień filtr lub wgraj pierwszy dokument w tej kategorii."
                      : "Wymagane dokumenty: IBP, plany ewakuacyjne, dokumentacja projektowa, DTR dla BOZ, protokoły archiwalne."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-0">
          <ContactsTab buildingId={id ?? ""} isSuperAdmin={isSuperAdmin} />
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

      {/* AI extract metadata dialog (Faza 4) */}
      <Dialog open={!!extractTarget} onOpenChange={(o) => { if (!o) { setExtractTarget(null); extractMeta.reset(); } }}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-card-foreground">
              <Sparkles className="h-4 w-4 text-orange-500" />
              AI: metadane dokumentu
            </DialogTitle>
            <DialogDescription>
              {extractTarget?.name ?? "Dokument"} — analiza tekstu PDF przez gpt-4o-mini.
            </DialogDescription>
          </DialogHeader>

          {extractMeta.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Analiza w toku...
            </div>
          )}

          {extractMeta.error && (
            <div className="rounded-md border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
              {extractMeta.error.message}
            </div>
          )}

          {extractMeta.data && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Podsumowanie</p>
                <p>{extractMeta.data.summary || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Następny przegląd</p>
                  <p className="font-mono">{extractMeta.data.next_inspection_due ?? "—"}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Inspektor</p>
                  <p>{extractMeta.data.inspector ?? "—"}</p>
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Urządzenia ({extractMeta.data.devices.length})
                </p>
                {extractMeta.data.devices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">AI nie znalazło żadnych urządzeń.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {extractMeta.data.devices.map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-muted-foreground font-mono">×{d.quantity ?? 1}</span>
                        <span>
                          <span className="font-medium">{d.type}</span>
                          {d.location && <span className="text-muted-foreground"> — {d.location}</span>}
                          {d.notes && <span className="text-muted-foreground italic"> ({d.notes})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pewność modelu: <span className="font-bold">{extractMeta.data.confidence}</span> · zapis do bazy ręczny w kolejnej iteracji.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Repair task dialog - pre-filled from device */}
      {repairDevice && (
        <CreateTaskDialog
          open={!!repairDevice}
          onOpenChange={(o) => !o && setRepairDevice(null)}
          defaultValues={{
            buildingId: id!,
            companyId: building.company_id,
            title: `Naprawa: ${repairDevice.name}`,
            description: `Zgłoszenie naprawy urządzenia "${repairDevice.name}" (SN: ${repairDevice.serial_number || 'brak'}, Lokalizacja: ${repairDevice.location_in_building || 'brak'})`,
            type: "usterka" as const,
            priority: "wysoki" as const,
          }}
        />
      )}
    </div>
  );
}
