import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateTask, useBuildings } from "@/hooks/useSupabaseData";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateTicketDialog({ open, onOpenChange }: Props) {
  const { data: buildings } = useBuildings();
  const createTask = useCreateTask();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    description: "",
    building_id: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Tytuł usterki jest wymagany";
    if (form.title.length > 200) e.title = "Max 200 znaków";
    if (!form.building_id) e.building_id = "Wybierz obiekt";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const building = buildings?.find(b => b.id === form.building_id);
    if (!building) return;

    try {
      await createTask.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        type: "usterka", // Domyslnie usterka zglaszana przez klienta
        priority: "wysoki", // Domyslnie wysoki
        building_id: form.building_id,
        company_id: building.company_id,
        assignee_id: null,
        sla_hours: 48, // Siedzimy po nocy zeby naprawic
        deadline: null,
      });
      toast({ title: "Zgłoszenie wysłane do Serwisu PPOŻ!" });
      onOpenChange(false);
      setForm({ title: "", description: "", building_id: "" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">Zgłoszenie Usterki PPOŻ (Helpdesk)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-3 mb-2">Nasza jednostka błyskawicznie reaguje na zgłoszenia awarii w obiektach (SLA 48h).</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Wybierz swój Obiekt *</label>
            <select value={form.building_id} onChange={e => setForm(f => ({ ...f, building_id: e.target.value }))} className={inputCls}>
              <option value="">Wybierz obiekt...</option>
              {(buildings ?? []).map(b => <option key={b.id} value={b.id}>{b.name} – {b.address}</option>)}
            </select>
            {errors.building_id && <p className="mt-1 text-xs text-critical">{errors.building_id}</p>}
          </div>

          <div>
            <label className={labelCls}>Co się stało? (Krótki tytuł) *</label>
            <input placeholder="np. Wybita szyba w ROP / Brak gaśnicy" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} maxLength={200} />
            {errors.title && <p className="mt-1 text-xs text-critical">{errors.title}</p>}
          </div>

          <div>
            <label className={labelCls}>Opis szczegółowy (opcjonalnie)</label>
            <textarea placeholder="Opisz dokładnie miejsce i rodzaj usterki..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls + " min-h-[100px]"} maxLength={2000} />
          </div>

          <button
            type="submit"
            disabled={createTask.isPending}
            className="w-full rounded-md bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {createTask.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Wyślij zgłoszenie do Serwisu"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
