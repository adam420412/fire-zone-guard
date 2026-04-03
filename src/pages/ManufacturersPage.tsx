import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Factory, Plus, Loader2, Save, Phone, Mail, MapPin, Award, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Hooks
function useManufacturers() {
  return useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manufacturers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useManufacturerDeviceCounts() {
  return useQuery({
    queryKey: ["manufacturer_device_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("manufacturer_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((d: any) => {
        if (d.manufacturer_id) counts[d.manufacturer_id] = (counts[d.manufacturer_id] || 0) + 1;
      });
      return counts;
    },
  });
}

function useCreateManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { name: string; nip?: string; phone?: string; email?: string; address?: string; specialization?: string; certificate_info?: string; notes?: string }) => {
      const { data, error } = await supabase.from("manufacturers").insert(m).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manufacturers"] }),
  });
}

// Create Dialog
function CreateManufacturerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutate: create, isPending } = useCreateManufacturer();
  const [form, setForm] = useState({ name: "", nip: "", phone: "", email: "", address: "", specialization: "", certificate_info: "", notes: "" });

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Podaj nazwę producenta."); return; }
    create(form, {
      onSuccess: () => {
        toast.success("Producent dodany!");
        onOpenChange(false);
        setForm({ name: "", nip: "", phone: "", email: "", address: "", specialization: "", certificate_info: "", notes: "" });
      },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj producenta</DialogTitle>
            <DialogDescription>Zarejestruj producenta urządzeń PPOŻ w systemie.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nazwa firmy *</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>NIP</Label>
                <Input value={form.nip} onChange={e => set("nip", e.target.value)} placeholder="np. 5261040828" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.address} onChange={e => set("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Specjalizacja</Label>
              <Input value={form.specialization} onChange={e => set("specialization", e.target.value)} placeholder="np. gaśnice, hydranty, systemy sygnalizacji" />
            </div>
            <div className="space-y-1.5">
              <Label>Certyfikaty / Uprawnienia</Label>
              <Textarea value={form.certificate_info} onChange={e => set("certificate_info", e.target.value)} rows={2} placeholder="np. CNBOP, CE, ISO 9001" />
            </div>
            <div className="space-y-1.5">
              <Label>Notatki</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Dodaj producenta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Main Page
export default function ManufacturersPage() {
  const { data: manufacturers, isLoading } = useManufacturers();
  const { data: deviceCounts } = useManufacturerDeviceCounts();
  const { role } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (manufacturers ?? []).filter((m: any) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.specialization || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Producenci</h1>
          <p className="text-sm text-muted-foreground">Rejestr producentów urządzeń przeciwpożarowych.</p>
        </div>
        {role === "super_admin" && (
          <Button onClick={() => setCreateOpen(true)} className="fire-gradient">
            <Plus className="mr-2 h-4 w-4" />
            Dodaj producenta
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj producenta..."
          className="pl-9"
        />
      </div>

      <CreateManufacturerDialog open={createOpen} onOpenChange={setCreateOpen} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m: any) => (
          <div key={m.id} className="rounded-lg border border-border bg-card p-5 card-hover">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Factory className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-card-foreground line-clamp-1">{m.name}</h3>
                {m.specialization && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{m.specialization}</p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0">
                {deviceCounts?.[m.id] || 0} urz.
              </Badge>
            </div>

            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground border-t border-border pt-3">
              {m.nip && <p className="font-mono">NIP: {m.nip}</p>}
              {m.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {m.phone}
                </p>
              )}
              {m.email && (
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> {m.email}
                </p>
              )}
              {m.address && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> <span className="line-clamp-1">{m.address}</span>
                </p>
              )}
              {m.certificate_info && (
                <p className="flex items-center gap-1.5 text-success">
                  <Award className="h-3 w-3" /> <span className="line-clamp-1">{m.certificate_info}</span>
                </p>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Factory className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Brak producentów{search ? " pasujących do wyszukiwania" : " w systemie"}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
