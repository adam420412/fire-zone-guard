import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  X, Building2, Briefcase, MapPin, ClipboardList, ShieldCheck, AlertTriangle,
  Wrench, Plus, CalendarPlus, Map as MapIcon, Phone, Mail, Activity, Siren, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useContextPanel } from "@/hooks/useContextPanel";
import { useBuildings, useCompaniesWithStats, useTasks, useAudits } from "@/hooks/useSupabaseData";
import { useBuildingDevices } from "@/hooks/useBuildingData";
import { useSlaTickets } from "@/hooks/useSlaTickets";
import { safetyStatusConfig, type SafetyStatus } from "@/lib/constants";

const OPEN_TASK_STATUSES = new Set(["Nowe", "W trakcie", "W realizacji", "Oczekuje"]);
const OPEN_SLA_STATUSES = new Set(["nowe", "przyjete", "w_realizacji", "przyjęte"]);

function PanelHeader({ icon: Icon, title, subtitle, onClose }: {
  icon: any; title: string; subtitle?: string; onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg fire-gradient">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground line-clamp-2">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground line-clamp-2">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        aria-label="Zamknij panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function BuildingContent({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: buildings } = useBuildings();
  const { data: tasks } = useTasks();
  const { data: audits } = useAudits();
  const { data: devices } = useBuildingDevices(buildingId);

  const building: any = buildings?.find((b: any) => b.id === buildingId);
  const buildingTasks = useMemo(
    () => (tasks ?? []).filter((t: any) => t.building_id === buildingId),
    [tasks, buildingId]
  );
  const openTasks = buildingTasks.filter((t: any) => OPEN_TASK_STATUSES.has(t.status));
  const lastAudit = (audits ?? []).find((a: any) => a.building_id === buildingId);
  const overdueDevices = (devices ?? []).filter((d: any) => {
    if (!d.next_service_date) return false;
    return new Date(d.next_service_date) < new Date();
  });

  if (!building) {
    return <div className="p-6 text-sm text-muted-foreground">Ładowanie obiektu…</div>;
  }

  const status = ((building.safetyStatus in safetyStatusConfig) ? building.safetyStatus : "bezpieczny") as SafetyStatus;
  const statusConf = safetyStatusConfig[status];

  return (
    <>
      <PanelHeader
        icon={Building2}
        title={building.name}
        subtitle={building.companyName}
        onClose={onClose}
      />
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {/* Status + adres */}
          <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Status bezpieczeństwa</span>
              <Badge className={cn("text-[10px]", statusConf.color)} variant="outline">
                {statusConf.label}
              </Badge>
            </div>
            {building.address && (
              <div className="flex items-start gap-2 text-xs text-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <span>{building.address}</span>
              </div>
            )}
          </div>

          {/* Otwarte zlecenia */}
          <Section
            title={`Otwarte zlecenia (${openTasks.length})`}
            action={openTasks.length > 0 && (
              <Link to="/kanban" className="text-[11px] text-primary hover:underline">Zobacz →</Link>
            )}
          >
            {openTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak otwartych zleceń.</p>
            ) : (
              <div className="space-y-1.5">
                {openTasks.slice(0, 3).map((t: any) => (
                  <Link
                    key={t.id}
                    to="/kanban"
                    className="block rounded-md border border-border bg-card p-2 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium text-card-foreground line-clamp-1">{t.title}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.status}</p>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Ostatni audyt */}
          <Section title="Ostatni audyt">
            {lastAudit ? (
              <Link
                to="/audits"
                className="block rounded-md border border-border bg-card p-2.5 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="text-xs font-medium text-card-foreground line-clamp-1">
                      {lastAudit.type || lastAudit.audit_type || "Audyt"}
                    </span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {lastAudit.created_at ? new Date(lastAudit.created_at).toLocaleDateString("pl-PL") : "—"}
                  {lastAudit.status && ` • ${lastAudit.status}`}
                </p>
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Brak audytów dla tego obiektu.</p>
            )}
          </Section>

          {/* Urządzenia po terminie */}
          <Section title={`Urządzenia po terminie przeglądu (${overdueDevices.length})`}>
            {overdueDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Wszystkie urządzenia są na bieżąco.</p>
            ) : (
              <div className="space-y-1.5">
                {overdueDevices.slice(0, 4).map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-md border border-critical/30 bg-critical/5 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-critical" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium line-clamp-1">{d.name || d.device_types?.name}</p>
                      <p className="text-[10px] text-critical">
                        Termin: {new Date(d.next_service_date).toLocaleDateString("pl-PL")}
                      </p>
                    </div>
                  </div>
                ))}
                {overdueDevices.length > 4 && (
                  <Link
                    to={`/buildings/${buildingId}`}
                    className="block text-[11px] text-primary hover:underline pt-1"
                  >
                    + {overdueDevices.length - 4} więcej…
                  </Link>
                )}
              </div>
            )}
          </Section>
        </div>
      </ScrollArea>

      {/* Akcje */}
      <div className="border-t border-border p-3 grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" className="text-xs" onClick={() => { navigate(`/kanban?building=${buildingId}`); onClose(); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Zlecenie
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => { navigate(`/audits?building=${buildingId}`); onClose(); }}>
          <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Audyt
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => { navigate(`/map?building=${buildingId}`); onClose(); }}>
          <MapIcon className="h-3.5 w-3.5 mr-1" /> Mapa
        </Button>
      </div>
    </>
  );
}

function CompanyContent({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const { data: companies } = useCompaniesWithStats();
  const { data: buildings } = useBuildings();
  const { data: tickets } = useSlaTickets();
  const { data: tasks } = useTasks();

  const company: any = companies?.find((c: any) => c.id === companyId);
  const companyBuildings = (buildings ?? []).filter((b: any) => b.company_id === companyId);
  const buildingIds = new Set(companyBuildings.map((b: any) => b.id));
  const openSla = (tickets ?? []).filter((t: any) =>
    t.building_id && buildingIds.has(t.building_id) && OPEN_SLA_STATUSES.has(String(t.status).toLowerCase())
  );
  const companyTasks = (tasks ?? []).filter((t: any) => t.company_id === companyId);
  const lastActivity = companyTasks[0]?.updated_at || companyTasks[0]?.created_at;

  if (!company) {
    return <div className="p-6 text-sm text-muted-foreground">Ładowanie firmy…</div>;
  }

  return (
    <>
      <PanelHeader
        icon={Briefcase}
        title={company.name}
        subtitle={company.nip ? `NIP: ${company.nip}` : undefined}
        onClose={onClose}
      />
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {(company.address || company.phone || company.email) && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1.5">
              {company.address && (
                <div className="flex items-start gap-2 text-xs">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                  <span>{company.address}</span>
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{company.phone}</span>
                </div>
              )}
              {company.email && (
                <div className="flex items-center gap-2 text-xs">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{company.email}</span>
                </div>
              )}
            </div>
          )}

          <Section title={`Powiązane budynki (${companyBuildings.length})`}>
            {companyBuildings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak budynków.</p>
            ) : (
              <div className="space-y-1.5">
                {companyBuildings.slice(0, 6).map((b: any) => (
                  <Link
                    key={b.id}
                    to={`/buildings/${b.id}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-card p-2 hover:bg-secondary/50 transition-colors"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium line-clamp-1 flex-1">{b.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                ))}
                {companyBuildings.length > 6 && (
                  <p className="text-[11px] text-muted-foreground pl-1">+ {companyBuildings.length - 6} więcej</p>
                )}
              </div>
            )}
          </Section>

          <Section
            title={`Otwarte SLA (${openSla.length})`}
            action={openSla.length > 0 && <Link to="/sla" className="text-[11px] text-primary hover:underline">Zobacz →</Link>}
          >
            {openSla.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak aktywnych zgłoszeń SLA.</p>
            ) : (
              <div className="space-y-1.5">
                {openSla.slice(0, 3).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
                    <Siren className="h-3.5 w-3.5 shrink-0 text-critical" />
                    <span className="text-xs line-clamp-1 flex-1">{t.title || t.description || "Zgłoszenie"}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Ostatnia aktywność">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {lastActivity
                  ? new Date(lastActivity).toLocaleString("pl-PL")
                  : "Brak aktywności"}
              </span>
            </div>
          </Section>
        </div>
      </ScrollArea>
    </>
  );
}

function TaskContent({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data: tasks } = useTasks();
  const task: any = tasks?.find((t: any) => t.id === taskId);

  if (!task) return <div className="p-6 text-sm text-muted-foreground">Ładowanie zlecenia…</div>;

  return (
    <>
      <PanelHeader
        icon={ClipboardList}
        title={task.title}
        subtitle={task.buildings?.name || task.companies?.name}
        onClose={onClose}
      />
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
          </div>
          {task.description && (
            <Section title="Opis">
              <p className="text-xs text-foreground whitespace-pre-wrap">{task.description}</p>
            </Section>
          )}
          <Link to="/kanban" className="block text-xs text-primary hover:underline">Otwórz na tablicy Kanban →</Link>
        </div>
      </ScrollArea>
    </>
  );
}

export default function ContextPanel() {
  const { isOpen, entityType, entityId, closePanel } = useContextPanel();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // ignore clicks on triggers inside main app — only close if click outside panel
        closePanel();
      }
    };
    // Defer to avoid catching the click that opened the panel
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen, closePanel]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePanel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closePanel]);

  return (
    <aside
      ref={panelRef}
      className={cn(
        "fixed right-0 top-0 z-40 flex h-screen w-[360px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!isOpen}
    >
      {isOpen && entityType === "building" && entityId && (
        <BuildingContent buildingId={entityId} onClose={closePanel} />
      )}
      {isOpen && entityType === "company" && entityId && (
        <CompanyContent companyId={entityId} onClose={closePanel} />
      )}
      {isOpen && entityType === "task" && entityId && (
        <TaskContent taskId={entityId} onClose={closePanel} />
      )}
    </aside>
  );
}
