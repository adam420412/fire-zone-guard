/**
 * E2E regresja: stabilność podziałów stron przy różnych ustawieniach renderowania.
 *
 * Sprawdzamy, że niezależnie od formatu papieru (A5/A4/A3/letter/legal) i orientacji
 * (portrait/landscape):
 *   1) Eksport kończy się sukcesem i zwraca >0 stron.
 *   2) Każda sekcja respektuje GAP_BETWEEN_HEADER_AND_TABLE.
 *   3) Pary sekcji na tej samej stronie respektują GAP_BETWEEN_TABLE_AND_NEXT_HEADER.
 *   4) Po cross-group page-break headerTop ≈ marginTop (cursor zresetowany).
 *   5) Żaden tableStartY nie wchodzi w strefę dolnego marginesu.
 *   6) Liczba stron monotonicznie rośnie wraz ze zmniejszaniem powierzchni roboczej
 *      (sanity: A5 portrait ≥ A4 portrait ≥ A4 landscape ≥ A3 landscape) dla
 *      tego samego inputu.
 *   7) Custom spacing (większe odstępy) nie zmniejsza liczby stron i nie łamie
 *      reguł GAP na żadnym formacie.
 */

import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  DEFAULT_KANBAN_PDF_SPACING,
  type BuildKanbanPdfOptions,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
  type KanbanPdfSpacing,
} from "@/lib/kanbanPdfExport";

const COLUMNS: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 180 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 120 },
  { label: "Obiekt", accessor: (t) => t.building, pdfWidth: 120 },
  { label: "Osoba", accessor: (t) => t.assignee, pdfWidth: 100 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 70 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
];

const GROUP_BY_LABEL: Record<string, string> = {
  company: "Firma",
  building: "Obiekt",
  person: "Osoba",
};

const makeTasks = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    title: `${prefix} zadanie ${i + 1}`,
    company: `${prefix} sp. z o.o.`,
    building: `Obiekt ${prefix}-${i + 1}`,
    assignee: `Pracownik ${prefix}-${(i % 3) + 1}`,
    deadline: `2026-0${(i % 9) + 1}-15`,
    description:
      "Opis zadania, wystarczająco długi żeby zajmować realną wysokość komórki w tabeli i wymuszać paginację oraz page-breaki w trakcie eksportu.",
  }));

/** Stały scenariusz danych — pozwala porównywać liczby stron między formatami. */
const FIXED_GROUPS: KanbanPdfGroup[] = [
  { label: "Alfa", tasks: makeTasks(15, "A") },
  { label: "Beta", tasks: makeTasks(20, "B") },
  { label: "Gamma", tasks: makeTasks(12, "G") },
  { label: "Delta", tasks: makeTasks(25, "D") },
  { label: "Epsilon", tasks: makeTasks(8, "E") },
];

type PageSetup = NonNullable<BuildKanbanPdfOptions["pageSetup"]>;

const FORMATS: Array<{ name: string; setup: PageSetup }> = [
  { name: "A5 portrait", setup: { format: "a5", orientation: "portrait" } },
  { name: "A5 landscape", setup: { format: "a5", orientation: "landscape" } },
  { name: "A4 portrait", setup: { format: "a4", orientation: "portrait" } },
  { name: "A4 landscape (default)", setup: { format: "a4", orientation: "landscape" } },
  { name: "A3 portrait", setup: { format: "a3", orientation: "portrait" } },
  { name: "A3 landscape", setup: { format: "a3", orientation: "landscape" } },
  { name: "letter portrait", setup: { format: "letter", orientation: "portrait" } },
  { name: "letter landscape", setup: { format: "letter", orientation: "landscape" } },
  { name: "legal portrait", setup: { format: "legal", orientation: "portrait" } },
  { name: "legal landscape", setup: { format: "legal", orientation: "landscape" } },
];

function build(
  groups: KanbanPdfGroup[],
  pageSetup?: PageSetup,
  spacing?: KanbanPdfSpacing,
) {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns: COLUMNS,
      groupBy: "company",
      groupByLabel: GROUP_BY_LABEL,
      metaLines: ["E2E test różnych formatów papieru"],
      spacing,
      pageSetup,
    },
  );
}

const EPS = 0.01;

function assertLayoutInvariants(scenario: string, layout: ReturnType<typeof build>["layout"]) {
  // (1) page count > 0
  expect(layout.totalPages, `${scenario}: totalPages`).toBeGreaterThan(0);
  expect(layout.sections.length, `${scenario}: sections`).toBeGreaterThan(0);

  // (2) GAP header→table
  for (const s of layout.sections) {
    expect(
      s.tableStartY,
      `${scenario} sekcja "${s.groupLabel}" str.${s.page}: tableStartY=headerBottom`,
    ).toBe(s.headerBottom);
    expect(
      s.headerBottom - s.headerTop,
      `${scenario} sekcja "${s.groupLabel}" str.${s.page}: pasy nagłówka`,
    ).toBeGreaterThanOrEqual(DEFAULT_KANBAN_PDF_SPACING.headerToTable - EPS);
  }

  // (3) GAP table→next header (gdy na tej samej stronie)
  for (let i = 1; i < layout.sections.length; i++) {
    const prev = layout.sections[i - 1];
    const curr = layout.sections[i];
    if (curr.page === prev.tableEndPage) {
      const gap = curr.headerTop - prev.tableFinalY;
      expect(
        gap,
        `${scenario}: gap przed "${curr.groupLabel}" po "${prev.groupLabel}" str.${curr.page}`,
      ).toBeGreaterThanOrEqual(DEFAULT_KANBAN_PDF_SPACING.tableToNextHeader - EPS);
    }
  }

  // (4) po page-break header startuje od marginesu górnego
  for (let i = 1; i < layout.sections.length; i++) {
    const prev = layout.sections[i - 1];
    const curr = layout.sections[i];
    if (curr.page > prev.tableEndPage) {
      expect(
        curr.headerTop,
        `${scenario}: headerTop po page-break "${curr.groupLabel}" str.${curr.page}`,
      ).toBeLessThanOrEqual(layout.marginTop + 2);
      expect(curr.headerTop).toBeGreaterThanOrEqual(layout.marginTop - 1);
    }
  }

  // (5) tableStartY nie wchodzi w strefę dolnego marginesu
  const footerZone = layout.pageHeight - layout.marginBottom;
  for (const s of layout.sections) {
    expect(
      s.tableStartY,
      `${scenario}: tableStartY "${s.groupLabel}" str.${s.page} mieści się nad stopką`,
    ).toBeLessThanOrEqual(footerZone - 14);
  }
}

describe("buildKanbanPdf — E2E stabilność page-breaków na różnych formatach papieru", () => {
  for (const fmt of FORMATS) {
    describe(fmt.name, () => {
      it("eksport kończy się sukcesem i raport spełnia wszystkie inwarianty layoutu", () => {
        const { doc, layout } = build(FIXED_GROUPS, fmt.setup);
        // sanity — jsPDF zwrócił dokument o spodziewanym rozmiarze
        expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(0);
        expect(doc.internal.pageSize.getHeight()).toBeGreaterThan(0);
        // pageHeight raportu == realny pageHeight z jsPDF
        expect(layout.pageHeight).toBeCloseTo(
          doc.internal.pageSize.getHeight(),
          1,
        );
        expect(layout.pageWidth).toBeCloseTo(
          doc.internal.pageSize.getWidth(),
          1,
        );
        assertLayoutInvariants(fmt.name, layout);
      });

      it("custom spacing (headerToTable=14, tableToNextHeader=30) nie łamie reguł i nie zmniejsza liczby stron", () => {
        const { layout: base } = build(FIXED_GROUPS, fmt.setup);
        const { layout: custom } = build(FIXED_GROUPS, fmt.setup, {
          headerToTable: 14,
          tableToNextHeader: 30,
        });

        // większe odstępy ⇒ nigdy mniej stron niż w domyślnym
        expect(
          custom.totalPages,
          `${fmt.name}: custom spacing pages ≥ default`,
        ).toBeGreaterThanOrEqual(base.totalPages);

        // Inwarianty z custom progami
        for (const s of custom.sections) {
          expect(s.tableStartY).toBe(s.headerBottom);
          expect(s.headerBottom - s.headerTop).toBeGreaterThanOrEqual(14 - EPS);
        }
        for (let i = 1; i < custom.sections.length; i++) {
          const prev = custom.sections[i - 1];
          const curr = custom.sections[i];
          if (curr.page === prev.tableEndPage) {
            expect(curr.headerTop - prev.tableFinalY).toBeGreaterThanOrEqual(
              30 - EPS,
            );
          }
        }
      });
    });
  }

  it("monotoniczność: mniejsza powierzchnia robocza ⇒ nie mniej stron (sanity między formatami)", () => {
    const a3L = build(FIXED_GROUPS, { format: "a3", orientation: "landscape" }).layout;
    const a4L = build(FIXED_GROUPS, { format: "a4", orientation: "landscape" }).layout;
    const a4P = build(FIXED_GROUPS, { format: "a4", orientation: "portrait" }).layout;
    const a5P = build(FIXED_GROUPS, { format: "a5", orientation: "portrait" }).layout;

    expect(a4L.totalPages).toBeGreaterThanOrEqual(a3L.totalPages);
    expect(a4P.totalPages).toBeGreaterThanOrEqual(a4L.totalPages);
    expect(a5P.totalPages).toBeGreaterThanOrEqual(a4P.totalPages);
  });

  it("custom rozmiar [width,height] w punktach też respektuje inwarianty", () => {
    // Niestandardowy rozmiar — sprawdza ścieżkę format=[w,h] w jsPDF.
    const { layout, doc } = build(FIXED_GROUPS, {
      format: [600, 800],
      orientation: "portrait",
      unit: "pt",
    });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(600, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(800, 1);
    assertLayoutInvariants("custom 600x800pt", layout);
  });

  it("domyślne wywołanie (bez pageSetup) jest równoważne A4 landscape", () => {
    const def = build(FIXED_GROUPS).layout;
    const a4L = build(FIXED_GROUPS, { format: "a4", orientation: "landscape" }).layout;
    expect(def.totalPages).toBe(a4L.totalPages);
    expect(def.sections.length).toBe(a4L.sections.length);
    expect(def.pageWidth).toBeCloseTo(a4L.pageWidth, 1);
    expect(def.pageHeight).toBeCloseTo(a4L.pageHeight, 1);
  });
});
