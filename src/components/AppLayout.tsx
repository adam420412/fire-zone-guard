import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, KanbanSquare, Building2, Briefcase,
  Shield, Settings, Flame, ChevronLeft, ChevronRight,
  User, LogOut, Menu, X, ClipboardCheck, FileText, Users, UsersRound, Search, Command, BarChart2, CalendarDays, Factory, Contact, DollarSign,
  Siren, Wrench, CalendarClock, BookOpen, BarChart3, History, Gauge, ListChecks,
  Map, Sliders, Activity, ChevronDown, Receipt, CreditCard, Scale, HardHat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { NotificationBell } from "@/components/NotificationBell";
import QuickOpportunityFAB from "@/components/QuickOpportunityFAB";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavBadges } from "@/hooks/useNavBadges";
import AiBotPanel from "@/components/AiBotPanel";
import ContextPanel from "@/components/ContextPanel";
import { useContextPanel } from "@/hooks/useContextPanel";

type NavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  children?: NavItem[];
  badgeKey?: "kanban" | "repairs" | "sla" | "audits" | "finance" | "officeTasks";
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const adminNavGroups: NavGroup[] = [
  {
    label: "Pulpit",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: KanbanSquare, label: "Kanban", path: "/kanban", badgeKey: "kanban" },
      { icon: CalendarDays, label: "Kalendarz", path: "/calendar" },
      { icon: CalendarClock, label: "Terminarz", path: "/office-tasks", badgeKey: "officeTasks" },
    ],
  },
  {
    label: "Operacje serwisowe",
    items: [
      { icon: Siren, label: "SLA — Zgłoszenia", path: "/sla", badgeKey: "sla" },
      { icon: Gauge, label: "KPI SLA", path: "/sla-kpi" },
      { icon: History, label: "Audyt SLA", path: "/sla-audit" },
      { icon: Wrench, label: "Naprawy", path: "/repairs", badgeKey: "repairs" },
      { icon: ClipboardCheck, label: "Audyty PPOŻ", path: "/audits", badgeKey: "audits" },
      { icon: ListChecks, label: "Checklisty", path: "/checklists" },
    ],
  },
  {
    label: "Klienci i obiekty",
    items: [
      { icon: Building2, label: "Obiekty", path: "/buildings" },
      { icon: Map, label: "Mapa obiektów", path: "/map" },
      { icon: Briefcase, label: "Firmy", path: "/companies" },
      { icon: Factory, label: "Producenci", path: "/manufacturers" },
    ],
  },
  {
    label: "Sprzedaż i finanse",
    items: [
      { icon: Contact, label: "CRM", path: "/crm" },
      { icon: DollarSign, label: "Finanse", path: "/finance", children: [
        { icon: Receipt, label: "Faktury", path: "/finance/invoices" },
        { icon: CreditCard, label: "Płatności", path: "/finance/payments" },
        { icon: Scale, label: "Rozliczenia", path: "/finance/settlements" },
      ] },
    ],
  },
  {
    label: "Dokumentacja",
    items: [
      { icon: FileText, label: "Protokoły", path: "/protocols" },
      { icon: Shield, label: "Certyfikaty", path: "/certificates" },
      { icon: BookOpen, label: "Biblioteka", path: "/library" },
      { icon: BarChart3, label: "Raporty", path: "/reports" },
    ],
  },
  {
    label: "Zespół",
    items: [
      { icon: UsersRound, label: "Pracownicy", path: "/employees" },
      { icon: Users, label: "Spotkania", path: "/meetings" },
    ],
  },
  {
    label: "System",
    items: [
      { icon: BarChart2, label: "Analityka", path: "/analytics" },
      { icon: Activity, label: "Audyt Systemu", path: "/system-audit" },
      { icon: Settings, label: "Ustawienia", path: "/settings" },
    ],
  },
];

const superAdminGroup: NavGroup = {
  label: "Super Admin",
  items: [{ icon: Sliders, label: "Panel admina", path: "/admin" }],
};

const clientNavGroups: NavGroup[] = [
  {
    label: "Mój panel",
    items: [
      { icon: LayoutDashboard, label: "Panel", path: "/" },
      { icon: Siren, label: "Moje zgłoszenia", path: "/sla" },
      { icon: BookOpen, label: "Biblioteka", path: "/library" },
    ],
  },
];

const servicemanNavGroups: NavGroup[] = [
  {
    label: "Moje zlecenia",
    items: [
      { icon: HardHat, label: "Mój panel", path: "/" },
      { icon: KanbanSquare, label: "Zlecenia", path: "/kanban", badgeKey: "kanban" },
      { icon: Map, label: "Mapa", path: "/map" },
      { icon: ListChecks, label: "Checklisty", path: "/checklists" },
    ],
  },
  {
    label: "Dokumentacja",
    items: [
      { icon: FileText, label: "Protokoły", path: "/protocols" },
      { icon: Shield, label: "Moje certyfikaty", path: "/certificates" },
    ],
  },
];

const coordinatorNavGroups: NavGroup[] = [
  {
    label: "Pulpit",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: KanbanSquare, label: "Kanban", path: "/kanban", badgeKey: "kanban" },
      { icon: Map, label: "Mapa obiektów", path: "/map" },
      { icon: CalendarDays, label: "Kalendarz", path: "/calendar" },
    ],
  },
  {
    label: "Operacje",
    items: [
      { icon: Siren, label: "SLA — Zgłoszenia", path: "/sla", badgeKey: "sla" },
      { icon: Wrench, label: "Naprawy", path: "/repairs", badgeKey: "repairs" },
      { icon: ClipboardCheck, label: "Audyty PPOŻ", path: "/audits", badgeKey: "audits" },
      { icon: ListChecks, label: "Checklisty", path: "/checklists" },
      { icon: Users, label: "Spotkania", path: "/meetings" },
    ],
  },
  {
    label: "Klienci i obiekty",
    items: [
      { icon: Building2, label: "Obiekty", path: "/buildings" },
      { icon: Briefcase, label: "Firmy", path: "/companies" },
      { icon: Contact, label: "CRM", path: "/crm" },
    ],
  },
  {
    label: "Dokumentacja",
    items: [
      { icon: FileText, label: "Protokoły", path: "/protocols" },
      { icon: BookOpen, label: "Biblioteka", path: "/library" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { signOut, role } = useAuth();
  const isMobile = useIsMobile();
  
  const { unreadCount, markAllRead } = useRealtimeNotifications();
  const { data: badges } = useNavBadges();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const navGroups: NavGroup[] =
    role === "client"
      ? clientNavGroups
      : role === "serviceman"
        ? servicemanNavGroups
        : role === "koordynator"
          ? coordinatorNavGroups
          : role === "super_admin"
            ? [...adminNavGroups, superAdminGroup]
            : adminNavGroups;

  const isGroupActive = (g: NavGroup) =>
    g.items.some((it) =>
      location.pathname === it.path ||
      it.children?.some((c) => location.pathname === c.path)
    );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (label: string) =>
    setOpenGroups((p) => ({ ...p, [label]: !(p[label] ?? isGroupActive(navGroups.find(g => g.label === label)!)) }));

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg fire-gradient">
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          {(!collapsed || isMobile) && (
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">Fire Zone</h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Operator PPOŻ</p>
            </div>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 scrollbar-thin">
        {navGroups.map((group) => {
          const groupActive = isGroupActive(group);
          const expanded = collapsed && !isMobile
            ? true
            : (openGroups[group.label] ?? groupActive);
          const showLabel = !collapsed || isMobile;
          return (
            <div key={group.label} className="space-y-1">
              {showLabel && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded ? "rotate-0" : "-rotate-90")} />
                </button>
              )}
              {expanded && group.items.map((item) => {
                const isActive = location.pathname === item.path;
                const childActive = item.children?.some((child) => location.pathname === child.path);
                const showChildren = item.children && (isActive || childActive) && (!collapsed || isMobile);
                return (
                  <div key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {(!collapsed || isMobile) && <span className="flex-1">{item.label}</span>}
                      {/* Live badge count */}
                      {item.badgeKey && badges && (badges[item.badgeKey] ?? 0) > 0 && (
                        <span className={cn(
                          "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                          (badges[item.badgeKey] ?? 0) > 0 && item.badgeKey === "sla"
                            ? "bg-red-500 text-white"
                            : "bg-primary/20 text-primary",
                        )}>
                          {(badges[item.badgeKey] ?? 0) > 99 ? "99+" : badges[item.badgeKey]}
                        </span>
                      )}
                      {item.children && (!collapsed || isMobile) && (
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showChildren ? "rotate-0" : "-rotate-90")} />
                      )}
                    </Link>
                    {showChildren && (
                      <div className="ml-5 mt-1 space-y-1 border-l border-sidebar-border pl-2">
                        {item.children!.map((child) => {
                          const cActive = location.pathname === child.path;
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                                cActive
                                  ? "bg-primary/15 text-primary"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )}
                            >
                              <child.icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>


      {/* Collapse Toggle (desktop only) */}
      {!isMobile && (
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-md py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>
      ) : (
        <aside
          className={cn(
            "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
            collapsed ? "w-16" : "w-60"
          )}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="hidden md:flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5 focus-within:border-primary/50 transition-colors w-72">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Szukaj..." 
                className="bg-transparent text-xs outline-none w-full text-foreground placeholder:text-muted-foreground"
              />
              <div className="flex items-center gap-1 rounded bg-secondary px-1 py-0.5 border border-border">
                <Command className="h-2 w-2 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground font-medium">K</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full fire-gradient">
                <User className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium text-secondary-foreground">{role ?? "user"}</span>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Wyloguj"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {children}
        </main>

        {/* Quick Sales Opportunity FAB — visible to admin/super_admin */}
        {(role === "admin" || role === "super_admin") && <QuickOpportunityFAB />}

        {/* AI Bot Panel — visible to all internal roles (not client) */}
        {role !== "client" && <AiBotPanel />}
      </div>
    </div>
  );
}
