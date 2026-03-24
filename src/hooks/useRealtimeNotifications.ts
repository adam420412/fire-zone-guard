import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "critical" | "overdue" | "info";
  timestamp: Date;
  read: boolean;
  taskId?: string;
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { toast } = useToast();

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
      .subscribe();

    // Check overdue tasks periodically
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, deadline")
        .neq("status", "Zamknięte")
        .lt("deadline", new Date().toISOString())
        .order("deadline", { ascending: true })
        .limit(5);

      if (data && data.length > 0) {
        // Only notify once per session per task
        const notifiedIds = new Set(notifications.filter(n => n.type === "overdue").map(n => n.taskId));
        for (const t of data) {
          if (!notifiedIds.has(t.id)) {
            addNotification({
              type: "overdue",
              title: "⏰ Zadanie przeterminowane",
              message: `${t.title} – termin: ${new Date(t.deadline!).toLocaleDateString("pl-PL")}`,
              taskId: t.id,
            });
            break; // One at a time
          }
        }
      }
    }, 60000); // Check every minute

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [addNotification, notifications]);

  return { notifications, unreadCount, markRead, markAllRead };
}
