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

// =============================================================================
// Faza 5 — Master checklist urządzeń ppoż. + suggestion engine
// =============================================================================

// Klasy zagrożenia ludzi / przeznaczenia per rozporządzenie ws. ochrony ppoż.
// Wykorzystywane w device_requirement_rules jako klucz dopasowania.
export const BUILDING_CLASSES: { value: string; label: string }[] = [
  { value: "ZL I",   label: "ZL I — duża liczba ludzi (sale widowiskowe, dworce)" },
  { value: "ZL II",  label: "ZL II — osoby o ograniczonej zdolności (szpitale, żłobki)" },
  { value: "ZL III", label: "ZL III — biurowce, szkoły, uczelnie" },
  { value: "ZL IV",  label: "ZL IV — mieszkalne (bloki, hotele)" },
  { value: "ZL V",   label: "ZL V — archiwa, magazyny dóbr kultury" },
  { value: "PM",     label: "PM — produkcyjno-magazynowy" },
  { value: "IN",     label: "IN — inwentarski (rolnicze)" },
];

// Master checklist — 9 kategorii urządzeń ppoż. zgodnie z briefem (str. 2 PDF).
// Każdy wpis grupuje device_types w sensowne kategorie operacyjne i podaje
// kody używane w device_requirement_rules.required_device_type.
export interface DeviceCategory {
  code: string;
  shortLabel: string; // "G", "H", "SSP" itp.
  label: string;
  description: string;
  // Nazwy device_types które należą do tej kategorii (case-sensitive z seedu)
  deviceTypeNames: string[];
  // Kod(y) requirement_rule.required_device_type które dotyczą tej kategorii
  ruleCodes: string[];
}

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  {
    code: "G",
    shortLabel: "G",
    label: "Gaśnice",
    description: "Gaśnice proszkowe ABC, śniegowe CO₂, pianowe.",
    deviceTypeNames: ["Gaśnica proszkowa", "Gaśnica CO2"],
    ruleCodes: ["G_GP6", "G_CO2", "G"],
  },
  {
    code: "H",
    shortLabel: "H",
    label: "Hydranty",
    description: "Hydranty wewnętrzne DN25/DN52 i hydranty zewnętrzne.",
    deviceTypeNames: ["Hydrant wewnętrzny", "Hydrant zewnętrzny"],
    ruleCodes: ["H_DN25", "H_DN52", "H"],
  },
  {
    code: "SSP",
    shortLabel: "SSP",
    label: "System Sygnalizacji Pożarowej",
    description: "Centrala SAP, czujki dymu/temperatury, ROP.",
    deviceTypeNames: ["Centrala SAP", "Czujka dymu", "Czujka temperatury", "ROP (ręczny ostrzegacz)"],
    ruleCodes: ["SSP", "SAP"],
  },
  {
    code: "PWP",
    shortLabel: "PWP",
    label: "Przeciwpożarowy Wyłącznik Prądu",
    description: "PWP — odcięcie zasilania w razie pożaru.",
    deviceTypeNames: ["Przeciwpożarowy wyłącznik prądu"],
    ruleCodes: ["PWP"],
  },
  {
    code: "OS_AWAR",
    shortLabel: "OŚ. AWAR.",
    label: "Oświetlenie awaryjne / ewakuacyjne",
    description: "Oprawy oświetlenia awaryjnego, znaki ewakuacyjne.",
    deviceTypeNames: ["Oświetlenie awaryjne"],
    ruleCodes: ["OS_AWAR"],
  },
  {
    code: "DSO",
    shortLabel: "DSO",
    label: "Dźwiękowy System Ostrzegawczy",
    description: "DSO — komunikaty głosowe w razie pożaru.",
    deviceTypeNames: [],
    ruleCodes: ["DSO"],
  },
  {
    code: "DRZWI",
    shortLabel: "DRZWI",
    label: "Drzwi przeciwpożarowe",
    description: "Drzwi EI30/EI60, samozamykacze, uszczelki.",
    deviceTypeNames: ["Drzwi przeciwpożarowe"],
    ruleCodes: ["DRZWI"],
  },
  {
    code: "KLAPY",
    shortLabel: "KLAPY",
    label: "Klapy ppoż. / oddymiające",
    description: "Klapy odcinające, klapy oddymiające w kanałach wentylacyjnych.",
    deviceTypeNames: ["Klapa dymowa"],
    ruleCodes: ["KLAPY", "KLAPA"],
  },
  {
    code: "ODDYM",
    shortLabel: "ODDYM",
    label: "Instalacje oddymiania",
    description: "Wentylatory oddymiające, kanały, klapy w szachtach.",
    deviceTypeNames: ["Instalacja tryskaczowa"],
    ruleCodes: ["ODDYM", "TRYSKACZE"],
  },
];

// Lookup: device_type.name → kategoria
export const DEVICE_TYPE_TO_CATEGORY: Record<string, string> = DEVICE_CATEGORIES.reduce(
  (acc, cat) => {
    cat.deviceTypeNames.forEach((n) => {
      acc[n] = cat.code;
    });
    return acc;
  },
  {} as Record<string, string>
);

// Lookup: requirement_rule.required_device_type code → kategoria
export const RULE_CODE_TO_CATEGORY: Record<string, string> = DEVICE_CATEGORIES.reduce(
  (acc, cat) => {
    cat.ruleCodes.forEach((c) => {
      acc[c] = cat.code;
    });
    return acc;
  },
  {} as Record<string, string>
);

// Helper: oblicz proponowaną liczbę urządzeń z formuły reguły
// Obsługa najczęstszych wzorów: "1 / 100 m²", "1 / 1000 m²", "cały budynek".
export function suggestQuantityFromFormula(formula: string | null, area: number | null): number | null {
  if (!formula) return null;
  if (!area || area <= 0) return null;
  // "cały budynek"
  if (/cał[ya] budynek/i.test(formula)) return 1;
  // pattern "1 ... / 100 m²" lub "1 ... / 200 m² PF" lub "1 ... / 200m³"
  const m = formula.match(/(\d+)\s*[^/]*\/\s*(\d+)\s*m[²³]/i);
  if (m) {
    const each = Number(m[1]);
    const per = Number(m[2]);
    if (per > 0) return Math.max(1, Math.ceil((area * each) / per));
  }
  return null;
}
