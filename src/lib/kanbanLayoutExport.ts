/**
 * Czytelny eksport `KanbanPdfLayoutReport` do JSON-a, świadomy trybu
 * diagnostycznego użytego przez `buildKanbanPdf`.
 *
 * Cel: gdy `diagnostics: false`, plik `.layout.json` nie powinien udawać, że
 * trzyma puste/zerowe agregaty — zamiast tego zapisuje TYLKO surowe pola
 * renderu i jawnie listuje, które pola zostały pominięte (z wyjaśnieniem).
 */

import type { KanbanPdfLayoutReport, KanbanPdfLayoutSection } from "./kanbanPdfExport";

export type KanbanLayoutExportMode = "diagnostic" | "raw";

export type KanbanLayoutExportMeta = {
  /** Tryb wynikający z flagi `diagnostics` użytej w `buildKanbanPdf`. */
  mode: KanbanLayoutExportMode;
  /** ISO 8601 timestamp wygenerowania pliku. */
  exportedAt: string;
  /** Identyfikator generatora — pomocne w narzędziach diff porównujących wersje. */
  generator: string;
  /** Wersja schematu eksportu (semver-lite). Bumpować przy zmianach kształtu pliku. */
  schemaVersion: string;
  /**
   * Top-level pola pominięte w eksporcie (zawsze `[]` dla diagnostic).
   * Dla raw: zwykle `["pages", "totals"]`.
   */
  omittedFields: string[];
  /**
   * Per-section pola pominięte (zawsze `[]` dla diagnostic). Dla raw — pola
   * pochodne, które byłyby zerowe/wprowadzające w błąd bez diagnostyki.
   */
  omittedSectionFields: string[];
  /** Pola top-level zachowane w eksporcie. */
  includedFields: string[];
  /** Pola sekcji zachowane w eksporcie. */
  includedSectionFields: string[];
  /** Krótka, czytelna podpowiedź dla człowieka czytającego plik. */
  hint: string;
};

export type KanbanLayoutExport = {
  _meta: KanbanLayoutExportMeta;
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  spacing: KanbanPdfLayoutReport["spacing"];
  totalPages: number;
  sections: Array<Partial<KanbanPdfLayoutSection>>;
  /** Obecne tylko w trybie diagnostic. */
  pages?: KanbanPdfLayoutReport["pages"];
  /** Obecne tylko w trybie diagnostic. */
  totals?: KanbanPdfLayoutReport["totals"];
};

const SCHEMA_VERSION = "1.1.0";
const GENERATOR = "fire-zone/kanbanPdfExport";

// Pola sekcji obecne w surowym renderze (zawsze poprawne, niezależnie od diagnostyki).
const RAW_SECTION_FIELDS = [
  "groupIndex",
  "groupLabel",
  "page",
  "headerTop",
  "headerBottom",
  "tableStartY",
  "tableFinalY",
  "tableEndPage",
  "taskCount",
] as const satisfies readonly (keyof KanbanPdfLayoutSection)[];

// Pola sekcji liczone tylko w diagnostyce (post-processing po renderze).
const DIAGNOSTIC_SECTION_FIELDS = [
  "headerHeight",
  "tableHeightFirstPage",
  "tablePageSpan",
  "sectionHeightOnStartPage",
  "gapBeforeHeader",
  "startsNewPage",
  "indexOnPage",
] as const satisfies readonly (keyof KanbanPdfLayoutSection)[];

const TOP_LEVEL_RAW = [
  "pageWidth",
  "pageHeight",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "spacing",
  "totalPages",
  "sections",
] as const;

const TOP_LEVEL_DIAGNOSTIC_ONLY = ["pages", "totals"] as const;

/**
 * Heurystyka: czy raport został wygenerowany z `diagnostics: false`?
 *
 * `buildKanbanPdf` przy `diagnostics:false` zwraca `pages: []` oraz totals z
 * zerami (poza `sectionsCount`). Heurystyka jest deterministyczna dla raportów
 * generowanych przez `buildKanbanPdf` w tym repo.
 */
export function isLayoutDiagnostic(layout: KanbanPdfLayoutReport): boolean {
  if (layout.pages.length > 0) return true;
  const t = layout.totals;
  // Jeśli sections>0 i wszystkie zdiagnozowane sumy = 0 → raw.
  if (layout.sections.length === 0) return true; // brak sekcji → tryb nieistotny, traktujemy jak diagnostic
  return (
    t.totalHeaderHeight !== 0 ||
    t.totalTableHeightOnStartPage !== 0 ||
    t.totalGapBeforeHeader !== 0 ||
    t.avgTrailingWhitespace !== 0
  );
}

function pickRawSection(s: KanbanPdfLayoutSection): Partial<KanbanPdfLayoutSection> {
  const out: Partial<KanbanPdfLayoutSection> = {};
  for (const k of RAW_SECTION_FIELDS) {
    (out as any)[k] = s[k];
  }
  return out;
}

export type SerializeOptions = {
  /**
   * Wymuś tryb eksportu zamiast auto-wykrycia. Użyteczne, jeśli wywołujący
   * dokładnie wie, z jaką flagą `diagnostics` zbudowany został raport.
   */
  forceMode?: KanbanLayoutExportMode;
  /** Override timestampu (głównie do snapshot-testów). */
  exportedAt?: string;
};

/**
 * Zbuduj obiekt eksportu — czytelny, samoopisujący się JSON.
 *
 * - `diagnostics:true` → pełny raport + `_meta.mode="diagnostic"`.
 * - `diagnostics:false` → tylko surowe pola sekcji, brak `pages`/`totals`,
 *   `_meta.mode="raw"` z listą `omittedFields`/`omittedSectionFields` oraz
 *   wyjaśnieniem w `hint`.
 */
export function serializeKanbanLayoutForExport(
  layout: KanbanPdfLayoutReport,
  opts: SerializeOptions = {},
): KanbanLayoutExport {
  const mode: KanbanLayoutExportMode =
    opts.forceMode ?? (isLayoutDiagnostic(layout) ? "diagnostic" : "raw");
  const exportedAt = opts.exportedAt ?? new Date().toISOString();

  if (mode === "diagnostic") {
    return {
      _meta: {
        mode,
        exportedAt,
        generator: GENERATOR,
        schemaVersion: SCHEMA_VERSION,
        omittedFields: [],
        omittedSectionFields: [],
        includedFields: [...TOP_LEVEL_RAW, ...TOP_LEVEL_DIAGNOSTIC_ONLY],
        includedSectionFields: [...RAW_SECTION_FIELDS, ...DIAGNOSTIC_SECTION_FIELDS],
        hint:
          "Pełny raport diagnostyczny: sekcje + agregaty per-strona + totals. " +
          "Można porównywać 1:1 z innym raportem diagnostycznym.",
      },
      pageWidth: layout.pageWidth,
      pageHeight: layout.pageHeight,
      marginTop: layout.marginTop,
      marginBottom: layout.marginBottom,
      marginLeft: layout.marginLeft,
      spacing: layout.spacing,
      totalPages: layout.totalPages,
      sections: layout.sections.map((s) => ({ ...s })),
      pages: layout.pages.map((p) => ({ ...p })),
      totals: { ...layout.totals },
    };
  }

  // raw mode
  return {
    _meta: {
      mode,
      exportedAt,
      generator: GENERATOR,
      schemaVersion: SCHEMA_VERSION,
      omittedFields: [...TOP_LEVEL_DIAGNOSTIC_ONLY],
      omittedSectionFields: [...DIAGNOSTIC_SECTION_FIELDS],
      includedFields: [...TOP_LEVEL_RAW],
      includedSectionFields: [...RAW_SECTION_FIELDS],
      hint:
        "Eksport SUROWY (diagnostics=false). Zawiera tylko bezpośrednie pomiary " +
        "z renderu: page, headerTop/Bottom, tableStartY/FinalY, tableEndPage. " +
        "Pominięte: per-page summary (`pages`), globalne `totals` oraz pochodne " +
        "pola sekcji (headerHeight, tableHeightFirstPage, tablePageSpan, " +
        "sectionHeightOnStartPage, gapBeforeHeader, startsNewPage, indexOnPage). " +
        "Aby uzyskać pełny raport, włącz tryb diagnostyczny przed eksportem.",
    },
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    marginTop: layout.marginTop,
    marginBottom: layout.marginBottom,
    marginLeft: layout.marginLeft,
    spacing: layout.spacing,
    totalPages: layout.totalPages,
    sections: layout.sections.map(pickRawSection),
  };
}

/** Wygodny wrapper: gotowy, sformatowany string JSON do zapisu/pobrania. */
export function serializeKanbanLayoutToJsonString(
  layout: KanbanPdfLayoutReport,
  opts?: SerializeOptions,
): string {
  return JSON.stringify(serializeKanbanLayoutForExport(layout, opts), null, 2);
}
