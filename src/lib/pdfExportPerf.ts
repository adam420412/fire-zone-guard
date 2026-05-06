/**
 * Lekki in-memory store pomiarów wydajności eksportu PDF Kanbanu.
 *
 * Sklejony z dwóch potrzeb:
 *  1) wypisywać czas w konsoli (`console.info`) po każdym eksporcie,
 *  2) trzymać ostatnie N pomiarów, żeby panel debug (PdfLayoutDebugDialog)
 *     mógł je wylistować i pozwolić porównać tryb diagnostyczny on/off.
 *
 * Zero zależności runtime — działa też w testach (Vitest/Node).
 */

export type PdfExportPerfPhase = "build" | "save" | "zip" | "json";

export type PdfExportPerfEntry = {
  /** Monotonicznie rosnący identyfikator (kolejność rejestracji). */
  id: number;
  /** ISO 8601 czasu zakończenia eksportu (Date.now()). */
  finishedAt: string;
  /** Etykieta operacji — np. nazwa pliku lub `"by-company × 4"`. */
  label: string;
  /** Czy raport diagnostyczny był liczony (`opts.diagnostics`). */
  diagnostics: boolean;
  /** Łączny czas trwania `handleExportPDF` w ms. */
  totalMs: number;
  /** Suma czasów wszystkich wywołań `buildKanbanPdf` w ms. */
  buildMs: number;
  /** Liczba wywołań `buildKanbanPdf` (1 dla single-doc, N dla zip). */
  buildCalls: number;
  /** Liczba grup przekazanych do eksportu. */
  groupsCount: number;
  /** Liczba zadań sumarycznie. */
  tasksCount: number;
  /** Liczba stron PDF wygenerowanych łącznie (suma `totalPages` po wszystkich buildach). */
  totalPages: number;
  /** Czy eksport zakończył się jako pojedynczy dokument (true) czy ZIP z wieloma PDF (false). */
  singleDoc: boolean;
};

const MAX_ENTRIES = 50;

const entries: PdfExportPerfEntry[] = [];
const listeners = new Set<(snapshot: PdfExportPerfEntry[]) => void>();
let nextId = 1;

function notify() {
  const snap = entries.slice();
  listeners.forEach((l) => {
    try {
      l(snap);
    } catch {
      // listener errors nie mogą wywalić eksportu
    }
  });
}

/** Zarejestruj nowy pomiar i zaloguj go w konsoli. Zwraca pełny wpis. */
export function recordPdfExportPerf(
  data: Omit<PdfExportPerfEntry, "id" | "finishedAt">,
): PdfExportPerfEntry {
  const entry: PdfExportPerfEntry = {
    id: nextId++,
    finishedAt: new Date().toISOString(),
    ...data,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

  // Konsola — jeden zwięzły wiersz, łatwy do filtrowania w devtoolsach.
  // Format: [PDF perf] label | total=… build=… (xN) pages=… groups=… tasks=… diag=on|off
  try {
    // eslint-disable-next-line no-console
    console.info(
      `[PDF perf] ${entry.label} | total=${entry.totalMs.toFixed(1)}ms` +
        ` build=${entry.buildMs.toFixed(1)}ms (×${entry.buildCalls})` +
        ` pages=${entry.totalPages} groups=${entry.groupsCount} tasks=${entry.tasksCount}` +
        ` diag=${entry.diagnostics ? "on" : "off"}` +
        ` mode=${entry.singleDoc ? "single" : "zip"}`,
    );
  } catch {
    // brak konsoli (np. test env z mockiem) — ignoruj
  }

  notify();
  return entry;
}

/** Snapshot wszystkich zapisanych pomiarów (najnowsze na początku). */
export function getPdfExportPerfEntries(): PdfExportPerfEntry[] {
  return entries.slice();
}

/** Wyczyść bufor (używane głównie w testach i z UI „Wyczyść historię"). */
export function clearPdfExportPerf(): void {
  entries.length = 0;
  notify();
}

/**
 * Subskrybuj zmiany. Wywoła listenera od razu z aktualnym snapshotem.
 * Zwraca funkcję odsubskrybowującą.
 */
export function subscribePdfExportPerf(
  listener: (snapshot: PdfExportPerfEntry[]) => void,
): () => void {
  listeners.add(listener);
  try {
    listener(entries.slice());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Helper do mierzenia pojedynczej fazy — używane wewnątrz handleExportPDF. */
export function measure<T>(fn: () => T): { value: T; ms: number } {
  const t0 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const value = fn();
  const t1 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  return { value, ms: t1 - t0 };
}
