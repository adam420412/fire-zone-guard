import { useState, useMemo } from "react";
import { useContacts, useCreateContact, useDeleteContact, useServices, useQuotes, useCreateQuote, useCreateQuoteItem } from "@/hooks/useCrmData";
import { useCompanies } from "@/hooks/useSupabaseData";
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
import { toast } from "sonner";
import { Plus, User, Phone, Mail, Building2, Loader2, Trash2, FileText, Search, ShoppingCart } from "lucide-react";
import { generateReportPDF } from "@/lib/pdfGenerator";

// ---- Add Contact Dialog ----
function AddContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: companies } = useCompanies();
  const { mutate: createContact, isPending } = useCreateContact();
  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "", company_id: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.company_id) { toast.error("Uzupełnij nazwę i firmę."); return; }
    createContact(form, {
      onSuccess: () => { toast.success("Kontakt dodany!"); onOpenChange(false); setForm({ name: "", email: "", phone: "", position: "", company_id: "" }); },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj osobę kontaktową</DialogTitle>
            <DialogDescription>Dane kontaktowe powiązane z firmą klienta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Firma *</Label>
              <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz firmę..." /></SelectTrigger>
                <SelectContent>{companies?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Imię i nazwisko *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Stanowisko</Label><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="np. Kierownik BHP" /></div>
              <div className="space-y-2"><Label>Telefon</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+48..." /></div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
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

// ---- Create Quote Dialog ----
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
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});

  const filteredContacts = useMemo(() => (contacts ?? []).filter((c: any) => c.company_id === companyId), [contacts, companyId]);
  const groupedServices = useMemo(() => {
    const groups: Record<string, any[]> = {};
    (services ?? []).forEach((s: any) => { (groups[s.category] ??= []).push(s); });
    return groups;
  }, [services]);

  const total = useMemo(() => {
    return Object.entries(selectedServices).reduce((sum, [sid, qty]) => {
      const svc = (services ?? []).find((s: any) => s.id === sid);
      return sum + (svc ? (svc as any).unit_price * qty : 0);
    }, 0);
  }, [selectedServices, services]);

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
        setCompanyId(""); setContactId(""); setNotes(""); setSelectedServices({});
      },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Utwórz ofertę</DialogTitle>
            <DialogDescription>Wybierz firmę, osobę kontaktową i usługi.</DialogDescription>
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
                            <Input
                              type="number"
                              min={1}
                              value={selectedServices[svc.id]}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setSelectedServices(prev => ({ ...prev, [svc.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                              className="w-16 h-8 text-center text-sm"
                            />
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

            <div className="space-y-2"><Label>Uwagi</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dodatkowe informacje..." /></div>

            <div className="flex justify-between items-center p-4 rounded-lg bg-secondary border border-border">
              <span className="font-semibold">Suma netto:</span>
              <span className="text-xl font-bold text-primary">{total.toLocaleString("pl-PL")} zł</span>
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

// ---- Main CRM Page ----
export default function CrmPage() {
  const { role } = useAuth();
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: quotes, isLoading: quotesLoading } = useQuotes();
  const { data: companies } = useCompanies();
  const { mutate: deleteContact } = useDeleteContact();

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c: any) => c.name.toLowerCase().includes(q) || c.company_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [contacts, search]);

  const handleGenerateQuotePdf = (quote: any) => {
    const company = (companies ?? []).find((c: any) => c.id === quote.company_id) as any;
    generateReportPDF({
      title: "OFERTA HANDLOWA",
      filename: `Oferta_${quote.quote_number.replace(/\//g, '-')}.pdf`,
      metadata: [
        { label: "Nr oferty", value: quote.quote_number },
        { label: "Klient", value: quote.company_name },
        { label: "Adres", value: company?.address || "—" },
        { label: "NIP", value: company?.nip || "—" },
        { label: "Osoba kontaktowa", value: quote.contact_name || "—" },
        { label: "Data", value: new Date(quote.created_at).toLocaleDateString("pl-PL") },
        { label: "Ważna do", value: quote.valid_until ? new Date(quote.valid_until).toLocaleDateString("pl-PL") : "—" },
      ],
      tableColumns: ["Lp.", "Usługa", "Kwota netto"],
      tableData: [[1, "Szczegóły w załączniku", `${Number(quote.total).toLocaleString("pl-PL")} zł`]],
      result: `Suma netto: ${Number(quote.total).toLocaleString("pl-PL")} zł`,
      notes: quote.notes || undefined,
    });
  };

  const isLoading = contactsLoading || quotesLoading;
  const isSuperAdmin = role === "super_admin";

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground">Kontakty, oferty i usługi</p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddContactOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Kontakt
            </Button>
            <Button onClick={() => setCreateQuoteOpen(true)} className="fire-gradient">
              <ShoppingCart className="mr-2 h-4 w-4" /> Nowa oferta
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="contacts" className="w-full">
        <TabsList className="bg-secondary p-1 rounded-xl">
          <TabsTrigger value="contacts" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-semibold">
            <User className="h-4 w-4 mr-1.5" /> Kontakty ({(contacts ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-semibold">
            <FileText className="h-4 w-4 mr-1.5" /> Oferty ({(quotes ?? []).length})
          </TabsTrigger>
        </TabsList>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Szukaj kontaktu..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Brak kontaktów</p>
              <p className="text-sm mt-1">Dodaj pierwszą osobę kontaktową.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContacts.map((contact: any) => (
                <Card key={contact.id} className="group relative">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {contact.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.position || "Brak stanowiska"}</p>
                        </div>
                      </div>
                      {isSuperAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => { deleteContact(contact.id); toast.success("Usunięto."); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.company_name}</span>
                      </div>
                      {contact.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /><span>{contact.phone}</span></div>}
                      {contact.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{contact.email}</span></div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Quotes Tab */}
        <TabsContent value="quotes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historia ofert</CardTitle>
              <CardDescription>Wygenerowane oferty handlowe</CardDescription>
            </CardHeader>
            <CardContent>
              {(quotes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Brak ofert. Kliknij "Nowa oferta" aby utworzyć pierwszą.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr oferty</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead>Kontakt</TableHead>
                      <TableHead>Kwota netto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(quotes ?? []).map((q: any) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono text-sm font-medium">{q.quote_number}</TableCell>
                        <TableCell>{q.company_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{q.contact_name || "—"}</TableCell>
                        <TableCell className="font-semibold">{Number(q.total).toLocaleString("pl-PL")} zł</TableCell>
                        <TableCell>
                          <Badge variant={q.status === "zaakceptowana" ? "default" : q.status === "odrzucona" ? "destructive" : "secondary"}>
                            {q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(q.created_at).toLocaleDateString("pl-PL")}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleGenerateQuotePdf(q)}>
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
      </Tabs>

      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} />
      <CreateQuoteDialog open={createQuoteOpen} onOpenChange={setCreateQuoteOpen} />
    </div>
  );
}
