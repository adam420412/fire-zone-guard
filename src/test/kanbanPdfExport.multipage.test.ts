/**
 * Regresja: stałe odstępy pionowe muszą być utrzymane także na granicy
 * page-breaków (gdy kolejna grupa ląduje na nowej stronie) oraz wewnątrz
 * pojedynczej strony, dla różnorodnych kształtów danych.
 *
 * Sprawdzamy dwie niezmienne wartości:
 *   - GAP_BETWEEN_HEADER_AND_TABLE  (domyślnie 8pt)  — zawsze, w każdej sekcji
 *   - GAP_BETWEEN_TABLE_AND_NEXT_HEADER (domyślnie 18pt) — gdy poprzednia
 *     tabela kończy się na tej samej stronie co nagłówek następnej grupy.
 *
 * Dodatkowo: po page-breaku nagłówek nowej grupy musi zaczynać się dokładnie
 * od marginesu górnego (a NIE od poprzedniego cursorY z poprzedniej strony),
 * co historycznie bywało źródłem regresji w odstępach.
 */

import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  DEFAULT_KANBAN_PDF_SPACING,
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

function build(groups: KanbanPdfGroup[], spacing?: KanbanPdfSpacing) {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns: COLUMNS,
      groupBy: "company",
      groupByLabel: GROUP_BY_LABEL,
      metaLines: ["Wygenerowano: 2026-05-06", "Test regresji wielostronicowej"],
      spacing,
    },
  );
}

/** Zbiór scenariuszy o różnym kształcie wymuszających page-breaki. */
const SCENARIOS: Array<{ name: string; groups: KanbanPdfGroup[] }> = [
  {
    name: "wiele średnich grup (8x12)",
    groups: Array.from({ length: 8 }, (_, i) => ({
      label: `Grupa-${i + 1}`,
      tasks: makeTasks(12, `G${i + 1}`),
    })),
  },
  {
    name: "duże grupy (5x30) wymuszające wewnętrzny break tabeli",
    groups: Array.from({ length: 5 }, (_, i) => ({
      label: `Duża-${i + 1}`,
      tasks: makeTasks(30, `D${i + 1}`),
    })),
  },
  {
    name: "naprzemiennie małe i duże grupy",
    groups: [
      { label: "S1", tasks: makeTasks(2, "S1") },
      { label: "L1", tasks: makeTasks(40, "L1") },
      { label: "S2", tasks: makeTasks(3, "S2") },
      { label: "L2", tasks: makeTasks(35, "L2") },
      { label: "S3", tasks: makeTasks(1, "S3") },
      { label: "L3", tasks: makeTasks(28, "L3") },
    ],
  },
  {
    name: "dużo małych grup wymuszających kaskadę page-breaków",
    groups: Array.from({ length: 20 }, (_, i) => ({
      label: `M-${i + 1}`,
      tasks: makeTasks(5, `M${i + 1}`),
    })),
  },
  {
    name: "scenariusz z pustymi grupami między pełnymi",
    groups: [
      { label: "Pełna-1", tasks: makeTasks(25, "P1") },
      { label: "Pusta-A", tasks: [] },
      { label: "Pełna-2", tasks: makeTasks(30, "P2") },
      { label: "Pusta-B", tasks: [] },
      { label: "Pełna-3", tasks: makeTasks(28, "P3") },
      { label: "Pusta-C", tasks: [] },
      { label: "Pełna-4", tasks: makeTasks(22, "P4") },
    ],
  },
];

/** Tolerancja na zaokrąglenia metryk fontów jsPDF (~1e-14, ale podnosimy do 0.01pt). */
const EPS = 0.01;

describe("buildKanbanPdf — regresja stałych odstępów na page-breakach", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      it("generuje co najmniej 2 strony (sanity scenariusza)", () => {
        const { layout } = build(scenario.groups);
        expect(layout.totalPages).toBeGreaterThan(1);
      });

      it("każda sekcja zachowuje GAP_BETWEEN_HEADER_AND_TABLE (≥8pt) niezależnie od strony", () => {
        const { layout } = build(scenario.groups);
        for (const s of layout.sections) {
          // headerBottom = baseline + GAP_BETWEEN_HEADER_AND_TABLE
          // tableStartY = headerBottom (bez nakładania)
          expect(s.tableStartY, `sekcja "${s.groupLabel}" str.${s.page}`).toBe(
            s.headerBottom,
          );
          // Wysokość pasa nagłówka = wysokość tekstu + 8pt → musi być ≥ 8pt.
          expect(
            s.headerBottom - s.headerTop,
            `wysokość pasa nagłówka "${s.groupLabel}" str.${s.page}`,
          ).toBeGreaterThanOrEqual(DEFAULT_KANBAN_PDF_SPACING.headerToTable - EPS);
        }
      });

      it("zachowuje GAP_BETWEEN_TABLE_AND_NEXT_HEADER (≥18pt) gdy kolejna grupa jest na tej samej stronie", () => {
        const { layout } = build(scenario.groups);
        let samePagePairs = 0;
        for (let i = 1; i < layout.sections.length; i++) {
          const prev = layout.sections[i - 1];
          const curr = layout.sections[i];
          if (curr.page === prev.tableEndPage) {
            samePagePairs++;
            const gap = curr.headerTop - prev.tableFinalY;
            expect(
              gap,
              `gap przed "${curr.groupLabel}" (po "${prev.groupLabel}") na str.${curr.page}`,
            ).toBeGreaterThanOrEqual(
              DEFAULT_KANBAN_PDF_SPACING.tableToNextHeader - EPS,
            );
          }
        }
        // Każdy scenariusz powinien mieć przynajmniej jedną parę na tej samej stronie.
        expect(samePagePairs, "co najmniej 1 para sekcji na tej samej stronie").toBeGreaterThan(0);
      });

      it("po page-breaku nagłówek następnej grupy startuje od marginesu górnego (nie dziedziczy cursorY z poprzedniej strony)", () => {
        const { layout } = build(scenario.groups);
        // Niektóre scenariusze całą paginację realizują wewnątrz pojedynczej tabeli (autoTable),
        // bez cross-group page-break. Sprawdzamy regresję tylko gdy taki break wystąpi.
        for (let i = 1; i < layout.sections.length; i++) {
          const prev = layout.sections[i - 1];
          const curr = layout.sections[i];
          if (curr.page > prev.tableEndPage) {
            // Po dodaniu strony cursor reset → headerTop ≈ marginTop. Tolerancja 2pt na metryki fontów.
            expect(
              curr.headerTop,
              `headerTop po page-break dla "${curr.groupLabel}" (str.${curr.page})`,
            ).toBeLessThanOrEqual(layout.marginTop + 2);
            expect(curr.headerTop).toBeGreaterThanOrEqual(layout.marginTop - 1);
            // GAP_BETWEEN_HEADER_AND_TABLE jest utrzymany także po page-break.
            expect(curr.tableStartY).toBe(curr.headerBottom);
            expect(
              curr.headerBottom - curr.headerTop,
            ).toBeGreaterThanOrEqual(DEFAULT_KANBAN_PDF_SPACING.headerToTable - EPS);
          }
        }
      });

      it("żaden tableStartY nie wchodzi w strefę dolnego marginesu (gwarancja decyzji o page-break)", () => {
        const { layout } = build(scenario.groups);
        const footerZone = layout.pageHeight - layout.marginBottom;
        for (const s of layout.sections) {
          // Musi zostać miejsce na min. nagłówek tabeli (~16pt) + 1 wiersz danych (~14pt).
          expect(
            s.tableStartY,
            `tableStartY "${s.groupLabel}" str.${s.page}`,
          ).toBeLessThanOrEqual(footerZone - 14);
        }
      });
    });
  }

  describe("custom spacing (headerToTable=14pt, tableToNextHeader=30pt) na wielu stronach", () => {
    const groups: KanbanPdfGroup[] = Array.from({ length: 7 }, (_, i) => ({
      label: `C-${i + 1}`,
      tasks: makeTasks(10, `C${i + 1}`),
    }));
    const spacing: KanbanPdfSpacing = { headerToTable: 14, tableToNextHeader: 30 };

    it("utrzymuje custom headerToTable na każdej sekcji (w tym po page-break)", () => {
      const { layout } = build(groups, spacing);
      expect(layout.totalPages).toBeGreaterThan(1);
      for (const s of layout.sections) {
        expect(s.headerBottom - s.headerTop).toBeGreaterThanOrEqual(14 - EPS);
        expect(s.tableStartY).toBe(s.headerBottom);
      }
    });

    it("utrzymuje custom tableToNextHeader dla każdej pary na tej samej stronie", () => {
      const { layout } = build(groups, spacing);
      let pairs = 0;
      for (let i = 1; i < layout.sections.length; i++) {
        const prev = layout.sections[i - 1];
        const curr = layout.sections[i];
        if (curr.page === prev.tableEndPage) {
          pairs++;
          expect(curr.headerTop - prev.tableFinalY).toBeGreaterThanOrEqual(30 - EPS);
        }
      }
      expect(pairs).toBeGreaterThan(0);
    });
  });
});
