import { supabase } from "@/integrations/supabase/client";

interface TelegramNotifyPayload {
  type: "status_change" | "deadline_warning" | "overdue" | "subtask_assigned";
  task_id?: string;
  subtask_id?: string;
  task_title: string;
  old_status?: string;
  new_status?: string;
  deadline?: string;
  days_left?: number;
  assignee_name?: string;
  creator_name?: string;
  recipient_profile_ids: string[];
}

export async function sendTelegramNotification(payload: TelegramNotifyPayload) {
  try {
    const { data, error } = await supabase.functions.invoke("telegram-notify", {
      body: payload,
    });
    if (error) console.error("Telegram notify error:", error);
    return data;
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }
}
