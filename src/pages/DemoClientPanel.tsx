import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, ShieldAlert, ShieldCheck, Flame, Building2, Calendar, FileDown,
  AlertTriangle, CheckCircle2, Clock, Phone, Plus, ChevronRight, Camera,
  Sparkles, Wrench, Award, Eye, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Publiczny panel demo dla klienta — bez logowania, z mock danymi.
 * Jaśniejszy, "konsumencki" styl. Odizolowany od reszty motywu (forced light).
 */

type Safety = "ok" | "warn" | "crit";

const buildings = [
  { id: "b1", name: "Galeria Atrium",     address: "ul. Marszałkowska 100, Warszawa",  safety: "ok"   as Safety, devices: 412, nextReview: "12.06.2026", note: "Wszystkie systemy sprawne" },
  { id: "b2", name: "Biurowiec Skyline",  address: "al. Jerozolimskie 200, Warszawa",  safety: "warn" as Safety, devices: 287, nextReview: "28.05.2026", note: "Przegląd hydrantów w tym tygodniu" },
  { id: "b3", name: "Hala produkcyjna F2", address: "ul. Fabryczna 8, Pruszków",       safety: "crit" as Safety, devices: 156, nextReview: "20.05.2026", note: "1 zgłoszenie krytyczne — czujka dymu" },
];

const initialTickets = [
  { id: "SLA-2026-05-0117", title: "Alarm fałszywy w garażu –1",         building: "Galeria Atrium",     status: "W realizacji", priority: "Wysoki",     created: "2 godz. temu",   sla: "Reakcja w 1h ✓" },
  { id: "SLA-2026-05-0112", title: "Uszkodzony hydrant 3p, sektor B",    building: "Biurowiec Skyline",  status: "Naprawiono",   priority: "Średni",     created: "wczoraj",         sla: "Zamknięte 18.05" },
  { id: "SLA-2026-05-0098", title: "Brak ciśnienia w instalacji tryskaczowej", building: "Hala produkcyjna F2", status: "Nowe",         priority: "Krytyczny",  created: "23 min temu",     sla: "Reakcja w 30 min" },
];

const schedule = [
  { date: "20.05.2026", label: "Wymiana czujki dymu (kryt.)",      building: "Hala produkcyjna F2", tag: "Pilne",       tone: "crit"  as Safety },
  { date: "23.05.2026", label: "Przegląd hydrantów wewn. (kwart.)", building: "Biurowiec Skyline",   tag: "Przegląd",    tone: "warn"  as Safety },
  { date: "28.05.2026", label: "Próbna ewakuacja Q2",                building: "Galeria Atrium",      tag: "Ewakuacja",   tone: "ok"    as Safety },
  { date: "12.06.2026", label: "Przegląd roczny gaśnic",            building: "Galeria Atrium",      tag: "Przegląd",    tone: "ok"    as Safety },
  { date: "30.06.2026", label: "Aktualizacja IBP",                   building: "Biurowiec Skyline",   tag: "Dokumentacja",tone: "warn"  as Safety },
];

const documents = [
  { id: "d1", title: "Instrukcja Bezpieczeństwa Pożarowego",       building: "Galeria Atrium",     type: "PDF", size: "2.4 MB", date: "10.01.2026", kind: "doc" },
  { id: "d2", title: "Certyfikat PPOŻ – rok 2026",                 building: "Galeria Atrium",     type: "PDF", size: "180 KB", date: "15.01.2026", kind: "cert" },
  { id: "d3", title: "Protokół przeglądu hydrantów Q1/2026",       building: "Biurowiec Skyline",  type: "PDF", size: "1.1 MB", date: "12.04.2026", kind: "doc" },
  { id: "d4", title: "Raport roczny PPOŻ 2025",                    building: "Hala produkcyjna F2", type: "PDF", size: "3.8 MB", date: "08.01.2026", kind: "doc" },
  { id: "d5", title: "Certyfikat szkolenia zespołu ewakuacyjnego", building: "Biurowiec Skyline",  type: "PDF", size: "240 KB", date: "22.03.2026", kind: "cert" },
];

const safetyMeta: Record<Safety, { label: string; icon: typeof Shield; pill: string; ring: string; dot: string; soft: string }> = {
  ok:   { label: "Bezpieczny",  icon: ShieldCheck, pill: "bg-emerald-100 text-emerald-700 border-emerald-200", ring: "ring-emerald-200", dot: "bg-emerald-500", soft: "bg-emerald-50" },
  warn: { label: "Ostrzeżenie", icon: Shield,      pill: "bg-amber-100 text-amber-800 border-amber-200",      ring: "ring-amber-200",   dot: "bg-amber-500",   soft: "bg-amber-50"   },
  crit: { label: "Krytyczny",   icon: ShieldAlert, pill: "bg-rose-100 text-rose-700 border-rose-200",         ring: "ring-rose-200",    dot: "bg-rose-500",    soft: "bg-rose-50"    },
};

export default function DemoClientPanel() {
  const [tickets, setTickets] = useState(initialTickets);
  const [reportOpen, setReportOpen] = useState(false);
  const [form, setForm] = useState({ building: buildings[0].name, title: "", description: "", priority: "Średni" });

  const summary = useMemo(() => ({
    total: buildings.length,
    ok:    buildings.filter(b => b.safety === "ok").length,
    warn:  buildings.filter(b => b.safety === "warn").length,
    crit:  buildings.filter(b => b.safety === "crit").length,
    devices: buildings.reduce((s, b) => s + b.devices, 0),
    openTickets: tickets.filter(t => t.status !== "Naprawiono").length,
  }), [tickets]);

  const submitReport = () => {
    if (!form.title.trim()) { toast.error("Podaj tytuł zgłoszenia"); return; }
    const id = `SLA-2026-05-${String(Math.floor(Math.random()*9000)+1000)}`;
    setTickets([{ id, title: form.title, building: form.building, status: "Nowe", priority: form.priority, created: "przed chwilą", sla: "Reakcja w 1h" }, ...tickets]);
    setReportOpen(false);
    setForm({ building: buildings[0].name, title: "", description: "", priority: "Średni" });
    toast.success("Zgłoszenie wysłane — serwisant otrzymał powiadomienie");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* DEMO banner */}
      <div className="bg-amber-500/95 text-amber-950 text-xs font-medium">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Tryb DEMO — wszystkie dane są przykładowe. Tak będzie wyglądał Twój panel po wdrożeniu.</span>
          </div>
          <Link to="/" className="inline-flex items-center gap-1 text-amber-950/80 hover:text-amber-950">
            <ArrowLeft className="h-3.5 w-3.5" /> Wróć do logowania
          </Link>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 shadow-sm">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Panel klienta</p>
              <h1 className="text-lg font-semibold tracking-tight">Fire Zone — Twoje obiekty PPOŻ</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Phone className="h-4 w-4" /> 800 123 456
            </Button>
            <Button size="sm" className="gap-2 bg-rose-600 hover:bg-rose-700" onClick={() => setReportOpen(true)}>
              <Plus className="h-4 w-4" /> Zgłoś usterkę
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {/* Hero summary */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard tone="ok"   label="Bezpieczne"   value={summary.ok}    sub={`z ${summary.total} obiektów`} />
          <SummaryCard tone="warn" label="Ostrzeżenia"  value={summary.warn}  sub="wymagają uwagi" />
          <SummaryCard tone="crit" label="Krytyczne"    value={summary.crit}  sub="działanie pilne" />
          <SummaryCard tone="ok"   label="Otwarte zgł." value={summary.openTickets} sub={`${summary.devices} urządzeń`} icon={Wrench} />
        </section>

        {/* Mobile CTA */}
        <Button size="lg" className="w-full gap-2 bg-rose-600 hover:bg-rose-700 sm:hidden" onClick={() => setReportOpen(true)}>
          <Plus className="h-5 w-5" /> Zgłoś usterkę
        </Button>

        {/* Obiekty */}
        <Section title="Twoje obiekty" subtitle="Status bezpieczeństwa pożarowego w czasie rzeczywistym" icon={Building2}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {buildings.map(b => {
              const m = safetyMeta[b.safety];
              const Icon = m.icon;
              return (
                <Card key={b.id} className={`overflow-hidden border-slate-200 bg-white p-0 shadow-sm transition hover:shadow-md`}>
                  <div className={`flex items-start justify-between gap-3 ${m.soft} px-5 py-4 border-b border-slate-200/70`}>
                    <div>
                      <h3 className="font-semibold text-slate-900">{b.name}</h3>
                      <p className="text-xs text-slate-500">{b.address}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${m.pill}`}>
                      <Icon className="h-3 w-3" /> {m.label}
                    </span>
                  </div>
                  <div className="space-y-3 px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                      {b.note}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Stat label="Urządzeń" value={b.devices.toString()} />
                      <Stat label="Najbliższy przegląd" value={b.nextReview} />
                    </div>
                    <Button variant="ghost" size="sm" className="w-full justify-between text-slate-700 hover:bg-slate-100">
                      Szczegóły obiektu <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>

        {/* Zgłoszenia */}
        <Section title="Moje zgłoszenia" subtitle="Aktualny status interwencji serwisowych" icon={AlertTriangle}>
          <Card className="divide-y divide-slate-200 border-slate-200 bg-white p-0 shadow-sm">
            {tickets.map(t => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-500">{t.id}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <p className="mt-1 truncate font-medium text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.building} • {t.created}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div className="text-xs">
                    <StatusPill status={t.status} />
                    <p className="mt-1 text-[11px] text-slate-500">{t.sla}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            ))}
          </Card>
        </Section>

        {/* Terminarz */}
        <Section title="Nadchodzące przeglądy" subtitle="Co zrobimy w Twoich obiektach w najbliższym czasie" icon={Calendar}>
          <Card className="border-slate-200 bg-white p-0 shadow-sm">
            <ol className="relative ml-4 border-l-2 border-slate-200 py-2">
              {schedule.map((s, i) => {
                const m = safetyMeta[s.tone];
                return (
                  <li key={i} className="relative py-3 pl-6 pr-5">
                    <span className={`absolute -left-[7px] top-5 h-3 w-3 rounded-full ring-4 ring-white ${m.dot}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono font-semibold text-slate-500">{s.date}</p>
                        <p className="font-medium text-slate-900">{s.label}</p>
                        <p className="text-xs text-slate-500">{s.building}</p>
                      </div>
                      <Badge variant="outline" className={`border ${m.pill}`}>{s.tag}</Badge>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </Section>

        {/* Dokumenty */}
        <Section title="Dokumenty i certyfikaty" subtitle="Pobierz protokoły, raporty i certyfikaty PPOŻ" icon={Award}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {documents.map(d => (
              <Card key={d.id} className="group flex items-center gap-4 border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${d.kind === "cert" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                  {d.kind === "cert" ? <Award className="h-5 w-5" /> : <FileDown className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{d.title}</p>
                  <p className="truncate text-xs text-slate-500">{d.building} • {d.type} • {d.size} • {d.date}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => toast.info("Tryb demo — pobieranie wyłączone")}
                >
                  <FileDown className="h-4 w-4" /> Pobierz
                </Button>
              </Card>
            ))}
          </div>
        </Section>

        <footer className="pt-6 pb-12 text-center text-xs text-slate-500">
          To podgląd demonstracyjny. <Link to="/" className="font-medium text-rose-600 hover:underline">Wróć do logowania</Link> aby uzyskać dostęp do prawdziwego panelu.
        </footer>
      </main>

      {/* Zgłoś usterkę dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" /> Zgłoś usterkę PPOŻ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Obiekt</label>
              <Select value={form.building} onValueChange={v => setForm({ ...form, building: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {buildings.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Priorytet</label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Krytyczny">Krytyczny — zagrożenie życia</SelectItem>
                  <SelectItem value="Wysoki">Wysoki — system PPOŻ niesprawny</SelectItem>
                  <SelectItem value="Średni">Średni — usterka pojedynczego urządzenia</SelectItem>
                  <SelectItem value="Niski">Niski — drobne zgłoszenie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Krótki tytuł</label>
              <Input placeholder="np. Czujka dymu pulsuje czerwoną diodą" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Opis</label>
              <Textarea rows={3} placeholder="Lokalizacja, okoliczności, kto zauważył..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button variant="outline" className="w-full gap-2 border-dashed text-slate-600">
              <Camera className="h-4 w-4" /> Dodaj zdjęcie (demo)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>Anuluj</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={submitReport}>Wyślij zgłoszenie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon: typeof Shield; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-rose-600" />
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ tone, label, value, sub, icon: Icon }: { tone: Safety; label: string; value: number | string; sub: string; icon?: typeof Shield }) {
  const m = safetyMeta[tone];
  const I = Icon ?? m.icon;
  return (
    <Card className={`border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          <p className="text-[11px] text-slate-500">{sub}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${m.soft} ${m.ring} ring-1`}>
          <I className={`h-4 w-4 ${tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-rose-600"}`} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === "Krytyczny" ? "bg-rose-100 text-rose-700 border-rose-200"
    : priority === "Wysoki" ? "bg-orange-100 text-orange-700 border-orange-200"
    : priority === "Średni" ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{priority}</span>;
}

function StatusPill({ status }: { status: string }) {
  const isDone = status === "Naprawiono";
  const isNew = status === "Nowe";
  const Icon = isDone ? CheckCircle2 : isNew ? AlertTriangle : Clock;
  const tone = isDone ? "bg-emerald-100 text-emerald-700"
    : isNew ? "bg-rose-100 text-rose-700"
    : "bg-sky-100 text-sky-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}
