import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useRealtimeNotifications, Notification } from "@/hooks/useRealtimeNotifications";
import { Bell, X, Check, Flame, Clock, Info } from "lucide-react";

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useRealtimeNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const typeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "critical": return <Flame className="h-3.5 w-3.5 text-critical" />;
      case "overdue": return <Clock className="h-3.5 w-3.5 text-warning" />;
      default: return <Info className="h-3.5 w-3.5 text-primary" />;
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-critical text-[9px] font-bold text-critical-foreground animate-pulse-fire">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h4 className="text-xs font-semibold text-card-foreground">Powiadomienia</h4>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                Oznacz wszystkie
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Brak powiadomień
              </p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer border-b border-border/50 transition-colors",
                    n.read ? "opacity-60" : "bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <div className="mt-0.5">{typeIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-card-foreground">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{n.message}</p>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      {n.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
