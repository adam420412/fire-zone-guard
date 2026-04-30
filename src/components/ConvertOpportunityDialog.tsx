import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateCompany, useCreateBuilding, useCreateTask, useProfiles } from "@/hooks/useSupabaseData";
import { useCreateContact, useUpdateOpportunity } from "@/hooks/useCrmData";
import { fetchCompanyByNIP, normalizeNip, validateNip, type NipLookupResult } from "@/lib/nipLookup";
import { toast } from "sonner";
import { Loader2, Search, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

interface Opportunity {
  id: string;
  company_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  description?: string | null;
  estimated_value?: number | null;
  company_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
}

const TASK_TEMPLATES = [
  { value: "wizja", label: "Wizja lokalna i audyt", type: "audyt", title: "Wizja lokalna – pierwszy kontakt" },
  { value: "kontakt", label: "Pierwszy kontakt operacyjny", type: "konsultacja", title: "Pierwszy kontakt z klientem" },
  { value: "oferta", label: "Przygotowanie oferty", type: "konsultacja", title: "Przygotowanie oferty" },
];

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

export default function ConvertOpportunityDialog({ open, onOpenChange, opportunity }: Props) {
  const navigate = useNavigate();
  const createCompany = useCreateCompany();
  const createBuilding = useCreateBuilding();
  const createTask = useCreateTask();
  const createContact = useCreateContact();
  const updateOpp = useUpdateOpportunity();
  const { data: profiles } = useProfiles();

  const [step1, setStep1] = useState({ name: "", nip: "", address: "" });
  const [sameAsCompany, setSameAsCompany] = useState(true);
  const [step2, setStep2] = useState({ name: "", address: "" });
  const [step3, setStep3] = useState({ name: "", position: "", email: "", phone: "" });
  const [step4, setStep4] = useState({
    template: "wizja",
    deadline: todayPlus(7),
    assignee_id: "",
    priority: "średni",
  });

  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nipStatus, setNipStatus] = useState<"idle" | "ok" | "error">("idle");

  // Reset / prefill on open
  useEffect(() => {
    if (!open || !opportunity) return;
    setStep1({ name: opportunity.company_name || "", nip: "", address: "" });
    setStep2({ name: "", address: "" });
    setStep3({
      name: opportunity.contact_name || "",
      position: "",
      email: opportunity.contact_email || "",
      phone: opportunity.contact_phone || "",
    });
    setStep4({ template: "wizja", deadline: todayPlus(7), assignee_id: "", priority: "średni" });
    setSameAsCompany(true);
    setNipStatus("idle");
  }, [open, opportunity?.id]);

  const handleNipLookup = async () => {
    if (!step1.nip.trim()) {
      toast.error("Wpisz NIP");
      return;
    }
    setSearching(true);
    setNipStatus("idle");
    try {
      const r = await fetchCompanyByNIP(step1.nip);
      setStep1({ name: r.name, nip: r.nip, address: r.address });
      setNipStatus("ok");
      toast.success("Znaleziono firmę w Białej Liście");
    } catch (e: any) {
      setNipStatus("error");
      toast.error(e.message || "Nie znaleziono firmy");
    } finally {
      setSearching(false);
    }
  };

  const finalBuildingAddress = sameAsCompany ? step1.address : step2.address;
  const finalBuildingName = step2.name.trim() || (sameAsCompany ? `${step1.name} – siedziba` : "");

  const canSubmit =
    step1.name.trim().length > 0 &&
    finalBuildingName.length > 0 &&
    !submitting;

  const tpl = TASK_TEMPLATES.find((t) => t.value === step4.template) || TASK_TEMPLATES[0];

  const handleSubmit = async () => {
    if (!opportunity) return;
    if (!canSubmit) {
      toast.error("Uzupełnij nazwę firmy i nazwę obiektu");
      return;
    }
    setSubmitting(true);
    try {
      // 1) FIRMA (lub istniejąca z opp.company_id)
      let companyId = opportunity.company_id;
      if (!companyId) {
        const company = await createCompany.mutateAsync({
          name: step1.name.trim(),
          nip: step1.nip.replace(/[\s-]/g, "") || undefined,
          address: step1.address.trim() || undefined,
        });
        companyId = (company as any).id;
      }

      // 2) OBIEKT
      const building = await createBuilding.mutateAsync({
        company_id: companyId!,
        name: finalBuildingName,
        address: finalBuildingAddress || "",
      } as any);
      const buildingId = (building as any).id;

      // 3) KONTAKT (jeśli podano imię)
      let contactId: string | null = null;
      if (step3.name.trim()) {
        const contact = await createContact.mutateAsync({
          company_id: companyId,
          name: step3.name.trim(),
          email: step3.email.trim() || "",
          phone: step3.phone.trim() || "",
          position: step3.position.trim() || "",
        });
        contactId = (contact as any).id;
      }

      // 4) ZADANIE STARTOWE
      const task = await createTask.mutateAsync({
        company_id: companyId!,
        building_id: buildingId,
        title: tpl.title,
        description: opportunity.description
          ? `Z szansy: ${opportunity.description}`
          : `Zadanie utworzone z konwersji szansy sprzedaży: ${opportunity.company_name}`,
        type: tpl.type as any,
        priority: step4.priority as any,
        status: "Nowe" as any,
        sla_hours: 72,
        deadline: step4.deadline || null,
        assignee_id: step4.assignee_id || null,
        opportunity_id: opportunity.id,
        contact_id: contactId,
      } as any);

      // 5) Aktualizuj opportunity (status + powiązanie)
      await updateOpp.mutateAsync({
        id: opportunity.id,
        updates: {
          status: "zlecenie",
          company_id: companyId,
          updated_at: new Date().toISOString(),
        },
      });

      toast.success("Konwersja zakończona – otwieram zadanie");
      onOpenChange(false);
      navigate(`/kanban?task=${(task as any).id}`);
    } catch (err: any) {
      toast.error("Błąd konwersji: " + (err?.message || "nieznany"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!opportunity) return null;

  // Style helpers (Steel Forge)
  const inputCls =
    "w-full bg-background border border-border px-4 py-3 rounded-sm text-foreground text-sm focus:border-primary outline-none transition-colors";
  const labelCls = "block text-[11px] font-bold text-muted-foreground uppercase mb-2 tracking-wider";
  const sectionHeader =
    "text-sm font-bold uppercase tracking-wider text-foreground border-l-[3px] border-primary pl-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 bg-card border border-border rounded-sm overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* HEADER */}
        <div className="px-8 py-6 bg-secondary/40 border-b border-border">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-1">
            Protokół konwersji
          </p>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">
            Konwertuj szansę → klient + obiekt + zadanie
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Źródło: <span className="text-primary font-semibold">{opportunity.company_name}</span>
            {opportunity.estimated_value ? ` · ${Number(opportunity.estimated_value).toLocaleString("pl-PL")} zł potencjał` : ""}
          </p>
        </div>

        <div className="grid grid-cols-12">
          {/* MAIN FORM */}
          <div className="col-span-12 lg:col-span-8 p-8 space-y-10 border-r border-border">
            {/* I. FIRMA */}
            <section className="space-y-4">
              <h3 className={sectionHeader}>I. Firma</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className={labelCls}>Pełna nazwa firmy *</Label>
                  <input
                    className={inputCls}
                    value={step1.name}
                    onChange={(e) => setStep1((s) => ({ ...s, name: e.target.value }))}
                    placeholder="np. Arcturus Steel Sp. z o.o."
                  />
                </div>
                <div>
                  <Label className={labelCls}>NIP (lookup Biała Lista)</Label>
                  <div className="relative flex">
                    <input
                      className={inputCls + " font-mono pr-28"}
                      value={step1.nip}
                      onChange={(e) => setStep1((s) => ({ ...s, nip: e.target.value }))}
                      placeholder="np. 5213842910"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleNipLookup}
                      disabled={searching || !step1.nip.trim()}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-9 text-[10px] uppercase font-bold tracking-wider"
                    >
                      {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                      Lookup
                    </Button>
                  </div>
                  {nipStatus === "ok" && (
                    <span className="inline-block mt-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-sm">
                      BIAŁA LISTA OK
                    </span>
                  )}
                  {nipStatus === "error" && (
                    <span className="inline-block mt-1 text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-sm">
                      NIE ZNALEZIONO
                    </span>
                  )}
                </div>
                <div>
                  <Label className={labelCls}>Adres siedziby</Label>
                  <input
                    className={inputCls}
                    value={step1.address}
                    onChange={(e) => setStep1((s) => ({ ...s, address: e.target.value }))}
                    placeholder="ul. Przemysłowa 42, Warszawa"
                  />
                </div>
              </div>
            </section>

            {/* II. OBIEKT */}
            <section className="space-y-4">
              <div className="flex items-center justify-between pr-2">
                <h3 className={sectionHeader}>II. Obiekt</h3>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsCompany}
                    onChange={(e) => setSameAsCompany(e.target.checked)}
                    className="accent-primary"
                  />
                  Adres ten sam co siedziba
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className={sameAsCompany ? "col-span-2" : "col-span-1"}>
                  <Label className={labelCls}>Nazwa obiektu *</Label>
                  <input
                    className={inputCls}
                    value={step2.name}
                    onChange={(e) => setStep2((s) => ({ ...s, name: e.target.value }))}
                    placeholder={sameAsCompany ? `${step1.name || "Firma"} – siedziba` : "np. Hala Produkcyjna H-1"}
                  />
                </div>
                {!sameAsCompany && (
                  <div>
                    <Label className={labelCls}>Adres obiektu</Label>
                    <input
                      className={inputCls}
                      value={step2.address}
                      onChange={(e) => setStep2((s) => ({ ...s, address: e.target.value }))}
                      placeholder="ul. Magazynowa 4B, Pruszków"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* III. KONTAKT */}
            <section className="space-y-4">
              <h3 className={sectionHeader}>III. Kontakt</h3>
              <p className="text-[11px] text-muted-foreground -mt-2">
                Opcjonalnie – jeśli podasz imię, kontakt zostanie utworzony i podpięty pod zadanie.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={labelCls}>Imię i nazwisko</Label>
                  <input
                    className={inputCls}
                    value={step3.name}
                    onChange={(e) => setStep3((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className={labelCls}>Stanowisko</Label>
                  <input
                    className={inputCls}
                    value={step3.position}
                    onChange={(e) => setStep3((s) => ({ ...s, position: e.target.value }))}
                    placeholder="np. Kierownik UR"
                  />
                </div>
                <div>
                  <Label className={labelCls}>E-mail</Label>
                  <input
                    type="email"
                    className={inputCls}
                    value={step3.email}
                    onChange={(e) => setStep3((s) => ({ ...s, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className={labelCls}>Telefon</Label>
                  <input
                    className={inputCls + " font-mono"}
                    value={step3.phone}
                    onChange={(e) => setStep3((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            {/* IV. ZADANIE STARTOWE */}
            <section className="space-y-4 bg-secondary/30 p-6 border border-border rounded-sm">
              <h3 className={sectionHeader}>IV. Zadanie startowe</h3>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-6">
                  <Label className={labelCls}>Typ zadania</Label>
                  <Select value={step4.template} onValueChange={(v) => setStep4((s) => ({ ...s, template: v }))}>
                    <SelectTrigger className={inputCls + " h-auto"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TEMPLATES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Label className={labelCls}>Termin</Label>
                  <input
                    type="date"
                    className={inputCls + " font-mono"}
                    value={step4.deadline}
                    onChange={(e) => setStep4((s) => ({ ...s, deadline: e.target.value }))}
                  />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Label className={labelCls}>Priorytet</Label>
                  <Select value={step4.priority} onValueChange={(v) => setStep4((s) => ({ ...s, priority: v }))}>
                    <SelectTrigger className={inputCls + " h-auto"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="niski">Niski</SelectItem>
                      <SelectItem value="średni">Średni</SelectItem>
                      <SelectItem value="wysoki">Wysoki</SelectItem>
                      <SelectItem value="krytyczny">Krytyczny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12">
                  <Label className={labelCls}>Przypisz do</Label>
                  <Select
                    value={step4.assignee_id || "none"}
                    onValueChange={(v) => setStep4((s) => ({ ...s, assignee_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger className={inputCls + " h-auto"}>
                      <SelectValue placeholder="Nieprzypisane" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nieprzypisane</SelectItem>
                      {(profiles ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>

          {/* SIDEBAR PREVIEW */}
          <div className="col-span-12 lg:col-span-4 bg-background/40 p-8 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                Podgląd struktur
              </h3>

              <div className="p-4 bg-card border border-border rounded-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-1.5 bg-primary" />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Klient</span>
                </div>
                <p className="text-sm text-foreground font-semibold truncate">{step1.name || "—"}</p>
                {step1.nip && <p className="text-[11px] text-muted-foreground font-mono mt-0.5">NIP {step1.nip}</p>}
              </div>

              <div className="p-4 bg-card border border-border rounded-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-1.5 bg-primary" />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Obiekt</span>
                </div>
                <p className="text-sm text-foreground font-semibold truncate">{finalBuildingName || "—"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{finalBuildingAddress || "—"}</p>
              </div>

              {step3.name.trim() && (
                <div className="p-4 bg-card border border-border rounded-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="size-1.5 bg-primary" />
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Kontakt</span>
                  </div>
                  <p className="text-sm text-foreground font-semibold">{step3.name}</p>
                  <p className="text-[11px] text-muted-foreground">{step3.position || "—"}</p>
                </div>
              )}

              <div className="p-4 bg-card border border-border rounded-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-1.5 bg-primary" />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Zadanie</span>
                </div>
                <p className="text-sm text-foreground font-semibold">{tpl.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Termin: {step4.deadline} · Priorytet: {step4.priority}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full fire-gradient text-primary-foreground py-6 font-bold text-sm uppercase tracking-tight shadow-[0_4px_20px_hsl(var(--primary)/0.3)]"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Konwertuj i otwórz zadanie
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full text-xs uppercase tracking-wider text-muted-foreground"
              >
                Anuluj
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
