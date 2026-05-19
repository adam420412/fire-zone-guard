import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanies, useBuildings, useTasks, useProfiles } from "@/hooks/useSupabaseData";
import { useCreateOpportunity } from "@/hooks/useCrmData";
import { toast } from "sonner";
import { Target, Loader2, Zap } from "lucide-react";

export default function QuickOpportunityFAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { mutate: create, isPending } = useCreateOpportunity();
  const { data: companies } = useCompanies();
  const { data: buildings } = useBuildings();
  const { data: tasks } = useTasks();
  const { data: profiles } = useProfiles();

  const empty = {
    title: "",
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    description: "",
    estimated_value: 0,
    source: "manual",
    company_id: "",
    building_id: "",
    task_id: "",
    assignee_id: "",
    follow_up_at: "",
  };
  const [form, setForm] = useState(empty);

  const filteredBuildings = useMemo(
    () => (buildings ?? []).filter((b: any) => !form.company_id || b.company_id === form.company_id),
    [buildings, form.company_id]
  );
  const filteredTasks = useMemo(
    () => (tasks ?? []).filter((t: any) =>
      (!form.company_id || t.company_id === form.company_id) &&
      (!form.building_id || t.building_id === form.building_id)
    ),
    [tasks, form.company_id, form.building_id]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() && !form.company_id) {
      toast.error("Podaj nazwę firmy lub wybierz istniejącą.");
      return;
    }
    const linkedCompanyName = form.company_id
      ? (companies ?? []).find((c: any) => c.id === form.company_id)?.name ?? form.company_name
      : form.company_name;

    const payload: any = {
      title: form.title || null,
      company_name: linkedCompanyName || form.company_name,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      description: form.description,
      estimated_value: form.estimated_value,
      source: form.source,
      company_id: form.company_id || null,
      building_id: form.building_id || null,
      task_id: form.task_id || null,
      assignee_id: form.assignee_id || null,
      follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null,
    };

    create(payload, {
      onSuccess: () => {
        toast.success("Szansa sprzedażowa dodana!");
        setOpen(false);
        setForm(empty);
        navigate("/finance?tab=opportunities");
      },
      onError: (err) => toast.error("Błąd: " + err.message),
    });
  };

  const handleOpen = () => {
    setForm(empty);
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full fire-gradient px-5 py-3 text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 transition-all duration-200 group"
        title="Szybka szansa sprzedażowa"
      >
        <Zap className="h-5 w-5" />
        <span className="text-sm font-semibold hidden sm:inline">Szybka szansa</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Szybka szansa sprzedażowa
              </DialogTitle>
              <DialogDescription>Zarejestruj zapytanie / lead i przypisz osobę oraz termin.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Tytuł / sprawa</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="np. Zapytanie o gaśnice — biuro Warszawa" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Powiązana firma (opcjonalnie)</Label>
                  <Select value={form.company_id || "none"} onValueChange={v => setForm({ ...form, company_id: v === "none" ? "" : v, building_id: "", task_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Wybierz firmę..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— brak —</SelectItem>
                      {(companies ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nowa firma / klient {!form.company_id && "*"}</Label>
                  <Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder="np. ABC Sp. z o.o." disabled={!!form.company_id} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Obiekt (opcjonalnie)</Label>
                  <Select value={form.building_id || "none"} onValueChange={v => setForm({ ...form, building_id: v === "none" ? "" : v, task_id: "" })}>
                    <SelectTrigger><SelectValue placeholder={form.company_id ? "Wybierz obiekt..." : "Najpierw wybierz firmę"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— brak —</SelectItem>
                      {filteredBuildings.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Powiązane zlecenie (opcjonalnie)</Label>
                  <Select value={form.task_id || "none"} onValueChange={v => setForm({ ...form, task_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Wybierz zlecenie..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— brak —</SelectItem>
                      {filteredTasks.slice(0, 50).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Kto (osoba)</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Imię i nazwisko" /></div>
                <div className="space-y-2"><Label>Telefon</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="+48..." /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
              </div>

              <div className="space-y-2">
                <Label>Treść / opis (np. treść maila, notatka z rozmowy)</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Treść zapytania, maila, notatka z rozmowy..." rows={4} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Osoba przypisana</Label>
                  <Select value={form.assignee_id || "none"} onValueChange={v => setForm({ ...form, assignee_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Opcjonalnie..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— nikt —</SelectItem>
                      {(profiles ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Termin zajęcia się</Label>
                  <Input type="datetime-local" value={form.follow_up_at} onChange={e => setForm({ ...form, follow_up_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Źródło</Label>
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

              <div className="space-y-2">
                <Label>Szacowana wartość (zł)</Label>
                <Input type="number" min={0} value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: parseFloat(e.target.value) || 0 })} className="w-40" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={isPending} className="fire-gradient">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Dodaj szansę
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
