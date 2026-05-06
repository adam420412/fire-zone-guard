import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
} from "@/lib/kanbanPdfExport";

// ─── Fixture ────────────────────────────────────────────────────────────────
const makeTasks = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    title: `${prefix} zadanie ${i + 1}`,
    company: `${prefix} sp. z o.o.`,
    building: `Obiekt ${prefix}-${i + 1}`,
    assignee: `Pracownik ${prefix}-${(i % 3) + 1}`,
    deadline: `2026-0${(i % 9) + 1}-15`,
    description:
      "Opis testowy o sensownej długości żeby wymusić realne wysokości komórek.",
  }));

const COLUMNS: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 180 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 120 },
  { label: "Obiekt", accessor: (t) => t.building, pdfWidth: 120 },
  { label: "Osoba", accessor: (t) => t.assignee, pdfWidth: 100 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 70 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
];

const GROUPS_MULTIPAGE: KanbanPdfGroup[] = [
  { label: "Alfa", tasks: makeTasks(8, "A") },
  { label: "Beta", tasks: makeTasks(14, "B") },
  { label: "Gamma", tasks: makeTasks(22, "C") },
  { label: "Delta", tasks: makeTasks(11, "D") },
];

function runBuild(diagnostics: boolean | undefined, groups = GROUPS_MULTIPAGE) {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns: COLUMNS,
      groupBy: "company",
      groupByLabel: { company: "Firma", building: "Obiekt", person: "Osoba" },
      metaLines: ["Test diagnostics flag"],
      diagnostics,
    },
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("buildKanbanPdf — flaga diagnostics", () => {
  describe("diagnostics: false", () => {
    it("zwraca pustą tablicę pages niezależnie od liczby stron PDF", () => {
      const { doc, layout } = runBuild(false);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      expect(layout.pages).toEqual([]);
    });

    it("zwraca zerowe agregaty w totals (oprócz sectionsCount, które zawsze odzwierciedla input)", () => {
      const { layout } = runBuild(false);
      expect(layout.totals.totalHeaderHeight).toBe(0);
      expect(layout.totals.totalTableHeightOnStartPage).toBe(0);
      expect(layout.totals.totalGapBeforeHeader).toBe(0);
      expect(layout.totals.avgTrailingWhitespace).toBe(0);
      // sectionsCount nie jest "diagnostyczne" — to po prostu sections.length.
      expect(layout.totals.sectionsCount).toBe(GROUPS_MULTIPAGE.length);
      expect(layout.sections).toHaveLength(GROUPS_MULTIPAGE.length);
    });

    it("zachowuje surowe pomiary z renderu (page, headerTop/Bottom, tableStartY/FinalY, tableEndPage)", () => {
      const { layout } = runBuild(false);
      for (const s of layout.sections) {
        expect(s.page).toBeGreaterThanOrEqual(1);
        expect(s.tableEndPage).toBeGreaterThanOrEqual(s.page);
        expect(s.headerBottom).toBeGreaterThan(s.headerTop);
        expect(s.tableStartY).toBeGreaterThanOrEqual(s.headerBottom);
      }
    });

    it("nadal generuje poprawny PDF (ten sam totalPages co przy diagnostics:true)", () => {
      const off = runBuild(false);
      const on = runBuild(true);
      expect(off.layout.totalPages).toBe(on.layout.totalPages);
      expect(off.doc.getNumberOfPages()).toBe(on.doc.getNumberOfPages());
    });
  });

  describe("diagnostics: true (default)", () => {
    it("liczy pages i niezerowe agregaty totals", () => {
      const { layout } = runBuild(true);
      expect(layout.pages.length).toBe(layout.totalPages);
      expect(layout.totals.totalHeaderHeight).toBeGreaterThan(0);
      expect(layout.totals.totalTableHeightOnStartPage).toBeGreaterThan(0);
      // avgTrailingWhitespace może być 0 tylko gdy strony są idealnie wypełnione —
      // w naszym wielostronicowym fixture ostatnia strona zawsze ma trailing > 0.
      expect(layout.totals.avgTrailingWhitespace).toBeGreaterThan(0);
    });

    it("default (brak flagi) zachowuje się jak diagnostics:true", () => {
      const explicit = runBuild(true);
      const implicit = runBuild(undefined);
      expect(implicit.layout.pages.length).toBe(explicit.layout.pages.length);
      expect(implicit.layout.totals.totalHeaderHeight).toBeCloseTo(
        explicit.layout.totals.totalHeaderHeight,
        5,
      );
      expect(implicit.layout.totals.totalTableHeightOnStartPage).toBeCloseTo(
        explicit.layout.totals.totalTableHeightOnStartPage,
        5,
      );
      expect(implicit.layout.totals.avgTrailingWhitespace).toBeCloseTo(
        explicit.layout.totals.avgTrailingWhitespace,
        5,
      );
    });
  });

  describe("E2E: porównanie diagnostics:false vs true na tym samym wejściu", () => {
    it("ten sam PDF, różne wypełnienie raportu — pages off=[] vs on=N, totals off=0 vs on>0", () => {
      const off = runBuild(false);
      const on = runBuild(true);

      // PDF się zgadza (ten sam render path).
      expect(off.layout.totalPages).toBe(on.layout.totalPages);
      expect(off.layout.sections.length).toBe(on.layout.sections.length);

      // Diagnostyka zwija się dokładnie tak, jak deklaruje API.
      expect(off.layout.pages).toEqual([]);
      expect(on.layout.pages.length).toBeGreaterThan(0);

      expect(off.layout.totals.totalHeaderHeight).toBe(0);
      expect(on.layout.totals.totalHeaderHeight).toBeGreaterThan(0);

      expect(off.layout.totals.totalTableHeightOnStartPage).toBe(0);
      expect(on.layout.totals.totalTableHeightOnStartPage).toBeGreaterThan(0);

      expect(off.layout.totals.totalGapBeforeHeader).toBe(0);
      // totalGapBeforeHeader może być > 0 tylko gdy istnieje co najmniej jedna
      // para sekcji na tej samej stronie. W fixture takie pary istnieją.
      expect(on.layout.totals.totalGapBeforeHeader).toBeGreaterThan(0);

      expect(off.layout.totals.avgTrailingWhitespace).toBe(0);
      expect(on.layout.totals.avgTrailingWhitespace).toBeGreaterThan(0);
    });
  });
});
