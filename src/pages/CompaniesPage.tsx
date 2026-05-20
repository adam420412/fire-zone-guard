import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompaniesWithStats, useUpdateCompany, useBuildings, useCreateCompany } from "@/hooks/useSupabaseData";
import { useContextPanel } from "@/hooks/useContextPanel";
import {
  useCompanyContacts,
  useCreateCompanyContact,
  useUpdateCompanyContact,
  useDeleteCompanyContact,
  usePatchCompanyContact,
  type CompanyContact,
  type CompanyContactInput,
} from "@/hooks/useCompanyContacts";
import { EditableText } from "@/components/EditableText";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  Briefcase, Building2, ClipboardList, TrendingUp, Loader2, Settings, Save, Search, Plus,
  Mail, Phone, Star, Siren, Pencil, Trash2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ---- NIP Lookup ----
async function fetchCompanyByNIP(nip: string) {
  const cleanNip = nip.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleanNip)) throw new Error("NIP musi mieć 10 cyfr.");
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${today}`);
  if (!res.ok) throw new Error("Błąd połączenia z API MF.");
  const json = await res.json();
  const subject = json?.result?.subject;
  if (!subject) throw new Error("Nie znaleziono firmy o podanym NIP.");
  return { name: subject.name as string, address: (subject.workingAddress || subject.residenceAddress || "") as string, nip: cleanNip };
}

// ---- Create Company Dialog ----
function CreateCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutate: createCompany, isPending } = useCreateCompany();
  const [nip, setNip] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleNipSearch = async () => {
    setIsSearching(true);
    try {
      const r = await fetchCompanyByNIP(nip);
      setName(r.name); setAddress(r.address);
      toast.success("Dane pobrane z rejestru MF!");
    } catch (err: any) {
      toast.error(err.message || "Nie udało się pobrać danych.");
    } finally { setIsSearching(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Podaj nazwę firmy."); return; }
    createCompany({ name: name.trim(), nip: nip.replace(/[\s-]/g, ""), address: address.trim() } as any, {
      onSuccess: () => {
        toast.success("Klient został dodany!");
        onOpenChange(false);
        setNip(""); setName(""); setAddress("");
      },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj nowego klienta</DialogTitle>
            <DialogDescription>Wpisz NIP aby pobrać dane z GUS/MF lub uzupełnij ręcznie.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>NIP</Label>
              <div className="flex gap-2">
                <Input value={nip} onChange={e => setNip(e.target.value)} placeholder="np. 5261040828" className="flex-1" />
                <Button type="button" variant="outline" onClick={handleNipSearch} disabled={isSearching || !nip.trim()}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nazwa Firmy</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Dodaj klienta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Company Contact Dialog ----
function CompanyContactDialog({
  open, onOpenChange, companyId, buildings, contact,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  buildings: { id: string; name: string }[];
  contact: CompanyContact | null;
}) {
  const create = useCreateCompanyContact();
  const update = useUpdateCompanyContact();
  const isEdit = !!contact;

  const [form, setForm] = useState<CompanyContactInput>({
    full_name: "", position: "", phone: "", email: "", notes: "",
    is_primary: false, is_emergency: false, building_ids: [],
  });

  useEffect(() => {
    if (open) {
      setForm({
        full_name: contact?.full_name ?? "",
        position: contact?.position ?? "",
        phone: contact?.phone ?? "",
        email: contact?.email ?? "",
        notes: contact?.notes ?? "",
        is_primary: contact?.is_primary ?? false,
        is_emergency: contact?.is_emergency ?? false,
        building_ids: contact?.building_ids ?? [],
      });
    }
  }, [open, contact]);

  const toggleBuilding = (id: string, checked: boolean) =>
    setForm((f) => ({
      ...f,
      building_ids: checked ? [...f.building_ids, id] : f.building_ids.filter((x) => x !== id),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error("Imię i nazwisko jest wymagane."); return; }
    try {
      if (isEdit && contact) {
        await update.mutateAsync({
          id: contact.id, company_id: companyId, input: form,
          previous_building_ids: contact.building_ids,
        });
        toast.success("Zaktualizowano kontakt.");
      } else {
        await create.mutateAsync({ company_id: companyId, input: form });
        toast.success("Dodano kontakt.");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Błąd: " + (err.message || err));
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edytuj kontakt" : "Nowy kontakt firmy"}</DialogTitle>
            <DialogDescription>Wszystkie pola poza imieniem są opcjonalne — możesz uzupełnić je później.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label>Imię i nazwisko *</Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Pełniona funkcja</Label>
              <Input value={form.position ?? ""} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="np. Inspektor BHP, Zarządca" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+48 600 000 000" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 cursor-pointer">
                <Checkbox checked={form.is_primary} onCheckedChange={(v) => setForm((f) => ({ ...f, is_primary: !!v }))} />
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-bold">Główny kontakt</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 cursor-pointer">
                <Checkbox checked={form.is_emergency} onCheckedChange={(v) => setForm((f) => ({ ...f, is_emergency: !!v }))} />
                <Siren className="h-4 w-4 text-critical" />
                <span className="text-xs font-bold">Awaryjny 24/7</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>Przypisanie do obiektów ({form.building_ids.length})</Label>
              <div className="border rounded-md p-2 bg-muted/20 max-h-44 overflow-y-auto space-y-1">
                {buildings.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Brak obiektów w tej firmie.</p>
                ) : buildings.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer">
                    <Checkbox
                      checked={form.building_ids.includes(b.id)}
                      onCheckedChange={(v) => toggleBuilding(b.id, !!v)}
                    />
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{b.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Możesz nie wybierać żadnego, jednego lub kilku obiektów.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notatka</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Manage Company Dialog ----
function ManageCompanyDialog({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company: any }) {
  const { mutate: updateCompany, isPending } = useUpdateCompany();
  const { data: buildings } = useBuildings();
  const { data: contacts, isLoading: loadingContacts } = useCompanyContacts(company?.id);
  const deleteContact = useDeleteCompanyContact();
  const patchContact = usePatchCompanyContact();
  const { canEdit: canEditContacts } = usePermissions();

  const [name, setName] = useState("");
  const [nip, setNip] = useState("");
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyContact | null>(null);

  useEffect(() => {
    if (open && company) {
      setName(company.name ?? "");
      setNip(company.nip ?? "");
      setAddress(company.address ?? "");
    }
  }, [open, company]);

  const companyBuildings = useMemo(
    () => (buildings ?? []).filter((b: any) => b.company_id === company?.id),
    [buildings, company?.id]
  );

  const handleNipSearch = async () => {
    setSearching(true);
    try {
      const r = await fetchCompanyByNIP(nip);
      if (!name.trim()) setName(r.name);
      if (!address.trim()) setAddress(r.address);
      toast.success("Dane pobrane z rejestru MF.");
    } catch (err: any) {
      toast.error(err.message || "Błąd pobierania.");
    } finally { setSearching(false); }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    if (!name.trim()) { toast.error("Nazwa jest wymagana."); return; }
    const cleanNip = nip.replace(/[\s-]/g, "");
    if (cleanNip && !/^\d{10}$/.test(cleanNip)) { toast.error("NIP musi mieć 10 cyfr."); return; }
    updateCompany({ id: company.id, updates: { name: name.trim(), nip: cleanNip, address: address.trim() } }, {
      onSuccess: () => { toast.success("Dane firmy zaktualizowane."); onOpenChange(false); },
      onError: (err) => toast.error("Błąd zapisu: " + err.message),
    });
  };

  const handleDeleteContact = async (c: CompanyContact) => {
    if (!confirm(`Usunąć kontakt: ${c.full_name}?`)) return;
    try {
      await deleteContact.mutateAsync({ id: c.id, company_id: company.id });
      toast.success("Kontakt usunięty.");
    } catch (err: any) {
      toast.error("Błąd: " + err.message);
    }
  };

  if (!company) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Karta klienta — {company.name}</DialogTitle>
            <DialogDescription>Edytuj dane firmy, zarządzaj obiektami i osobami kontaktowymi.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Nazwa Firmy *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>NIP</Label>
                <div className="flex gap-2">
                  <Input value={nip} onChange={(e) => setNip(e.target.value)} placeholder="10 cyfr" className="flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={handleNipSearch} disabled={searching || !nip.trim()} title="Pobierz z rejestru MF">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Adres</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ul., kod, miasto" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending} size="sm">
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Zapisz dane firmy
              </Button>
            </div>
          </form>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Obiekty ({companyBuildings.length})
              </Label>
            </div>
            <div className="border rounded-md p-2 bg-muted/20 max-h-32 overflow-y-auto space-y-1">
              {companyBuildings.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Brak obiektów.</p>
              ) : companyBuildings.map((b: any) => (
                <div key={b.id} className="flex justify-between items-center bg-card border px-3 py-1.5 rounded-md text-sm">
                  <span>{b.name}</span>
                  <Badge variant="secondary" className="text-[10px]">aktywny</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Osoby kontaktowe ({contacts?.length ?? 0})
              </Label>
              <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(null); setContactDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Dodaj osobę
              </Button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : (contacts ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Brak osób kontaktowych. Dodaj pierwszą.</p>
              ) : (contacts ?? []).map((c) => {
                const linkedNames = c.building_ids
                  .map((id) => companyBuildings.find((b: any) => b.id === id)?.name)
                  .filter(Boolean) as string[];
                return (
                  <div key={c.id} className="border rounded-md bg-card p-3 text-sm space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{c.full_name}</span>
                          {c.is_primary && <Star className="h-3.5 w-3.5 text-yellow-500" />}
                          {c.is_emergency && <Siren className="h-3.5 w-3.5 text-critical" />}
                          {c.position && <span className="text-xs text-muted-foreground">— {c.position}</span>}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                        </div>
                        {linkedNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {linkedNames.map((n) => (
                              <Badge key={n} variant="outline" className="text-[10px]"><Building2 className="h-2.5 w-2.5 mr-1" />{n}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditing(c); setContactDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-critical"
                          onClick={() => handleDeleteContact(c)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="border-t border-border/50 pt-2">
                      <EditableText
                        value={c.notes}
                        canEdit={canEditContacts}
                        multiline
                        maxLength={500}
                        placeholder="Notatka o kontakcie..."
                        emptyLabel="(brak notatki — kliknij ołówek, aby dodać)"
                        textClassName="text-xs text-muted-foreground italic"
                        onSave={async (v) => {
                          await patchContact.mutateAsync({ id: c.id, company_id: company.id, patch: { notes: v || null as any } });
                          toast.success("Notatka zapisana");
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Zamknij</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyContactDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        companyId={company.id}
        buildings={companyBuildings.map((b: any) => ({ id: b.id, name: b.name }))}
        contact={editing}
      />
    </>
  );
}

// ---- Main Page ----
export default function CompaniesPage() {
  const navigate = useNavigate();
  const { data: companies, isLoading } = useCompaniesWithStats();
  const { isSuperAdmin, canEdit: canManage } = usePermissions();

  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const handleManageClick = (e: React.MouseEvent, company: any) => {
    e.stopPropagation();
    setSelectedCompany(company);
    setManageOpen(true);
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Firmy (Klienci)</h1>
          <p className="text-sm text-muted-foreground">Rejestr spółek i kontrahentów w systemie.</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="fire-gradient">
            <Plus className="mr-2 h-4 w-4" />
            Dodaj Klienta
          </Button>
        )}
      </div>

      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ManageCompanyDialog open={manageOpen} onOpenChange={setManageOpen} company={selectedCompany} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(companies ?? []).map((company: any) => (
          <div
            key={company.id}
            onClick={() => navigate(`/buildings?company=${company.id}`)}
            className="cursor-pointer rounded-lg border border-border bg-card p-5 card-hover relative group"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg fire-gradient shrink-0">
                  <Briefcase className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-card-foreground line-clamp-1 pr-8">{company.name}</h3>
                  {company.nip && <p className="text-[11px] text-muted-foreground">NIP: {company.nip}</p>}
                  {company.address && <p className="text-[11px] text-muted-foreground line-clamp-1">{company.address}</p>}
                </div>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleManageClick(e, company)}
                  title="Zarządzaj danymi firmy"
                >
                  <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold text-card-foreground">{company.buildingsCount}</p>
                  <p className="text-[10px] text-muted-foreground">Obiekty</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold text-card-foreground">{company.activeTasksCount}</p>
                  <p className="text-[10px] text-muted-foreground">Zadania</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className={cn(
                    "text-lg font-bold",
                    company.sla >= 90 ? "text-success" : company.sla >= 80 ? "text-warning" : "text-critical"
                  )}>
                    {company.sla}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
