import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, KanbanSquare, Building2, Briefcase, 
  Shield, Settings, Flame, ChevronLeft, ChevronRight,
  User, LogOut, Menu, X, ClipboardCheck, FileText, Users, UsersRound, Search, Command, BarChart2, CalendarDays, Factory
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { NotificationBell } from "@/components/NotificationBell";
import { useIsMobile } from "@/hooks/use-mobile";

const adminNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: KanbanSquare, label: "Kanban", path: "/kanban" },
  { icon: Building2, label: "Obiekty", path: "/buildings" },
  { icon: Briefcase, label: "Firmy", path: "/companies" },
  { icon: ClipboardCheck, label: "Audyty PPOŻ", path: "/audits" },
  { icon: FileText, label: "Protokoły", path: "/protocols" },
  { icon: Shield, label: "Certyfikaty", path: "/certificates" },
  { icon: Users, label: "Spotkania", path: "/meetings" },
  { icon: UsersRound, label: "Zespół", path: "/employees" },
  { icon: BarChart2, label: "Analityka", path: "/analytics" },
  { icon: CalendarDays, label: "Kalendarz", path: "/calendar" },
  { icon: Settings, label: "Ustawienia", path: "/settings" },
];

const clientNavItems = [
  { icon: LayoutDashboard, label: "Panel", path: "/" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { signOut, role } = useAuth();
  const isMobile = useIsMobile();
  
  const { unreadCount, markAllRead } = useRealtimeNotifications();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const navItems = role === "client" ? clientNavItems : adminNavItems;

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

      {/* Nav Items */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Link>
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
      </div>
    </div>
  );
}
