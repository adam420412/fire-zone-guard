import { useState, useMemo } from "react";
import { useContacts, useCreateContact, useDeleteContact } from "@/hooks/useCrmData";
import { useCompanies } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, User, Phone, Mail, Building2, Loader2, Trash2, Search } from "lucide-react";

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

// ---- Main CRM Page (Contacts only) ----
export default function CrmPage() {
  const { role } = useAuth();
  const { data: contacts, isLoading } = useContacts();
  const { mutate: deleteContact } = useDeleteContact();

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c: any) => c.name.toLowerCase().includes(q) || c.company_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [contacts, search]);

  const isSuperAdmin = role === "super_admin";

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground">Kontakty i osoby kontaktowe</p>
        </div>
        {isSuperAdmin && (
          <Button variant="outline" onClick={() => setAddContactOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nowy kontakt
          </Button>
        )}
      </div>

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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => {
                        if (!window.confirm(`Usunąć kontakt „${contact.name}"?`)) return;
                        deleteContact(contact.id, {
                          onSuccess: () => toast.success("Kontakt usunięty."),
                          onError: (e: any) => toast.error(e?.message ?? "Nie udało się usunąć."),
                        });
                      }}
                    >
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

      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} />
    </div>
  );
}
