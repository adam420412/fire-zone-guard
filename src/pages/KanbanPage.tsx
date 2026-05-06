import { useState, useCallback, useEffect, useMemo } from "react";
import { useTasks, useUpdateTask } from "@/hooks/useSupabaseData";
import { kanbanStatuses, statusColors } from "@/lib/constants";
import type { TaskStatus } from "@/lib/constants";
import TaskCard from "@/components/TaskCard";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import CreateTaskDialog from "@/components/CreateTaskDialog";
import { cn } from "@/lib/utils";
import { Filter, Search, Plus, Download, ArrowUpDown, LayoutGrid, List as ListIcon, FileText, Settings2, ChevronDown, Bug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KanbanSkeleton } from "@/components/PageSkeleton";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { formatRelative, formatLocalDateTime } from "@/lib/relativeTime";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { buildLastActivityTooltip } from "@/lib/lastActivity";
import { PdfLayoutDebugDialog } from "@/components/kanban/PdfLayoutDebugDialog";

type SortMode = "deadline" | "priority" | "created" | "title" | "updated" | "quoteStatus" | "quoteCount";
type GroupMode = "none" | "building" | "assignee";
type DueFilter = "all" | "overdue" | "today" | "week";
type QuoteFilter = "all" | "any" | "none" | "draft" | "sent" | "accepted" | "rejected" | "expired";
type RecencyFilter = "all" | "24h" | "7d" | "30d";
type ViewMode = "kanban" | "list";

const PRIORITY_RANK: Record<string, number> = { krytyczny: 0, wysoki: 1, "średni": 2, niski: 3 };

// Kolejność istotności statusów ofert (im niżej, tym "ważniejsze" / wyżej w sortowaniu rosnącym).
const QUOTE_STATUS_RANK: Record<string, number> = {
  zaakceptowana: 0,
  "wysłana": 1,
  wyslana: 1,
  "wersja robocza": 2,
  "wygasła": 3,
  wygasla: 3,
  odrzucona: 4,
};
function quoteStatusRank(s?: string | null): number {
  if (!s) return 99; // brak oferty na końcu
  return QUOTE_STATUS_RANK[String(s).toLowerCase()] ?? 50;
}

// Skróty statusów ofert (zgodnie z TaskCard)
const QUOTE_FILTER_LABELS: Record<Exclude<QuoteFilter, "all" | "any" | "none">, string> = {
  draft: "Wersja robocza",
  sent: "Wysłana",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  expired: "Wygasła",
};

// "Ostatnia aktywność" zadania = max(created_at, quoteUpdatedAt)
function taskLastActivityMs(t: any): number {
  const created = t.created_at ? new Date(t.created_at).getTime() : 0;
  const quote = t.quoteUpdatedAt ? new Date(t.quoteUpdatedAt).getTime() : 0;
  return Math.max(created, quote);
}

// ===== Definicja kolumn eksportu =====
type ExportColumnGroup = "basic" | "quote" | "activity";
type ExportColumnKey =
  | "id" | "title" | "building" | "company" | "assignee"
  | "priority" | "status" | "type" | "deadline"
  | "quoteStatus" | "quoteCount" | "quoteNumber" | "quoteBreakdown"
  | "createdAt" | "quoteUpdatedAt" | "lastActivity" | "lastActivitySource";

interface ExportColumnDef {
  key: ExportColumnKey;
  label: string;
  group: ExportColumnGroup;
  pdfShort?: string;
  pdfWidth?: number;
  xlsxWidth?: number;
  accessor: (t: any) => string | number;
}

function fmtDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pl-PL");
}
function fmtDateTime(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pl-PL");
}

const EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: "id",          label: "ID",                  group: "basic", pdfShort: "ID",     pdfWidth: 50,  xlsxWidth: 10, accessor: (t) => String(t.id ?? "").slice(0, 8) },
  { key: "title",       label: "Tytuł",               group: "basic", pdfShort: "Tytuł",  pdfWidth: 170, xlsxWidth: 38, accessor: (t) => t.title ?? "" },
  { key: "building",    label: "Obiekt",              group: "basic", pdfShort: "Obiekt", pdfWidth: 100, xlsxWidth: 22, accessor: (t) => t.buildingName ?? "" },
  { key: "company",     label: "Firma",               group: "basic", pdfShort: "Firma",  pdfWidth: 90,  xlsxWidth: 22, accessor: (t) => t.companyName ?? "" },
  { key: "assignee",    label: "Przypisany",          group: "basic", pdfShort: "Wyk.",   pdfWidth: 80,  xlsxWidth: 18, accessor: (t) => t.assigneeName ?? "" },
  { key: "priority",    label: "Priorytet",           group: "basic", pdfShort: "Pr.",    pdfWidth: 45,  xlsxWidth: 10, accessor: (t) => t.priority ?? "" },
  { key: "status",      label: "Status",              group: "basic", pdfShort: "Status", pdfWidth: 65,  xlsxWidth: 14, accessor: (t) => t.status ?? "" },
  { key: "type",        label: "Typ",                 group: "basic", pdfShort: "Typ",    pdfWidth: 55,  xlsxWidth: 12, accessor: (t) => t.type ?? "" },
  { key: "deadline",    label: "Deadline",            group: "basic", pdfShort: "Termin", pdfWidth: 60,  xlsxWidth: 14, accessor: (t) => fmtDate(t.deadline) },

  { key: "quoteStatus",    label: "Oferta — status",     group: "quote", pdfShort: "Oferta", pdfWidth: 70, xlsxWidth: 16, accessor: (t) => t.quoteStatus ?? "" },
  { key: "quoteCount",     label: "Oferta — liczba",     group: "quote", pdfShort: "#Of.",   pdfWidth: 35, xlsxWidth: 8,  accessor: (t) => t.quoteCount ?? 0 },
  { key: "quoteNumber",    label: "Oferta — numer",      group: "quote", pdfShort: "Nr of.", pdfWidth: 65, xlsxWidth: 16, accessor: (t) => t.quoteNumber ?? "" },
  { key: "quoteBreakdown", label: "Oferta — breakdown",  group: "quote", pdfShort: "Of. breakdown", pdfWidth: 90, xlsxWidth: 24, accessor: (t) => {
      const c = t.quoteStatusCounts ?? {};
      const entries = Object.entries(c).filter(([, v]) => (v as number) > 0);
      return entries.map(([k, v]) => `${k}:${v}`).join(", ");
    } },

  { key: "createdAt",          label: "Utworzono",                group: "activity", pdfShort: "Utw.",   pdfWidth: 80, xlsxWidth: 20, accessor: (t) => fmtDateTime(t.created_at) },
  { key: "quoteUpdatedAt",     label: "Oferta zaktualizowana",    group: "activity", pdfShort: "Of. akt.", pdfWidth: 80, xlsxWidth: 20, accessor: (t) => fmtDateTime(t.quoteUpdatedAt) },
  { key: "lastActivity",       label: "Ostatnia aktywność",       group: "activity", pdfShort: "Akt.",   pdfWidth: 80, xlsxWidth: 22, accessor: (t) => {
      const ms = taskLastActivityMs(t);
      return ms ? new Date(ms).toLocaleString("pl-PL") : "";
    } },
  { key: "lastActivitySource", label: "Źródło aktywności",        group: "activity", pdfShort: "Akt. źr.", pdfWidth: 55, xlsxWidth: 14, accessor: (t) => {
      const c = t.created_at ? new Date(t.created_at).getTime() : 0;
      const q = t.quoteUpdatedAt ? new Date(t.quoteUpdatedAt).getTime() : 0;
      if (!c && !q) return "";
      return q > c ? "oferta" : "utworzenie";
    } },
];

const EXPORT_COLUMN_GROUPS: { key: ExportColumnGroup; label: string }[] = [
  { key: "basic",    label: "Podstawowe" },
  { key: "quote",    label: "Oferty" },
  { key: "activity", label: "Aktywność" },
];

const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "id", "title", "building", "company", "assignee", "priority", "status", "type",
  "deadline", "quoteStatus", "quoteCount", "lastActivity",
];

export default function KanbanPage() {
  const { data: tasks, isLoading } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [groupValueFilter, setGroupValueFilter] = useState<string>("all");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("all");
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [includeExportMeta, setIncludeExportMeta] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("kanban.exportIncludeMeta") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.exportIncludeMeta", includeExportMeta ? "1" : "0");
    }
  }, [includeExportMeta]);

  const [pdfDebugLayout, setPdfDebugLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("kanban.exportPdfDebug") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.exportPdfDebug", pdfDebugLayout ? "1" : "0");
    }
  }, [pdfDebugLayout]);

  // Pobieranie KanbanPdfLayoutReport jako JSON razem z PDF
  const [pdfDownloadLayoutJson, setPdfDownloadLayoutJson] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("kanban.exportPdfLayoutJson") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "kanban.exportPdfLayoutJson",
        pdfDownloadLayoutJson ? "1" : "0",
      );
    }
  }, [pdfDownloadLayoutJson]);

  // Konfigurowalne odstępy pionowe w PDF (pt). Domyślnie 8 / 18.
  const PDF_SPACING_DEFAULTS = { headerToTable: 8, tableToNextHeader: 18 };
  const [pdfSpacing, setPdfSpacing] = useState<{
    headerToTable: number;
    tableToNextHeader: number;
  }>(() => {
    if (typeof window === "undefined") return PDF_SPACING_DEFAULTS;
    try {
      const raw = window.localStorage.getItem("kanban.exportPdfSpacing");
      if (!raw) return PDF_SPACING_DEFAULTS;
      const parsed = JSON.parse(raw);
      const num = (v: any, fallback: number) =>
        typeof v === "number" && Number.isFinite(v) ? v : fallback;
      return {
        headerToTable: num(parsed.headerToTable, PDF_SPACING_DEFAULTS.headerToTable),
        tableToNextHeader: num(parsed.tableToNextHeader, PDF_SPACING_DEFAULTS.tableToNextHeader),
      };
    } catch {
      return PDF_SPACING_DEFAULTS;
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.exportPdfSpacing", JSON.stringify(pdfSpacing));
    }
  }, [pdfSpacing]);

  // Wybór kolumn eksportu (CSV/XLSX/PDF)
  const [exportColumns, setExportColumns] = useState<ExportColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_EXPORT_COLUMNS;
    try {
      const raw = window.localStorage.getItem("kanban.exportColumns");
      if (!raw) return DEFAULT_EXPORT_COLUMNS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_EXPORT_COLUMNS;
      const valid = parsed.filter((k: any): k is ExportColumnKey =>
        EXPORT_COLUMNS.some((c) => c.key === k)
      );
      return valid.length ? valid : DEFAULT_EXPORT_COLUMNS;
    } catch {
      return DEFAULT_EXPORT_COLUMNS;
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.exportColumns", JSON.stringify(exportColumns));
    }
  }, [exportColumns]);
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [pdfDebugDialogOpen, setPdfDebugDialogOpen] = useState(false);

  // Ostatnio użyty format eksportu (CSV/XLSX/PDF) — pozwala szybko powtórzyć
  type ExportFormat = "csv" | "xlsx" | "pdf";
  const [lastExportFormat, setLastExportFormat] = useState<ExportFormat>(() => {
    if (typeof window === "undefined") return "csv";
    const v = window.localStorage.getItem("kanban.lastExportFormat");
    return v === "xlsx" || v === "pdf" || v === "csv" ? v : "csv";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.lastExportFormat", lastExportFormat);
    }
  }, [lastExportFormat]);

  // Grupowanie eksportu
  type ExportGroupBy = "none" | "company" | "building" | "assignee";
  type ExportGroupOutput = "sections" | "files" | "single-sheet";
  const [exportGroupBy, setExportGroupBy] = useState<ExportGroupBy>(() => {
    if (typeof window === "undefined") return "none";
    const v = window.localStorage.getItem("kanban.exportGroupBy");
    return v === "company" || v === "building" || v === "assignee" ? v : "none";
  });
  const [exportGroupOutput, setExportGroupOutput] = useState<ExportGroupOutput>(() => {
    if (typeof window === "undefined") return "sections";
    const v = window.localStorage.getItem("kanban.exportGroupOutput");
    return v === "files" || v === "single-sheet" ? v : "sections";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanban.exportGroupBy", exportGroupBy);
      window.localStorage.setItem("kanban.exportGroupOutput", exportGroupOutput);
    }
  }, [exportGroupBy, exportGroupOutput]);

  // === Szablony eksportu ===
  type ExportTemplate = {
    id: string;
    name: string;
    format: ExportFormat;
    columns: ExportColumnKey[];
    includeMeta: boolean;
    groupBy: ExportGroupBy;
    groupOutput: ExportGroupOutput;
    createdAt: number;
  };
  const TEMPLATES_KEY = "kanban.exportTemplates";
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(TEMPLATES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t: any) => t && typeof t.id === "string" && typeof t.name === "string") : [];
    } catch { return []; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(exportTemplates));
    }
  }, [exportTemplates]);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const saveCurrentAsTemplate = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Podaj nazwę szablonu"); return; }
    const tpl: ExportTemplate = {
      id: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `tpl_${Date.now()}`,
      name: trimmed,
      format: lastExportFormat,
      columns: [...exportColumns],
      includeMeta: includeExportMeta,
      groupBy: exportGroupBy,
      groupOutput: exportGroupOutput,
      createdAt: Date.now(),
    };
    setExportTemplates((prev) => {
      const filtered = prev.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
      return [tpl, ...filtered];
    });
    setNewTemplateName("");
    toast.success(`Zapisano szablon „${trimmed}"`);
  };

  const applyTemplate = (tpl: ExportTemplate) => {
    setLastExportFormat(tpl.format);
    setExportColumns(tpl.columns.filter((k) => EXPORT_COLUMNS.some((c) => c.key === k)));
    setIncludeExportMeta(tpl.includeMeta);
    setExportGroupBy(tpl.groupBy);
    setExportGroupOutput(tpl.groupOutput);
    toast.success(`Wczytano szablon „${tpl.name}"`);
  };

  const deleteTemplate = (id: string) => {
    setExportTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const runTemplate = (tpl: ExportTemplate) => {
    applyTemplate(tpl);
    // eksport po następnym renderze, gdy state się zaaplikuje
    setTimeout(() => {
      if (tpl.format === "csv") handleExportCSV();
      else if (tpl.format === "xlsx") handleExportXLSX();
      else handleExportPDF();
    }, 50);
  };

  const groupTasksForExport = useCallback((arr: any[], by: ExportGroupBy) => {
    if (by === "none") return [{ key: "_all", label: "Wszystkie", tasks: arr }];
    const map = new Map<string, { key: string; label: string; tasks: any[] }>();
    arr.forEach((t: any) => {
      const label =
        by === "company"  ? (t.companyName  || "— bez firmy —")  :
        by === "building" ? (t.buildingName || "— bez obiektu —") :
                            (t.assigneeName || "— nieprzypisane —");
      const entry = map.get(label) ?? { key: label, label, tasks: [] };
      entry.tasks.push(t);
      map.set(label, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }, []);

  const groupByLabel: Record<ExportGroupBy, string> = {
    none: "brak", company: "Firma", building: "Obiekt", assignee: "Osoba",
  };
  const groupOutputLabel: Record<ExportGroupOutput, string> = {
    sections: "sekcje (osobne arkusze w XLSX)",
    "single-sheet": "sekcje w jednym arkuszu",
    files: "osobne pliki (.zip)",
  };
  const groupOutputShort: Record<ExportGroupOutput, string> = {
    sections: "sekcje",
    "single-sheet": "1 arkusz",
    files: "pliki",
  };
  const sanitizeFileName = (s: string) =>
    s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "grupa";

  // Aktywne definicje kolumn w kolejności wyboru
  const activeColumnDefs = useMemo(
    () => exportColumns
      .map((k) => EXPORT_COLUMNS.find((c) => c.key === k))
      .filter((c): c is ExportColumnDef => !!c),
    [exportColumns]
  );
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  // Local state for optimistic drag & drop
  const [localTasks, setLocalTasks] = useState<any[]>([]);

  useEffect(() => {
    if (tasks) {
      setLocalTasks(tasks);
    }
  }, [tasks]);

  // Reset value filter when group mode changes
  useEffect(() => {
    setGroupValueFilter("all");
  }, [groupMode]);

  // Compute available group values (buildings or assignees) from current dataset
  const groupValueOptions = useMemo(() => {
    if (groupMode === "none") return [];
    const set = new Map<string, number>();
    localTasks.forEach((t: any) => {
      const key = groupMode === "building"
        ? (t.buildingName || "— bez obiektu —")
        : (t.assigneeName || "— nieprzypisane —");
      set.set(key, (set.get(key) ?? 0) + 1);
    });
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pl"))
      .map(([label, count]) => ({ label, count }));
  }, [localTasks, groupMode]);

  const isWithinRange = (deadline: string | null | undefined, status: string) => {
    if (dueFilter === "all") return true;
    if (!deadline) return false;
    const d = new Date(deadline);
    const now = new Date();
    const isClosed = status === "Zamknięte";
    if (dueFilter === "overdue") return !isClosed && d < now;
    if (dueFilter === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (dueFilter === "week") {
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      return d >= now && d <= in7;
    }
    return true;
  };

  // Mapuje quoteStatus na klucz filtra (uwzględnia też wygasłą wg valid_until z agregacji).
  const matchesQuote = useCallback((t: any): boolean => {
    if (quoteFilter === "all") return true;
    const counts = t.quoteStatusCounts ?? {};
    const totalQuotes = t.quoteCount ?? 0;
    if (quoteFilter === "any") return totalQuotes > 0;
    if (quoteFilter === "none") return totalQuotes === 0;
    // Konkretny status: wystarczy, że istnieje JAKAKOLWIEK oferta tego zadania w danym statusie.
    return (counts[quoteFilter] ?? 0) > 0;
  }, [quoteFilter]);

  const matchesRecency = useCallback((t: any): boolean => {
    if (recencyFilter === "all") return true;
    const last = taskLastActivityMs(t);
    if (!last) return false;
    const ageMs = Date.now() - last;
    const hour = 3_600_000;
    if (recencyFilter === "24h") return ageMs <= 24 * hour;
    if (recencyFilter === "7d") return ageMs <= 7 * 24 * hour;
    if (recencyFilter === "30d") return ageMs <= 30 * 24 * hour;
    return true;
  }, [recencyFilter]);

  // Bazowe predykaty (bez filtra Aktywność) — używane też do liczników chipsów Aktywność,
  // żeby liczniki uwzględniały pozostałe aktywne filtry (termin, priorytet, search, grupa, oferta).
  const baseFilteredTasks = useMemo(() => {
    return localTasks.filter((t: any) => {
      const matchesSearch =
        search === "" ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.assigneeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (t.buildingName ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
      const matchesDue = isWithinRange(t.deadline, t.status);
      const matchesGroupValue = groupValueFilter === "all" || groupMode === "none" || (
        groupMode === "building"
          ? (t.buildingName || "— bez obiektu —") === groupValueFilter
          : (t.assigneeName || "— nieprzypisane —") === groupValueFilter
      );
      return matchesSearch && matchesPriority && matchesDue && matchesGroupValue && matchesQuote(t);
    });
  }, [localTasks, search, filterPriority, dueFilter, groupValueFilter, groupMode, matchesQuote]);

  const filteredTasks = useMemo(
    () => baseFilteredTasks.filter((t: any) => matchesRecency(t)),
    [baseFilteredTasks, matchesRecency]
  );

  const sortTasks = useCallback((arr: any[]) => {
    const sorted = [...arr];
    if (sortMode === "deadline") {
      sorted.sort((a, b) => {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return ad - bd;
      });
    } else if (sortMode === "priority") {
      sorted.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
    } else if (sortMode === "title") {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", "pl"));
    } else if (sortMode === "updated") {
      sorted.sort((a, b) => taskLastActivityMs(b) - taskLastActivityMs(a));
    } else if (sortMode === "quoteStatus") {
      sorted.sort((a, b) => {
        const r = quoteStatusRank(a.quoteStatus) - quoteStatusRank(b.quoteStatus);
        if (r !== 0) return r;
        return taskLastActivityMs(b) - taskLastActivityMs(a);
      });
    } else if (sortMode === "quoteCount") {
      sorted.sort((a, b) => {
        const d = (b.quoteCount ?? 0) - (a.quoteCount ?? 0);
        if (d !== 0) return d;
        return taskLastActivityMs(b) - taskLastActivityMs(a);
      });
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [sortMode]);

  // Etykiety dla aktywnych filtrów / sortowania — używane w nagłówku eksportu i nazwie pliku.
  const exportContext = useMemo(() => {
    const sortLabels: Record<SortMode, string> = {
      deadline: "Termin",
      priority: "Priorytet",
      created: "Data utworzenia",
      title: "Tytuł A-Z",
      updated: "Ostatnia aktywność",
      quoteStatus: "Status oferty",
      quoteCount: "Liczba ofert",
    };
    const dueLabels: Record<DueFilter, string> = {
      all: "Wszystkie",
      overdue: "Przeterminowane",
      today: "Dziś",
      week: "Najbliższe 7 dni",
    };
    const quoteLabels: Record<QuoteFilter, string> = {
      all: "Wszystkie", any: "Dowolna", none: "Brak",
      draft: "Wersja robocza", sent: "Wysłana",
      accepted: "Zaakceptowana", rejected: "Odrzucona", expired: "Wygasła",
    };
    const recencyLabels: Record<RecencyFilter, string> = {
      all: "Wszystkie", "24h": "Ostatnie 24h", "7d": "Ostatnie 7 dni", "30d": "Ostatnie 30 dni",
    };
    const filters: { label: string; value: string }[] = [];
    if (search) filters.push({ label: "Szukaj", value: search });
    if (filterPriority !== "all") filters.push({ label: "Priorytet", value: filterPriority });
    filters.push({ label: "Termin", value: dueLabels[dueFilter] });
    filters.push({ label: "Oferta", value: quoteLabels[quoteFilter] });
    filters.push({ label: "Aktywność", value: recencyLabels[recencyFilter] });
    if (groupMode !== "none" && groupValueFilter !== "all") {
      filters.push({ label: groupMode === "building" ? "Obiekt" : "Wykonawca", value: groupValueFilter });
    }
    const slug = [
      `sort-${sortMode}`,
      quoteFilter !== "all" ? `q-${quoteFilter}` : null,
      recencyFilter !== "all" ? `r-${recencyFilter}` : null,
      dueFilter !== "all" ? `d-${dueFilter}` : null,
      filterPriority !== "all" ? `p-${filterPriority}` : null,
    ].filter(Boolean).join("_");
    return {
      filters,
      sortLabel: sortLabels[sortMode],
      slug,
    };
  }, [search, filterPriority, dueFilter, quoteFilter, recencyFilter, groupMode, groupValueFilter, sortMode]);

  // Posortowane + przefiltrowane zadania (te same co w widoku listy) — źródło dla eksportów.
  const sortedFilteredTasks = useMemo(
    () => sortTasks(filteredTasks),
    [filteredTasks, sortTasks]
  );

  const exportRowCount = sortedFilteredTasks.length;

  const exportFileBase = useMemo(() => {
    const date = new Date().toISOString().split("T")[0];
    return `firezone_zadania_${date}${exportContext.slug ? `__${exportContext.slug}` : ""}`;
  }, [exportContext.slug]);

  const buildMetaLines = (groupLabel?: string) => {
    const lines = [
      `Eksport: ${new Date().toLocaleString("pl-PL")}`,
      `Sortowanie: ${exportContext.sortLabel}`,
      `Filtry: ${exportContext.filters.map(f => `${f.label}=${f.value}`).join(" | ") || "—"}`,
      `Liczba zadań: ${exportRowCount}`,
      `Kolumny: ${activeColumnDefs.map(c => c.label).join(", ")}`,
    ];
    if (exportGroupBy !== "none") {
      lines.push(`Grupowanie: ${groupByLabel[exportGroupBy]} (${groupOutputLabel[exportGroupOutput]})`);
      if (groupLabel) lines.push(`Grupa: ${groupLabel}`);
    }
    return lines;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ====== CSV ======
  const buildCSVForTasks = (tasks: any[], groupLabel?: string) => {
    const headers = activeColumnDefs.map((c) => c.label);
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const meta = includeExportMeta
      ? buildMetaLines(groupLabel).map(l => `# ${l}`).join("\n") + "\n"
      : "";
    const body = [headers.map(escape).join(";")]
      .concat(tasks.map((t: any) =>
        activeColumnDefs.map((c) => escape(c.accessor(t))).join(";")
      ))
      .join("\n");
    return `${meta}${body}`;
  };

  const handleExportCSV = async () => {
    if (!activeColumnDefs.length) {
      toast.error("Wybierz przynajmniej jedną kolumnę do eksportu");
      return;
    }
    setLastExportFormat("csv");
    const groups = groupTasksForExport(sortedFilteredTasks, exportGroupBy);

    if (exportGroupBy === "none") {
      const csv = buildCSVForTasks(sortedFilteredTasks);
      downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `${exportFileBase}.csv`);
      return;
    }

    if (exportGroupOutput === "files") {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      groups.forEach(g => {
        const csv = buildCSVForTasks(g.tasks, g.label);
        zip.file(`${exportFileBase}__${sanitizeFileName(g.label)}.csv`, "\ufeff" + csv);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${exportFileBase}__by-${exportGroupBy}.zip`);
      return;
    }

    // sekcje w jednym pliku
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = activeColumnDefs.map((c) => c.label);
    const parts: string[] = [];
    if (includeExportMeta) {
      parts.push(buildMetaLines().map(l => `# ${l}`).join("\n"));
    }
    groups.forEach((g, idx) => {
      const sectionLines = [
        `# === Grupa: ${groupByLabel[exportGroupBy]} = ${g.label} (${g.tasks.length}) ===`,
        headers.map(escape).join(";"),
        ...g.tasks.map((t: any) => activeColumnDefs.map((c) => escape(c.accessor(t))).join(";")),
      ];
      parts.push((idx > 0 ? "\n" : "") + sectionLines.join("\n"));
    });
    downloadBlob(
      new Blob(["\ufeff" + parts.join("\n")], { type: "text/csv;charset=utf-8" }),
      `${exportFileBase}__by-${exportGroupBy}.csv`
    );
  };

  // ====== XLSX ======
  const buildXLSXSheet = async (tasks: any[], groupLabel?: string) => {
    const XLSX = await import("xlsx");
    const headers = activeColumnDefs.map((c) => c.label);
    const metaRows: any[][] = includeExportMeta
      ? [...buildMetaLines(groupLabel).map(l => [l]), []]
      : [];
    const dataRows = tasks.map((t: any) => activeColumnDefs.map((c) => c.accessor(t)));
    const aoa = [...metaRows, headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = activeColumnDefs.map((c) => ({ wch: c.xlsxWidth ?? 16 }));
    return ws;
  };

  const handleExportXLSX = async () => {
    if (!activeColumnDefs.length) {
      toast.error("Wybierz przynajmniej jedną kolumnę do eksportu");
      return;
    }
    setLastExportFormat("xlsx");
    const XLSX = await import("xlsx");
    const groups = groupTasksForExport(sortedFilteredTasks, exportGroupBy);

    if (exportGroupBy === "none") {
      const ws = await buildXLSXSheet(sortedFilteredTasks);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Zadania");
      XLSX.writeFile(wb, `${exportFileBase}.xlsx`);
      return;
    }

    if (exportGroupOutput === "files") {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const g of groups) {
        const ws = await buildXLSXSheet(g.tasks, g.label);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Zadania");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        zip.file(`${exportFileBase}__${sanitizeFileName(g.label)}.xlsx`, buf);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${exportFileBase}__by-${exportGroupBy}.zip`);
      return;
    }

    if (exportGroupOutput === "single-sheet") {
      // Wszystkie grupy w jednym arkuszu, oddzielone nagłówkiem sekcji i pustym wierszem
      const headers = activeColumnDefs.map((c) => c.label);
      const aoa: any[][] = [];
      if (includeExportMeta) {
        buildMetaLines().forEach((l) => aoa.push([l]));
        aoa.push([]);
      }
      groups.forEach((g, idx) => {
        if (idx > 0) aoa.push([]);
        aoa.push([`${groupByLabel[exportGroupBy]}: ${g.label} (${g.tasks.length})`]);
        aoa.push(headers);
        g.tasks.forEach((t: any) => aoa.push(activeColumnDefs.map((c) => c.accessor(t))));
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = activeColumnDefs.map((c) => ({ wch: c.xlsxWidth ?? 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Zadania");
      XLSX.writeFile(wb, `${exportFileBase}__by-${exportGroupBy}.xlsx`);
      return;
    }

    // sections (domyślne dla XLSX) = osobne arkusze w jednym skoroszycie
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    for (const g of groups) {
      const ws = await buildXLSXSheet(g.tasks, g.label);
      // Excel limit 31 znaków, unikalna nazwa
      let base = sanitizeFileName(g.label).slice(0, 28).replace(/_+$/, "") || "Grupa";
      let name = base, i = 1;
      while (usedNames.has(name)) { name = `${base}_${i++}`.slice(0, 31); }
      usedNames.add(name);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `${exportFileBase}__by-${exportGroupBy}.xlsx`);
  };

  // ====== PDF ======
  const renderPDF = async (groups: { label: string; tasks: any[] }[], filename: string, asSingleDoc: boolean) => {
    const [{ default: jsPDF }, autoTableMod, { buildKanbanPdf }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
      import("@/lib/kanbanPdfExport"),
    ]);
    const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

    const buildDocAndLayout = (grps: { label: string; tasks: any[] }[]) =>
      buildKanbanPdf(
        { jsPDF, autoTable },
        {
          groups: grps,
          columns: activeColumnDefs as any,
          groupBy: exportGroupBy,
          groupByLabel,
          metaLines: includeExportMeta ? buildMetaLines() : [],
          debug: pdfDebugLayout,
          spacing: pdfSpacing,
        },
      );

    const layoutJsonBlob = (layout: any) =>
      new Blob([JSON.stringify(layout, null, 2)], {
        type: "application/json;charset=utf-8",
      });
    const layoutJsonName = (pdfFilename: string) =>
      pdfFilename.replace(/\.pdf$/i, "") + ".layout.json";

    if (asSingleDoc) {
      const { doc, layout } = buildDocAndLayout(groups);
      doc.save(filename);
      if (pdfDownloadLayoutJson) {
        downloadBlob(layoutJsonBlob(layout), layoutJsonName(filename));
      }
      return;
    }

    // osobne pliki -> zip
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const g of groups) {
      const { doc, layout } = buildDocAndLayout([g]);
      const ab = doc.output("arraybuffer");
      const baseName = `${exportFileBase}__${sanitizeFileName(g.label)}`;
      zip.file(`${baseName}.pdf`, ab);
      if (pdfDownloadLayoutJson) {
        zip.file(`${baseName}.layout.json`, JSON.stringify(layout, null, 2));
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, filename);
  };

  const handleExportPDF = async () => {
    if (!activeColumnDefs.length) {
      toast.error("Wybierz przynajmniej jedną kolumnę do eksportu");
      return;
    }
    setLastExportFormat("pdf");
    const groups = groupTasksForExport(sortedFilteredTasks, exportGroupBy);
    if (exportGroupBy === "none") {
      await renderPDF(groups, `${exportFileBase}.pdf`, true);
      return;
    }
    if (exportGroupOutput === "files") {
      await renderPDF(groups, `${exportFileBase}__by-${exportGroupBy}.zip`, false);
    } else {
      await renderPDF(groups, `${exportFileBase}__by-${exportGroupBy}.pdf`, true);
    }
  };

  // Toggle pojedynczej kolumny (zachowuje kolejność z EXPORT_COLUMNS)
  const toggleExportColumn = (key: ExportColumnKey) => {
    setExportColumns((prev) => {
      const has = prev.includes(key);
      if (has) return prev.filter((k) => k !== key);
      // Zachowaj kolejność wg EXPORT_COLUMNS
      const next = [...prev, key];
      return EXPORT_COLUMNS.map((c) => c.key).filter((k) => next.includes(k));
    });
  };



  const getTasksForStatus = useCallback((status: TaskStatus) => {
    return sortTasks(filteredTasks.filter((t: any) => t.status === status));
  }, [filteredTasks, sortTasks]);

  // Group rendering helper — returns sections [{key, label, tasks}]
  const groupTasks = useCallback((statusTasks: any[]) => {
    if (groupMode === "none") return [{ key: "_all", label: "", tasks: statusTasks }];
    const map = new Map<string, { key: string; label: string; tasks: any[] }>();
    statusTasks.forEach((t) => {
      const key = groupMode === "building"
        ? (t.buildingName || "— bez obiektu —")
        : (t.assigneeName || "— nieprzypisane —");
      const entry = map.get(key) ?? { key, label: key, tasks: [] };
      entry.tasks.push(t);
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }, [groupMode]);

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as TaskStatus;

    // Optimistic UI Update
    setLocalTasks(prev => 
      prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t)
    );

    updateTask(
      { id: draggableId, status: newStatus },
      {
        onError: () => {
          toast.error("Nie udało się zaktualizować statusu zadania.");
          // Revert optimistic update
          if (tasks) setLocalTasks(tasks);
        }
      }
    );
  };

  if (isLoading) return <KanbanSkeleton />;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban zadań</h1>
          <p className="text-sm text-muted-foreground">Globalny widok wszystkich zadań operacyjnych</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 focus-within:border-primary transition-colors">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj..."
              className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
          >
            <option value="all">Priorytety: Wszystkie</option>
            <option value="krytyczny">Krytyczny</option>
            <option value="wysoki">Wysoki</option>
            <option value="średni">Średni</option>
            <option value="niski">Niski</option>
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
            title="Sortowanie kart w kolumnie"
          >
            <option value="deadline">Sort: Termin</option>
            <option value="priority">Sort: Priorytet</option>
            <option value="created">Sort: Data utworzenia</option>
            <option value="updated">Sort: Ostatnia aktywność</option>
            <option value="quoteStatus">Sort: Status oferty</option>
            <option value="quoteCount">Sort: Liczba ofert</option>
            <option value="title">Sort: Tytuł A-Z</option>
          </select>
          <select
            value={quoteFilter}
            onChange={(e) => setQuoteFilter(e.target.value as QuoteFilter)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
            title="Filtr po statusie oferty powiązanej z zadaniem"
          >
            <option value="all">Oferta: Wszystkie</option>
            <option value="any">Oferta: Dowolna</option>
            <option value="none">Oferta: Bez oferty</option>
            {(Object.keys(QUOTE_FILTER_LABELS) as Array<keyof typeof QUOTE_FILTER_LABELS>).map((k) => (
              <option key={k} value={k}>Oferta: {QUOTE_FILTER_LABELS[k]}</option>
            ))}
          </select>
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
            title="Grupowanie zadań w kolumnie"
          >
            <option value="none">Grupuj: brak</option>
            <option value="building">Grupuj: Obiekt</option>
            <option value="assignee">Grupuj: Wykonawca</option>
          </select>
          {groupMode !== "none" && groupValueOptions.length > 0 && (
            <select
              value={groupValueFilter}
              onChange={(e) => setGroupValueFilter(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer max-w-[220px]"
              title={groupMode === "building" ? "Filtr: Obiekt" : "Filtr: Wykonawca"}
            >
              <option value="all">
                {groupMode === "building" ? "Obiekt: Wszystkie" : "Wykonawca: Wszyscy"}
              </option>
              {groupValueOptions.map((g) => (
                <option key={g.label} value={g.label}>{g.label} ({g.count})</option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-md border border-border bg-card overflow-hidden" role="tablist" aria-label="Widok zadań">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "kanban" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
              )}
              aria-pressed={viewMode === "kanban"}
              title="Widok Kanban"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-border",
                viewMode === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
              )}
              aria-pressed={viewMode === "list"}
              title="Widok listy"
            >
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          <div className="flex items-stretch rounded-md border border-border overflow-hidden bg-card">
            <button
              onClick={() => {
                if (lastExportFormat === "csv") handleExportCSV();
                else if (lastExportFormat === "xlsx") handleExportXLSX();
                else handleExportPDF();
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
              title={`Powtórz ostatni eksport (${lastExportFormat.toUpperCase()}) · ${exportRowCount} zadań · ${activeColumnDefs.length} kolumn · sort: ${exportContext.sortLabel}${includeExportMeta ? " · z metadanymi" : ""}`}
            >
              <Download className="h-4 w-4" />
              Eksportuj {lastExportFormat.toUpperCase()} ({exportRowCount})
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center px-2 border-l border-border hover:bg-secondary transition-colors"
                  title="Opcje eksportu"
                  aria-label="Opcje eksportu"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[10px] uppercase">
                  Z aktualnymi filtrami · ostatnio: {lastExportFormat.toUpperCase()}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> CSV (.csv){lastExportFormat === "csv" ? " ✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXLSX}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> Excel (.xlsx){lastExportFormat === "xlsx" ? " ✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> PDF (.pdf){lastExportFormat === "pdf" ? " ✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPreviewDialogOpen(true); }}>
                  <Search className="h-3.5 w-3.5 mr-2" />
                  Podgląd eksportu
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setColumnsDialogOpen(true); }}>
                  <Settings2 className="h-3.5 w-3.5 mr-2" />
                  Wybierz kolumny ({activeColumnDefs.length}/{EXPORT_COLUMNS.length})
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  checked={includeExportMeta}
                  onCheckedChange={(v) => setIncludeExportMeta(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  Dołącz metadane (filtry, sort)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={pdfDebugLayout}
                  onCheckedChange={(v) => setPdfDebugLayout(!!v)}
                  onSelect={(e) => e.preventDefault()}
                  title="Rysuje w PDF obrysy marginesów i wyliczane 'miejsce do końca strony'. Tylko dla diagnostyki paginacji."
                >
                  Debug układu PDF (marginesy + wolne miejsce)
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); setPdfDebugDialogOpen(true); }}
                  title="Pokaż wygenerowany PDF obok strukturalnego raportu KanbanPdfLayoutReport (sekcja po sekcji + per-strona)."
                >
                  <Bug className="h-3.5 w-3.5 mr-2" />
                  Raport układu PDF (debug obok PDF)
                </DropdownMenuItem>
                <DropdownMenuLabel className="text-[10px] uppercase mt-1">
                  Odstępy w PDF (pt)
                </DropdownMenuLabel>
                <div
                  className="px-2 py-1.5 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="grid grid-cols-[1fr_72px] items-center gap-2">
                    <Label htmlFor="pdf-gap-h2t" className="text-xs font-normal">
                      Nagłówek → tabela
                    </Label>
                    <Input
                      id="pdf-gap-h2t"
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      className="h-7 text-xs"
                      value={pdfSpacing.headerToTable}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPdfSpacing((s) => ({
                          ...s,
                          headerToTable: Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : s.headerToTable,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_72px] items-center gap-2">
                    <Label htmlFor="pdf-gap-t2h" className="text-xs font-normal">
                      Tabela → kolejny nagłówek
                    </Label>
                    <Input
                      id="pdf-gap-t2h"
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      className="h-7 text-xs"
                      value={pdfSpacing.tableToNextHeader}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPdfSpacing((s) => ({
                          ...s,
                          tableToNextHeader: Number.isFinite(v) ? Math.min(120, Math.max(0, v)) : s.tableToNextHeader,
                        }));
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-full text-[10px] text-muted-foreground"
                    onClick={() => setPdfSpacing(PDF_SPACING_DEFAULTS)}
                  >
                    Przywróć domyślne (8 / 18)
                  </Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase">
                  Grupuj eksport wg
                </DropdownMenuLabel>
                {([
                  { v: "none",     l: "Brak (jeden plik)" },
                  { v: "company",  l: "Firma" },
                  { v: "building", l: "Obiekt" },
                  { v: "assignee", l: "Osoba (wykonawca)" },
                ] as { v: ExportGroupBy; l: string }[]).map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.v}
                    checked={exportGroupBy === opt.v}
                    onCheckedChange={() => setExportGroupBy(opt.v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {opt.l}
                  </DropdownMenuCheckboxItem>
                ))}
                {exportGroupBy !== "none" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase">
                      Tryb wyjścia
                    </DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={exportGroupOutput === "sections"}
                      onCheckedChange={() => setExportGroupOutput("sections")}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Sekcje{lastExportFormat === "xlsx" ? " (osobne arkusze)" : " w jednym pliku"}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={exportGroupOutput === "single-sheet"}
                      onCheckedChange={() => setExportGroupOutput("single-sheet")}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Sekcje w jednym arkuszu (XLSX)
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={exportGroupOutput === "files"}
                      onCheckedChange={() => setExportGroupOutput("files")}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Osobne pliki (.zip)
                    </DropdownMenuCheckboxItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase">
                  Szablony eksportu
                </DropdownMenuLabel>
                {exportTemplates.length === 0 ? (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                    Brak zapisanych szablonów
                  </div>
                ) : (
                  exportTemplates.slice(0, 6).map((tpl) => (
                    <DropdownMenuItem
                      key={tpl.id}
                      onSelect={(e) => { e.preventDefault(); runTemplate(tpl); }}
                      title={`${tpl.format.toUpperCase()} · ${tpl.columns.length} kol. · grupowanie: ${groupByLabel[tpl.groupBy]}${tpl.groupBy !== "none" ? ` (${groupOutputShort[tpl.groupOutput]})` : ""}${tpl.includeMeta ? " · z meta" : ""}`}
                    >
                      <Download className="h-3.5 w-3.5 mr-2" />
                      <span className="truncate">{tpl.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{tpl.format.toUpperCase()}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTemplatesDialogOpen(true); }}>
                  <Settings2 className="h-3.5 w-3.5 mr-2" />
                  Zarządzaj szablonami…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-md fire-gradient px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nowe zadanie
          </button>
        </div>
      </div>

      {/* Quick due-date filter chips */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
          Termin:
        </span>
        {([
          { key: "all", label: "Wszystkie" },
          { key: "overdue", label: "Przeterminowane" },
          { key: "today", label: "Dziś" },
          { key: "week", label: "7 dni" },
        ] as { key: DueFilter; label: string }[]).map((opt) => {
          const active = dueFilter === opt.key;
          const count = (() => {
            if (opt.key === "all") return localTasks.length;
            return localTasks.filter((t: any) => {
              if (!t.deadline) return false;
              const d = new Date(t.deadline);
              const now = new Date();
              const closed = t.status === "Zamknięte";
              if (opt.key === "overdue") return !closed && d < now;
              if (opt.key === "today") return d.toDateString() === now.toDateString();
              if (opt.key === "week") {
                const in7 = new Date(); in7.setDate(in7.getDate() + 7);
                return d >= now && d <= in7;
              }
              return false;
            }).length;
          })();
          return (
            <button
              key={opt.key}
              onClick={() => setDueFilter(opt.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                active
                  ? opt.key === "overdue"
                    ? "border-critical/50 bg-critical/15 text-critical"
                    : "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card hover:bg-secondary text-muted-foreground"
              )}
            >
              {opt.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                active ? "bg-background/40" : "bg-muted/60"
              )}>
                {count}
              </span>
            </button>
          );
        })}
        {(dueFilter !== "all" || groupValueFilter !== "all" || filterPriority !== "all" || search || quoteFilter !== "all" || recencyFilter !== "all") && (
          <button
            onClick={() => {
              setDueFilter("all");
              setGroupValueFilter("all");
              setFilterPriority("all");
              setSearch("");
              setQuoteFilter("all");
              setRecencyFilter("all");
            }}
            className="ml-2 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Wyczyść filtry
          </button>
        )}
      </div>

      {/* Quick recency (last activity) chips */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
          Aktywność:
        </span>
        {([
          { key: "all", label: "Wszystkie" },
          { key: "24h", label: "Ostatnie 24h" },
          { key: "7d",  label: "Ostatnie 7 dni" },
          { key: "30d", label: "Ostatnie 30 dni" },
        ] as { key: RecencyFilter; label: string }[]).map((opt) => {
          const active = recencyFilter === opt.key;
          const count = (() => {
            if (opt.key === "all") return baseFilteredTasks.length;
            const hour = 3_600_000;
            const limit = opt.key === "24h" ? 24 * hour : opt.key === "7d" ? 7 * 24 * hour : 30 * 24 * hour;
            return baseFilteredTasks.filter((t: any) => {
              const last = taskLastActivityMs(t);
              return last && (Date.now() - last) <= limit;
            }).length;
          })();
          return (
            <button
              key={opt.key}
              onClick={() => setRecencyFilter(opt.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card hover:bg-secondary text-muted-foreground"
              )}
              title="Ostatnia aktywność = nowsze z: data utworzenia / aktualizacja oferty"
            >
              {opt.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                active ? "bg-background/40" : "bg-muted/60"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {viewMode === "kanban" ? (
        <div className="flex-1 overflow-x-auto pb-4 select-none">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 min-w-max h-full">
              {kanbanStatuses.map((status) => {
                const columnTasks = getTasksForStatus(status);
                return (
                  <div key={status} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card/40">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusColors[status])}>
                        {status}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground/60">{columnTasks.length}</span>
                    </div>

                    <Droppable droppableId={status}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin min-h-[150px] max-h-[calc(100vh-250px)] transition-colors duration-200",
                            snapshot.isDraggingOver && "bg-secondary/30"
                          )}
                        >
                          {(() => {
                            const groups = groupTasks(columnTasks);
                            const nodes: JSX.Element[] = [];
                            let runningIndex = 0;
                            groups.forEach((group) => {
                              if (groupMode !== "none") {
                                nodes.push(
                                  <div
                                    key={`hdr-${group.key}`}
                                    className="sticky top-0 z-10 flex items-center justify-between bg-card/80 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border"
                                  >
                                    <span className="truncate">{group.label}</span>
                                    <span className="ml-2 shrink-0">{group.tasks.length}</span>
                                  </div>
                                );
                              }
                              group.tasks.forEach((task: any) => {
                                const realIndex = runningIndex++;
                                nodes.push(
                                  <Draggable key={task.id} draggableId={task.id} index={realIndex}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={cn(
                                          "transition-transform",
                                          snapshot.isDragging && "opacity-90 shadow-2xl scale-105 z-50 ring-2 ring-primary/50"
                                        )}
                                        style={{ ...provided.draggableProps.style }}
                                      >
                                        <TaskCard task={task} onClick={() => setSelectedTask(task)} />
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              });
                            });
                            return nodes;
                          })()}
                          {provided.placeholder}
                          {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                            <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                              <Filter className="h-8 w-8 mb-2" />
                              <p className="text-[11px] font-medium">Brak zadań</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        </div>
      ) : (
        <TaskListView
          tasks={sortTasks(filteredTasks)}
          onSelect={setSelectedTask}
        />
      )}

      <CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />

      <Dialog open={columnsDialogOpen} onOpenChange={setColumnsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kolumny eksportu</DialogTitle>
            <DialogDescription>
              Wybierz pola, które mają znaleźć się w plikach CSV, Excel i PDF.
              Wybór jest zapamiętywany lokalnie.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2">
            {EXPORT_COLUMN_GROUPS.map((g) => {
              const cols = EXPORT_COLUMNS.filter((c) => c.group === g.key);
              const allChecked = cols.every((c) => exportColumns.includes(c.key));
              const someChecked = cols.some((c) => exportColumns.includes(c.key));
              return (
                <div key={g.key} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => {
                        setExportColumns((prev) => {
                          const keys = cols.map((c) => c.key);
                          const next = allChecked
                            ? prev.filter((k) => !keys.includes(k))
                            : Array.from(new Set([...prev, ...keys]));
                          return EXPORT_COLUMNS.map((c) => c.key).filter((k) => next.includes(k));
                        });
                      }}
                    >
                      {allChecked ? "Odznacz grupę" : someChecked ? "Zaznacz wszystkie" : "Zaznacz grupę"}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cols.map((c) => {
                      const checked = exportColumns.includes(c.key);
                      return (
                        <label
                          key={c.key}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-secondary/60"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleExportColumn(c.key)}
                          />
                          <span>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportColumns(DEFAULT_EXPORT_COLUMNS)}
              >
                Domyślne
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportColumns(EXPORT_COLUMNS.map((c) => c.key))}
              >
                Wszystkie
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportColumns([])}
              >
                Żadne
              </Button>
            </div>
            <Button type="button" onClick={() => setColumnsDialogOpen(false)}>
              Gotowe ({activeColumnDefs.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Debug układu PDF — PDF obok strukturalnego raportu === */}
      <PdfLayoutDebugDialog
        open={pdfDebugDialogOpen}
        onOpenChange={setPdfDebugDialogOpen}
        groups={groupTasksForExport(sortedFilteredTasks, exportGroupBy)}
        columns={activeColumnDefs as any}
        groupBy={exportGroupBy}
        groupByLabel={groupByLabel}
        metaLines={includeExportMeta ? buildMetaLines() : []}
        spacing={pdfSpacing}
      />

      {/* === Podgląd eksportu === */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Podgląd eksportu</DialogTitle>
            <DialogDescription>
              Sprawdź, jak będzie wyglądał wyeksportowany plik. Pokazujemy do 5 pierwszych wierszy z każdej grupy.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const groups = groupTasksForExport(sortedFilteredTasks, exportGroupBy);
            const totalGroups = groups.length;
            const totalTasks = sortedFilteredTasks.length;
            return (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {/* Podsumowanie */}
                <div className="rounded-md border border-border bg-card/40 p-3 text-xs space-y-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span><span className="text-muted-foreground">Format:</span> <b>{lastExportFormat.toUpperCase()}</b></span>
                    <span><span className="text-muted-foreground">Zadania:</span> <b>{totalTasks}</b></span>
                    <span><span className="text-muted-foreground">Kolumny:</span> <b>{activeColumnDefs.length}/{EXPORT_COLUMNS.length}</b></span>
                    <span><span className="text-muted-foreground">Sortowanie:</span> <b>{exportContext.sortLabel}</b></span>
                    <span><span className="text-muted-foreground">Metadane:</span> <b>{includeExportMeta ? "tak" : "nie"}</b></span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Grupowanie:</span>{" "}
                    <b>{groupByLabel[exportGroupBy]}</b>
                    {exportGroupBy !== "none" && (
                      <> · <b>{totalGroups}</b> grup · tryb: <b>{groupOutputLabel[exportGroupOutput]}</b></>
                    )}
                  </div>
                  {activeColumnDefs.length === 0 && (
                    <div className="text-destructive">⚠ Wybierz przynajmniej jedną kolumnę.</div>
                  )}
                </div>

                {/* Lista grup z plikami */}
                {exportGroupBy !== "none" && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Grupy ({totalGroups})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
                      {groups.map((g) => (
                        <div key={g.key} className="flex items-center justify-between rounded border border-border bg-card/30 px-2 py-1.5">
                          <span className="truncate" title={g.label}>{g.label}</span>
                          <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono">{g.tasks.length}</span>
                        </div>
                      ))}
                    </div>
                    {exportGroupOutput === "files" && (
                      <p className="text-[11px] text-muted-foreground italic mt-1">
                        Powstanie {totalGroups} plików spakowanych w jedno archiwum .zip.
                      </p>
                    )}
                  </div>
                )}

                {/* Tabele podglądu (max 5 wierszy / grupa) */}
                <div className="space-y-4">
                  {groups.map((g) => {
                    const sample = g.tasks.slice(0, 5);
                    return (
                      <div key={g.key} className="space-y-1">
                        {exportGroupBy !== "none" && (
                          <div className="flex items-baseline justify-between">
                            <h4 className="text-sm font-semibold">
                              {groupByLabel[exportGroupBy]}: {g.label}
                            </h4>
                            <span className="text-[11px] text-muted-foreground">
                              {sample.length} / {g.tasks.length}
                            </span>
                          </div>
                        )}
                        <div className="overflow-x-auto rounded border border-border">
                          <table className="w-full text-[11px]">
                            <thead className="bg-secondary/60">
                              <tr>
                                {activeColumnDefs.map((c) => (
                                  <th key={c.key} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sample.length === 0 ? (
                                <tr><td colSpan={activeColumnDefs.length || 1} className="px-2 py-3 text-center text-muted-foreground">Brak wierszy</td></tr>
                              ) : sample.map((t: any, idx: number) => (
                                <tr key={t.id ?? idx} className="border-t border-border/60">
                                  {activeColumnDefs.map((c) => {
                                    const v = String(c.accessor(t) ?? "");
                                    return (
                                      <td key={c.key} className="px-2 py-1 align-top max-w-[220px] truncate" title={v}>
                                        {v || <span className="text-muted-foreground">—</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {g.tasks.length > sample.length && (
                          <p className="text-[11px] text-muted-foreground italic">
                            … i jeszcze {g.tasks.length - sample.length} wierszy
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Zamknij
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!activeColumnDefs.length}
                onClick={() => { setPreviewDialogOpen(false); handleExportCSV(); }}
              >
                Pobierz CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!activeColumnDefs.length}
                onClick={() => { setPreviewDialogOpen(false); handleExportXLSX(); }}
              >
                Pobierz XLSX
              </Button>
              <Button
                type="button"
                disabled={!activeColumnDefs.length}
                onClick={() => { setPreviewDialogOpen(false); handleExportPDF(); }}
              >
                Pobierz PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Szablony eksportu === */}
      <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Szablony eksportu</DialogTitle>
            <DialogDescription>
              Zapisz aktualne ustawienia (format, kolumny, metadane, grupowanie) jako szablon i uruchamiaj jednym kliknięciem.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Aktualne ustawienia */}
            <div className="rounded-md border border-border bg-card/40 p-3 text-xs space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Bieżące ustawienia
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span><span className="text-muted-foreground">Format:</span> <b>{lastExportFormat.toUpperCase()}</b></span>
                <span><span className="text-muted-foreground">Kolumny:</span> <b>{exportColumns.length}/{EXPORT_COLUMNS.length}</b></span>
                <span><span className="text-muted-foreground">Metadane:</span> <b>{includeExportMeta ? "tak" : "nie"}</b></span>
                <span><span className="text-muted-foreground">Grupowanie:</span> <b>{groupByLabel[exportGroupBy]}</b>{exportGroupBy !== "none" && <> · <b>{groupOutputShort[exportGroupOutput]}</b></>}</span>
              </div>
            </div>

            {/* Zapisz nowy */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  Nazwa nowego szablonu
                </label>
                <input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCurrentAsTemplate(newTemplateName); }}
                  placeholder="np. Raport klienta — XLSX wg obiektu"
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <Button type="button" onClick={() => saveCurrentAsTemplate(newTemplateName)}>
                Zapisz szablon
              </Button>
            </div>

            {/* Lista */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Zapisane szablony ({exportTemplates.length})
              </div>
              {exportTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground italic px-2">Brak zapisanych szablonów.</p>
              ) : (
                <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
                  {exportTemplates.map((tpl) => (
                    <div key={tpl.id} className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{tpl.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {tpl.format.toUpperCase()} · {tpl.columns.length} kol. · grupowanie: {groupByLabel[tpl.groupBy]}
                          {tpl.groupBy !== "none" && <> ({groupOutputShort[tpl.groupOutput]})</>}
                          {tpl.includeMeta && " · z meta"}
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => applyTemplate(tpl)}>
                        Wczytaj
                      </Button>
                      <Button type="button" size="sm" onClick={() => { setTemplatesDialogOpen(false); runTemplate(tpl); }}>
                        Eksportuj
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteTemplate(tpl.id)}
                        title="Usuń szablon"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplatesDialogOpen(false)}>
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- LIST VIEW ----------
const QUOTE_BADGE_CLS: Record<string, string> = {
  "wersja robocza": "bg-muted text-muted-foreground border-border",
  "wysłana":        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "wyslana":        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "zaakceptowana":  "bg-success/15 text-success border-success/30",
  "odrzucona":      "bg-destructive/15 text-destructive border-destructive/30",
  "wygasła":        "bg-warning/15 text-warning border-warning/30",
  "wygasla":        "bg-warning/15 text-warning border-warning/30",
};

function TaskListView({ tasks, onSelect }: { tasks: any[]; onSelect: (t: any) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground opacity-60">
        <Filter className="h-10 w-10 mb-3" />
        <p className="text-sm font-medium">Brak zadań spełniających filtry</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto pb-4 rounded-xl border border-border bg-card/40">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card/95 backdrop-blur z-10 border-b border-border">
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Zadanie</th>
            <th className="px-3 py-2 font-semibold hidden md:table-cell">Obiekt / Firma</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold hidden sm:table-cell">Priorytet</th>
            <th className="px-3 py-2 font-semibold hidden md:table-cell">Wykonawca</th>
            <th className="px-3 py-2 font-semibold hidden lg:table-cell">Termin</th>
            <th className="px-3 py-2 font-semibold">Oferta</th>
            <th className="px-3 py-2 font-semibold hidden md:table-cell">Aktywność</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const lastMs = taskLastActivityMs(t);
            const lastIso = lastMs ? new Date(lastMs).toISOString() : null;
            const lastRel = formatRelative(lastIso);
            const activity = buildLastActivityTooltip(t);
            const quoteCls = t.quoteStatus ? (QUOTE_BADGE_CLS[String(t.quoteStatus).toLowerCase()] ?? "bg-secondary text-secondary-foreground border-border") : "";
            return (
              <tr
                key={t.id}
                onClick={() => onSelect(t)}
                className={cn(
                  "border-b border-border/60 hover:bg-secondary/40 cursor-pointer transition-colors",
                  t.isOverdue && "bg-critical/5"
                )}
              >
                <td className="px-3 py-2.5 max-w-[360px]">
                  <div className="font-medium text-foreground line-clamp-1">{t.title}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{t.id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                  <div className="line-clamp-1">{t.buildingName || "—"}</div>
                  {t.companyName && <div className="text-[11px] opacity-70 line-clamp-1">{t.companyName}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusColors[t.status as TaskStatus])}>
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <span className="text-xs capitalize">{t.priority}</span>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs line-clamp-1">
                  {t.assigneeName}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-xs">
                  {t.deadline ? (
                    <span className={cn(t.isOverdue && "text-critical font-semibold")}>
                      {new Date(t.deadline).toLocaleDateString("pl-PL")}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {(t.quoteCount ?? 0) > 0 && t.quoteStatus ? (
                    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", quoteCls)}>
                      <FileText className="h-2.5 w-2.5" />
                      <span className="capitalize">{t.quoteStatus}</span>
                      {(t.quoteCount ?? 0) > 1 && <span className="opacity-70">×{t.quoteCount}</span>}
                    </span>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                  <span
                    title={activity.tooltip}
                    className="inline-flex flex-col leading-tight cursor-help"
                  >
                    <span className="text-foreground/90">{lastRel ?? "—"}</span>
                    <span className="text-[10px] opacity-70">
                      {activity.source === "quote" ? "oferta" : activity.source === "created" ? "utworzenie" : "—"}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
