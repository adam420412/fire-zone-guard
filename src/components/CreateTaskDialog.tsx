import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateTask, useBuildings, useProfiles } from "@/hooks/useSupabaseData";
import { taskTypes, priorities } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface DefaultValues {
  buildingId?: string;
  companyId?: string;
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  deadline?: string; // ISO string or yyyy-MM-ddTHH:mm
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: DefaultValues;
}

export default function CreateTaskDialog({ open, onOpenChange, defaultValues }: Props) {
  const { data: buildings } = useBuildings();
  const { data: profiles } = useProfiles();
  const createTask = useCreateTask();
  const { toast } = useToast();

  const initialDeadline = defaultValues?.deadline
    ? defaultValues.deadline.length > 16
      ? defaultValues.deadline.slice(0, 16)
      : defaultValues.deadline
    : "";

  const [form, setForm] = useState({
    title: defaultValues?.title || "",
    description: defaultValues?.description || "",
    type: defaultValues?.type || "usterka" as string,
    priority: defaultValues?.priority || "średni" as string,
    building_id: defaultValues?.buildingId || "",
    assignee_id: "",
    sla_hours: 72,
    deadline: initialDeadline,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Tytuł jest wymagany";
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
        type: form.type as any,
        priority: form.priority as any,
        building_id: form.building_id,
        company_id: building.company_id,
        assignee_id: form.assignee_id || null,
        sla_hours: form.sla_hours,
        deadline: form.deadline || null,
      });
      toast({ title: "Zadanie utworzone!" });
      onOpenChange(false);
      setForm({ title: "", description: "", type: "usterka", priority: "średni", building_id: "", assignee_id: "", sla_hours: 72, deadline: "" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">Nowe zadanie</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Tytuł *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} maxLength={200} />
            {errors.title && <p className="mt-1 text-xs text-critical">{errors.title}</p>}
          </div>

          <div>
            <label className={labelCls}>Opis</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls + " min-h-[80px]"} maxLength={2000} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Typ</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                {taskTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorytet</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Obiekt *</label>
            <select value={form.building_id} onChange={e => setForm(f => ({ ...f, building_id: e.target.value }))} className={inputCls}>
              <option value="">Wybierz obiekt...</option>
              {(buildings ?? []).map(b => <option key={b.id} value={b.id}>{b.name} – {b.companyName}</option>)}
            </select>
            {errors.building_id && <p className="mt-1 text-xs text-critical">{errors.building_id}</p>}
          </div>

          <div>
            <label className={labelCls}>Osoba odpowiedzialna</label>
            <select value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))} className={inputCls} disabled={!form.building_id}>
              <option value="">Nieprzypisany</option>
              {form.building_id && (profiles ?? [])
                .filter(p => {
                  const b = buildings?.find(x => x.id === form.building_id);
                  return b && (p.company_id === b.company_id || p.company_id === null); // Allow super_admins if null
                })
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!form.building_id && <p className="mt-1 text-[10px] text-muted-foreground">Najpierw wybierz obiekt, aby zobaczyć pracowników</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>SLA (godziny)</label>
              <input type="number" value={form.sla_hours} onChange={e => setForm(f => ({ ...f, sla_hours: Number(e.target.value) }))} className={inputCls} min={1} max={8760} />
            </div>
            <div>
              <label className={labelCls}>Termin</label>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <button
            type="submit"
            disabled={createTask.isPending}
            className="w-full rounded-md fire-gradient py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {createTask.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Utwórz zadanie"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
