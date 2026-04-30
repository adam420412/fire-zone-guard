import { useState, useMemo } from "react";
import { useQuotes, useQuoteItems, useServices, useContacts, useCreateQuote, useCreateQuoteItem, useUpdateQuote, useSalesOpportunities, useCreateOpportunity, useUpdateOpportunity, useDeleteOpportunity } from "@/hooks/useCrmData";
import { useCompanies, useCreateCompany, useTaskFinanceSummary } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Loader2, FileText, Search, ShoppingCart, CheckCircle, XCircle, DollarSign, TrendingUp, BarChart3, Percent, Target, Building2, Archive, ArrowRight, Trash2 } from "lucide-react";
import { generateReportPDF } from "@/lib/pdfGenerator";
import ConvertOpportunityDialog from "@/components/ConvertOpportunityDialog";

const REVENUE_CATEGORIES = ["Szkolenia", "Dokumentacja", "Serwis", "Wykonawstwo", "Montaż", "Audyty", "Odbiory"] as const;

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  "wersja robocza": { label: "Wersja robocza", variant: "secondary" },
  "wysłana": { label: "Wysłana", variant: "outline" },
  "zaakceptowana": { label: "Zaakceptowana", variant: "default" },
  "odrzucona": { label: "Odrzucona", variant: "destructive" },
};

// ---- Create Quote Dialog with Discount ----
function CreateQuoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: services } = useServices();
  const { mutate: createQuote, isPending } = useCreateQuote();
  const { mutate: createQuoteItem } = useCreateQuoteItem();

  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});

  const filteredContacts = useMemo(() => (contacts ?? []).filter((c: any) => c.company_id === companyId), [contacts, companyId]);
  const groupedServices = useMemo(() => {
    const groups: Record<string, any[]> = {};
    (services ?? []).forEach((s: any) => { (groups[s.category] ??= []).push(s); });
    return groups;
  }, [services]);

  const subtotal = useMemo(() => {
    return Object.entries(selectedServices).reduce((sum, [sid, qty]) => {
      const svc = (services ?? []).find((s: any) => s.id === sid);
      return sum + (svc ? (svc as any).unit_price * qty : 0);
    }, 0);
  }, [selectedServices, services]);

  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev => {
      const copy = { ...prev };
      if (copy[serviceId]) delete copy[serviceId];
      else copy[serviceId] = 1;
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) { toast.error("Wybierz firmę."); return; }
    if (Object.keys(selectedServices).length === 0) { toast.error("Wybierz co najmniej jedną usługę."); return; }

    const quoteNumber = `OF/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    createQuote({
      company_id: companyId,
      contact_id: contactId || null,
      quote_number: quoteNumber,
      notes,
      total,
      discount_percent: discountPercent,
      created_by: user?.id,
      valid_until: validUntil.toISOString().split("T")[0],
    }, {
      onSuccess: (quote: any) => {
        const items = Object.entries(selectedServices).map(([sid, qty]) => {
          const svc = (services ?? []).find((s: any) => s.id === sid) as any;
          return {
            quote_id: quote.id,
            service_id: sid,
            service_name: svc?.name ?? "",
            quantity: qty,
            unit_price: svc?.unit_price ?? 0,
            total: (svc?.unit_price ?? 0) * qty,
          };
        });
        items.forEach(item => createQuoteItem(item));
        toast.success(`Oferta ${quoteNumber} utworzona!`);
        onOpenChange(false);
        setCompanyId(""); setContactId(""); setNotes(""); setSelectedServices({}); setDiscountPercent(0);
      },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowa oferta</DialogTitle>
            <DialogDescription>Wybierz firmę, usługi i opcjonalny rabat.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Firma *</Label>
                <Select value={companyId} onValueChange={v => { setCompanyId(v); setContactId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Wybierz firmę..." /></SelectTrigger>
                  <SelectContent>{companies?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Osoba kontaktowa</Label>
                <Select value={contactId} onValueChange={setContactId} disabled={!companyId}>
                  <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                  <SelectContent>{filteredContacts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.position}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Usługi *</Label>
              {Object.entries(groupedServices).map(([category, svcs]) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</p>
                  {svcs.map((svc: any) => {
                    const isSelected = !!selectedServices[svc.id];
                    return (
                      <div key={svc.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/30'}`} onClick={() => toggleService(svc.id)}>
                        <div className="flex items-center gap-3">
                          <Checkbox checked={isSelected} />
                          <div>
                            <p className="text-sm font-medium">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">{svc.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isSelected && (
                            <Input type="number" min={1} value={selectedServices[svc.id]}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setSelectedServices(prev => ({ ...prev, [svc.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                              className="w-16 h-8 text-center text-sm" />
                          )}
                          <div className="text-right min-w-20">
                            <p className="text-sm font-bold">{svc.unit_price.toLocaleString("pl-PL")} zł</p>
                            <p className="text-[10px] text-muted-foreground">/{svc.unit}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rabat (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="number" min={0} max={100} value={discountPercent}
                    onChange={e => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="pl-9" placeholder="0" />
                </div>
              </div>
              <div className="space-y-2"><Label>Uwagi</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatkowe informacje..." /></div>
            </div>

            <div className="p-4 rounded-lg bg-secondary border border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Suma brutto:</span>
                <span>{subtotal.toLocaleString("pl-PL")} zł</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Rabat ({discountPercent}%):</span>
                  <span>-{discountAmount.toLocaleString("pl-PL")} zł</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">Do zapłaty netto:</span>
                <span className="text-xl font-bold text-primary">{total.toLocaleString("pl-PL")} zł</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Utwórz ofertę</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Quote Detail Dialog ----
function QuoteDetailDialog({ quote, open, onOpenChange }: { quote: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: items, isLoading } = useQuoteItems(quote?.id ?? "");
  const { data: companies } = useCompanies();
  const { mutate: updateQuote } = useUpdateQuote();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  if (!quote) return null;

  const company = (companies ?? []).find((c: any) => c.id === quote.company_id) as any;
  const discount = Number(quote.discount_percent) || 0;

  const handleStatusChange = (newStatus: string) => {
    updateQuote({ id: quote.id, updates: { 
      status: newStatus,
      ...(newStatus === "zaakceptowana" ? { approved_at: new Date().toISOString() } : {})
    }}, {
      onSuccess: () => toast.success(`Status zmieniony na: ${STATUS_MAP[newStatus]?.label ?? newStatus}`),
    });
  };

  const handleGeneratePdf = () => {
    const itemRows = (items ?? []).map((item: any, i: number) => [
      i + 1,
      item.service_name,
      item.quantity,
      `${Number(item.unit_price).toLocaleString("pl-PL")} zł`,
      `${Number(item.total).toLocaleString("pl-PL")} zł`,
    ]);

    generateReportPDF({
      title: "OFERTA HANDLOWA",
      subtitle: quote.quote_number,
      filename: `Oferta_${quote.quote_number.replace(/\//g, '-')}.pdf`,
      metadata: [
        { label: "Nr oferty", value: quote.quote_number },
        { label: "Klient", value: quote.company_name || company?.name || "—" },
        { label: "Adres", value: company?.address || "—" },
        { label: "NIP", value: company?.nip || "—" },
        { label: "Osoba kontaktowa", value: quote.contact_name || "—" },
        { label: "Data", value: new Date(quote.created_at).toLocaleDateString("pl-PL") },
        { label: "Ważna do", value: quote.valid_until ? new Date(quote.valid_until).toLocaleDateString("pl-PL") : "—" },
        ...(discount > 0 ? [{ label: "Rabat", value: `${discount}%` }] : []),
      ],
      tableColumns: ["Lp.", "Usługa", "Ilość", "Cena jdn.", "Wartość netto"],
      tableData: itemRows.length > 0 ? itemRows : [[1, "Brak szczegółów", "", "", `${Number(quote.total).toLocaleString("pl-PL")} zł`]],
      result: `Suma netto: ${Number(quote.total).toLocaleString("pl-PL")} zł`,
      notes: quote.notes || undefined,
    });
  };

  const handleGenerateOrderPdf = () => {
    const itemRows = (items ?? []).map((item: any, i: number) => [
      i + 1,
      item.service_name,
      item.quantity,
      `${Number(item.unit_price).toLocaleString("pl-PL")} zł`,
      `${Number(item.total).toLocaleString("pl-PL")} zł`,
    ]);

    generateReportPDF({
      title: "ZLECENIE WYKONANIA USŁUG",
      subtitle: `Na podstawie oferty ${quote.quote_number}`,
      filename: `Zlecenie_${quote.quote_number.replace(/\//g, '-')}.pdf`,
      metadata: [
        { label: "Nr zlecenia", value: `ZL/${quote.quote_number.split("/").slice(1).join("/")}` },
        { label: "Zleceniodawca", value: company?.name || quote.company_name || "—" },
        { label: "Adres", value: company?.address || "—" },
        { label: "NIP", value: company?.nip || "—" },
        { label: "Osoba kontaktowa", value: quote.contact_name || "—" },
        { label: "Data zlecenia", value: new Date().toLocaleDateString("pl-PL") },
      ],
      tableColumns: ["Lp.", "Zakres prac", "Ilość", "Cena jdn.", "Wartość netto"],
      tableData: itemRows.length > 0 ? itemRows : [[1, "Wg oferty", "", "", `${Number(quote.total).toLocaleString("pl-PL")} zł`]],
      result: `Wartość zlecenia netto: ${Number(quote.total).toLocaleString("pl-PL")} zł`,
      notes: "Zlecenie wygenerowane automatycznie na podstawie zaakceptowanej oferty.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {quote.quote_number}
          </DialogTitle>
          <DialogDescription>{quote.company_name} — {new Date(quote.created_at).toLocaleDateString("pl-PL")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Actions */}
          <div className="flex items-center justify-between">
            <Badge variant={STATUS_MAP[quote.status]?.variant ?? "secondary"} className="text-sm">
              {STATUS_MAP[quote.status]?.label ?? quote.status}
            </Badge>
            {isSuperAdmin && (
              <div className="flex gap-2">
                {quote.status !== "zaakceptowana" && (
                  <Button size="sm" variant="default" onClick={() => handleStatusChange("zaakceptowana")}>
                    <CheckCircle className="mr-1 h-3.5 w-3.5" /> Zatwierdź
                  </Button>
                )}
                {quote.status !== "wysłana" && quote.status !== "zaakceptowana" && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange("wysłana")}>
                    Wyślij
                  </Button>
                )}
                {quote.status !== "odrzucona" && (
                  <Button size="sm" variant="destructive" onClick={() => handleStatusChange("odrzucona")}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Odrzuć
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Items */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usługa</TableHead>
                  <TableHead className="text-center">Ilość</TableHead>
                  <TableHead className="text-right">Cena jdn.</TableHead>
                  <TableHead className="text-right">Wartość</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.service_name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{Number(item.unit_price).toLocaleString("pl-PL")} zł</TableCell>
                    <TableCell className="text-right font-semibold">{Number(item.total).toLocaleString("pl-PL")} zł</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Summary */}
          <div className="p-4 rounded-lg bg-secondary border border-border space-y-1">
            {discount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Rabat:</span><span>{discount}%</span>
              </div>
            )}
            <div className="flex justify-between items-center font-semibold">
              <span>Suma netto:</span>
              <span className="text-lg text-primary">{Number(quote.total).toLocaleString("pl-PL")} zł</span>
            </div>
          </div>

          {quote.notes && (
            <div className="text-sm"><span className="font-semibold">Uwagi:</span> {quote.notes}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleGeneratePdf}>
            <FileText className="mr-2 h-4 w-4" /> Pobierz ofertę PDF
          </Button>
          {quote.status === "zaakceptowana" && (
            <Button onClick={handleGenerateOrderPdf} className="fire-gradient">
              <FileText className="mr-2 h-4 w-4" /> Generuj zlecenie PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const OPP_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  "nowy_lead": { label: "Nowy lead", variant: "secondary", color: "bg-blue-500/10 text-blue-500" },
  "kontakt": { label: "Kontakt", variant: "outline", color: "bg-amber-500/10 text-amber-500" },
  "oferta": { label: "Oferta", variant: "outline", color: "bg-purple-500/10 text-purple-500" },
  "zlecenie": { label: "Zlecenie", variant: "default", color: "bg-emerald-500/10 text-emerald-500" },
  "archiwum": { label: "Archiwum", variant: "destructive", color: "bg-muted text-muted-foreground" },
};

const OPP_FLOW = ["nowy_lead", "kontakt", "oferta", "zlecenie", "archiwum"];

// ---- Add Opportunity Dialog ----
function AddOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutate: create, isPending } = useCreateOpportunity();
  const [form, setForm] = useState({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", description: "", estimated_value: 0, source: "manual" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) { toast.error("Podaj nazwę firmy/klienta."); return; }
    create(form, {
      onSuccess: () => { toast.success("Szansa sprzedażowa dodana!"); onOpenChange(false); setForm({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", description: "", estimated_value: 0, source: "manual" }); },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowa szansa sprzedażowa</DialogTitle>
            <DialogDescription>Dodaj potencjalnego klienta lub lead.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Nazwa firmy / klienta *</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} required placeholder="np. ABC Sp. z o.o." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Osoba kontaktowa</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Telefon</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="+48..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Szacowana wartość (zł)</Label><Input type="number" min={0} value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-2"><Label>Opis / czego dotyczy</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Czego ma dotyczyć zlecenie..." rows={3} /></div>
            <div className="space-y-2"><Label>Źródło</Label>
              <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Ręczne</SelectItem>
                  <SelectItem value="referral">Polecenie</SelectItem>
                  <SelectItem value="website">Strona www</SelectItem>
                  <SelectItem value="phone">Telefon</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Dodaj</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main Finance Page ----
export default function FinancePage() {
  const { role } = useAuth();
  const { data: quotes, isLoading: quotesLoading } = useQuotes();
  const { data: companies } = useCompanies();
  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: opportunities, isLoading: oppsLoading } = useSalesOpportunities();
  const { data: financeSummary, isLoading: financeLoading } = useTaskFinanceSummary();
  const { mutate: updateOpportunity } = useUpdateOpportunity();
  const { mutate: deleteOpportunity } = useDeleteOpportunity();
  const { mutate: createCompany } = useCreateCompany();

  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [addOppOpen, setAddOppOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [oppStatusFilter, setOppStatusFilter] = useState("active");
  const [convertOpp, setConvertOpp] = useState<any | null>(null);

  const isSuperAdmin = role === "super_admin";

  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];
    let list = quotes;
    if (statusFilter !== "all") list = list.filter((q: any) => q.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) => r.quote_number.toLowerCase().includes(q) || r.company_name.toLowerCase().includes(q));
    }
    return list;
  }, [quotes, statusFilter, search]);

  const filteredOpps = useMemo(() => {
    if (!opportunities) return [];
    if (oppStatusFilter === "active") return opportunities.filter((o: any) => o.status !== "archiwum");
    if (oppStatusFilter === "archiwum") return opportunities.filter((o: any) => o.status === "archiwum");
    return opportunities;
  }, [opportunities, oppStatusFilter]);

  const stats = useMemo(() => {
    if (!quotes) return { total: 0, accepted: 0, pending: 0, revenue: 0, oppsCount: 0, oppsValue: 0 };
    const accepted = quotes.filter((q: any) => q.status === "zaakceptowana");
    const pending = quotes.filter((q: any) => q.status === "wersja robocza" || q.status === "wysłana");
    const activeOpps = (opportunities ?? []).filter((o: any) => o.status !== "archiwum");
    return {
      total: quotes.length,
      accepted: accepted.length,
      pending: pending.length,
      revenue: accepted.reduce((s: number, q: any) => s + Number(q.total), 0),
      oppsCount: activeOpps.length,
      oppsValue: activeOpps.reduce((s: number, o: any) => s + Number(o.estimated_value || 0), 0),
    };
  }, [quotes, opportunities]);

  const handleOppStatusChange = (id: string, newStatus: string) => {
    updateOpportunity({ id, updates: { status: newStatus, updated_at: new Date().toISOString() } }, {
      onSuccess: () => toast.success(`Status zmieniony na: ${OPP_STATUS_MAP[newStatus]?.label ?? newStatus}`),
    });
  };

  const handleConvertToCompany = (opp: any) => {
    // Otwórz pełny dialog konwersji (firma + obiekt + kontakt + zadanie startowe)
    setConvertOpp(opp);
  };

  

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanse</h1>
          <p className="text-sm text-muted-foreground">Szanse sprzedażowe, oferty, zlecenia i przychody</p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddOppOpen(true)}>
              <Target className="mr-2 h-4 w-4" /> Nowa szansa
            </Button>
            <Button onClick={() => setCreateQuoteOpen(true)} className="fire-gradient">
              <Plus className="mr-2 h-4 w-4" /> Nowa oferta
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Szanse sprzedażowe</p><p className="text-2xl font-bold">{stats.oppsCount}</p><p className="text-xs text-muted-foreground">{stats.oppsValue.toLocaleString("pl-PL")} zł potencjał</p></div><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Target className="h-5 w-5 text-primary" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Oferty</p><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">{stats.accepted} zatwierdzone</p></div><div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center"><FileText className="h-5 w-5 text-muted-foreground" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Przychody z zadań</p><p className="text-2xl font-bold text-primary">{financeSummary ? financeSummary.totalIncome.toLocaleString("pl-PL") : "0"} zł</p><p className="text-xs text-muted-foreground">{financeSummary?.tasksWithFinance ?? 0} zadań z ewidencją</p></div><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{financeLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <TrendingUp className="h-5 w-5 text-primary" />}</div></div></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Koszty zadań</p><p className="text-2xl font-bold text-destructive">{financeSummary ? financeSummary.totalCosts.toLocaleString("pl-PL") : "0"} zł</p><p className="text-xs text-muted-foreground">Wg arkusza zadaniowego</p></div><div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-destructive" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Bilans</p><p className="text-2xl font-bold">{financeSummary ? financeSummary.balance.toLocaleString("pl-PL") : "0"} zł</p><p className="text-xs text-muted-foreground">Przychody - koszty</p></div><div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center"><DollarSign className="h-5 w-5 text-foreground" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">Marża</p><p className="text-2xl font-bold">{financeSummary ? `${Math.round(financeSummary.margin)}%` : "0%"}</p><p className="text-xs text-muted-foreground">Na podstawie pozycji finansowych</p></div><div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center"><Percent className="h-5 w-5 text-foreground" /></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="opportunities" className="w-full">
        <TabsList className="bg-secondary p-1 rounded-xl">
          <TabsTrigger value="opportunities" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-semibold">
            <Target className="h-4 w-4 mr-1.5" /> Szanse ({(opportunities ?? []).filter((o: any) => o.status !== "archiwum").length})
          </TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-semibold">
            <FileText className="h-4 w-4 mr-1.5" /> Oferty ({(quotes ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-semibold">
            <BarChart3 className="h-4 w-4 mr-1.5" /> Kategorie
          </TabsTrigger>
        </TabsList>

        {/* ---- OPPORTUNITIES TAB ---- */}
        <TabsContent value="opportunities" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={oppStatusFilter} onValueChange={setOppStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktywne</SelectItem>
                <SelectItem value="archiwum">Archiwum</SelectItem>
                <SelectItem value="all">Wszystkie</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredOpps.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Brak szans sprzedażowych</p>
              <p className="text-sm mt-1">Dodaj nowego potencjalnego klienta.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOpps.map((opp: any) => {
                const statusInfo = OPP_STATUS_MAP[opp.status] ?? OPP_STATUS_MAP["nowy_lead"];
                const currentIdx = OPP_FLOW.indexOf(opp.status);
                const nextStatus = currentIdx < OPP_FLOW.length - 2 ? OPP_FLOW[currentIdx + 1] : null;

                return (
                  <Card key={opp.id} className="group relative">
                    <CardContent className="pt-5 pb-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{opp.company_name}</p>
                          {opp.contact_name && <p className="text-xs text-muted-foreground">{opp.contact_name}</p>}
                        </div>
                        <Badge className={`${statusInfo.color} border-0 text-xs`}>{statusInfo.label}</Badge>
                      </div>

                      {opp.description && <p className="text-xs text-muted-foreground line-clamp-2">{opp.description}</p>}

                      <div className="flex items-center justify-between text-xs">
                        {opp.estimated_value > 0 && (
                          <span className="font-semibold text-primary">{Number(opp.estimated_value).toLocaleString("pl-PL")} zł</span>
                        )}
                        <span className="text-muted-foreground">{new Date(opp.created_at).toLocaleDateString("pl-PL")}</span>
                      </div>

                      {opp.contact_phone && <p className="text-xs text-muted-foreground">📞 {opp.contact_phone}</p>}
                      {opp.contact_email && <p className="text-xs text-muted-foreground">✉️ {opp.contact_email}</p>}

                      {/* Actions */}
                      {isSuperAdmin && opp.status !== "archiwum" && (
                        <div className="flex gap-1.5 pt-2 border-t border-border flex-wrap">
                          {nextStatus && nextStatus !== "archiwum" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleOppStatusChange(opp.id, nextStatus)}>
                              <ArrowRight className="mr-1 h-3 w-3" /> {OPP_STATUS_MAP[nextStatus]?.label}
                            </Button>
                          )}
                          {opp.status === "oferta" && !opp.company_id && (
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleConvertToCompany(opp)}>
                              <Building2 className="mr-1 h-3 w-3" /> Utwórz firmę + zlecenie
                            </Button>
                          )}
                          {opp.company_id && (
                            <Badge variant="outline" className="text-xs"><Building2 className="mr-1 h-3 w-3" /> Firma utworzona</Badge>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleOppStatusChange(opp.id, "archiwum")}>
                            <Archive className="mr-1 h-3 w-3" /> Archiwum
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteOpportunity(opp.id, { onSuccess: () => toast.success("Usunięto.") })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ---- QUOTES TAB ---- */}
        <TabsContent value="quotes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Oferty i zlecenia</CardTitle>
                  <CardDescription>Zarządzaj ofertami, zatwierdzaj i generuj zlecenia</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Szukaj..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      <SelectItem value="wersja robocza">Wersja robocza</SelectItem>
                      <SelectItem value="wysłana">Wysłane</SelectItem>
                      <SelectItem value="zaakceptowana">Zaakceptowane</SelectItem>
                      <SelectItem value="odrzucona">Odrzucone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredQuotes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                  <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Brak ofert</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr oferty</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead>Kontakt</TableHead>
                      <TableHead className="text-right">Rabat</TableHead>
                      <TableHead className="text-right">Kwota netto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.map((q: any) => (
                      <TableRow key={q.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setSelectedQuote(q)}>
                        <TableCell className="font-mono text-sm font-medium">{q.quote_number}</TableCell>
                        <TableCell>{q.company_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{q.contact_name || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {Number(q.discount_percent) > 0 ? <span className="text-destructive font-medium">{q.discount_percent}%</span> : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{Number(q.total).toLocaleString("pl-PL")} zł</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_MAP[q.status]?.variant ?? "secondary"}>
                            {STATUS_MAP[q.status]?.label ?? q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(q.created_at).toLocaleDateString("pl-PL")}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSelectedQuote(q); }}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- CATEGORIES TAB ---- */}
        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Kategorie przychodów</CardTitle>
              <CardDescription>Podział usług wg kategorii</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {REVENUE_CATEGORIES.map(cat => {
                  const catServices = (services ?? []).filter((s: any) => s.category === cat);
                  return (
                    <div key={cat} className="p-3 rounded-lg border border-border bg-secondary/30 text-center space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{cat}</p>
                      <p className="text-lg font-bold">{catServices.length}</p>
                      <p className="text-[10px] text-muted-foreground">usług</p>
                    </div>
                  );
                })}
              </div>

              {/* Services list */}
              <div className="mt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategoria</TableHead>
                      <TableHead>Usługa</TableHead>
                      <TableHead>Jednostka</TableHead>
                      <TableHead className="text-right">Cena netto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(services ?? []).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell><Badge variant="outline" className="text-xs">{s.category}</Badge></TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.unit}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(s.unit_price).toLocaleString("pl-PL")} zł</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateQuoteDialog open={createQuoteOpen} onOpenChange={setCreateQuoteOpen} />
      <AddOpportunityDialog open={addOppOpen} onOpenChange={setAddOppOpen} />
      <QuoteDetailDialog quote={selectedQuote} open={!!selectedQuote} onOpenChange={(o) => { if (!o) setSelectedQuote(null); }} />
    </div>
  );
}
