import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "critical" | "overdue" | "info" | "warning";
  timestamp: Date;
  read: boolean;
  taskId?: string;
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { toast } = useToast();

  const qc = useQueryClient();

  // Basic notification utilities (omitted from display but unchanged)
  const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false,
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 50));
    toast({
      title: n.title,
      description: n.message,
      variant: n.type === "critical" ? "destructive" : "default",
    });
  }, [toast]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          const task = payload.new as any;
          if (task.priority === "krytyczny") {
            addNotification({
              type: "critical",
              title: "🔴 Nowe zadanie krytyczne!",
              message: `${task.title}`,
              taskId: task.id,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          const task = payload.new as any;
          const old = payload.old as any;

          if (task.priority === "krytyczny" && old.priority !== "krytyczny") {
            addNotification({
              type: "critical",
              title: "⚠️ Zadanie eskalowane do krytycznego!",
              message: `${task.title}`,
              taskId: task.id,
            });
          }

          if (task.status === "Zamknięte" && old.status !== "Zamknięte") {
            addNotification({
              type: "info",
              title: "✅ Zadanie zamknięte",
              message: `${task.title}`,
              taskId: task.id,
            });
          }
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "service_protocols" }, () => {
        qc.invalidateQueries({ queryKey: ["service_protocols"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audits" }, () => {
        qc.invalidateQueries({ queryKey: ["audits"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_development_plans" }, () => {
        qc.invalidateQueries({ queryKey: ["employee_development_plans"] });
      })
      .subscribe();

    // Check overdue items periodically - wrapped in try/catch so missing V2 tables don't crash the app
    const interval = setInterval(async () => {
      const today = new Date().toISOString();
      const notifiedIds = new Set(notifications.filter(n => n.type === "overdue").map(n => n.taskId));
      const newNotifications: Array<Omit<Notification, "id" | "timestamp" | "read">> = [];

      try {
        // 1. Tasks (core table - should always exist)
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, deadline")
          .neq("status", "Zamknięte")
          .lt("deadline", today)
          .order("deadline", { ascending: true })
          .limit(3);

        tasks?.forEach(t => {
          if (!notifiedIds.has(t.id)) {
            newNotifications.push({
              type: "overdue",
              title: "⏰ Zadanie przeterminowane",
              message: `${t.title} – termin: ${new Date(t.deadline!).toLocaleDateString("pl-PL")}`,
              taskId: t.id,
            });
          }
        });
      } catch { /* ignore */ }

      try {
        // 2. Protocols (V2 table - may not exist if migration not run)
        const { data: protocols, error: pErr } = await supabase
          .from("service_protocols")
          .select("id, type, building_id, next_inspection_due")
          .lt("next_inspection_due", today)
          .limit(3);

        if (!pErr) {
          protocols?.forEach(p => {
            if (!notifiedIds.has(p.id)) {
              newNotifications.push({
                type: "overdue",
                title: "⏰ Wymagany Przegląd",
                message: `${p.type} – upłynął termin kolejnego przeglądu.`,
                taskId: p.id,
              });
            }
          });
        }
      } catch { /* table may not exist yet */ }

      try {
        // 3. Audits (V2 table - may not exist if migration not run)
        const { data: audits, error: aErr } = await supabase
          .from("audits")
          .select("id, building_id, performed_at")
          .in("status", ["zaplanowany", "w przygotowaniu"])
          .lt("performed_at", today)
          .limit(3);

        if (!aErr) {
          audits?.forEach(a => {
            if (!notifiedIds.has(a.id)) {
              newNotifications.push({
                type: "overdue",
                title: "⏰ Opóźniony Audyt",
                message: `Zaplanowany audyt nie został jeszcze zakończony.`,
                taskId: a.id,
              });
            }
          });
        }
      } catch { /* table may not exist yet */ }

      try {
        // 4. Employees (V2 table - limit to 30 days ahead)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const limitDateStr = thirtyDaysFromNow.toISOString().split("T")[0];
        const todayDateStr = new Date().toISOString().split("T")[0];

        const { data: employees, error: eErr } = await supabase
          .from("employee_development_plans")
          .select("id, user_id, health_exam_valid_until, profiles!employee_development_plans_user_id_fkey(name)")
          .not("health_exam_valid_until", "is", null)
          .lte("health_exam_valid_until", limitDateStr)
          .limit(5);

        if (!eErr) {
          employees?.forEach((e: any) => {
            if (!notifiedIds.has(e.id)) {
              const name = e.profiles?.name || 'Pracownik';
              const isExpired = e.health_exam_valid_until < todayDateStr;
              newNotifications.push({
                type: isExpired ? "critical" : "warning",
                title: isExpired ? "🔴 Wygasłe Badania / SEP" : "⚠️ Wygasające Uprawnienia",
                message: isExpired ? `${name} – upłynął termin badań/szkoleń!` : `${name} – badania/szkolenia wygasają w ciągu 30 dni (${e.health_exam_valid_until}).`,
                taskId: e.id,
              });
            }
          });
        }
      } catch { /* table may not exist yet */ }

      if (newNotifications.length > 0) {
        addNotification(newNotifications[0]);
      }
    }, 300000); // Check every 5 minutes (was 1 min - too aggressive)

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [addNotification, notifications]);

  return { notifications, unreadCount, markRead, markAllRead };
}
