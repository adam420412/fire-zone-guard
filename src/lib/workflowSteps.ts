// Definicje faz, kroków i diagramów dla Centrum Workflow (/workflow)
import type { LucideIcon } from "lucide-react";
import {
  Building2, MapPin, Wrench, Users, ListChecks, ClipboardCheck,
  FileText, Bot, Sparkles, QrCode, Calendar, Siren, Shield,
  Hammer, GraduationCap, BookOpen, Briefcase, Contact,
} from "lucide-react";

export type RoleFilter = "admin" | "serviceman" | "client";

export interface Phase {
  id: string;
  title: string;
  goal: string;
  icon: LucideIcon;
  tasks: { label: string; path?: string }[];
  /** Klucz w `WorkflowCounts` decydujący o "% uzupełnienia". */
  countKey?: keyof WorkflowCounts;
  /** Próg liczbowy uznawany za "zrobione" (default 1). */
  threshold?: number;
  /** Faza wymaga ukończenia poprzednich (logika strzałek). */
  requires?: string[];
}

export interface WorkflowCounts {
  companies: number;
  buildings: number;
  contacts: number;
  documents: number;
  devices: number;
  floorPlans: number;
  employees: number;
  trainings: number;
  tasks: number;
  slaTickets: number;
  audits: number;
  protocols: number;
  reports: number;
  aiActions: number;
}

export const PHASES: Phase[] = [
  {
    id: "setup",
    title: "1. Setup firmy",
    goal: "Załóż konto firmy i opisz jej obiekty — to fundament całego systemu.",
    icon: Briefcase,
    countKey: "companies",
    tasks: [
      { label: "Dodaj firmę (lookup po NIP)", path: "/companies" },
      { label: "Dodaj kontakty firmowe", path: "/companies" },
      { label: "Utwórz obiekt (budynek)", path: "/buildings" },
      { label: "Wgraj dokumenty obiektu", path: "/buildings" },
    ],
  },
  {
    id: "inventory",
    title: "2. Inwentaryzacja",
    goal: "Spisz urządzenia ppoż., podepnij plany pięter i wygeneruj kody QR.",
    icon: Wrench,
    countKey: "devices",
    requires: ["setup"],
    tasks: [
      { label: "Dodaj urządzenia (ręcznie lub import)", path: "/admin/import" },
      { label: "Wgraj plan piętra i rozstaw piny", path: "/buildings" },
      { label: "Wygeneruj kody QR dla urządzeń", path: "/buildings" },
      { label: "Zarejestruj producentów / dostawców", path: "/manufacturers" },
    ],
  },
  {
    id: "team",
    title: "3. Zespół",
    goal: "Dodaj pracowników, przypisz role, zaplanuj szkolenia i badania.",
    icon: Users,
    countKey: "employees",
    requires: ["setup"],
    tasks: [
      { label: "Dodaj pracowników i role", path: "/employees" },
      { label: "Utwórz plany rozwoju", path: "/employees" },
      { label: "Zaplanuj szkolenia / badania medyczne", path: "/employees" },
      { label: "Zaproś klienta do panelu", path: "/admin" },
    ],
  },
  {
    id: "ops",
    title: "4. Praca operacyjna",
    goal: "Codzienne zlecenia: Kanban, zgłoszenia SLA, kalendarz wizyt.",
    icon: ListChecks,
    countKey: "tasks",
    threshold: 3,
    requires: ["inventory", "team"],
    tasks: [
      { label: "Utwórz zadanie z szablonu", path: "/kanban" },
      { label: "Obsłuż zgłoszenie SLA klienta", path: "/sla" },
      { label: "Zaplanuj wizyty w kalendarzu", path: "/calendar" },
      { label: "Szybka naprawa (ikona młotka)", path: "/repairs" },
    ],
  },
  {
    id: "audits",
    title: "5. Audyty i protokoły",
    goal: "Audyty cykliczne, checklisty, protokoły pokontrolne.",
    icon: ClipboardCheck,
    countKey: "audits",
    requires: ["inventory"],
    tasks: [
      { label: "Uruchom audyt cykliczny", path: "/audits" },
      { label: "Przejdź checklistę w terenie", path: "/checklists" },
      { label: "Wygeneruj protokół pokontrolny", path: "/protocols" },
    ],
  },
  {
    id: "reports",
    title: "6. Raporty i certyfikaty",
    goal: "PDF dla klienta, bloki certyfikacyjne, panel kliencki.",
    icon: FileText,
    countKey: "reports",
    requires: ["audits"],
    tasks: [
      { label: "Wygeneruj raport miesięczny", path: "/reports" },
      { label: "Wystaw certyfikat (zatwierdza Super Admin)", path: "/certificates" },
      { label: "Udostępnij panel klienta", path: "/admin" },
    ],
  },
  {
    id: "automation",
    title: "7. Automatyzacja",
    goal: "AI Agent, automatyczne intervale serwisowe, powiadomienia.",
    icon: Bot,
    countKey: "aiActions",
    requires: ["ops"],
    tasks: [
      { label: "Włącz AI Agenta i automatyzacje", path: "/" },
      { label: "Zobacz dziennik akcji AI", path: "/ai-log" },
      { label: "Skonfiguruj cykle urządzeń", path: "/buildings" },
    ],
  },
];

// ============ KROKI SAMOUCZKA (akordeon) ============
export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  cta: { label: string; path: string };
  icon: LucideIcon;
  roles: RoleFilter[];
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "wizard",
    title: "Uruchom wizard onboardingu",
    description: "5-krokowy kreator: firma → obiekt → urządzenia → zespół → pierwsze zadania. Najszybsze wejście.",
    cta: { label: "Otwórz onboarding", path: "/onboarding" },
    icon: Sparkles,
    roles: ["admin"],
  },
  {
    id: "company",
    title: "Dodaj pierwszą firmę",
    description: "Wpisz NIP — system pobierze dane z Białej Listy i KRS. Dodaj kontakty osób kluczowych.",
    cta: { label: "Firmy", path: "/companies" },
    icon: Briefcase,
    roles: ["admin"],
  },
  {
    id: "building",
    title: "Utwórz obiekt i wgraj plan piętra",
    description: "Każde urządzenie ppoż. będziesz mógł oznaczyć pinem na planie. Plan = PNG/JPG/PDF.",
    cta: { label: "Obiekty", path: "/buildings" },
    icon: MapPin,
    roles: ["admin", "serviceman"],
  },
  {
    id: "qr",
    title: "Zeskanuj QR urządzenia",
    description: "Każde urządzenie ma kod QR. Skan otwiera kartę urządzenia, historię serwisu i przycisk młotka (szybka naprawa).",
    cta: { label: "Obiekty", path: "/buildings" },
    icon: QrCode,
    roles: ["admin", "serviceman"],
  },
  {
    id: "task-template",
    title: "Utwórz zadanie cykliczne z szablonu",
    description: "Szablony globalne lub per-obiekt. Cykl ustala się raz, zadania powstają automatycznie.",
    cta: { label: "Kanban", path: "/kanban" },
    icon: ListChecks,
    roles: ["admin"],
  },
  {
    id: "sla",
    title: "Odpowiedz na zgłoszenie SLA",
    description: "Klient zgłasza usterkę → przyjęcie → przypisanie serwisanta → realizacja → protokół → zamknięcie z komentarzem.",
    cta: { label: "SLA", path: "/sla" },
    icon: Siren,
    roles: ["admin", "serviceman"],
  },
  {
    id: "audit",
    title: "Uruchom audyt cykliczny",
    description: "Wybierz obiekt, checklista urządzeń, wykryte usterki zamieniają się na zadania naprawcze.",
    cta: { label: "Audyty", path: "/audits" },
    icon: ClipboardCheck,
    roles: ["admin", "serviceman"],
  },
  {
    id: "calendar",
    title: "Zaplanuj wizyty w kalendarzu",
    description: "Kalendarz pokazuje deadline'y w kolorach. Admin widzi cały zespół, pracownik tylko swoje.",
    cta: { label: "Kalendarz", path: "/calendar" },
    icon: Calendar,
    roles: ["admin", "serviceman"],
  },
  {
    id: "team",
    title: "Zaplanuj rozwój zespołu",
    description: "Plany rozwoju, szkolenia, badania medyczne — wszystko z przypomnieniami i wygasaniem.",
    cta: { label: "Pracownicy", path: "/employees" },
    icon: GraduationCap,
    roles: ["admin"],
  },
  {
    id: "report",
    title: "Wygeneruj raport miesięczny PDF",
    description: "Raport z aktywności i statusu bezpieczeństwa dla klienta. Bloki certyfikacyjne wymagają zatwierdzenia Super Admina.",
    cta: { label: "Raporty", path: "/reports" },
    icon: FileText,
    roles: ["admin"],
  },
  {
    id: "ai",
    title: "Zatwierdzaj akcje AI Agenta",
    description: "AI Agent proponuje akcje (np. masowe przesunięcie deadline'ów). Ty zatwierdzasz przed wykonaniem.",
    cta: { label: "Dziennik AI", path: "/ai-log" },
    icon: Bot,
    roles: ["admin"],
  },
  {
    id: "library",
    title: "Korzystaj z biblioteki dokumentów",
    description: "Instrukcje, normy, karty katalogowe — wszystko w jednym miejscu, z RLS per firma.",
    cta: { label: "Biblioteka", path: "/library" },
    icon: BookOpen,
    roles: ["admin", "serviceman", "client"],
  },
  {
    id: "client-panel",
    title: "Sprawdź swój panel klienta",
    description: "Widzisz status bezpieczeństwa swoich obiektów, otwarte zgłoszenia i nadchodzące wizyty.",
    cta: { label: "Panel klienta", path: "/" },
    icon: Shield,
    roles: ["client"],
  },
];

// ============ DIAGRAMY FLOW ============
export interface FlowNode {
  label: string;
  hint?: string;
  path?: string;
  tone?: "default" | "warn" | "danger" | "success";
}
export interface FlowDiagram {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  nodes: FlowNode[];
}

export const FLOWS: FlowDiagram[] = [
  {
    id: "sla",
    title: "Zgłoszenie SLA klienta",
    description: "Od zgłoszenia do zamknięcia z komentarzem.",
    icon: Siren,
    nodes: [
      { label: "Klient zgłasza usterkę", hint: "panel klienta / publiczny /zgloszenie", path: "/sla", tone: "warn" },
      { label: "Admin przyjmuje", hint: "weryfikacja, kategoryzacja", path: "/sla" },
      { label: "Przypisanie serwisanta", hint: "z dostępnością i lokalizacją", path: "/calendar" },
      { label: "Realizacja w terenie", hint: "checklista + zdjęcia", path: "/checklists" },
      { label: "Protokół + podpis", path: "/protocols" },
      { label: "Zamknięcie z komentarzem", path: "/sla", tone: "success" },
    ],
  },
  {
    id: "audit",
    title: "Audyt cykliczny → naprawa",
    description: "Wykryta usterka automatycznie tworzy zadanie naprawcze.",
    icon: ClipboardCheck,
    nodes: [
      { label: "Plan audytu (cykl)", hint: "globalny lub per-obiekt", path: "/audits" },
      { label: "Checklista w terenie", path: "/checklists" },
      { label: "Wykryta usterka", tone: "danger" },
      { label: "Auto zadanie naprawcze", hint: "ikona młotka", path: "/repairs", tone: "warn" },
      { label: "Re-test po naprawie", path: "/audits", tone: "success" },
    ],
  },
  {
    id: "team",
    title: "Onboarding pracownika",
    description: "Od dodania osoby do gotowości operacyjnej.",
    icon: GraduationCap,
    nodes: [
      { label: "Dodanie pracownika", path: "/employees" },
      { label: "Plan rozwoju", hint: "ścieżka, certyfikaty", path: "/employees" },
      { label: "Szkolenia", path: "/employees" },
      { label: "Badania medyczne", path: "/employees", tone: "warn" },
      { label: "Pracownik aktywny", tone: "success" },
    ],
  },
  {
    id: "lead",
    title: "Lead handlowy → klient",
    description: "Z CRM do operacji za pomocą jednego dialogu konwersji.",
    icon: Contact,
    nodes: [
      { label: "Szansa w CRM", path: "/crm" },
      { label: "Konwersja: Firma + Obiekt + Kontakt + Zadanie", path: "/crm" },
      { label: "Pierwsze zadanie operacyjne", path: "/kanban" },
      { label: "Raport / oferta", path: "/reports", tone: "success" },
    ],
  },
];
