import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, Clock, CalendarDays, Wrench, FileText, GraduationCap, Flame, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDbTimestamp } from "@/lib/relativeTime";

type ScheduleItem = {
  id: string;
  date: Date;
  category: "zadanie" | "urządzenie" | "przegląd" | "szkolenie" | "ibp" | "ewakuacja" | "cykliczne";
  title: string;
  subtitle?: string;
  link?: string;
  status?: string;
};

const CATEGORY_META: Record<ScheduleItem["category"], { label: string; icon: any; tone: string }> = {
  zadanie:    { label: "Zadanie",       icon: FileText,      tone: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  "urządzenie": { label: "Urządzenie", icon: Wrench,        tone: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  przegląd:   { label: "Przegląd",      icon: ShieldCheck,   tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  szkolenie:  { label: "Szkolenie",     icon: GraduationCap, tone: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  ibp:        { label: "IBP",           icon: FileText,      tone: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  ewakuacja:  { label: "Ewakuacja",     icon: Flame,         tone: "bg-red-500/15 text-red-400 border-red-500/30" },
  cykliczne:  { label: "Cykliczne",     icon: CalendarDays,  tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

function useBuildingSchedule(buildingId: string) {
  return useQuery({
    queryKey: ["building-schedule", buildingId],
    enabled: !!buildingId,
    queryFn: async (): Promise<ScheduleItem[]> => {
      const items: ScheduleItem[] = [];

      const [tasks, devices, inspections, trainings, recurring, building] = await Promise.all([
        supabase.from("tasks").select("id, title, task_code, deadline, status, priority")
          .eq("building_id", buildingId).neq("status", "Zamknięte").not("deadline", "is", null),
        supabase.from("devices").select("id, name, location_in_building, inventory_number, next_service_date, status")
          .eq("building_id", buildingId).not("next_service_date", "is", null),
        supabase.from("inspections").select("id, type, next_due")
          .eq("building_id", buildingId).not("next_due", "is", null),
        supabase.from("building_trainings").select("id, title, type, next_due_date")
          .eq("building_id", buildingId).not("next_due_date", "is", null),
        supabase.from("recurring_events").select("id, title, type, next_due_date, status")
          .eq("building_id", buildingId).not("next_due_date", "is", null).neq("status", "completed"),
        supabase.from("buildings").select("ibp_valid_until, evacuation_last_date").eq("id", buildingId).single(),
      ]);

      (tasks.data ?? []).forEach((t: any) => {
        const d = parseDbTimestamp(t.deadline);
        if (d) items.push({
          id: `task-${t.id}`, date: d, category: "zadanie",
          title: t.task_code ? `${t.task_code} · ${t.title}` : t.title,
          subtitle: `Priorytet: ${t.priority} · ${t.status}`,
          link: `/kanban?task=${t.id}`,
        });
      });
      (devices.data ?? []).forEach((d: any) => {
        const date = parseDbTimestamp(d.next_service_date);
        if (date) items.push({
          id: `dev-${d.id}`, date, category: "urządzenie",
          title: d.name,
          subtitle: [d.inventory_number && `Nr ${d.inventory_number}`, d.location_in_building].filter(Boolean).join(" · "),
          link: `/buildings/${buildingId}/devices`,
        });
      });
      (inspections.data ?? []).forEach((i: any) => {
        const date = parseDbTimestamp(i.next_due);
        if (date) items.push({
          id: `insp-${i.id}`, date, category: "przegląd",
          title: `Przegląd: ${i.type}`,
        });
      });
      (trainings.data ?? []).forEach((tr: any) => {
        const date = parseDbTimestamp(tr.next_due_date);
        if (date) items.push({
          id: `trn-${tr.id}`, date, category: "szkolenie",
          title: tr.title, subtitle: tr.type,
        });
      });
      (recurring.data ?? []).forEach((r: any) => {
        const date = parseDbTimestamp(r.next_due_date);
        if (date) items.push({
          id: `rec-${r.id}`, date, category: "cykliczne",
          title: r.title, subtitle: r.type,
        });
      });
      const b = building.data as any;
      if (b?.ibp_valid_until) {
        const date = parseDbTimestamp(b.ibp_valid_until);
        if (date) items.push({ id: "ibp", date, category: "ibp", title: "Ważność IBP" });
      }
      if (b?.evacuation_last_date) {
        const last = parseDbTimestamp(b.evacuation_last_date);
        if (last) {
          const next = new Date(last); next.setMonth(next.getMonth() + 12);
          items.push({ id: "evac", date: next, category: "ewakuacja", title: "Próbna ewakuacja (rocznica)" });
        }
      }

      items.sort((a, b) => a.date.getTime() - b.date.getTime());
      return items;
    },
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
}

function bucketOf(date: Date, now = new Date()): { label: string; tone: string } {
  const diff = Math.floor((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (diff < 0) return { label: `Przeterminowane (${-diff} dni)`, tone: "text-red-400" };
  if (diff === 0) return { label: "Dziś", tone: "text-orange-400" };
  if (diff <= 7) return { label: `Za ${diff} dni`, tone: "text-amber-400" };
  if (diff <= 30) return { label: `Za ${diff} dni`, tone: "text-yellow-400" };
  return { label: `Za ${diff} dni`, tone: "text-muted-foreground" };
}

export default function BuildingScheduleTab({ buildingId }: { buildingId: string }) {
  const { data, isLoading } = useBuildingSchedule(buildingId);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ScheduleItem[] }[] = [
      { key: "overdue", label: "Przeterminowane", items: [] },
      { key: "today",   label: "Dziś",            items: [] },
      { key: "week",    label: "W tym tygodniu",  items: [] },
      { key: "month",   label: "W tym miesiącu",  items: [] },
      { key: "later",   label: "Później",         items: [] },
    ];
    const today = new Date(); today.setHours(0,0,0,0);
    (data ?? []).forEach((it) => {
      const diff = Math.floor((it.date.getTime() - today.getTime()) / 86400000);
      if (diff < 0) out[0].items.push(it);
      else if (diff === 0) out[1].items.push(it);
      else if (diff <= 7) out[2].items.push(it);
      else if (diff <= 30) out[3].items.push(it);
      else out[4].items.push(it);
    });
    return out.filter((g) => g.items.length > 0);
  }, [data]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Ładowanie terminarza...</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
        <p className="text-card-foreground font-semibold">Brak nadchodzących pozycji</p>
        <p className="text-sm text-muted-foreground mt-1">Wszystko pod kontrolą — żadne zadanie, przegląd ani serwis nie są planowane.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-secondary/30 px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              {g.key === "overdue" && <AlertTriangle className="h-4 w-4 text-red-400" />}
              {g.key !== "overdue" && <Clock className="h-4 w-4 text-muted-foreground" />}
              {g.label}
            </h3>
            <span className="text-xs text-muted-foreground">{g.items.length} {g.items.length === 1 ? "pozycja" : "pozycji"}</span>
          </div>
          <div className="divide-y divide-border">
            {g.items.map((it) => {
              const meta = CATEGORY_META[it.category];
              const Icon = meta.icon;
              const bucket = bucketOf(it.date);
              const row = (
                <div className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{it.title}</p>
                    {it.subtitle && <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-card-foreground">{formatDate(it.date)}</p>
                    <p className={cn("text-xs", bucket.tone)}>{bucket.label}</p>
                  </div>
                  <span className={cn("hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border", meta.tone)}>
                    {meta.label}
                  </span>
                </div>
              );
              return it.link
                ? <Link key={it.id} to={it.link} className="block">{row}</Link>
                : <div key={it.id}>{row}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
