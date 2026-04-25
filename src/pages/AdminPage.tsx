// AdminPage — centrum konfiguracji super_admina (iter 9):
//  - Szablony audytów / checklist (CRUD + items editor)
//  - Reguły urządzeń (suggestion engine)
//  - Słowniki (read-only, eksportowane z useAdminData)
//  - Bulk import z Excela (link do oddzielnej strony)
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useChecklistTemplates, useChecklistTemplateItems,
  useCreateTemplate, useUpdateTemplate, useDeleteTemplate,
  useCreateTemplateItem, useUpdateTemplateItem, useDeleteTemplateItem,
  useDeviceRequirementRules, useCreateRule, useUpdateRule, useDeleteRule,
  BUILDING_CLASSES, DEVICE_CATEGORIES, SLA_STATUSES, TASK_PRIORITIES, TASK_STATUSES,
  type ChecklistTemplate, type ChecklistTemplateItem, type DeviceRequirementRule,
} from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Edit2, ListChecks, Wrench,
  BookOpen, ChevronRight, Lock, Save, X, FileSpreadsheet, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

const TABS = [
  { id: "templates",   label: "Szablony audytów", icon: ListChecks },
  { id: "rules",       label: "Reguły urządzeń", icon: Wrench },
  { id: "dictionaries", label: "Słowniki", icon: BookOpen },
];

export default function AdminPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState("templates");

  if (role !== "super_admin") return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel administratora</h1>
        <p className="text-sm text-muted-foreground">Konfiguracja szablonów, reguł i słowników aplikacji</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "templates" && <TemplatesTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "dictionaries" && <DictionariesTab />}
    </div>
  );
}

// =================== TEMPLATES TAB ===================
function TemplatesTab() {
  const { data: templates, isLoading } = useChecklistTemplates();
  const [selectedTpl, setSelectedTpl] = useState<ChecklistTemplate | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Szablony używane w module Audyty (Checklisty). Możesz tworzyć własne lub modyfikować istniejące.
        </p>
        <Link to="/admin/import" className="text-xs text-primary hover:underline flex items-center gap-1">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Import z Excela <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        {/* Left: list */}
        <div className="space-y-2">
          <Button onClick={() => setNewOpen(true)} className="w-full" variant="outline">
            <Plus className="mr-2 h-4 w-4" /> Nowy szablon
          </Button>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (templates ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Brak szablonów. Dodaj pierwszy.</p>
          ) : (
            <div className="space-y-1.5">
              {(templates ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTpl(t)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedTpl?.id === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{t.code}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{t.scope}</Badge>
                    {t.is_system && <Badge variant="secondary" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />systemowy</Badge>}
                    {!t.is_active && <Badge variant="destructive" className="text-[10px]">nieaktywny</Badge>}
                    <span className="text-[10px] text-muted-foreground">{t.items_count ?? 0} pozycji</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div>
          {selectedTpl ? (
            <TemplateDetail tpl={selectedTpl} onClose={() => setSelectedTpl(null)} />
          ) : (
            <div className="rounded-lg border-2 border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" />
              Wybierz szablon z listy aby edytować.
            </div>
          )}
        </div>
      </div>

      <TemplateFormDialog open={newOpen} onOpenChange={setNewOpen} mode="create" />
    </>
  );
}

function TemplateDetail({ tpl, onClose }: { tpl: ChecklistTemplate; onClose: () => void }) {
  const { data: items, isLoading } = useChecklistTemplateItems(tpl.id);
  const [editOpen, setEditOpen] = useState(false);
  const [itemEditOpen, setItemEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistTemplateItem | null>(null);
  const { mutate: deleteTpl, isPending: deletingTpl } = useDeleteTemplate();
  const { mutate: deleteItem } = useDeleteTemplateItem();

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{tpl.name}</h3>
            {tpl.description && <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            {!tpl.is_system && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!window.confirm(`Usunąć szablon „${tpl.name}"? Wszystkie pozycje przepadną.`)) return;
                  deleteTpl(tpl.id, {
                    onSuccess: () => { toast.success("Szablon usunięty."); onClose(); },
                    onError: (e: any) => toast.error(e?.message ?? "Nie udało się usunąć."),
                  });
                }}
                disabled={deletingTpl}
                className="text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Pozycje ({items?.length ?? 0})</h4>
            <Button size="sm" onClick={() => { setEditingItem(null); setItemEditOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Dodaj pozycję
            </Button>
          </div>
          {isLoading ? (
            <div className="flex h-20 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
          ) : (items ?? []).length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">Brak pozycji. Dodaj pierwszą.</p>
          ) : (
            <ul className="space-y-1.5">
              {items!.map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <span className="text-[10px] font-mono text-muted-foreground w-7">{it.sort_order}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{it.label}</p>
                    {it.section && <p className="text-[10px] text-muted-foreground">{it.section}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{it.default_severity}</Badge>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditingItem(it); setItemEditOpen(true); }}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (!window.confirm(`Usunąć pozycję „${it.label}"?`)) return;
                        deleteItem({ id: it.id, template_id: tpl.id }, {
                          onSuccess: () => toast.success("Pozycja usunięta."),
                          onError: (e: any) => toast.error(e?.message ?? "Nie udało się usunąć."),
                        });
                      }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <TemplateFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" tpl={tpl} />
      <TemplateItemDialog open={itemEditOpen} onOpenChange={setItemEditOpen} templateId={tpl.id} item={editingItem} />
    </Card>
  );
}

function TemplateFormDialog({
  open, onOpenChange, mode, tpl,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  mode: "create" | "edit"; tpl?: ChecklistTemplate;
}) {
  const { mutate: create, isPending: creating } = useCreateTemplate();
  const { mutate: update, isPending: updating } = useUpdateTemplate();
  const isPending = creating || updating;

  const [form, setForm] = useState({
    code: tpl?.code ?? "",
    name: tpl?.name ?? "",
    description: tpl?.description ?? "",
    scope: tpl?.scope ?? "audyt",
    device_category: tpl?.device_category ?? "",
    is_active: tpl?.is_active ?? true,
  });

  // Reset form on open
  if (open && tpl && form.code !== tpl.code && mode === "edit") {
    setForm({
      code: tpl.code, name: tpl.name, description: tpl.description ?? "",
      scope: tpl.scope, device_category: tpl.device_category ?? "",
      is_active: tpl.is_active,
    });
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Kod i nazwa są wymagane.");
      return;
    }
    const payload: any = {
      ...form,
      device_category: form.device_category || null,
      description: form.description || null,
    };
    const cb = {
      onSuccess: () => { toast.success(mode === "create" ? "Szablon utworzony." : "Szablon zaktualizowany."); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu."),
    };
    if (mode === "create") create(payload, cb);
    else if (tpl) update({ id: tpl.id, updates: payload }, cb);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Nowy szablon" : "Edytuj szablon"}</DialogTitle>
            <DialogDescription>Szablon checklisty dla audytów lub przeglądów sprzętu.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label>Kod *</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder="np. audyt_pelny_ppoz" disabled={mode === "edit" && tpl?.is_system} />
              <p className="text-[10px] text-muted-foreground">Unikalny identyfikator (snake_case, bez spacji).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nazwa *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="np. Pełny audyt PPOŻ" />
            </div>
            <div className="space-y-1.5">
              <Label>Opis</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Zakres *</Label>
                <Select value={form.scope} onValueChange={v => setForm({ ...form, scope: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audyt">Audyt</SelectItem>
                    <SelectItem value="sprzet">Sprzęt</SelectItem>
                    <SelectItem value="bhp">BHP</SelectItem>
                    <SelectItem value="inne">Inne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kategoria urządzeń</Label>
                <Select value={form.device_category || "none"} onValueChange={v => setForm({ ...form, device_category: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— brak —</SelectItem>
                    {DEVICE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label className="text-sm font-normal cursor-pointer">Aktywny</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateItemDialog({
  open, onOpenChange, templateId, item,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  templateId: string; item: ChecklistTemplateItem | null;
}) {
  const { mutate: create, isPending: creating } = useCreateTemplateItem();
  const { mutate: update, isPending: updating } = useUpdateTemplateItem();
  const isPending = creating || updating;
  const isEdit = !!item;

  const [form, setForm] = useState(() => ({
    label: item?.label ?? "",
    description: item?.description ?? "",
    section: item?.section ?? "",
    sort_order: item?.sort_order ?? 100,
    default_severity: item?.default_severity ?? "średni" as const,
    requires_photo: item?.requires_photo ?? false,
    requires_note_on_fail: item?.requires_note_on_fail ?? true,
  }));

  // Sync form state when item changes
  if (open && item && form.label !== item.label) {
    setForm({
      label: item.label, description: item.description ?? "",
      section: item.section ?? "", sort_order: item.sort_order,
      default_severity: item.default_severity, requires_photo: item.requires_photo,
      requires_note_on_fail: item.requires_note_on_fail,
    });
  }
  if (open && !item && form.label !== "") {
    setForm({ label: "", description: "", section: "", sort_order: 100, default_severity: "średni", requires_photo: false, requires_note_on_fail: true });
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) { toast.error("Treść pozycji jest wymagana."); return; }
    const payload: any = { ...form, template_id: templateId, description: form.description || null, section: form.section || null };
    const cb = {
      onSuccess: () => { toast.success(isEdit ? "Pozycja zaktualizowana." : "Pozycja dodana."); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu."),
    };
    if (isEdit && item) update({ id: item.id, updates: payload }, cb);
    else create(payload, cb);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edytuj pozycję" : "Nowa pozycja"}</DialogTitle>
            <DialogDescription>Pojedynczy punkt do odhaczenia w trakcie audytu.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label>Treść *</Label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder='np. Czy drzwi przeciwpożarowe domykają się samoczynnie?' />
            </div>
            <div className="space-y-1.5">
              <Label>Opis (opcjonalny)</Label>
              <Textarea value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sekcja</Label>
                <Input value={form.section ?? ""} onChange={e => setForm({ ...form, section: e.target.value })}
                  placeholder="np. Drogi ewak." />
              </div>
              <div className="space-y-1.5">
                <Label>Kolejność</Label>
                <Input type="number" value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 100 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Domyślny priorytet</Label>
              <Select value={form.default_severity} onValueChange={v => setForm({ ...form, default_severity: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="niski">Niski</SelectItem>
                  <SelectItem value="średni">Średni</SelectItem>
                  <SelectItem value="wysoki">Wysoki</SelectItem>
                  <SelectItem value="krytyczny">Krytyczny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.requires_photo} onCheckedChange={v => setForm({ ...form, requires_photo: v })} />
              <Label className="text-sm font-normal cursor-pointer">Wymaga zdjęcia</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_note_on_fail} onCheckedChange={v => setForm({ ...form, requires_note_on_fail: v })} />
              <Label className="text-sm font-normal cursor-pointer">Wymaga notatki przy "nie zgodne"</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              <Save className="mr-1.5 h-3.5 w-3.5" /> Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =================== RULES TAB ===================
function RulesTab() {
  const { data: rules, isLoading } = useDeviceRequirementRules();
  const { mutate: deleteRule } = useDeleteRule();
  const [editOpen, setEditOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DeviceRequirementRule | null>(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Reguły dobierane przez suggestion engine na <code>BuildingDevicesPage</code>.
          Określają jakie urządzenia ppoż wymagane są dla obiektu na podstawie klasy + powierzchni.
        </p>
        <Button onClick={() => { setEditingRule(null); setEditOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nowa reguła
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (rules ?? []).length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed border-border rounded-lg">
          Brak reguł. Dodaj pierwszą.
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Klasa</th>
                <th className="px-4 py-2.5 text-left font-medium">Powierzchnia</th>
                <th className="px-4 py-2.5 text-left font-medium">Wymagane urządzenie</th>
                <th className="px-4 py-2.5 text-left font-medium">Wzór ilości</th>
                <th className="px-4 py-2.5 text-left font-medium">Podstawa prawna</th>
                <th className="px-4 py-2.5 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules!.map(r => (
                <tr key={r.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-2.5 font-medium">{r.building_class || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.area_min ?? 0} – {r.area_max ?? "∞"} m²
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono">{r.required_device_type}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.quantity_formula || "—"}</td>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground max-w-[200px] truncate" title={r.legal_basis ?? ""}>
                    {r.legal_basis || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditingRule(r); setEditOpen(true); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (!window.confirm("Usunąć tę regułę?")) return;
                          deleteRule(r.id, {
                            onSuccess: () => toast.success("Reguła usunięta."),
                            onError: (e: any) => toast.error(e?.message ?? "Błąd."),
                          });
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RuleFormDialog open={editOpen} onOpenChange={setEditOpen} rule={editingRule} />
    </>
  );
}

function RuleFormDialog({
  open, onOpenChange, rule,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; rule: DeviceRequirementRule | null;
}) {
  const { mutate: create, isPending: creating } = useCreateRule();
  const { mutate: update, isPending: updating } = useUpdateRule();
  const isPending = creating || updating;
  const isEdit = !!rule;

  const [form, setForm] = useState(() => ({
    building_class: rule?.building_class ?? "",
    area_min: rule?.area_min?.toString() ?? "",
    area_max: rule?.area_max?.toString() ?? "",
    required_device_type: rule?.required_device_type ?? "",
    quantity_formula: rule?.quantity_formula ?? "",
    legal_basis: rule?.legal_basis ?? "",
    notes: rule?.notes ?? "",
    is_active: rule?.is_active ?? true,
  }));

  if (open && rule && form.required_device_type !== rule.required_device_type) {
    setForm({
      building_class: rule.building_class ?? "",
      area_min: rule.area_min?.toString() ?? "",
      area_max: rule.area_max?.toString() ?? "",
      required_device_type: rule.required_device_type,
      quantity_formula: rule.quantity_formula ?? "",
      legal_basis: rule.legal_basis ?? "",
      notes: rule.notes ?? "",
      is_active: rule.is_active,
    });
  }
  if (open && !rule && form.required_device_type !== "") {
    setForm({ building_class: "", area_min: "", area_max: "", required_device_type: "", quantity_formula: "", legal_basis: "", notes: "", is_active: true });
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.required_device_type.trim()) { toast.error("Typ urządzenia jest wymagany."); return; }
    const payload: any = {
      building_class: form.building_class || null,
      area_min: form.area_min ? parseFloat(form.area_min) : null,
      area_max: form.area_max ? parseFloat(form.area_max) : null,
      required_device_type: form.required_device_type,
      quantity_formula: form.quantity_formula || null,
      legal_basis: form.legal_basis || null,
      notes: form.notes || null,
      is_active: form.is_active,
    };
    const cb = {
      onSuccess: () => { toast.success(isEdit ? "Reguła zaktualizowana." : "Reguła dodana."); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu."),
    };
    if (isEdit && rule) update({ id: rule.id, updates: payload }, cb);
    else create(payload, cb);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edytuj regułę" : "Nowa reguła"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label>Klasa budynku</Label>
              <Select value={form.building_class || "any"} onValueChange={v => setForm({ ...form, building_class: v === "any" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="dowolna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">— dowolna —</SelectItem>
                  {BUILDING_CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.value} — {c.label.split("—")[1]?.trim() ?? c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pow. min (m²)</Label>
                <Input type="number" value={form.area_min} onChange={e => setForm({ ...form, area_min: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Pow. max (m²)</Label>
                <Input type="number" value={form.area_max} onChange={e => setForm({ ...form, area_max: e.target.value })} placeholder="∞" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Typ urządzenia *</Label>
              <Select value={form.required_device_type} onValueChange={v => setForm({ ...form, required_device_type: v })}>
                <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                <SelectContent>
                  {DEVICE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Wzór ilości</Label>
              <Input value={form.quantity_formula} onChange={e => setForm({ ...form, quantity_formula: e.target.value })}
                placeholder="np. 1 gaśnica / 100 m²" />
            </div>
            <div className="space-y-1.5">
              <Label>Podstawa prawna</Label>
              <Input value={form.legal_basis} onChange={e => setForm({ ...form, legal_basis: e.target.value })}
                placeholder="np. § 32 rozp. MSWiA" />
            </div>
            <div className="space-y-1.5">
              <Label>Notatka</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label className="text-sm font-normal cursor-pointer">Aktywna</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              <Save className="mr-1.5 h-3.5 w-3.5" /> Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =================== DICTIONARIES TAB ===================
function DictionariesTab() {
  const sections: { title: string; desc: string; items: { value: string; label: string; color?: string }[] }[] = [
    { title: "Klasy budynków", desc: "Klasy zagrożenia ludzi (PB / Rozp. MI)", items: BUILDING_CLASSES },
    { title: "Kategorie urządzeń", desc: "Typy sprzętu ppoż. używane w regułach + checklistach", items: DEVICE_CATEGORIES },
    { title: "Statusy SLA", desc: "Workflow zgłoszeń serwisowych", items: SLA_STATUSES },
    { title: "Priorytety zadań", desc: "Skala priorytetu", items: TASK_PRIORITIES },
    { title: "Statusy zadań", desc: "Stany w pipeline", items: TASK_STATUSES },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Słowniki wbudowane w aplikację. Edycja wymaga zmiany w kodzie (<code>src/hooks/useAdminData.ts</code>).
      </p>

      {sections.map((s) => (
        <Card key={s.title}>
          <CardContent className="p-5 space-y-3">
            <div>
              <h3 className="font-semibold text-sm">{s.title}</h3>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {s.items.map(it => (
                <div key={it.value} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5">
                  <code className="text-[10px] text-muted-foreground font-mono shrink-0 w-20">{it.value}</code>
                  <span className="text-xs truncate flex-1">{it.label}</span>
                  {(it as any).color && (
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${(it as any).color}`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
