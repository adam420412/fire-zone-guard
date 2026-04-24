import { Shield, AlertTriangle, Flame, CheckCircle } from "lucide-react";

export type TaskStatus = "Nowe" | "Zaplanowane" | "W trakcie" | "Oczekuje" | "Do weryfikacji" | "Zamknięte";
export type TaskPriority = "niski" | "średni" | "wysoki" | "krytyczny";
export type TaskType = "usterka" | "przegląd" | "szkolenie" | "ewakuacja" | "konsultacja" | "przebudowa" | "audyt" | "porada";
export type SafetyStatus = "bezpieczny" | "ostrzeżenie" | "krytyczny";

export const kanbanStatuses: TaskStatus[] = ["Nowe", "Zaplanowane", "W trakcie", "Oczekuje", "Do weryfikacji", "Zamknięte"];

export const taskTypeLabels: Record<TaskType, string> = {
  usterka: "Usterka",
  przegląd: "Przegląd",
  szkolenie: "Szkolenie",
  ewakuacja: "Ewakuacja",
  konsultacja: "Konsultacja",
  przebudowa: "Przebudowa",
  audyt: "Audyt",
  porada: "Porada prawna",
};

export const priorityColors: Record<TaskPriority, string> = {
  niski: "bg-muted text-muted-foreground",
  średni: "bg-primary/20 text-primary",
  wysoki: "bg-warning/20 text-warning",
  krytyczny: "bg-critical/20 text-critical",
};

export const statusColors: Record<TaskStatus, string> = {
  "Nowe": "bg-primary/20 text-primary",
  "Zaplanowane": "bg-blue-500/20 text-blue-400",
  "W trakcie": "bg-warning/20 text-warning",
  "Oczekuje": "bg-muted text-muted-foreground",
  "Do weryfikacji": "bg-purple-500/20 text-purple-400",
  "Zamknięte": "bg-success/20 text-success",
};

export const safetyStatusConfig: Record<SafetyStatus, { label: string; color: string; icon: typeof Shield }> = {
  bezpieczny: { label: "Bezpieczny", color: "text-success", icon: CheckCircle },
  ostrzeżenie: { label: "Ostrzeżenie", color: "text-warning", icon: AlertTriangle },
  krytyczny: { label: "Krytyczny", color: "text-critical", icon: Flame },
};

export const taskTypes: { value: TaskType; label: string }[] = [
  { value: "usterka", label: "Usterka" },
  { value: "przegląd", label: "Przegląd" },
  { value: "szkolenie", label: "Szkolenie" },
  { value: "ewakuacja", label: "Ewakuacja" },
  { value: "konsultacja", label: "Konsultacja" },
  { value: "przebudowa", label: "Przebudowa" },
  { value: "audyt", label: "Audyt" },
  { value: "porada", label: "Porada prawna" },
];

export const priorities: { value: TaskPriority; label: string }[] = [
  { value: "niski", label: "Niski" },
  { value: "średni", label: "Średni" },
  { value: "wysoki", label: "Wysoki" },
  { value: "krytyczny", label: "Krytyczny" },
];

// Centralna numeracja serwisanta — używana w panelu klienta (mobile-first CTA)
// jako "Zadzwoń do serwisanta" + ewentualne kanały IM. Zmienić na produkcji.
export const SUPPORT_PHONE = "+48 600 000 000";
export const SUPPORT_PHONE_TEL = "tel:+48600000000";
export const SUPPORT_EMERGENCY_PHONE = "+48 998";
export const SUPPORT_EMERGENCY_TEL = "tel:998";
